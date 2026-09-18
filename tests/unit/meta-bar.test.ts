import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'
import { selectionLine } from '../../lib/dashboard/selection-line'

/**
 * T5.1 — the dashboard meta strip, and the three cells it deliberately omits.
 */
const bag = (m: unknown, ns: string) => (m as Record<string, Record<string, string>>)[ns] ?? {}
const GROUPS = [{ id: 'g1', name: 'Ledelse' }]

describe('T5.1 — «Utvalg» is derived, not composed at the call site', () => {
  it('maps all three periods, which is the whole enum', () => {
    // A wrong arm mislabels every panel on the screen as covering a span it
    // does not, and nothing else would fail.
    expect(selectionLine({ period: 'q', group_id: null, survey_ids: [] }, GROUPS).periodKey).toBe('periodLast')
    expect(selectionLine({ period: 'h', group_id: null, survey_ids: [] }, GROUPS).periodKey).toBe('periodTwo')
    expect(selectionLine({ period: 'y', group_id: null, survey_ids: [] }, GROUPS).periodKey).toBe('periodAll')
  })

  it('names the group when one is selected, and nothing when it is every group', () => {
    expect(selectionLine({ period: 'q', group_id: 'g1', survey_ids: [] }, GROUPS).groupName).toBe('Ledelse')
    expect(selectionLine({ period: 'q', group_id: null, survey_ids: [] }, GROUPS).groupName).toBeNull()
  })

  it('a group the viewer cannot resolve reads as no filter, not as a blank', () => {
    // RLS decides which groups resolve. A stale id in a saved layout must not
    // render an empty segment, and must not disclose that an id it cannot
    // resolve exists.
    expect(selectionLine({ period: 'q', group_id: 'gone', survey_ids: [] }, GROUPS).groupName).toBeNull()
  })

  it.each(['no', 'en'])('%s carries every string the strip reads', (lang) => {
    const m = bag(lang === 'no' ? no : en, 'dashboard')
    for (const key of ['metaSelection', 'metaPrivacy', 'periodLast', 'periodTwo', 'periodAll', 'allGroups', 'thresholdScope'])
      expect(m[key]?.trim(), `dashboard.${key}`).toBeTruthy()
  })

  it('omits the three cells that would state a fact we do not hold', () => {
    // «Eier» would be the viewer reading their own name, «Delt med» can only
    // ever say «Ikke delt» for a working layout, and «Rapporter · frosset
    // herfra» has no relation behind it — `reports` records no dashboard.
    // Asserted on the comment-stripped source, because MetaBar's own header
    // names all three in order to refuse them.
    const src = readFileSync('app/(app)/dashboard/MetaBar.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    for (const absent of ['dashOwner', 'dashSharedWith', 'dashRepCount', 'Ikke delt', 'frosset herfra'])
      expect(src, `${absent} is not rendered`).not.toContain(absent)
  })

  it('the strip carries v8 own declared geometry, each value from its own entry', () => {
    const src = readFileSync('app/(app)/dashboard/MetaBar.tsx', 'utf8')
    expect(src).toContain('repeat(auto-fit,minmax(180px,1fr))')  // v8:2422
    expect(src).toContain('gap-y-[18px] gap-x-[26px]')            // gap:18px 26px
    expect(src).toContain('px-[22px] py-5')                       // padding:20px 22px
    // min-height:37px belongs to v8's two-line KPI labels and is not carried.
    expect(src).not.toContain('min-h-[37px]')
  })
})
