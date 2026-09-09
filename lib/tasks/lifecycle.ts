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
export const isLate = (dueAt: string | null, status: TaskStatus): boolean =>
  status !== 'lukket' && dueAt !== null && new Date(dueAt) < new Date(new Date().toDateString())
