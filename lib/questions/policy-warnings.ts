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
import { toJsRegex, type QualityRule } from './quality'

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

/**
 * **Is this audience too small to ever produce a result?**
 *
 * DECISIONS Q92/Q95, V2-3a. The v2 bundle writes this comparison inline on FOUR
 * rendered surfaces — `hasThresholdWarn` (V2:4988), `mgGroups.small` (V2:5048),
 * `mgSegments.small` (V2:5052) and the Send audience picker (V2:6543-6544, the
 * one `00-diff § B.27` and `02-conflicts § A4` both missed) — each as
 * `count < 5`. Every one of those is wrong twice over: 5 is not the threshold
 * (Q17 made it per-survey), and an organisation survey has no threshold at all.
 *
 * **This is the predicate, extracted rather than reshaped.** `policyWarnings`
 * below is rule 1's home and takes a whole `PolicyState` plus questions, rules
 * and a copy callback — a signature an audience badge cannot satisfy. Forcing
 * it to would bend the function around a caller it was not built for; copying
 * the comparison would make it the fifth instance of this project's defect
 * shape. So the BOUNDARY moves into one function and both ask it, exactly as
 * `lib/questions/threshold-tier.ts` did for the tier.
 *
 * `k` is the caller's to supply and must come from `app.k_for` or, where there
 * is no survey in scope, the organisation's default — and there the LABEL says
 * which (Q95: a badge reporting a number nobody can derive is the D110 shape in
 * a UI).
 */
export function belowThreshold(input: {
  /** People in the audience — a count of PEOPLE, which Q28 expressly permits. */
  count: number
  /** From `app.k_for`, or the organisation default when no survey is in scope. */
  k: number
  respondentKind: 'person' | 'organisation'
  anonymity: 'anonymous' | 'named' | 'optional'
}): boolean {
  // An organisation survey is attributed and has no threshold (Q17/Q47), and a
  // named survey has no threshold to clear. Both exemptions are BEFORE the
  // comparison, so k is never consulted for them — `app.k_for` returns 0 for an
  // organisation, and `0 > count` would otherwise read as "never below".
  if (input.respondentKind === 'organisation') return false
  if (input.anonymity === 'named') return false
  // 0 is an unfinished draft — nobody has chosen recipients yet — not a
  // contradiction. Every survey passes through it.
  if (input.count <= 0) return false
  return input.count < input.k
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
    belowThreshold({
      count: policy.target,
      k: policy.kThreshold,
      respondentKind: policy.respondentKind,
      anonymity: policy.anonymity,
    })
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
