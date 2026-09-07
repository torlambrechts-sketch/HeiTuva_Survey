-- V1-6 · DECISIONS Q50, sites 2 and 3 of 3.
--
-- `app.local_send_at` and the resume trigger landed in 0051. These are the two
-- that actually send: the first next run (`send_round`) and the advance
-- (`app.run_due_schedules`).
--
-- WHAT THE SWEEP FOUND, and it is worse than the decision described. Both sites
-- computed `now() + app.cadence_interval(...)` and NEVER READ `send_at_local`
-- AT ALL. So the column a customer sets in the custom-cadence editor was
-- decoration on the two paths that matter: a weekly survey first sent at 14:32
-- kept arriving at 14:32 forever, whatever the editor said. Q50 was written as
-- "the schema models no timezone"; the truth was that plus "and the local time
-- is not read either".
--
-- The sweep in `tests/db/recurrence.test.ts` was too narrow to find that at
-- first — it required `send_at_local` in the body, so it flagged only the site
-- that mentioned the column and missed the two that ignored it. It now asks the
-- property directly: EVERY assignment of `next_run_at` goes through
-- `app.local_send_at`. That is the V1-3 lesson a third time — the set of sites
-- is derived, and the derivation has to describe the property, not a symptom of
-- it.
CREATE OR REPLACE FUNCTION public.send_round(p_survey uuid, p_channels text[], p_recipients jsonb DEFAULT '[]'::jsonb, p_group_ids uuid[] DEFAULT '{}'::uuid[], p_anonymity text DEFAULT NULL::text, p_cadence text DEFAULT 'once'::text, p_runs integer DEFAULT 1, p_reminder_days integer DEFAULT 2, p_rotate boolean DEFAULT false, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_test_only boolean DEFAULT false, p_custom_every integer DEFAULT NULL::integer, p_custom_unit text DEFAULT NULL::text, p_custom_weekday integer DEFAULT NULL::integer, p_send_at_local time without time zone DEFAULT NULL::time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (survey_id, cadence, runs_total, runs_done, rotate_questions, reminder_after_days,
       custom_every, custom_unit, custom_weekday, send_at_local, next_run_at, active)
    values
      (p_survey, p_cadence::app.cadence, greatest(p_runs, 0), 1, p_rotate, p_reminder_days,
       p_custom_every, p_custom_unit, p_custom_weekday,
       coalesce(p_send_at_local, '09:00'::time),
       -- ONE definition of how long a cadence step is (M:0044). The CASE this
       -- replaces was the SECOND copy of it, and it had the same four arms and
       -- the same `else interval '7 days'` — so the first next run of an annual
       -- survey was a week away even after 0044 fixed the sweep.
       -- Q50: the first next run is the LOCAL send time on the day the
       -- cadence lands on, in the organisation's zone — not "this time of day,
       -- one interval from now". Before this, `send_at_local` was stored and
       -- never read here at all: a weekly survey sent at 14:32 kept arriving
       -- at 14:32 forever, and the column the customer set was decoration.
       app.local_send_at(
         ((now() + app.cadence_interval(p_cadence::app.cadence, p_custom_every, p_custom_unit))
            at time zone (select o.timezone from public.organizations o
                           join public.surveys s on s.org_id = o.id
                          where s.id = p_survey))::date,
         coalesce(p_send_at_local, '09:00'::time),
         (select o.timezone from public.organizations o
            join public.surveys s on s.org_id = o.id
           where s.id = p_survey)
       ),
       true);
  end if;

  update public.surveys set status = 'aktiv' where id = p_survey and status = 'utkast';
  -- Q17: a real send promises the respondents a threshold, so the policy
  -- freezes here. A test-only send promises no one, and leaves it editable.
  if not p_test_only then
    update public.surveys set policy_locked = true where id = p_survey;
  end if;

  return jsonb_build_object(
    'ok', true,
    'round_id', v_round_id,
    'round_no', v_round_no,
    'invited', v_invited,
    'by_sms', v_by_sms,
    'share_token', v_share_token,
    'queued', v_invited);
end $function$

;
CREATE OR REPLACE FUNCTION app.run_due_schedules()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Q50: the organisation's zone rides along with the schedule, so the
    -- advance below computes a LOCAL send time without a second lookup.
    select sc.*, s.org_id, s.title, s.langs, o.timezone as tz
      from public.schedules sc
      join public.surveys s on s.id = sc.survey_id
      join public.organizations o on o.id = s.org_id
     where sc.active
       -- Q22. Before anything else in the loop body, so a paused series never
       -- reaches the statement that closes the open round.
       and sc.paused_at is null
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
           -- Q50: same rule as the first run — the local send time on the
           -- day the cadence lands on, in the organisation's zone. `v_zone` is
           -- carried on the loop's own row, so there is no second lookup.
           next_run_at = app.local_send_at(
             ((now() + app.cadence_interval(cadence, custom_every, custom_unit))
                at time zone v_s.tz)::date,
             send_at_local,
             v_s.tz
           ),
           active = case when runs_total = 0 then true
                         else runs_done + 1 < runs_total end
     where id = v_s.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $function$

;
