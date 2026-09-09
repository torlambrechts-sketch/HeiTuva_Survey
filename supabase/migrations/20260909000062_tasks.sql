-- V2-4 · Oppgaver. DECISIONS **Q68**, **Q69**, **Q70** — all three DEFAULTED rather than
-- answered (2026-09-08); `DECISIONS.md`'s header says what that means and V2-4's report
-- names them, which is where Tor reviews them.
--
-- ── THE CLOSE GUARD IS THE PHASE, AND CLAUDE.md ALREADY DECIDED ITS SHAPE ───
--
-- V2:5197: «Et tiltak kan ikke lukkes før effekten er vurdert. Det er kravet i aml. § 3-1 og
-- ldl. § 26 fjerde ledd.» That sentence is the feature's legal point, and enforcing it is
-- the one thing this phase must not get wrong.
--
-- **It is written as «nobody may close without an assessment», NOT as «reject any UPDATE».**
-- CLAUDE.md's referential-maintenance rule has now been rediscovered FIVE times — D50, D51,
-- D57, the duty-archive case, and V2-3b's FK pair, which then bit a second time in the same
-- migration when an audit trigger tried to write a row for an organisation already erased.
-- The failure is always the same: a blanket rejection collides with maintenance the DATABASE
-- issues on your behalf, and the symptom appears far from the trigger.
--
-- Here the maintenance is concrete: `owner_member_id` is `ON DELETE SET NULL`, so deleting a
-- member who owns a task is an UPDATE Postgres performs itself. A guard reading «reject any
-- UPDATE unless an assessment exists» would make **an owning member undeletable**, which is
-- a broken erasure path wearing a compliance rule's clothes — precisely V2-3b's finding one
-- table over. So the guard fires only on the transition it is about:
--
--     old.status is distinct from new.status and new.status = 'lukket'
--
-- Every other UPDATE — including the FK's own nulling — passes untouched, and
-- `tests/db/tasks.test.ts` deletes an owning member to prove it.
--
-- ── THE LIFECYCLE IS ORDERED, AND THE ORDER IS DATA ─────────────────────────
--
-- Six steps, transcribed from the bundle's own array (V2:5185):
--   Foreslått → Besluttet → Pågår → Gjennomført → Effektvurdert → Lukket
-- `onAdvance` (V2:5192-5195) moves FORWARD ONLY and stops at the last step; the drawing has
-- no backwards transition at all. Whether the product should is **Q97**, open with Tor, and
-- this migration is written so the answer is one predicate: `app.task_step_index` returns the
-- ordinal and the guard compares two of them.

-- 1. The vocabulary, as data --------------------------------------------------
-- CLAUDE.md's data-not-code rule: «statutory duties, report sections, quality-flag rules …
-- are data». A task's KIND is the same family — the bundle carries five (V2:4167-4174) and a
-- sixth is a row, not a component.
create table if not exists public.task_kinds (
  key        text primary key,
  sort_order int not null default 0
);

alter table public.task_kinds enable row level security;

comment on table public.task_kinds is
  'V2-4: the kinds of task the product recognises. Data, not code — a sixth kind is a row. '
  'Public by design like use_cases and segment_fields: a kind key holds no org id, no survey '
  'id and no count, asserted rather than trusted in tests/db/tasks.test.ts.';

drop policy if exists task_kinds_sel on public.task_kinds;
create policy task_kinds_sel on public.task_kinds for select using (true);
grant select on public.task_kinds to anon, authenticated;

insert into public.task_kinds (key, sort_order) values
  ('tiltak', 1), ('risikovurdering', 2), ('undersokelsesplikt', 3),
  ('leverandoroppfolging', 4), ('innsynskrav', 5)
on conflict (key) do update set sort_order = excluded.sort_order;

-- 2. The status enum, ordered -------------------------------------------------
do $$ begin
  create type app.task_status as enum
    ('foreslatt', 'besluttet', 'pagar', 'gjennomfort', 'effektvurdert', 'lukket');
