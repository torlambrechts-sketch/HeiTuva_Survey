import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  COLS_DEFAULT,
  PANEL_MIN_H,
  distinctScopes,
  patchPanel,
  readCols,
  readPanels,
  scopeFor,
  scopeKey,
  spanOf,
  type LayoutFilters,
  type PanelEntry,
} from '@/lib/dashboard/layout'

const F: LayoutFilters = { period: 'y', group_id: null, survey_ids: ['s1', 's2'] }
const offered = ['trend', 'heatmap', 'themes']

describe('G1 — the panel carries its own layout', () => {
  it('spanOf clamps to the live column count rather than to the stored value', () => {
    // v8:7237-7244 — `Math.min(cols, stored)`. The STORED value is the intent.
    expect(spanOf({ key: 'a', wide: false, span: 6 }, 4)).toBe(4)
    expect(spanOf({ key: 'a', wide: false, span: 6 }, 6)).toBe(6)
  })

  it('6 -> 4 -> 6 is LOSSLESS, which is why the clamp is at render and not at write', () => {
    // v8 rescales stored spans when the count changes (v8:8951's
    // `Math.round((cur.size[k] * n) / old)`), and rounding loses the original.
    const e: PanelEntry = { key: 'a', wide: false, span: 6 }
    expect(spanOf(e, 4)).toBe(4)
    expect(spanOf(e, 6)).toBe(6) // the 6 survived the trip through 4 columns
  })

  it('with no span stored it falls back to `wide`, so every pre-G1 row still renders', () => {
    expect(spanOf({ key: 'a', wide: true }, 6)).toBe(6)
    expect(spanOf({ key: 'a', wide: false }, 6)).toBe(3)
    expect(spanOf({ key: 'a', wide: true }, 4)).toBe(4)
    expect(spanOf({ key: 'a', wide: false }, 4)).toBe(2)
  })

  it('the three heights are v8:7111 verbatim', () => {
    expect(PANEL_MIN_H).toEqual({ lav: '150px', normal: '230px', hoy: '340px' })
  })

  it('readCols admits only the two the bundle draws', () => {
    expect(readCols(4)).toBe(4)
    expect(readCols(6)).toBe(6)
    expect(readCols(5), 'a third value would make every stored span ambiguous').toBe(COLS_DEFAULT)
    expect(readCols(undefined)).toBe(COLS_DEFAULT)
    expect(readCols('4')).toBe(COLS_DEFAULT)
  })
})

describe('G1 — the panel carries its own scope, and absent means inherit', () => {
  it('no overrides is the dashboard scope exactly', () => {
    expect(scopeFor({ key: 'trend', wide: false }, F)).toEqual({
      survey_ids: ['s1', 's2'],
      group_id: null,
      period: 'y',
    })
  })

  it('`src` REPLACES the selection rather than intersecting it', () => {
    // That is what v8's single-select draws: one survey, not a narrowing of
    // the board's set.
    expect(scopeFor({ key: 'trend', wide: false, src: 's9' }, F).survey_ids).toEqual(['s9'])
  })

  it('each override is independent of the others', () => {
    const s = scopeFor({ key: 'trend', wide: false, grp: 'g1' }, F)
    expect(s.group_id).toBe('g1')
    expect(s.survey_ids, 'overriding the group must not disturb the surveys').toEqual(['s1', 's2'])
    expect(s.period).toBe('y')
  })

  it('panels sharing a scope are ONE fetch; the page does pre-G1 work on a plain board', () => {
    const plain: PanelEntry[] = [
      { key: 'trend', wide: false },
      { key: 'heatmap', wide: true },
      { key: 'themes', wide: false },
    ]
    expect(distinctScopes(plain, F)).toHaveLength(1)
  })

  it('and a board with two different overrides needs exactly two', () => {
    const mixed: PanelEntry[] = [
      { key: 'trend', wide: false },
      { key: 'heatmap', wide: true, grp: 'g1' },
      { key: 'themes', wide: false, grp: 'g1' },
    ]
    expect(distinctScopes(mixed, F)).toHaveLength(2)
  })

  it('scopeKey is order-insensitive in the survey list, or an identical scope fetches twice', () => {
    const a = scopeFor({ key: 'x', wide: false }, F)
    const b = scopeFor({ key: 'y', wide: false }, { ...F, survey_ids: ['s2', 's1'] })
    expect(scopeKey(a)).toBe(scopeKey(b))
  })
})

