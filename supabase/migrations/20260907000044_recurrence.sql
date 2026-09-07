-- HeiTuva 0044 — Q21, Q22, Q23: pause, the custom cadence's settings, and a
-- viewer's right to see that a survey repeats.
--
-- Separate from 0043 because 0043 ADDS the enum values this file USES. See the
-- comment at the top of that file before merging them; the failure it prevents
-- appears only on a fresh reset and reads like a typo in an unrelated CASE arm.

-- 1. Q22 — pause ------------------------------------------------------------
alter table public.schedules
  add column if not exists paused_at timestamptz;

comment on column public.schedules.paused_at is
  'DECISIONS Q22. Non-null = the series is paused: the scheduler skips it, and '
  'the OPEN ROUND STAYS OPEN — pausing a series is not closing the round '
  'someone is answering. Clearing it recomputes next_run_at (trigger below). '
  'Stopping is active = false, which the UI does not undo.';

-- 2. Q20 — what a custom cadence actually is ---------------------------------
--    The bundle's editor (NEW:2183-2195) is «Hver [n] [dag(er)|uke(r)|
--    måned(er)] [ukedag] [klokkeslett]». The hour is `send_at_local`, which
--    already exists; the other three are new.
alter table public.schedules
  add column if not exists custom_every int,
  add column if not exists custom_unit text,
  add column if not exists custom_weekday int;

alter table public.schedules drop constraint if exists schedules_custom_shape;
alter table public.schedules add constraint schedules_custom_shape check (
  -- All three together or none of them. A half-configured custom cadence has no
  -- interval to compute, and the scheduler would fall through to a default —
  -- which is the class of bug this migration is also fixing below.
  --
  -- THE `is not null` CONJUNCTS ARE LOAD-BEARING, and the test found that the
  -- hard way. Written without them, `{every: 3, unit: null, weekday: null}`
  -- evaluates to `true AND NULL AND NULL` = NULL — and a CHECK constraint
  -- ACCEPTS null, because it only refuses on an explicit false. Half a custom
  -- cadence sailed through a constraint written to stop exactly that. Three-
  -- valued logic is the reason to state nullness rather than imply it.
  (custom_every is null and custom_unit is null and custom_weekday is null)
  or (custom_every is not null and custom_unit is not null and custom_weekday is not null
      and custom_every between 1 and 52
      and custom_unit in ('days', 'weeks', 'months')
      -- Monday–Friday, as the bundle's selector offers (NEW:2192). A survey
      -- that lands on a Saturday is a survey nobody answers until Monday.
      and custom_weekday between 1 and 5)
);

alter table public.schedules drop constraint if exists schedules_custom_requires_settings;
alter table public.schedules add constraint schedules_custom_requires_settings check (
  cadence <> 'custom' or custom_every is not null
);

-- 3. Q23 — a viewer may READ the schedule ------------------------------------
--    ONE POLICY CHANGES. Migration 0030 already split `schedules_all` into four
--    per-command policies, so this is a predicate swap on SELECT and nothing
--    else. The three write policies are restated here UNCHANGED, verbatim from
--    M:0030:118-120, so that a reader of this file can see what was left alone
--    without opening another migration — the risk in this change is a well-
--    meaning edit that widens more than one of them.
drop policy if exists schedules_all_sel on public.schedules;
create policy schedules_all_sel on public.schedules for select
  using (app.can_view_survey(survey_id));

drop policy if exists schedules_all_ins on public.schedules;
create policy schedules_all_ins on public.schedules for insert
  with check (app.can_edit_survey(survey_id));
drop policy if exists schedules_all_upd on public.schedules;
create policy schedules_all_upd on public.schedules for update
  using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
drop policy if exists schedules_all_del on public.schedules;
create policy schedules_all_del on public.schedules for delete
  using (app.can_edit_survey(survey_id));

comment on policy schedules_all_sel on public.schedules is
  'DECISIONS Q23: a viewer reads the schedule, so a leser sees the ↻ chip. The '
  'whole row, because it carries operational settings and NO results — if this '
  'table ever gains a field derived from responses, that decision is revisited '
  'rather than the field waved through. Writes stay on can_edit_survey.';

