-- HeiTuva 0038 — the SMS channel (DECISIONS Q6: LINK Mobility, behind
-- feature_flags.sms_channel).
--
-- The design's fourth channel card is "SMS · For skift og felt" — people on a
-- shift roster or in the field, who have a phone and often no work inbox. So a
-- recipient may now be reached by phone instead of by email, and an invitation
-- may carry a phone and no address at all. Everything else about an invitation
-- is unchanged on purpose: same token, same hashing, same rotation, same
-- grace window, same anonymity rules. SMS is a different pipe for the same
-- link, not a different kind of invitation.
--
-- What decides the channel of one invitation: the recipient's own details and
-- the channels the sender chose. Someone with an address gets email when email
-- is selected; someone with a phone gets SMS when SMS is selected; someone who
-- can be reached both ways gets email, because it carries the fuller message
-- and costs nothing per send. Nobody is reached twice.

alter table public.survey_invitations
  add column if not exists phone text;
alter table public.survey_invitations
  alter column email drop not null;
alter table public.survey_invitations
  drop constraint if exists invitations_reachable_check;
alter table public.survey_invitations
  add constraint invitations_reachable_check
  check (email is not null or phone is not null);

comment on column public.survey_invitations.phone is
  'E.164, normalised by app.normalize_phone. Present on an SMS invitation; an '
  'invitation has an email or a phone or both, never neither.';

/**
 * E.164 or nothing.
 *
 * Norwegian numbers are the product's home market and arrive in every shape a
 * spreadsheet can hold — "918 27 364", "+47 918 27 364", "0047918...",
 * "4791827364". Eight digits with a Norwegian mobile prefix (4 or 9) get +47;
 * anything already international is kept if it is plausibly a number; the
 * rest is NULL, which the caller treats as "no phone" rather than as a phone
 * that will fail at the gateway.
 */
create or replace function app.normalize_phone(p_raw text)
returns text
language plpgsql immutable
as $$
declare
  v text := regexp_replace(coalesce(p_raw, ''), '[\s\-\.\(\)]', '', 'g');
begin
  if v = '' then return null; end if;
  if v like '00%' then v := '+' || substr(v, 3); end if;
  if v ~ '^[49][0-9]{7}$' then return '+47' || v; end if;
  if v ~ '^47[49][0-9]{7}$' then return '+' || v; end if;
  if v ~ '^\+[1-9][0-9]{7,14}$' then return v; end if;
  return null;
end $$;

