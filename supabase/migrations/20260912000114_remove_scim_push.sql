-- ═══════════════════════════════════════════════════════════════════════════
-- M:0114 — REMOVE THE SCIM PUSH ENDPOINT. A decision, not cleanup.
--
-- I2's direction: users and groups are PULLED from Microsoft Graph on our own
-- multi-tenant app registration, with the customer's administrator consenting
-- once. SCIM push solved the same problem by asking the customer's IT to
-- configure a provisioning job and paste a bearer token into it.
--
-- ── WHY THE PUSH GOES RATHER THAN BOTH BEING KEPT ─────────────────────────
--
-- **Two write paths into `org_members` are two places the authorisation can be
-- wrong.** That is the same argument that decided one column has one writer
-- (CLAUDE.md, invariant 8), applied to a table instead of a column. It is not
-- an argument about effort: a second path is a second thing every future
-- role change, every deprovisioning guard and every tenancy test has to be
-- true of, and the one that is exercised least is the one that drifts.
--
-- The cost of removing it is zero TODAY and rising weekly: the endpoint was
-- never deployed (`M:0111`'s sync note — «the app deploy is a decision and not
-- mine, so the schema is ahead of its code»), and no customer has configured a
-- provisioning against it. `scim_credentials` holds exactly one row on the
-- demo seed and none in production.
--
-- ── WHAT STAYS, AND IT IS THE REASON THIS IS NOT A ROLLBACK ────────────────
--
-- `M:0109`'s four columns on `org_members` — `external_id`, `synced_at`,
-- `source`, `status_source` — ALL STAY. They describe **a member sourced from a
-- directory**, and that is direction-agnostic: pull writes every one of them.
-- The schema did not know it was SCIM-specific.
--
-- `status_source` already has a reader that has nothing to do with SCIM:
-- Q142's «Endret her — Entra ID overskriver ved neste synkronisering» on
-- Administrasjon → Brukere, which tells an administrator why a status they set
-- by hand will be written back. That sentence stays true under pull, for the
-- same reason and with the same words.
--
-- So what is removed is the TRANSPORT — an authenticated inbound HTTP surface,
-- its credential, and the functions that existed to serve it. What the product
-- knows about a directory-sourced member is untouched.
--
-- ── THE TWO CARRIED NUMBERS FALL, AND THAT IS A MEASUREMENT ────────────────
--
-- Gate 5a3 goes **80 of 110 → 72 of 102**: `scim_credentials` plus the seven
-- `public.scim_*` / `*_scim_token` functions were eight CHECKED surfaces, and
-- they are gone rather than unproven. The census goes **1325 → 1288**:
-- `tests/db/scim.test.ts` (14) and `tests/db/scim-endpoint.test.ts` (23).
--
-- This is the FIRST DELIBERATE DECREASE in either number, and it is why
-- CLAUDE.md's rule was rewritten in the same commit: «may only move up» is a
-- target expressed as a counter, and a counter can be satisfied by making the
-- product worse. The rule is now that a number may move either way and must
-- never move without the derivation beside it. See DECISIONS Q163.
--
-- The four `app.scim_*` functions were never in 5a3's denominator at all —
-- neither sweep enumerates the `app` schema — so they leave it unmoved, which
-- is the same recorded limit of that gate, one last time.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The public API surface. Dropped by identity, derived from pg_proc rather
--    than copied from the migrations that created them, so a signature that
--    drifted is still named here.
drop function if exists public.create_scim_token();
drop function if exists public.revoke_scim_token();
drop function if exists public.scim_connection_status();
drop function if exists public.scim_provision_user(p_org uuid, p_external_id text, p_email text, p_name text, p_active boolean);
drop function if exists public.scim_deprovision_user(p_org uuid, p_external_id text);
drop function if exists public.scim_lookup(p_prefix text);
drop function if exists public.scim_touch(p_org uuid, p_error text);

-- 2. The app-schema half.
drop function if exists app.scim_upsert_member(p_org uuid, p_external_id text, p_email text, p_name text, p_active boolean);
drop function if exists app.scim_deprovision_member(p_org uuid, p_external_id text);
drop function if exists app.scim_lookup(p_prefix text);
drop function if exists app.scim_touch(p_org uuid, p_error text);

-- 3. The credential. No policy to drop — the table shipped with RLS on and NO
--    policy, deliberately, because its rows are readable by nothing but a
--    definer function. Two outgoing FKs go with it.
drop table if exists public.scim_credentials;

-- 4. The columns STAY. Their comments are restated so that a reader arriving
--    after this migration does not find four columns whose comments name a
--    transport that no longer exists — which is exactly how a column ends up
--    looking orphaned and gets removed by someone tidying.
comment on column public.org_members.external_id is
  'The directory''s own id for this person, stable across renames and address changes. '
  'Written by the Entra PULL sync (I2). Direction-agnostic: it was introduced by M:0109 for '
  'SCIM push and survives its removal unchanged, because it describes a member sourced from a '
  'directory rather than the transport that sourced them.';

comment on column public.org_members.synced_at is
  'When the directory last confirmed this member. Written by the Entra pull sync. NULL means '
  'no directory has ever claimed this row — a hand-invited member, which is the ordinary case.';

comment on column public.org_members.source is
  'Where the member came from: ''local'' for hand-invited, otherwise the directory that '
  'supplied them. Not a kind discriminator and not an authorisation input — role is decided '
  'here and never by a directory attribute (Q139).';

comment on column public.org_members.status_source is
  'Which side last wrote `status`: ''local'' for a change made in Administrasjon, otherwise '
  'the directory. Q142 reads it to tell an administrator that a hand-set status will be '
  'written back on the next sync — «Endret her — Entra ID overskriver ved neste '
  'synkronisering» — because otherwise they watch their own change disappear with no '
  'explanation. That sentence is true under pull for the same reason it was under push.';
