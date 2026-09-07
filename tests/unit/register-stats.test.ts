import { describe, expect, it } from 'vitest'
import { registerStats } from '@/lib/dashboard/panels'
import type { Attributed } from '@/lib/results/types'

/**
 * DECISIONS D102, closed in V1-6 as option D.
 *
 * «Svar per virksomhet» counts three things, and the middle one — «har avdekket
 * brudd eller risiko» — is derived from the pack's `brudd` ROLE (Q35). A survey
 * created before `M:0040` carries no role on any question, because that
 * migration deliberately did not rewrite live surveys, and this function used to
 * return `0` for it.
 *
 * A real zero and an undefined numerator rendering identically is the
 * fabricated-data rule in its quietest form: nothing is missing on the screen,
 * nothing errors, and the number is wrong in the direction that looks like good
 * news. The whole repair is one null and one string.
 *
 * The scope query that chose option D over a backfill: measured on heituva-prod
 * 2026-09-07, the affected population is ZERO surveys.
 */
const LABELS = {
  answered: 'virksomheter har svart',
  breaches: 'har avdekket brudd eller risiko',
  overdue: 'forfalt etter påminnelse',
  noBreachQuestion: 'ingen bruddspørsmål er utpekt',
}

const BRUDD = '11111111-1111-1111-1111-111111111111'

/** `answers` are the respondent's literal «Ja»/«Nei» — `isNegative` compares the
 *  text, and a boolean here would silently count nothing. The positive control
 *  below caught exactly that while this fixture was being written. */
function fixture(opts: { role: string | null; answers: ('Ja' | 'Nei')[] }): Attributed {
  return {
    k: 0,
    respondent_kind: 'organisation',
    invited: opts.answers.length,
    responded: opts.answers.length,
    questions: [
      opts.role === null
        ? { id: BRUDD, text: 'Har dere avdekket brudd?', type: 'yesno' }
        : { id: BRUDD, text: 'Har dere avdekket brudd?', type: 'yesno', config: { role: opts.role } },
    ],
    rows: opts.answers.map((v, i) => ({
      invitation_id: `inv-${i}`,
      name: `Leverandør ${i + 1}`,
      status: 'svart' as const,
      responded_at: '2026-09-07T10:00:00Z',
      answers: [{ question_id: BRUDD, value: v }],
    })),
  } as unknown as Attributed
}

const breachStat = (d: Attributed) => registerStats(d, LABELS)!.find((s) => s.key === 'breaches')!

describe('D102 — an undesignated breach question is not zero breaches', () => {
  it('a survey WITH the role counts breaches as before', () => {
    // The positive control, and it is not decoration: without it the null case
    // below is also satisfied by a function that returns null for everything.
    const stat = breachStat(fixture({ role: 'brudd', answers: ['Ja', 'Nei', 'Ja'] }))
    expect(stat.value, 'two «Ja» is two breaches').toBe('2')
    expect(stat.label).toBe(LABELS.breaches)
  })

  it('a survey with the role and NO breaches reports the real zero', () => {
    // The distinction only means something if a true zero still reads as 0.
    const stat = breachStat(fixture({ role: 'brudd', answers: ['Nei', 'Nei'] }))
    expect(stat.value, 'nobody disclosed anything, and that is a fact').toBe('0')
    expect(stat.label).toBe(LABELS.breaches)
  })

  it('a survey with NO role reports no number at all, and says why', () => {
    // The pre-M:0040 survey. Same answers as the test above; different meaning.
    const stat = breachStat(fixture({ role: null, answers: ['Nei', 'Nei'] }))
    expect(stat.value, 'an undefined numerator is null, never 0').toBeNull()
    expect(stat.label, 'and the label carries the reason').toBe(LABELS.noBreachQuestion)
  })

  it('THE PROPERTY: the two states are distinguishable from the payload alone', () => {
    // Asserted as a comparison rather than as two values, because the defect was
    // never "the number is wrong" — it was that two different states produced
    // an IDENTICAL cell. A future refactor that makes both render «0» again
    // fails here even if each individual assertion above is rewritten.
    const designated = breachStat(fixture({ role: 'brudd', answers: ['Nei', 'Nei'] }))
    const undesignated = breachStat(fixture({ role: null, answers: ['Nei', 'Nei'] }))
    expect(
      [designated.value, designated.label],
      'no breaches found and no breach question must not render the same cell',
    ).not.toEqual([undesignated.value, undesignated.label])
  })

  it('the other two counts are untouched by the designation', () => {
    // D102 is about one stat. A repair that changed the other two would be a
    // wider change than the decision authorised.
    const stats = registerStats(fixture({ role: null, answers: ['Ja', 'Nei'] }), LABELS)!
    expect(stats.find((s) => s.key === 'answered')!.value).toBe('2 av 2')
    expect(stats.find((s) => s.key === 'overdue')!.value).toBe('0')
  })
})
