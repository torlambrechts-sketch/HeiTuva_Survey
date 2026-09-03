-- Per-survey response counts for the Undersøkelser list and its progress bars.
--
-- CLAUDE.md invariant 1: clients never select from `responses` or `answers`,
-- and no select policy exists for them. That applies to an aggregate embed too
-- — `responses(count)` from the anon client is not an error, it silently
-- returns 0, which would have rendered every survey at 0 % forever.
--
-- So the count comes from a SECURITY DEFINER function instead. What it exposes
-- is participation, not results: how many people answered, never what any of
-- them said. The k>=5 gate governs result cells, and the design reports exact
-- participation on purpose ("Hvem ble spurt, hvor mange svarte",
-- seed report_section_types.participation) — a response total cannot identify
-- a respondent or reveal an answer.
--
-- Org-scoped by `app.is_org_member`, so a member of one organisation cannot
-- count another's responses, and `set search_path = ''` keeps the definer body
-- from resolving an unqualified name against a caller-controlled schema.
create or replace function public.survey_response_counts(p_org uuid)
returns table (survey_id uuid, responses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  -- A response belongs to a round, never directly to a survey: rounds freeze
  -- their own question set, and the indirection is what lets a survey run
  -- repeatedly without a response pointing at anything mutable. So the count
  -- goes through survey_rounds.
  select s.id, count(r.id)
  from public.surveys s
  left join public.survey_rounds ro on ro.survey_id = s.id
  left join public.responses r on r.round_id = ro.id
  where s.org_id = p_org
    and s.deleted_at is null
    and app.is_org_member(p_org)
  group by s.id
$$;

-- Signed-in members only. `anon` must never reach this: the respondent surface
-- has no business counting an organisation's responses, and Supabase grants
-- EXECUTE to anon by default at CREATE time, so revoke before granting.
revoke all on function public.survey_response_counts(uuid) from public, anon;
grant execute on function public.survey_response_counts(uuid) to authenticated;
