-- V2-4 · the plan's test 8, made true.
--
-- ── WHAT THE VERIFICATION PASS FOUND, AND WHY THE PLAN WAS WRONG ────────────
--
-- `03-plan.md` V2-4, test 8: «`source_ref` pointing at another org's survey →
-- **refused by the FK**.» It is not. A plain `references public.surveys(id)`
-- admits any survey in the instance, because a foreign key constrains
-- EXISTENCE and not TENANCY — and RLS on `tasks` checks `tasks.org_id`, never
-- what `source_ref` points at. Measured: a redaktør of Nordisk Studio created a
-- task in Nordisk Studio whose `source_ref` was Annen Bedrift's survey, and
-- nothing refused it.
--
-- The disclosure is small — a uuid, with the survey behind it still unreadable
-- — but this project's rule is that a tenancy boundary is STRUCTURAL rather
-- than incidental, and «small» is what every boundary hole looks like before
-- somebody joins two of them.
--
-- ── THE FIX MAKES IT UNREPRESENTABLE RATHER THAN FILTERED ───────────────────
--
-- Q93's reasoning, one table over: a predicate every writer must remember is a
-- predicate a later writer forgets. A COMPOSITE foreign key carries the
-- organisation into the reference itself, so a cross-tenant `source_ref` cannot
-- be written by any caller, present or future — no trigger, no policy, nothing
-- to remember.
--
-- `surveys.id` is already the primary key, so `unique (id, org_id)` is
-- redundant as a constraint and necessary as a TARGET: Postgres requires a
-- unique index over exactly the referenced columns. It costs one index and buys
-- a boundary that cannot be crossed.

alter table public.surveys
  drop constraint if exists surveys_id_org_uniq;
alter table public.surveys
  add constraint surveys_id_org_uniq unique (id, org_id);

comment on constraint surveys_id_org_uniq on public.surveys is
  'Redundant as a uniqueness claim — id is already the primary key — and '
  'required as the TARGET of tenancy-scoped composite foreign keys. The first '
  'is public.tasks(source_ref, org_id).';

alter table public.tasks
  drop constraint if exists tasks_source_ref_fkey;
alter table public.tasks
  add constraint tasks_source_ref_fkey
  foreign key (source_ref, org_id) references public.surveys(id, org_id)
  on delete set null;

comment on column public.tasks.source_ref is
  'Q72: what a task may CONTAIN is decided there. This column holds a survey id '
  'and never a group, a question or a score. The foreign key is COMPOSITE — '
  '(source_ref, org_id) -> surveys(id, org_id) — so a task cannot reference '
  'another organisation''s survey at all, rather than being prevented from it '
  'by a predicate somebody has to remember (`M:0063`).';
