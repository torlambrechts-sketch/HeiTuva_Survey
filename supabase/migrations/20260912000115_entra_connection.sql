-- ═══════════════════════════════════════════════════════════════════════════
-- M:0115 — THE ENTRA CONNECTION, AND THE FIRST LONG-LIVED THIRD-PARTY
-- CREDENTIAL THIS PRODUCT HAS HELD.
--
-- Every secret in this schema until now has been a HASH — `token_hash` on
-- `survey_invitations`, `share_links`, `report_shares`. A hash verifies a token
-- somebody presents and cannot produce one. **A refresh token must come back out
-- in cleartext**, because it is sent to Microsoft to mint an access token. That
-- one property makes this a different kind of row from anything before it, and
-- it decides the whole shape below.
--
-- ── WHERE THE TOKEN LIVES: `vault`, NOT A COLUMN ──────────────────────────
--
-- Tor's decision (I2-1), on the reasoning that decided it:
--   * it never appears in a migration,
--   * it never appears in a backup dump of `public`,
--   * it never appears in a `select *`.
-- `pgcrypto` in a column of this table would satisfy none of those three: the
-- ciphertext would be in the dump, and the key would have to live somewhere a
-- migration could see.
--
-- `M:0095`'s `mail_worker_secret()` is the tested precedent, and it earned it
-- the hard way: 5a3 flagged it protected-but-unproven **precisely because its
-- return value IS a credential**. Same posture here — SECURITY DEFINER, granted
-- to `service_role` and to nothing else, and not exposed in `public` at all so
-- PostgREST has no route to it.
--
-- ── WHO WRITES EACH COLUMN ────────────────────────────────────────────────
--
-- CLAUDE.md invariant 8, answered here rather than when something looks wrong:
--
--   tenant_id, scopes, secret_id, consented_at, consented_by
--       -> app.entra_store_connection, called by the consent callback with the
--          service role. Nothing else writes them; re-consenting replaces them.
--   last_sync_at, last_sync_error, last_sync_error_at, consecutive_errors,
--   members_seen, members_with_department
--       -> app.entra_record_sync, called by the sync worker at the END of every
--          run, success or failure. It is the ONLY writer of the error column,
--          which is what makes «a token cannot arrive by being appended to a
--          message» a property rather than a hope.
--   org_id  -> both, as the key.
--
-- ── ONE CONNECTION PER ORGANISATION, AND IT IS THE PRIMARY KEY ────────────
--
-- Not a surrogate id with a unique index: a second connection for one
-- organisation is not a state this product has a meaning for, and a primary key
-- says so in a way a unique index invites someone to relax.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.entra_connections (
  -- A SURROGATE KEY THIS TABLE DOES NOT NEED, and it is here for the gate
  -- rather than for the model. Gate 5a3 probes every RLS table with
  -- `select id from <table> where org_id = <another org>` to prove the policy
  -- refuses; a table with no `id` crashes the sweep. The apparatus is frozen
  -- (CLAUDE.md), so the table conforms rather than the gate.
  --
  -- That assumption is itself an enumeration — «every org-scoped RLS table has
  -- an id» was true of the forty that existed — and it is LOGGED rather than
  -- fixed here, because fixing a gate mid-phase is the thing the freeze is for.
  --
  -- The model's claim survives in `unique (org_id)` below: one connection per
  -- organisation, still enforced by the database. A unique index is a weaker
  -- statement than a primary key only in how loudly it says so.
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null unique references public.organizations(id) on delete cascade,

  -- The Entra tenant's own GUID. NOT a secret — it identifies a directory, it
  -- does not authenticate to one — and it is rendered on the detail page so an
  -- administrator can confirm they consented for the right tenant.
  tenant_id   text not null check (length(btrim(tenant_id)) between 1 and 200),

  -- What the customer's administrator actually consented to, recorded as given
  -- rather than as requested. `Directory.Read.All` is deliberately not asked
  -- for: two permissions cover users and groups, and a permission an
  -- administrator must approve is one that has to be defensible line by line.
  scopes      text[] not null check (cardinality(scopes) between 1 and 10),

  -- The vault row holding the refresh token. A HANDLE, never the token. Kept as
  -- the vault's own id rather than a name, so a rename cannot silently point
  -- this row at a different secret.
  secret_id   uuid not null,

  consented_at timestamptz not null default now(),
  -- COMPOSITE, not a plain reference to org_members(id). `verify:db`'s
  -- fk-tenancy class caught the single-column form on its first run: a bare
  -- `org_members(id)` lets this row record a consent given by a member of
  -- ANOTHER organisation, which would put a foreign name on our own audit
  -- trail. `M:0111` made the SCIM equivalent composite for the same reason and
  -- `M:0065` is where the pattern was settled.
  --
  -- `on delete set null (consented_by)` nulls ONE column: `org_id` is the
  -- primary key here and nulling it would be a different kind of wrong. The
  -- record that a consent happened survives the person who gave it leaving,
  -- which is the same choice `task_effect_assessments.assessed_by` made.
  consented_by uuid,

  last_sync_at       timestamptz,
  last_sync_error    text,
  last_sync_error_at timestamptz,
  consecutive_errors int not null default 0,

  -- The department-coverage numbers the screen renders after a sync («84 av 92
  -- fikk avdeling. Åtte mangler»). Stored rather than recomputed because they
  -- describe THE LAST SYNC, and a number recomputed from today's members would
  -- silently answer a different question.
  members_seen            int,
  members_with_department int,

  created_at timestamptz not null default now(),

  constraint entra_connections_consented_by_in_tenant
    foreign key (consented_by, org_id) references public.org_members(id, org_id)
    on delete set null (consented_by),

  constraint entra_connections_department_within_seen
    check (members_with_department is null or members_seen is null
           or members_with_department <= members_seen)
);