-- send_round: a recipient may have a phone -----------------------------------
--
-- p_recipients: [{email?, phone?, name?, lang?, group_id?}]
-- p_channels  : any of 'email' | 'link' | 'qr' | 'sms'
create or replace function public.send_round(
  p_survey        uuid,
  p_channels      text[],
  p_recipients    jsonb default '[]'::jsonb,
  p_group_ids     uuid[] default '{}',
  p_anonymity     text default null,
  p_cadence       text default 'once',
  p_runs          int default 1,
  p_reminder_days int default 2,
  p_rotate        boolean default false,
  p_closes_at     timestamptz default null,
  p_test_only     boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_survey public.surveys;
  v_round_id uuid;
  v_round_no int;
  v_share_token text;
  v_invited int := 0;
  v_by_sms int := 0;
  v_raw text;
  v_rec jsonb;
  v_email text;
  v_phone text;
  v_channel app.channel;
  v_lang text;
  v_group uuid;
  v_snapshot jsonb;
  v_email_on boolean := 'email' = any(p_channels);
  v_sms_on boolean := 'sms' = any(p_channels);
begin
  select s.* into v_survey from public.surveys s
    where s.id = p_survey and s.deleted_at is null;
  if v_survey.id is null then
    return jsonb_build_object('error','not_found');
  end if;

  if not app.can_edit_survey(p_survey) then
    return jsonb_build_object('error','forbidden');
  end if;

  -- The flag is enforced HERE, not only in the screen that hides the card. A
  -- caller who posts 'sms' to an org without the flag gets nothing sent by SMS
  -- — silently downgraded would be wrong too, so the call is refused outright.
  if v_sms_on and not exists (
    select 1 from public.feature_flags f
     where f.key = 'sms_channel' and f.enabled
       and (f.org_id = v_survey.org_id or f.org_id is null)
     order by f.org_id nulls last limit 1
  ) then
    return jsonb_build_object('error','sms_not_enabled');
  end if;

  if p_anonymity is not null and p_anonymity <> v_survey.anonymity::text then
    update public.surveys set anonymity = p_anonymity::app.anonymity_mode
      where id = p_survey;
    v_survey.anonymity := p_anonymity::app.anonymity_mode;
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.position), '[]'::jsonb)
    into v_snapshot
    from (
      select id, type, text, help, required, comment_mode, follow_up_on_low, config, position
      from public.survey_questions where survey_id = p_survey order by position
    ) q;

  if jsonb_array_length(v_snapshot) = 0 then
    return jsonb_build_object('error','no_questions');
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round_no
    from public.survey_rounds where survey_id = p_survey;

  insert into public.survey_rounds (survey_id, round_no, question_snapshot, status, closes_at)
  values (p_survey, v_round_no, v_snapshot, 'open', p_closes_at)
  returning id into v_round_id;

  -- Named recipients ------------------------------------------------------
  for v_rec in select * from jsonb_array_elements(p_recipients) loop
    v_email := nullif(lower(trim(v_rec->>'email')), '');
    v_phone := app.normalize_phone(v_rec->>'phone');
    -- Email when it can be, SMS when it must be, nothing when neither applies.
    v_channel := case
      when v_email is not null and v_email_on then 'email'::app.channel
      when v_phone is not null and v_sms_on then 'sms'::app.channel
      else null end;
    continue when v_channel is null;

    v_lang := coalesce(v_rec->>'lang', v_survey.langs[1], 'no');
    v_group := nullif(v_rec->>'group_id','')::uuid;
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');

    insert into public.survey_invitations
      (round_id, email, phone, name, group_id, lang, channel, token_hash, expires_at)
    values (v_round_id, v_email, case when v_channel = 'sms' then v_phone else v_phone end,
            nullif(v_rec->>'name',''), v_group, v_lang, v_channel,
            app.hash_token(v_raw), p_closes_at);

    perform pgmq.send('mail_outbox', jsonb_build_object(
      'kind', case when p_test_only then 'test' else 'invitation' end,
      'channel', v_channel,
      'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
      'email', v_email, 'phone', case when v_channel = 'sms' then v_phone end,
      'name', v_rec->>'name', 'lang', v_lang,
      'token', v_raw, 'survey_title', v_survey.title));
    v_invited := v_invited + 1;
    if v_channel = 'sms' then v_by_sms := v_by_sms + 1; end if;
  end loop;

  -- Whole groups ----------------------------------------------------------
  -- Members are reached by email: an org_members row has an address and no
  -- phone, and a member of the organisation has a work inbox by definition.
  if array_length(p_group_ids, 1) is not null and v_email_on then
    for v_rec in
      select to_jsonb(m) from public.org_members m
       where m.group_id = any(p_group_ids)
         and m.org_id = v_survey.org_id
         and m.status = 'active'
    loop
      v_email := lower(trim(v_rec->>'email'));
      continue when v_email is null or v_email = '';
      v_lang := coalesce(v_survey.langs[1], 'no');
      v_group := nullif(v_rec->>'group_id','')::uuid;
      v_raw := encode(extensions.gen_random_bytes(32), 'hex');

      insert into public.survey_invitations (round_id, email, name, group_id, lang, channel, token_hash, expires_at)
      values (v_round_id, v_email, v_rec->>'name', v_group, v_lang, 'email',
              app.hash_token(v_raw), p_closes_at);

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', case when p_test_only then 'test' else 'invitation' end,
        'channel', 'email',
        'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
        'email', v_email, 'name', v_rec->>'name', 'lang', v_lang,
        'token', v_raw, 'survey_title', v_survey.title));
      v_invited := v_invited + 1;
    end loop;
  end if;

  if p_channels && array['link','qr'] then
    v_share_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.share_links (round_id, kind, token_hash, active)
    values (v_round_id, 'link', app.hash_token(v_share_token), true);
  end if;

  if p_cadence <> 'once' then
    insert into public.schedules
      (survey_id, cadence, runs_total, runs_done, rotate_questions, reminder_after_days, next_run_at, active)
    values
      (p_survey, p_cadence::app.cadence, greatest(p_runs, 0), 1, p_rotate, p_reminder_days,
       now() + case p_cadence
                 when 'weekly' then interval '7 days'
                 when 'biweekly' then interval '14 days'
                 when 'monthly' then interval '30 days'
                 when 'quarterly' then interval '91 days'
                 else interval '7 days' end,
       true);
  end if;

  update public.surveys set status = 'aktiv' where id = p_survey and status = 'utkast';

  return jsonb_build_object(
    'ok', true,
    'round_id', v_round_id,
    'round_no', v_round_no,
    'invited', v_invited,
    'by_sms', v_by_sms,
    'share_token', v_share_token,
    'queued', v_invited);
end $$;

revoke all on function public.send_round(uuid, text[], jsonb, uuid[], text, text, int, int, boolean, timestamptz, boolean) from public, anon;
grant execute on function public.send_round(uuid, text[], jsonb, uuid[], text, text, int, int, boolean, timestamptz, boolean) to authenticated;

-- Reminders go out on the channel the invitation came in on ------------------
create or replace function app.enqueue_reminders()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv record;
  v_raw text;
  v_count int := 0;
  v_grace interval := interval '72 hours';
