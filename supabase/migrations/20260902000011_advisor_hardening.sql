-- HeiTuva 0011 — security-advisor hardening
--
-- Two findings from the Supabase security advisors on the first remote apply.
-- 0001 and 0009 are already applied remotely, so these are corrected forward
-- rather than by editing those files (CLAUDE.md rule 8).

-- 1) anon could execute the result RPCs -------------------------------------
-- 0009 intends these for signed-in users: it revokes from PUBLIC and grants to
-- authenticated. But Supabase's default privileges grant EXECUTE to `anon` at
-- CREATE time, and revoking from the PUBLIC pseudo-role does not drop a grant
-- held explicitly by the `anon` role, so anon kept EXECUTE.
--
-- Not an open door on its own: both RPCs return 'forbidden' for anon because
-- app.is_org_member() is false when auth.uid() is null. This restores the
-- defence-in-depth the migration was written to provide.
revoke execute on function public.aggregate_results(uuid, uuid, uuid) from anon;
revoke execute on function public.get_quotes(uuid, uuid, uuid, int) from anon;
-- get_survey_for_token and submit_response deliberately KEEP anon EXECUTE:
-- the respondent flow at /s/[token] is unauthenticated by design.

-- 2) Mutable search_path on the app.* helpers --------------------------------
-- pg_catalog stays implicitly searchable under search_path = '', so encode()
-- and now() still resolve; everything else is schema-qualified.
--
-- app.hash_token is the one that matters: it resolves digest() from pgcrypto,
-- which Supabase installs into the `extensions` schema. With a mutable path it
-- inherited the caller's session search_path. Output is byte-identical, so
-- previously stored token hashes remain valid.
create or replace function app.hash_token(raw text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(raw, 'sha256'), 'hex')
$$;

create or replace function app.k_threshold() returns int
language sql immutable set search_path = '' as $$ select 5 $$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function app.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_events is append-only'; end $$;
