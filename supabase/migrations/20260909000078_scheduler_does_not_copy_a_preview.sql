-- V2-7 — the scheduler must not copy a PREVIEW forward as a real invitation.
--
-- ── THE SAME LOOP V2-3b FOUND, A SECOND TIME ───────────────────────────────
--
-- `app.run_due_schedules` builds round N+1 by copying round N's invitation rows
-- verbatim. V2-3b found that this re-invited people who had objected, «from a
-- path no screen leads to», and added the suppression skip. **The copy has the
-- same shape for `is_test` and it is worse**, because the insert does not carry
-- the column:
--
--     insert into public.survey_invitations
--       (round_id, email, phone, name, group_id, lang, channel, token_hash, member_id)
--
-- `is_test` defaults to FALSE. So an editor's preview invitation on round 1
-- becomes a REAL invitation on round 2, with a real token, and the mail worker
-- sends the editor a genuine invitation to a survey they were previewing. It
-- would also re-enter every denominator the previous migration just cleaned.
--
-- Found by reading the loop rather than by a gate — the same way V2-3b's
-- insertion point was found, and the reason `M:0077`'s header says a promise in
-- a comment is not a promise.
--
-- The skip goes beside the suppression skip, because they are the same kind of
-- rule: **a row that must not be carried into the next round.**
do $do$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'run_due_schedules';

  -- The SELECT that feeds the loop. Filtering at the source rather than adding a
  -- second `continue`: a preview is not part of round N's audience at all, so it
  -- should never enter the loop, and a later reader adding a statement inside
  -- the loop cannot forget the skip.
  if position('from public.survey_invitations where round_id = v_prev' in v_src) <> 1
     and position('from public.survey_invitations where round_id = v_prev' in v_src) = 0 then
    raise exception 'run_due_schedules: the copy source did not match — patch by hand';
  end if;

  v_new := replace(v_src,
    'from public.survey_invitations where round_id = v_prev',
    'from public.survey_invitations where round_id = v_prev and not is_test');

  if v_new = v_src then
    raise exception 'run_due_schedules: nothing was replaced';
  end if;
  execute v_new;
end $do$;
