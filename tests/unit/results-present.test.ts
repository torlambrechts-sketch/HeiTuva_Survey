import { describe, expect, it } from 'vitest'
import {
  DASH,
  barColor,
  fmt,
  heatTone,
  no,
  panelTone,
  pctOf5,
  pctOfEnps,
  questionBars,
  scaleKeys,
  teamTone,
} from '@/lib/results/present'
import type { QuestionResult } from '@/lib/results/types'

/**
 * The thresholds on this screen are transcribed from three different places in
 * the design bundle, and two of them are deliberately different from each other
 * (the heatmap breaks at 4,2/3,6 and the Resultater team bar at 4,3/4,0). A slip
 * here recolours a panel without failing anything else in the suite, so the
 * boundaries are asserted exactly — including the values that sit ON them.
 */
describe('Norwegian number formatting', () => {
  it('uses a comma and one decimal, like the bundle', () => {
    expect(no(4.25)).toBe('4,3')
    expect(no(4)).toBe('4,0')
    expect(no(-0.3)).toBe('-0,3')
  })

  it('renders a missing value as the design em dash, not as zero', () => {
    expect(fmt(null)).toBe(DASH)
    expect(fmt(undefined)).toBe(DASH)
    expect(fmt(0)).toBe('0,0')
  })
})

describe('the heat ramp (HeiTuva.dc.html:2801)', () => {
  const cell = (avg: number) => ({ question_id: 'q', n: 5, avg })

  it('is green at 4,2 and yellow just below', () => {
    expect(heatTone(cell(4.2))).toBe('#CFE7E4')
    expect(heatTone(cell(4.19))).toBe('#FBEBBE')
  })

  it('is yellow at 3,6 and red just below', () => {
    expect(heatTone(cell(3.6))).toBe('#FBEBBE')
    expect(heatTone(cell(3.59))).toBe('#FBD5C4')
  })

  it('paints a gated cell as the neutral surface, never as a low score', () => {
    // The bug this prevents: falling through to the "red" branch because the
    // average is undefined. A withheld cell would then read as the worst result
    // in the grid.
    expect(heatTone({ question_id: 'q', insufficient_data: true })).toBe('var(--sf2)')
  })
})

describe('the two team ramps are genuinely different', () => {
  it('Resultater breaks at 4,3 and 4,0', () => {
    expect(teamTone(4.3)).toBe('var(--ac2)')
    expect(teamTone(4.29)).toBe('var(--ac)')
    expect(teamTone(4)).toBe('var(--ac)')
    expect(teamTone(3.99)).toBe('var(--ac3)')
  })

  it('the report/dashboard panel breaks at 4,2 and 3,6', () => {
    expect(panelTone(4.2)).toBe('var(--ac2)')
    expect(panelTone(4.19)).toBe('var(--ac)')
    expect(panelTone(3.6)).toBe('var(--ac)')
    expect(panelTone(3.59)).toBe('var(--ac3)')
  })

  it('and 4,25 lands on different colours in each — which is the point', () => {
    expect(teamTone(4.25)).not.toBe(panelTone(4.25))
  })
})

describe('bar geometry', () => {
  it('maps a 1-5 mean onto the track', () => {
    expect(pctOf5(5)).toBe(100)
    expect(pctOf5(2.5)).toBe(50)
  })

  it('puts an eNPS of zero at the middle and clamps the ends', () => {
    expect(pctOfEnps(0)).toBe(50)
    expect(pctOfEnps(-100)).toBe(0)
    expect(pctOfEnps(100)).toBe(100)
    expect(pctOfEnps(999)).toBe(100)
  })

  it('cycles the three accents', () => {
    expect(barColor(0)).toBe('var(--ac)')
    expect(barColor(3)).toBe('var(--ac)')
    expect(barColor(4)).toBe('var(--ac2)')
  })
})

describe('scaleKeys', () => {
  it('labels the ends and leaves the middle bare', () => {
    expect(scaleKeys(5, 'ikke i det hele tatt', 'helt enig')).toEqual([
      { key: '1', label: '1 — ikke i det hele tatt' },
      { key: '2', label: '2' },
      { key: '3', label: '3' },
      { key: '4', label: '4' },
      { key: '5', label: '5 — helt enig' },
    ])
  })

  it('honours a ten-point scale and refuses a nonsensical one', () => {
    expect(scaleKeys(10, 'lav', 'høy')).toHaveLength(10)
    expect(scaleKeys(0, 'lav', 'høy')).toHaveLength(2)
    expect(scaleKeys(99, 'lav', 'høy')).toHaveLength(10)
  })
})

describe('questionBars', () => {
  const keys = scaleKeys(5, 'lav', 'høy')

  it('renders an unchosen option as a real zero, not as a gap', () => {
    const result: QuestionResult = {
      question_id: 'q',
      type: 'scale',
      text: 'Hvordan går det?',
      n: 6,
      avg: 4,
      distribution: [
        { value: '4', count: 4 },
        { value: '5', count: 2 },
      ],
    }
    const bars = questionBars(result, keys)
    expect(bars).toHaveLength(5)
    expect(bars[0]!.value).toBe('0 (0%)')
    expect(bars[3]!.value).toBe('4 (67%)')
    // Width is relative to the largest bar, as the bundle draws it.
    expect(bars[3]!.pct).toBe(100)
    expect(bars[4]!.pct).toBe(50)
  })

  it('returns nothing at all for a gated question', () => {
    // Not "bars of zero" — a gated question has no numbers, and a row of empty
    // bars would read as "everyone answered nothing".
    const gated: QuestionResult = {
      question_id: 'q',
      type: 'scale',
      text: 'Hvordan går det?',
      n: null,
      insufficient_data: true,
    }
    expect(questionBars(gated, keys)).toEqual([])
  })
})
