/**
 * V6-2 — the survey's tab set, as ONE registry read by both renderers.
 *
 * v6 replaces Bygg/Send/Resultater-as-three-steps with a survey DETAIL screen
 * carrying eleven tabs (`sd.tab*`, v6:1255-2096), and its own script builds
 * those tabs in the SAME function that builds the shell subnav for the
 * Arbeidsliste and Administrasjon (v6:8629). So this rail belongs in
 * `AppSubnav`, not in a bespoke component — which is also Q172's precedent,
 * and `lib/library/tabs.ts` is the shape this file copies deliberately.
 *
 * ── THE PATHS STAY, AND THAT IS A DECISION RATHER THAN AN ECONOMY ──────────
 *
 * The bundle draws one page with a tab variable, which in Next terms is
 * `/undersokelser/[id]?fane=`. Tor's ruling: **keep the paths.** «A survey has
 * three phases with distinct state, and a URL saying which one you are in is a
 * property, not an implementation choice. `?fane=` trades a truth for a
 * parameter and turns five routes into one page with a variable.»
 *
 * Measured, the economy is real too — 38 app/lib references, 27 test
 * references and 25 manifest entries point at these paths — but it is the
 * second reason, not the first.
 *
 * ── THE SET GROWS PER PHASE, AND ONLY WHAT EXISTS IS IN IT ────────────────
 *
 * v6 draws eleven. Three are re-parents of routes that already exist and they
 * are what V6-2 ships. The rest arrive with the phase that builds them, and two
 * never will: `over` (Oversikt) is NOT NOW — «a tab that gathers figures from
 * three other tabs is a fourth copy of them, and copies drift» — and
 * `feltarbeid` is DECIDED-NOT-BUILT, because a screen organised around who is
 * missing in a group of six is a list of five names and an omission.
 *
 * **A tab is in this list only when its route exists.** That is what keeps the
 * rail from promising a screen we decided against — the same rule that governs
 * Tuva's answers.
 *
 * ── AND `malgruppe` IS NOT HERE, WHICH IS A DECISION RATHER THAN A GAP ─────
 *
 * V6-4 built three of the four narrowings. `malgruppe` — «hvem får den, og hvem
 * faller fra» — sits directly against the reasoning that refused Feltarbeid:
 * **a screen organised around who is missing in a group of six is a list of
 * five names and an omission.** The audience half (which groups a round went
 * to) is probably fine; the drop-off half is the refused surface wearing a
 * different tab's name, and the bundle draws them together.
 *
 * Separating them is a decision about what the tab IS, not an implementation
 * detail — so it goes back to Tor rather than being settled here by whoever
 * happens to build it. Logged, not built.
 */
export const SURVEY_TABS = [
  'sporsmal',
  'utsending',
  'resultat',
  'kommentarer',
  'tiltak',
  'personvern',
  'historikk',
] as const
export type SurveyTab = (typeof SURVEY_TABS)[number]

/** The path segment each tab owns. The segment is the SOURCE OF TRUTH for which
 *  tab is current — there is no parameter to disagree with it. */
export const TAB_SEGMENT: Record<SurveyTab, string> = {
  sporsmal: 'bygg',
  utsending: 'send',
  resultat: 'resultater',
  kommentarer: 'kommentarer',
  tiltak: 'tiltak',
  personvern: 'personvern',
  historikk: 'historikk',
}

/** Message keys, in `nav`. Keyed by the registry so a fourth tab is a compile
 *  error rather than a pill that silently never renders. */
export const TAB_NAV_KEY: Record<SurveyTab, string> = {
  sporsmal: 'subnavSurveyQuestions',
  utsending: 'subnavSurveySend',
  resultat: 'subnavSurveyResults',
  kommentarer: 'subnavSurveyComments',
  tiltak: 'subnavSurveyTasks',
  personvern: 'subnavSurveyPrivacy',
  historikk: 'subnavSurveyHistory',
}

export function surveyTabHref(surveyId: string, tab: SurveyTab): string {
  return `/undersokelser/${surveyId}/${TAB_SEGMENT[tab]}`
}

/**
 * The survey id and current tab for a pathname, or null when the path is not a
 * survey sub-route.
 *
 * Returns a tab of `null` for `/live` and `/test`, which are real routes with
 * no pill: the rail then renders with nothing marked current rather than
 * marking the wrong one. **That case is the reason this returns a shape instead
 * of a tab** — «no pill is current» and «the first pill is current» are
 * different, and only one of them is true on `/live`.
 */
export function resolveSurveyPath(
  pathname: string,
): { surveyId: string; tab: SurveyTab | null } | null {
  const m = /^\/undersokelser\/([0-9a-f-]{36})(?:\/([^/?]+))?/i.exec(pathname)
  if (!m) return null
  const seg = m[2]
  const tab = SURVEY_TABS.find((t) => TAB_SEGMENT[t] === seg) ?? null
  return { surveyId: m[1]!, tab }
}
