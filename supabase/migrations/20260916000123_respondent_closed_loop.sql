-- G1 — the respondent's half of the closed loop, and the opt-in.
--
-- The v6 bundle draws two cards on the thanks screen that nothing backs:
-- «Hva skjer nå» (v6:5520-5525) and «Du sa · vi gjorde» (v6:5528-5546). Both
-- are fixtures — `rlThanksNext` is a literal string naming a committee and a
-- date (v6:10078), `rlSaidDid` is three hand-written objects (v6:10079-10081),
-- and `rlOptIn` is client state whose handler is `setState` and nothing else
-- (v6:10086). This migration builds what a real version of them needs.
--
-- ══ 1. WHY A STATUS FILTER IS NOT A PUBLICATION DECISION ═══════════════════
--
-- «Du sa · vi gjorde» renders tasks. The obvious design is a filter: manual
-- source (Q72 — a blind-spot task's TITLE is the finding, so it may never be
-- read by a respondent), plus a status in the done set. That gives «what was
-- DONE, never what was found», which is the rule.
--
-- **It is not enough, and the demo seed proves it.** Measured 2026-09-16
-- against a reset local database, Nordisk Studio's own register holds:
--
--     manuell | pagar       | trakassering | Undersøkelse etter varsel
--     manuell | pagar       | trakassering | Gjennomgang av varslingsrutinen
--     manuell | effektvurdert | likestilling | Lønnskartlegging per stillingsgruppe
--
-- The first is one status change away from `gjennomfort`. Under a pure status
-- filter, an administrator recording that a HARASSMENT INVESTIGATION finished
-- would thereby publish that sentence to everyone holding a link to any survey
-- in that organisation — including a share link or a QR voucher, which has no
-- invitation and no addressee at all. The register is read by members
-- (`tasks_sel` is `app.is_org_member`); a survey link is read by whoever has
-- the URL.
--
-- So the write that publishes would be an ordinary internal bookkeeping act
-- with an effect its author never chose. That is CLAUDE.md's «who writes this
-- column?» pointed at an AUDIENCE rather than at a value, and the answer has to
-- be a person saying yes, per task.
--
-- `shared_with_respondents` is that yes. It defaults FALSE, so this migration
-- publishes nothing: every existing task in every organisation stays where it
-- was, and the card renders only once somebody has chosen something to put in
-- it.
--
-- ══ 2. AND THE Q72 HALF IS A CHECK, NOT A FILTER ══════════════════════════
--
-- A generated blind-spot task could be flagged by hand — the control is a
-- toggle on a row and the rows look alike. Rather than rely on the reading RPC
-- to exclude it, the column REFUSES it: CLAUDE.md, «prefer the shape where the
-- wrong thing cannot be expressed over the shape where it is merely not done.»
--
-- The predicate is over `source_kind`, which is `not null` with its own CHECK
-- and which nothing nulls — chosen deliberately, because the column beside it
-- is `on delete set null` and that is the family this file has rediscovered
-- eight times (see § 3).
--
-- ══ 3. AND THE EIGHTH INSTANCE OF THE REFERENTIAL-MAINTENANCE FAMILY, FOUND
--      WHILE CHOOSING THE COLUMN ABOVE ════════════════════════════════════════
--
-- `tasks_source_ref_needs_kind` was written `(source_kind = 'survey') =
-- (source_ref is not null)` — a biconditional over a column the database
-- reserves the right to null. Measured, on the local stack:
--
--     begin;
--     delete from public.surveys
--      where id = (select source_ref from public.tasks where source_kind='survey' limit 1);
--     ERROR:  new row for relation "tasks" violates check constraint
--             "tasks_source_ref_needs_kind"
--     CONTEXT: SQL statement "UPDATE ONLY public.tasks SET source_ref = NULL ..."
--
-- A survey carrying a blind-spot task cannot be hard-deleted. Erasing the
-- ORGANISATION is fine (measured: `delete from organizations` succeeds — the
-- task rows go rather than being nulled), so no erasure path is broken and this
-- is latent rather than live: today's four hard `surveys` deletes are all
-- rollback paths on a survey created seconds earlier, which has no task yet.
--
-- Fixed here because the fix is one direction of the same sentence and the
-- phase that runs the sweep owns what it finds. The half that survives is the
-- half no cascade can break — **a manual task must not name a survey** — and
-- the half that goes is «a survey task must name one», which is precisely the
-- claim erasing the survey invalidates. Fix the column, not the predicate.
--
-- ══ 4. THE OPT-IN WRITES NOTHING THAT LINKS TO HER ANSWERS ════════════════
--
-- «Send meg det samlede resultatet» is an address against an anonymous
-- response. It is built as a boolean ON THE INVITATION, and that choice is the
-- whole security argument:
--
--   - The invitation row ALREADY exists, ALREADY carries her address, and
--     ALREADY carries `responded_at timestamptz` written by `submit_response`
--     at full precision (measured: `set responded_at = now()`, while the
--     response gets `date_trunc('hour', now())`). So the strongest temporal
--     link that will ever exist is already there, by a design reminders
--     require.
--   - The column is a BOOLEAN WITH NO TIMESTAMP. It creates no new row, no new
--     join, and no new column on `responses` or `answers`. Setting it tells an
--     observer nothing that `responded_at` did not already tell them.
--   - Where there is no invitation — a share link, a QR voucher — there is
--     nothing to write, and the control is not rendered. Same predicate F-02
--     established for the reply box.
--
-- The negative test is `tests/db/closed-loop.test.ts`: opt in, then assert the
-- response row is byte-identical, `invitation_id` is still null, and no column
-- anywhere gained a reference.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The publication decision
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tasks
  add column if not exists shared_with_respondents boolean not null default false;

