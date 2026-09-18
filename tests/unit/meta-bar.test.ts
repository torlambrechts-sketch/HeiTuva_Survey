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

  it.each(['no', 'en'])('%s carries every F5 cell string', (lang) => {
    const m = bag(lang === 'no' ? no : en, 'dashboard')
    for (const key of [
      'metaOwner', 'metaShared', 'metaNotShared', 'metaSharedLink',
      'metaRole_administrator', 'metaRole_redaktor', 'metaRole_leser',
      'metaReports', 'metaReportsNone', 'metaReportsCount', 'metaReportsNote',
    ])
      expect(m[key]?.trim(), `dashboard.${key}`).toBeTruthy()
  })

  it('the three entity cells render only when there IS an entity', () => {
    // A layout predating M:0132's backfill has no parent, and the strip then
    // shows the two cells that never needed one. The guard is that the source
    // gates them on `meta.hasDashboard` rather than on a falsy value, because
    // «no shares» and «no dashboard» are different states.
    const src = readFileSync('app/(app)/dashboard/DashboardScreen.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(src).toContain('meta.hasDashboard')
    expect(src).toContain("key: 'owner'")
    expect(src).toContain("key: 'shared'")
    expect(src).toContain("key: 'reports'")
  })

  it('«Eier» is never invented — no fallback name', () => {
    // v8:8969 falls back to the literal «Tuva Berg». A name belonging to
    // somebody else is worse than no name.
    // COMMENT-STRIPPED: the comment beside the lookup names «Tuva Berg» in
    // order to refuse it, and a grep over prose finds the word it forbids.
    // This project has gone red on that four times.
    const page = readFileSync('app/(app)/dashboard/page.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(page).not.toContain('Tuva Berg')
    expect(page).toContain('dashOwnerName')
  })

  it('«Rapporter» counts a RELATION, not a title match', () => {
    // v8:8970 counts `r.frozen.from === t` — the dashboard's title. Rename it
    // and the history empties. M:0134 gives reports a dashboard_id.
    const page = readFileSync('app/(app)/dashboard/page.tsx', 'utf8')
    expect(page).toContain("eq('dashboard_id', dashboardId)")
    const actions = readFileSync('app/(app)/dashboard/actions.ts', 'utf8')
    expect(actions, 'the freeze is the one writer').toContain('dashboardId: layout?.dashboard_id')
  })

  it('omits nothing now the entity exists — the old refusal is retired deliberately', () => {
    // «Eier» would be the viewer reading their own name, «Delt med» can only
    // ever say «Ikke delt» for a working layout, and «Rapporter · frosset
    // herfra» has no relation behind it — `reports` records no dashboard.
    // Asserted on the comment-stripped source, because MetaBar's own header
    // names all three in order to refuse them.
    // MetaBar stays a pure presenter: it renders the cells it is handed and
    // names none of them. That is what let T5 ship two and F5 ship five
    // without touching it.
    const src = readFileSync('app/(app)/dashboard/MetaBar.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    for (const absent of ['dashOwner', 'dashSharedWith', 'dashRepCount'])
      expect(src, `${absent} is v8's identifier, not ours`).not.toContain(absent)
    expect(src).toContain('cells.map')
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
