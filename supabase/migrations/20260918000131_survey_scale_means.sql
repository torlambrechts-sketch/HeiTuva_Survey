-- M:0131 — the survey list's «Snitt» column, k-gated.
--
-- v8 adds a «Snitt» column to the Undersøkelser table. ITS OWN DERIVATION IS
-- NOT REPRODUCIBLE HERE. The bundle's `scoreOf` (v8:8245) is
--
--     sv.questions.forEach(q => { if (q.type !== "scale") return;
--       sv.responses.forEach(r => { ... sum += v; n++; }); });
--     return n ? (sum / n) : "—";
--
-- — every scale answer summed and divided, with «—» only when the survey has no
-- scale question at all. There is no threshold anywhere in it, so a survey with
-- ONE response would publish that respondent's mean on a list row. The drawing
-- gates averages elsewhere (v8:10116 `avg: below ? "—"`, v8:7544
-- `under: gr < pol.threshold`); the survey row is the one place it forgets.
-- CLAUDE.md's tie-breaker decides it: this file wins on security, the bundle
-- wins on visuals. So the number is the bundle's and the gate is ours.
--
-- ── THE K TREATMENT IS APP.AGGREGATE_ROWS', NOT A NEW ONE ───────────────────
--
-- `app.aggregate_rows` (M:0068) gates PER QUESTION: it counts distinct
-- responses carrying an answer to that question, and where that count is below
-- `app.k_for(survey)` it emits `insufficient_data` with `n` NULL — never the
-- count. This function reuses exactly that predicate and exactly that `avg`
-- expression, so the two cannot drift into two different answers about the same
-- question. A survey's mean is then the mean OF THE QUESTION MEANS that
-- survived the gate.
--
-- Mean-of-means rather than pooling every answer, and the reason is the gate:
-- pooling would let a below-threshold question's answers into the total through
-- the back door, which is the disclosure the per-question gate exists to
-- refuse. Every input to this average is a figure `aggregate_results` would
-- already publish on its own.
--
-- ── THE POPULATION IS `scale` ALONE, AND THAT IS MEASURED, NOT INHERITED ────
--
-- The gate is app.aggregate_rows'; the POPULATION is not. That function's `avg`
-- covers `scale`, `enps` and `slider` because it reports each question
-- separately, where a mean only ever has to be comparable with itself. A
-- SURVEY-level mean averages those means together, and the three do not share a
-- range. Measured on the demo data:
--
--     scale    396 answers   values 1 .. 9
--     enps      15 answers   values 3 .. 10
--     slider     7 answers   values 20 .. 74
--
-- Written over all three, one demo survey came out at 19,4 — a number on a
-- 1-5 column, produced by averaging a slider into it. The drawing's own
-- population is the narrow one (`if (q.type !== "scale") return`, v8:8245), and
-- it is the only one where this arithmetic means anything. So the type list
-- here is `scale`, and it is NOT a copy of aggregate_rows' list: count over the
-- population the name says.
--
-- NULL when no question qualifies — because the survey has no scale-family
-- question, or because none of them reached the threshold. The caller renders
-- `lib/results/present.ts`'s DASH for that, and the two cases are deliberately
-- INDISTINGUISHABLE to the client: «this survey has no scale questions» and
-- «too few people have answered» must look the same, or the em dash itself
-- becomes a signal about how many people answered. Invariant 1 condition 4 —
-- a below-threshold cell never exposes its actual n — read one level out.
--
-- Organisation surveys are unaffected by design: `app.k_for` returns 0 for
-- them, so every question qualifies and the mean is the plain mean. Attribution
-- is the point there, not anonymity.
--
-- Org-scoped by `app.is_org_member` like `public.survey_response_counts`, whose
-- shape this follows: one batched call for the whole list rather than one call
-- per row. `set search_path = ''` keeps the definer body from resolving an
-- unqualified name against a caller-controlled schema, so every name below is
-- schema-qualified.
create or replace function public.survey_scale_means(p_org uuid)
returns table (survey_id uuid, mean numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with qualifying as (
    select
      q.survey_id,
      -- The per-question mean, character-for-character app.aggregate_rows'
      -- expression: the jsonb scalar coerced through its text form, and only
      -- where the stored value is a number or a numeric string.
      (select round(avg((a.value #>> '{}')::numeric), 2)
         from public.responses r
         join public.answers a on a.response_id = r.id and a.question_id = q.id
         join public.survey_rounds sr on sr.id = r.round_id
        where sr.survey_id = q.survey_id
          and jsonb_typeof(a.value) in ('number','string')) as q_avg
    from public.survey_questions q
    join public.surveys s on s.id = q.survey_id
    where s.org_id = p_org
      and s.deleted_at is null
      and q.type = 'scale'
      -- THE GATE. Distinct responders to THIS question, against THIS survey's
      -- effective threshold. `>=` because app.aggregate_rows refuses on `<`.
      and (
        select count(distinct r.id)
          from public.responses r
          join public.answers a on a.response_id = r.id and a.question_id = q.id
          join public.survey_rounds sr on sr.id = r.round_id
         where sr.survey_id = q.survey_id
      ) >= app.k_for(q.survey_id)
  )
  -- Every survey in the organisation appears, so a caller can tell «no row for
  -- this survey» from «this survey has no publishable mean» without a second
  -- query: the left join gives NULL, and NULL is the em dash.
  select s.id, round(avg(qu.q_avg), 1)
  from public.surveys s
  left join qualifying qu on qu.survey_id = s.id
  where s.org_id = p_org
    and s.deleted_at is null
    and app.is_org_member(p_org)
  group by s.id
$$;

comment on function public.survey_scale_means(uuid) is
  'Per-survey mean of the `scale` question means, gated exactly as '
  'app.aggregate_rows gates: a question below app.k_for(survey) contributes '
  'nothing and is never counted. NULL where no question qualifies, and the '
  '"no scale questions" and "too few answers" cases are deliberately '
  'indistinguishable. Feeds the Undersokelser list''s Snitt column (v8).';

-- Signed-in members only. Supabase grants EXECUTE to anon by default at CREATE
-- time, and `revoke ... from anon` alone would leave standing the grant anon
-- INHERITS from PUBLIC — the enumeration this project has now written down
-- three times (M:0013, CLAUDE.md row 3, and again at M:0101/M:0102). The
-- catalogue is what settles it, and tests/db/survey-scale-means.test.ts reads
-- has_function_privilege back rather than trusting this line.
revoke all on function public.survey_scale_means(uuid) from public, anon;
grant execute on function public.survey_scale_means(uuid) to authenticated;