exception when duplicate_object then null; end $$;

-- The ordinal, in ONE place. Every guard below compares indices returned by this function
-- rather than listing the steps again — a second copy of an order is an order that disagrees
-- with itself the first time a step is inserted.
create or replace function app.task_step_index(p_status app.task_status)
returns int
language sql immutable as $fn$
  select array_position(
    array['foreslatt','besluttet','pagar','gjennomfort','effektvurdert','lukket']::app.task_status[],
    p_status)
$fn$;

comment on function app.task_step_index(app.task_status) is
  'The lifecycle order, in one place. V2:5185 draws the same six steps; the guards compare '
  'indices from here rather than repeating the array.';

-- 3. Tasks --------------------------------------------------------------------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  title      text not null,
  kind       text not null references public.task_kinds(key),
  -- Q70: the legal basis REFERENCES the registry where a statutory duty applies, and is free
  -- text only where none does. Q35's precedent — data on the registry, never a string parsed
  -- at read time. NULL is the ordinary case: most tiltak have no hjemmel (V2:4173-4174 ship
  -- two with `law:""`).
  law_ref    text references public.duty_definitions(key) on delete restrict,
  -- Where the task came from. `source_kind` says which table `source_ref` points into, and
  -- the FK is deliberately NOT polymorphic: a survey is the only source this phase has, and
  -- an untyped uuid is how a task ends up referencing another organisation's row.
  source_kind text not null default 'manuell'
              check (source_kind in ('manuell', 'survey')),
  source_ref uuid references public.surveys(id) on delete set null,
  owner_member_id uuid references public.org_members(id) on delete set null,
  due_at     date,
  status     app.task_status not null default 'foreslatt',
  created_at timestamptz not null default now(),
  constraint tasks_source_ref_needs_kind
    check ((source_kind = 'survey') = (source_ref is not null))
);

create index if not exists tasks_org_status_idx on public.tasks (org_id, status);

alter table public.tasks enable row level security;

comment on table public.tasks is
  'V2-4: the statutory task register (V2:2152-2214). A task cannot reach `lukket` without a '
  'row in task_effect_assessments — V2:5197, enforced by app.guard_task_close, which fires '
  'ONLY on that transition so the database''s own FK maintenance passes through '
  '(CLAUDE.md, referential maintenance, fifth rediscovery).';

comment on column public.tasks.source_ref is
  'Q72: what a task may CONTAIN is decided there. This column holds a survey id and never a '
  'group, a question or a score. The FK is to public.surveys and not an untyped uuid, so a '
  'task cannot reference another organisation''s row even by mistake.';

-- 4. The effect assessment ----------------------------------------------------
create table if not exists public.task_effect_assessments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  round_id    uuid references public.survey_rounds(id) on delete set null,
  assessed_by uuid references public.org_members(id) on delete set null,
  assessed_at timestamptz not null default now(),
  note        text
);

create index if not exists task_effect_task_idx on public.task_effect_assessments (task_id);

alter table public.task_effect_assessments enable row level security;

comment on table public.task_effect_assessments is
  'V2:5197 — «Et tiltak kan ikke lukkes før effekten er vurdert.» The row whose EXISTENCE the '
  'close guard requires. `assessed_by` is ON DELETE SET NULL on purpose: a member leaving '
  'must not delete the record that the assessment happened, and must not block the task from '
  'closing either.';

-- 5. Policies ------------------------------------------------------------------
-- Reads: any member. A leser must see what the organisation owes; the register is the
-- compliance record, not a private queue.
drop policy if exists tasks_sel on public.tasks;
create policy tasks_sel on public.tasks for select using (app.is_org_member(org_id));

drop policy if exists tasks_ins on public.tasks;
create policy tasks_ins on public.tasks for insert
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

