-- HeiTuva 0045 — the SECOND copy of the interval CASE, and the custom settings
-- reaching the schedule that `send_round` creates.
--
-- 0044 replaced the interval CASE inside `app.run_due_schedules` with
-- `app.cadence_interval`, and its own comment said why: "a second copy of this
-- CASE is how the first one came to disagree with the enum". The second copy
-- was in this function, eleven lines of it, with the same four arms and the
-- same `else interval '7 days'` — so after 0044 the SWEEP advanced an annual
-- survey by a year while `send_round` still set its FIRST next run a week out.
--
-- Found by reading `send_round` to add the custom parameters, not by the test
-- 0044 shipped with. That test asserts the relation over every cadence in the
-- vocabulary — which is the right shape — but only at one of the two sites that
-- compute a next run. Enumerating the cadences and sampling the call sites is
-- the same mistake one level up, and `tests/db/recurrence.test.ts` now drives
-- both.
--
-- The signature gains four defaulted parameters for Q20's custom cadence. They
-- are defaulted so every existing caller keeps working, and the shape they must
-- arrive in is the CHECK's (`schedules_custom_shape`, M:0044): all three of
-- every/unit/weekday together, or none. `send_round` does not validate that
-- itself — the constraint does, and a second opinion in PL/pgSQL is how the two
-- come to disagree.
--
-- DROP FIRST. Adding defaulted parameters to `create or replace function`
-- creates an OVERLOAD rather than replacing, and PostgREST would then have two
-- candidates for the same call and refuse it as ambiguous.

drop function if exists public.send_round(uuid, text[], jsonb, uuid[], text, text, integer, integer, boolean, timestamptz, boolean);

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
       now() + app.cadence_interval(p_cadence::app.cadence, p_custom_every, p_custom_unit),
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
end $function$;

revoke all on function public.send_round(uuid, text[], jsonb, uuid[], text, text, integer, integer, boolean, timestamptz, boolean, integer, text, integer, time) from public, anon;
grant execute on function public.send_round(uuid, text[], jsonb, uuid[], text, text, integer, integer, boolean, timestamptz, boolean, integer, text, integer, time) to authenticated, service_role;
