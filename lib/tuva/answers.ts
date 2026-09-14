/**
 * V6-5 — Tuva, the in-app helper (`tv*`, v6:5858 and v6:6855-6880).
 *
 * A registry of per-screen answers. Data-not-code in shape, but a MODULE rather
 * than a table, deliberately: every entry carries an `href` into this app, and a
 * row in a database cannot be type-checked against the routes that exist. The
 * whole failure this phase exists to avoid is an answer pointing somewhere that
 * is not there.
 *
 * ── THE RULE THIS FILE IS BUILT AROUND ─────────────────────────────────────
 *
 * **An answer points at a destination that exists, or it is not built.** Tor:
 * «a helper promising a screen we refused is worse than a helper with one fewer
 * answer.» The bundle's answers navigate to `sdTab`, `buildTab` and `adminTab`
 * values, and three of them could not be shipped as drawn:
 *
 *  1. **`sdTab:"feltarbeid"` — «Hvem mangler, og når bør du purre».** Feltarbeid
 *     is DECIDED-NOT-BUILT. The question underneath it has two halves and only
 *     one can be answered: «når bør du purre» is the reminder on Send, and
 *     «hvem mangler» is the refused surface. So the answer is KEPT, repointed at
 *     Send, and REWORDED — it may not promise the half that does not exist.
 *  2. **`sdTab:"malgruppe"` — «Hvem får den, og hvem faller fra».** Målgruppe
 *     ships as half a tab for the same reason, so the copy loses its second
 *     clause.
 *  3. **`build.short` — «Ingen blokkeringer — du kan sende» / «Noe må løses før
 *     du kan sende».** That is Q178's blocking language, and it is false about
 *     this product: nothing in Metodikk stops a send. Replaced with what is
 *     true.
 *
 * ── WHAT IS NOT BUILT, AND WHY ─────────────────────────────────────────────
 *
 * · **No on/off switch.** `tvShow` reads `(st.options || {}).tuva`, a key the
 *   bundle's own `options` object never sets — Q183, the fifth «who writes this
 *   column?» instance. A switch whose state nothing stores is decoration that
 *   claims to be a setting, so there is none: the panel is simply available.
 *   If a later phase wants one, that phase adds the writer and the test.
 * · **No thumbs up/down (`tvRated`) and no `tvTrackOpen`.** Both need somewhere
 *   to put what they collect, and no column exists. Building the control first
 *   and the writer «later» is the shape invariant 8 exists to refuse.
 */
export type TuvaAnswer = {
  /** Label on the chip. */
  label: string
  /** One line saying what it is for. */
  desc: string
  /** A real route in this app. */
  href: string
}

export type TuvaEntry = {
  headline: string
  short: string
  answers: TuvaAnswer[]
}

/**
 * Keyed by the path prefix the entry serves. Longest match wins, so
 * `/undersokelser/<id>/bygg` finds the Builder's entry before the list's.
 *
 * The message keys are resolved by the caller — copy lives in `messages/*.json`
 * like everything else, and a registry of Norwegian strings rendered straight
 * to screen is Q129's shape (`verify:i18n` can only name what collides with a
 * message it already holds, so it would not catch this one).
 */
export type TuvaKey =
  | 'bibliotek'
  | 'administrasjon'
  | 'bygg'
  | 'send'
  | 'profil'
  | 'oppgaver'

/** The answers, as message-key stems plus the href each one navigates to. */
export const TUVA_ANSWERS: Record<TuvaKey, { hrefs: string[] }> = {
  bibliotek: { hrefs: ['/bibliotek?fane=maler', '/bibliotek?fane=bank'] },
  administrasjon: {
    hrefs: [
      '/administrasjon/integrasjoner',
      '/administrasjon/personvern',
      '/administrasjon/brukere',
    ],
  },
  // `buildTab:"lint"` now resolves: V6-3 put Metodikk in the Builder.
  bygg: { hrefs: ['SURVEY/bygg', '/bibliotek?fane=maler'] },
  // `sdTab:"malgruppe"` resolves to the audience HALF; the personvern tab is
  // V6-4's. «Test først» is the Builder's own preview.
  send: { hrefs: ['SURVEY/malgruppe', 'SURVEY/personvern'] },
  profil: { hrefs: ['/profil'] },
  // The repointed answer: «når bør du purre» is the reminder on Send.
  oppgaver: { hrefs: ['/oppgaver'] },
}

/** Which entry a pathname gets, or null. Longest prefix wins. */
export function tuvaKeyFor(pathname: string): TuvaKey | null {
  if (/^\/undersokelser\/[0-9a-f-]{36}\/bygg/i.test(pathname)) return 'bygg'
  if (/^\/undersokelser\/[0-9a-f-]{36}\/send/i.test(pathname)) return 'send'
  if (pathname.startsWith('/administrasjon')) return 'administrasjon'
  if (pathname.startsWith('/bibliotek')) return 'bibliotek'
  if (pathname.startsWith('/oppgaver')) return 'oppgaver'
  if (pathname.startsWith('/profil')) return 'profil'
  return null
}

/** Resolve an href template against the survey in scope. `SURVEY/x` becomes
 *  `/undersokelser/<id>/x`; anything else is already absolute. */
export function tuvaHref(template: string, surveyId: string | null): string | null {
  if (!template.startsWith('SURVEY/')) return template
  if (!surveyId) return null
  return `/undersokelser/${surveyId}/${template.slice('SURVEY/'.length)}`
}