alter table public.entra_connections enable row level security;

-- NO POLICY. Not «no select policy» — none at all, the same as
-- `scim_credentials` had and for the same reason: every read goes through a
-- definer function that returns metadata and never the handle. A policy that
-- exists is a policy a later migration can widen while meaning well.

-- AND THE GRANTS ARE REVOKED EXPLICITLY, which no other table in this schema
-- does. Supabase ships `alter default privileges in schema public grant all on
-- tables to anon, authenticated`, so every table here starts with anon holding
-- DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and UPDATE. RLS with no
-- policy already refuses all seven — but **this table holds the handle to a
-- live credential, and a control that depends on exactly one mechanism is one
-- migration away from depending on none.** A grant is a fact about the
-- catalogue (CLAUDE.md rows 3 and 9), so it is stated in the catalogue rather
-- than inferred from the absence of a policy. The test reads it back.
revoke all on public.entra_connections from anon, authenticated;

comment on table public.entra_connections is
  'I2-1: one Entra ID connection per organisation. The refresh token is NOT here — it lives '
  'in vault.secrets and this row holds only its id. RLS is on with NO policy: reads go '
  'through public.entra_connection_status (metadata only) and the token through '
  'app.entra_refresh_token (service_role only), which is mail_worker_secret''s posture.';

comment on column public.entra_connections.secret_id is
  'A HANDLE into vault.secrets, never the token. THE VAULT IS OUTSIDE THE FOREIGN-KEY GRAPH — '
  'nothing in public references it — so no cascade reaches the secret and the trigger below '
  'is the only thing that keeps one from being orphaned when this row goes.';

-- ── The vault is not tidied by the database, so tidy it here ───────────────
--
-- CLAUDE.md's referential-maintenance family, arriving through a construct that
-- is none of the four it already lists — not a trigger scope, not a foreign
-- key, not a CHECK, but A TABLE IN ANOTHER SCHEMA THE FK GRAPH DOES NOT REACH.
-- Deleting an organisation cascades to this row; without this trigger the
-- secret would survive its own connection, in a schema nobody looks at, holding
-- a live credential for a customer who has been erased.
--
-- AFTER DELETE, so it runs once the row is actually gone and a rollback takes
-- the vault write with it.
create or replace function app.entra_drop_secret()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end $$;

drop trigger if exists entra_connections_drop_secret on public.entra_connections;
create trigger entra_connections_drop_secret
  after delete on public.entra_connections
  for each row execute function app.entra_drop_secret();

-- ── Writing a connection ──────────────────────────────────────────────────
create or replace function app.entra_store_connection(
  p_org uuid, p_tenant text, p_scopes text[], p_token text, p_by uuid
) returns void language plpgsql security definer
set search_path = ''
as $$
declare v_secret uuid; v_old uuid;
begin
  -- Re-consenting replaces the token rather than accumulating secrets: the old
  -- vault row is dropped by the same trigger, through the delete below.
  select secret_id into v_old from public.entra_connections where org_id = p_org;
  if v_old is not null then
    delete from public.entra_connections where org_id = p_org;
  end if;

  v_secret := vault.create_secret(
    p_token,
    'entra_refresh_token:' || p_org::text,
    'Entra ID refresh token. Readable only by app.entra_refresh_token (service_role).');

  insert into public.entra_connections (org_id, tenant_id, scopes, secret_id, consented_by)
  values (p_org, p_tenant, p_scopes, v_secret, p_by);
end $$;

comment on function app.entra_store_connection(uuid, text, text[], text, uuid) is
  'Written by the consent callback with the service role. Replaces any existing connection, '
  'so re-consenting cannot leave a second live token behind.';

-- ── Reading the token: the one function whose return value IS a credential ──
create or replace function app.entra_refresh_token(p_org uuid)
returns text language sql stable security definer
set search_path = ''
as $$
  select s.decrypted_secret
    from public.entra_connections c
    join vault.decrypted_secrets s on s.id = c.secret_id
   where c.org_id = p_org;
$$;

