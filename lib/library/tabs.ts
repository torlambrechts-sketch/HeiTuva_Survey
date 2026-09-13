/**
 * Bibliotek's tab set, as a registry rather than as three literals.
 *
 * ── WHY THIS MOVED OUT OF `app/(app)/bibliotek/chips.ts` (Q172) ────────────
 *
 * The tabs are now rendered by the SHELL — `AppSubnav`, a client component in
 * `components/` — as well as by the page that owns them. Two renderers reading
 * two copies of «which tabs exist» is how a rail and a screen drift apart, and
 * this file already carries the instance: `AppSubnav`'s own header documents
 * the `admin` case, where the bundle draws a six-item rail beside an eight-item
 * one and the six is an enumeration of the tabs that existed the day it was
 * drawn.
 *
 * So the href is a FUNCTION here rather than a string in each caller. The
 * subnav's `aria-current` compares hrefs, and the page resolves `?fane=` — if
 * those two disagree about what «maler» is spelled as, the pill that looks
 * selected is not the one that is. `libraryTabHref` and `resolveLibraryTab` are
 * the two halves of one fact, kept in one place.
 */
export const LIBRARY_TABS = ['bruksomrader', 'maler', 'bank'] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

/**
 * The tab a bare `/bibliotek` shows. It is «Maler» rather than the first entry
 * of the list: the rail leads with «Bruksområder» (Q24, NEW:4460) and the
 * screen has always opened on the templates. Named rather than implied,
 * because `libraryTabHref` omits the parameter for exactly this value and a
 * mismatch there is a link that looks selected and is not.
 */
export const DEFAULT_LIBRARY_TAB: LibraryTab = 'maler'

/** `nav.*` message keys — the subnav pills. */
export const TAB_NAV_KEY: Record<LibraryTab, string> = {
  bruksomrader: 'subnavUseCases',
  maler: 'subnavTemplates',
  bank: 'subnavBank',
}

/**
 * `library.*` message keys — the heading on the card the tab's content sits
 * in, which is the «Arbeidsliste» position on the Handlinger screen. A record
 * rather than a ternary at the call site, for the reason `TYPE_TITLE_KEY` is
 * one: a fourth tab cannot arrive without `tsc` demanding a heading for it.
 */
export const TAB_HEADING_KEY: Record<LibraryTab, string> = {
  bruksomrader: 'tabUseCases',
  maler: 'tabTemplates',
  bank: 'tabBank',
}

/** Where a tab lives. The default tab carries no parameter. */
export function libraryTabHref(tab: LibraryTab): string {
  return tab === DEFAULT_LIBRARY_TAB ? '/bibliotek' : `/bibliotek?fane=${tab}`
}

/** `?fane=` → a tab. An unknown value is the default, never an empty screen. */
export function resolveLibraryTab(raw: string | null | undefined): LibraryTab {
  return LIBRARY_TABS.find((v) => v === raw) ?? DEFAULT_LIBRARY_TAB
}
