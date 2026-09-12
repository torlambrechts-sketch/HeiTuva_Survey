-- I1-2 — THE FIRST AUTHENTICATED INBOUND SURFACE THIS PRODUCT HAS EVER HAD.
--
-- Every other way into this database is either a signed-in session (Supabase
-- Auth, RLS, `app.has_role`) or a respondent token that can do exactly one
-- thing. A SCIM connector is neither: it is a machine, holding a long-lived
-- credential, writing membership for a whole organisation. So the credential
-- gets the same treatment as a respondent token and then some.
--
-- ── THE TOKEN IS TWO HALVES, AND THAT IS THE POINT ─────────────────────────
--
-- `hei_scim_<prefix>_<secret>`. The PREFIX is a public identifier and is what
-- the row is found by; the SECRET is hashed with SHA-256 and only the hash is
-- stored (invariant 5). Splitting it is what makes invariant 4's «constant-time
-- compare» a real thing rather than a phrase: with a single opaque token the
-- only way to find the row is `where token_hash = $1`, which is an index
-- equality and not a comparison anybody controls. Finding the row by prefix and
-- then comparing the hashes with `timingSafeEqual` in the route is an actual
-- constant-time comparison of the thing that matters.
--
-- `app.resolve_token` (the respondent path) does the hash-equality lookup and is
-- correct for what it guards — a single invitation, expiring, one use. This is a
-- long-lived organisation-wide credential and gets the stronger shape.
--
-- ── WHY THERE IS NO RLS POLICY ─────────────────────────────────────────────
--
-- Deliberate, and the same shape as `responses`/`answers`: RLS is ON and there
-- is NO policy, so no client can reach this table by any path. The hash is
-- useless to an attacker and it is still not a thing to hand to a browser. The
-- screen reads what it needs through `public.scim_connection_status`, which
-- returns the prefix, the timestamps and the error state and CANNOT return the
-- hash — there is no column selected for it.

create table if not exists public.scim_credentials (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null unique references public.organizations(id) on delete cascade,
  token_prefix       text not null unique,
  token_hash         text not null,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.org_members(id) on delete set null,
  revoked_at         timestamptz,
  -- «A sync failure is loud.» A connector that silently stops syncing looks
  -- identical to a customer with no staff changes, and the first sign would be a
  -- survey that reaches nobody. These four are what makes the difference
  -- visible: the screen can say when it last worked AND what went wrong.
  last_used_at       timestamptz,
  last_error         text,
  last_error_at      timestamptz,
  consecutive_errors int not null default 0,
  -- A trivial fixed-window limiter. SCIM volumes are tens of requests an hour,
  -- so the cost of a counter update per request is nothing and the protection is
  -- against a MISCONFIGURED connector rather than against an attacker — an
  -- attacker has no token. Stated as what it is rather than called rate limiting.
  window_started_at  timestamptz,
  window_count       int not null default 0
);

alter table public.scim_credentials enable row level security;

comment on table public.scim_credentials is
  'One SCIM connector per organisation. RLS is ON with NO POLICY by design — the '
  'same shape as responses/answers: nothing reaches this table except the '
  'SECURITY DEFINER functions below. The token is stored as prefix + SHA-256 of '
  'the secret half, never whole.';

comment on column public.scim_credentials.token_prefix is
  'The public half of the bearer token — how the row is FOUND. Not a secret and '
  'shown on the Integrasjoner screen so an administrator can tell two tokens '
  'apart. WHO WRITES IT: public.create_scim_token, and nothing else.';

comment on column public.scim_credentials.token_hash is
  'SHA-256 of the SECRET half (invariant 5). Never returned to a client: the '
  'status RPC does not select it, and there is no RLS policy that would let '
  'anything else read it. WHO WRITES IT: public.create_scim_token.';

comment on column public.scim_credentials.consecutive_errors is
  'Reset to 0 by any successful request. WHO WRITES IT: app.scim_touch, on every '
  'inbound request. It is what lets the screen distinguish «this customer has no '
  'staff changes» from «this connector has been failing since Tuesday», which '
  'otherwise look identical.';

-- ── MINTING ────────────────────────────────────────────────────────────────
create or replace function public.create_scim_token()
returns text
language plpgsql
security definer
set search_path = public, app, extensions, pg_temp
as $$
declare
  v_org uuid;
  v_member uuid;
  v_prefix text;
  v_secret text;
