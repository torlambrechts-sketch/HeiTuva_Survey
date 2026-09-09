-- V2-9 — **Gate 5a3 found this, and it is the interesting kind of finding: my
-- revoke was correct and did nothing.**
--
-- `M:0079` and `M:0080` each wrote
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated;
--
-- and 5a3 reported `close_live_session` and `live_cloud` as **anon
-- execute=GRANTED** anyway. The reason is that Supabase carries ALTER DEFAULT
-- PRIVILEGES granting EXECUTE on new functions in `public` to the `anon` and
-- `authenticated` roles individually. `revoke ... from public` revokes the
-- PUBLIC pseudo-role; it does not touch a grant held by `anon` in its own name.
--
-- **The revoke was not wrong. It was aimed at a different holder** — which is
-- D115's shape (a defence that works as designed, on the wrong thing) arriving
-- through privileges instead of an exception handler, and caught here only
-- because 5a3 asks the catalogue rather than reading the migration.
--
-- So: name the role.
revoke execute on function public.close_live_session(uuid) from anon;
revoke execute on function public.live_cloud(uuid, uuid, uuid, text) from anon;

-- `redeem_live_voucher` KEEPS its anon grant — that is the whole voucher — and
-- it is allowlisted in `scripts/verify/policy-coverage.ts` with the reason,
-- beside `submit_response` and `get_survey_for_token`, which authorise
-- themselves from a token inside the function in exactly the same way.

-- ── The same check, one level up, over the catalogue ───────────────────────
-- 5a3 enumerates SECURITY DEFINER functions in `public`. `app.live_word_floor`
-- is in `app`, which neither of its sweeps reaches — a recorded limit of that
-- gate. It is immutable and returns a constant, so nothing is exposed by it;
-- it is revoked from anon regardless, because "nothing is exposed by it" is an
-- argument about today's body.
revoke execute on function app.live_word_floor() from anon;
