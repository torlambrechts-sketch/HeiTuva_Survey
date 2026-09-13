-- M:0119 — the token says whether a reply can reach the person holding it.
--
-- WHY THIS IS A MIGRATION AND NOT A CONDITIONAL IN THE PAGE. The walk of
-- 2026-09-12 found that the respondent surface promises «Lederen kan svare uten
-- å se hvem som skrev» to EVERY person who opens the comment box — including one
-- who arrived through a share link or a QR code, where there is no invitation
-- for a reply to attach to and `WorklistPanel` correctly tells the manager
-- «det finnes ingen tråd å svare i». One of those two sentences is false and it
-- is the one the RESPONDENT reads, in the worst direction: she writes something
-- she otherwise would not, trusting a reply that never comes.
--
-- The page could not tell the two apart. `get_survey_for_token` resolves
-- `v_res.invitation_id` and then does not return it, so the only signals on the
-- surface were proxies — `invitation_lang` being null, say — and a proxy is an
-- enumeration standing in for a property: an invitation with no language would
-- silently start claiming there is no thread. So the FACT is returned instead.
--
-- `has_thread` is deliberately the same word the manager's side already uses
-- (`WorklistPanel`'s `r.hasThread`), because it is the same fact about the same
-- comment, and two names for one fact is how the two sides drift apart again.
--
-- Nothing else in the payload changes. The function is otherwise reproduced
-- verbatim from the catalogue rather than retyped from memory.

create or replace function public.get_survey_for_token(p_token text, p_lang text default 'no'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_res record;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_inv public.survey_invitations;
  v_org public.organizations;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status = 'replaced' then
    return jsonb_build_object('error','replaced');
  end if;
  if v_res.status <> 'live' then
    return jsonb_build_object('error','not_found_or_closed');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id;
  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;
  select o.* into v_org from public.organizations o where o.id = v_survey.org_id;
  if v_res.invitation_id is not null then
    select i.* into v_inv from public.survey_invitations i where i.id = v_res.invitation_id;
  end if;

  return jsonb_build_object(
    'survey_id', v_survey.id, 'round_id', v_round.id,
    'title', v_survey.title, 'org_id', v_survey.org_id,
    'org_name', v_org.name,
    'org_default_lang', v_org.default_lang,
    'invitation_lang', v_inv.lang,
    'anonymity', v_survey.anonymity,
    'run_mode', v_survey.run_mode,
    'feedback_mode', v_survey.feedback_mode,
    'k_threshold', v_survey.k_threshold, 'respondent_kind', v_survey.respondent_kind,
    'engage', v_survey.engage,
    'lang', p_lang, 'langs', v_survey.langs,
    'already_responded', (v_inv.id is not null and v_inv.responded_at is not null),
    -- The whole point of this migration. A comment left through a share link or
    -- a QR code has `survey_comments.invitation_id = NULL`, so there is nothing
    -- to answer into; the surface must not promise one.
    'has_thread', (v_res.invitation_id is not null),
    'questions', v_round.question_snapshot);
end $function$;

comment on function public.get_survey_for_token(text, text) is
  'Everything the respondent surface needs for one token. `has_thread` says '
  'whether a reply can reach this person: true for an invitation, false for a '
  'share link or QR voucher, where no invitation exists to attach a reply to. '
  'The comment box reads it so it does not promise an answer it cannot deliver.';