drop policy if exists tasks_upd on public.tasks;
create policy tasks_upd on public.tasks for update
  using (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

drop policy if exists tasks_del on public.tasks;
create policy tasks_del on public.tasks for delete
  using (app.has_role(org_id, array['administrator']::app.member_role[]));

drop policy if exists task_effect_sel on public.task_effect_assessments;
create policy task_effect_sel on public.task_effect_assessments for select
  using (exists (select 1 from public.tasks t
                  where t.id = task_id and app.is_org_member(t.org_id)));

drop policy if exists task_effect_ins on public.task_effect_assessments;
create policy task_effect_ins on public.task_effect_assessments for insert
  with check (exists (select 1 from public.tasks t
                       where t.id = task_id
                         and app.has_role(t.org_id,
                               array['administrator', 'redaktor']::app.member_role[])));

-- No update and no delete on an assessment, deliberately: it is the evidence a duty was
-- discharged. Recording one is a redaktør action; unrecording one is not an action at all.

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.task_effect_assessments to authenticated;

-- 6. The close guard, and the ORDER guard, both narrow ------------------------
create or replace function app.guard_task_close()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_from int := app.task_step_index(old.status);
  v_to   int := app.task_step_index(new.status);
begin
  -- The whole point of the shape. Anything that is not a status change — a retitle, a new
  -- owner, a due date, and CRUCIALLY the FK's own `owner_member_id := null` when a member is
  -- deleted — is none of this guard's business.
  if old.status is not distinct from new.status then
    return new;
  end if;

  -- Ordered, forward one step at a time. V2:5192-5195 advances by exactly one and stops at
  -- the end; skipping Foreslått → Gjennomført is not a shortcut, it is a claim that two steps
  -- happened.
  if v_to > v_from + 1 then
    raise exception 'task_step_skipped: % -> %', old.status, new.status
      using hint = 'A task advances one step at a time.';
  end if;

  -- Q97 (open with Tor): whether a task may move backwards, and out of `lukket` in
  -- particular. Until it is answered the migration takes the DRAWING's behaviour — forward
  -- only — because that is the only shape with evidence behind it. One predicate to change.
  if v_to < v_from then
    raise exception 'task_step_backwards: % -> %', old.status, new.status
      using hint = 'The lifecycle advances. Reopening is DECISIONS Q97 and is not decided.';
  end if;

  if new.status = 'lukket' and not exists (
       select 1 from public.task_effect_assessments a where a.task_id = new.id) then
    raise exception 'task_close_needs_effect_assessment'
      using hint = 'V2:5197 — a tiltak cannot be closed before its effect is assessed.';
  end if;

  return new;
end $fn$;

drop trigger if exists guard_task_close on public.tasks;
create trigger guard_task_close
  before update on public.tasks
  for each row execute function app.guard_task_close();

-- 7. Q68 — `loop_actions` is superseded, migrated and retired ------------------
-- `text → title`, `done → Lukket`. Not run in parallel: two stores of the same fact disagree
-- the first time one is written alone, which is Q61's reasoning one surface over.
--
-- A migrated `done` row arrives at `lukket` WITHOUT an effect assessment, and the guard would
-- refuse it — so the rows are INSERTED at their final status rather than advanced into it.
-- The guard is on UPDATE and this is an INSERT, which is the honest reading: these tasks were
-- closed under a mechanism that had no assessment step, and inventing an assessment row for
-- them would be the never-fabricate rule broken on a compliance record.
insert into public.tasks (org_id, title, kind, source_kind, source_ref, owner_member_id, due_at, status, created_at)
select la.org_id,
       la.text,
       'tiltak',
       case when la.survey_id is null then 'manuell' else 'survey' end,
       la.survey_id,
       la.owner_member_id,
       la.due_at,
       case when la.done then 'lukket' else 'pagar' end::app.task_status,
       la.created_at
  from public.loop_actions la
 where not exists (
   select 1 from public.tasks t
    where t.org_id = la.org_id and t.title = la.text and t.created_at = la.created_at);

drop table if exists public.loop_actions;
