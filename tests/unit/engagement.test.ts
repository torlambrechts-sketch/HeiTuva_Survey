import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ENGAGEMENT_DEFAULTS,
  ENGAGE_TOGGLES,
  incentiveWarns,
  parseEngagement,
  showsCharityField,
  showsPrizeField,
  type Engagement,
} from '@/lib/engagement'

const with_ = (patch: Partial<Engagement>): Engagement => ({ ...ENGAGEMENT_DEFAULTS, ...patch })

/**
 * D232 — THE SIX TESTS THAT WERE HERE ARE GONE WITH THE MODEL THEY TESTED.
 *
 * They asserted `expectedResponseRate`'s eleven constants — 42 base, +7, +5,
 * +3, +4, +9, +8/+11/+4, -12, clamp 10-92 — faithfully and in detail. **A test
 * that pins an invented number is a guard for the invention**, which is the
 * same shape D158 recorded from the other side: the census fell, and the fall
 * was correct.
 *
 * What replaces them is the property, in both directions, so the model cannot
 * come back quietly.
 */
describe('D232 — no response-rate estimate is computed or shown', () => {
  /** `lib/engagement.ts` documents its own refusal and therefore CONTAINS the
   *  identifier it refuses. «A refusal named in a comment is found by a grep
   *  over that comment», so this measures the code. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name)
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p)
      return /\.tsx?$/.test(e.name) ? [p] : []
    })

  it('no source file computes one — the identifier survives only in prose', () => {
    const hits: string[] = []
    for (const dir of ['lib', 'app', 'components']) {
      for (const f of walk(dir)) {
        if (stripComments(readFileSync(f, 'utf8')).includes('expectedResponseRate')) hits.push(f)
      }
    }
    expect(hits, `still computing an estimate: ${hits.join(', ')}`).toEqual([])

    // Proven to FIRE rather than trusted: the same sweep over a synthetic line
    // finds it, so an empty result means absence and not a broken matcher.
    expect(stripComments('const r = expectedResponseRate(e, 4)')).toContain('expectedResponseRate')
    expect(stripComments('/* expectedResponseRate */')).not.toContain('expectedResponseRate')
  })

  it('the three message keys are gone and the refusal ships in both languages', () => {
    for (const lang of ['no', 'en']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as {
        builder: Record<string, string>
      }
      for (const k of ['expectedAnswers', 'expectedNote', 'expectedNoteLong']) {
        expect(m.builder[k], `${lang}.builder.${k} still shipped`).toBeUndefined()
      }
      expect(m.builder['engageNoEstimate']?.length ?? 0).toBeGreaterThan(20)
    }
    // And the panel renders no percentage of its own, and no longer takes the
    // prop that existed only for the deleted term.
    const panel = stripComments(
      readFileSync('app/(app)/undersokelser/[id]/bygg/EngagementPanel.tsx', 'utf8'),
    )
    expect(panel).not.toContain('{rate}')
    expect(panel).not.toContain('questionCount')
  })
})

describe('incentive rules', () => {
  it('warns only for a non-charity prize to employees', () => {
    expect(incentiveWarns(with_({ audience: 'ansatte', incentive: 'lotteri' }))).toBe(true)
    expect(incentiveWarns(with_({ audience: 'ansatte', incentive: 'alle' }))).toBe(true)
    expect(incentiveWarns(with_({ audience: 'ansatte', incentive: 'veldedig' }))).toBe(false)
    expect(incentiveWarns(with_({ audience: 'ansatte', incentive: 'ingen' }))).toBe(false)
    expect(incentiveWarns(with_({ audience: 'kunder', incentive: 'lotteri' }))).toBe(false)
  })

  it('shows the field the chosen incentive needs, and only that one', () => {
    expect(showsPrizeField(with_({ incentive: 'lotteri' }))).toBe(true)
    expect(showsPrizeField(with_({ incentive: 'alle' }))).toBe(true)
    expect(showsPrizeField(with_({ incentive: 'veldedig' }))).toBe(false)
    expect(showsCharityField(with_({ incentive: 'veldedig' }))).toBe(true)
    expect(showsCharityField(with_({ incentive: 'lotteri' }))).toBe(false)
  })
})

describe('parseEngagement', () => {
  it('fills every field from the defaults when the column is empty', () => {
    expect(parseEngagement({})).toEqual(ENGAGEMENT_DEFAULTS)
    expect(parseEngagement(null)).toEqual(ENGAGEMENT_DEFAULTS)
  })

  it('never turns a missing switch into undefined', () => {
    // A switch read as undefined renders as off and then SAVES as off, quietly
    // changing the survey. This is the case that matters.
    const parsed = parseEngagement({ audience: 'kunder' })
    for (const k of ENGAGE_TOGGLES) expect(typeof parsed[k], k).toBe('boolean')
    expect(parsed.audience).toBe('kunder')
    expect(parsed.reveal_results).toBe(true)
  })

  it('rejects a value outside the enum rather than passing it through', () => {
    expect(parseEngagement({ incentive: 'gullbarre' }).incentive).toBe('ingen')
    expect(parseEngagement({ comments: 'overalt' }).comments).toBe('lav')
    expect(parseEngagement({ audience: 42 }).audience).toBe('ansatte')
  })

  it('keeps strings it is given', () => {
    expect(parseEngagement({ thank_you: 'Tusen takk!' }).thank_you).toBe('Tusen takk!')
  })
})
