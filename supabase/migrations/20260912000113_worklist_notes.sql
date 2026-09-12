-- ═══════════════════════════════════════════════════════════════════════════
-- M:0113 — «Interne notater», the one thing v5's row model needs that has no
-- table behind it.
--
-- v5:3324-3348 draws a notes block on EVERY expanded row, task and feedback
-- alike: `r.notes`, `r.hasNotes`, `r.noteDraft`, `r.onNoteSave`. C4's screen has
-- no such thing and no migration holds one, so this is the phase's database
-- half — built before the UI, per CLAUDE.md's constraint, rather than a column
-- added afterwards to make a screen work.
--
-- ── WHO WRITES THIS TABLE ──────────────────────────────────────────────────
--
-- CLAUDE.md's standing question, answered in the migration that adds the
-- table rather than when something looks wrong later: `addWorklistNote` in
-- `app/(app)/oppgaver/actions.ts`, added in THIS commit, and
-- `tests/db/worklist-notes.test.ts` asserts the action exists and that the
-- table is reachable from no other writer. The demo seed carries two notes so
-- the `hasNotes` branch is reachable without hand-writing a row.
--
-- ── WHY ONE TABLE WITH TWO NULLABLE PARENTS, AND WHY THE CHECK IS SAFE ─────
--
-- A note is the same thing on both halves of the list — team-only text about
-- one row — so two tables would be one concept written twice, and the screen
-- would need two actions, two policies and two message sets to say one thing.
-- The exclusive-or is a CHECK, and CLAUDE.md's referential-maintenance family
-- says to ask which of the columns the predicate names can be changed by
-- something other than the code in front of me. V2-9 is the instance: a CHECK
-- widened to allow a row carrying `live_session_id`, over a column that was
-- `on delete set null`, so erasing an organisation nulled it and the row failed
-- the constraint that had just been relaxed for it.
--
-- Both columns in this predicate are `on delete cascade`. A cascade therefore
-- DELETES the note; it never nulls a column the CHECK reads, so the constraint
-- cannot be made false by the database acting on my behalf. `author_member_id`
-- IS `on delete set null` — a member leaving must not delete the team's record
-- of what was discussed — and it is deliberately NOT in the predicate.
--
-- ── NO org_id, AND THAT IS THE ESTABLISHED CHOICE ──────────────────────────
--
-- Tenancy is derived through the parent, exactly as `survey_comment_replies`
-- and `task_effect_assessments` do it: one source of truth for which
-- organisation a row belongs to, on a table whose parent is already scoped. A
-- second copy would be a second thing that can disagree.
--
-- ── AND WHAT A NOTE IS NOT ─────────────────────────────────────────────────
--
-- A note is never read by a respondent. `get_comment_thread` returns replies
-- and this table is not reachable from it; the respondent surface reads no
-- table added here. Notes are the internal counterpart of a reply, and the
-- distinction is the whole reason they are a separate table rather than a
-- reply with a flag: a flag can be got wrong once and send private text to the
-- person it is about.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.worklist_notes (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references public.tasks(id) on delete cascade,
  comment_id uuid references public.survey_comments(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 2000),
  author_member_id uuid references public.org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint worklist_notes_one_subject
    check ((task_id is not null) <> (comment_id is not null))
);

create index if not exists worklist_notes_task_idx    on public.worklist_notes (task_id);
create index if not exists worklist_notes_comment_idx on public.worklist_notes (comment_id);

alter table public.worklist_notes enable row level security;

comment on table public.worklist_notes is
  'V5-2: «Interne notater» (v5:3324-3348). Team-only text on one worklist row — a task or a '
  'respondent comment, exactly one of them, enforced by worklist_notes_one_subject. Both '
  'parent FKs are ON DELETE CASCADE, so no cascade can null a column the CHECK reads '
  '(CLAUDE.md, referential maintenance; V2-9 is the instance where that went wrong). Never '
  'read by a respondent: get_comment_thread does not reach this table.';

comment on column public.worklist_notes.author_member_id is
  'ON DELETE SET NULL on purpose, and deliberately NOT named in '
  'worklist_notes_one_subject: a member leaving must not delete the team''s record of what '
  'was discussed, and must not be able to break a row''s constraint by leaving.';

-- ── Policies ───────────────────────────────────────────────────────────────
--
-- Read: whoever may read the row the note is about. For a task that is any
-- member (`tasks_sel`'s rule — the register is the compliance record). For a
-- comment it is the COMMENT'S OWN policy, restated as an EXISTS over the table
-- rather than re-implementing the anonymous/named role split here:
-- `survey_comment_replies_sel` does exactly this and says why — a second copy
-- of that rule would drift from the first, and the half that would drift is
-- the half that keeps named free text away from a `leser` (CLAUDE.md
-- invariant 4).
drop policy if exists worklist_notes_sel on public.worklist_notes;
create policy worklist_notes_sel on public.worklist_notes for select
  using (
    (task_id is not null and exists (
       select 1 from public.tasks t
        where t.id = task_id and app.is_org_member(t.org_id)))
    or
    (comment_id is not null and exists (
       select 1 from public.survey_comments c where c.id = comment_id))
  );

-- Write: administrator and redaktør, the same two roles that may advance a task
-- and answer a comment. A `leser` reads the register and writes nothing on it.
drop policy if exists worklist_notes_ins on public.worklist_notes;
create policy worklist_notes_ins on public.worklist_notes for insert
  with check (
    (task_id is not null and exists (
       select 1 from public.tasks t
        where t.id = task_id
          and app.has_role(t.org_id, array['administrator', 'redaktor']::app.member_role[])))
    or
    (comment_id is not null and exists (
       select 1 from public.survey_comments c
         join public.survey_rounds r on r.id = c.round_id
         join public.surveys s on s.id = r.survey_id
        where c.id = comment_id
          and app.has_role(s.org_id, array['administrator', 'redaktor']::app.member_role[])))
  );

-- No UPDATE policy. A note is a dated remark by a named colleague; editing one
-- silently rewrites what the team is recorded as having thought, and the bundle
-- draws no such control. Nothing to weigh here — the absence is the decision.
--
-- DELETE for an administrator, and it is the erasure path rather than a
-- feature: `survey_comments_del` exists for the same reason, and a note on a
-- respondent's comment can contain personal data. No screen offers it; the
-- ordinary route is the cascade from the comment.
drop policy if exists worklist_notes_del on public.worklist_notes;
create policy worklist_notes_del on public.worklist_notes for delete
  using (
    (task_id is not null and exists (
       select 1 from public.tasks t
        where t.id = task_id
          and app.has_role(t.org_id, array['administrator']::app.member_role[])))
    or
    (comment_id is not null and exists (
       select 1 from public.survey_comments c
         join public.survey_rounds r on r.id = c.round_id
         join public.surveys s on s.id = r.survey_id
        where c.id = comment_id
          and app.has_role(s.org_id, array['administrator']::app.member_role[])))
  );

grant select, insert, delete on public.worklist_notes to authenticated;
