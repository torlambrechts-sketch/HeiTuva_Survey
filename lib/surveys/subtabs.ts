import { SURVEY_TABS, type SurveyTab } from './tabs'

/**
 * F5 — THE SECOND NAVIGATION LEVEL, as one registry read by the rail and by
 * every page that has one.
 *
 * v6 draws seven sub-rails holding 27 sub-tabs (`SUBS`, v6:7139-7145). The app
 * had none: `lib/surveys/tabs.ts` is one level.
 *
 * ── A PARAMETER, NOT A PATH, AND THE REASON IS V6-2's OWN ─────────────────
 *
 * V6-2 ruled «keep the paths» about Bygg / Send / Resultater, and the ruling
 * says why: «A survey has three phases with DISTINCT STATE, and a URL saying
 * which one you are in is a property.» Three activities, three tables, three
 * sets of write permissions.
 *
 * **A sub-tab is not a phase.** `resultat/fordeling` and `resultat/frisvar`
 * are two renderings of ONE `aggregate_results` call; `kommentarer/venter` is
 * `kommentarer/alle` with a predicate. Nothing about the data, the authority
 * or the activity changes across one — only the presentation does.
 *
 * So this screen uses the level the app already has for exactly that, and F4
 * used all three of them in one page:
 *
 *   a different activity              -> a PATH SEGMENT   /bygg, /send
 *   a different view of that activity -> a QUERY PARAMETER ?filter=, ?omfang=
 *   a per-person preference           -> a COOKIE         heituva.svview
 *
 * `?vis=` is the middle row. Tor confirmed it (2026-09-15): the ruling was
 * about three phases with distinct state, and a sub-tab is not one.
 *
 * ── A SUB-TAB IS IN `SUBTABS` ONLY WHEN ITS CONTENT RENDERS ───────────────
 *
 * The same rule `tabs.ts` states for tabs, one level down, and for the same
 * reason: a rail that offers a view nobody built is a promise the screen
 * cannot keep. A refused sub-tab is therefore ABSENT from `SUBTABS` — it needs
 * no route to 404 on, which is one of the reasons the parameter won — and its
 * reason lives in `REFUSED` below, so the refusal is a row rather than a
 * paragraph somebody has to remember to write.
 */
export const SUBTABS: Partial<Record<SurveyTab, readonly string[]>> = {
  /**
   * v6:7143. `qFiltered` (v6:7252) — but as a PROPERTY, not the bundle's label
   * regex. v6 matches `/Skala|Likert|Smilefjes|NPS/` against the rendered
   * label, which is an enumeration of the four strings its fixture produced;
   * the page reads `specOf(type).group` instead, so a sixth scale type needs
   * no edit and a renamed label cannot drop a type out of the filter.
   */
  sporsmal: ['alle', 'skala', 'fritekst'],
  /** v6:7144. `commentsFiltered` (v6:7266) — one list, three predicates. */
  kommentarer: ['alle', 'venter', 'besvart'],
  /** v6:7145. `tasksFiltered` (v6:7268) — «Åpne» is `status !== 'lukket'` and
   *  «Med hjemmel» is `law_ref is not null`, which is the bundle's `!!t.law`. */
  tiltak: ['apne', 'alle', 'hjemmel'],
  /**
   * `malgruppe` HAS NO RAIL, AND THAT IS THE MEASUREMENT RATHER THAN AN
   * OMISSION. Its three sub-tabs are «Grupper», «Segmenter» and «Levering»:
   * the first IS this page, and the other two are refused below for two
   * different reasons. A rail of one pill is not a rail, so there is none.
   */
}

/**
 * WHAT THE DRAWING OFFERS AND THIS PRODUCT WILL NOT BUILD, with the reason
 * keyed so the screen can say it.
 *
 * These are not unbuilt work and must never be logged as a gap. Each is a
 * panel whose numbers do not exist — and in two cases the drawing supplies
 * them anyway, which is precisely the shape CLAUDE.md's never-fabricate rule
 * exists for: a fabricated figure is indistinguishable from a real one in
 * review and survives into screenshots as though it were true.
 *
 * `value` is `<tab>/<sub>` so a reader can find it in the bundle; the message
 * key holds the sentence the screen renders.
 */
