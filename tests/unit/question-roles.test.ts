import { describe, expect, it } from 'vitest'
import { attributedColumns, isNegative, roleOf } from '@/lib/questions/roles'

/**
 * DECISIONS Q35 — the key-question designation is data on the pack, never a
 * regex on question text.
 *
 * THE NEGATIVE TEST IS THE POINT. The v1 bundle classifies by regex
 * (HeiTuva.dc.html:3536-3538): `/brudd/i` finds the breach question,
 * `/policy/i` the policy question, and `shortQ` picks the column heading from
 * four more patterns. Without a test that a MATCHING text with no role stays
 * unclassified, a regex could come back later — as a "fallback for old
 * surveys", which is exactly how it would be argued — and every test here would
 * still pass.
 */
describe('(Q35 negative) text that matches the old regex is not classified', () => {
  it('a question saying «brudd» but carrying no role is not the breach question', () => {
    expect(roleOf({ id: 'q', text: 'Har dere avdekket brudd siste 12 måneder?', config: {} })).toBeNull()
  })

  it('a question saying «policy» but carrying no role is not the policy question', () => {
    expect(roleOf({ id: 'q', text: 'Har dere en policy for personvern?', config: {} })).toBeNull()
  })

  it('and neither of them becomes a column', () => {
    const columns = attributedColumns([
      { id: 'a', text: 'Har dere avdekket brudd eller risiko siste 12 måneder?', config: {} },
      { id: 'b', text: 'Har virksomheten en policy for menneskerettigheter?', config: {} },
      { id: 'c', text: 'Beskriv tiltakene', config: {} },
    ])
    expect(columns).toEqual([])
  })

  it('a yes/no question is not a column merely for being a yes/no question', () => {
    // The bundle's other rule — `keyQs = questions.filter(type === "yesno").slice(0,4)`
    // — is the same mistake in a different disguise: it classifies by SHAPE
    // rather than by meaning, so adding a sixth yes/no question silently
    // changes which four appear.
    const columns = attributedColumns(
      Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, text: `Spørsmål ${i}`, config: {} })),
    )
    expect(columns).toEqual([])
  })
})

describe('roleOf reads the config the pack wrote', () => {
  it('returns each of the three roles', () => {
    expect(roleOf({ id: 'q', text: 'x', config: { role: 'brudd' } })).toBe('brudd')
    expect(roleOf({ id: 'q', text: 'x', config: { role: 'policy' } })).toBe('policy')
    expect(roleOf({ id: 'q', text: 'x', config: { role: 'key' } })).toBe('key')
  })

  it('refuses a role outside the closed set rather than passing it through', () => {
    // A typo in a pack row must not create a fourth kind of column that no
    // renderer knows about. The set is closed here as well as in the migration.
    expect(roleOf({ id: 'q', text: 'x', config: { role: 'nøkkel' } })).toBeNull()
    expect(roleOf({ id: 'q', text: 'x', config: { role: 7 } })).toBeNull()
  })

  it('survives a null or absent config', () => {
    expect(roleOf({ id: 'q', text: 'x', config: null })).toBeNull()
    expect(roleOf({ id: 'q', text: 'x' })).toBeNull()
  })
})

describe('attributedColumns — the header row of the register', () => {
  const packQuestions = [
    { id: 'q1', text: 'Har virksomheten en policy for menneskerettigheter?', config: { role: 'policy', short: 'Policy' } },
    { id: 'q2', text: 'Gjennomfører dere egne aktsomhetsvurderinger?', config: { role: 'key', short: 'Egen vurdering' } },
    { id: 'q3', text: 'Hvor mange ledd bakover?', config: { options: ['Ingen'] } },
    { id: 'q4', text: 'Har dere avdekket brudd eller risiko?', config: { role: 'brudd', short: 'Brudd/risiko' } },
    { id: 'q5', text: 'Har dere en varslingskanal?', config: { role: 'key', short: 'Varslingskanal' } },
    { id: 'q6', text: 'Beskriv tiltakene', config: {} },
  ]

  it('takes the roled questions, in the survey’s own order', () => {
    expect(attributedColumns(packQuestions).map((c) => c.id)).toEqual(['q1', 'q2', 'q4', 'q5'])
  })

  it('heads each column with the pack’s short label and titles it with the full text', () => {
    const [first] = attributedColumns(packQuestions)
    expect(first!.label).toBe('Policy')
    expect(first!.full).toBe('Har virksomheten en policy for menneskerettigheter?')
  })

  it('falls back to the question text when the pack gave no short label', () => {
    // Not to a regex-derived abbreviation, and not to a truncation that would
    // read like a real heading. The full text in a narrow column is honest
    // about what it is.
    const [only] = attributedColumns([{ id: 'q', text: 'Et langt spørsmål uten kort form', config: { role: 'key' } }])
    expect(only!.label).toBe('Et langt spørsmål uten kort form')
  })
})

describe('isNegative — which answer the register colours as a finding', () => {
  it('«Ja» is the finding on the breach question, «Nei» on every other', () => {
    // The asymmetry is the whole reason `brudd` is its own role rather than
    // another `key`: on every other question a «Nei» is the thing to chase, and
    // on this one a «Ja» is.
    expect(isNegative('brudd', 'Ja')).toBe(true)
    expect(isNegative('brudd', 'Nei')).toBe(false)
    expect(isNegative('policy', 'Nei')).toBe(true)
    expect(isNegative('policy', 'Ja')).toBe(false)
    expect(isNegative('key', 'Nei')).toBe(true)
  })

  it('an unanswered question is not a finding', () => {
    expect(isNegative('brudd', null)).toBe(false)
    expect(isNegative('policy', undefined)).toBe(false)
    expect(isNegative('key', '')).toBe(false)
  })
})
