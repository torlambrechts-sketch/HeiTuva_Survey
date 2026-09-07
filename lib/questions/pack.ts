import { z } from 'zod'
import { QUESTION_TYPE_KEYS, specOf } from './registry'
import { QUESTION_ROLES } from './roles'

/**
 * A pack question, and the survey question it becomes. ONE DEFINITION, and the
 * reason it is one is a defect that shipped.
 *
 * `template_packs.questions` is jsonb, so every path that creates a survey from
 * a pack parses it and builds a `config` for the row it writes. There were TWO
 * such paths and they disagreed:
 *
 *   `undersokelser/actions.ts`  the wizard — parsed `statements` and `multi`,
 *                               and built config from the type's defaults
 *   `bibliotek/actions.ts`      «Bruk mal» — parsed neither, and built config
 *                               by hand from three fields
 *
 * So the SAME PACK produced two different surveys. A matrix question created
 * from the library lost its `statements` and rendered with no rows; a
 * multi-select lost `multi` and became single-choice. Nothing failed, nothing
 * logged, and the survey looked plausible.
 *
 * **THIS IS THE FOURTH TIME THIS PROJECT HAS REMOVED THIS EXACT SHAPE**, and
 * the count is here so the next person recognises it before writing the second
 * copy rather than after:
 *
 *   V1-3  the cadence interval CASE, in THREE places, one disagreeing with the
 *         enum — an annual survey re-sent weekly
 *   V1-4  the panel vocabulary: the registry's `label` and next-intl holding
 *         the same six strings, agreeing only by coincidence
 *   V1-5  the pack→use-case mapping, which ran in the migration and had to run
 *         in the seed as well
 *   V1-6  this
 *
 * The shape is always the same: a rule that must hold in more than one place,
 * written out in each. The fix is always the same too — one definition, two
 * callers — and it is cheaper every time it is done first.
 */
export const PackQuestion = z.object({
  text: z.string(),
  // The wizard's schema constrained the type to the registry's keys and the
  // library's did not. The tighter one wins: a pack question whose type no
  // renderer knows would create a survey nobody can answer, and failing at the
  // parse is the only place that failure is cheap.
  type: z.enum(QUESTION_TYPE_KEYS as [string, ...string[]]),
  options: z.array(z.string()).optional(),
  statements: z.array(z.string()).optional(),
  multi: z.boolean().optional(),
  required: z.boolean().optional(),
  help: z.string().optional(),
  /** DECISIONS Q35 — what the question IS in an attributed register. */
  role: z.enum(QUESTION_ROLES).optional(),
  /** The column heading for a roled question; the text itself when absent. */
  short: z.string().optional(),
})

export type PackQuestionInput = z.infer<typeof PackQuestion>

/** Config for a pack question: the type's defaults, overridden by what the pack states. */
export function configFor(q: PackQuestionInput): Record<string, unknown> {
  const spec = specOf(q.type as never)
  const config: Record<string, unknown> = { ...spec.defaultConfig }
  if (q.options?.length) config.options = q.options
  if (q.statements?.length) config.statements = q.statements
  if (q.multi !== undefined) config.multi = q.multi
  // Q35: the designation travels with the question into the survey. A survey is
  // a record of what was asked, so the role is COPIED rather than looked up
  // from the pack at read time — editing the pack later must not silently
  // reclassify a survey that has already been sent.
  if (q.role) config.role = q.role
  if (q.short) config.short = q.short
  return config
}

/** The `survey_questions` row a pack question becomes. Both callers use it, so
 *  a column added here reaches both paths or neither. */
export function surveyQuestionFrom(q: PackQuestionInput, surveyId: string, position: number) {
  return {
    survey_id: surveyId,
    position,
    type: q.type,
    text: q.text,
    help: q.help ?? null,
    required: q.required ?? false,
    config: configFor(q),
  }
}
