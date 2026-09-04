import { describe, expect, it } from 'vitest'
import { overlay } from '@/lib/i18n/overlay'
import no from '@/messages/no.json'

/**
 * The rule that decides what a page renders when the database is unreachable.
 *
 * `ui_messages` is seeded FROM /messages/*.json, so the bundle is the base and
 * the table is an overlay on it. Getting that direction wrong is not a cosmetic
 * bug: reading the table as the whole truth is what made `next build` die with
 * "ui_messages read failed: fetch failed" whenever no Supabase was reachable,
 * which is every CI run since Phase 0.
 */
describe('message overlay', () => {
  const base = { nav: { dash: 'Oversikt', surveys: 'Undersøkelser' }, results: { title: 'Resultater' } }

  it('lets the overlay win per key', () => {
    const out = overlay(base, { nav: { dash: 'Hjem' } })
    expect(out.nav!.dash).toBe('Hjem')
  })

  it('keeps keys the overlay does not mention', () => {
    // The failure this prevents: a partially seeded table blanking every key it
    // does not happen to contain, so the screen renders raw `nav.surveys`.
    const out = overlay(base, { nav: { dash: 'Hjem' } })
    expect(out.nav!.surveys).toBe('Undersøkelser')
    expect(out.results!.title).toBe('Resultater')
  })

  it('adds a namespace only the overlay has', () => {
    const out = overlay(base, { brand: { name: 'HeiTuva' } })
    expect(out.brand!.name).toBe('HeiTuva')
    expect(out.nav!.dash).toBe('Oversikt')
  })

  it('an empty overlay yields the base unchanged', () => {
    // An unseeded or unreachable table is not an instruction to render nothing.
    expect(overlay(base, {})).toEqual(base)
  })

  it('the bundled Norwegian set is a complete two-level map', () => {
    // The fallback is only worth having if the bundle is actually renderable:
    // every namespace maps keys to strings, with nothing nested deeper.
    const entries = Object.entries(no as Record<string, unknown>)
    expect(entries.length).toBeGreaterThan(10)
    for (const [ns, keys] of entries) {
      expect(typeof keys, `${ns} is not a namespace object`).toBe('object')
      for (const [k, v] of Object.entries(keys as Record<string, unknown>)) {
        expect(typeof v, `${ns}.${k} is not a string`).toBe('string')
      }
    }
  })
})
