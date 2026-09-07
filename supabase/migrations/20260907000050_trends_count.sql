-- V1-6 · DECISIONS Q49 — a round's response COUNT survives its own threshold.
--
-- Before this, a gated point carried `{round_id, round_no, opens_at, closes_at,
-- status, insufficient_data}` and the rounds panel drew an em dash. Q28 permits
-- the count: a count of PEOPLE is participation, and the line is the subject of
-- the number rather than its size. The panel was therefore showing LESS than
-- the rule allows — conservative, but conservative in a way that hid a fact the
-- reader is entitled to.
--
-- THE NARROWING IS THE DECISION (Tor). `n` for a gated round is the COUNT ONLY:
-- never accompanied by anything derived from what those people SAID (no `avg`,
-- no distribution, no top or bottom), and never a breakdown that turns two
-- counts into a difference. `tests/invariants/k-surface.test.ts` enforces it as
-- a CLOSED KEY SET on the gated payload, so a derived field arriving beside the
-- count fails a test rather than passing under a reason someone wrote once.
--
-- WHAT THIS IS NOT: an entry in Q28's `DO_NOT_GATE` list. That list names vault
-- readers which never call `app.k_for`; this function calls it and gates
-- everything derived behind it. The decision's own draft said otherwise and was
-- corrected before this migration was written — see DECISIONS.md Q49.
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
           case when st.n is not null and st.n >= v_k
             then jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status, 'n', st.n, 'avg', st.avg)
             else jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status,
                    -- DECISIONS Q49 (V1-6): the COUNT survives its own
                    -- threshold. Tor's narrowing is the decision, and the
                    -- shape of this line is where it lives: `n` and nothing
                    -- else derived. `coalesce(st.n, 0)` because a round the
                    -- filtered group did not answer has no stats row at all,
                    -- and NULL there would draw an em dash again — 0 is a true
                    -- count of people, which is exactly what Q28 permits.
                    'n', coalesce(st.n, 0),
                    'insufficient_data', true)
           end order by ro.round_no), '[]'::jsonb)
    into v_points
  from rounds ro
  left join stats st on st.rid = ro.id;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey, 'points', v_points);
end $function$

;
