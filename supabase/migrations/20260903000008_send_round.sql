-- HeiTuva 0008 — sending a round, in one transaction, with the raw tokens
-- never leaving Postgres.
--
-- Sending touches five tables (survey_rounds, survey_invitations, share_links,
-- schedules, surveys.status) and has to mint one secret per recipient. Doing
-- that from a server action would mean either hashing in Node — a second
-- definition of a rule that must never drift from app.hash_token — or a round
-- trip per token, and either way a partial send is possible if the request dies
-- half way. One RPC, one transaction: either the round exists with all its
-- invitations or none of it does.
--
-- The raw tokens are generated here and enqueued here. They are NOT returned.
-- A caller gets counts and the share token (which is not a secret in the same
-- sense — it is the link the customer is about to publish); the per-person
-- invitation tokens go straight into the mail queue, so they exist in the
-- response of no HTTP request and in the memory of no browser.

-- The outbound mail queue. pgmq (migration 0010) rather than fire-and-forget:
-- the implementation plan is explicit that a recurring survey which silently
-- fails to send is a compliance product killing its own value proposition.
select pgmq.create('mail_outbox');

/**
 * Sends a round.
 *
 * p_recipients: [{email, name?, lang?, group_id?}]
 * p_group_ids : groups whose active members are invited, in addition
 * p_channels  : any of 'email' | 'link' | 'qr' — 'link' and 'qr' share one
 *               share_links row, because the design's QR "peker til samme
 *               lenke" (HeiTuva.dc.html:1800).
 */
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
  v_raw text;
  v_rec jsonb;
  v_email text;
  v_lang text;
  v_group uuid;
  v_snapshot jsonb;
begin
  select s.* into v_survey from public.surveys s
    where s.id = p_survey and s.deleted_at is null;
  if v_survey.id is null then
    return jsonb_build_object('error','not_found');
  end if;

  -- Authorisation is the caller's, not the definer's. SECURITY DEFINER is here
  -- to reach app.hash_token and pgmq, NOT to skip the permission check — so the
  -- same predicate the RLS policies use is asserted explicitly.
  if not app.can_edit_survey(p_survey) then
    return jsonb_build_object('error','forbidden');
  end if;

  if p_anonymity is not null and p_anonymity <> v_survey.anonymity::text then
    update public.surveys set anonymity = p_anonymity::app.anonymity_mode
      where id = p_survey;
    v_survey.anonymity := p_anonymity::app.anonymity_mode;
  end if;

  -- The question set is frozen into the round. Editing the Builder afterwards
  -- cannot change what a respondent already in flight is being asked, which is
  -- the same reason the D31 trigger exists.
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
    v_email := lower(trim(v_rec->>'email'));
    continue when v_email is null or v_email = '';
    v_lang := coalesce(v_rec->>'lang', v_survey.langs[1], 'no');
    v_group := nullif(v_rec->>'group_id','')::uuid;
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');

    insert into public.survey_invitations (round_id, email, name, group_id, lang, channel, token_hash, expires_at)
    values (v_round_id, v_email, nullif(v_rec->>'name',''), v_group, v_lang, 'email',
            app.hash_token(v_raw), p_closes_at)
    on conflict do nothing;

    perform pgmq.send('mail_outbox', jsonb_build_object(
      'kind', case when p_test_only then 'test' else 'invitation' end,
      'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
      'email', v_email, 'name', v_rec->>'name', 'lang', v_lang,
      'token', v_raw, 'survey_title', v_survey.title));
    v_invited := v_invited + 1;
  end loop;

  -- Whole groups ----------------------------------------------------------
  if array_length(p_group_ids, 1) is not null then
    -- Group membership is `org_members.group_id`, not a join table: one member
    -- belongs to at most one group in this schema.
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

      -- The group is carried onto the invitation on purpose: submit_response
      -- copies it to the response so team aggregation works, while dropping the
      -- invitation link itself. Group survives, identity does not.
      insert into public.survey_invitations (round_id, email, name, group_id, lang, channel, token_hash, expires_at)
      values (v_round_id, v_email, v_rec->>'name', v_group, v_lang, 'email',
              app.hash_token(v_raw), p_closes_at)
      on conflict do nothing;

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', case when p_test_only then 'test' else 'invitation' end,
        'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
        'email', v_email, 'name', v_rec->>'name', 'lang', v_lang,
        'token', v_raw, 'survey_title', v_survey.title));
      v_invited := v_invited + 1;
    end loop;
  end if;

  -- The shared link. 'link' and 'qr' are one row: the design's QR points at the
  -- same URL, so two rows would be two tokens for one thing to close.
  if p_channels && array['link','qr'] then
    v_share_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.share_links (round_id, kind, token_hash, active)
    values (v_round_id, 'link', app.hash_token(v_share_token), true);
  end if;

  -- Recurrence ------------------------------------------------------------
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
    -- The link the customer is about to publish, not a per-person secret.
    'share_token', v_share_token,
    'queued', v_invited);
end $$;

revoke all on function public.send_round(uuid, text[], jsonb, uuid[], text, text, int, int, boolean, timestamptz, boolean) from public, anon;
grant execute on function public.send_round(uuid, text[], jsonb, uuid[], text, text, int, int, boolean, timestamptz, boolean) to authenticated;

/**
 * Closes a round for answers. `submit_response` already refuses anything that
 * is not 'open', so this is the whole of "Lukk for svar".
 */
create or replace function public.close_round(p_round uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_survey uuid;
begin
  select survey_id into v_survey from public.survey_rounds where id = p_round;
  if v_survey is null then return jsonb_build_object('error','not_found'); end if;
  if not app.can_edit_survey(v_survey) then return jsonb_build_object('error','forbidden'); end if;

  update public.survey_rounds set status = 'closed' where id = p_round;
  update public.share_links set active = false where round_id = p_round;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.close_round(uuid) from public, anon;
grant execute on function public.close_round(uuid) to authenticated;
