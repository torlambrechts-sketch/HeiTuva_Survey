-- V2-10 — `get_survey_for_token` carries `run_mode`, so the respondent surface
-- knows whether to draw the quiz tiles.
--
-- **The tiles are CHROME, and the payload change reflects that.** The value a
-- tile writes is the same option index the standard list writes, so
-- `submit_response`, the answer key and the leaderboard see no difference at
-- all. What the respondent surface needs is one boolean-shaped fact it cannot
-- otherwise have: this survey is a quiz.
--
-- Patched the way `M:0087` was, and for the same reason (D115): the anchor's
-- uniqueness is ASSERTED rather than assumed, because `M:0070` patched
-- `send_round` at five occurrences of an anchor it had not counted.
--
-- **NOTHING ELSE IS ADDED.** Not the answer key — a payload carrying
-- `answer_index` would hand every respondent the correct answer in a network
-- response, which is the one thing a quiz cannot do. The key stays server-side
-- and is read only by `quiz_leaderboard`; `tests/db/quiz.test.ts` asserts the
-- token payload does not contain it.
do $$
declare
  v_src text;
  v_anchor text := '''anonymity'', v_survey.anonymity,';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_survey_for_token';

  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'get_survey_for_token: expected exactly one anonymity key, found %', v_hits
      using hint = 'The body moved. Read it and rewrite this migration against what is there '
                   'now — do NOT loosen the anchor (D115).';
  end if;

  execute replace(v_src, v_anchor,
    v_anchor || E'\n    ''run_mode'', v_survey.run_mode,');
end $$;
