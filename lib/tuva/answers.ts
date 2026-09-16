import { SURVEY_TABS, surveyTabHref, type SurveyTab } from '@/lib/surveys/tabs'

/**
 * G5 — Tuva, the in-app helper, on EVERY screen (`tv*`, v6:5858-5930 and
 * v6:6821-6884).
 *
 * ── WHAT WAS OVERRULED, BY WHOM, AND WHY IT IS NOT EDITED AWAY ─────────────
 *
 * Two earlier decisions said the opposite of this file, and both are RECORDED
 * as overruled rather than rewritten to look as though they always said this:
 *
 *  · **V6-5's four-screen exclusion** — `/oversikt`, `/dashboard`, `/rapporter`
 *    and `/hjelp` were given no answer, on the reasoning that «a helper that
 *    always has an opinion is one nobody believes». **Overruled by Tor,
 *    2026-09-16**: the helper is the same and present on every page.
 *  · **G4's `TUVA_SUPPRESSED`** — `/undersokelser` returned null so the global
 *    bubble would not land in the same corner as `svTuva`, F4's docked
 *    analyst. **Overruled by the same instruction**: the two coexisting is the
 *    intent, not a collision to avoid. Where they sit is measured rather than
 *    assumed — see `components/TuvaHelper.tsx`.
 *
 * The drawing does NOT draw both: `tvShow` excludes `["surveys","respond",
 * "splash","login"]` by name (v6:8965) and `tuvaFor`'s map has no `surveys`
 * key (v6:6831-6882), so on that screen v6 draws `svTuva` alone — in ONE of two
 * placements, the docked column (`svTuvaSide`, v6:2439) or a bubble
 * (`svTuvaFloat`, v6:2414), never both at once. So this is a deliberate
 * departure from the bundle on one screen, logged as such (D227), not a
 * fidelity reading.
 *
 * ── THE RULE THIS FILE IS BUILT AROUND, UNCHANGED SINCE V6-5 ───────────────
 *
 * **An answer points at a destination that exists, or it is not built.** Tor:
 * «a helper promising a screen we refused is worse than a helper with one fewer
 * answer.» The bundle's answers that cannot ship as drawn are KEPT, repointed
 * and REWORDED — never silently dropped and never left pointing at a refusal:
 *
 *  1. `sdTab:"feltarbeid"` — «Hvem mangler, og når bør du purre». Feltarbeid is
 *     DECIDED-NOT-BUILT. Repointed at the reminder on Send (`utsending`), and
 *     the copy loses the half that does not exist.
 *  2. `sdTab:"malgruppe"` — «Hvem får den, og hvem faller fra». Målgruppe ships
 *     as half a tab for the same reason, so the copy loses its second clause.
 *  3. `build.short` — «Ingen blokkeringer — du kan sende». Q178's blocking
 *     language, and the schema makes it unrepresentable: nothing in Metodikk
 *     stops a send.
 *  4. `reports.tips[2]` — «Del riktig / Ledere ser aldri under terskelen»
 *     opens the editor's `del` side panel, which needs a report already open.
 *     Repointed at the organisation's own threshold setting, which is where
 *     that promise is actually made and kept.
 *
 * ── WHAT MAKES THE ROUTE RULE STRUCTURAL RATHER THAN REMEMBERED ────────────
 *
 * A survey-scoped answer carries a `SurveyTab`, not a string. `SURVEY_TABS` is
 * asserted against the filesystem by `tests/unit/survey-tabs.test.ts`, so an
 * answer cannot name a survey sub-route that does not exist: it is a COMPILE
 * error, backed by the route check that already existed rather than a second
 * copy of it. Only top-level hrefs are plain strings — there is no registry of
 * top-level routes to type against, measured — and those are swept against
 * `app/(app)` in this phase's own test.
 */

/** A chip in the panel: a message-key stem, and where it goes. */
export type TuvaAnswer =
  /** Absolute, inside this app. Swept against the filesystem by the test. */
  | { stem: string; href: string }
  /** Resolved against the survey in scope; null when there is none. */
  | { stem: string; tab: SurveyTab }

