import { describe, expect, it } from 'vitest'
import {
  addPanel,
  archetypeOf,
  defaultWide,
  filtersForPreset,
  movePanel,
  readFilters,
  readPanels,
  removePanel,
  toggleWidth,
  type LayoutFilters,
  type PanelEntry,
} from '../../lib/dashboard/layout'

const L = (...keys: string[]): PanelEntry[] => keys.map((key) => ({ key, wide: defaultWide(key) }))
const keys = (p: PanelEntry[]) => p.map((x) => x.key)
const OFFERED = ['trend', 'heatmap', 'drivers', 'themes', 'per_virksomhet', 'duties']

describe('(Q51) moving, widening and removing a panel', () => {
  it('moves a panel one place in each direction', () => {
    const l = L('trend', 'heatmap', 'drivers')
    expect(keys(movePanel(l, 'heatmap', -1))).toEqual(['heatmap', 'trend', 'drivers'])
    expect(keys(movePanel(l, 'heatmap', 1))).toEqual(['trend', 'drivers', 'heatmap'])
  })

  it('returns the SAME array at either edge, and for a key that is not there', () => {
    // Identity, not equality: the caller compares by reference to decide
    // whether to persist, so a no-op that allocated would write a row on every
    // click of a disabled button.
    const l = L('trend', 'heatmap')
    expect(movePanel(l, 'trend', -1)).toBe(l)
    expect(movePanel(l, 'heatmap', 1)).toBe(l)
    expect(movePanel(l, 'themes', -1)).toBe(l)
    expect(toggleWidth(l, 'themes')).toBe(l)
    expect(removePanel(l, 'themes')).toBe(l)
    expect(addPanel(l, 'trend')).toBe(l)
  })

  it('a move is reversible, over every position in the list', () => {
    // Over the SET of positions, not the one I picked: an off-by-one at an
    // interior index is exactly what a single example misses.
    const l = L('trend', 'heatmap', 'drivers', 'themes')
    for (let i = 1; i < l.length; i++) {
      const k = l[i]!.key
      expect(keys(movePanel(movePanel(l, k, -1), k, 1)), `position ${i}`).toEqual(keys(l))
    }
  })

  it('the heatmap is wide by default and nothing else is', () => {
    // The bundle's rule is `heatmap` or `stream` (NEW:3673); `stream` has no
    // registry row (Q26), so one key remains. Asserted over the offered SET so
    // a new panel arriving wide by accident shows up here.
    expect(OFFERED.filter(defaultWide)).toEqual(['heatmap'])
  })

  it('toggling width leaves order and every other panel untouched', () => {
    const l = L('trend', 'heatmap', 'drivers')
    const next = toggleWidth(l, 'trend')
    expect(keys(next)).toEqual(keys(l))
    expect(next.find((p) => p.key === 'trend')!.wide).toBe(true)
    expect(next.find((p) => p.key === 'heatmap')!.wide).toBe(l[1]!.wide)
  })

  it('adding is idempotent — a panel cannot appear twice', () => {
    // A duplicate key would draw the same panel twice and give both cards the
    // same move target.
    let l = L('trend')
    l = addPanel(l, 'themes')
    l = addPanel(l, 'themes')
    expect(keys(l)).toEqual(['trend', 'themes'])
  })
})

describe('(Q51) reading a stored layout', () => {
  it('drops a key the dashboard no longer offers, and keeps the rest in place', () => {
    // The database refuses an unoffered key on WRITE, so a stored one means the
    // registry changed afterwards. Refusing the whole layout would punish the
    // member for an administrator's change.
    const stored = [
      { key: 'trend', wide: false },
      { key: 'stream', wide: true },
      { key: 'drivers', wide: false },
    ]
    expect(keys(readPanels(stored, OFFERED))).toEqual(['trend', 'drivers'])
  })

  it('survives every malformed shape rather than throwing', () => {
    for (const bad of [null, undefined, 42, 'trend', {}, [null], [42], [{}], [{ key: 7 }]]) {
      expect(() => readPanels(bad, OFFERED)).not.toThrow()
      expect(readPanels(bad, OFFERED)).toEqual([])
    }
  })

  it('de-duplicates, and treats a missing wide as narrow', () => {
    const out = readPanels([{ key: 'trend' }, { key: 'trend', wide: true }], OFFERED)
    expect(out).toEqual([{ key: 'trend', wide: false }])
  })

  it('reads filters back, defaulting a bad period to «alle runder»', () => {
    expect(readFilters({ period: 'q', group_id: 'g1', survey_ids: ['s1'] })).toEqual({
      period: 'q',
      group_id: 'g1',
      survey_ids: ['s1'],
    })
    expect(readFilters({ period: 'nonsense' }).period).toBe('y')
    expect(readFilters(null)).toEqual({ period: 'y', group_id: null, survey_ids: [] })
    expect(readFilters({ group_id: '' }).group_id, 'an empty string is not a group').toBeNull()
  })

  it('archetypes are derived from the key, over every offered panel', () => {
    expect(OFFERED.map(archetypeOf)).toEqual(['agg', 'agg', 'agg', 'agg', 'reg', 'duty'])
  })
})

describe('(Q51, Tor) saving a shared preset says what it drops', () => {
  const withGroup: LayoutFilters = { period: 'q', group_id: 'g1', survey_ids: ['s1'] }
  const without: LayoutFilters = { period: 'q', group_id: null, survey_ids: ['s1'] }

  it('THE ONE THAT MATTERS: a group filter is dropped AND reported', () => {
    // The CHECK refuses the row; this is what lets the screen say why before
    // the member wonders where their filter went. Both halves asserted,
    // because dropping silently is the failure being prevented.
    const out = filtersForPreset(withGroup)
    expect(out.stored.group_id, 'the group does not travel').toBeNull()
    expect(out.groupDropped, 'and the caller is told, so it can say so').toBe(true)
  })

  it('keeps the period and the survey selection, which DO travel', () => {
    // Only the group is refused. A preset that also lost its period and
    // surveys would be a preset of nothing.
    const out = filtersForPreset(withGroup)
    expect(out.stored.period).toBe('q')
    expect(out.stored.survey_ids).toEqual(['s1'])
  })

  it('reports nothing dropped when no group is set', () => {
    // The positive control: without it, `groupDropped: true` hard-coded would
    // pass the test above.
    const out = filtersForPreset(without)
    expect(out.groupDropped).toBe(false)
    expect(out.stored).toEqual(without)
  })
})
