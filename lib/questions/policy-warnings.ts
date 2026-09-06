/**
 * The policy panel's two warnings (v1 bundle, HeiTuva.dc.html:3527-3529).
 *
 * These are not question-quality flags. They are warnings about the SURVEY'S
 * POLICY — the combination of who answers, whether they are named, and the
 * threshold — and they only make sense against the whole draft, so they live
 * beside `qualityFlags` rather than inside it.
 *
 * Pure and synchronous for the same reason `quality.ts` is: the panel
 * recomputes them on every chip press, and the send-readiness check needs them
 * server-side.
 *
 * The pronoun rule is DATA, not a constant in the component: it is a row in
 * `quality_rules` with `rule.kind = 'policy_pronoun'`, which `qualityFlags`
 * skips (it ignores kinds it does not know) and this module consumes. Retuning
 * the pronoun list, or adding the rule for a new language, is a row.
 *
 * That row's `message` carries one `{question}` placeholder, which is the only
 * extension this table's convention needed: every other rule's message is a
 * fixed sentence, and this one has to name the question it is about. The
 * substitution happens here so the row stays a plain string in the database.
 */
import type { QualityRule } from './quality'

export type PolicyWarning = { key: string; text: string }

export type PolicyState = {
  respondentKind: 'person' | 'organisation'
  anonymity: 'anonymous' | 'named' | 'optional'
  kThreshold: number
  /** How many people the survey is aimed at; 0 when no recipients are chosen yet. */
  target: number
}

/** The bundle shows at most two pronoun warnings, so a long survey cannot bury the panel. */
const MAX_PRONOUN_WARNINGS = 2

function toJsRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern.replace(/\\m/g, '\\b').replace(/\\M/g, '\\b'), 'i')
  } catch {
    console.error(`quality_rules: unusable policy pattern ${pattern}`)
    return null
  }
}

export function policyWarnings(
  policy: PolicyState,
  questions: { id: string; text: string }[],
  rules: QualityRule[],
  /** "Gruppen har {target} mottakere. Med terskel {k} vil resultatet aldri vises." */
  targetBelowThreshold: (args: { target: number; k: number }) => string,
): PolicyWarning[] {
  const out: PolicyWarning[] = []

  // 1. A target smaller than its own threshold can never produce a result. The
  //    survey would run, people would answer, and the screen would say "for få
  //    svar" forever. `named` is exempt because a named survey has no threshold
  //    to clear, and target 0 means nobody has chosen recipients yet — that is
  //    an unfinished draft, not a contradiction.
  if (
    policy.respondentKind === 'person' &&
    policy.anonymity !== 'named' &&
    policy.target > 0 &&
    policy.target < policy.kThreshold
  ) {
    out.push({
      key: 'target_below_threshold',
      text: targetBelowThreshold({ target: policy.target, k: policy.kThreshold }),
    })
  }

  // 2. An organisation survey attributes every answer to the company, so a
  //    question written to a person ("hvordan opplever DU …") collects a
  //    personal opinion under a company's name. The rule flags the wording; the
  //    author decides.
  if (policy.respondentKind === 'organisation') {
    const rule = rules.find(
      (r) => (r.rule as { kind?: string } | null)?.kind === 'policy_pronoun' && r.pattern,
    )
    const re = rule?.pattern ? toJsRegex(rule.pattern) : null
    if (rule && re) {
      for (const q of questions.filter((q) => re.test(q.text)).slice(0, MAX_PRONOUN_WARNINGS)) {
        out.push({
          key: `policy_pronoun:${q.id}`,
          text: rule.message.replace('{question}', q.text),
        })
      }
    }
  }

  return out
}
