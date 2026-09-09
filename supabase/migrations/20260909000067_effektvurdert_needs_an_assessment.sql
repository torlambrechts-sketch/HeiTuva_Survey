-- V2-4 fix pass · the state whose NAME asserts a fact had no row behind it.
--
-- ── FOUND BY LOOKING AT THE CAPTURE, WHICH IS THE ONLY WAY IT IS EVER FOUND ──
--
-- `artifacts/phase-5/oppgaver.default.desktop.png` renders «Møtefrie torsdager»
-- at Gjennomført, offering **«Flytt til Effektvurdert»** beside the teal prompt
-- «Registrer effektvurdering». Both, at once. So the screen offers a button that
-- moves the card into a state called *effect assessed* without assessing an
-- effect — and the guard let it:
--
--     update public.tasks set status='effektvurdert' where id=<gjennomfort task>;
--     status        | assessments
--     effektvurdert |           0
--
-- `M:0062`'s guard tested the assessment **only at `lukket`**. That is the right
-- place for the COMPLIANCE outcome — a duty is not discharged until somebody
-- says what the measure achieved — and it is one step too late for the RECORD.
-- A card sitting at «Effektvurdert» with nothing in
-- `task_effect_assessments` is CLAUDE.md's «never fabricate data in the UI»
-- one level up from a value: **the STATE is the fabricated datum**, and it is
-- indistinguishable in review from a real one, which is exactly what that rule
-- says makes it worse than a gap.
--
-- ── WHY BOTH CHECKS STAY, RATHER THAN THE NEW ONE REPLACING THE OLD ─────────
--
-- With forward-only, one-step-at-a-time transitions, `lukket` is reachable only
-- through `effektvurdert`, so the `lukket` test looks redundant. It is not.
-- `task_effect_assessments` carries a SELECT and an INSERT policy and no DELETE
-- policy today — but «no policy today» is a fact about this migration, not a
-- property of the table, and the `lukket` check is the one that states the
-- statutory rule (V2:5197, aml. § 3-1 / ldl. § 26 fjerde ledd). A rule worth
-- enforcing at the boundary that matters is worth keeping there even when a
-- second rule happens to imply it.
--
-- Q97 is now **CONFIRMED (Tor): Lukket is TERMINAL** — `M:0066`. The backwards
-- predicate's comment still said the question was open; it is corrected here so
-- the next reader is not told to go and ask.

create or replace function app.guard_task_close() returns trigger
language plpgsql security definer set search_path to 'public'
as $fn$
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

  -- Q97 — CONFIRMED (Tor): **Lukket is TERMINAL. No reopening.** «Closed 14 March» and
  -- «closed 14 March, reopened 2 April, closed again 11 June» are different answers to an
  -- inspector. An error is corrected by a NEW task referencing this one
  -- (`tasks.corrects_task_id`, `M:0066`), never by editing the record after the fact.
  if v_to < v_from then
    raise exception 'task_step_backwards: % -> %', old.status, new.status
      using hint = 'The lifecycle advances. Lukket is terminal (Q97); correct with a new task.';
  end if;

  -- NEW: the state that CLAIMS an assessment needs one. Entering «Effektvurdert» is the
  -- moment the card starts asserting it, not the moment it closes.
  if new.status = 'effektvurdert' and not exists (
       select 1 from public.task_effect_assessments a where a.task_id = new.id) then
    raise exception 'task_effect_state_needs_assessment'
      using hint = 'Record the effect assessment first — the state is named after it.';
  end if;

  -- And the statutory boundary keeps its own test. See the header for why this is not
  -- redundant with the check above.
  if new.status = 'lukket' and not exists (
       select 1 from public.task_effect_assessments a where a.task_id = new.id) then
    raise exception 'task_close_needs_effect_assessment'
      using hint = 'V2:5197 — a tiltak cannot be closed before its effect is assessed.';
  end if;

  return new;
end $fn$;
