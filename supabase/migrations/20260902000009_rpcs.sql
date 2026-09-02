-- HeiTuva 0009 — security-critical RPCs
-- These are the ONLY paths that touch responses/answers.

-- 1) Public: resolve a token to a renderable survey (respondent surface) --------
create or replace function public.get_survey_for_token(p_token text, p_lang text default 'no')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hash text := app.hash_token(p_token);
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_inv public.survey_invitations;
begin
  select i.* into v_inv from public.survey_invitations i
    where i.token_hash = v_hash and (i.expires_at is null or i.expires_at > now());
  if v_inv.id is not null then
    select r.* into v_round from public.survey_rounds r where r.id = v_inv.round_id;
  else
    select r.* into v_round from public.survey_rounds r
      join public.share_links l on l.round_id = r.id
      where l.token_hash = v_hash and l.active;
  end if;
  if v_round.id is null or v_round.status <> 'open' then
    return jsonb_build_object('error','not_found_or_closed');
  end if;
  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;
  return jsonb_build_object(
    'survey_id', v_survey.id, 'round_id', v_round.id,
    'title', v_survey.title, 'org_id', v_survey.org_id,
    'anonymity', v_survey.anonymity, 'engage', v_survey.engage,
    'lang', p_lang, 'langs', v_survey.langs,
    'already_responded', (v_inv.id is not null and v_inv.responded_at is not null),
    'questions', v_round.question_snapshot);
end $$;

