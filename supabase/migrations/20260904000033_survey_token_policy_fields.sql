-- HeiTuva 0044 — Q17: the respondent token carries the policy the banner needs.
--
-- The promise on /s/[token] is generated from the survey's settings, never
-- fixed copy (lib/respondent/anonymity-promise.ts, docs/Q17_terskel_forslag.md
-- §1). To derive it, get_survey_for_token now returns the threshold and the
-- respondent type alongside the anonymity mode. Additive only; the function
-- still gates nothing (it renders the form, it does not read the vault).

CREATE OR REPLACE FUNCTION public.get_survey_for_token(p_token text, p_lang text DEFAULT 'no'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'k_threshold', v_survey.k_threshold, 'respondent_kind', v_survey.respondent_kind,
    'engage', v_survey.engage,
    'lang', p_lang, 'langs', v_survey.langs,
    'already_responded', (v_inv.id is not null and v_inv.responded_at is not null),
    'questions', v_round.question_snapshot);
end $function$;
