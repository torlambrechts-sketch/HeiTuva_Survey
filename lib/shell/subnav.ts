import { LIBRARY_TABS, TAB_NAV_KEY, libraryTabHref, resolveLibraryTab } from '@/lib/library/tabs'
import {
  SURVEY_TABS,
  TAB_NAV_KEY as SURVEY_TAB_NAV_KEY,
  resolveSurveyPath,
  surveyTabHref,
} from '@/lib/surveys/tabs'
import { FILTERS, FILTER_KEY } from '@/app/(app)/undersokelser/keys'

/**
 * V7-1 — THE SUBNAV, AS ONE REGISTRY WITH AN ENTRY PER SCREEN.
 *
 * ── WHAT THIS REPLACES, AND WHY IT IS A REGISTRY ──────────────────────────
 *
 * `AppSubnav` held five hard-coded `if (pathname === …)` branches, and every
 * label was resolved by `AppHeader` into a fifteen-field `labels` prop handed
 * down. **Adding a screen meant editing three places** — the branch, the prop's
 * type, and the object that fills it — and forgetting any one of them is a rail
 * that renders with a blank label or not at all.
 *
 * That is the audit's own diagnosis one floor down: *a shared surface has no
 * owner when phases are per-screen.* F3 fixed it for the breadcrumb by making
 * the breadcrumb a registry (`lib/shell/crumbs.ts`), and then treated the
 * subnav as one case. **This is F3's lesson applied to the surface F3 treated
 * as one case** — Tor's words in the V7 plan.
 *
 * So: one entry per screen, and an eighth screen is a row here. Nothing in
 * `AppSubnav` or `AppHeader` needs an edit for it.
 *
 * ── MESSAGE REFERENCES CARRY THEIR NAMESPACE ──────────────────────────────
 *
 * The rails draw labels from THREE namespaces — `nav` for most of them,
 * `reports` for the two Innsikt pills F3 moved with the control rather than
 * rewriting beside it, and `surveys` for the status filters. A registry that
 * named bare keys would be the G5 defect again: **a key without its namespace
 * is not a message**, and a key resolved in the wrong namespace renders as a
 * raw key on a shipped screen.
 *
 * ── AND A TYPE PER PILL, BECAUSE THE DRAWING HAS TWO KINDS AND `{label, href}`
 *    CANNOT EXPRESS ONE OF THEM ──────────────────────────────────────────────
 *
 * Measured in `docs/v7/00-review.md § 1c`: four of v7's rails end in a pill that
 * LEAVES the set rather than filtering it — «Undersøkelsen» on `send`
 * (`v7:8898`) and `build` (`v7:8907`), «Bygger» on `surveys` (`v7:8934`) and on
 * `svdetail` (`v7:8922-8928`) — and `dashboard|reports` has a fifth
 * (`v7:8912-8918`) that jumps into the report editor and DOES light.
 *
 * The old component was one `<Link>` whose entire state was
 * `currentHref === it.href`, applying the drawing's three filter properties.
 * There was no second kind, **and no jump was built**, so nothing was wrong
 * today and everything would have been wrong the first time one was added: an
 * exit's href is never the current href, so it would render at weight 500 and
 * opacity .7 — the OPPOSITE of what the drawing gives three of the four.
 *
 * `kind` decides BEHAVIOUR: a `filter` may be current, an `exit` may not, and
 * `railIsSound` below asserts it rather than leaving it to a convention.
 *
 * **THE EXITS' EMPHASIS IS LOGGED, NOT GUESSED (V7-2's).** v7 draws exits in two
 * emphases: three are bold at full opacity, and `svdetail`'s «Bygger» is
 * `weight:"500", textOpacity:".7"` — an exit wearing an inactive filter's
 * clothes, forced by an explicit `&& k !== "bygger"`. The property behind the
 * split looks like POSITION — the three bold ones are `.concat`-ed after the
 * set, the dormant one is a member of the array — but no exit ships yet, so
 * writing that down as a rule would be an enumeration of two read as a
 * property. One treatment ships here; V7-2 builds the rail the fourth pill
 * lives on and decides it there, with the pill in front of it.
 *
 * ── THE ONE JUMP THE APP REFUSED IN WRITING STAYS REFUSED, AND SAYS SO ─────
 *
 * `dashboard|reports`' fifth pill, «Bygger», is NOT drawn — see `insight`'s
 * entry below. It is written into the registry as a refusal rather than left as
 * a gap, because a rail that is four where the drawing has five reads as one
 * somebody did not finish.
 */

