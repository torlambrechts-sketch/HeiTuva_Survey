/**
 * What a question IS in an attributed register — DECISIONS Q35.
 *
 * The v1 bundle decides this by regex on the question text
 * (HeiTuva.dc.html:3536-3538): `/brudd/i` for the breach question, `/policy/i`
 * for the policy question, `shortQ`'s four more patterns for the column
 * heading, and "the first four yes/no questions" for which columns exist at
 * all. Every one of those reclassifies silently when someone rephrases a
 * question, which is the ordinary thing to do with a pack you have adopted.
 *
 * So the designation is DATA: a `role` on the pack's question entries, carried
 * into `survey_questions.config` when the pack is used (migration 0040). There
 * is no regex in this file and there is a test that says so — a matching text
 * with no role is not classified, which is what stops a "fallback for old
 * surveys" from putting the pattern back.
 *
 * A survey with no roles renders no columns. That is the correct empty state
 * for a survey built by hand rather than from a statutory pack: the register
 * still lists who answered and their answers open in the detail grid; what it
 * does not do is guess which of their questions was the important one.
 */
export const QUESTION_ROLES = ['brudd', 'policy', 'key'] as const
export type QuestionRole = (typeof QUESTION_ROLES)[number]

export type RoledQuestion = {
  id: string
  text: string
  config?: Record<string, unknown> | null
}

export type AttributedColumn = {
  id: string
  role: QuestionRole
  /** The column heading — the pack's `short`, or the question itself. */
  label: string
  /** The full question, for the `title` attribute the design puts on it (:2561). */
  full: string
}

/** The pack's role, or null. A value outside the closed set is not a role. */
export function roleOf(question: RoledQuestion): QuestionRole | null {
  const raw = question.config?.role
  return typeof raw === 'string' && (QUESTION_ROLES as readonly string[]).includes(raw)
    ? (raw as QuestionRole)
    : null
}

/**
 * The register's columns, in the survey's own question order.
 *
 * No slice: the design's four columns are four because the pack designates
 * four. Capping here would mean a pack that names five silently loses one, and
 * the fix for a too-wide table is the pack, not a truncation nobody can see.
 */
export function attributedColumns(questions: RoledQuestion[]): AttributedColumn[] {
  const columns: AttributedColumn[] = []
  for (const q of questions) {
    const role = roleOf(q)
    if (!role) continue
    const short = q.config?.short
    columns.push({
      id: q.id,
      role,
      label: typeof short === 'string' && short.length > 0 ? short : q.text,
      full: q.text,
    })
  }
  return columns
}

/**
 * Whether an answer is the one that needs chasing.
 *
 * `brudd` is inverted, and that asymmetry is the whole reason it is its own
 * role rather than another `key`: on every other question a «Nei» is the
 * finding, and on the breach question a «Ja» is. The bundle expresses the same
 * rule as `(q === bruddQ && txt === "Ja") || (q !== bruddQ && txt === "Nei")`
 * (:4877), where `bruddQ` came from the regex.
 */
export function isNegative(role: QuestionRole, value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  const text = String(value)
  return role === 'brudd' ? text === 'Ja' : text === 'Nei'
}
