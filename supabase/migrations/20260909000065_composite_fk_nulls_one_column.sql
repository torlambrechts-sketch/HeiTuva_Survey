-- V2-4 · CLAUDE.md's referential-maintenance rule, THIRD FORM, and this one was
-- introduced by the fix for a different problem.
--
-- ── WHAT TEST 3 CAUGHT, AGAIN ──────────────────────────────────────────────
--
-- `M:0063` and `M:0064` made three foreign keys COMPOSITE so a reference cannot
-- cross a tenancy boundary. Both wrote `on delete set null`. On a composite key
-- that means **null every referencing column**, `org_id` included — and
-- `org_id` is `not null` on all three tables. So deleting a member who owns a
-- task failed with `23502`, not_null_violation:
--
--     × 3. BLOCKER — deleting the OWNING member succeeds …
--       → the member can be deleted: expected { code: '23502' } to be null
--
-- **The rule's third form in one phase.** First the guard written as «reject
-- any UPDATE», caught by the mutation round. Then this: a TENANCY fix colliding
-- with the database's own `SET NULL` maintenance. Both times the symptom was a
-- parent row that could not be deleted, and both times the test that found it
-- was the one written for the note rather than for the feature.
--
-- PostgreSQL 15 added the column list — `on delete set null (col)` — which says
-- the thing that was meant: **null the reference, keep the tenant.** Without it
-- the choice is between a boundary that cannot be crossed and a member who
-- cannot be deleted, and this project has already decided that erasure wins
-- that trade (V2-3b, `M:0059`).

alter table public.tasks
  drop constraint if exists tasks_owner_member_id_fkey;
alter table public.tasks
  add constraint tasks_owner_member_id_fkey
  foreign key (owner_member_id, org_id) references public.org_members(id, org_id)
  on delete set null (owner_member_id);

alter table public.duties
  drop constraint if exists duties_owner_member_id_fkey;
alter table public.duties
  add constraint duties_owner_member_id_fkey
  foreign key (owner_member_id, org_id) references public.org_members(id, org_id)
  on delete set null (owner_member_id);

-- `M:0063`'s key has the same defect and nothing had deleted a survey yet to
-- find it. Fixed here rather than left for the seed to hit.
alter table public.tasks
  drop constraint if exists tasks_source_ref_fkey;
alter table public.tasks
  add constraint tasks_source_ref_fkey
  foreign key (source_ref, org_id) references public.surveys(id, org_id)
  on delete set null (source_ref);
