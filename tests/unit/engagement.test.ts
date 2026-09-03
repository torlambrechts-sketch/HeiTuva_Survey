import { describe, expect, it } from 'vitest'
import {
  ENGAGEMENT_DEFAULTS,
  ENGAGE_TOGGLES,
  expectedResponseRate,
  incentiveWarns,
  parseEngagement,
  showsCharityField,
  showsPrizeField,
  type Engagement,
} from '@/lib/engagement'

const with_ = (patch: Partial<Engagement>): Engagement => ({ ...ENGAGEMENT_DEFAULTS, ...patch })

describe('expectedResponseRate', () => {
  it('matches the design arithmetic for the column defaults', () => {
    // 42 base + personal 7 + deadline 5 + show_progress 3 + one_question 4
    // + reveal_results 9 = 70, no incentive, 4 questions.
    expect(expectedResponseRate(ENGAGEMENT_DEFAULTS, 4)).toBe(70)
  })

  it('is 42 with every lever off', () => {
    const off = with_({
      personal: false, deadline: false, show_progress: false,
      one_question: false, reveal_results: false,
    })
    expect(expectedResponseRate(off, 1)).toBe(42)
  })

  it('adds the design bonus per incentive', () => {
    const base = expectedResponseRate(ENGAGEMENT_DEFAULTS, 4)
    expect(expectedResponseRate(with_({ incentive: 'lotteri' }), 4)).toBe(base + 8)
    expect(expectedResponseRate(with_({ incentive: 'alle' }), 4)).toBe(base + 11)
    expect(expectedResponseRate(with_({ incentive: 'veldedig' }), 4)).toBe(base + 4)
  })

  it('takes 12 points off above eight questions, and only above', () => {
    expect(expectedResponseRate(ENGAGEMENT_DEFAULTS, 8)).toBe(70)
    expect(expectedResponseRate(ENGAGEMENT_DEFAULTS, 9)).toBe(58)
  })

  it('clamps to the design range', () => {
    const max = with_({ incentive: 'alle' })
    expect(expectedResponseRate(max, 1)).toBeLessThanOrEqual(92)
    const min = with_({
      personal: false, deadline: false, show_progress: false,
      one_question: false, reveal_results: false,
    })
    expect(expectedResponseRate(min, 40)).toBeGreaterThanOrEqual(10)
  })

  it('moves whenever any lever moves — the panel would teach nothing otherwise', () => {
    for (const k of ENGAGE_TOGGLES) {
      if (k === 'follow_up') continue // the design gives follow_up no weight
      const flipped = with_({ [k]: !ENGAGEMENT_DEFAULTS[k] } as Partial<Engagement>)
      expect(expectedResponseRate(flipped, 4), k).not.toBe(70)
    }
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