alter table public.tasks drop constraint if exists tasks_shared_is_manual;
alter table public.tasks
  add constraint tasks_shared_is_manual
  check (not shared_with_respondents or source_kind = 'manuell');

comment on column public.tasks.shared_with_respondents is
  'G1. WHO WRITES THIS: `setTaskShared` in app/(app)/arbeidsliste/actions.ts, from the '
  'toggle on the task detail — administrator or redaktor, the same roles `tasks_upd` '
  'already requires. Default false, so the register publishes nothing until somebody '
  'chooses. The CHECK refuses it on a blind-spot task because such a task''s TITLE is the '
  'finding (Q72), and the predicate is over `source_kind` rather than `source_ref` because '
  'the latter is ON DELETE SET NULL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. § 3 — the biconditional becomes the half a cascade cannot break
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tasks drop constraint if exists tasks_source_ref_needs_kind;
alter table public.tasks drop constraint if exists tasks_manual_has_no_source;
alter table public.tasks
  add constraint tasks_manual_has_no_source
  check (source_kind <> 'manuell' or source_ref is null);

comment on constraint tasks_manual_has_no_source on public.tasks is
  'Was `(source_kind = ''survey'') = (source_ref is not null)`, which collided with '
  '`tasks_source_ref_fkey`''s ON DELETE SET NULL: hard-deleting a survey nulled the column '
  'and the row then failed its own CHECK. One direction survives — a MANUAL task never '
  'names a survey — because that is the half no cascade can withdraw. The half that went '
  'is the one erasing the survey makes untrue.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The opt-in
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.survey_invitations
  add column if not exists wants_result boolean not null default false;