export type TuvaKey =
  | 'oversikt'
  | 'dashboard'
  | 'rapporter'
  | 'bibliotek'
  | 'oppgaver'
  | 'administrasjon'
  | 'svdetail'
  | 'bygg'
  | 'send'
  | 'profil'
  | 'generell'

/**
 * The general answer, for a screen the drawing gives no entry for.
 *
 * Tor: «A screen with nothing useful to say gets a general answer, not
 * silence.» It is a real entry with real destinations, not an empty panel — the
 * three it points at are the three every role can reach.
 */
export const TUVA_FALLBACK: TuvaKey = 'generell'

/**
 * The answers. Copy lives in `messages/*.json` under `tuva`, keyed by the stem
 * — a registry of Norwegian strings rendered straight to screen is Q129's
 * shape, and `verify:i18n` can only name what collides with a message it
 * already holds, so it would not catch this one.
 */
export const TUVA_ANSWERS: Record<TuvaKey, readonly TuvaAnswer[]> = {
  // v6 `dash` (6832): over frist · venter svar · neste runde. The first two are
  // the Arbeidsliste's own two types; the third is the survey list.
  oversikt: [
    { stem: 'ovrLate', href: '/oppgaver?type=oppgaver' },
    { stem: 'ovrWaiting', href: '/oppgaver?type=tilbakemeldinger' },
    { stem: 'ovrNext', href: '/undersokelser' },
  ],
  // v6 `dashboard` (6840): bygg rapport · lovpålagt · tilpass.
  dashboard: [
    { stem: 'dshBuild', href: '/rapporter?fane=standard' },
    { stem: 'dshStatutory', href: '/rapporter?fane=lov' },
    { stem: 'dshCustomize', href: '/dashboard?tilpass=data' },
  ],
  // v6 `reports` (6845): start fra mal · mine rapporter · del riktig. Repair 4
  // moves the third to where the threshold promise is actually kept.
  rapporter: [
    { stem: 'rptTemplate', href: '/rapporter?fane=standard' },
    { stem: 'rptMine', href: '/rapporter?fane=mine' },
    { stem: 'rptThreshold', href: '/administrasjon/personvern' },
  ],
  // v6 `library` (6850): validert sett · firmaets maler · spørsmålsbank.
  bibliotek: [
    { stem: 'libValidated', href: '/bibliotek?fane=maler' },
    { stem: 'libOwn', href: '/bibliotek?fane=maler&visning=egne' },
    { stem: 'libBank', href: '/bibliotek?fane=bank' },
  ],
  // v6 `tasks` (6837): over frist · uten eier · lovpålagt. All three are FILTERS
  // inside one screen rather than routes, and only `type` is in the URL — so
  // the one answer that is a destination is the screen, and the copy says what
  // the filters are rather than promising three links that go to one place.
  oppgaver: [{ stem: 'tskOverdue', href: '/oppgaver?type=oppgaver' }],
  // v6 `admin` (6855): integrasjoner · personvern · brukere.
  administrasjon: [
    { stem: 'admIntegrations', href: '/administrasjon/integrasjoner' },
    { stem: 'admPrivacy', href: '/administrasjon/personvern' },
    { stem: 'admUsers', href: '/administrasjon/brukere' },
  ],
  // v6 `svdetail` (6859): metodikk · feltarbeid · lag tiltak. Metodikk lives in
  // the Builder since V6-3, so it is the `sporsmal` tab; feltarbeid is repair 1.
  svdetail: [
    { stem: 'sdMethod', tab: 'sporsmal' },
    { stem: 'sdReminder', tab: 'utsending' },
    { stem: 'sdTasks', href: '/oppgaver?type=oppgaver' },
  ],
  // v6 `build` (6864): metodikk · hent fra bibliotek · forhåndsvis.
  bygg: [
    { stem: 'bldQuestions', tab: 'sporsmal' },
    { stem: 'bldLibrary', href: '/bibliotek?fane=maler' },
  ],
  // v6 `send` (6869): sjekk utvalget (repair 2) · personvern · test først.
  send: [
    { stem: 'sndAudience', tab: 'malgruppe' },
    { stem: 'sndPrivacy', tab: 'personvern' },
    { stem: 'sndReminder', tab: 'utsending' },
  ],
  // v6 `profile` (6874): varsler · språk · økter — all three are one screen.
  profil: [{ stem: 'prfNotify', href: '/profil' }],
  // No v6 entry exists for these screens. The answer is general and true
  // everywhere rather than a per-screen claim invented to fill the panel.
  generell: [
    { stem: 'genOverview', href: '/oversikt' },
    { stem: 'genTasks', href: '/oppgaver?type=alle' },
    { stem: 'genHelp', href: '/hjelp' },
  ],
}

