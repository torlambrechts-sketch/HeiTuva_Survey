-- HeiTuva 0007 — the respondent page needs two more facts from the token.
--
-- `get_survey_for_token` returned everything about the round but nothing about
-- who is asking or in which language the invitation was addressed:
--
--  * The design's respondent header reads "{promise} · {orgName}"
--    (HeiTuva.dc.html:1947). Only `org_id` came back, and a uuid is not a name.
--    The respondent has no session, so the page cannot look the name up itself
--    — `organizations` is org-scoped by RLS and correctly invisible to `anon`.
--  * The implementation plan's locale chain for this surface is
--    per-invitation `lang` -> link `?lang=` -> org `default_lang`. The first
--    link was unreachable: the function echoed the caller's `p_lang` and never
--    exposed `survey_invitations.lang`. A respondent invited in Norwegian at an
--    org whose default is English was served English.
--
-- Both are already visible to anyone holding the token — the invitation was
-- addressed to them, in that language, by that organisation — so this widens
-- nothing. It stays SECURITY DEFINER for the same reason it always was: `anon`
-- has no read on these tables and must not be given one.
--
-- Replaced wholesale rather than patched: the body is short, and a function
-- that two migrations have each edited half of is harder to audit than one
-- that reads top to bottom.

create or replace function public.get_survey_for_token(p_token text, p_lang text default 'no')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hash text := app.hash_token(p_token);
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_inv public.survey_invitations;
  v_org public.organizations;
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
  select o.* into v_org from public.organizations o where o.id = v_survey.org_id;
  return jsonb_build_object(
    'survey_id', v_survey.id, 'round_id', v_round.id,
    'title', v_survey.title, 'org_id', v_survey.org_id,
    'org_name', v_org.name,
    'org_default_lang', v_org.default_lang,
    -- NULL for a share link: nobody was addressed, so there is no per-person
    -- language and the chain falls through to the link's own ?lang=.
    'invitation_lang', v_inv.lang,
    'anonymity', v_survey.anonymity, 'engage', v_survey.engage,
    'lang', p_lang, 'langs', v_survey.langs,
    'already_responded', (v_inv.id is not null and v_inv.responded_at is not null),
    'questions', v_round.question_snapshot);
end $$;