comment on column public.survey_invitations.wants_result is
  'G1. WHO WRITES THIS: `public.set_result_optin(text, boolean)`, token-validated, called '
  'by the respondent from the thanks screen. A BOOLEAN WITH NO TIMESTAMP, on a row that '
  'already holds her address and already holds `responded_at` — so it adds no linkage that '
  '`submit_response` did not already create. Nothing in `responses` or `answers` is '
  'touched. READ BY: the survey''s Send screen, which shows the editor how many holders of '
  'this round''s invitations asked for the summary — so the preference is acted on by a '
  'person rather than by a delivery path that does not exist. The respondent''s copy says '
  'that, and does not promise an email the product cannot send.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. WHEN it was done — because `due_at` is not that
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The drawing dates each item «innført 9. sep» / «gjennomført 5. sep» — the day
-- it HAPPENED. The register had no such column, and the nearest thing to hand
-- was `due_at`, which is the day it was MEANT to happen and can sit in the
-- future on a task already done. Rendering one as the other is the fabricated
-- value rule: indistinguishable from a real date in review.
--
-- WHO WRITES THIS: `app.stamp_task_completed`, a trigger. Scoped `of status`
-- rather than to every UPDATE, because the rule is about that column and an
-- unscoped guard is the shape Q137 paid for.
alter table public.tasks
  add column if not exists completed_at date;

create or replace function app.stamp_task_completed()
returns trigger
-- `set search_path = public` matching `app.guard_task_close` beside it. M:0096's
-- catalogue sweep caught this the first time the function was written without
-- it, which is the sweep doing its job: a trigger function with a mutable path
-- resolves `app.task_step_index` from whoever WRITES the row.
language plpgsql set search_path = public as $fn$
begin
  -- ONE DIRECTION, AND THE MISSING `else` IS DELIBERATE.
  --
  -- The symmetric version was written first — stamp on entering the done band,
  -- clear on falling back out — and its test failed, which is how the reason
  -- got written down here instead of a branch nobody could reach.
  -- `app.guard_task_close` raises `task_step_backwards` on ANY move to a lower
  -- step (Q97: «Lukket is TERMINAL. No reopening»), so a row cannot leave the
  -- done band by UPDATE at all. A clearing branch would be a defence against a
  -- state the database already refuses, and CLAUDE.md is explicit that such a
  -- defence is only sound when a test proves the case does not occur —
  -- `tests/db/closed-loop.test.ts` test 8 is that proof.
  --
  -- So the stamp is «the day it FIRST reached done», which is also what
  -- «gjennomført 5. sep» means on the card: advancing gjennomfort ->
  -- effektvurdert -> lukket must not move the date the work happened.
  if app.task_step_index(new.status) >= app.task_step_index('gjennomfort')
     and new.completed_at is null then
    new.completed_at := current_date;
  end if;
  return new;
end $fn$;

drop trigger if exists tasks_stamp_completed on public.tasks;
create trigger tasks_stamp_completed
  before insert or update of status on public.tasks
  for each row execute function app.stamp_task_completed();

comment on column public.tasks.completed_at is
  'G1. The day the task reached `gjennomfort` or beyond. Written by the trigger '
  'app.stamp_task_completed, which is scoped `of status` because that is the column the '
  'rule is about. NOT `due_at`, which is when it was meant to happen and may be in the '
  'future on a finished task — rendering that as a completion date is a fabricated value.';

