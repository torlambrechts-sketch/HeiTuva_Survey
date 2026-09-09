import { z } from 'zod'

/**
 * The answer payload, shared by the respondent UI and the server action.
 *
 * `submit_response` takes `{question_id: {value, comment?, follow_up?}}`
 * (migration 0009), so this is that shape stated once. The client builds it and
 * the action validates it against the same schema — a divergence between the
 * two is what lets a malformed answer reach Postgres and fail there instead of
 * at the boundary, which CLAUDE.md's "Zod at every server boundary" exists to
 * prevent.
 */

/**
 * What a single question's `value` may be.
 *
 * Deliberately narrow. A ranking is an ordered array of option indices, a
 * multi-select is an unordered one, a matrix is one number per statement, a
 * form field is a record of strings; everything else is a number or a string.
 * Nothing here accepts an arbitrary object, so a crafted payload cannot smuggle
 * structure into `answers.value_json`.
 */
export const AnswerValue = z.union([
  z.number().finite(),
  z.string().max(5000),
  z.boolean(),
  z.array(z.number().int().nonnegative().max(999)).max(100),
  z.record(z.string().max(120), z.string().max(500)),
])
export type AnswerValue = z.infer<typeof AnswerValue>

export const AnswerEntry = z.object({
  value: AnswerValue,
  /** Free text the respondent added beside the answer. */
  comment: z.string().max(5000).optional(),
  /** Free text from the low-score follow-up prompt. */
  follow_up: z.string().max(5000).optional(),
  /**
   * V2-10, Q84 — how long this answer took, in milliseconds, for the quiz time
   * bonus. **Optional everywhere and written only in quiz mode**; the RPC drops
   * a value outside 0…3600000 rather than refusing the submission, because
   * losing a real answer over a stopwatch is the wrong trade (`M:0087`).
   *
   * It is the ONE quiz fact not derivable from rows already held, and it is
   * safe only because a quiz requires NAMED answers
   * (`app.guard_quiz_policy`) — so it can never become a timing channel on an
   * anonymous response. `tests/db/quiz.test.ts` test 5 asserts that pairing
   * rather than trusting it.
   */
  elapsed_ms: z.number().int().min(0).max(3_600_000).optional(),
})
export type AnswerEntry = z.infer<typeof AnswerEntry>

/** Keyed by `survey_questions.id`. */
export const AnswerMap = z.record(z.string().uuid(), AnswerEntry)
export type AnswerMap = z.infer<typeof AnswerMap>

/**
 * A question as the respondent flow sees it — the round's frozen snapshot,
 * not the live `survey_questions` row. A sent round answers from its snapshot
 * so that editing the Builder later cannot change what a past respondent was
 * asked (the same reason migration 0004 stores `question_snapshot` at all).
 */
export type RespondentQuestion = {
  id: string
  type: string
  text: string
  help?: string | null
  required?: boolean
  comment_mode?: 'arv' | 'pa' | 'av' | null
  follow_up_on_low?: boolean | null
  config?: Record<string, unknown> | null
}

/** The scale point at or below which the design fires a follow-up prompt. */
export const LOW_SCORE_THRESHOLD = 2

/**
 * Has this question been answered?
 *
 * Empty string, empty array and empty record all count as unanswered — a
 * respondent who opens a text box and types nothing has not answered it, and a
 * required question must not pass validation because a key exists.
 */
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value).some((v) => v.trim().length > 0)
  return true
}

/**
 * Does this answer trip the low-score follow-up?
 *
 * Numeric only, and only when the question asked for it. A 1 on a 1-5 scale is
 * low; a 1 on eNPS 0-10 is lower still, and both are at or below the threshold,
 * which is why the design uses one constant rather than a per-type fraction.
 */
export function isLowScore(q: RespondentQuestion, value: AnswerValue | undefined): boolean {
  if (!q.follow_up_on_low) return false
  return typeof value === 'number' && value <= LOW_SCORE_THRESHOLD
}
