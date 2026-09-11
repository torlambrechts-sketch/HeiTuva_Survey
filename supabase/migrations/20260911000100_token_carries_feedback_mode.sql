-- C3 — `get_survey_for_token` carries `feedback_mode`, so the respondent
-- surface knows whether to draw a comment control at all, and under what name.
--
-- The same shape as `M:0088`, which added `run_mode` for the quiz tiles, and for
-- the same reason: the respondent page has no session and no way to read
-- `surveys` directly, so a fact about the survey reaches it through this payload
-- or not at all.
--
-- **NOTHING ELSE IS ADDED, and one thing is deliberately withheld.** The payload
-- does NOT carry whether this token has an invitation behind it. The Builder
-- says «a link-only survey has no thread» to the EDITOR, where the distribution
-- is chosen; telling the RESPONDENT would be telling her something about how she
-- was reached that she did not ask and cannot act on, and `get_comment_thread`
-- already returns an empty thread for a share link without needing the page to
-- know in advance.
--
-- Patched with an ASSERTED anchor (D115): `M:0070` patched `send_round` at five
-- occurrences of an anchor nobody counted, and a catch-all hid every one.
do $$
declare
  v_src text;
  v_anchor text := '''run_mode'', v_survey.run_mode,';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_survey_for_token';

  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'get_survey_for_token: expected exactly one run_mode key, found %', v_hits
      using hint = 'The body moved. Read it and rewrite this migration against what is there '
                   'now — do NOT loosen the anchor (D115).';
  end if;

  execute replace(v_src, v_anchor,
    v_anchor || E'\n    ''feedback_mode'', v_survey.feedback_mode,');
end $$;
