-- HeiTuva 0011 — the thank-you screen's peer results (docs/DEVIATIONS.md D40).
--
-- The design shows a respondent how their colleagues answered, right after they
-- submit (HeiTuva.dc.html:2117-2135). That means an aggregate readable by
-- someone with no account — a genuinely new public surface on the most
-- sensitive data in the product — so it is built as narrowly as it can be
-- rather than by opening `aggregate_results` to `anon`:
--
--  * Token-scoped. The caller proves possession of an invitation or share-link
--    token for THIS round; there is no survey_id parameter to walk.
--  * One question. The first numeric question of the round, which is the one
--    the design charts. No question picker, so no way to sweep the survey.
--  * k-enforced in the same function, with the SAME threshold as every other
--    aggregate — app.k_threshold(), not a literal. Below it the function
--    returns `insufficient_data` and no counts at all, not even a total.
--  * Counts only. No free text, no group breakdown, no per-response anything.
--    `get_quotes` stays authenticated-only; this cannot reach it.
--
-- What it deliberately does NOT do: reveal whether the caller's own answer is
-- in the total. The count is the round's, and a respondent who has not yet
-- submitted sees the same numbers as one who has.

create or replace function public.get_peer_results(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hash text := app.hash_token(p_token);
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_question record;
  v_k int := app.k_threshold();
  v_n int;
  v_buckets jsonb;
begin
  -- Same resolution as get_survey_for_token: an invitation, or an active share
  -- link. An expired or unknown token resolves to nothing and gets nothing.
  select r.* into v_round
    from public.survey_rounds r
    join public.survey_invitations i on i.round_id = r.id
   where i.token_hash = v_hash and (i.expires_at is null or i.expires_at > now());
  if v_round.id is null then
    select r.* into v_round
      from public.survey_rounds r
      join public.share_links l on l.round_id = r.id
     where l.token_hash = v_hash and l.active;
  end if;
  if v_round.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;

  -- Only when the survey was built to show them. `reveal_results` is the
  -- Builder's own switch ("Del resultatene etterpå"), so a customer who did not
  -- opt in never exposes an aggregate here at all.
  if coalesce((v_survey.engage ->> 'reveal_results')::boolean, false) is not true then
    return jsonb_build_object('hidden', true);
  end if;

  -- The first numeric question in the round's frozen snapshot. Numeric because
  -- a bar chart of free text is not a thing, and the snapshot because that is
  -- what the respondent was actually asked.
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

  -- Below the threshold nothing is returned but the fact of it. Returning `n`
  -- here would leak "four people have answered", which on a small team is
  -- itself information about who.
  if v_n < v_k then
    return jsonb_build_object(
      'insufficient_data', true, 'k', v_k,
      'question', v_question.text);
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
    'question', v_question.text,
    'type', v_question.type,
    'n', v_n,
    'buckets', coalesce(v_buckets, '[]'::jsonb));
end $$;

-- Anonymous by necessity: the caller is a respondent who has just submitted and
-- has no session. The token is the authorisation, and the k-gate above is what
-- makes that safe.
revoke all on function public.get_peer_results(text) from public;
grant execute on function public.get_peer_results(text) to anon, authenticated;
