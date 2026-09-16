import { SURVEY_TABS, surveyTabHref, type SurveyTab } from '@/lib/surveys/tabs'

/**
 * G4 — Tuva, the global in-app helper (`tv*`, v6:5858-5930 and v6:6821-6884).
 *
 * ── WHY THIS IS BACK, WHEN Q190 WAS RIGHT TO REMOVE IT ─────────────────────
 *
 * F1 removed this module, and the removal was correct: **it had no panel to
 * live in and no working off switch.** Both reasons have since expired, and the
 * difference is the whole justification —
 *
 *  · **The chrome exists.** F4 shipped `svTuva` with both placements and the
 *    switch, so the bubble/panel vocabulary is built and tested rather than
 *    imagined.
 *  · **The switch works.** G2 gave `options.tuva` a real column, a default, a
 *    backfill and a writer (`setOption`), so `tvShow`'s gate is a setting
 *    rather than the decoration Q183 caught it being.
 *  · **There is no defect phase to build it inside.** G3 closed the last of
 *    the five fidelity gaps, so this is a feature phase and not a repair.
 *
 * Reversing a decision is only honest when the reasons for it are gone. These
 * three are, one each, and none of them is «we changed our mind».
 *
 * ── THE RULE THIS FILE IS BUILT AROUND, UNCHANGED FROM V6-5 ────────────────
 *
 * **An answer points at a destination that exists, or it is not built.** Tor:
 * «a helper promising a screen we refused is worse than a helper with one fewer
 * answer.» Three of the bundle's answers could not ship then and still cannot:
 *
 *  1. `sdTab:"feltarbeid"` — «Hvem mangler, og når bør du purre». Feltarbeid is
 *     DECIDED-NOT-BUILT. The answer is KEPT, repointed at the reminder on Send,
 *     and REWORDED: it may not promise the half that does not exist.
 *  2. `sdTab:"malgruppe"` — «Hvem får den, og hvem faller fra». Målgruppe ships
 *     as half a tab for the same reason, so the copy loses its second clause.
 *  3. `build.short` — «Ingen blokkeringer — du kan sende». That is Q178's
 *     blocking language, and the schema makes it unrepresentable: nothing in
 *     Metodikk stops a send.
 *
 * ── WHAT MAKES THE RULE STRUCTURAL RATHER THAN REMEMBERED ──────────────────
 *
 * A survey-scoped answer carries a `SurveyTab`, not a string. `SURVEY_TABS` is
 * already asserted against the filesystem by
 * `tests/unit/survey-tabs.test.ts` («THE PATHS ARE KEPT — every tab is a real
 * route segment»), so an answer cannot name a survey sub-route that does not
 * exist: it is a COMPILE ERROR, and the route check that backs it is the one
 * that already existed rather than a second copy of it.
 *
 * Only the top-level hrefs are plain strings — there is no registry of
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
  | 'bibliotek'
  | 'administrasjon'
  | 'bygg'
  | 'send'
  | 'profil'
  | 'oppgaver'

/**
 * The answers. Copy lives in `messages/*.json` under `tuva`, keyed by the stem
 * — a registry of Norwegian strings rendered straight to screen is Q129's
 * shape, and `verify:i18n` can only name what collides with a message it
 * already holds, so it would not catch this one.
 */
export const TUVA_ANSWERS: Record<TuvaKey, readonly TuvaAnswer[]> = {
  bibliotek: [
    { stem: 'libValidated', href: '/bibliotek?fane=maler' },
    { stem: 'libBank', href: '/bibliotek?fane=bank' },
  ],
  administrasjon: [
    { stem: 'admIntegrations', href: '/administrasjon/integrasjoner' },
    { stem: 'admPrivacy', href: '/administrasjon/personvern' },
    { stem: 'admUsers', href: '/administrasjon/brukere' },
  ],
  // `buildTab:"lint"` resolves: V6-3 put Metodikk in the Builder. The second
  // answer leaves the survey, so it is an href rather than a tab.
  bygg: [
    { stem: 'bldQuestions', tab: 'sporsmal' },
    { stem: 'bldLibrary', href: '/bibliotek?fane=maler' },
  ],
  // Repair 1 and repair 2 both land here. «Sjekk utvalget» keeps only the half
  // Målgruppe ships; «når bør du purre» is the reminder on Send, which is the
  // `utsending` tab, so the refused Feltarbeid answer survives repointed.
  send: [
    { stem: 'sndAudience', tab: 'malgruppe' },
    { stem: 'sndPrivacy', tab: 'personvern' },
    { stem: 'sndReminder', tab: 'utsending' },
  ],
  profil: [{ stem: 'prfNotify', href: '/profil' }],
  oppgaver: [{ stem: 'tskOverdue', href: '/oppgaver' }],
}

/**
 * Which entry a pathname gets, or null. Longest prefix wins.
 *
 * ── THE SCREENS THAT DELIBERATELY GET NO ANSWER ───────────────────────────
 *
 * The routes `/dashboard`, `/rapporter`, `/oversikt` and `/hjelp` return null,
 * and that is **V6-5's decision standing**. A helper that always has an opinion is one nobody
 * believes; the bundle's own answers for those screens restate what the screen
 * already says in larger type.
 *
 * `/undersokelser` returns null for a **different reason, and the drawing
 * decides it twice.** `tvShow` excludes `["surveys","respond","splash","login"]` by name
 * (v6:8965) AND `tuvaFor`'s map has no `surveys` entry at all (v6:6831-6882), so
 * the global helper does not draw there under either test. What stands in its
 * place is `svTuva`, F4's analyst, which has a dock/float state of its own.
 * Building both would put two bubbles in one corner.
 */
export const TUVA_SUPPRESSED: readonly string[] = ['/undersokelser']

export function tuvaKeyFor(pathname: string): TuvaKey | null {
  if (/^\/undersokelser\/[0-9a-f-]{36}\/bygg/i.test(pathname)) return 'bygg'
  if (/^\/undersokelser\/[0-9a-f-]{36}\/send/i.test(pathname)) return 'send'
  /* svTuva's ground — every other /undersokelser path, the list included.
     MEASURED, THIS LINE CHANGES NO BEHAVIOUR TODAY: with it deleted the
     function still returns null, because no prefix below matches
     `/undersokelser` either. It was written as a behavioural guard and it is
     really a DECLARATION — «this screen is silent on purpose, not by
     omission» — and the difference matters, because the day somebody adds a
     `/undersokelser` prefix rule below, fall-through stops being null and
     nothing would have noticed.
     So the list is exported and the test asserts the LIST rather than the
     behaviour it cannot currently affect. Recorded in the open rather than
     quietly dropped: a guard that cannot fail is the shape this project keeps
     finding, and the honest fix is to guard the thing that can. */
  if (TUVA_SUPPRESSED.some((p) => pathname.startsWith(p))) return null
  if (pathname.startsWith('/administrasjon')) return 'administrasjon'
  if (pathname.startsWith('/bibliotek')) return 'bibliotek'
  if (pathname.startsWith('/oppgaver')) return 'oppgaver'
  if (pathname.startsWith('/profil')) return 'profil'
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
