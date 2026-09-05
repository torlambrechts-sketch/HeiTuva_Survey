-- HeiTuva 0043 — Q17: the display threshold becomes a per-survey policy with a
-- law-anchored floor (DECISIONS Q17, docs/Q17_terskel_forslag.md).
--
-- This is the only change in the expansion work that touches the security
-- kernel. `app.k_threshold()` (a global constant 5) becomes `app.k_for(survey)`
-- (default 5, floor 3 for natural persons, 0 — no gate — for organisation
-- respondents), and every aggregate RPC routes through it. Structural anonymity
-- is untouched: an anonymous response still carries no invitation, user, IP or
-- precise timestamp, and no client role may read `responses`/`answers`. The
-- threshold governs what is SHOWN; the linkage still does not exist to show.
--
-- The eight negative tests in tests/invariants/threshold-policy.test.ts and
-- tests/unit/anonymity-promise.test.ts were written and proven failing before
-- this migration (scratchpad/redphase2.txt).

-- 1. Schema -----------------------------------------------------------------
alter table public.surveys
  add column if not exists respondent_kind text not null default 'person'
    check (respondent_kind in ('person','organisation')),
  add column if not exists k_threshold int not null default 5,
  add column if not exists policy_locked boolean not null default false;

-- The floor: never below 3 for natural persons. Organisation surveys are
-- attributed (no gate), so the number is not constrained there.
alter table public.surveys
  drop constraint if exists surveys_k_threshold_floor;
alter table public.surveys
  add constraint surveys_k_threshold_floor
  check (k_threshold >= 3 or respondent_kind = 'organisation');

alter table public.template_packs   add column if not exists policy jsonb;
alter table public.duty_definitions  add column if not exists policy jsonb;

comment on column public.surveys.k_threshold is
  'Display threshold for this survey (Q17). Results are hidden until this many '
  'people have answered a cell. Default 5, floor 3 for natural persons; '
  'app.k_for is the authority. Frozen once policy_locked is set.';
comment on column public.surveys.respondent_kind is
  'person (natural persons — a threshold applies) or organisation (suppliers '
  'answering for a company — attributed, no threshold).';
comment on column public.surveys.policy_locked is
  'Once true, the threshold, anonymity and respondent type cannot change. Set '
  'at a real send (send_round), by a statutory pack at creation, or by backfill '
  'for surveys already sent when Q17 shipped.';

-- 2. The statutory packs carry their own locked policy -----------------------
--    (docs/Q17_terskel_forslag.md, the law-anchored table). A customer cannot
--    override these; the pack, not the user, decides.
update public.template_packs set policy = jsonb_build_object(
    'anonymity','anonymous','respondent_kind','person','k_threshold',5,'locked',true)
  where org_id is null and key = 'psykososial-kartlegging';
update public.template_packs set policy = jsonb_build_object(
    'anonymity','named','respondent_kind','organisation','k_threshold',0,'locked',true)
  where org_id is null and key = 'leverandor-apenhetsloven';

-- The duties carry the same, for the day a duty spawns a survey directly.
update public.duty_definitions set policy = jsonb_build_object(
    'anonymity','anonymous','respondent_kind','person','k_threshold',5,'locked',true)
  where key in ('arbeidsmiljo','likestilling','trakassering');
update public.duty_definitions set policy = jsonb_build_object(
    'anonymity','named','respondent_kind','organisation','k_threshold',0,'locked',true)
  where key = 'apenhet';

