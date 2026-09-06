-- HeiTuva 0042 -- the same k = 0 shape, in the two places a sweep found it.
--
-- 0041 fixed results_summary and get_trends, which is where the crash surfaced.
-- Fixing a defect and not looking for its siblings is how the second one is
-- found by a customer, so the live catalogue was swept for the pattern:
--
--   select p.oid::regprocedure
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname in ('public','app') and p.prokind = 'f'
--      and pg_get_functiondef(p.oid) ~ 'coalesce\([a-z_.]+, *0\) *>= *v_k';
--
-- Two more: public.get_heatmap and public.get_benchmarks. Both are reachable.
--
--   * get_benchmarks takes v_k straight from app.k_for(p_survey), so it is 0 on
--     every organisation survey -- and the Resultater page reads benchmarks for
--     each survey it opens, attributed included.
--   * get_heatmap (and dashboard_summary, which is fine -- its comparison is a
--     WHERE, where a null n filters the row out rather than passing it) takes
--     max(app.k_for(...)) across the selected surveys, defaulting to 5. `max`
--     of nothing but organisation surveys is 0, so a dashboard filtered to a
--     supplier survey, or an organisation whose surveys are all attributed,
--     reaches it.
--
-- Same fix and same reasoning as 0041: a cell that claims a number must have
-- one, so require the value to EXIST as well as clear the threshold. Nothing
-- changes at k >= 3, where the coalesce was already unreachable.
--
-- Both functions are replaced verbatim from their applied definitions with the
-- three conditions changed, so this migration carries no other edit.

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
               case when n is not null and n >= v_k
                 then jsonb_build_object('question_id', question_id, 'n', n, 'avg', avg)
                 -- No n, no avg: the flag is the entire payload for a gated cell.
                 else jsonb_build_object('question_id', question_id, 'insufficient_data', true)
               end order by survey_id, ord)) as row
    from grid
    group by gid, label
  ) x;

  return jsonb_build_object('k', v_k, 'org_id', p_org, 'cols', v_cols, 'rows', v_rows);
end $function$;

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
        case when v_scale_n is not null and v_scale_n >= v_k
          then jsonb_build_object('metric_key', b.metric_key, 'scale', 'score_5',
                 'bench', b.value, 'source', b.source, 'mine', v_scale_avg, 'n', v_scale_n)
          else jsonb_build_object('metric_key', b.metric_key, 'scale', 'score_5',
                 'bench', b.value, 'source', b.source, 'insufficient_data', true)
        end
      when 'enps' then
        case when v_enps_n is not null and v_enps_n >= v_k
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
