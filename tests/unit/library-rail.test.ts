import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RAIL_LIMIT, splitRail, type RailChip } from '../../lib/library/rail'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * Q174 — «de fire med flest maler og nedtrekksliste etter det».
 *
 * The ranking is pure so the decisions in it can be tested without a browser
 * or a database, which is the only reason they are in a function at all.
 */
const chips: RailChip[] = [
  { key: 'Alle', label: 'Alle' },
  { key: 'hr', label: 'HR og arbeidsmiljø' },
  { key: 'cx', label: 'Kunder' },
  { key: 'intern', label: 'Intern tjeneste' },
  { key: 'medlem', label: 'Medlem og frivillig' },
  { key: 'offentlig', label: 'Offentlig sektor' },
  { key: 'leverandor', label: 'Leverandørkjede' },
  { key: 'Lovpålagt', label: 'Lovpålagt' },
  { key: 'annet', label: 'Annet' },
]
/** The seeded counts, measured 2026-09-13 against the local database. */
const seeded: Record<string, number> = {
  hr: 10,
  'Lovpålagt': 6,
  cx: 4,
  intern: 3,
  medlem: 2,
  offentlig: 2,
  leverandor: 1,
  annet: 0,
}
const count = (m: Record<string, number>) => (k: string) => m[k] ?? 0

describe('Q174 — four chips by count, the rest in a dropdown', () => {
  it('shows the reset chip plus the four with the most templates', () => {
    const { rail, overflow } = splitRail({ chips, count: count(seeded), active: 'Alle' })
    expect(rail.map((c) => c.key)).toEqual(['Alle', 'hr', 'Lovpålagt', 'cx', 'intern'])
    expect(rail.length).toBe(RAIL_LIMIT + 1)
    expect(overflow.map((c) => c.key)).toEqual(['medlem', 'offentlig', 'leverandor', 'annet'])
  })

  it('breaks a tie by editorial position, not by whatever sort happens to do', () => {
    /*
      THE SEEDED DATA ALREADY HAS ONE: «Medlem og frivillig» and «Offentlig
      sektor» are both 2. Ranking by count alone is not a total order, so a rail
      built on it can reshuffle between renders and between organisations — the
      chip you reached for moves while you are reaching.

      Measured at the boundary rather than in the middle: with a limit of 2, the
      tie decides who is on the rail at all.
    */
    const tied = { medlem: 2, offentlig: 2, hr: 1, cx: 1 }
    const a = splitRail({ chips, count: count(tied), active: 'Alle', limit: 2 })
    expect(a.rail.map((c) => c.key)).toEqual(['Alle', 'medlem', 'offentlig'])

    // The same counts, the chips reordered: the EDITORIAL order decides, so the
    // answer follows the input rather than the engine.
    const swapped = [chips[0]!, chips[5]!, chips[4]!, ...chips.slice(1, 4)] as RailChip[]
    const b = splitRail({ chips: swapped, count: count(tied), active: 'Alle', limit: 2 })
    expect(b.rail.map((c) => c.key)).toEqual(['Alle', 'offentlig', 'medlem'])
  })

  it('promotes an active category that did not make the top four', () => {
    // Otherwise the grid is filtered while nothing on the rail is lit and the
    // only evidence of the filter is the URL.
    const { rail, overflow } = splitRail({ chips, count: count(seeded), active: 'leverandor' })
    expect(rail.map((c) => c.key)).toEqual(['Alle', 'hr', 'Lovpålagt', 'cx', 'intern', 'leverandor'])
    expect(overflow.map((c) => c.key)).not.toContain('leverandor')
    // The four keep their places — the rail grows rather than reshuffling.
    expect(rail.slice(0, 5).map((c) => c.key)).toEqual(['Alle', 'hr', 'Lovpålagt', 'cx', 'intern'])
  })

  it('promotes nothing when the active category is already on the rail, or is the reset', () => {
    for (const active of ['Alle', 'hr', 'intern']) {
      const { rail } = splitRail({ chips, count: count(seeded), active })
      expect(rail.length, active).toBe(RAIL_LIMIT + 1)
    }
    // A category no chip carries cannot promote a phantom onto the rail.
    const { rail } = splitRail({ chips, count: count(seeded), active: 'ingenting' })
    expect(rail.length).toBe(RAIL_LIMIT + 1)
  })

  it('keeps the dropdown in editorial order, not rank order', () => {
    // A list you scan for a NAME reads better in the sequence it has everywhere
    // else; rank order is for the rail, where the point is prominence.
    const { overflow } = splitRail({ chips, count: count(seeded), active: 'Alle' })
    const editorial = chips.map((c) => c.key)
    const positions = overflow.map((c) => editorial.indexOf(c.key))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('degrades when there are fewer categories than the limit', () => {
    const few: RailChip[] = [chips[0]!, chips[1]!, chips[2]!]
    const { rail, overflow } = splitRail({ chips: few, count: count(seeded), active: 'Alle' })
    expect(rail.map((c) => c.key)).toEqual(['Alle', 'hr', 'cx'])
    expect(overflow).toEqual([])
  })

  it('the dropdown is a <select> with the FIELD hit-area utility', () => {
    /*
      CLAUDE.md's own instance, in the shape it takes here: a `<select>` is a
      REPLACED element, `::after` renders nothing on it, and `touch-44` is an
      `::after` overlay — so the wrong one of two adjacent utilities produces a
      36px target that no test but a measuring one can see. C4 shipped exactly
      that and `verify:responsive` measured 189x36.

      This is a spelling that must be recalled at the moment of writing, which
      is the form of rule that fails. Asserted instead.
    */
    const src = readFileSync('app/(app)/bibliotek/CategorySelect.tsx', 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).toContain('touch-44-field')
    expect(code).not.toMatch(/className="[^"]*\btouch-44\b(?!-field)/)
    // It navigates to an href the SERVER built — no second copy of the URL rules.
    expect(code).toMatch(/router\.push\(e\.target\.value\)/)
    expect(code).not.toMatch(/useSearchParams|URLSearchParams/)
  })

  it('the dropdown has a label in both languages, and it names no count', () => {
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const label = (set as { library: Record<string, string> }).library.moreCategories
      expect(label, `${lang}.library.moreCategories`).toBeTruthy()
      // «A description of a class may not carry a count of the instance in
      // front of you» — CLAUDE.md, row 11. «Fire til» would be false the moment
      // the registry gains a row.
      expect(label, lang).not.toMatch(/\d|fire|fem|seks|four|five|six/i)
    }
  })
})
