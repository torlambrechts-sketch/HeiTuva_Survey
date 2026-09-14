/**
 * F3 — the breadcrumb, once, for every screen the drawing puts one on.
 *
 * ── THE FINDING THIS COMES FROM ────────────────────────────────────────────
 *
 * The 2026-09-14 audit's cleanest class: **a shared surface has no owner when
 * phases are per-screen, so it gets built wherever the phase happened to be
 * standing.** The breadcrumb was drawn on five screens and built on two —
 * Bibliotek (Q172) and Handlinger (V5-2) — as two hand-rolled copies with two
 * different key pairs (`library.crumbRoot` and `tasks.wlCrumbRoot`), and never
 * propagated. `grep -rn 'opacity-50">→' app/` returned exactly two hits.
 *
 * So this is a REGISTRY and the shell renders from it: a sixth screen gets a
 * breadcrumb by gaining a row here, not by someone remembering.
 *
 * ── MEASURED: FIVE, NOT SIX — AND THE SIXTH IS A DIFFERENT CONTROL ─────────
 *
 * The audit said six. Re-read line by line, v6 draws the breadcrumb proper on
 * **five**: Undersøkelser (v6:2127), Innsikt (v6:2473), Rapporter (v6:2797),
 * Handlinger (v6:3668) and Bibliotek (v6:4616).
 *
 * The sixth, on the survey detail (v6:1155-1159), is **a back BUTTON** — a
 * bordered 30px control carrying a chevron and the word «Undersøkelser»,
 * followed by `→ {title}`. Not the same surface, and the app already expresses
 * it as `SurveyContextBar`'s ← link. It is left for F5, where the survey chrome
 * is being reconsidered anyway, rather than folded in here on a resemblance.
 *
 * ── THE ICON IS PER SCREEN, AND HANDLINGER HAS NONE ────────────────────────
 *
 * Four screens carry a 28px rounded chip with an icon and a tint; Handlinger
 * carries none and uses `gap:9px` where the others use `gap:10px` (v6:3667).
 * That is the drawing's own inconsistency, reproduced rather than tidied — «all
 * of them have an icon» is an enumeration read as a property, and acting on it
 * would have invented a fifth icon nobody drew.
 */
export type CrumbKey = 'surveys' | 'insight' | 'tasks' | 'library'

export type Crumb = {
  /** `crumb.<leaf>` in `messages/*.json`. */
  leaf: CrumbKey
  /** v6's 28px chip, or null where the drawing has none. */
  icon: 'surveys' | 'insight' | 'library' | null
  /** The chip's background — a theme token, quoted from the drawing. */
  tint: string | null
}

export const CRUMBS: Record<CrumbKey, Crumb> = {
  // v6:2121 — `--ac`, a document with three rules.
  surveys: { leaf: 'surveys', icon: 'surveys', tint: 'var(--ac)' },
  // v6:2471 and v6:2795 — `--ac3`, rising bars. Dashboard and Rapporter share
  // BOTH the icon and the leaf «Innsikt», exactly as the subnav's label does.
  insight: { leaf: 'insight', icon: 'insight', tint: 'var(--ac3)' },
  // v6:3667 — no chip at all.
  tasks: { leaf: 'tasks', icon: null, tint: null },
  // v6:4614 — `--ac2`, two books.
  library: { leaf: 'library', icon: 'library', tint: 'var(--ac2)' },
}

/**
 * Which breadcrumb this path gets, or null for a screen the drawing gives none.
 *
 * Exact paths, not prefixes: `/undersokelser` is the list and
 * `/undersokelser/<id>/…` is the survey detail, which has the back button
 * instead. A prefix match would put the list's crumb on eight survey tabs.
 */
export function crumbFor(pathname: string): CrumbKey | null {
  switch (pathname) {
    case '/undersokelser':
      return 'surveys'
    case '/dashboard':
    case '/rapporter':
      return 'insight'
    case '/oppgaver':
      return 'tasks'
    case '/bibliotek':
      return 'library'
    default:
      return null
  }
}
