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
/** `raw` is not a namespace — it is the absence of one. A dashboard's title is
 *  whatever the person called it, so it must NOT go through next-intl: a
 *  lookup would miss and render the title as a raw key. The renderer prints
 *  `key` verbatim for this one. */
export type Namespace = 'nav' | 'reports' | 'surveys' | 'raw'

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
 *
 * N3 — `more` IS A THIRD KIND BECAUSE v8 DRAWS IT AS A DIFFERENT CONTROL, not
 * because it behaves differently. v8:238-241 renders the «Flere oppsett» item
 * as a native `<select>` — `height:32px · padding:0 10px · border:1px solid
 * var(--line) · border-radius:9px · 13px/600` — where every other item is a
 * button. A `kind` that only changed emphasis could not express that, and a
 * renderer branching on `id === 'more'` would be the hand-written special case
 * this registry exists to remove.
 *
 * Like an exit it can never be current: v8's select is `value=""` on every
 * render, so nothing inside it ever reads as selected. `railFaults` asserts it.
 */
export type PillKind = 'filter' | 'exit' | 'more'

export type SubnavPill = {
  /** Stable within a rail. `currentId` names one of these rather than comparing
   *  hrefs, because an href has two spellings for one screen — `/rapporter` and
   *  `/rapporter?fane=lov` are the same tab — and only an id cannot disagree
   *  with itself. */
  id: string
  label: MsgRef
  href: string
  kind: PillKind
  /** `more` only: where the dropdown can go. A `more` pill with no options is
   *  a control that does nothing, so `railFaults` refuses it and the insight
   *  rail omits the pill entirely rather than drawing an empty select. */
  options?: { href: string; label: MsgRef }[]
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

/** N2 — the insight rail lists the viewer's own dashboards (v8's `mine`,
 *  v8:9340), which is a database read. The registry stays PURE: the list
 *  arrives as context from the server, so `resolveSubnav` is still a function
 *  of its arguments and `tests/unit/subnav.test.ts` can drive every rail
 *  without a database. */
export type SubnavDashboard = {
  id: string
  title: string
  /** Is this the board `/dashboard` renders when no `flate` is given?
   *
   *  A PROPERTY OF THE VIEWER CARRIED ON THE ROW, deliberately. The rail used
   *  to light `dashboards[0]` on a bare `/dashboard` — a guess, and one the
   *  page can contradict: it renders the layout row `(me, WORKING_TITLE)`,
   *  whose `dashboard_id` need not be the organisation's oldest board. A rail
   *  and a page disagreeing about what is selected is the defect F3's rule is
   *  about, so the answer is read where it is known (`readDashboards`) and
   *  carried, rather than inferred here from an ordering.
   *
   *  Optional because it can be absent for a real reason: a member who has
   *  never customised has no working row, so no board is current and no pill
   *  lights. That is true, and truer than lighting the first one. */
  current?: boolean
}
type Ctx = { pathname: string; params: URLSearchParams; dashboards: SubnavDashboard[] }

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
    /* N1/N2 — v8 gives this rail to `dash`, `dashboard` AND `reports`
       (v8:9334). `dash` is v8's «I dag» screen, which is our /oversikt, so the
       rail now covers three routes where it covered two. */
    match: (p) => p === '/dashboard' || p === '/rapporter' || p === '/oversikt',
    build: ({ pathname, params, dashboards }) => {
      /* ── v8:9334-9357, verbatim in shape ──────────────────────────────────
       *
       *   «I dag» · up to FOUR of the viewer's dashboards · «Flere oppsett» · «Arkiv»
       *
       * AND v8's SECOND RAIL FOR THESE SCREENS IS DEAD CODE, WHICH IS WHY IT IS
       * NOT BUILT. The ternary at v8:9334 tests
       * `["dash","dashboard","reports"].indexOf(st.screen) > -1` FIRST, so the
       * later branch `(st.screen === "dashboard" || st.screen === "reports")`
       * at v8:9376 — «Dashbord · Rapporter · Lovpålagt · Maler · Bygger» — can
       * never be reached. Both were listed as rows to build; only this one
       * renders in the drawing. Reported rather than built, per «finner du at
       * noe ikke står i v8 — bygg ikke».
       *
       * `.slice(0, 4)` is v8's own cap (v8:9347). A fifth dashboard reaches the
       * rail through «Flere oppsett», which is what that pill is for.
       *
       * ── N3 · «FLERE OPPSETT» IS A `<select>`, AND TWO OF ITS FOUR OPTION
       *    CLASSES ARE REFUSED IN WRITING ────────────────────────────────────
       *
       * v8:238-241 renders this one item as a native dropdown rather than a
       * button, and `subnavMore` (v8:9308-9324) fills it with FOUR classes:
       *
       *   1. the viewer's boards beyond the inline four   `mine:<key>`
       *   2. the standard presets not already inline      `std:<key>  · mal`
       *   3. the viewer's own saved presets               `own:<key> · eget`
       *   4. «＋ Nytt dashbord …»                          `new`
       *
       * ONLY CLASS 1 IS BUILT. Classes 2, 3 and 4 all call `newDashFrom` or
       * open the picker — they CREATE a dashboard (v8:9327-9331). A rail pill
       * that writes has no action behind it here and a `<Link>` cannot invoke
       * one; building the option and landing it somewhere that does not create
       * would be a control whose label asserts a write it does not perform
       * (D221's third face). Whether a shell rail may create a dashboard is a
       * product decision, raised rather than settled — the same question
       * `MetaBar.tsx` already has open about several named boards.
       *
       * And the pill is OMITTED when class 1 is empty rather than drawn with
       * nothing in it. v8 never meets that case because classes 2-4 always
       * supply an entry; with only class 1 built, ≤4 boards means an empty
       * dropdown, which is decoration. `railFaults` refuses one either way. */
      const inline = dashboards.slice(0, 4)
      const overflow = dashboards.slice(4)
      const pills: SubnavPill[] = [
        { id: 'dash', label: nav('subnavToday'), href: '/oversikt', kind: 'filter' },
        ...inline.map((d) => ({
          id: `dash:${d.id}`,
          // A dashboard's own name is DATA, not a message — it is whatever the
          // person called it, so it cannot come from next-intl.
          label: { ns: 'raw' as const, key: d.title },
          href: `/dashboard?flate=${d.id}`,
          kind: 'filter' as const,
        })),
        ...(overflow.length
          ? [
              {
                id: 'more',
                label: nav('subnavMoreLayouts'),
                /* The href is where the select lands with no selection made —
                   i.e. nowhere new. It is the current screen, so a viewer
                   without JavaScript is not stranded on a control that cannot
                   act. v8's own placeholder option is `value:""` and its
                   handler returns early on it. */
                href: '/dashboard',
                kind: 'more' as const,
                options: overflow.map((d) => ({
                  href: `/dashboard?flate=${d.id}`,
                  label: { ns: 'raw' as const, key: d.title },
                })),
              },
            ]
          : []),
        /* «Arkiv» → v8 sets `screen:"reports", repTab:"lov"` (v8:9357), so the
           href carries the tab rather than landing on a default the page
           resolves differently. */
        { id: 'arkiv', label: nav('subnavArchive'), href: '/rapporter?fane=lov', kind: 'filter' },
      ]

      const current = (() => {
        if (pathname === '/oversikt') return 'dash'
        if (pathname === '/rapporter') return 'arkiv'
        /* N3 — `?tilpass` NO LONGER LIGHTS «Flere oppsett», and that is v8's
           reading rather than a regression. The pill is a `<select>` there,
           `value=""` on every render, so nothing in it can read as selected;
           what opened the customize panel in v8 is the dropdown's «＋ Nytt
           dashbord …» option, which is one of the three classes refused above.
           The customize panel is a STATE of the board on screen, so the board
           stays lit under it — and the panel's own toggle
           (`dashboard/CustomizeToggle.tsx`) is how it opens, which is why
           dropping this branch orphans nothing. */
        const flate = params.get('flate')
        if (flate && dashboards.some((d) => d.id === flate)) return `dash:${flate}`
        /* /dashboard with no `flate` renders the viewer's own board, which the
           server flags. Null rather than a guess when nothing is flagged — see
           `SubnavDashboard.current`. */
        const mine = dashboards.find((d) => d.current)
        return mine ? `dash:${mine.id}` : null
      })()

      return { label: nav('subnavInsight'), pills, currentId: current }
    },
  },

  {
    key: 'surveys',
    /* N2 — v8:9395 gives this rail to `surveys`, `library` AND `packdetail`:
       «Alle» · Maler · Spørsmålsbank · Bruksområder, then a «Bygger» exit.
       That is the way into the library now that v8 has no Bibliotek nav item. */
    match: (p) => p === '/undersokelser' || p.startsWith('/bibliotek'),
    build: ({ pathname, params }) => {
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
      /* N2 — v8:9395's three LIBRARY pills, appended to the status filters.
         v8 draws «Alle» then Maler · Spørsmålsbank · Bruksområder, all on one
         rail, because the library is a sub-view of the surveys set rather than
         a top-level destination. Our /bibliotek carries the same three as its
         own tabs, so each pill is a deep link into the tab it names. */
      const libraryPills: SubnavPill[] = LIBRARY_TABS.map((tab) => ({
        id: `lib:${tab}`,
        label: nav(TAB_NAV_KEY[tab]),
        href: libraryTabHref(tab),
        kind: 'filter' as const,
      }))

      return {
        label: nav('subnavSurveys'),
        /* Built FROM the registry, so a fifth status arrives with its label
           wired or not at all. */
        pills: [
          ...FILTERS.map(
            (f): SubnavPill => ({
              id: f,
              label: { ns: 'surveys', key: FILTER_KEY[f] },
              href: carry(f),
              kind: 'filter',
            }),
          ),
          ...libraryPills,
        ],
        /* v7:8934 appends a «Bygger» EXIT here. It is V7-2's, and it needs a
           destination this screen does not have: the bundle opens the builder
           on `st.activeId`, a survey the prototype happens to be holding, and
           a list has none. */
        /* WHICH PILL LIGHTS DEPENDS ON WHICH SCREEN THIS IS, because one rail
           now serves two. On /undersokelser it is the status filter; on
           /bibliotek it is the tab, resolved by the page's OWN resolver so the
           pill that looks selected is the one that is. A rail serving two
           screens with one `currentId` expression is what made the separate
           `library` entry removable without losing anything. */
        currentId: pathname.startsWith('/bibliotek')
          ? `lib:${resolveLibraryTab(params.get('fane'))}`
          : current,
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

  /* N2 — THE `library` ENTRY IS GONE, AND THAT IS A MERGE RATHER THAN A
     REMOVAL. It gave /bibliotek its own rail labelled «Bibliotek» (Q172 — the
     v5 bundle drew it in-page at v5:4082 and Tor moved it to the shell). v8
     has no Bibliotek destination at all: its surveys rail carries the three
     library pills itself (v8:9395), so /bibliotek is a screen INSIDE the
     surveys set and shares that set's rail.

     Everything the old entry held survives in the `surveys` entry above — the
     same three pills off the same registry, the same `resolveLibraryTab` for
     which one lights. What it stops doing is claiming Bibliotek is a
     destination of its own, which is the structural half of N1's three-item
     nav. `tests/unit/subnav.test.ts` case 2 is what named this: two entries
     both matched /bibliotek, and a pathname matching two entries is the
     ambiguity that check exists for. */

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
export function resolveSubnav(
  pathname: string,
  params: URLSearchParams,
  dashboards: SubnavDashboard[] = [],
): SubnavRail | null {
  const entry = SUBNAV.find((e) => e.match(pathname))
  return entry ? entry.build({ pathname, params, dashboards }) : null
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
    else if (cur.kind === 'more') faults.push(`currentId "${rail.currentId}" is a more-pill`)
  }
  for (const p of rail.pills) {
    // An empty dropdown is decoration wearing a control's clothes — D208's
    // first face, in the shell. The rail omits the pill instead.
    if (p.kind === 'more' && !p.options?.length) faults.push(`more pill "${p.id}" has no options`)
    if (p.kind !== 'more' && p.options) faults.push(`pill "${p.id}" carries options but is not a more-pill`)
  }
  return faults
}