begin
  select m.org_id, m.id into v_org, v_member
    from public.org_members m
   where m.user_id = auth.uid() and m.status = 'active'
     and m.role = 'administrator'
   limit 1;
  if v_org is null then
    raise exception 'forbidden'
      using hint = 'Only an active administrator may mint a SCIM token — it '
                   'writes membership for the whole organisation.';
  end if;

  v_prefix := encode(extensions.gen_random_bytes(6), 'hex');   -- 12 chars, public
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');  -- 64 chars, secret

  insert into public.scim_credentials (org_id, token_prefix, token_hash, created_by)
  values (v_org, v_prefix, app.hash_token(v_secret), v_member)
  on conflict (org_id) do update
    set token_prefix = excluded.token_prefix,
        token_hash   = excluded.token_hash,
        created_by   = excluded.created_by,
        created_at   = now(),
        revoked_at   = null,
        last_error   = null,
        last_error_at = null,
        consecutive_errors = 0;

  -- THE ONLY TIME THE WHOLE TOKEN EXISTS ANYWHERE. It is not stored, not
  -- logged, and cannot be retrieved: minting again replaces it.
  return 'hei_scim_' || v_prefix || '_' || v_secret;
end $$;

revoke all on function public.create_scim_token() from public, anon;
grant execute on function public.create_scim_token() to authenticated;

comment on function public.create_scim_token() is
  'Mints the organisation''s SCIM bearer token and returns it ONCE — it is not '
  'stored whole and cannot be retrieved. Administrator only. Minting again '
  'replaces the previous token, which is also how rotation works.';

-- ── REVOKING ───────────────────────────────────────────────────────────────
create or replace function public.revoke_scim_token()
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_org uuid;
begin
  select m.org_id into v_org from public.org_members m
   where m.user_id = auth.uid() and m.status = 'active' and m.role = 'administrator'
   limit 1;
  if v_org is null then
    raise exception 'forbidden';
  end if;

  -- Revoked rather than deleted, so the screen can still say a connector WAS
  -- connected and when it last worked. A deleted row would make a revoked
  -- connector and a never-configured one look identical — the same reasoning as
  -- Q138 one table over.
  update public.scim_credentials set revoked_at = now()
   where org_id = v_org and revoked_at is null;
  return found;
end $$;

revoke all on function public.revoke_scim_token() from public, anon;
grant execute on function public.revoke_scim_token() to authenticated;

-- ── WHAT THE SCREEN MAY SEE ────────────────────────────────────────────────
create or replace function public.scim_connection_status()
returns table (
  configured   boolean,
  token_prefix text,
  created_at   timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  last_error   text,
  last_error_at timestamptz,
  consecutive_errors int,
  members_from_directory bigint
)
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_org uuid;
begin
  select m.org_id into v_org from public.org_members m
   where m.user_id = auth.uid() and m.status = 'active' and m.role = 'administrator'
   limit 1;
  if v_org is null then
    raise exception 'forbidden';
  end if;

  return query
    select c.id is not null, c.token_prefix, c.created_at, c.revoked_at,
           c.last_used_at, c.last_error, c.last_error_at,
           coalesce(c.consecutive_errors, 0),
           (select count(*) from public.org_members m2
             where m2.org_id = v_org and m2.source = 'scim')
      from (select null::uuid as o) z
      left join public.scim_credentials c on c.org_id = v_org;
end $$;

revoke all on function public.scim_connection_status() from public, anon;
grant execute on function public.scim_connection_status() to authenticated;

comment on function public.scim_connection_status() is
  'Everything the Integrasjoner screen may know about the connector. It does not '
  'select token_hash and there is no code path that would — I1-3 renders a '
  'connection status read FROM A CONNECTION, which is the register finding the '
  'instruction names: intConnected draws «4 aktive tilkoblinger» from a '
  'hard-coded map and none of the four exists.';

-- ── AUTHENTICATION, FOR THE ROUTE ──────────────────────────────────────────
create or replace function app.scim_lookup(p_prefix text)
returns table (org_id uuid, token_hash text, revoked boolean, over_limit boolean)
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_limit int := 600;                      -- per window, per organisation
  v_window interval := interval '1 minute';
  v_row public.scim_credentials;
  v_fresh boolean;
begin
  select * into v_row from public.scim_credentials c where c.token_prefix = p_prefix;
  if v_row.id is null then
    return;  -- zero rows: the route reports 401 without saying which half was wrong
  end if;

  v_fresh := v_row.window_started_at is null
          or v_row.window_started_at < now() - v_window;

  -- The fixed window is advanced HERE rather than in `scim_touch`, because a
  -- request that is refused for being over the limit must still count towards
  -- the limit — otherwise the limiter stops limiting exactly when it is needed.
  update public.scim_credentials c
     set window_started_at = case when v_fresh then now() else c.window_started_at end,
         window_count      = case when v_fresh then 1     else c.window_count + 1 end
   where c.id = v_row.id
   returning c.window_count into v_row.window_count;

  return query select v_row.org_id, v_row.token_hash,
                      v_row.revoked_at is not null,
                      v_row.window_count > v_limit;
end $$;

revoke all on function app.scim_lookup(text) from public, anon;

comment on function app.scim_lookup(text) is
  'Finds a connector by the PUBLIC half of its token and hands the route the '
  'stored hash to compare in constant time. Returns no row for an unknown '
  'prefix, so the route answers 401 identically whether the prefix or the secret '
  'was wrong. Advances the rate window even for a request it is about to refuse.';

