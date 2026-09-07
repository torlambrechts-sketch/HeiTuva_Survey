import { describe, expect, it } from 'vitest'
import { thresholdLine } from '../../lib/dashboard/threshold-line'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/** DECISIONS Q42 — the RPC's k over the selection, with its own sentence for
 *  the organisation-only case. */
describe('(Q42) the threshold line', () => {
  it('reports the RPC k for a person selection', () => {
    for (const k of [3, 4, 5, 8, 10]) {
      expect(thresholdLine(k)).toEqual({ key: 'thresholdLine', values: { k } })
    }
  })

  it('THE ONE THAT MATTERS: k = 0 gets its own sentence, never the numeral', () => {
    // app.k_for returns 0 for an organisation survey. «strengeste terskel …: 0»
    // is true and reads as broken.
    expect(thresholdLine(0)).toEqual({ key: 'thresholdLineOrg', values: {} })
    expect(JSON.stringify(thresholdLine(0)), 'no zero reaches the copy').not.toContain('0')
  })

  it('distinguishes the three states 0, null and undefined', () => {
    // `if (!k)` would fold them into one. They are a selection with no
    // threshold by design, no selection, and no RPC result.
    const keys = [thresholdLine(0), thresholdLine(null), thresholdLine(undefined)].map((r) => r.key)
    expect(keys).toEqual(['thresholdLineOrg', 'thresholdLineNone', 'thresholdLineNone'])
  })

  it('every key it can return exists in both languages', () => {
    // Standing question 3: over the SET of outcomes, not the ones I picked.
    const produced = new Set(
      [0, 3, 5, 10, null, undefined].map((k) => thresholdLine(k).key),
    )
    expect(produced.size, 'all three branches are reachable').toBe(3)

    for (const key of produced) {
      const nb = (no.dashboard as Record<string, string>)[key]
      const eng = (en.dashboard as Record<string, string>)[key]
      expect(nb, `no.dashboard.${key}`).toBeTruthy()
      expect(eng, `en.dashboard.${key}`).toBeTruthy()
    }
  })

  it("the two data-free sentences carry no placeholder — D98's rule", () => {
    // A line that varied with the data would be an oracle for the data. Only
    // the person branch may interpolate, and it interpolates the THRESHOLD,
    // which is a setting, not an answer.
    for (const key of ['thresholdLineOrg', 'thresholdLineNone']) {
      for (const [lang, msgs] of [['no', no], ['en', en]] as const) {
        const value = (msgs.dashboard as Record<string, string>)[key]!
        expect(value, `${lang}.dashboard.${key} must not interpolate`).not.toMatch(/\{[^}]+\}/)
      }
    }

    // Positive control: without this, the rule above would pass on a file where
    // nothing interpolates at all.
    for (const msgs of [no, en]) {
      expect((msgs.dashboard as Record<string, string>).thresholdLine).toMatch(/\{k\}/)
    }
  })
})
