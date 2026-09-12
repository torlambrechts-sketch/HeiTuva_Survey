-- ═══════════════════════════════════════════════════════════════════════════
-- M:0118 — the worker's public surface, and the schedule.
--
-- `app.*` is not on PostgREST's search path, so the Edge Function cannot reach
-- the sync functions directly. Five thin wrappers, each revoked from every
-- client role and granted to `service_role` alone — the same shape
-- `store_entra_connection` has and for the same reason.
--
-- THE DECRYPTING WRAPPER IS THE ONE TO LOOK AT. `entra_refresh_token_for_worker`
-- returns a live credential over PostgREST, which is a thing this schema has
-- never done. It is acceptable only because the caller is the service role over
-- TLS from our own Edge runtime — the same path the mail worker's payload takes
-- — and because `app.entra_refresh_token` remains unreachable by anyone else.
-- `tests/db/entra-credential.test.ts` asserts the grant on both.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.entra_connections_to_sync()
returns table (org_id uuid, tenant_id text) language sql stable security definer
set search_path = ''
as $$ select c.org_id, c.tenant_id from public.entra_connections c order by c.consented_at; $$;

create or replace function public.entra_refresh_token_for_worker(p_org uuid)
returns text language sql stable security definer
set search_path = ''
as $$ select app.entra_refresh_token(p_org); $$;

create or replace function public.apply_entra_page(p_org uuid, p_users jsonb)
returns jsonb language sql security definer
set search_path = ''
as $$ select app.entra_apply_page(p_org, p_users); $$;

create or replace function public.finish_entra_sync(p_org uuid, p_seen text[])
returns int language sql security definer
set search_path = ''
as $$ select app.entra_finish_sync(p_org, p_seen); $$;

create or replace function public.record_entra_sync(
  p_org uuid, p_error text, p_seen int, p_with_department int
) returns void language sql security definer
set search_path = ''
as $$ select app.entra_record_sync(p_org, p_error, p_seen, p_with_department); $$;

revoke all on function public.entra_connections_to_sync() from public, anon, authenticated;
revoke all on function public.entra_refresh_token_for_worker(uuid) from public, anon, authenticated;
revoke all on function public.apply_entra_page(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_entra_sync(uuid, text[]) from public, anon, authenticated;
revoke all on function public.record_entra_sync(uuid, text, int, int) from public, anon, authenticated;

grant execute on function public.entra_connections_to_sync() to service_role;
grant execute on function public.entra_refresh_token_for_worker(uuid) to service_role;
grant execute on function public.apply_entra_page(uuid, jsonb) to service_role;
grant execute on function public.finish_entra_sync(uuid, text[]) to service_role;
grant execute on function public.record_entra_sync(uuid, text, int, int) to service_role;

-- ── The invocation, on the mail worker's pattern ──────────────────────────
create or replace function app.run_entra_sync()
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'entra_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'entra_sync_secret';

  -- NAMED, and a WARNING rather than silence: «the operator has not finished
  -- setting this up» must read differently from «the sync ran and found
  -- nothing», which is the failure mode this whole phase is built against.
  if v_url is null or v_secret is null then
    raise warning 'entra sync not invoked: vault secret % is missing',
      case when v_url is null and v_secret is null then 'entra_sync_url and entra_sync_secret'
           when v_url is null then 'entra_sync_url' else 'entra_sync_secret' end;
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $$;

revoke all on function app.run_entra_sync() from public, anon, authenticated;

-- ── The schedule ──────────────────────────────────────────────────────────
--
-- NIGHTLY, not minutely. The mail worker runs every minute because a person is
-- waiting for an invitation; nobody is waiting for a directory sync, Graph
-- rate-limits per tenant, and a staff change that lands within a day is within
-- every promise this product makes. 03:00 UTC is outside the working day in
-- every EU timezone, which is when a full walk of a thousand users should
-- happen if it is going to be slow.
--
-- The screen says «hver natt kl. 03» and this is the line it is true of.
select cron.unschedule('entra-sync-nightly')
 where exists (select 1 from cron.job where jobname = 'entra-sync-nightly');
select cron.schedule('entra-sync-nightly', '0 3 * * *', 'select app.run_entra_sync()');
