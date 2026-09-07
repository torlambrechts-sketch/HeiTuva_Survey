-- HeiTuva 0041 — a group with no answers is not a group with a null average.
--
-- Found by V1-2's first organisation-survey fixture, which is the first survey
-- in this schema to run at k = 0.
--
-- Three places build a result cell as
--
--     case when coalesce(st.n, 0) >= v_k then {n, avg} else {insufficient_data} end
--
-- and the coalesce is the bug. It exists to treat "no stats row" as zero, and
-- at every threshold this schema has ever had that landed in the else arm
-- (0 >= 3 is false). At v_k = 0 -- which app.k_for returns for an organisation
-- survey, because attribution is the point and there is no threshold -- the
-- test reads 0 >= 0, so a group that produced NO stats row at all takes the
-- "here is your number" branch and emits {"n": null, "avg": null}.
--
-- That shape is not in the contract. TeamRow and TrendPoint in
-- lib/results/types.ts are {n: number; avg: number} | Gated, and the comment at
-- the top of that file says why the union is written out by hand: "a cell is
-- EITHER a number or a refusal, and there is no third state where avg is
-- present but meaningless." The database was producing exactly that third
-- state, so the screen called .toFixed on null and every results page for an
-- organisation survey died with a digest and no message.
--
-- The fix is to say what was meant: a stats row must EXIST and clear the
-- threshold. Nothing changes at k >= 3, where the coalesce was already
-- unreachable -- this only affects the k = 0 path, and it restores the union
-- rather than widening it.
--
-- NOT a disclosure bug: the else arm withholds, so the wrong branch showed NULL
-- rather than someone else's data. It is a correctness and availability bug,
-- and it is fixed in the database because the shape is the database's promise.
--
-- Both functions are replaced verbatim from their applied definitions with the
-- three conditions changed, so this migration carries no other edit.

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
           case when st.n is not null and st.n >= v_k
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
           case when prev.n is not null and prev.n >= v_k
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
                    'status', ro.status, 'insufficient_data', true)
           end order by ro.round_no), '[]'::jsonb)
    into v_points
  from rounds ro
  left join stats st on st.rid = ro.id;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey, 'points', v_points);
end $function$;
