-- V2-7 — test mode. DECISIONS **Q76 DEFAULTED, not answered**: a dry-run flag on
-- `submit_response` that runs every validation and returns without inserting.
--
-- ── WHY THE FLAG GOES ON THE EXISTING FUNCTION ─────────────────────────────
--
-- CLAUDE.md invariant 2: **`rpc.submit_response` is the single write path**,
-- token-validated, one transaction. Test mode is the first feature that asks
-- that path to do LESS, and both cheap alternatives are worse:
--
--   a SECOND function — a `preview_response` — would be a second write path by
--     construction, and the invariant would then be «two functions, one of which
--     promises not to write», which is a comment rather than a control;
--   a CLIENT that skips the call and fakes the thank-you would make the banner's
--     own promise false. V2:3323 says «All logikk kjører som for en ekte
--     respondent», and a preview that does not run the logic is a preview of
--     nothing.
--
-- So: one parameter, defaulting to false, and it changes what happens AFTER
-- validation and never whether validation runs. `tests/db/test-mode.test.ts`
-- asserts a closed round and an unknown token are refused in test mode exactly
-- as they are in a real one, and — over `pg_proc` rather than by review — that
-- there is still exactly one function inserting into `responses`.
--
-- ── THE ONE THAT WOULD HAVE BITTEN IN PRODUCTION ───────────────────────────
--
-- Blocker 3. `submit_response` marks `responded_at` and CLEARS the previous
-- token hash, because answering spends the grace window. An editor previewing
-- their own survey through a real invitation would therefore **silently burn
-- that recipient's link** — the recipient's next click would show the closed
-- screen, and nothing anywhere would say why. The dry run returns before any of
-- it.
create or replace function public.submit_response(
  p_token text,
  p_lang text,
  p_answers jsonb,
  p_anon_choice boolean default null,
  p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_res record;
  v_inv public.survey_invitations;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_mode app.anonymity_mode;
  v_response_id uuid;
  v_group uuid;
  v_link_invitation uuid;
  v_answered int := 0;
  k text; v jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  -- A replaced token cannot submit. The grace window is for reading the survey
  -- from an old mail, and a submission through it would be indistinguishable
  -- from one through the current link — which is fine — but only inside the
  -- window, which `resolve_token` has already decided.
  if v_res.status <> 'live' then
    return jsonb_build_object('error','not_found_or_closed');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id for update;
  if v_res.invitation_id is not null then
    select i.* into v_inv from public.survey_invitations i
     where i.id = v_res.invitation_id for update;
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

  -- group survives, identity does not
  v_group := v_inv.group_id;
  v_link_invitation := case when v_mode = 'anonymous' then null else v_inv.id end;

  -- ── Q76: THE DRY RUN RETURNS HERE ────────────────────────────────────────
  -- Every validation above has run: the token resolved and was live, the round
  -- was found, a spent invitation was refused, and the anonymity mode was
  -- decided exactly as it would be. What follows is the WRITE, and only the
  -- write. The payload reports what a real submission WOULD have recorded, so
  -- the preview can show the respondent's own view without inventing it.
  if p_dry_run then
    select count(*) into v_answered from jsonb_each(coalesce(p_answers, '{}'::jsonb));
    return jsonb_build_object(
      'dry_run', true,
      'ok', true,
      'anonymity', v_mode,
      'round_id', v_round.id,
      'answers', v_answered);
  end if;

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
    -- Answering spends the grace window too: the old link must not stay usable
    -- after the invitation has been used.
    update public.survey_invitations
       set responded_at = now(),
           previous_token_hash = null,
           previous_token_expires_at = null
     where id = v_inv.id;
  end if;

  return jsonb_build_object('ok', true, 'response_id', v_response_id);
end $fn$;

-- The four-argument signature is what `app/s/[token]/actions.ts` and every
-- existing caller use; PostgREST resolves by named arguments, so the new
-- parameter's DEFAULT is what keeps them working. Dropping the old signature
-- explicitly rather than leaving two overloads: two functions with the same name
-- and different arities is the ambiguity a later `revoke` or `grant` gets wrong.
drop function if exists public.submit_response(text, text, jsonb, boolean);

revoke all on function public.submit_response(text, text, jsonb, boolean, boolean) from public;
grant execute on function public.submit_response(text, text, jsonb, boolean, boolean) to anon, authenticated;
