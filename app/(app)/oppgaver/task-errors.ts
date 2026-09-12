/** Every refusal the Arbeidsliste can receive, and its copy key.
 *
 *  Kept out of actions.ts for the reason `administrasjon/types.ts` states, and
 *  for the reason the walk of 2026-09-12 proved: a 'use server' module may only
 *  export async functions, and `export const TASK_ERROR_KEY` inside one made
 *  Next refuse to register the whole module. A type export is erased at build
 *  time and is harmless there; a Record is a runtime object and is not. The
 *  symptom was not a type error and not a failed build — it was HTTP 500 on
 *  every one of the screen's eleven actions, with the page itself rendering
 *  perfectly, so every gate that loads the screen stayed green.
 *
 *  The map exists so that every refusal has copy and none can be added without
 *  noticing that it does not.
 */
export type TaskError =
  | 'forbidden'
  | 'invalid'
  | 'needs_effect_assessment'
  | 'step_skipped'
  | 'step_backwards'
  | 'save_failed'

export type TaskResult = { ok: true } | { ok: false; error: TaskError }

export const TASK_ERROR_KEY: Record<TaskError, string> = {
  forbidden: 'taskErrForbidden',
  invalid: 'taskErrInvalid',
  needs_effect_assessment: 'taskErrNeedsEffect',
  step_skipped: 'taskErrStepSkipped',
  step_backwards: 'taskErrStepBackwards',
  save_failed: 'taskErrSaveFailed',
}