-- 4. One place that knows how long a cadence is ------------------------------
--    `app.run_due_schedules` carried its own CASE with four arms and an
--    `else interval '7 days'` (M:0027:359), so `annual` — a value that has been
--    in the enum since M:0001:20 — re-sent every seven days. Nobody noticed
--    because no seeded survey is annual and the sweep is hourly cron.
--
--    Extracted rather than extended: `app.enqueue_reminders` and any future
--    caller need the same answer, and a second copy of this CASE is how the
--    first one came to disagree with the enum.
create or replace function app.cadence_interval(
  p_cadence app.cadence,
  p_every int default null,
  p_unit text default null
) returns interval
language sql immutable set search_path = '' as $$
  select case p_cadence
    when 'weekly'    then interval '7 days'
    when 'biweekly'  then interval '14 days'
    when 'monthly'   then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'biannual'  then interval '6 months'
    when 'annual'    then interval '1 year'
    when 'biennial'  then interval '2 years'
    when 'custom'    then coalesce(greatest(p_every, 1), 1) * case p_unit
                            when 'days'   then interval '1 day'
                            when 'weeks'  then interval '7 days'
                            when 'months' then interval '1 month'
                            else interval '7 days' end
    -- 'once' has no next run. NULL rather than a default, so a caller that
    -- forgets to check gets a null next_run_at (never due) instead of a series
    -- that quietly repeats a survey the customer asked to send once.
    else null
  end
$$;

comment on function app.cadence_interval(app.cadence, int, text) is
  'How long one cadence step is. The single definition — the copy inside '
  'run_due_schedules had four arms and defaulted the rest to seven days, which '
  'made an annual survey re-send weekly.';

-- 5. Q22 — resume recomputes the next run ------------------------------------
--    Not "now + cadence": a Monday-morning survey would drift to whatever day
--    somebody happened to unpause it. Not the stale pre-pause timestamp either:
--    a series paused over a holiday would fire the instant it came back, which
--    is the opposite of what pausing was for.
--
--    So: the same weekday it was already running on, at `send_at_local`, in the
--    future. The weekday comes from `custom_weekday` when the customer chose
--    one, and otherwise from the pre-pause `next_run_at`.
--
--    LIMIT, stated rather than papered over: `send_at_local` is a bare `time`
--    and this schema models no organisation timezone, so it is treated as UTC —
--    the same assumption the rest of the scheduler already makes by computing
--    `now() + interval`. This is the first place the column is honoured at all.
--    Making the whole pipeline timezone-aware is a change to the send path, not
--    to pause, and is logged rather than smuggled in here.
create or replace function app.resume_schedule()
returns trigger
language plpgsql set search_path = '' as $$
declare
  v_weekday int;
  v_next timestamptz;
begin
  if old.paused_at is null or new.paused_at is not null then
    return new;
  end if;

  -- Resumed. Keep the weekday, move to the next future occurrence of it.
  v_weekday := coalesce(
    new.custom_weekday,
    extract(isodow from old.next_run_at)::int,
    extract(isodow from now())::int
  );

  v_next := (date_trunc('day', now() at time zone 'UTC')
             + coalesce(new.send_at_local, '09:00'::time)) at time zone 'UTC';
  -- Walk forward to the weekday, then past now(). At most 7 + 1 steps.
  while extract(isodow from v_next)::int <> v_weekday or v_next <= now() loop
    v_next := v_next + interval '1 day';
  end loop;

  new.next_run_at := v_next;
  return new;
end $$;

drop trigger if exists schedules_resume on public.schedules;
create trigger schedules_resume
  before update on public.schedules
  for each row execute function app.resume_schedule();

-- 6. The sweep: skip paused series, and use the one interval definition -------
create or replace function app.run_due_schedules()
returns int
language plpgsql security definer set search_path = '' as $$
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
           next_run_at = now() + app.cadence_interval(cadence, custom_every, custom_unit),
           active = case when runs_total = 0 then true
                         else runs_done + 1 < runs_total end
     where id = v_s.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