/**
 * Which entry a pathname gets, or null when NOTHING covers it.
 *
 * ── WHY THIS STILL RETURNS null WHEN NO SCREEN IS EVER SILENT ──────────────
 *
 * The helper renders on every page: `TuvaHelper` resolves `tuvaKeyFor(path) ??
 * TUVA_FALLBACK`, so a screen this function does not know about still gets the
 * general answer and a user never meets an empty corner.
 *
 * This function is deliberately NOT given that fallback, and the difference is
 * the whole guard. With `return 'generell'` at the bottom, every conceivable
 * path resolves and the test asserting «every route resolves» could never
 * fail — which is precisely the shape G4 was caught committing one phase ago,
 * a guard that passes whatever the product does. Null here means «no screen
 * declared this», the test reads that as a failure, and a new screen arriving
 * without an answer set is a red build rather than a silent demotion to the
 * general text.
 *
 * So: the RUNTIME never goes silent, and the TEST can still fail. Two
 * different questions, answered in two different places.
 */
export function tuvaKeyFor(pathname: string): TuvaKey | null {
  // Survey sub-routes first — longest match wins, and `svdetail` is the
  // fall-through for every tab v6 does not single out.
  const sid = /^\/undersokelser\/[0-9a-f-]{36}(\/|$)/i
  if (sid.test(pathname)) {
    if (/\/bygg(\/|$)/i.test(pathname)) return 'bygg'
    if (/\/send(\/|$)/i.test(pathname)) return 'send'
    return 'svdetail'
  }
  if (pathname.startsWith('/administrasjon')) return 'administrasjon'
  if (pathname.startsWith('/bibliotek')) return 'bibliotek'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/oppgaver')) return 'oppgaver'
  if (pathname.startsWith('/oversikt')) return 'oversikt'
  if (pathname.startsWith('/profil')) return 'profil'
  if (pathname.startsWith('/rapporter')) return 'rapporter'
  // The list and the wizard. v6 has no `surveys` entry, so both take the
  // general answer — declared here rather than reached by fall-through, so the
  // test above can tell «we decided this» from «nobody has looked».
  if (pathname.startsWith('/undersokelser')) return 'generell'
  if (pathname.startsWith('/hjelp')) return 'generell'
  return null
}

/** The survey id in a pathname, or null — the only thing a `tab` answer needs. */
export function surveyIdIn(pathname: string): string | null {
  return /^\/undersokelser\/([0-9a-f-]{36})/i.exec(pathname)?.[1] ?? null
}

/**
 * An answer's destination, or null when it needs a survey and there is none.
 * The single place a href is formed, so there is nowhere else for one to be
 * assembled by hand.
 */
export function tuvaHref(answer: TuvaAnswer, surveyId: string | null): string | null {
  if ('href' in answer) return answer.href
  return surveyId ? surveyTabHref(surveyId, answer.tab) : null
}

/** Every top-level href in the registry — what the test sweeps. */
export const TUVA_TOP_LEVEL_HREFS: readonly string[] = Object.values(TUVA_ANSWERS)
  .flat()
  .flatMap((a) => ('href' in a ? [a.href] : []))

/** Every tab the registry names, so the test can assert they are all real. */
export const TUVA_TABS: readonly SurveyTab[] = Object.values(TUVA_ANSWERS)
  .flat()
  .flatMap((a) => ('tab' in a ? [a.tab] : []))

/** Guards the registry against a tab that left `SURVEY_TABS`. */
export const TUVA_TABS_ARE_REGISTERED = TUVA_TABS.every((t) => SURVEY_TABS.includes(t))
