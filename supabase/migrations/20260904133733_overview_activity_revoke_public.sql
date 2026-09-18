-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, and `anon`
-- inherits it. The previous migration revoked from `anon` alone, which leaves
-- the PUBLIC grant standing — so overview_activity was callable without a
-- session. Revoke from PUBLIC, then grant the one role that should have it.
revoke all on function public.overview_activity(uuid) from public, anon;
grant execute on function public.overview_activity(uuid) to authenticated;