describe('G1 — patchPanel, and the no-sentinel rule', () => {
  it('undefined CLEARS an override rather than storing a value meaning «all»', () => {
    const before: PanelEntry[] = [{ key: 'trend', wide: false, grp: 'g1' }]
    const after = patchPanel(before, 'trend', { grp: undefined })
    expect('grp' in after[0]!, 'absent is the only spelling of «inherit»').toBe(false)
  })

  it('a break is stored as `true` or not at all — never as false', () => {
    const on = patchPanel([{ key: 'trend', wide: false }], 'trend', { br: true })
    expect(on[0]!.br).toBe(true)
    const off = patchPanel(on, 'trend', { br: undefined })
    expect('br' in off[0]!).toBe(false)
  })

  it('returns the SAME array for an unknown key, so a no-op writes nothing', () => {
    const before: PanelEntry[] = [{ key: 'trend', wide: false }]
    expect(patchPanel(before, 'nope', { span: 3 })).toBe(before)
  })

  it('touches only the named panel', () => {
    const before: PanelEntry[] = [
      { key: 'trend', wide: false },
      { key: 'heatmap', wide: true },
    ]
    const after = patchPanel(before, 'trend', { h: 'hoy' })
    expect(after[1]).toEqual(before[1])
  })
})

describe('G1 — readPanels admits only what the CHECK permits', () => {
  it('reads every new key back', () => {
    const stored = [
      { key: 'trend', wide: false, span: 4, h: 'hoy', br: true, src: 'u1', per: 'q', grp: 'g1' },
    ]
    expect(readPanels(stored, offered)[0]).toEqual({
      key: 'trend',
      wide: false,
      span: 4,
      h: 'hoy',
      br: true,
      src: 'u1',
      per: 'q',
      grp: 'g1',
    })
  })

  it('drops a value the database would refuse, so nothing unwritable is edited', () => {
    const stored = [{ key: 'trend', wide: false, span: 99, h: 'tall', per: '30', br: false }]
    const e = readPanels(stored, offered)[0]!
    expect(e.span, 'out of the CHECK\'s 1..6').toBeUndefined()
    expect(e.h, 'not one of v8\'s three').toBeUndefined()
    expect(e.per, 'v8\'s date windows are not our vocabulary').toBeUndefined()
    expect('br' in e, 'false is not stored; absent is').toBe(false)
  })
})

/**
 * THE GUARD OVER THE PAIR, not over either file.
 *
 * The Zod boundary strips unknown keys, so a panel key permitted by the CHECK
 * and absent from `PanelsInput` would post, return ok and save nothing —
 * D221's third face, and it was the state of this code until G1 widened it.
 * The migration and the action must name the same set, and this asserts it by
 * reading both rather than by restating the list a third time.
 */
describe('G1 — the CHECK and the Zod boundary name the same keys', () => {
  it('every key the migration permits is admitted by the action', () => {
    const sql = readFileSync('supabase/migrations/20260919000137_panel_layout_and_scope.sql', 'utf8')
    const clause = /@\."key" != "([a-z]+)"/g
    const permitted = new Set([...sql.matchAll(clause)].map((m) => m[1]!))
    expect(permitted.size, 'the allowlist clause was not found').toBeGreaterThan(4)

    const actions = readFileSync('app/(app)/dashboard/actions.ts', 'utf8')
    const body = actions.slice(actions.indexOf('const PanelsInput'), actions.indexOf('const FiltersInput'))
    const declared = new Set([...body.matchAll(/^\s{6}([a-z]+):/gm)].map((m) => m[1]!))

    for (const key of permitted) {
      expect(declared.has(key), `the CHECK permits \`${key}\` and Zod would silently drop it`).toBe(true)
    }
  })
})
