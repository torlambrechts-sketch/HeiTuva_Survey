-- V2-5 ITEM 0 — every path that closes a round freezes its numbers.
--
-- ── THE DEFECT, AND WHY IT IS DATA LOSS RATHER THAN A COPY PROBLEM ──────────
--
-- `app.apply_retention` runs nightly (`cron.job`: `retention-daily 0 3 * * *`)
-- and deletes `answers` then `responses`. Nothing snapshots first. So a round's
-- aggregates survive only where a `result_snapshots` row already exists.
--
-- `M:0023` added that snapshot to `public.close_round` and its header names this
-- exact failure — «the retention job deletes answers on schedule, and a trend
-- line loses its earlier points because nothing ever wrote them down». **It was
-- added to the one closer nobody can reach.** Measured in V2-4:
--
--     app.close_rounds_with_survey | NO SNAPSHOT   (trigger, survey → lukket)
--     app.run_due_schedules        | NO SNAPSHOT   (cron, hourly)
--     public.close_round           | SNAPSHOTS — and `grep -rn close_round app lib` is empty
--
-- 34 of 36 seeded surveys with responses had no snapshot at all. «Summerte tall
-- beholdes» was drawn under the retention selector in ALL THREE handoffs
-- (`HeiTuva.dc.html:5602`, v1 `:3951`, legacy `:3271`) and was false in every
-- one. V2-4 corrected the copy, which stopped the product lying and did not stop
-- the deletion.
--
-- ── THE TRAP, WHICH DECIDES THE SHAPE OF THIS MIGRATION ─────────────────────
--
-- The obvious fix is `select public.snapshot_results(...)` from the two other
-- closers. It does nothing:
--
--     public.snapshot_results  → app.can_edit_survey(p_survey)   false for cron
--     public.aggregate_results → app.is_org_member(v_org)        false for cron
--
-- Both return `{"error":"forbidden"}`, write nothing, and leave a diff that
-- looks like the bug is fixed — D110's mute, arriving through a fix instead of
-- through evidence. Tor: **«Assert the row exists after the scheduled path runs,
-- not that the call returned.»** `tests/db/round-freeze.test.ts` reads
-- `result_snapshots` in every test and never a return value.
--
-- ── SO: ONE BODY, TWO ENTRY POINTS, AUTHORITY AT THE PUBLIC BOUNDARY ────────
--
-- The aggregate body moves to `app.aggregate_rows`, which is **k-gated and has
-- no authority check**, and `public.aggregate_results` becomes the membership
-- check plus a delegation. The k-gate is the SECURITY property and it stays in
-- the shared body; membership is AUTHORITY, and the system acting on its own
-- behalf — a trigger, a cron job — has it by construction.
--
-- **The alternative was a second copy of the aggregate body for the internal
-- path, and this project has already paid for that shape**: V2-3b patched
-- verbatim copies of `send_round` at three anchors, and the fourth insertion
-- point was found by measurement rather than by the copy. One body cannot drift
-- from itself.
--
-- `app.freeze_round` is the internal writer. It is idempotent per round — a
-- scheduler that runs twice must not stack two freezes of the same round,
-- because «which one is the record» has no answer — and it stores the GATED
-- payload, for the reason `M:0023` gives: a snapshot taken from ungated data
-- would preserve a four-person cell for ever, past the deletion that was
-- supposed to protect it.

