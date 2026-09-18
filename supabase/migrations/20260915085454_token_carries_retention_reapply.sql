-- M:0121 — the token carries how long the answers are kept.
--
-- WHY THIS IS A MIGRATION AND NOT A READ IN THE PAGE. `/s/[token]` has no
-- session: it is built with the ANON key and its only data access is two
-- SECURITY DEFINER RPCs, which is what keeps invariant 1 true on the one
-- surface a stranger can open. A retention figure therefore cannot be read from
-- `organizations` on that page, and the honest way to get it there is the
-- function that already resolves the token and already holds `v_org`.
--
-- WHY Q187 NEEDS IT AT ALL. The bundle hard-codes «Svarene slettes automatisk
-- etter 24 måneder» inside the RESPONDENT's own anonymity disclosure
-- (v6:10075). It is false three ways — the column default is 12, the value is
-- per-organisation, and `retention_months = 0` or `auto_delete` off means
-- nothing is ever deleted. Q187 decided the sentence is interpolated in BOTH
-- places. The manager's half shipped in V6-4; this is what the other half
-- needs, and until now there was no way to give it one.
--
-- WHY TWO SCALARS AND NOT THE `privacy` COLUMN. CLAUDE.md invariant 3's
-- corollary: no per-organisation value may reach a respondent-facing surface
-- unless a decision says so by name. Q187 names the RETENTION. It does not name
-- `organizations.privacy`, which also carries IP logging, consent and the
-- EU-only flag — returning the whole object because the value we need lives
-- inside it would be an enumeration of what we happened to want standing in for
-- what we are allowed to send. So the one boolean is resolved here.
--
-- AND IT IS RESOLVED THE SAME WAY `app.apply_retention` RESOLVES IT:
-- `coalesce((privacy->>'auto_delete')::boolean, true)`. An absent key means
-- deletion is ON. A payload that inverted that default would tell a respondent
-- her answers are kept forever when they are not — which is the same class of
-- false promise this migration exists to remove, pointing the other way.
--
-- The NUMBER is not turned into a sentence here. `lib/surveys/retention.ts`
-- decides «months» versus «forever», and it is the function the manager's
-- Personvern tab already calls — one definition, two readers, so the two
-- accounts of what a respondent was promised cannot drift apart.
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
    'has_thread', (v_res.invitation_id is not null),
    -- M:0121. Two scalars, not the settings object they live beside.
    'retention_months', v_org.retention_months,
    'retention_auto_delete', coalesce((v_org.privacy->>'auto_delete')::boolean, true),
    'questions', v_round.question_snapshot);
end $function$;

comment on function public.get_survey_for_token(text, text) is
  'Everything the respondent surface needs for one token. `has_thread` says '
  'whether a reply can reach this person: true for an invitation, false for a '
  'share link or QR voucher, where no invitation exists to attach a reply to. '
  '`retention_months` and `retention_auto_delete` are the organisation''s own '
  'retention, resolved exactly as app.apply_retention resolves it, so the '
  'anonymity sheet states a real duration or says the answers are kept — Q187. '
  'The `privacy` column itself is deliberately NOT returned: only the one '
  'boolean a decision names may reach a respondent-facing surface.';
