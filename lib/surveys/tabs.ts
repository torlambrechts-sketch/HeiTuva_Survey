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
 * ── `malgruppe` IS HALF A TAB, ON PURPOSE ─────────────────────────────────
 *
 * «Hvem får den, og hvem faller fra» is two screens sharing a name. The first
 * is a property of the survey and ships. The second is Feltarbeid under another
 * name and is refused for the same reason — **a surface organised around who
 * did not answer is a list of names and an omission, whatever it is called.**
 * The refusal is ON the screen rather than silent, so it reads as a decision
 * and not as a tab somebody did not finish.
 */
export const SURVEY_TABS = [
  'sporsmal',
  'utsending',
  'resultat',
  'malgruppe',
  'kommentarer',
  'tiltak',
  'personvern',
  'historikk',
] as const
export type SurveyTab = (typeof SURVEY_TABS)[number]

/** The path segment each tab owns. The segment is the SOURCE OF TRUTH for which
 *  tab is current — there is no parameter to disagree with it. */
export const TAB_SEGMENT: Record<SurveyTab, string> = {
  // F5-2 — was 'bygg'. v6:1377 puts «Åpne byggeren» BESIDE the question table,
  // which is the bundle saying these are two screens; the pill now points at
  // the read view and the builder is one click further on. See `TAB_ALIAS`.
  sporsmal: 'sporsmal',
  utsending: 'send',
  resultat: 'resultater',
  malgruppe: 'malgruppe',
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
  malgruppe: 'subnavSurveyAudience',
  kommentarer: 'subnavSurveyComments',
  tiltak: 'subnavSurveyTasks',
  personvern: 'subnavSurveyPrivacy',
  historikk: 'subnavSurveyHistory',
}

export function surveyTabHref(surveyId: string, tab: SurveyTab): string {
  return `/undersokelser/${surveyId}/${TAB_SEGMENT[tab]}`
}

/**
 * F5-2 — SEGMENTS THAT ARE NOT A TAB'S OWN, BUT BELONG TO IT.
 *
 * `/bygg` is the editor behind «Spørsmål». Without this the rail would mark
 * NOTHING current while somebody is editing the questions — the same wrong
 * answer as `/live`, and wrong for the opposite reason: `/live` genuinely has
 * no pill, and the builder genuinely has one.
 *
 * It is a separate map rather than a second entry in `TAB_SEGMENT` because
 * that record is the source of truth for where a pill POINTS, and two segments
 * claiming one tab there would make `surveyTabHref` ambiguous. This one only
 * answers «which pill is lit».
 */
export const TAB_ALIAS: Record<string, SurveyTab> = { bygg: 'sporsmal' }

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
  const tab = SURVEY_TABS.find((t) => TAB_SEGMENT[t] === seg) ?? (seg ? (TAB_ALIAS[seg] ?? null) : null)
  return { surveyId: m[1]!, tab }
}