-- 1. The shared body -----------------------------------------------------------
create or replace function app.aggregate_rows(
  p_survey uuid,
  p_group uuid default null,
  p_round uuid default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $fn$
declare
  v_out jsonb := '[]'::jsonb; v_q record; v_n int; v_k int := app.k_for(p_survey);
begin
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
end $fn$;

comment on function app.aggregate_rows(uuid, uuid, uuid) is
  'The aggregate body, k-gated, WITHOUT an authority check. Callable only from '
  'the `app` schema — which PostgREST does not expose — and from the SECURITY '
  'DEFINER functions below. `public.aggregate_results` is the authorised entry '
  'point; this exists so the trigger and cron paths can freeze a round without '
  'a second copy of the body drifting away from the first.';

-- 2. The public entry point: authority, then the same body ---------------------
create or replace function public.aggregate_results(
  p_survey uuid,
  p_group uuid default null,
  p_round uuid default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $fn$
declare v_org uuid;
begin
  select org_id into v_org from public.surveys where id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error','forbidden');
  end if;
  return app.aggregate_rows(p_survey, p_group, p_round);
end $fn$;

-- 3. The internal writer -------------------------------------------------------
create or replace function app.freeze_round(p_survey uuid, p_round uuid)
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare v_org uuid; v_agg jsonb; v_hash text; v_id uuid;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  -- The organisation may be going away underneath this call — an org delete
  -- cascades to surveys and rounds. Writing a snapshot then would leave a
  -- record pointing at something that stopped existing under it, which is
  -- CLAUDE.md's referential-maintenance rule, and it would make the delete
  -- fail, which is a GDPR erasure path broken by a convenience feature.
  if v_org is null then
    return null;
  end if;

  -- Idempotent per round. A scheduler that runs twice must not stack two
  -- freezes of the same round: «which one is the record» has no answer.
  select id into v_id from public.result_snapshots
   where round_id = p_round and survey_id = p_survey
     and scope->>'group' is null and scope->>'report' is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  v_agg := app.aggregate_rows(p_survey, null, p_round);
  v_hash := encode(extensions.digest(v_agg::text, 'sha256'), 'hex');

  insert into public.result_snapshots (org_id, survey_id, round_id, scope, aggregates, content_hash)
  values (v_org, p_survey, p_round,
          jsonb_build_object('group', null, 'round', p_round),
          v_agg, v_hash)
  returning id into v_id;
  return v_id;
end $fn$;

comment on function app.freeze_round(uuid, uuid) is
  'Freeze one round''s gated aggregate. Idempotent per round; returns NULL '
  'rather than writing when the survey''s organisation has already gone, so an '
  'erasure cascade is never blocked by a freeze.';

revoke all on function app.aggregate_rows(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app.freeze_round(uuid, uuid) from public, anon, authenticated;

-- 4. The trigger path ----------------------------------------------------------
create or replace function app.close_rounds_with_survey() returns trigger
language plpgsql security definer set search_path to 'public'
as $fn$
declare v_round uuid;
begin
  if new.status = 'lukket' and coalesce(old.status::text, '') <> 'lukket' then
    -- `returning` rather than a re-select: the rows this statement closed are
    -- exactly the rounds to freeze, and re-reading `status = 'closed'` would
    -- also pick up rounds closed long ago by some other path.
    for v_round in
      update public.survey_rounds set status = 'closed'
        where survey_id = new.id and status = 'open'
      returning id
    loop
      perform app.freeze_round(new.id, v_round);
    end loop;

    update public.share_links set active = false
      where round_id in (select id from public.survey_rounds where survey_id = new.id);
    -- Belt and braces: the resolver already refuses a closed round, but the
    -- grace window must not be able to outlive the survey through some future
    -- path that forgets to check.
    update public.survey_invitations
       set previous_token_hash = null, previous_token_expires_at = null
     where round_id in (select id from public.survey_rounds where survey_id = new.id);
  end if;
  return new;
end $fn$;

-- 5. The scheduler path --------------------------------------------------------
-- `app.run_due_schedules` closes the previous round with a bare UPDATE before
-- opening the next one. Same treatment, and the same `returning` reason.
do $do$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'run_due_schedules';

  v_new := replace(v_src,
    $old$    update public.survey_rounds set status = 'closed'
      where survey_id = v_s.survey_id and status = 'open';$old$,
    $new$    for v_frozen in
      update public.survey_rounds set status = 'closed'
        where survey_id = v_s.survey_id and status = 'open'
      returning id
    loop
      perform app.freeze_round(v_s.survey_id, v_frozen);
    end loop;$new$);

  if v_new = v_src then
    raise exception 'run_due_schedules: the close statement did not match — patch by hand rather than silently skipping it';
  end if;

  -- The loop variable has to be declared. The anchor is the function's own
  -- `declare`, which is unique in the body.
  v_new := replace(v_new, E'declare\n', E'declare\n  v_frozen uuid;\n');
  execute v_new;
end $do$;

-- 6. `close_round` uses the same writer, so the three paths cannot diverge -----
-- It kept its own `snapshot_results` call, which is the authorised entry point
-- and therefore behaves differently from the other two by construction. Three
-- closers with two behaviours is the state this migration exists to end.
create or replace function public.close_round(p_round uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_survey uuid;
  v_status text;
  v_snap   uuid;
begin
  select survey_id, status into v_survey, v_status
    from public.survey_rounds where id = p_round;
  if v_survey is null then return jsonb_build_object('error','not_found'); end if;
  if not app.can_edit_survey(v_survey) then return jsonb_build_object('error','forbidden'); end if;

  update public.survey_rounds set status = 'closed' where id = p_round;
  update public.share_links set active = false where round_id = p_round;
  update public.survey_invitations
     set previous_token_hash = null, previous_token_expires_at = null
   where round_id = p_round;

  -- Only on the transition. Closing an already-closed round is idempotent
  -- everywhere else in this function and must not append another snapshot —
  -- and `app.freeze_round` refuses a second one anyway, which is belt to this
  -- brace rather than a replacement for it.
  if v_status is distinct from 'closed' then
    v_snap := app.freeze_round(v_survey, p_round);
  end if;

  return jsonb_build_object('ok', true, 'snapshot_id', v_snap);
end $fn$;