-- ── BOOKKEEPING, SO A FAILURE IS LOUD ──────────────────────────────────────
create or replace function app.scim_touch(p_org uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if p_error is null then
    update public.scim_credentials
       set last_used_at = now(), consecutive_errors = 0,
           last_error = null, last_error_at = null
     where org_id = p_org;
  else
    update public.scim_credentials
       set last_used_at = now(),
           consecutive_errors = consecutive_errors + 1,
           last_error = left(p_error, 500),
           last_error_at = now()
     where org_id = p_org;
  end if;
end $$;

revoke all on function app.scim_touch(uuid, text) from public, anon;

comment on function app.scim_touch(uuid, text) is
  'Records the outcome of one inbound request. `last_error` carries the SCIM '
  'error detail and never a respondent free text — a SCIM payload holds names '
  'and addresses only, and invariant 7 is about answers. Truncated to 500 '
  'characters so a pathological body cannot be stored whole.';

-- ── THE FOUR SURFACES THE ROUTE CALLS, IN `public` AND NOWHERE ELSE ────────
--
-- MEASURED RATHER THAN ASSUMED: `supabase/config.toml` exposes `public` and
-- `graphql_public`, and a POST to `/rest/v1/rpc/scim_lookup` returns **404**.
-- So the `app` functions above and in `M:0109` are unreachable over the API —
-- which is right for the logic and wrong for the route, which reaches this
-- database through PostgREST like everything else.
--
-- Thin wrappers rather than moving the logic, because `M:0109` is applied and
-- committed and a migration is never edited. What the wrappers buy beyond
-- reachability is that these four now APPEAR IN THE CATALOGUE as what they are:
-- `verify:policy` enumerates SECURITY DEFINER functions in `public`, so all four
-- are counted and all four have to be guarded by a test. A function hidden in
-- `app` is a function that gate cannot see — a recorded limit this project has
-- written down three times, and here it would have been self-inflicted.
--
-- THE GRANT IS THE CONTROL, and it is stated as a property rather than as a
-- list: nothing but `service_role` may execute these. `from public, anon,
-- authenticated` — PUBLIC first, because `anon` and `authenticated` INHERIT the
-- PUBLIC grant and revoking from them alone leaves it standing. That is row 3
-- and row 9 of CLAUDE.md's table, which this project has now paid for twice, and
-- `tests/db/scim.test.ts` reads the answer back out of the catalogue with
-- `has_function_privilege` rather than trusting this comment.

create or replace function public.scim_lookup(p_prefix text)
returns table (org_id uuid, token_hash text, revoked boolean, over_limit boolean)
language sql
security definer
set search_path = public, app, pg_temp
as $$ select * from app.scim_lookup(p_prefix) $$;

-- `nullif(p_error, '')` is not a nicety: `supabase gen types` cannot express SQL
-- nullability, so every argument arrives in TypeScript as non-nullable and the
-- caller would have to cast past the type to say «no error». Mapping the empty
-- string to NULL here states the convention in the one place both sides read,
-- instead of leaving a cast in the route that a reader has to trust.
create or replace function public.scim_touch(p_org uuid, p_error text)
returns void
language sql
security definer
set search_path = public, app, pg_temp
as $$ select app.scim_touch(p_org, nullif(p_error, '')) $$;

create or replace function public.scim_provision_user(
  p_org uuid, p_external_id text, p_email text, p_name text, p_active boolean)
returns uuid
language sql
security definer
set search_path = public, app, pg_temp
as $$ select app.scim_upsert_member(p_org, p_external_id, p_email, p_name, p_active) $$;

create or replace function public.scim_deprovision_user(p_org uuid, p_external_id text)
returns uuid
language sql
security definer
set search_path = public, app, pg_temp
as $$ select app.scim_deprovision_member(p_org, p_external_id) $$;

revoke all on function public.scim_lookup(text) from public, anon, authenticated;
revoke all on function public.scim_touch(uuid, text) from public, anon, authenticated;
revoke all on function public.scim_provision_user(uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.scim_deprovision_user(uuid, text) from public, anon, authenticated;

grant execute on function public.scim_lookup(text) to service_role;
grant execute on function public.scim_touch(uuid, text) to service_role;
grant execute on function public.scim_provision_user(uuid, text, text, text, boolean) to service_role;
grant execute on function public.scim_deprovision_user(uuid, text) to service_role;

comment on function public.scim_lookup(text) is
  'PostgREST entry point for app.scim_lookup — service_role only. The `app` '
  'schema is not exposed (measured: /rest/v1/rpc returns 404), and the route '
  'reaches this database through PostgREST like everything else.';
comment on function public.scim_touch(uuid, text) is
  'PostgREST entry point for app.scim_touch — service_role only.';
comment on function public.scim_provision_user(uuid, text, text, text, boolean) is
  'PostgREST entry point for app.scim_upsert_member — service_role only.';
comment on function public.scim_deprovision_user(uuid, text) is
  'PostgREST entry point for app.scim_deprovision_member — service_role only.';
