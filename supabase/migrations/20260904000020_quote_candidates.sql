-- HeiTuva 0031 — the quote picker gets a read path that hands out ids, not text.
--
-- The design's picker (HeiTuva.dc.html:1202-1216, `repQuotes`) stores the chosen
-- quote STRING in report state. Storing it that way here would put respondent
-- free text into `reports`, behind every future read path on that table, and it
-- would survive the retention job whose entire purpose is to delete it. So the
-- picker stores ANSWER IDS and the text is re-fetched at render — which means
-- the k-gate runs again on every render rather than once at pick time.
--
-- `get_quotes` cannot serve the picker: it deliberately returns text only, with
-- no id, so nothing it hands out can be stored and re-resolved. This is its
-- sibling for the one caller that needs a handle. The extra thing it exposes is
-- an opaque uuid; it still carries no author, no group label, no timestamp, and
-- no `response_id`, so two ids cannot be joined back into one person's answers.
--
-- Authority is narrower than `get_quotes`, not the same: picking quotes is an
-- editorial act on unaggregated free text, so it is administrator/redaktør. A
-- leser reads aggregates and never named free text (CLAUDE.md role semantics),
-- and there is no group-filter exception to argue about because a leser cannot
-- call this at all.
create or replace function public.quote_candidates(
  p_survey uuid,
  p_group  uuid default null,
  p_rounds uuid[] default null,
  p_limit  int default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_k   int := app.k_threshold();
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not app.has_role(v_org, array['administrator','redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  return jsonb_build_object(
    'k', v_k,
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'answer_id', c.answer_id,
               'question_id', c.question_id,
               'text', c.txt) order by c.ord)
        from (
          select a.id as answer_id,
                 q.id as question_id,
                 a.value #>> '{}' as txt,
                 md5(a.id::text) as ord
            from public.answers a
            join public.responses r on r.id = a.response_id
            join public.survey_rounds sr on sr.id = r.round_id
            join public.survey_questions q on q.id = a.question_id
           where sr.survey_id = p_survey
             and q.type::text = 'text'
             and (p_rounds is null or cardinality(p_rounds) = 0 or r.round_id = any (p_rounds))
             and (p_group is null or r.respondent_group_id = p_group)
             and a.value is not null and btrim(a.value #>> '{}') <> ''
             -- Per QUESTION, like every other cell: a question with fewer than
             -- k written answers is withheld whole. Counting across questions
             -- would let one answer to a rarely-answered question ride in on
             -- another question's volume.
             and (select count(*)
                    from public.answers a2
                    join public.responses r2 on r2.id = a2.response_id
                    join public.survey_rounds sr2 on sr2.id = r2.round_id
                   where sr2.survey_id = p_survey
                     and a2.question_id = q.id
                     and (p_rounds is null or cardinality(p_rounds) = 0
                          or r2.round_id = any (p_rounds))
                     and (p_group is null or r2.respondent_group_id = p_group)
                     and a2.value is not null and btrim(a2.value #>> '{}') <> ''
                 ) >= v_k
           -- Never chronological, for the same reason get_quotes is not: order
           -- of submission is a correlation channel. md5 of the id is stable
           -- across renders, which random() is not, and the picker needs the
           -- list not to reshuffle under the user's cursor.
           order by md5(a.id::text)
           limit greatest(1, least(coalesce(p_limit, 6), 50))
        ) c), '[]'::jsonb));
end $$;

revoke all on function public.quote_candidates(uuid, uuid, uuid[], int) from public, anon;
grant execute on function public.quote_candidates(uuid, uuid, uuid[], int) to authenticated;

comment on function public.quote_candidates(uuid, uuid, uuid[], int) is
  'Free-text answers offered to the report quote picker, as (answer_id, text) '
  'pairs so the report can store ids and re-resolve them under the k-gate at '
  'render. administrator/redaktor only; k-gated per question; no author, no '
  'group, no timestamp, no response_id.';