export const REFUSED: Record<string, string> = {
  /**
   * v6:7260-7265. Six rows, FOUR of them invented:
   *   «Åpnet»     = Math.round(inv * 0.82)  — no open tracking exists at all
   *   «Startet»   = Math.round(res * 1.15)  — submit is one transaction; there
   *                                           is no partial response to count
   *   «Bounce»    = the string "2"          — `bounced_at` has NO WRITER (D133)
   *   «Reservert» = the string "1"          — this one we do have (suppressions)
   * Sendt and Fullført are real. Two real rows do not make a funnel.
   */
  'malgruppe/levering': 'refuseLevering',

  /**
   * v6:7135-7137, and **the audit misread what this is.**
   * `docs/fidelity/01-per-screen.md § D.6` calls it «leveringsstatistikk».
   * `sd.delivery2` is six hard-coded rows of DOMAIN AUTHENTICATION — SPF ·
   * DKIM · DMARC · Innboksplassering · Avvisninger · Klager — plus a paragraph
   * about `p=quarantine`.
   *
   * The conclusion is the same and the reason is different, which matters:
   * three of those rows are facts about OUR SENDING DOMAIN. They do not vary
   * per survey, per round or per organisation, so this would not belong on a
   * survey's send tab even if every number were measured. If domain
   * authentication ever becomes a surface it is an Administrasjon one.
   */
  'utsending/leveranse': 'refuseLeveranse',
  /**
   * v6:7256 — the drawing filters ONE array by `g.kind === "Segment"`, because
   * its fixture makes a segment A KIND OF GROUP. **Q92 decided the opposite,
   * and it decided it on a security argument.**
   *
   * «Segments are RULES, not membership … they select the population being
   * looked at; they NEVER become rows in a heatmap or columns in a report
   * beside groups», because `org_members.group_id` is scalar and that is *why*
   * k=5 per cell means anything: each respondent contributes to exactly one
   * breakdown. Two overlapping segments with five answers each and an
   * intersection of two disclose the two by subtraction — k does not compose.
   *
   * Measured 2026-09-15: **no column in `public` references a segment at all**
   * (`select … from information_schema.columns where column_name like
   * '%segment%'` returns nothing outside the `segments` table itself), and
   * `survey_invitations` records `group_id` and nothing else. So a survey HAS
   * no segments to list, and giving it some would mean writing the segment onto
   * the invitation — which is membership, which is the thing Q92 refused.
   *
   * This is the only refusal in this file that is about the MODEL rather than
   * about missing data, and it is the one that would have been easiest to build
   * by accident.
   */
  'malgruppe/segmenter': 'refuseSegmenter',
  /**
   * ── `resultat` LOSES ITS WHOLE RAIL TOO, AND FOR FOUR DIFFERENT REASONS ──
   *
   * The audit called this «den dyreste klassen å rette … fordi hver underfane
   * er en egen datavei». Measured, not one of the six needs a new data path —
   * and four of them should not be a sub-tab at all.
   *
   * **Matrise duplicates a screen that already exists.** v6 draws group × THEME
   * and the theme axis does not exist (see `qNoTheme`); the axis we have is
   * group × QUESTION, which is `get_heatmap`. And `/dashboard` already passes a
   * survey array straight into it — `?u=<id>` — so the survey-scoped matrix is
   * ONE PARAMETER away today. Driven 2026-09-15: `/dashboard?u=<id>` reports
   * «1 undersøkelse · 18 svar» and two heatmap cells against the ten-survey
   * view's twenty-eight. A second entry point to one picture is the thing
   * «a shell rail may absorb an in-page one only when its list is COMPLETE»
   * exists to prevent, one floor down. The screen LINKS there instead.
   */
  'resultat/matrise': 'refuseMatrise',

  /**
   * **Sammenligning is the one genuinely missing view**, and it is deferred
   * rather than refused. `get_trends(p_survey, p_group)` exists, but the drawn
   * panel is a round × question matrix with a change column and a total row
   * (v6:1595-1649), which is a new rendering rather than a re-cut. It is the
   * only one of resultat's six that would ADD something.
   */
  'resultat/sammenlign': 'deferSammenlign',

  /**
   * **Fordeling and Frisvar are not beside «Per spørsmål» — they are INSIDE
   * it.** `ResultsScreen.tsx:421` opens one `<section>` per question and that
   * card holds the question, its `questionBars` (the distribution) and its
   * `QuoteList` (the free text) together. Splitting them into three sub-tabs
   * would take a question apart from its own answers, on a screen the fidelity
   * audit records as having ZERO findings.
   *
   * So this is not «we did not build it». It is «we built it joined up», and
   * the note says which — because a sub-tab that is simply absent reads as one
   * somebody did not finish.
   */
  'resultat/fordeling': 'refuseFordeling',
  'resultat/frisvar': 'refuseFrisvar',

  /**
   * v6:1851-1872 — four waves, day 0 -> +3 -> +7 -> +12, each to those who have
   * not answered. **DEFERRED, NOT REFUSED**, and it is the only one of the
   * fifteen panels whose refusal would be about SCOPE rather than about truth.
   *
   * `schedules.reminder_after_days` is a single integer and
   * `survey_invitations.reminded_at` is a single timestamp, so a wave model is
   * a schema change, a worker change and a scheduling control — a product
   * decision about how hard to chase non-responders, which is adjacent to the
   * reasoning that refused Feltarbeid.
   */
  'utsending/bolger': 'deferBolger',
}

