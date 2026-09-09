-- V2-7 — a test invitation must not appear in ANY count.
--
-- `M:0076` added `survey_invitations.is_test` and said in its own comment that
-- such a row is «excluded from participation denominators». **Saying it is not
-- doing it**, and this project has now been bitten four times by a column whose
-- promise lived only in a comment (`weekly_digest`, `created_by`,
-- `close_round`, `snapshot_results`). So: every reader that COUNTS invitations
-- is patched, and the patch is applied by enumeration rather than by a list I
-- typed from memory.
--
-- Eight functions reference `survey_invitations`. They divide cleanly:
--
--   COUNT it, and must exclude a test row —
--     results_summary, dashboard_summary, overview_activity,
--     attributed_rows, get_benchmarks, sync_survey_target
--   ACT on one, and must not —
--     resolve_token (a preview must resolve), submit_response (the dry run
--     goes through it), send_round and close_round (they write), and
--     enqueue_reminders, which is the interesting one: a reminder for the
--     editor's own preview would be an email nobody asked for, so it EXCLUDES.
--
-- A response rate of «1 of 4» where the fourth was the editor looking at their
-- own survey is a wrong number on the screen a manager reads, and it is exactly
-- CLAUDE.md's «never fabricate data in the UI» arriving as an off-by-one.
do $do$
declare
  v_fn text;
  v_src text;
  v_new text;
  v_patched int := 0;
  -- Every counting reader, and `enqueue_reminders`, which must not email a
  -- preview. `resolve_token`, `submit_response`, `send_round` and `close_round`
  -- are deliberately absent: they act on a specific invitation the caller
  -- already holds, and filtering there would break the preview itself.
  v_targets text[] := array[
    'results_summary', 'dashboard_summary', 'overview_activity',
    'attributed_rows', 'get_benchmarks', 'sync_survey_target', 'enqueue_reminders'];
begin
  foreach v_fn in array v_targets loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app','public') and p.proname = v_fn and p.prokind = 'f';
    if v_src is null then
      raise exception 'V2-7: % not found — the enumeration and the catalogue disagree', v_fn;
    end if;

    -- `from public.survey_invitations i` is the shape every one of them uses,
    -- and a rename to the SAME text is what proves the anchor was there.
    v_new := replace(v_src, 'public.survey_invitations i', 'public.survey_invitations i');
    if position('public.survey_invitations i' in v_src) = 0 then
      raise exception 'V2-7: % does not alias survey_invitations as `i` — patch it by hand', v_fn;
    end if;

    -- Add the predicate to every WHERE that follows such a FROM. Rather than
    -- guess at each body's shape, the alias is rewritten to a SUBQUERY that
    -- carries the filter with it — one substitution, no WHERE-clause surgery,
    -- and it cannot land in the wrong branch the way M:0070's five-times
    -- `replace` did.
    v_new := replace(v_src,
      'public.survey_invitations i',
      '(select * from public.survey_invitations where not is_test) i');
    execute v_new;
    v_patched := v_patched + 1;
  end loop;

  if v_patched <> array_length(v_targets, 1) then
    raise exception 'V2-7: patched % of %', v_patched, array_length(v_targets, 1);
  end if;
end $do$;
