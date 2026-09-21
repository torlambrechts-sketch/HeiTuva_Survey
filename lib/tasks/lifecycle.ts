/**
 * The task lifecycle, in one place on the TypeScript side — DECISIONS **Q69**
 * (defaulted) and **Q97** (open).
 *
 * The order is defined twice by necessity: once as `app.task_status` and
 * `app.task_step_index` in the database, which is what actually enforces it,
 * and once here so the screen can draw six chips. **The database is the
 * authority and this is the drawing**; `tests/db/tasks.test.ts` asserts the enum
 * matches this array, so the two cannot drift apart in silence.
 */
export const TASK_STEPS = [
  'foreslatt',
  'besluttet',
  'pagar',
  'gjennomfort',
  'effektvurdert',
  'lukket',
] as const
export type TaskStatus = (typeof TASK_STEPS)[number]

/** V2:5185 draws the same six, in the same order. */
export const STEP_KEY: Record<TaskStatus, string> = {
  foreslatt: 'taskStepForeslatt',
  besluttet: 'taskStepBesluttet',
  pagar: 'taskStepPagar',
  gjennomfort: 'taskStepGjennomfort',
  effektvurdert: 'taskStepEffektvurdert',
  lukket: 'taskStepLukket',
}

export const stepIndex = (s: TaskStatus): number => TASK_STEPS.indexOf(s)

/**
 * The next step, or `null` at the end. Mirrors `onAdvance` (V2:5192-5195), which
 * advances by exactly one and stops — **and stopping is the point**: the
 * database refuses a skip (`task_step_skipped`), so a UI offering one would be
 * offering an action it knows will fail.
 */
export const nextStep = (s: TaskStatus): TaskStatus | null =>
  stepIndex(s) < TASK_STEPS.length - 1 ? TASK_STEPS[stepIndex(s) + 1]! : null

/**
 * Whether a task is late. A CLOSED task is never late — the deadline stopped
 * mattering when the duty was discharged, and colouring it red afterwards is a
 * report that misdescribes what happened.
 */
/* T8 fix pass — `now` IS A PARAMETER NOW, and the defect it closes is the
   shape this project keeps recording: a function that TAKES a clock and then
   reads a different one.

   `bucketOf(facts, now)` threads a caller's `now` into its «this week»
   arithmetic and then called `isLate` — which read `new Date()` — for the
   «over frist» branch one line earlier. The two disagreed whenever the two
   clocks did, so a test pinning NOW to 2026-09-12 was really asserting
   «2026-09-19 is in the future», which stopped being true on 2026-09-21 and
   turned a fixed-clock test into a date bomb. It had nothing to do with the
   phase that was running when it went off.

   Defaulting keeps every existing caller correct; the point is that a caller
   WITH a clock can now hand it over instead of being silently ignored. */
export const isLate = (
  dueAt: string | null,
  status: TaskStatus,
  now: Date = new Date(),
): boolean =>
  status !== 'lukket' && dueAt !== null && new Date(dueAt) < new Date(now.toDateString())