-- 2) Public: submit a response ------------------------------------------------
-- One transaction: validate token, mark participation, insert UNLINKED response.
create or replace function public.submit_response(
  p_token text, p_lang text, p_answers jsonb,   -- {question_id: {value, comment?, follow_up?}}
  p_anon_choice boolean default null             -- only meaningful for anonymity='optional'
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_hash text := app.hash_token(p_token);
  v_inv public.survey_invitations;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_mode app.anonymity_mode;
  v_response_id uuid;
  v_group uuid;
  v_link_invitation uuid;
  k text; v jsonb;
begin
  select i.* into v_inv from public.survey_invitations i
    where i.token_hash = v_hash and (i.expires_at is null or i.expires_at > now())
    for update;
  if v_inv.id is not null then
    select r.* into v_round from public.survey_rounds r where r.id = v_inv.round_id;
  else
    select r.* into v_round from public.survey_rounds r
      join public.share_links l on l.round_id = r.id
      where l.token_hash = v_hash and l.active;
  end if;
  if v_round.id is null or v_round.status <> 'open' then
    return jsonb_build_object('error','not_found_or_closed');
  end if;
  if v_inv.id is not null and v_inv.responded_at is not null then
    return jsonb_build_object('error','already_responded');
  end if;
  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;

  v_mode := case
    when v_survey.anonymity = 'optional' then
      case when coalesce(p_anon_choice, true) then 'anonymous'::app.anonymity_mode
           else 'named'::app.anonymity_mode end
    else v_survey.anonymity end;

  -- group survives, identity does not: copy group for team aggregation, drop the invitation link when anonymous
  v_group := v_inv.group_id;
  v_link_invitation := case when v_mode = 'anonymous' then null else v_inv.id end;

  insert into public.responses
    (round_id, anonymity_at_submission, invitation_id, respondent_group_id, lang, submitted_hour)
  values
    (v_round.id, v_mode, v_link_invitation, v_group, p_lang, date_trunc('hour', now()))
  returning id into v_response_id;

  for k, v in select * from jsonb_each(p_answers) loop
    insert into public.answers (response_id, question_id, value, comment, follow_up)
    values (v_response_id, k::uuid, v->'value', v->>'comment', v->>'follow_up');
  end loop;

  if v_inv.id is not null then
    update public.survey_invitations set responded_at = now() where id = v_inv.id;
  end if;
  if v_survey.status = 'utkast' then
    update public.surveys set status = 'aktiv' where id = v_survey.id;
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- 3) Aggregation with k>=5 gate ------------------------------------------------
create or replace function public.aggregate_results(
  p_survey uuid, p_group uuid default null, p_round uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid; v_out jsonb := '[]'::jsonb; v_q record; v_n int; v_k int := app.k_threshold();
begin
  select org_id into v_org from public.surveys where id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error','forbidden');
  end if;

  for v_q in
    select q.id, q.type, q.text, q.config from public.survey_questions q
    where q.survey_id = p_survey order by q.position
  loop
    select count(distinct r.id) into v_n
    from public.responses r
    join public.answers a on a.response_id = r.id and a.question_id = v_q.id
    join public.survey_rounds sr on sr.id = r.round_id
    where sr.survey_id = p_survey
      and (p_round is null or r.round_id = p_round)
      and (p_group is null or r.respondent_group_id = p_group);

    if v_n < v_k then
      v_out := v_out || jsonb_build_object('question_id', v_q.id, 'type', v_q.type,
        'text', v_q.text, 'insufficient_data', true, 'n', null);
      continue;
    end if;

    v_out := v_out || (
      select jsonb_build_object(
        'question_id', v_q.id, 'type', v_q.type, 'text', v_q.text, 'n', v_n,
        'distribution', coalesce(jsonb_agg(jsonb_build_object('value', d.val, 'count', d.cnt) order by d.val), '[]'::jsonb),
        'avg', case when v_q.type in ('scale','enps','slider') then
          (select round(avg((a.value #>> '{}')::numeric), 2)
             from public.responses r
             join public.answers a on a.response_id = r.id and a.question_id = v_q.id
             join public.survey_rounds sr on sr.id = r.round_id
            where sr.survey_id = p_survey
              and (p_round is null or r.round_id = p_round)
              and (p_group is null or r.respondent_group_id = p_group)
              and jsonb_typeof(a.value) in ('number','string'))
          else null end)
      from (
        select a.value #>> '{}' as val, count(*) as cnt
        from public.responses r
        join public.answers a on a.response_id = r.id and a.question_id = v_q.id
        join public.survey_rounds sr on sr.id = r.round_id
        where sr.survey_id = p_survey
          and (p_round is null or r.round_id = p_round)
          and (p_group is null or r.respondent_group_id = p_group)
          and v_q.type <> 'text'
        group by 1
      ) d);
  end loop;

  return jsonb_build_object('survey_id', p_survey, 'group', p_group, 'k', v_k, 'questions', v_out);
end $$;

-- 4) Free-text quotes: k-gated, group labels stripped below threshold -----------
create or replace function public.get_quotes(
  p_survey uuid, p_question uuid, p_group uuid default null, p_limit int default 20
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_n int; v_role app.member_role; v_k int := app.k_threshold();
begin
  select org_id into v_org from public.surveys where id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error','forbidden');
  end if;
  select role into v_role from public.org_members where org_id = v_org and user_id = auth.uid() and status='active';
  if v_role = 'leser' and p_group is not null then
    return jsonb_build_object('error','forbidden'); -- leser: aggregates only, never filtered text
  end if;

  select count(*) into v_n
  from public.responses r
  join public.answers a on a.response_id = r.id and a.question_id = p_question
  join public.survey_rounds sr on sr.id = r.round_id
  where sr.survey_id = p_survey
    and (p_group is null or r.respondent_group_id = p_group)
    and a.value is not null and a.value #>> '{}' <> '';

  if v_n < v_k then
    return jsonb_build_object('insufficient_data', true, 'n', null, 'k', v_k);
  end if;

  return (
    select jsonb_build_object('n', v_n, 'quotes',
      coalesce(jsonb_agg(jsonb_build_object('text', t.txt) ), '[]'::jsonb))
    from (
      select a.value #>> '{}' as txt
      from public.responses r
      join public.answers a on a.response_id = r.id and a.question_id = p_question
      join public.survey_rounds sr on sr.id = r.round_id
      where sr.survey_id = p_survey
        and (p_group is null or r.respondent_group_id = p_group)
        and a.value is not null and a.value #>> '{}' <> ''
      order by random()  -- never chronological: prevents timing correlation
      limit p_limit
    ) t);
  -- Note: no author, no group label, no timestamp in the payload — ever.
end $$;

-- Lock down execution: public respondent RPCs callable by anon; result RPCs by authenticated.
revoke all on function public.get_survey_for_token(text, text) from public;
grant execute on function public.get_survey_for_token(text, text) to anon, authenticated;
revoke all on function public.submit_response(text, text, jsonb, boolean) from public;
grant execute on function public.submit_response(text, text, jsonb, boolean) to anon, authenticated;
revoke all on function public.aggregate_results(uuid, uuid, uuid) from public;
grant execute on function public.aggregate_results(uuid, uuid, uuid) to authenticated;
revoke all on function public.get_quotes(uuid, uuid, uuid, int) from public;
grant execute on function public.get_quotes(uuid, uuid, uuid, int) to authenticated;
