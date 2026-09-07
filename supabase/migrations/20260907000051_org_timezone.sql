-- V1-6 · DECISIONS Q50 — which clock a scheduled send runs on.
--
-- THE DEFECT WAS SILENT AND SEASONAL. `schedules.send_at_local` is a bare
-- `time` and this schema modelled no timezone at all, so every scheduled send
-- ran on UTC: a Norwegian customer who chose «09:00» was sent at 10:00 in
-- winter and 11:00 in summer. Nothing in the product said UTC, and «09:00» was
-- displayed back exactly as typed — so it presented as intermittent rather than
-- systematic, and the customer reporting "the pulse used to arrive first thing
-- and now it comes mid-morning" was describing a correct system.
--
-- THE MODEL IS THE DECISION: timezone on the ORGANISATION, not per group.
-- Per-group timezone is not a bigger version of this; it is a different feature
-- wearing a timezone costume. A schedule belongs to a survey and a round is ONE
-- send at ONE instant, so per-group clocks require the sweep to fan a schedule
-- out into per-group runs — which changes what a round IS, and a round is the
-- unit k-anonymity, `get_trends`, the rounds panel and every snapshot are built
-- on. A customer with staff across several countries wants per-group ROUNDS,
-- decided on its own terms.

alter table public.organizations
  add column if not exists timezone text not null default 'Europe/Oslo';

comment on column public.organizations.timezone is
  'Q50: the clock a scheduled send runs on. An IANA zone name, never an offset '
  '— an offset is right for half the year, which is the intermittent behaviour '
  'this column exists to remove. Defaults to Europe/Oslo: Oslo, Stockholm and '
  'Copenhagen share an offset all year, so one column is exact for most Nordic '
  'customers and at most an hour out for a Finnish office, against the '
  'two-hour seasonally-varying error it replaces.';

-- A zone name PostgreSQL does not know would fail at SEND time, inside the
-- scheduler, at whatever hour the sweep runs — the worst place to discover it.
-- This moves the failure to the write.
--
-- A TRIGGER AND NOT A CHECK, for the second time in this repo: a CHECK may not
-- contain a subquery ("cannot use subquery in check constraint"), and zone
-- validity is a lookup in `pg_timezone_names`. V1-4 met the same wall on
-- `dashboard_layouts` and answered it with jsonpath because the rule was about
-- the row's own shape; this rule is about another table, so a function is the
-- only form available. Written down because the first reaction both times was
-- to write the CHECK.
create or replace function app.timezone_known()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.timezone is null
     or not exists (select 1 from pg_timezone_names z where z.name = new.timezone) then
    raise exception 'organizations.timezone: % is not an IANA zone name', new.timezone
      using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function app.timezone_known() from public, anon;

drop trigger if exists organizations_timezone on public.organizations;
create trigger organizations_timezone
  before insert or update of timezone on public.organizations
  for each row execute function app.timezone_known();

-- ONE HELPER, and the sweep in `tests/db/recurrence.test.ts` is what keeps it
-- one. V1-3's interval CASE existed in THREE places and one disagreed with the
-- enum; the decision named three sites for `next_run_at` and required a single
-- helper, and the test derives the set of sites from the catalogue rather than
-- from anyone's memory — a fourth site added later is caught by the query.
--
-- `at time zone` TWICE is the whole point and is not a typo. The inner one
-- reads the local wall-clock date-and-time as a moment IN THAT ZONE; there is
-- no offset stored anywhere, so a January call and a July call resolve
-- differently and correctly. A stored `+01:00` would pass every test taken in
-- January, which is why the test that proves this crosses a DST boundary.
create or replace function app.local_send_at(
  p_date date,
  p_time time,
  p_zone text
) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((p_date + coalesce(p_time, '09:00'::time)) at time zone coalesce(p_zone, 'Europe/Oslo'))
$$;

-- GRANTED to the roles that update `schedules`, and the reason is a defect this
-- migration produced before it fixed it. `app.resume_schedule()` is a plain
-- trigger function, NOT security definer — so the helper runs as the CALLER.
-- Revoking it from everything made every resume fail with "permission denied
-- for function local_send_at", and PostgREST reported that as an error the test
-- was not reading: the row simply did not change, which looks exactly like a
-- trigger that decided not to act.
--
-- Granting rather than making the trigger DEFINER is the conservative half: the
-- org lookup stays under RLS, and a caller who cannot see the survey's
-- organisation cannot reach this trigger at all, because `schedules`' own
-- policies stopped them first. The helper itself is pure arithmetic over its
-- three arguments and reads nothing, so executing it reveals nothing.
revoke all on function app.local_send_at(date, time, text) from public, anon;
grant execute on function app.local_send_at(date, time, text) to authenticated, service_role;

comment on function app.local_send_at(date, time, text) is
  'Q50: the ONE place a local wall-clock send time becomes an instant. Every '
  'site that computes next_run_at from send_at_local goes through it, and '
  'tests/db/recurrence.test.ts derives that set from pg_proc rather than '
  'trusting a list — the same sweep shape that found the third copy of the '
  'interval CASE in V1-3.';

-- Site 1 of 3: resume ------------------------------------------------------
create or replace function app.resume_schedule()
returns trigger
language plpgsql set search_path = '' as $$
declare
  v_weekday int;
  v_next timestamptz;
  v_zone text;
begin
  if old.paused_at is null or new.paused_at is not null then
    return new;
  end if;

  select o.timezone into v_zone
    from public.surveys s join public.organizations o on o.id = s.org_id
   where s.id = new.survey_id;

  -- Resumed. Keep the weekday, move to the next future occurrence of it.
  v_weekday := coalesce(
    new.custom_weekday,
    extract(isodow from old.next_run_at)::int,
    extract(isodow from now())::int
  );

  -- Q50: the day is the organisation's today, not UTC's. At 23:30 in Oslo in
  -- winter those are different dates, and starting from UTC's would put the
  -- first resumed send a day early.
  v_next := app.local_send_at(
    (now() at time zone coalesce(v_zone, 'Europe/Oslo'))::date,
    new.send_at_local,
    v_zone
  );
  -- Walk forward to the weekday, then past now(). At most 7 + 1 steps.
  -- Adding days to a timestamptz crosses a DST boundary correctly: the wall
  -- clock is preserved, which is what a customer means by "every Monday at 9".
  while extract(isodow from v_next at time zone coalesce(v_zone, 'Europe/Oslo'))::int <> v_weekday
        or v_next <= now() loop
    v_next := app.local_send_at(
      ((v_next at time zone coalesce(v_zone, 'Europe/Oslo'))::date + 1),
      new.send_at_local,
      v_zone
    );
  end loop;

  new.next_run_at := v_next;
  return new;
end $$;
