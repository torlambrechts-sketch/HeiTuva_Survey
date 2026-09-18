-- REPAIR, 2026-09-07. Prod's stored `overview_activity` declared `i int`, which
-- the committed migration 20260904000013 explicitly does NOT — its own comment
-- says why: `for i in reverse ...` declares its own loop variable, and declaring
-- one here shadows it, which `supabase db lint` reports twice (shadowing, and
-- the unused declaration). Prod therefore carried a variant that never matched
-- the repository and would have failed Gate 1's lint against it.
--
-- Found by a normalised body-hash comparison of all 74 functions against local:
-- 29 differed raw (comments and whitespace only, expected) and exactly ONE
-- differed in substance. Re-applied verbatim from the committed file.
create or replace function public.overview_activity(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week_start   timestamptz := date_trunc('week', now());
  v_year_start   timestamptz := date_trunc('year', now());
  v_this_week    bigint;
  v_this_year    bigint;
  v_invited      bigint;
  v_responded    bigint;
  v_days         jsonb;
  v_streak       int := 0;
  v_weeks        jsonb;
  v_has          boolean;
  -- No `i` declared: `for i in reverse ...` declares its own integer loop
  -- variable, and declaring one here shadows it — `supabase db lint` reports
  -- both the shadowing and the now-unused declaration.
begin
  if not app.is_org_member(p_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select count(*) into v_this_week
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.surveys s on s.id = sr.survey_id
   where s.org_id = p_org and s.deleted_at is null
     and r.submitted_hour >= v_week_start;

  select count(*) into v_this_year
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.surveys s on s.id = sr.survey_id
   where s.org_id = p_org and s.deleted_at is null
     and r.submitted_hour >= v_year_start;

  -- Response rate over every invitation the organisation has ever sent. Not
  -- "of those still open": a rate whose denominator shrinks as rounds close
  -- would climb on its own.
  select count(*), count(*) filter (where i.responded_at is not null)
    into v_invited, v_responded
    from public.survey_invitations i
    join public.survey_rounds sr on sr.id = i.round_id
    join public.surveys s on s.id = sr.survey_id
   where s.org_id = p_org and s.deleted_at is null;

  -- Seven days, oldest first, every day present even at zero — a bar chart
  -- that silently drops empty days would show a busy week that never happened.
  select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
    into v_days
    from generate_series(date_trunc('day', now()) - interval '6 days',
                         date_trunc('day', now()), interval '1 day') d
    left join lateral (
      select count(*) as n
        from public.responses r
        join public.survey_rounds sr on sr.id = r.round_id
        join public.surveys s on s.id = sr.survey_id
       where s.org_id = p_org and s.deleted_at is null
         and r.submitted_hour >= d
         and r.submitted_hour < d + interval '1 day'
    ) c on true;

  -- Eight weeks back, newest last, plus the run of consecutive weeks with any
  -- activity counting back from the current one.
  select jsonb_agg(jsonb_build_object('week', w::date, 'active', coalesce(c.n, 0) > 0) order by w)
    into v_weeks
    from generate_series(date_trunc('week', now()) - interval '7 weeks',
                         date_trunc('week', now()), interval '1 week') w
    left join lateral (
      select count(*) as n
        from public.responses r
        join public.survey_rounds sr on sr.id = r.round_id
        join public.surveys s on s.id = sr.survey_id
       where s.org_id = p_org and s.deleted_at is null
         and r.submitted_hour >= w
         and r.submitted_hour < w + interval '1 week'
    ) c on true;

  for i in reverse jsonb_array_length(v_weeks) - 1 .. 0 loop
    v_has := (v_weeks->i->>'active')::boolean;
    exit when not v_has;
    v_streak := v_streak + 1;
  end loop;

  return jsonb_build_object(
    'this_week', v_this_week,
    'this_year', v_this_year,
    'invited', v_invited,
    'responded', v_responded,
    -- NULL, not 0, when nothing has been sent. A 0 % response rate over zero
    -- invitations is a fabricated measurement (CLAUDE.md: never fabricate data
    -- in the UI), and the screen has an empty treatment for the unknown case.
    'completion', case when v_invited > 0
                       then round(v_responded::numeric * 100 / v_invited)
                       else null end,
    'days', coalesce(v_days, '[]'::jsonb),
    'weeks', coalesce(v_weeks, '[]'::jsonb),
    'streak_weeks', v_streak);
end $$;

revoke all on function public.overview_activity(uuid) from public, anon;
grant execute on function public.overview_activity(uuid) to authenticated;

comment on function public.overview_activity(uuid) is
  'Participation figures for Oversikt: counts of responses only, never answer '
  'values, and never broken down by group — per-group participation over time '
  'is the shape k-anonymity protects.';