-- 3. app.k_for — the threshold for one survey --------------------------------
-- 0 means "no gate": an organisation survey is attributed. The RPCs gate with
-- `n < k` / `n >= k`, for which 0 correctly means "always show". The magic
-- value is pinned by a test: an organisation survey with one response returns
-- it (tests/invariants/threshold-policy.test.ts, #8c).
create or replace function app.k_for(p_survey uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when s.respondent_kind = 'organisation' then 0
              else greatest(s.k_threshold, 3) end
  from public.surveys s where s.id = p_survey
$$;
revoke all on function app.k_for(uuid) from public, anon;
grant execute on function app.k_for(uuid) to authenticated, service_role;

-- 4. Backfill (Tor's requirements) -------------------------------------------
-- Existing surveys already carry k_threshold 5 / respondent_kind 'person' from
-- the column defaults; the lock is what a backfill must set, or an administrator
-- could lower a threshold that respondents were already promised. Lock every
-- survey that has already been SENT (a round past 'scheduled') — a superset of
-- "has responses", because the promise is made at send — and every survey
-- created from a statutory pack, so an ARP or psykososial survey from an
-- earlier phase is locked exactly like a new one.
update public.surveys s set policy_locked = true
  where s.policy_locked = false
    and (
      exists (select 1 from public.survey_rounds sr
               where sr.survey_id = s.id and sr.status <> 'scheduled')
      or exists (select 1 from public.template_packs tp
                  where tp.org_id is null and tp.key = s.template_pack_key
                    and coalesce((tp.policy->>'locked')::boolean, false))
    );

-- 5. A statutory pack's policy is applied to a NEW survey, and locks it ------
create or replace function app.apply_pack_policy()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_policy jsonb;
begin
  if new.template_pack_key is not null then
    select tp.policy into v_policy from public.template_packs tp
      where tp.org_id is null and tp.key = new.template_pack_key
        and coalesce((tp.policy->>'locked')::boolean, false)
      limit 1;
    if v_policy is not null then
      new.anonymity      := coalesce((v_policy->>'anonymity')::app.anonymity_mode, new.anonymity);
      new.respondent_kind := coalesce(v_policy->>'respondent_kind', new.respondent_kind);
      new.k_threshold    := coalesce((v_policy->>'k_threshold')::int, new.k_threshold);
      new.policy_locked  := true;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists surveys_apply_pack on public.surveys;
create trigger surveys_apply_pack
  before insert on public.surveys
  for each row execute function app.apply_pack_policy();

-- 6. The policy guard --------------------------------------------------------
-- Written as "reject only the changes the rule forbids", so ordinary edits
-- (title, audience, results_scope, status) pass untouched (CLAUDE.md,
-- immutability triggers must permit referential maintenance).
create or replace function app.guard_survey_policy()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_policy_change boolean := new.k_threshold  is distinct from old.k_threshold
                          or new.anonymity     is distinct from old.anonymity
                          or new.respondent_kind is distinct from old.respondent_kind;
begin
  -- A frozen policy does not change — not for a redaktør, not for an
  -- administrator, not for the pack's own author.
  if old.policy_locked and v_policy_change then
    raise exception 'policy_locked'
      using hint = 'The threshold and anonymity are frozen once the survey is sent or is set by a statutory pack.';
  end if;

  -- A survey a statutory pack governs is frozen from creation, before it is
  -- ever sent and even for an administrator.
  if v_policy_change and exists (
       select 1 from public.template_packs tp
        where tp.org_id is null and tp.key = new.template_pack_key
          and coalesce((tp.policy->>'locked')::boolean, false)) then
    raise exception 'policy_locked'
      using hint = 'This survey is governed by a statutory template pack; the law sets its policy.';
  end if;

  -- Organisation mode is attribution, and cannot be turned on over answers
  -- that were given as natural persons.
  if new.respondent_kind = 'organisation'
     and old.respondent_kind is distinct from 'organisation'
     and exists (select 1 from public.responses r
                  join public.survey_rounds sr on sr.id = r.round_id
                 where sr.survey_id = old.id) then
    raise exception 'respondent_kind cannot change to organisation once a person has answered';
  end if;

  -- Changing the threshold is an administrator's personvern decision; a
  -- redaktør may not, and every change a signed-in user makes is audited.
  -- Backend writes (service role, migrations — auth.uid() null) pass.
  if (new.k_threshold is distinct from old.k_threshold) and v_uid is not null then
    if not app.has_role(new.org_id, array['administrator']::app.member_role[]) then
      raise exception 'threshold_admin_only'
        using hint = 'Only an administrator may change the display threshold.';
    end if;
    insert into public.audit_events (org_id, actor_user_id, action, target, meta)
    values (new.org_id, v_uid, 'threshold.change', new.id::text,
            jsonb_build_object('from', old.k_threshold, 'to', new.k_threshold));
  end if;

  return new;
end $$;

drop trigger if exists surveys_guard_policy on public.surveys;
create trigger surveys_guard_policy
  before update on public.surveys
  for each row execute function app.guard_survey_policy();

-- 7. send_round freezes the policy on a real send (transformed below), and
--    every aggregate RPC swaps app.k_threshold() -> app.k_for (Part B).

-- send_round: locks the policy on a real send ----------------------------
CREATE OR REPLACE FUNCTION public.send_round(p_survey uuid, p_channels text[], p_recipients jsonb DEFAULT '[]'::jsonb, p_group_ids uuid[] DEFAULT '{}'::uuid[], p_anonymity text DEFAULT NULL::text, p_cadence text DEFAULT 'once'::text, p_runs integer DEFAULT 1, p_reminder_days integer DEFAULT 2, p_rotate boolean DEFAULT false, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_test_only boolean DEFAULT false)
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

-- Aggregate RPCs: app.k_threshold() -> app.k_for --------------------------
-- aggregate_results: gate on the survey's own threshold
CREATE OR REPLACE FUNCTION public.aggregate_results(p_survey uuid, p_group uuid DEFAULT NULL::uuid, p_round uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_out jsonb := '[]'::jsonb; v_q record; v_n int; v_k int := app.k_for(p_survey);
begin
  select org_id into v_org from public.surveys where id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error','forbidden');
  end if;

  for v_q in
    select q.id, q.type, q.text, q.config from public.survey_questions q
    where q.survey_id = p_survey order by q.position
  loop
    select count(distinct r.id) into v_n
    from public.responses r
    join public.answers a on a.response_id = r.id and a.question_id = v_q.id
    join public.survey_rounds sr on sr.id = r.round_id
    where sr.survey_id = p_survey
      and (p_round is null or r.round_id = p_round)
      and (p_group is null or r.respondent_group_id = p_group);

    if v_n < v_k then
      v_out := v_out || jsonb_build_object('question_id', v_q.id, 'type', v_q.type,
        'text', v_q.text, 'insufficient_data', true, 'n', null);
      continue;
    end if;

    v_out := v_out || (
      select jsonb_build_object(
        'question_id', v_q.id, 'type', v_q.type, 'text', v_q.text, 'n', v_n,
        'distribution', coalesce(jsonb_agg(jsonb_build_object('value', d.val, 'count', d.cnt) order by d.val), '[]'::jsonb),
        'avg', case when v_q.type in ('scale','enps','slider') then
          (select round(avg((a.value #>> '{}')::numeric), 2)
             from public.responses r
             join public.answers a on a.response_id = r.id and a.question_id = v_q.id
             join public.survey_rounds sr on sr.id = r.round_id
            where sr.survey_id = p_survey
              and (p_round is null or r.round_id = p_round)
              and (p_group is null or r.respondent_group_id = p_group)
              and jsonb_typeof(a.value) in ('number','string'))
          else null end)
      from (
        select a.value #>> '{}' as val, count(*) as cnt
        from public.responses r
        join public.answers a on a.response_id = r.id and a.question_id = v_q.id
        join public.survey_rounds sr on sr.id = r.round_id
        where sr.survey_id = p_survey
          and (p_round is null or r.round_id = p_round)
          and (p_group is null or r.respondent_group_id = p_group)
          and v_q.type <> 'text'
        group by 1
      ) d);
  end loop;

  return jsonb_build_object('survey_id', p_survey, 'group', p_group, 'k', v_k, 'questions', v_out);
end $function$;

-- results_summary: gate on the survey's own threshold
CREATE OR REPLACE FUNCTION public.results_summary(p_survey uuid, p_round uuid DEFAULT NULL::uuid, p_group uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k int := app.k_for(p_survey);
  v_org uuid;
  v_n int; v_avg numeric;
  v_invited int; v_responded int;
  v_teams jsonb := '[]'::jsonb;
  v_insights jsonb := '[]'::jsonb;
  v_prev jsonb := null;
  v_prev_avg numeric;
  v_round_no int;
  q record;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select count(distinct r.id)::int into v_n
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  where sr.survey_id = p_survey
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  select round(avg(app.numeric_answer(a.value)), 2) into v_avg
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.answers a on a.response_id = r.id
  join public.survey_questions q2 on q2.id = a.question_id
  where sr.survey_id = p_survey
    and q2.type::text = any(app.scale_types())
    and app.numeric_answer(a.value) is not null
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  select count(*)::int, count(*) filter (where i.responded_at is not null)::int
    into v_invited, v_responded
  from public.survey_invitations i
  join public.survey_rounds sr on sr.id = i.round_id
  where sr.survey_id = p_survey
    and (p_round is null or i.round_id = p_round)
    and (p_group is null or i.group_id = p_group);

  -- The whole slice is below the threshold: no average, no teams, no insights.
  if v_n < v_k then
    v_avg := null;
  end if;

  -- Team rows, gated one team at a time.
  with stats as (
    select r.respondent_group_id as gid,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q2 on q2.id = a.question_id
    where sr.survey_id = p_survey
      and q2.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_round is null or r.round_id = p_round)
    group by 1
  )
  select coalesce(jsonb_agg(
           case when coalesce(st.n, 0) >= v_k
             then jsonb_build_object('group_id', g.id, 'label', g.name, 'n', st.n, 'avg', st.avg)
             else jsonb_build_object('group_id', g.id, 'label', g.name, 'insufficient_data', true)
           end order by g.name), '[]'::jsonb)
    into v_teams
  from public.groups g
  left join stats st on st.gid = g.id
  where g.org_id = v_org
    and (p_group is null or g.id = p_group);

  -- Previous round, for the "Mot forrige runde" panel. Gated like any other.
  if p_round is not null then
    select ro.round_no into v_round_no from public.survey_rounds ro where ro.id = p_round;
    select jsonb_build_object('round_id', prev.id, 'round_no', prev.round_no) ||
           case when coalesce(prev.n, 0) >= v_k
             then jsonb_build_object('n', prev.n, 'avg', prev.avg)
             else jsonb_build_object('insufficient_data', true) end
      into v_prev
    from (
      select ro.id, ro.round_no,
             count(distinct r.id)::int as n,
             round(avg(app.numeric_answer(a.value)), 2) as avg
      from public.survey_rounds ro
      left join public.responses r on r.round_id = ro.id
        and (p_group is null or r.respondent_group_id = p_group)
      left join public.answers a on a.response_id = r.id
      left join public.survey_questions q2 on q2.id = a.question_id
        and q2.type::text = any(app.scale_types())
      where ro.survey_id = p_survey and ro.round_no < coalesce(v_round_no, 0)
      group by ro.id, ro.round_no
      order by ro.round_no desc
      limit 1
    ) prev;
    if v_prev is not null and (v_prev ? 'avg') then
      v_prev_avg := (v_prev ->> 'avg')::numeric;
    end if;
  end if;

  -- Insight facts. Every one of them reads a number that survived the gate:
  -- the per-question loop skips anything below k, so a four-answer question can
  -- never become "the lowest scoring area", and no team id is referenced at all.
  if v_n >= v_k then
    for q in
      select a2.question_id as qid,
             count(distinct r.id)::int as n,
             avg(app.numeric_answer(a2.value)) as avg,
             count(*) filter (where app.numeric_answer(a2.value) <= 2)::numeric
               / nullif(count(*), 0) as low_share
      from public.responses r
      join public.survey_rounds sr on sr.id = r.round_id
      join public.answers a2 on a2.response_id = r.id
      join public.survey_questions q2 on q2.id = a2.question_id
      where sr.survey_id = p_survey
        and q2.type::text = any(app.scale_types())
        and app.numeric_answer(a2.value) is not null
        and (p_round is null or r.round_id = p_round)
        and (p_group is null or r.respondent_group_id = p_group)
      group by 1
      order by 3 asc
    loop
      if q.n < v_k then
        continue;   -- the per-cell gate, inside the insight generator itself
      end if;
      if q.avg < 3.6 then
        v_insights := v_insights || jsonb_build_object('key', 'low_question',
          'tone', 'warn', 'question_id', q.qid, 'value', round(q.avg, 1));
      elsif q.low_share >= 0.2 then
        v_insights := v_insights || jsonb_build_object('key', 'split_question',
          'tone', 'warn', 'question_id', q.qid, 'value', round(q.low_share * 100, 0));
      elsif q.avg >= 4.3 then
        v_insights := v_insights || jsonb_build_object('key', 'strong_question',
          'tone', 'good', 'question_id', q.qid, 'value', round(q.avg, 1));
      end if;
    end loop;

    if v_invited > 0 and (v_responded::numeric / v_invited) < 0.7 then
      v_insights := v_insights || jsonb_build_object('key', 'low_response_rate',
        'tone', 'note', 'value', round(100.0 * v_responded / v_invited, 0));
    end if;
    v_insights := (select coalesce(jsonb_agg(e), '[]'::jsonb)
                   from (select e from jsonb_array_elements(v_insights) e limit 4) t);
  end if;

  return jsonb_build_object(
    'k', v_k, 'survey_id', p_survey, 'round_id', p_round, 'group_id', p_group,
    'n', v_n, 'invited', v_invited, 'responded', v_responded,
    'completion', case when v_invited > 0
                    then round(v_responded::numeric / v_invited, 4) else null end,
    'avg', v_avg, 'teams', v_teams, 'prev', v_prev,
    'delta', case when v_avg is not null and v_prev_avg is not null
               then round(v_avg - v_prev_avg, 2) else null end,
    'insights', v_insights);
end $function$;

-- get_trends: gate on the survey's own threshold
CREATE OR REPLACE FUNCTION public.get_trends(p_survey uuid, p_group uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k int := app.k_for(p_survey);
  v_points jsonb := '[]'::jsonb;
begin
  if p_survey is null or not app.can_view_survey(p_survey) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Rounds drive the axis, not responses: a round nobody answered is a real
  -- point on a trend line, and dropping it would silently redraw history.
  with rounds as (
    select ro.id, ro.round_no, ro.opens_at, ro.closes_at, ro.status
    from public.survey_rounds ro
    where ro.survey_id = p_survey
  ),
  stats as (
    select r.round_id as rid,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join rounds ro on ro.id = r.round_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where q.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_group is null or r.respondent_group_id = p_group)
    group by 1
  )
  select coalesce(jsonb_agg(
           case when coalesce(st.n, 0) >= v_k
             then jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status, 'n', st.n, 'avg', st.avg)
             else jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status, 'insufficient_data', true)
           end order by ro.round_no), '[]'::jsonb)
    into v_points
  from rounds ro
  left join stats st on st.rid = ro.id;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey, 'points', v_points);
end $function$;

-- get_quotes: gate on the survey's own threshold
CREATE OR REPLACE FUNCTION public.get_quotes(p_survey uuid, p_question uuid, p_group uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_theme text DEFAULT NULL::text, p_lang text DEFAULT 'no'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_n int;
  v_role app.member_role;
  v_k int := app.k_for(p_survey);
  v_pattern text;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select m.role into v_role from public.org_members m
   where m.org_id = v_org and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_role = 'leser' and p_group is not null then
    return jsonb_build_object('error', 'forbidden'); -- leser: aggregates only, never filtered text
  end if;

  if p_theme is not null then
    select tr.pattern into v_pattern
      from public.theme_rules tr where tr.key = p_theme and tr.lang = p_lang;
    -- An unknown theme key must not silently widen back to "all quotes".
    if v_pattern is null then
      return jsonb_build_object('insufficient_data', true, 'n', null, 'k', v_k);
    end if;
  end if;

  select count(*) into v_n
  from public.responses r
  join public.answers a on a.response_id = r.id and a.question_id = p_question
  join public.survey_rounds sr on sr.id = r.round_id
  where sr.survey_id = p_survey
    and (p_group is null or r.respondent_group_id = p_group)
    and a.value is not null and a.value #>> '{}' <> ''
    and (v_pattern is null or lower(a.value #>> '{}') ~ v_pattern);

  if v_n < v_k then
    return jsonb_build_object('insufficient_data', true, 'n', null, 'k', v_k);
  end if;

  return (
    select jsonb_build_object('n', v_n, 'theme', p_theme, 'quotes',
      coalesce(jsonb_agg(jsonb_build_object('text', t.txt)), '[]'::jsonb))
    from (
      select a.value #>> '{}' as txt
      from public.responses r
      join public.answers a on a.response_id = r.id and a.question_id = p_question
      join public.survey_rounds sr on sr.id = r.round_id
      where sr.survey_id = p_survey
        and (p_group is null or r.respondent_group_id = p_group)
        and a.value is not null and a.value #>> '{}' <> ''
        and (v_pattern is null or lower(a.value #>> '{}') ~ v_pattern)
      order by random()  -- never chronological: prevents timing correlation
      limit greatest(1, least(coalesce(p_limit, 20), 100))
    ) t);
  -- Still no author, no group label and no timestamp in the payload — ever.
end $function$;

-- get_themes: gate on the survey's own threshold
CREATE OR REPLACE FUNCTION public.get_themes(p_survey uuid, p_rounds uuid[] DEFAULT NULL::uuid[], p_group uuid DEFAULT NULL::uuid, p_lang text DEFAULT 'no'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k int := app.k_for(p_survey);
  v_org uuid;
  v_role app.member_role;
  v_total int;
  v_themes jsonb := '[]'::jsonb;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Same rule as get_quotes: a leser reads aggregates, never free text narrowed
  -- to one team. Themes are counts rather than quotes, but a team-filtered
  -- theme list is still a description of what one small group wrote.
  select m.role into v_role from public.org_members m
   where m.org_id = v_org and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_role = 'leser' and p_group is not null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Everything the respondent typed: the free-text answers themselves, plus the
  -- per-question comments and the low-score follow-ups, which are the same kind
  -- of writing and are subject to the same gate.
  with body as (
    select r.id as response_id,
           lower(concat_ws(' ',
             case when q.type::text = 'text' then a.value #>> '{}' end,
             a.comment, a.follow_up)) as txt
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where sr.survey_id = p_survey
      and (p_rounds is null or r.round_id = any(p_rounds))
      and (p_group is null or r.respondent_group_id = p_group)
  ),
  written as (
    select * from body where coalesce(btrim(txt), '') <> ''
  ),
  hits as (
    select tr.key, tr.label, tr.ord, w.response_id,
           (select count(*) from regexp_matches(w.txt, tr.pattern, 'g')) as m
    from written w
    join public.theme_rules tr on tr.lang = p_lang
    where w.txt ~ tr.pattern
  ),
  rolled as (
    select key, label, ord,
           sum(m)::int as mentions,
           count(distinct response_id)::int as contributors
    from hits group by key, label, ord
  )
  select
    (select count(distinct response_id)::int from written),
    coalesce(jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'mentions', mentions, 'contributors', contributors)
      order by mentions desc, ord), '[]'::jsonb)
  into v_total, v_themes
  from rolled
  where contributors >= v_k;   -- the per-theme gate

  -- And the panel-level gate: below k contributors overall there is nothing
  -- safe to say about the free text, including that it exists.
  if coalesce(v_total, 0) < v_k then
    return jsonb_build_object('k', v_k, 'survey_id', p_survey,
                              'insufficient_data', true, 'themes', '[]'::jsonb);
  end if;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey,
                            'contributors', v_total, 'themes', v_themes);
end $function$;

-- get_benchmarks: gate on the survey's own threshold
CREATE OR REPLACE FUNCTION public.get_benchmarks(p_survey uuid, p_industry text DEFAULT 'Alle bransjer'::text, p_round uuid DEFAULT NULL::uuid, p_group uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k int := app.k_for(p_survey);
  v_org uuid;
  v_ind text := coalesce(nullif(btrim(p_industry), ''), 'Alle bransjer');
  v_rows jsonb := '[]'::jsonb;
  v_scale_n int; v_scale_avg numeric;
  v_enps_n int; v_enps numeric;
  v_invited int; v_responded int;
  v_has_scale boolean; v_has_enps boolean;
  b record;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Whether the survey ASKS the question a metric is derived from. A survey with
  -- no eNPS question has not got too few answers to that question — it has not
  -- asked it, and "for få svar" beside an industry figure would tell the reader
  -- to go and collect more responses that would never produce the number.
  select bool_or(q.type::text = any(app.scale_types())),
         bool_or(q.type::text = 'enps')
    into v_has_scale, v_has_enps
  from public.survey_questions q where q.survey_id = p_survey;

  select count(distinct r.id)::int, round(avg(app.numeric_answer(a.value)), 2)
    into v_scale_n, v_scale_avg
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.answers a on a.response_id = r.id
  join public.survey_questions q on q.id = a.question_id
  where sr.survey_id = p_survey
    and q.type::text = any(app.scale_types())
    and app.numeric_answer(a.value) is not null
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  -- eNPS proper: promoters (9-10) minus detractors (0-6), as a percentage.
  -- Not an average of the 0-10 answers, which is a different number entirely.
  select count(distinct r.id)::int,
         round(100.0 * (
           count(*) filter (where app.numeric_answer(a.value) >= 9)
           - count(*) filter (where app.numeric_answer(a.value) <= 6)
         ) / nullif(count(*), 0), 0)
    into v_enps_n, v_enps
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.answers a on a.response_id = r.id
  join public.survey_questions q on q.id = a.question_id
  where sr.survey_id = p_survey
    and q.type::text = 'enps'
    and app.numeric_answer(a.value) is not null
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  select count(*)::int, count(*) filter (where i.responded_at is not null)::int
    into v_invited, v_responded
  from public.survey_invitations i
  join public.survey_rounds sr on sr.id = i.round_id
  where sr.survey_id = p_survey
    and (p_round is null or i.round_id = p_round)
    and (p_group is null or i.group_id = p_group);

  for b in
    select bm.metric_key, bm.value, bm.source
    from public.benchmarks bm
    where bm.industry = v_ind
    order by case bm.metric_key
      when 'engagement_avg' then 1 when 'response_rate' then 2 when 'enps' then 3 else 9 end
  loop
    -- Skip a metric this survey cannot produce at all, and skip the response
    -- rate when nobody was invited (an open share link has no denominator).
    if (b.metric_key = 'engagement_avg' and not coalesce(v_has_scale, false))
       or (b.metric_key = 'enps' and not coalesce(v_has_enps, false))
       or (b.metric_key = 'response_rate' and coalesce(v_invited, 0) = 0)
    then
      continue;
    end if;

    v_rows := v_rows || case b.metric_key
      when 'engagement_avg' then
        case when coalesce(v_scale_n, 0) >= v_k
          then jsonb_build_object('metric_key', b.metric_key, 'scale', 'score_5',
                 'bench', b.value, 'source', b.source, 'mine', v_scale_avg, 'n', v_scale_n)
          else jsonb_build_object('metric_key', b.metric_key, 'scale', 'score_5',
                 'bench', b.value, 'source', b.source, 'insufficient_data', true)
        end
      when 'enps' then
        case when coalesce(v_enps_n, 0) >= v_k
          then jsonb_build_object('metric_key', b.metric_key, 'scale', 'enps',
                 'bench', b.value, 'source', b.source, 'mine', v_enps, 'n', v_enps_n)
          else jsonb_build_object('metric_key', b.metric_key, 'scale', 'enps',
                 'bench', b.value, 'source', b.source, 'insufficient_data', true)
        end
      when 'response_rate' then
        -- Participation, not a result. The same number the Undersøkelser list
        -- already shows (migration 0003), so gating it here would be theatre —
        -- and it says nothing about what anybody answered.
        jsonb_build_object('metric_key', b.metric_key, 'scale', 'rate',
          'bench', b.value, 'source', b.source, 'invited', v_invited,
          'responded', v_responded,
          'mine', case when v_invited > 0
                    then round(v_responded::numeric / v_invited, 4) else null end)
      else jsonb_build_object('metric_key', b.metric_key, 'scale', 'raw',
             'bench', b.value, 'source', b.source, 'insufficient_data', true)
    end;
  end loop;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey,
                            'industry', v_ind, 'rows', v_rows);
end $function$;

-- quote_candidates: gate on the survey's own threshold
CREATE OR REPLACE FUNCTION public.quote_candidates(p_survey uuid, p_group uuid DEFAULT NULL::uuid, p_rounds uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_k   int := app.k_for(p_survey);
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not app.has_role(v_org, array['administrator','redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  return jsonb_build_object(
    'k', v_k,
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'answer_id', c.answer_id,
               'question_id', c.question_id,
               'text', c.txt) order by c.ord)
        from (
          select a.id as answer_id,
                 q.id as question_id,
                 a.value #>> '{}' as txt,
                 md5(a.id::text) as ord
            from public.answers a
            join public.responses r on r.id = a.response_id
            join public.survey_rounds sr on sr.id = r.round_id
            join public.survey_questions q on q.id = a.question_id
           where sr.survey_id = p_survey
             and q.type::text = 'text'
             and (p_rounds is null or cardinality(p_rounds) = 0 or r.round_id = any (p_rounds))
             and (p_group is null or r.respondent_group_id = p_group)
             and a.value is not null and btrim(a.value #>> '{}') <> ''
             -- Per QUESTION, like every other cell: a question with fewer than
             -- k written answers is withheld whole. Counting across questions
             -- would let one answer to a rarely-answered question ride in on
             -- another question's volume.
             and (select count(*)
                    from public.answers a2
                    join public.responses r2 on r2.id = a2.response_id
                    join public.survey_rounds sr2 on sr2.id = r2.round_id
                   where sr2.survey_id = p_survey
                     and a2.question_id = q.id
                     and (p_rounds is null or cardinality(p_rounds) = 0
                          or r2.round_id = any (p_rounds))
                     and (p_group is null or r2.respondent_group_id = p_group)
                     and a2.value is not null and btrim(a2.value #>> '{}') <> ''
                 ) >= v_k
           -- Never chronological, for the same reason get_quotes is not: order
           -- of submission is a correlation channel. md5 of the id is stable
           -- across renders, which random() is not, and the picker needs the
           -- list not to reshuffle under the user's cursor.
           order by md5(a.id::text)
           limit greatest(1, least(coalesce(p_limit, 6), 50))
        ) c), '[]'::jsonb));
end $function$;

-- get_heatmap: strictest k across the surveys in scope (design brief §6)
CREATE OR REPLACE FUNCTION public.get_heatmap(p_org uuid, p_surveys uuid[] DEFAULT NULL::uuid[], p_group uuid DEFAULT NULL::uuid, p_rounds uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k int := (select coalesce(max(app.k_for(s.id)), 5) from public.surveys s where s.org_id = p_org and s.deleted_at is null and (p_surveys is null or s.id = any(p_surveys)));
  v_cols jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_org is null or not app.is_org_member(p_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', c.question_id, 'survey_id', c.survey_id,
           'text', c.text, 'type', c.type)
         order by c.survey_id, c.ord), '[]'::jsonb)
    into v_cols
  from app.scale_questions(p_org, p_surveys) c;

  -- One grouped pass over the answers, then a full grid: every group in scope
  -- crossed with every column, so a team that answered nothing still appears as
  -- a gated row rather than vanishing. A missing row and a gated row look the
  -- same to a reader, but only one of them is honest about the team existing.
  with cols as (
    select * from app.scale_questions(p_org, p_surveys)
  ),
  stats as (
    select r.respondent_group_id as gid,
           a.question_id as qid,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.answers a on a.response_id = r.id
    join cols c on c.question_id = a.question_id and c.survey_id = sr.survey_id
    where app.numeric_answer(a.value) is not null
      and (p_rounds is null or r.round_id = any(p_rounds))
    group by 1, 2
  ),
  grid as (
    select g.id as gid, g.name as label, c.question_id, c.survey_id, c.ord,
           st.n, st.avg
    from public.groups g
    cross join cols c
    left join stats st on st.gid = g.id and st.qid = c.question_id
    where g.org_id = p_org
      and (p_group is null or g.id = p_group)
  )
  select coalesce(jsonb_agg(x.row order by x.label), '[]'::jsonb)
    into v_rows
  from (
    select gid, label, jsonb_build_object(
             'group_id', gid, 'label', label,
             'cells', jsonb_agg(
               case when coalesce(n, 0) >= v_k
                 then jsonb_build_object('question_id', question_id, 'n', n, 'avg', avg)
                 -- No n, no avg: the flag is the entire payload for a gated cell.
                 else jsonb_build_object('question_id', question_id, 'insufficient_data', true)
               end order by survey_id, ord)) as row
    from grid
    group by gid, label
  ) x;

  return jsonb_build_object('k', v_k, 'org_id', p_org, 'cols', v_cols, 'rows', v_rows);
end $function$;

-- dashboard_summary: strictest k across the surveys in scope (design brief §6)
CREATE OR REPLACE FUNCTION public.dashboard_summary(p_org uuid, p_surveys uuid[] DEFAULT NULL::uuid[], p_group uuid DEFAULT NULL::uuid, p_rounds uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k int := (select coalesce(max(app.k_for(s.id)), 5) from public.surveys s where s.org_id = p_org and s.deleted_at is null and (p_surveys is null or s.id = any(p_surveys)));
  v_surveys jsonb := '[]'::jsonb;
  v_drivers jsonb := '[]'::jsonb;
  v_n int; v_avg numeric; v_invited int; v_responded int;
begin
  if p_org is null or not app.is_org_member(p_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'title', s.title, 'status', s.status) order by s.created_at desc), '[]'::jsonb)
    into v_surveys
  from public.surveys s
  where s.org_id = p_org and s.deleted_at is null
    and (p_surveys is null or s.id = any(p_surveys));

  select count(distinct r.id)::int into v_n
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.surveys s on s.id = sr.survey_id
  where s.org_id = p_org and s.deleted_at is null
    and (p_surveys is null or s.id = any(p_surveys))
    and (p_rounds is null or r.round_id = any(p_rounds))
    and (p_group is null or r.respondent_group_id = p_group);

  select count(*)::int, count(*) filter (where i.responded_at is not null)::int
    into v_invited, v_responded
  from public.survey_invitations i
  join public.survey_rounds sr on sr.id = i.round_id
  join public.surveys s on s.id = sr.survey_id
  where s.org_id = p_org and s.deleted_at is null
    and (p_surveys is null or s.id = any(p_surveys))
    and (p_rounds is null or i.round_id = any(p_rounds))
    and (p_group is null or i.group_id = p_group);

  -- Drivers are a RANKING, so a gated question is dropped rather than carried
  -- with a null: a question with no number cannot be "lowest scoring", and
  -- rendering it as 0 would put a four-answer question at the bottom of the
  -- list as though that were a finding.
  with stats as (
    select a.question_id as qid, q.survey_id, q.text, q.type::text as type,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.surveys s on s.id = sr.survey_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where s.org_id = p_org and s.deleted_at is null
      and (p_surveys is null or s.id = any(p_surveys))
      and q.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_rounds is null or r.round_id = any(p_rounds))
      and (p_group is null or r.respondent_group_id = p_group)
    group by 1, 2, 3, 4
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', qid, 'survey_id', survey_id, 'text', text,
           'type', type, 'n', n, 'avg', avg) order by avg desc), '[]'::jsonb)
    into v_drivers
  from stats where n >= v_k;

  if v_n < v_k then
    v_avg := null;
  else
    select round(avg(app.numeric_answer(a.value)), 2) into v_avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.surveys s on s.id = sr.survey_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where s.org_id = p_org and s.deleted_at is null
      and (p_surveys is null or s.id = any(p_surveys))
      and q.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_rounds is null or r.round_id = any(p_rounds))
    and (p_group is null or r.respondent_group_id = p_group);
  end if;

  return jsonb_build_object('k', v_k, 'org_id', p_org, 'surveys', v_surveys,
    'n', v_n, 'invited', v_invited, 'responded', v_responded,
    'completion', case when v_invited > 0
                    then round(v_responded::numeric / v_invited, 4) else null end,
    'avg', v_avg, 'drivers', v_drivers);
end $function$;

-- get_peer_results: the token resolves the survey; gate on its threshold
CREATE OR REPLACE FUNCTION public.get_peer_results(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_res record;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_question record;
  v_k int;
  v_n int;
  v_buckets jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status <> 'live' then
    return jsonb_build_object('error', 'not_found');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id;
  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;
  v_k := app.k_for(v_survey.id);

  if coalesce((v_survey.engage ->> 'reveal_results')::boolean, false) is not true then
    return jsonb_build_object('hidden', true);
  end if;

  select (q ->> 'id')::uuid as id, q ->> 'text' as text, q ->> 'type' as type
    into v_question
    from jsonb_array_elements(v_round.question_snapshot) with ordinality as t(q, ord)
   where q ->> 'type' in ('scale', 'likert', 'smiley', 'enps', 'slider')
   order by ord
   limit 1;

  if v_question.id is null then
    return jsonb_build_object('hidden', true);
  end if;

  select count(*) into v_n
    from public.answers a
    join public.responses r on r.id = a.response_id
   where r.round_id = v_round.id
     and a.question_id = v_question.id
     and jsonb_typeof(a.value) = 'number';

  if v_n < v_k then
    return jsonb_build_object('insufficient_data', true, 'k', v_k, 'question', v_question.text);
  end if;

  select jsonb_agg(jsonb_build_object('value', value, 'count', c) order by value)
    into v_buckets
    from (
      select (a.value #>> '{}')::numeric as value, count(*) as c
        from public.answers a
        join public.responses r on r.id = a.response_id
       where r.round_id = v_round.id
         and a.question_id = v_question.id
         and jsonb_typeof(a.value) = 'number'
       group by 1
    ) b;

  return jsonb_build_object(
    'question', v_question.text, 'type', v_question.type,
    'n', v_n, 'buckets', coalesce(v_buckets, '[]'::jsonb));
end $function$;

-- compose_report: strictest k across the report's surveys
CREATE OR REPLACE FUNCTION public.compose_report(p_report uuid, p_token text DEFAULT NULL::text, p_as_scope app.share_scope DEFAULT NULL::app.share_scope)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rep       public.reports;
  v_share     public.report_shares;
  v_k         int;
  v_role      app.member_role;
  v_scope     app.share_scope;
  v_group     uuid;
  v_surveys   uuid[];
  v_rounds    uuid[];
  v_picks     uuid[];
  v_sections  text[];
  v_section   text;
  v_out       jsonb := '[]'::jsonb;
  v_rows      jsonb;
  v_cells     jsonb;
  v_extra     jsonb;
  v_pending   boolean;
  v_snapshot  public.result_snapshots;
  v_source    text;
  v_snap_id   uuid;
  v_survey    uuid;
  v_hidden    jsonb;
  v_summary   jsonb;
begin
  select r.* into v_rep from public.reports r
   where r.id = p_report and r.deleted_at is null;
  if v_rep.id is null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if p_token is not null and length(p_token) > 0 then
    select s.* into v_share from public.report_shares s
     where s.report_id = p_report and s.token_hash = app.hash_token(p_token);
    if v_share.id is null
       or (v_share.expires_at is not null and v_share.expires_at <= now()) then
      return jsonb_build_object('error', 'forbidden');
    end if;
    v_scope := v_share.scope;
    v_group := coalesce((v_rep.filters->>'group')::uuid, v_share.group_id);
    if v_rep.filters->>'group' is not null and v_share.group_id is not null
       and v_share.group_id <> (v_rep.filters->>'group')::uuid then
      return jsonb_build_object('error', 'forbidden');
    end if;
    if v_scope = 'ledere_eget_team' and v_group is null then
      return jsonb_build_object('error', 'forbidden');
    end if;
  else
    if not app.is_org_member(v_rep.org_id) then
      return jsonb_build_object('error', 'forbidden');
    end if;
    select m.role into v_role from public.org_members m
     where m.org_id = v_rep.org_id and m.user_id = (select auth.uid()) and m.status = 'active';
    v_scope := 'ledelse';
    v_group := (v_rep.filters->>'group')::uuid;
  end if;

  v_scope := greatest(v_scope, coalesce(p_as_scope, v_scope));

  select coalesce(array_agg(x::uuid), '{}') into v_surveys
    from jsonb_array_elements_text(coalesce(v_rep.filters->'surveys', '[]'::jsonb)) x;
  v_k := (select coalesce(max(app.k_for(sid)), 5) from unnest(v_surveys) sid);
  select coalesce(array_agg(x::uuid), '{}') into v_rounds
    from jsonb_array_elements_text(coalesce(v_rep.filters->'rounds', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}') into v_picks
    from jsonb_array_elements_text(coalesce(v_rep.filters->'quotes', '[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_sections
    from jsonb_array_elements_text(coalesce(v_rep.sections, '[]'::jsonb)) x;

  if exists (
    select 1 from unnest(v_surveys) s(id)
     where not exists (select 1 from public.surveys sv
                        where sv.id = s.id and sv.org_id = v_rep.org_id)
  ) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_survey := v_surveys[1];
  if v_survey is null then
    return jsonb_build_object(
      'report_id', v_rep.id, 'title', v_rep.title, 'k', v_k, 'role', v_role,
      'via', case when v_share.id is not null then 'share' else 'member' end,
      'share_scope', v_scope,
      'org_name', (select o.name from public.organizations o where o.id = v_rep.org_id),
      'scope', jsonb_build_object('surveys', to_jsonb(v_surveys), 'rounds', to_jsonb(v_rounds),
                                  'group', v_group),
      'sections', '[]'::jsonb, 'suppressed_groups', '[]'::jsonb);
  end if;

  v_snapshot := null;
  if v_rep.snapshot_id is not null then
    select sn.* into v_snapshot from public.result_snapshots sn
     where sn.id = v_rep.snapshot_id and sn.org_id = v_rep.org_id and sn.survey_id = v_survey
       and sn.scope->>'group' is not distinct from v_group::text
       and sn.scope->>'round' is not distinct from v_rounds[1]::text
       -- Frozen at least as restrictively as this reader may see. A snapshot
       -- with no recorded scope predates the freeze and counts as `ledelse`,
       -- i.e. usable only by a member.
       and coalesce((sn.scope->>'share_scope')::app.share_scope, 'ledelse') >= v_scope;
  end if;

  -- A published report renders from its frozen document, not from answers that
  -- may since have been deleted. Reader identity is restamped; the content is
  -- exactly what was gated at publish time.
  if v_snapshot.id is not null and v_snapshot.aggregates ? 'document' then
    return (v_snapshot.aggregates->'document')
           || jsonb_build_object(
                'role', v_role,
                'via', case when v_share.id is not null then 'share' else 'member' end,
                'share_scope', v_scope,
                'frozen_at', v_snapshot.created_at,
                'snapshot_id', v_snapshot.id);
  end if;

  v_summary := public.results_summary(v_survey, v_rounds[1], v_group);

  foreach v_section in array v_sections loop
    v_rows := null; v_cells := null; v_extra := null; v_pending := false;
    v_source := 'live'; v_snap_id := null;

    if v_section in ('teams', 'heatmap') then
      if v_scope = 'alle_ansatte' then
        continue;
      end if;
      select jsonb_agg(jsonb_build_object(
               'group_id', g.id, 'label', g.name, 'n', t.n, 'avg', t.avg) order by g.name)
        into v_rows
        from public.groups g
        join lateral (
          select count(distinct r.id) as n,
                 round(avg(app.numeric_answer(a.value)), 2) as avg
            from public.responses r
            join public.survey_rounds sr on sr.id = r.round_id
            join public.answers a on a.response_id = r.id
            join public.survey_questions q on q.id = a.question_id
           where sr.survey_id = v_survey
             and q.type::text = any (app.scale_types())
             and r.respondent_group_id = g.id
             and (cardinality(v_rounds) = 0 or r.round_id = any (v_rounds))
        ) t on true
       where g.org_id = v_rep.org_id and (v_group is null or g.id = v_group) and t.n > 0;
      v_rows := app.suppress_partition(coalesce(v_rows, '[]'::jsonb), v_k);

    elsif v_section = 'trend' then
      v_extra := public.get_trends(v_survey, v_group);

    elsif v_section = 'themes' then
      v_extra := public.get_themes(v_survey, case when cardinality(v_rounds) = 0
                                                  then null else v_rounds end, v_group);

    elsif v_section = 'quotes' then
      v_extra := app.report_quotes(v_survey, v_group,
                                   case when cardinality(v_rounds) = 0 then null
                                        else v_rounds end,
                                   v_picks, v_k);

    elsif v_section = 'drivers' then
      select jsonb_build_object('drivers', coalesce(jsonb_agg(d order by d->>'rank'), '[]'::jsonb))
        into v_extra
        from (
          (select jsonb_build_object('question_id', q->>'question_id', 'text', q->>'text',
                                     'avg', (q->>'avg')::numeric, 'rank', '1') as d
             from jsonb_array_elements(
                    (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions') q
            where q->>'avg' is not null
            order by (q->>'avg')::numeric desc limit 3)
          union all
          (select jsonb_build_object('question_id', q->>'question_id', 'text', q->>'text',
                                     'avg', (q->>'avg')::numeric, 'rank', '2') as d
             from jsonb_array_elements(
                    (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions') q
            where q->>'avg' is not null
            order by (q->>'avg')::numeric asc limit 3)
        ) ranked;

    elsif v_section = 'participation' then
      v_extra := jsonb_build_object(
        'invited', v_summary->'invited',
        'responded', v_summary->'responded',
        'completion', v_summary->'completion');

    elsif v_section in ('actions', 'method') then
      v_pending := true;

    else -- summary
      -- A snapshot without a frozen `document` is a plain aggregate freeze --
      -- what `close_round` writes so a closed round's numbers outlive the
      -- answers. It still feeds the summary cells, and the section says which
      -- of the two it is.
      if v_snapshot.id is not null then
        v_cells := v_snapshot.aggregates->'questions';
        v_source := 'snapshot';
        v_snap_id := v_snapshot.id;
      else
        v_cells := (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions';
      end if;
      v_extra := jsonb_build_object('findings', v_summary->'insights');
    end if;

    v_out := v_out || jsonb_build_object(
      'key', v_section, 'source', v_source, 'snapshot_id', v_snap_id,
      'pending', v_pending,
      'scope', jsonb_build_object('group', v_group, 'rounds', to_jsonb(v_rounds)),
      'rows', v_rows, 'cells', v_cells, 'extra', v_extra);
  end loop;

  select jsonb_agg(distinct e->'group_id') into v_hidden
    from jsonb_array_elements(v_out) s,
         jsonb_array_elements(app.jsonb_array(s->'rows')) e
   where (e->>'suppressed')::boolean;

  if v_hidden is not null and jsonb_array_length(v_hidden) > 0 then
    declare v_visible_n bigint := 0;
    begin
      select coalesce(sum(n), 0) into v_visible_n
        from (select distinct on (e->>'group_id') (e->>'n')::bigint as n
                from jsonb_array_elements(v_out) s,
                     jsonb_array_elements(app.jsonb_array(s->'rows')) e
               where not (e->>'suppressed')::boolean) d;
      select jsonb_agg(
               case when jsonb_typeof(s->'cells') <> 'array' then s
                    else jsonb_set(s, '{cells}', (
                      select coalesce(jsonb_agg(
                               case when c->>'n' is not null
                                     and (c->>'n')::bigint - v_visible_n > 0
                                     and (c->>'n')::bigint - v_visible_n < v_k
                                    then c - 'n' - 'avg' - 'distribution'
                                         || jsonb_build_object('n', null, 'avg', null,
                                                               'insufficient_data', true)
                                    else c end), '[]'::jsonb)
                        from jsonb_array_elements(s->'cells') c)) end
               order by ord)
        into v_out
        from jsonb_array_elements(v_out) with ordinality as t(s, ord);
    end;
  end if;

  return jsonb_build_object(
    'report_id', v_rep.id, 'title', v_rep.title, 'k', v_k, 'role', v_role,
    'via', case when v_share.id is not null then 'share' else 'member' end,
    'share_scope', v_scope,
    'org_name', (select o.name from public.organizations o where o.id = v_rep.org_id),
    'scope', jsonb_build_object('surveys', to_jsonb(v_surveys), 'rounds', to_jsonb(v_rounds),
                                'group', v_group),
    'sections', coalesce(v_out, '[]'::jsonb),
    'suppressed_groups', coalesce(v_hidden, '[]'::jsonb));
end $function$;

