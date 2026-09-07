import { describe, expect, it } from 'vitest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'
import { readFileSync } from 'node:fs'

/**
 * The dashboard's panel vocabulary has TWO sources and they must not drift.
 *
 *   the REGISTRY   `report_section_types` with `on_dashboard` — which keys a
 *                  layout may name (Q51, enforced by the database)
 *   next-intl      what a panel is CALLED, because the registry has no `lang`
 *                  column and nothing translates it (Q48(b), not yet landed)
 *   the RENDERER   `renderPanel`'s switch — a panel is not data-only; drawing
 *                  one is code
 *
 * A key present in one and missing from another is a card with no title, a
 * title with no card, or a picker entry that adds a panel which renders
 * nothing. Asserted over the SET rather than key by key, because a new panel
 * arriving half-wired is exactly what a spot check misses.
 *
 * The offered set is read from the MIGRATION rather than from the database, so
 * this stays a unit test: the migration is what defines the set, and a test
 * that needed a running stack to check its own message file would not run in
 * the unit suite where it belongs.
 */
const MIGRATION = 'supabase/migrations/20260907000047_panel_registry.sql'
const SCREEN = 'app/(app)/dashboard/DashboardScreen.tsx'

function offeredKeys(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const updated = /set on_dashboard = true\s*\n\s*where key in \(([^)]*)\)/.exec(sql)
  const inserted = /insert into public\.report_section_types[^;]*?values \('([a-z_]+)'/.exec(sql)
  const keys = (updated?.[1] ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
  if (inserted?.[1]) keys.push(inserted[1])
  return keys
}

describe('the dashboard panel vocabulary', () => {
  const keys = offeredKeys()

  it('the migration offers the six panels the bundle draws, minus the deferred stream', () => {
    // A guard on the parser above: if the migration is reshaped and the regex
    // stops matching, every assertion below would pass over an empty set.
    expect(keys.sort()).toEqual(
      ['drivers', 'duties', 'heatmap', 'per_virksomhet', 'themes', 'trend'].sort(),
    )
    expect(keys, 'Q26: the stream panel has no registry row').not.toContain('stream')
  })

  it('every offered key has a NAME and a PICKER DESCRIPTION in BOTH languages', () => {
    // `desc_` and not `note_`: the picker's description is the bundle's
    // PANEL_LIB text (NEW:2956-2962), while a panel's own note is separate and
    // sometimes computed — the heatmap's interpolates k and has no static
    // form, which is why asserting on notes here would demand a string that
    // must not exist.
    for (const key of keys) {
      for (const [lang, msgs] of [['no', no], ['en', en]] as const) {
        const dash = msgs.dashboard as Record<string, string | undefined>
        expect(dash[`panel_${key}`], `${lang}.dashboard.panel_${key}`).toBeTruthy()
        expect(dash[`desc_${key}`], `${lang}.dashboard.desc_${key}`).toBeTruthy()
      }
    }
  })

  it('every offered key has a renderer arm', () => {
    const screen = readFileSync(SCREEN, 'utf8')
    for (const key of keys) {
      expect(screen, `renderPanel has no case for "${key}"`).toContain(`case '${key}':`)
    }
  })

  it('no name exists for a key the dashboard does not offer', () => {
    // The converse, which is the same rule from the other side: a leftover
    // `panel_stream` would make the picker look reachable the day someone
    // reads the message file to find out what exists.
    const dash = no.dashboard as Record<string, string>
    const named = Object.keys(dash)
      .filter((k) => k.startsWith('panel_'))
      .map((k) => k.slice('panel_'.length))
    expect(named.sort(), 'a name without a registry row is a promise nothing keeps')
      .toEqual([...keys].sort())
  })
})
