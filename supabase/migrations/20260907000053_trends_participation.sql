-- V1-6 fix pass · `n` on a trend point is PARTICIPATION, one meaning everywhere.
--
-- Found by the V1-6 verification pass, through a stale D94 assertion. Migration
-- 0050 (Q49) put `n` on a gated point, and the count it put there was the stats
-- CTE's `count(distinct r.id)` over responses JOINED TO ANSWERS on scale-type
-- questions with a numeric value. That is the right denominator for an average
-- and the wrong one for participation, and 0050's own comment asserted the
-- opposite in as many words: "a round the filtered group did not answer has no
-- stats row at all ... 0 is a true count of people". It is a true count of
-- people only when the reason for the missing stats row is that nobody
-- responded. When the reason is that the people who responded skipped every
-- scale question, the panel said 0 while four people had taken part.
--
-- Zero is the worst available wrong answer, because it is the SAME NUMBER this
-- function uses to say "nobody took part". CLAUDE.md's rule — never render a
-- value derived from an unknown denominator — is exactly this case, and the
-- fixtures hid it: every existing arrangement had each respondent answer every
-- question, so the two counts coincided in all of them.
--
-- THE FIX IS NOT A SECOND COUNT, IT IS ONE MEANING. `results_summary` already
-- counts `n` without touching `answers` (M:0041:60-66, the count of responses
-- in scope) and so does `overview_activity`. `get_trends` was the only function
-- in this schema where `n` meant "people who answered a scale question", and on
-- a single-round survey that put two different counts for the same round on the
-- same screen -- the stat card's and the bar's. So `n` becomes participation on
-- BOTH branches and agrees with every other surface, rather than meaning one
-- thing when gated and another when not.
--
-- THE GATE DOES NOT MOVE, and this is the part to read twice. `avg` is derived
-- from the people who answered the scale question, so the k-test must stay on
-- THAT count: a round with twelve responses of which four answered the scale is
-- gated at k=5, because an average of four people is an average of four people
-- however many were invited. Gating on participation would disclose it. The
-- gate keeps reading `st.n`; only what is EMITTED changes.
--
-- Q49's narrowing is untouched: the gated arm still carries the count and
-- nothing derived, enforced as a closed key set in
-- tests/invariants/k-surface.test.ts.
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
  -- How many PEOPLE took part in this round, after the group filter and after
  -- nothing else. No join to `answers`: what they said is not this number's
  -- business, which is precisely why Q28 lets it through the threshold.
  -- `count(*)` rather than `count(distinct r.id)` because without the answers
  -- join there is exactly one row per response already.
  took_part as (
    select r.round_id as rid, count(*)::int as n
    from public.responses r
    join rounds ro on ro.id = r.round_id
    where (p_group is null or r.respondent_group_id = p_group)
    group by 1
  ),
  -- The people behind the AVERAGE. This is the k-gate's subject and nothing
  -- else reads it: it is emitted nowhere, and if it is ever emitted again it
  -- must not be called `n`.
  stats as (
    select r.round_id as rid,
           count(distinct r.id)::int as scale_n,
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
           case when st.scale_n is not null and st.scale_n >= v_k
             then jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status, 'n', coalesce(tp.n, 0), 'avg', st.avg)
             else jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status,
                    -- DECISIONS Q49 (V1-6): the COUNT survives its own
                    -- threshold, and it is the count of people who took part.
                    -- `coalesce(tp.n, 0)` is a true zero here and only here: no
                    -- row in `took_part` means no response row in the round at
                    -- all, which is nobody.
                    'n', coalesce(tp.n, 0),
                    'insufficient_data', true)
           end order by ro.round_no), '[]'::jsonb)
    into v_points
  from rounds ro
  left join stats st on st.rid = ro.id
  left join took_part tp on tp.rid = ro.id;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey, 'points', v_points);
end $function$

;