begin
  for v_inv in
    select i.id, i.email, i.phone, i.channel, i.name, i.lang, i.round_id, i.token_hash,
           r.survey_id, s.org_id, s.title, sc.reminder_after_days
      from public.survey_invitations i
      join public.survey_rounds r on r.id = i.round_id
      join public.surveys s on s.id = r.survey_id
      left join public.schedules sc on sc.survey_id = r.survey_id
     where r.status = 'open'
       and s.status <> 'lukket'
       and i.responded_at is null
       and i.bounced_at is null
       and i.sent_at is not null
       and coalesce(sc.reminder_after_days, 0) > 0
       and i.sent_at < now() - make_interval(days => sc.reminder_after_days)
       and coalesce(array_length(i.reminded_at, 1), 0) = 0
  loop
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');
    update public.survey_invitations
       set previous_token_hash = v_inv.token_hash,
           previous_token_expires_at = now() + v_grace,
           token_hash = app.hash_token(v_raw),
           reminded_at = coalesce(reminded_at, '{}') || now()
     where id = v_inv.id;

    perform pgmq.send('mail_outbox', jsonb_build_object(
      'kind', 'reminder',
      'channel', v_inv.channel,
      'round_id', v_inv.round_id, 'survey_id', v_inv.survey_id, 'org_id', v_inv.org_id,
      'email', v_inv.email, 'phone', case when v_inv.channel = 'sms' then v_inv.phone end,
      'name', v_inv.name, 'lang', v_inv.lang,
      'token', v_raw, 'survey_title', v_inv.title));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- The next round of a recurring survey keeps each person's channel -----------
create or replace function app.run_due_schedules()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_prev uuid;
  v_round_id uuid;
  v_round_no int;
  v_inv record;
  v_raw text;
  v_snapshot jsonb;
  v_count int := 0;
begin
  for v_s in
    select sc.*, s.org_id, s.title, s.langs
      from public.schedules sc
      join public.surveys s on s.id = sc.survey_id
     where sc.active
       and sc.next_run_at is not null
       and sc.next_run_at <= now()
       and s.deleted_at is null
       and (sc.runs_total = 0 or sc.runs_done < sc.runs_total)
  loop
    select id into v_prev from public.survey_rounds
      where survey_id = v_s.survey_id order by round_no desc limit 1;

    update public.survey_rounds set status = 'closed'
      where survey_id = v_s.survey_id and status = 'open';
    update public.share_links set active = false
      where round_id in (select id from public.survey_rounds where survey_id = v_s.survey_id);

    select coalesce(jsonb_agg(to_jsonb(q) order by q.position), '[]'::jsonb) into v_snapshot
      from (
        select id, type, text, help, required, comment_mode, follow_up_on_low, config, position
          from public.survey_questions where survey_id = v_s.survey_id order by position
      ) q;

    if v_s.rotate_questions and jsonb_array_length(v_snapshot) > 3 then
      select jsonb_agg(value) into v_snapshot
        from (
          select value from jsonb_array_elements(v_snapshot)
          order by md5(value::text || v_s.runs_done::text) limit 3
        ) picked;
    end if;

    select coalesce(max(round_no), 0) + 1 into v_round_no
      from public.survey_rounds where survey_id = v_s.survey_id;

    insert into public.survey_rounds (survey_id, round_no, question_snapshot, status)
    values (v_s.survey_id, v_round_no, v_snapshot, 'open')
    returning id into v_round_id;

    -- One person is one address or one phone; the channel travels with them.
    for v_inv in
      select distinct on (coalesce(email, phone))
             email, phone, channel, name, group_id, lang
        from public.survey_invitations where round_id = v_prev
       order by coalesce(email, phone), created_at
    loop
      v_raw := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.survey_invitations
        (round_id, email, phone, name, group_id, lang, channel, token_hash)
      values (v_round_id, v_inv.email, v_inv.phone, v_inv.name, v_inv.group_id, v_inv.lang,
              v_inv.channel, app.hash_token(v_raw));

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', 'invitation',
        'channel', v_inv.channel,
        'round_id', v_round_id, 'survey_id', v_s.survey_id, 'org_id', v_s.org_id,
        'email', v_inv.email, 'phone', case when v_inv.channel = 'sms' then v_inv.phone end,
        'name', v_inv.name, 'lang', v_inv.lang,
        'token', v_raw, 'survey_title', v_s.title));
    end loop;

    update public.schedules
       set runs_done = runs_done + 1,
           next_run_at = now() + case cadence
             when 'weekly' then interval '7 days'
             when 'biweekly' then interval '14 days'
             when 'monthly' then interval '30 days'
             when 'quarterly' then interval '91 days'
             else interval '7 days' end,
           active = case when runs_total = 0 then true
                         else runs_done + 1 < runs_total end
     where id = v_s.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