/** The namespaces the rails draw from. Adding a fourth is a compile error at
 *  every call site, which is the point. */
export type Namespace = 'nav' | 'reports' | 'surveys'

/** A message, with the namespace it lives in. */
export type MsgRef = { ns: Namespace; key: string }

const nav = (key: string): MsgRef => ({ ns: 'nav', key })

/**
 * `filter` narrows or moves WITHIN the set the rail names; `exit` leaves it.
 *
 * The distinction is not decoration: an exit can never be the current pill, so
 * a renderer that decides emphasis by `current === id` gives every exit the
 * inactive treatment. That is «a jump rendered as a filter is a pill that never
 * lights», and it is why this is a field rather than a comment.
 */
export type PillKind = 'filter' | 'exit'

export type SubnavPill = {
  /** Stable within a rail. `currentId` names one of these rather than comparing
   *  hrefs, because an href has two spellings for one screen — `/rapporter` and
   *  `/rapporter?fane=lov` are the same tab — and only an id cannot disagree
   *  with itself. */
  id: string
  label: MsgRef
  href: string
  kind: PillKind
  /**
   * V7-2 — HOW AN EXIT IS DRAWN, decided with the pill in front of us, which is
   * what Q231 deferred to this phase.
   *
   * v7 draws its four exits in two emphases, and the property behind the split
   * is POSITION: the three that are `.concat`-ed AFTER the set are
   * `weight:"700"` at full opacity («Undersøkelsen» on send `v7:8898` and build
   * `v7:8907`, «Bygger» on surveys `v7:8934`), and the one that is a MEMBER of
   * the set's own array is `weight:"500"` at `.7`, forced by an explicit
   * `&& k !== "bygger"` (`v7:8923`).
   *
   * Only the second kind ships — the survey rail's «Bygger» — so `emphasis` is
   * declared per pill rather than derived from position. Deriving it would read
   * elegant and would rest on a property measured over four instances of which
   * one exists here; declaring it puts the drawing's line number beside the
   * pill. Ignored on a `filter`, which takes its emphasis from being current.
   */
  emphasis?: 'bold' | 'dormant'
}

export type SubnavRail = {
  /** The 11px uppercase label at the head of the strip. */
  label: MsgRef
  pills: SubnavPill[]
  /** The pill that reads as current, or null when none does — `/live` and
   *  `/test` are real survey routes with no pill, and «no pill is current» and
   *  «the first pill is current» are different claims. */
  currentId: string | null
}

type Ctx = { pathname: string; params: URLSearchParams }

type Entry = {
  /** For tests and for the error a mismatched entry produces. */
  key: string
  /** Does this screen carry the rail? First match wins, so an entry that is a
   *  prefix of another goes last. */
  match: (pathname: string) => boolean
  build: (ctx: Ctx) => SubnavRail
}

/**
 * ONE ENTRY PER SCREEN. Order matters only where two `match`es could both be
 * true; each is written to be exclusive, and `tests/unit/subnav.test.ts`
 * asserts that no pathname matches two entries.
 */