-- Backfill: rows already in the done band predate the trigger. `due_at` is the
-- only evidence those rows carry, and it is a guess, so it is used only where
-- it is in the PAST — a future due date on a done task says nothing about when
-- the work happened and is left null rather than invented.
update public.tasks
   set completed_at = due_at
 where completed_at is null
   and app.task_step_index(status) >= app.task_step_index('gjennomfort')
   and due_at is not null
   and due_at <= current_date;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The respondent's read: what the organisation DID
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Six things this returns, and the list of what it does NOT return is the
-- interesting half:
--
--   returns:      the task's title, and the date it reached a done status
--   never:        law_ref   — naming a statutory duty tells a respondent which
--                             obligations this organisation is under
--                 owner     — a named colleague
--                 kind, due_at, id, status, counts, group names, scores
--
-- The drawing pairs each action with a QUOTE («{{ s6.said }}», v6:5539). That
-- half is not built and cannot be: it is one respondent's own free text
-- rendered to another respondent, on a page whose reader has no role, no
-- session and — for a share link — no relationship to the organisation at all.
-- Q72's sentence covers it exactly: show what was DONE, never what was found,
-- and a quote IS the finding. D199.
create or replace function public.get_closed_loop_for_token(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_res record;
  v_org uuid;
  v_items jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status <> 'live' then
    -- Indistinguishable from an empty loop, deliberately: a respondent told
    -- «that token is not valid» has been told something about a token she may
    -- not hold. Same rule as `commentThread`'s wrapper.
    return jsonb_build_object('items', '[]'::jsonb, 'wants_result', false, 'can_opt_in', false);
  end if;

  select s.org_id into v_org
    from public.survey_rounds r
    join public.surveys s on s.id = r.survey_id
   where r.id = v_res.round_id;

  select coalesce(jsonb_agg(x order by x->>'when' desc), '[]'::jsonb) into v_items
    from (
      select jsonb_build_object('title', t.title, 'when', t.completed_at) as x
        from public.tasks t
       where t.org_id = v_org
         and t.shared_with_respondents
         -- Belt and braces with `tasks_shared_is_manual`: the CHECK already
         -- refuses the flag on a generated task, and this says so again where
         -- a reader of the query can see it.
         and t.source_kind = 'manuell'
         and t.status in ('gjennomfort', 'effektvurdert', 'lukket')
       order by t.completed_at desc nulls last, t.created_at desc
       limit 5) s2;

  return jsonb_build_object(
    'items', v_items,
    -- Her current choice, and whether there is anything to choose. A share
    -- link has no invitation, so there is no row to write and the control is
    -- not rendered — F-02's predicate, second use.
    'wants_result', coalesce((select i.wants_result from public.survey_invitations i
                               where i.id = v_res.invitation_id), false),
    'can_opt_in', v_res.invitation_id is not null);
end $fn$;

comment on function public.get_closed_loop_for_token(text) is
  'G1. The respondent''s half of the closed loop. Returns title + date for at most five '
  'tasks an administrator has explicitly shared, at a done status, manual source only. '
  'Never law_ref, never an owner, never a quote (Q72 — a quote is the finding). Also '
  'carries her own opt-in state, so the thanks screen needs one call rather than two.';

revoke all on function public.get_closed_loop_for_token(text) from public, anon, authenticated;
grant execute on function public.get_closed_loop_for_token(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The opt-in write
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_result_optin(p_token text, p_want boolean)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_res record;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status <> 'live' or v_res.invitation_id is null then
    return jsonb_build_object('ok', false, 'wants_result', false);
  end if;

  -- The one column, and nothing else. Note what is absent: no timestamp, no
  -- touch of `responses`, no touch of `answers`, no new row anywhere. The row
  -- being updated already holds her address and already holds `responded_at`
  -- at full precision, so this adds no linkage that submitting did not.
  --
  -- `update of email` is what the two invitation guards are scoped to
  -- (`M:0108`), so a boolean write passes them — which is the point of having
  -- scoped them to the column the rule is about.
  update public.survey_invitations
     set wants_result = coalesce(p_want, false)
   where id = v_res.invitation_id;

  return jsonb_build_object('ok', true, 'wants_result', coalesce(p_want, false));
end $fn$;

comment on function public.set_result_optin(text, boolean) is
  'G1. The respondent asks for the summed result. Writes ONE BOOLEAN on the invitation she '
  'already holds — no timestamp, no row, nothing in `responses` or `answers`. Refuses '
  'silently where no invitation exists (share link, QR voucher): there is nothing to write '
  'and nowhere to send it.';

revoke all on function public.set_result_optin(text, boolean) from public, anon, authenticated;
grant execute on function public.set_result_optin(text, boolean) to anon, authenticated;
