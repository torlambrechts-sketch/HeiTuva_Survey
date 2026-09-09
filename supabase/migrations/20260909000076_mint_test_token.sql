-- V2-7 — the token a preview walks the real path with.
--
-- Test mode renders the ORDINARY respondent flow, which is reached with a token
-- and nothing else. So a preview needs one, and the only safe token to give it
-- is a **new one addressed to the editor** — never a recipient's.
--
-- ── WHY NOT «JUST USE ANY LIVE TOKEN FROM THE ROUND» ───────────────────────
--
-- Because `submit_response` marks `responded_at` and CLEARS the previous token
-- hash: answering spends the grace window. An editor previewing through a real
-- invitation would silently burn that person's link, and the recipient's next
-- click would show the closed screen with nothing anywhere saying why.
-- `p_dry_run` now returns before any of that (`M:0075`, blocker 3), but the
-- token would still be the wrong one to hand out: a preview that can submit for
-- real if the flag is ever dropped is a loaded gun.
--
-- So the invitation this mints is marked `kind = 'test'` in its own column, the
-- editor's address is the recipient, and `send_round`'s counters already
-- distinguish test sends (`M:0008:113`) so nothing counts it as an invitation.
alter table public.survey_invitations
  add column if not exists is_test boolean not null default false;

comment on column public.survey_invitations.is_test is
  'Q76: minted by `mint_test_token` for a preview, never by a send. Excluded '
  'from participation denominators — a test invitation nobody was expected to '
  'answer would otherwise make every response rate wrong.';

create index if not exists survey_invitations_real_idx
  on public.survey_invitations (round_id) where not is_test;

create or replace function public.mint_test_token(p_survey uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_round uuid; v_email text; v_token text; v_id uuid;
begin
  -- A preview renders the questions, so it is a read of the survey's content and
  -- takes the same authority as editing it.
  if not app.can_edit_survey(p_survey) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select r.id into v_round from public.survey_rounds r
   where r.survey_id = p_survey and r.status = 'open'
   order by r.round_no desc limit 1;
  if v_round is null then
    -- An unsent survey has no round, so there is nothing to preview against.
    -- Said by name rather than by an empty screen.
    return jsonb_build_object('error', 'no_round');
  end if;

  select m.email into v_email from public.org_members m
   where m.user_id = (select auth.uid())
     and m.org_id = (select org_id from public.surveys where id = p_survey);

  -- Reuse this editor's existing test invitation rather than stacking one per
  -- preview: a round with forty test rows is a round whose audience list is
  -- unreadable, and `responded_at` on a dry run is never set anyway.
  select i.id into v_id from public.survey_invitations i
   where i.round_id = v_round and i.is_test and i.email = v_email limit 1;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  if v_id is null then
    insert into public.survey_invitations (round_id, email, token_hash, is_test)
    values (v_round, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), true)
    returning id into v_id;
  else
    -- A fresh secret each time, and the old one stops working immediately. A
    -- preview link that stays valid is a live token in a browser history.
    update public.survey_invitations
       set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
           responded_at = null,
           previous_token_hash = null,
           previous_token_expires_at = null
     where id = v_id;
  end if;

  return jsonb_build_object('token', v_token, 'round_id', v_round);
end $fn$;

revoke all on function public.mint_test_token(uuid) from public, anon;
grant execute on function public.mint_test_token(uuid) to authenticated;
