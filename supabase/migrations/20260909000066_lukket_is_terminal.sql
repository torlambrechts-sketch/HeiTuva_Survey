-- V2-4 · DECISIONS **Q97 — CONFIRMED (Tor): Lukket is TERMINAL. No reopening.**
--
-- ── THE PRECEDENT I BORROWED WAS THE WRONG ONE, AND THAT IS THE RECORD ─────
--
-- I recommended reopen-with-audit on Q96's reasoning. Tor: «Q96 was about
-- lifting a restriction on the organisation's own behaviour, where the failure
-- is a person permanently blocked by a typo. A closed task is the opposite: a
-- record asserting a duty was discharged, with an effect assessment saying
-- somebody looked. Undoing it is not restoring capability, it is editing a
-- compliance record after the fact.»
--
-- And the argument that settles it: **«Closed 14 March» and «closed 14 March,
-- reopened 2 April, closed again 11 June» are different answers to an
-- inspector, and a system where the first can become the second means neither
-- can be relied on. Reopen-with-audit preserves the trail but makes every
-- closure provisional — and a provisional discharge of a statutory duty is not
-- a discharge.**
--
-- The asymmetry is why it goes this way and not the other: if a lawyer later
-- says reopening is acceptable, that is a decision with a migration behind it.
-- Finding that reopened closures undermined the record is not recoverable.
--
-- The guard in `M:0062` already refuses backwards transitions, so the DECISION
-- is what this migration adds — plus the remedy that makes the refusal
-- workable, because a rule with no way to correct an error is a rule people
-- work around.
--
-- ── THE REMEDY IS A NEW TASK REFERENCING THE OLD, SO THE REFERENCE EXISTS ───
--
-- Tor named it: «a new task referencing the old. Both records survive, the
-- error and the correction are both visible, and it reads correctly to an
-- outside reader. It costs a row.» The confirmation dialogue says exactly that,
-- so the column has to be real — a screen promising a remedy the schema cannot
-- express is the defect this phase has already hit twice (Teams, weekly_digest).
--
-- COMPOSITE from the start, `on delete set null (corrects_task_id)`: both
-- lessons from this phase applied where a new key is written rather than after
-- a test finds them.
alter table public.tasks
  add column if not exists corrects_task_id uuid;

alter table public.tasks
  drop constraint if exists tasks_id_org_uniq;
alter table public.tasks
  add constraint tasks_id_org_uniq unique (id, org_id);

alter table public.tasks
  drop constraint if exists tasks_corrects_task_id_fkey;
alter table public.tasks
  add constraint tasks_corrects_task_id_fkey
  foreign key (corrects_task_id, org_id) references public.tasks(id, org_id)
  on delete set null (corrects_task_id);

-- A task cannot correct itself. Cheap, and the alternative is a row that reads
-- as its own correction to anyone auditing the register.
alter table public.tasks
  drop constraint if exists tasks_corrects_not_self;
alter table public.tasks
  add constraint tasks_corrects_not_self
  check (corrects_task_id is null or corrects_task_id <> id);

comment on column public.tasks.corrects_task_id is
  'Q97: Lukket is terminal, so an error is corrected by a NEW task referencing '
  'the closed one. Both records survive and both are visible to an outside '
  'reader — which is the property reopening would have destroyed. Composite FK '
  'so a correction cannot reference another organisation''s task.';
