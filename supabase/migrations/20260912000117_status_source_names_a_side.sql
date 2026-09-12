-- ═══════════════════════════════════════════════════════════════════════════
-- M:0117 — `status_source` NAMES A SIDE, NOT A TRANSPORT.
--
-- Found by M:0116's first run: applying a page of Graph users failed with
--
--   new row for relation "org_members" violates check constraint
--   "org_members_status_source_check"
--
-- because `M:0109` wrote the constraint as `status_source in ('local','scim')`.
--
-- ── THAT IS CLAUDE.md's OWN SHAPE, IN A CHECK CONSTRAINT, AGAIN ───────────
--
-- «An enumeration mistaken for a property.» The two values were the transports
-- that existed the day it was written — the product, and SCIM — and the column
-- does not mean «which transport»: it means **which SIDE last wrote `status`**,
-- so that Q142 can tell an administrator their hand-set status will be written
-- back. There are two sides and there have only ever been two. Naming one of
-- them after a wire protocol is what made removing that protocol a schema
-- error.
--
-- V2-9 is the precedent and its lesson is applied rather than quoted: **fix the
-- column, not the predicate.** A third disjunct — `('local','scim','entra')` —
-- would have been the obvious repair and would have left the next directory to
-- break it again. `('local','directory')` cannot be broken by adding a
-- directory, because it was never about which one.
--
-- ── AND THE OTHER COLUMN ANSWERS THE OTHER QUESTION ───────────────────────
--
-- `org_members.source` is where the member came from and DOES name the
-- directory — 'entra', and one day perhaps 'google'. That is useful and stays
-- free-form: an organisation with two directories is a real thing, and the
-- screen needs to say WHICH one will overwrite a hand-set status. One column
-- per question, which is why widening `status_source` to carry both was the
-- wrong instinct.
--
-- WHO WRITES IT: `saveMemberStatus` writes 'local' (app/(app)/administrasjon/
-- actions.ts); `app.entra_apply_page` and `app.entra_finish_sync` write
-- 'directory'. Nothing else.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.org_members drop constraint if exists org_members_status_source_check;

-- Existing rows first, or the constraint refuses the table it is added to.
-- 'scim' was the only non-local value ever written, and the SCIM transport is
-- gone (M:0114) — so this is a rename of a value, not a migration of meaning.
update public.org_members set status_source = 'directory' where status_source = 'scim';

alter table public.org_members
  add constraint org_members_status_source_check
  check (status_source in ('local', 'directory'));

comment on column public.org_members.status_source is
  'WHICH SIDE last wrote `status`: ''local'' for a change made in Administrasjon, '
  '''directory'' for one written by a sync. NOT which transport and NOT which directory — '
  'the second question is `source`, which names the provider. M:0109 wrote this as '
  '(''local'',''scim'') and removing SCIM turned a value into a constraint violation; the '
  'rule is stated over the side because there have only ever been two of those. '
  'WHO WRITES IT: saveMemberStatus (''local''), app.entra_apply_page and '
  'app.entra_finish_sync (''directory'').';