comment on function app.entra_refresh_token(uuid) is
  'THE RETURN VALUE IS A CREDENTIAL. In `app` rather than `public` so PostgREST has no route '
  'to it at all, and granted to service_role alone. mail_worker_secret''s posture, and it is '
  'the reason 5a3 flagged that one as protected-but-unproven.';

revoke all on function app.entra_refresh_token(uuid) from public, anon, authenticated;
revoke all on function app.entra_store_connection(uuid, text, text[], text, uuid) from public, anon, authenticated;
grant execute on function app.entra_refresh_token(uuid) to service_role;
grant execute on function app.entra_store_connection(uuid, text, text[], text, uuid) to service_role;

-- ── Recording what a sync did ─────────────────────────────────────────────
--
-- The ONLY writer of `last_sync_error`, and it BOUNDS what it stores. A
-- provider error is third-party text; bounding it is what makes «a token cannot
-- arrive by being appended to a message» a property of the schema rather than a
-- promise about the caller.
create or replace function app.entra_record_sync(
  p_org uuid, p_error text, p_seen int, p_with_department int
) returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.entra_connections set
    last_sync_at = case when p_error is null then now() else last_sync_at end,
    last_sync_error = left(p_error, 500),
    last_sync_error_at = case when p_error is null then null else now() end,
    -- A failure INCREMENTS rather than setting 1, so «erroring since Tuesday»
    -- is distinguishable from «failed once just now». That difference is the
    -- whole reason the Integrasjoner screen has a «Feiler» state (D163).
    consecutive_errors = case when p_error is null then 0 else consecutive_errors + 1 end,
    members_seen = coalesce(p_seen, members_seen),
    members_with_department = coalesce(p_with_department, members_with_department)
  where org_id = p_org;
end $$;

revoke all on function app.entra_record_sync(uuid, text, int, int) from public, anon, authenticated;
grant execute on function app.entra_record_sync(uuid, text, int, int) to service_role;

-- ── What a screen may read ────────────────────────────────────────────────
--
-- Metadata only. `secret_id` is not in the row type at all — not excluded by a
-- column list somebody can extend, but absent from the signature.
create or replace function public.entra_connection_status()
returns table (
  configured boolean, tenant_id text, scopes text[],
  consented_at timestamptz, last_sync_at timestamptz,
  last_sync_error text, last_sync_error_at timestamptz, consecutive_errors int,
  members_seen int, members_with_department int
) language plpgsql stable security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  -- The organisation is resolved from the CALLER, never from an argument, so
  -- there is no id to tamper with — the shape scim_connection_status used and
  -- the reason cross-tenant reads need no separate guard.
  select m.org_id into v_org
    from public.org_members m
   where m.user_id = auth.uid() and m.status = 'active'
   limit 1;
  if v_org is null then return; end if;
  if not app.has_role(v_org, array['administrator']::app.member_role[]) then return; end if;

  return query
    select true, c.tenant_id, c.scopes, c.consented_at, c.last_sync_at,
           c.last_sync_error, c.last_sync_error_at, c.consecutive_errors,
           c.members_seen, c.members_with_department
      from public.entra_connections c where c.org_id = v_org;
end $$;

revoke all on function public.entra_connection_status() from public, anon;
grant execute on function public.entra_connection_status() to authenticated;

-- ── Disconnecting ─────────────────────────────────────────────────────────
create or replace function public.disconnect_entra()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  select m.org_id into v_org
    from public.org_members m
   where m.user_id = auth.uid() and m.status = 'active'
   limit 1;
  if v_org is null or not app.has_role(v_org, array['administrator']::app.member_role[]) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  -- The trigger takes the vault row with it.
  delete from public.entra_connections where org_id = v_org;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.disconnect_entra() from public, anon;
grant execute on function public.disconnect_entra() to authenticated;

-- ── The public wrapper the consent callback calls ─────────────────────────
--
-- `app.*` is not on PostgREST's search path, so a server action cannot reach
-- `app.entra_store_connection` at all — which is right for the DECRYPTING
-- function and wrong for the writing one: the consent callback runs on our
-- server, holds the token Microsoft just handed it, and has to put it
-- somewhere.
--
-- So one wrapper, `public`, revoked from every client role and granted to
-- `service_role` alone. The token travels in the request body of a call our own
-- server makes to our own database over TLS — the same path the mail worker's
-- payload takes. It is NOT reachable by a signed-in administrator: a session
-- that could store an arbitrary refresh token for its own organisation could
-- store one pointing at a directory it does not own.
create or replace function public.store_entra_connection(
  p_org uuid, p_tenant text, p_scopes text[], p_token text, p_by uuid
) returns void language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.entra_store_connection(p_org, p_tenant, p_scopes, p_token, p_by);
end $$;

revoke all on function public.store_entra_connection(uuid, text, text[], text, uuid)
  from public, anon, authenticated;
grant execute on function public.store_entra_connection(uuid, text, text[], text, uuid)
  to service_role;
