import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIBRARY_TAB,
  LIBRARY_TABS,
  TAB_HEADING_KEY,
  TAB_NAV_KEY,
  libraryTabHref,
  resolveLibraryTab,
} from '../../lib/library/tabs'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * Q172 — the library's tab rail moved into the shell, and the two halves of
 * that move are the ones a test has to hold together.
 *
 * The rail is rendered by `AppSubnav` and the content is chosen by the page.
 * They agree only because both read `lib/library/tabs.ts`; if either grows its
 * own copy, the pill that looks selected stops being the one the screen is
 * showing — and nothing about that failure is visible in a screenshot, because
 * every pill still renders and every tab still works.
 */
const page = readFileSync('app/(app)/bibliotek/page.tsx', 'utf8')
const subnav = readFileSync('components/AppSubnav.tsx', 'utf8')
/** The code, with `//` and block comments stripped. CLAUDE.md: a file that
 *  documents its own refusals contains the words it refuses — and this file's
 *  refusals are about a rail whose markup it must not contain. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('Q172 — the tab set is one registry, read by both renderers', () => {
  it('every tab has a subnav label and a card heading, in both languages', () => {
    for (const tab of LIBRARY_TABS) {
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        const nav = (set as { nav: Record<string, string> }).nav[TAB_NAV_KEY[tab]]
        const heading = (set as { library: Record<string, string> }).library[TAB_HEADING_KEY[tab]]
        expect(nav, `${lang}.nav.${TAB_NAV_KEY[tab]} (for ${tab})`).toBeTruthy()
        expect(heading, `${lang}.library.${TAB_HEADING_KEY[tab]} (for ${tab})`).toBeTruthy()
      }
    }
  })

  it('the surface name and the hero copy exist in both languages', () => {
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const lib = (set as { library: Record<string, string> }).library
      const nav = (set as { nav: Record<string, string> }).nav
      for (const key of [
        'title',
        'lead',
        'crumbRoot',
        'crumbHere',
        'countTemplates',
        'countBank',
        'countUseCases',
        'scopeLineTemplates',
        'scopeLineBank',
        'scopeLineUseCases',
      ]) {
        expect(lib[key], `${lang}.library.${key}`).toBeTruthy()
      }
      expect(nav.subnavLibrary, `${lang}.nav.subnavLibrary`).toBeTruthy()
    }
  })

  it('href and resolve are inverses, so no pill can look selected while another is shown', () => {
    for (const tab of LIBRARY_TABS) {
      const href = libraryTabHref(tab)
      const param = new URL(href, 'https://x').searchParams.get('fane')
      expect(resolveLibraryTab(param), tab).toBe(tab)
    }
    // The default tab is the one reached with no parameter at all — the single
    // asymmetry, and the one an `aria-current` comparison gets wrong.
    expect(libraryTabHref(DEFAULT_LIBRARY_TAB)).toBe('/bibliotek')
    expect(resolveLibraryTab(null)).toBe(DEFAULT_LIBRARY_TAB)
    expect(resolveLibraryTab(undefined)).toBe(DEFAULT_LIBRARY_TAB)
    // An unknown value is the default rather than an empty screen.
    expect(resolveLibraryTab('ingenting')).toBe(DEFAULT_LIBRARY_TAB)
  })

  it('the subnav renders the registry rather than a list of its own', () => {
    // Not «does it mention /bibliotek»: it must build the items by MAPPING the
    // registry, because a hand-written array is exactly what the admin rail's
    // six-of-eight instance was.
    expect(code(subnav)).toMatch(/LIBRARY_TABS\.map/)
    expect(code(subnav)).toMatch(/libraryTabHref\(resolveLibraryTab\(/)
  })

  it('the page keeps NO second copy of the rail — the condition the move rests on', () => {
    /*
      `AppSubnav` refuses the subnav on `admin` because that screen would then
      carry two controls doing one job, one of them out of date. The library
      only gets to have it because the in-page rail is gone.

      **«NO LINK THAT CHANGES TAB» IS THE WRONG PROPERTY, AND THE FIRST VERSION
      OF THIS TEST ASSERTED IT.** It failed on `UseCaseCard`'s «Se maler», which
      is a card ACTION — one use case, one destination — and is not a rail at
      all. What a rail is, is the whole tab set rendered together, so that is
      what is measured: the page may not build the set, and may not link to all
      of it.
    */
    const body = code(page)
    expect(body, 'the page imports the tab list').not.toMatch(/\bLIBRARY_TABS\b/)
    const linked = LIBRARY_TABS.filter(
      (tab) => body.includes(`fane: '${tab}'`) || body.includes(`fane=${tab}`),
    )
    expect(linked.length, `page links to ${linked.join(', ')}`).toBeLessThan(LIBRARY_TABS.length)
    // And what it does link to is named, so a new cross-tab link is a decision
    // somebody takes rather than one this test waves through.
    expect(linked).toEqual(['maler'])
  })

  it('the heading a tab shows is the tab, and the h1 is the surface', () => {
    // Handlinger's split, which Q172 copies: the h1 names the SURFACE and the
    // card names the view. Asserted over the shipped strings so a rename that
    // makes the two identical is visible.
    const lib = (no as { library: Record<string, string> }).library
    expect(lib.title).toBe('Bibliotek')
    expect(lib[TAB_HEADING_KEY.maler]).toBe('Maler')
    expect(lib[TAB_HEADING_KEY.bank]).toBe('Spørsmålsbank')
    expect(lib[TAB_HEADING_KEY.bruksomrader]).toBe('Bruksområder')
    for (const tab of LIBRARY_TABS) expect(lib[TAB_HEADING_KEY[tab]]).not.toBe(lib.title)
  })

  it('the hero and the card frame are on the page, and Bruksområder has no box', () => {
    const body = code(page)
    // Three heroes — one per tab, because the count line is a fact about the
    // filtered list and only the tab that fetched it can say what it is.
    expect((body.match(/<LibraryHero/g) ?? []).length).toBe(3)
    // Two cards: Maler and Spørsmålsbank. Bruksområder is a card grid already.
    expect((body.match(/<LibraryCard/g) ?? []).length).toBe(2)
  })

  it('Q173 — the filter rail is the Arbeidsliste\'s, and carries its spacing rule', () => {
    /*
      The rail's chips are `py-[7px]` — 30px painted — so a 44px hit area
      overflows 7px each side and adjacent chips need 14px between painted
      edges. `touch-cluster` is where globals.css keeps that arithmetic.

      **THIS IS CLAUDE.md ROW 10, AND IT HAS ALREADY FIRED ON THIS EXACT
      CONTROL** — C4 copied `gap-y-[13px]` onto a 30px chip from a 40px one and
      `verify:responsive` blocked with four overlaps at 320px. Copying the paint
      without the spacing rule is the whole failure mode of copying a control,
      so it is asserted rather than remembered.
    */
    const worklist = readFileSync('app/(app)/oppgaver/WorklistPanel.tsx', 'utf8')
    const chip = readFileSync('app/(app)/bibliotek/ChipLink.tsx', 'utf8')
    const body = code(page)
    // The geometry is the same control's, character for character.
    expect(code(chip)).toContain('px-3.5 py-[7px]')
    expect(code(worklist)).toContain('px-3.5 py-[7px]')
    // Every rail container in the library carries the spacing utility.
    const rails = body.match(/rounded-\[11px\] bg-sf2/g) ?? []
    expect(rails.length, 'two rails: Maler and Spørsmålsbank').toBe(2)
    for (const m of body.matchAll(/className="([^"]*rounded-\[11px\] bg-sf2[^"]*)"/g)) {
      expect(m[1], 'rail without touch-cluster').toContain('touch-cluster')
    }
    // …and so does the view toggle, whose chips are the same 30px.
    for (const m of body.matchAll(/className="([^"]*rounded-\[10px\] bg-sf2[^"]*)"/g)) {
      expect(m[1], 'toggle without touch-cluster').toContain('touch-cluster')
    }
  })

  it('Q173 — the filters stay LINKS, so a filtered library is still shareable', () => {
    // The Arbeidsliste's scope is component state and its chips are buttons.
    // Only the paint was copied: turning these into buttons to match would
    // substitute a control and lose the URL, which is why ChipLink exists.
    const chip = readFileSync('app/(app)/bibliotek/ChipLink.tsx', 'utf8')
    expect(code(chip)).not.toMatch(/<button/)
    expect((code(chip).match(/<Link/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('the lead promises only things the product does', () => {
    // The claim-set discipline, applied to copy of our own rather than a
    // bundle's: the bank adds into A DRAFT (D26 — the org's most recent one),
    // so the sentence may not say it adds into a running survey.
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const lead = ((set as { library: Record<string, string> }).library.lead ?? '').toLowerCase()
      expect(lead, lang).not.toMatch(/publiser|send ut|running survey|live survey/)
    }
    expect((no as { library: Record<string, string> }).library.lead).toContain('utkast')
    expect((en as { library: Record<string, string> }).library.lead).toContain('draft')
  })
})