/** Every sub-tab this product will not offer, as bare `<tab>/<sub>` keys. */
export const REFUSED_KEYS = Object.keys(REFUSED)

/** The `surveys.*` message key for a refusal's sentence. */
export function refusalKey(tab: SurveyTab, sub: string): string | null {
  return REFUSED[`${tab}/${sub}`] ?? null
}

/** The sub-tabs a tab offers, or an empty list. Never undefined, so a caller
 *  cannot forget the tab that has none. */
export function subTabsFor(tab: SurveyTab): readonly string[] {
  return SUBTABS[tab] ?? []
}

/**
 * `?vis=` -> a sub-tab, or the tab's FIRST, which is the bundle's own default
 * (`cur = (st.sdSub || {})[tab] || list[0][0]`, v6:7141).
 *
 * An unknown value falls back rather than rendering an empty panel — the same
 * treatment `resolveLibraryTab` gives `?fane=`, and for the same reason: a
 * hand-edited URL is a typo, not a request for a blank screen.
 *
 * Returns null only when the tab has no rail at all.
 */
export function resolveSubTab(tab: SurveyTab, raw: string | null | undefined): string | null {
  const list = subTabsFor(tab)
  if (list.length === 0) return null
  return list.find((v) => v === raw) ?? list[0]!
}

/**
 * Where a sub-tab lives. The FIRST sub-tab carries no parameter, so the tab's
 * own href and its default sub-tab are the same URL — otherwise a rail pill
 * and a subnav pill point at two spellings of one screen and only one of them
 * looks selected. Same reasoning as `libraryTabHref`'s default omission.
 */
export function subTabHref(surveyId: string, tab: SurveyTab, sub: string, segment: string): string {
  const list = subTabsFor(tab)
  const base = `/undersokelser/${surveyId}/${segment}`
  return list[0] === sub ? base : `${base}?vis=${sub}`
}

/** The `surveys.*` message key for a sub-tab's label. Keyed by `<tab>/<sub>`
 *  so two tabs may both have an «alle» without sharing a label. */
export function subLabelKey(tab: SurveyTab, sub: string): string {
  return `sub_${tab}_${sub}`
}

/** Every tab, for tests that must state a property over the whole set rather
 *  than over the tabs that happen to have a rail today. */
export const ALL_SURVEY_TABS = SURVEY_TABS