export const SUBNAV: Entry[] = [
  {
    key: 'insight',
    match: (p) => p === '/dashboard' || p === '/rapporter',
    build: ({ pathname, params }) => {
      const pills: SubnavPill[] = [
        { id: 'dash', label: nav('subnavDashboard'), href: '/dashboard', kind: 'filter' },
        {
          id: 'mine',
          label: nav('subnavReports'),
          href: '/rapporter?fane=mine',
          kind: 'filter',
        },
        /* F3 — the Rapporter screen's OWN tab labels, moved with the control
           rather than rewritten beside it, which is why these two name the
           `reports` namespace and their neighbours name `nav`. */
        { id: 'lov', label: { ns: 'reports', key: 'tabLov' }, href: '/rapporter?fane=lov', kind: 'filter' },
        {
          id: 'standard',
          label: { ns: 'reports', key: 'tabStandard' },
          href: '/rapporter?fane=standard',
          kind: 'filter',
        },
        /* THE FIFTH PILL IS REFUSED, NOT MISSING — v7:8912-8918 draws «Bygger»
           here and it opens the editor on a FRESH draft. In this app the editor
           is `?rapport=<id>` of a report that exists, so the pill would be a
           deep link that does not resolve — V6-5's standing rule and Q178's
           tranche-wide constraint, `DECISIONS.md:869-872`. The affordance is
           already «＋ Ny rapport» in the «På tvers» card, so drawing it would
           also be two controls for one action.

           Written here rather than left as a silent four-of-five: a rail short
           of the drawing reads as one somebody did not finish. */
      ]
      /* `/rapporter` with no `fane` IS `fane=lov` — the page's own resolver
         says so, and a pill that resolves it differently is a default tab that
         reads as nothing selected. */
      if (pathname === '/rapporter') {
        const fane = params.get('fane')
        return {
          label: nav('subnavInsight'),
          pills,
          currentId: fane === 'standard' || fane === 'mine' ? fane : 'lov',
        }
      }
      return { label: nav('subnavInsight'), pills, currentId: 'dash' }
    },
  },

  {
    key: 'surveys',
    match: (p) => p === '/undersokelser',
    build: ({ params }) => {
      /* The search and the sort ride along, because losing a search by clicking
         a status filter is a regression the drawing has no opinion about. */
      const carry = (f: string) => {
        const next = new URLSearchParams()
        if (f !== 'alle') next.set('filter', f)
        const sok = params.get('sok')
        const sorter = params.get('sorter')
        if (sok) next.set('sok', sok)
        if (sorter) next.set('sorter', sorter)
        const qs = next.toString()
        return qs ? `/undersokelser?${qs}` : '/undersokelser'
      }
      const raw = params.get('filter')
      const current = FILTERS.find((f) => f === raw) ?? 'alle'
      return {
        label: nav('subnavSurveys'),
        /* Built FROM the registry, so a fifth status arrives with its label
           wired or not at all. */
        pills: FILTERS.map((f) => ({
          id: f,
          label: { ns: 'surveys' as const, key: FILTER_KEY[f] },
          href: carry(f),
          kind: 'filter' as const,
        })),
        /* v7:8934 appends a «Bygger» EXIT here. It is V7-2's, and it needs a
           destination this screen does not have: the bundle opens the builder
           on `st.activeId`, a survey the prototype happens to be holding, and
           a list has none. */
        currentId: current,
      }
    },
  },

  {
    key: 'tasks',
    match: (p) => p === '/oppgaver',
    build: ({ params }) => {
      const type = params.get('type')
      return {
        label: nav('subnavTasks'),
        pills: [
          { id: 'alle', label: nav('subnavAll'), href: '/oppgaver', kind: 'filter' },
          {
            id: 'oppgaver',
            label: nav('subnavOnlyTasks'),
            href: '/oppgaver?type=oppgaver',
            kind: 'filter',
          },
          {
            id: 'tilbakemeldinger',
            label: nav('subnavFeedback'),
            href: '/oppgaver?type=tilbakemeldinger',
            kind: 'filter',
          },
        ],
        /* The absent value is «alle» — the same resolution `WorklistPage` does,
           so the pill that looks selected is the one that is. */
        currentId: type === 'oppgaver' || type === 'tilbakemeldinger' ? type : 'alle',
      }
    },
  },

  {
    key: 'library',
    match: (p) => p === '/bibliotek',
    build: ({ params }) => ({
      /* Q172 — the bundle draws this rail IN-PAGE (v5:4082) and its subnav has
         no library branch at all. Tor moved it here, and the page keeps no
         second copy, which is the condition a shell rail must meet. */
      label: nav('subnavLibrary'),
      pills: LIBRARY_TABS.map((tab) => ({
        id: tab,
        label: nav(TAB_NAV_KEY[tab]),
        href: libraryTabHref(tab),
        kind: 'filter' as const,
      })),
      // The page's own resolver, so the default tab cannot be spelled two ways.
      currentId: resolveLibraryTab(params.get('fane')),
    }),
  },

  {
    /* Last, because its match is a PREFIX and the entries above are exact. */
    key: 'survey',
    match: (p) => resolveSurveyPath(p) !== null,
    build: ({ pathname }) => {
      const survey = resolveSurveyPath(pathname)!
      return {
        label: nav('subnavSurvey'),
        /* V6-2 — the re-parent. The paths stay (Tor: a survey has three phases
           with distinct state, and a URL saying which one you are in is a
           property), so the pills are real routes and the current one is
           decided by the PATH SEGMENT. There is no parameter that can disagree
           with it. */
        pills: [
          ...SURVEY_TABS.map((tab) => ({
            id: tab,
            label: nav(SURVEY_TAB_NAV_KEY[tab]),
            href: surveyTabHref(survey.surveyId, tab),
            kind: 'filter' as const,
          })),
          /* V7-2 — THE TWELFTH PILL, and it is an EXIT rather than a tab.
             That distinction is the whole reason `kind` exists, and it is what
             makes this compatible with F5-2 rather than a reversal of it.

             F5-2 took the builder OFF the rail as a TAB: `v6:1377` puts «Åpne
             byggeren» BESIDE the question table, which is the bundle saying
             these are two screens, so «Spørsmål» points at the read view and
             the builder is one click further on. v7 draws «Bygger» back into
             the rail — and draws it as something that can never be current
             (`v7:8923`'s `&& k !== "bygger"`). **The drawing is agreeing that
             the builder is not one of the tabs, and adding a way to leave to
             it.** A tab competes with «Spørsmål» for which screen you are on;
             an exit cannot.

             NOT DRAWN WHILE YOU ARE ALREADY THERE. `/bygg` is a survey route,
             so this rail renders on it — and an exit pointing at the page you
             are standing on is not an exit. v7 never meets this because `build`
             is a different screen with a different rail; we meet it because
             V6-2 kept the paths. */
          ...(survey.tab === 'sporsmal' && /\/bygg(\/|$)/i.test(pathname)
            ? []
            : [
                {
                  id: 'bygger',
                  label: nav('subnavSurveyBuilder'),
                  href: `/undersokelser/${survey.surveyId}/bygg`,
                  kind: 'exit' as const,
                  emphasis: 'dormant' as const,
                },
              ]),
        ],
        /* Null on `/live` and `/test`, which are survey routes with no pill. */
        currentId: survey.tab,
      }
    },
  },
]

/** The rail for a screen, or null where the drawing gives none. */
export function resolveSubnav(pathname: string, params: URLSearchParams): SubnavRail | null {
  const entry = SUBNAV.find((e) => e.match(pathname))
  return entry ? entry.build({ pathname, params }) : null
}

/**
 * The two properties a rail must have, as a function rather than as a comment,
 * so a test can state them over EVERY entry instead of over the ones somebody
 * remembered.
 *
 * Returns the reasons it is unsound, empty when it is.
 */
export function railFaults(rail: SubnavRail): string[] {
  const faults: string[] = []
  const ids = rail.pills.map((p) => p.id)
  if (new Set(ids).size !== ids.length) faults.push(`duplicate pill id in [${ids.join(', ')}]`)
  if (rail.currentId !== null) {
    const cur = rail.pills.find((p) => p.id === rail.currentId)
    if (!cur) faults.push(`currentId "${rail.currentId}" names no pill`)
    // The whole reason `kind` exists: an exit leaves the set, so it cannot be
    // the set's current member. A renderer that lit one would be claiming the
    // user is on a screen they are leaving.
    else if (cur.kind === 'exit') faults.push(`currentId "${rail.currentId}" is an exit`)
  }
  return faults
}
