-- HeiTuva 0012 — app schema: expose the types and the policy helpers, lock the rest
--
-- Two problems this fixes.
--
-- 1. PostgREST resolves a column's type before writing it, so inserting into
--    public.org_members (role app.member_role) failed with "permission denied
--    for schema app". Phase 1's user administration would have hit this on its
--    first insert.
--
-- 2. Every function in `app` carried PostgreSQL's default PUBLIC EXECUTE. The
--    only thing keeping them out of reach was the missing schema USAGE, which
--    is accidental protection rather than policy. Granting USAGE naively would
--    have exposed app.apply_retention() — SECURITY DEFINER, and it DELETEs from
--    responses and answers.
--
-- So: revoke everything, grant USAGE, then re-grant EXECUTE only on the helpers
-- that RLS policies actually evaluate. Policy expressions run with the querying
-- role's privileges, so `authenticated` genuinely needs these eight; without
-- them every policy-gated select fails with "permission denied for function".

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;

grant usage on schema app to anon, authenticated, service_role;

-- The helpers referenced by policies in 0008. Read-only membership checks: each
-- answers "what may THIS caller see", so exposing them leaks nothing.
grant execute on function app.is_org_member(uuid)                     to anon, authenticated, service_role;
grant execute on function app.has_role(uuid, app.member_role[])       to anon, authenticated, service_role;
grant execute on function app.member_id(uuid)                         to anon, authenticated, service_role;
grant execute on function app.can_view_survey(uuid)                   to anon, authenticated, service_role;
grant execute on function app.can_edit_survey(uuid)                   to anon, authenticated, service_role;
grant execute on function app.round_survey(uuid)                      to anon, authenticated, service_role;
grant execute on function app.duty_org(uuid)                          to anon, authenticated, service_role;
grant execute on function app.report_org(uuid)                        to anon, authenticated, service_role;

-- Deliberately NOT granted, and each must stay that way:
--   app.apply_retention()  — SECURITY DEFINER, deletes response data. pg_cron
--                            runs it as postgres; no client ever calls it.
--   app.hash_token(text)   — only called inside the SECURITY DEFINER RPCs,
--                            which run as owner. Exposing it would let a caller
--                            probe token hashes directly.
--   app.k_threshold()      — same; the k gate is applied inside the RPCs.
--   app.touch_updated_at() /
--   app.forbid_mutation()  — trigger functions; PostgreSQL does not check
--                            EXECUTE when firing a trigger.

-- Functions added to `app` later must not silently regain PUBLIC EXECUTE.
alter default privileges in schema app revoke execute on functions from public;
