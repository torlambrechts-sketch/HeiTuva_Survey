-- S3 item 2 — `org_members.group_id` becomes writable, so its tenancy stops
-- being theoretical.
--
-- ── WHY THIS MIGRATION EXISTS AT ALL ──────────────────────────────────────
--
-- The audit recorded, as a LIMITATION rather than a defect (`A7a-10`), that
-- `tests/db/fk-tenancy.test.ts` «reasons about the tenancy risk of six columns
-- no code ever writes; every one of its reasons is correct about a case that
-- cannot arise». `org_members.group_id` was one of those six. It had no writer
-- — that was the audit's lead finding — so a cross-tenant value could only be
-- produced from psql.
--
-- The server action added in this same change makes it writable. The case can
-- arise now. A finding that was correct-but-unreachable becomes correct-and-
-- reachable the moment the writer lands, which is exactly the wrong moment to
-- discover it, so the constraint goes in beside the writer rather than after it.
--
-- The action already checks that the group belongs to the administrator's
-- organisation, and RLS already refuses a group they cannot see. Neither is the
-- rule: an application check is a rule about one code path, and this project
-- has now been bitten three times by reasoning about the path instead of the
-- state. The composite key is the rule.
--
-- ── THE SHAPE, WHICH IS THE ONE M:0065 SETTLED ────────────────────────────
--
-- `(group_id, org_id) references groups(id, org_id)` — a member's group must be
-- a group in the member's own organisation, and the database is what says so.
--
-- `on delete set null (group_id)` names the column, which is the PostgreSQL 15
-- form M:0065 landed on: null the reference, keep the tenant. Without the
-- column list, deleting a group would try to null `org_id` too, and a member
-- with no organisation is not a member. The previous key was
-- `references groups(id) on delete set null`, which nulled the right column for
-- the wrong reason — it only had one to null.
--
-- Deleting a group therefore still empties it rather than being refused, which
-- is the behaviour the Grupper card's × already implies, and erasure still
-- wins over referential nostalgia (V2-3b, M:0059).

-- `groups.id` is already the primary key, so `unique (id, org_id)` adds no
-- constraint anyone can violate; it exists because a composite foreign key
-- needs a matching unique index to point at. Same reasoning as M:0063 for
-- `surveys` and M:0064 for `org_members`.
alter table public.groups
  drop constraint if exists groups_id_org_uniq;
alter table public.groups
  add constraint groups_id_org_uniq unique (id, org_id);

alter table public.org_members
  drop constraint if exists org_members_group_id_fkey;
alter table public.org_members
  add constraint org_members_group_id_fkey
  foreign key (group_id, org_id) references public.groups(id, org_id)
  on delete set null (group_id);

comment on column public.org_members.group_id is
  'The one group this member is counted in. Scalar on purpose (DECISIONS Q92): '
  'k does not compose, so each respondent must contribute to exactly one '
  'breakdown. WHO WRITES IT: setMemberGroup in app/(app)/administrasjon/'
  'actions.ts, from the group select on the Brukere row (S3, D125) — and, in '
  'development, scripts/seed-demo.ts. Until S3 the seed was the ONLY writer, '
  'which is why every group count rendered 0 on a real organisation while every '
  'gate stayed green.';
