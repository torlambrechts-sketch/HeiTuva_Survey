-- HeiTuva 0035 — Q47: an organisation respondent learns nothing about the
-- other organisations (DECISIONS Q47, confirmed 2026-09-06; v1 conflict C1).
--
-- `app.k_for` returns 0 for an organisation survey — attribution is the whole
-- point of that respondent type, so there is no threshold to clear. The
-- thank-you screen's peer panel gated on exactly that number, so
-- `get_peer_results` handed a supplier the distribution of its COMPETITORS'
-- answers. Reproduced against this schema before the fix:
--
--   select public.get_peer_results('probe-tok-a');
--   {"n": 1, "type": "scale", "buckets": [{"count": 1, "value": 3}], ...}
--
-- That is disclosure between competitors, not a display choice, so the rule
-- lives HERE and not in the component: the function is anon-executable by
-- design (the respondent has no session), so a client that renders nothing
-- still leaves the payload one HTTP call away. A screen cannot be the gate.
--
-- Placed before the `reveal_results` check deliberately. `reveal_results` is
-- the survey author's preference and it defaults to TRUE; the organisation
-- rule is not a preference, and must not be reachable by flipping one.
--
-- The k gate is untouched for person surveys — see the third test below, which
-- is what stops this from becoming "peer results off everywhere".
--
-- Three tests in tests/invariants/threshold-policy.test.ts were written first
-- and the first was proven failing against the old function
-- (scratchpad/redphase-q47.txt): the denial, a positive control that the
-- supplier's own submission is still readable on the paths that own it
-- (`get_survey_for_token`, `attributed_results`), and a positive control that
-- a person survey keeps its peer panel above the threshold.

CREATE OR REPLACE FUNCTION public.get_peer_results(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_res record;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_question record;
  v_k int;
  v_n int;
  v_buckets jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status <> 'live' then
    return jsonb_build_object('error', 'not_found');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id;
  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;
  v_k := app.k_for(v_survey.id);

  -- Q47. An organisation answers on behalf of a company and is promised
  -- attribution, never anonymity — so there is no threshold protecting the
  -- others' answers from this reader, and no aggregate to show it. The
  -- attributed view (`attributed_results`, administrator/redaktør only) is the
  -- one place those rows are read, by the organisation that ran the survey.
  if v_survey.respondent_kind = 'organisation' then
    return jsonb_build_object('hidden', true);
  end if;

  if coalesce((v_survey.engage ->> 'reveal_results')::boolean, false) is not true then
    return jsonb_build_object('hidden', true);
  end if;

  select (q ->> 'id')::uuid as id, q ->> 'text' as text, q ->> 'type' as type
    into v_question
    from jsonb_array_elements(v_round.question_snapshot) with ordinality as t(q, ord)
   where q ->> 'type' in ('scale', 'likert', 'smiley', 'enps', 'slider')
   order by ord
   limit 1;

  if v_question.id is null then
    return jsonb_build_object('hidden', true);
  end if;

  select count(*) into v_n
    from public.answers a
    join public.responses r on r.id = a.response_id
   where r.round_id = v_round.id
     and a.question_id = v_question.id
     and jsonb_typeof(a.value) = 'number';

  if v_n < v_k then
    return jsonb_build_object('insufficient_data', true, 'k', v_k, 'question', v_question.text);
  end if;

  select jsonb_agg(jsonb_build_object('value', value, 'count', c) order by value)
    into v_buckets
    from (
      select (a.value #>> '{}')::numeric as value, count(*) as c
        from public.answers a
        join public.responses r on r.id = a.response_id
       where r.round_id = v_round.id
         and a.question_id = v_question.id
         and jsonb_typeof(a.value) = 'number'
       group by 1
    ) b;

  return jsonb_build_object(
    'question', v_question.text, 'type', v_question.type,
    'n', v_n, 'buckets', coalesce(v_buckets, '[]'::jsonb));
end $function$;
