import { describe, expect, it } from 'vitest'
import { policyWarnings, type PolicyState } from '../../lib/questions/policy-warnings'
import type { QualityRule } from '../../lib/questions/quality'

/**
 * The policy panel's two warnings (v1 bundle, HeiTuva.dc.html:3527-3529).
 *
 * Pure input/output, so these are unit tests. What they are really guarding is
 * that each warning fires on ONE condition and stays silent on its neighbours:
 * a warning that appears whenever anything is slightly unusual is a warning
 * nobody reads, and the panel is the last thing between an author and a survey
 * that can never show a result.
 */
const PRONOUN_RULE: QualityRule = {
  key: 'policy_pronoun',
  pattern: '\\m(du|deg|din|ditt|dine|jeg|meg|min|mitt|mine)\\M',
  rule: { kind: 'policy_pronoun' },
  message: '«{question}» handler om enkeltpersoner, men svarene attribueres til virksomheten.',
}

const person: PolicyState = {
  respondentKind: 'person',
  anonymity: 'anonymous',
  kThreshold: 5,
  target: 12,
}

const belowText = ({ target, k }: { target: number; k: number }) =>
  `Gruppen har ${target} mottakere. Med terskel ${k} vil resultatet aldri vises.`

const run = (policy: Partial<PolicyState>, questions: { id: string; text: string }[] = []) =>
  policyWarnings({ ...person, ...policy }, questions, [PRONOUN_RULE], belowText)

describe('a target below its own threshold', () => {
  it('warns when four people are asked and the threshold is five', () => {
    const w = run({ target: 4, kThreshold: 5 })
    expect(w).toHaveLength(1)
    expect(w[0]!.key).toBe('target_below_threshold')
    expect(w[0]!.text).toBe('Gruppen har 4 mottakere. Med terskel 5 vil resultatet aldri vises.')
  })

  it('is silent when the target exactly meets the threshold', () => {
    // Five of five clears the gate. Warning here would train the author to
    // ignore the panel on the most ordinary configuration there is.
    expect(run({ target: 5, kThreshold: 5 })).toHaveLength(0)
  })

  it('is silent with no recipients chosen yet', () => {
    // Target 0 is an unfinished draft, not a contradiction — every survey
    // passes through it, and warning there would fire on all of them.
    expect(run({ target: 0, kThreshold: 5 })).toHaveLength(0)
  })

  it('is silent for a named survey, which has no threshold to clear', () => {
    expect(run({ target: 2, kThreshold: 10, anonymity: 'named' })).toHaveLength(0)
  })

  it('still warns when the respondent chooses — «valgfritt» can end up anonymous', () => {
    // `optional` means some answers will be anonymous, so the threshold still
    // governs what can be shown. Exempting it would be reasoning from the
    // best case.
    expect(run({ target: 3, kThreshold: 5, anonymity: 'optional' })).toHaveLength(1)
  })
})

describe('questions about a person on an organisation survey', () => {
  const qs = [
    { id: 'q1', text: 'Hvordan opplever du samarbeidet?' },
    { id: 'q2', text: 'Har virksomheten rutiner for varsling?' },
    { id: 'q3', text: 'Hva er din vurdering av leveransen?' },
    { id: 'q4', text: 'Er dine rutiner dokumentert?' },
  ]

  it('flags the questions written to a person, and only those', () => {
    const w = run({ respondentKind: 'organisation', anonymity: 'named' }, qs)
    expect(w.map((x) => x.key)).toEqual(['policy_pronoun:q1', 'policy_pronoun:q3'])
    expect(w[0]!.text).toBe(
      '«Hvordan opplever du samarbeidet?» handler om enkeltpersoner, men svarene attribueres til virksomheten.',
    )
  })

  it('shows at most two, so a long survey cannot bury the panel', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, text: `Hva mener du om ${i}?` }))
    expect(run({ respondentKind: 'organisation', anonymity: 'named' }, many)).toHaveLength(2)
  })

  it('says nothing on a person survey — the same questions are then correct', () => {
    // This is the control that stops the rule becoming "never write «du»".
    // On a person survey, addressing the respondent is exactly right.
    expect(run({}, qs)).toHaveLength(0)
  })

  it('does not fire on a word that merely contains a pronoun', () => {
    // \m…\M are word boundaries; "dugnad" and "minutter" must not match, or the
    // rule flags ordinary Norwegian and gets ignored.
    const w = run({ respondentKind: 'organisation', anonymity: 'named' }, [
      { id: 'q1', text: 'Deltar virksomheten på dugnad?' },
      { id: 'q2', text: 'Tar rutinen mer enn ti minutter?' },
    ])
    expect(w).toHaveLength(0)
  })

  it('is silent when the rule row is missing, rather than throwing', () => {
    // The rules are data. A deploy whose seed has not run yet must render the
    // panel without warnings, not crash the Builder.
    expect(
      policyWarnings(
        { ...person, respondentKind: 'organisation', anonymity: 'named' },
        qs,
        [],
        belowText,
      ),
    ).toHaveLength(0)
  })
})
