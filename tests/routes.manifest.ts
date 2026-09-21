import type { Page } from '@playwright/test'
import { DEMO_ANSWERED_TOKEN, DEMO_BLOCKS_TOKEN, DEMO_SHARE_TOKEN } from './db/personas'
import { readFileSync } from 'node:fs'
import {
  BUILD_GROUPS,
  BUILD_TAB_KEY,
  BUILD_TAB_PARAM,
  type BuildTab,
} from '../lib/surveys/build-tabs'

/**
 * The routes the harness captures, and the states each must be seen in.
 *
 * A screen is not verified by its happy path alone — CLAUDE.md's definition of
 * done requires every state from the design to be reachable, including empty
 * and warning states. Add a state here the moment you build one; a state with
 * no entry is a state nobody is looking at.
 *
 * `setup` runs after navigation and before the capture. Keep it to driving the
 * UI or seeding via the harness — never reach past the app to fake a state the
 * app cannot actually produce.
 *
 * ── BEFORE YOU EDIT A STATE THAT WRITES, READ THIS ──────────────────────────
 *
 * V2-2 fixed one leak here three times, and the first two fixes each MOVED it
 * somewhere more visible instead of closing it:
 *
 *   1. `admin-sprak/egen-tekst` edited «the first translation form on the
 *      page», whichever key that was, and PERSISTED an override on it. Adding
 *      27 `admin.*` messages moved that first form onto `admin.accentFersken`,
 *      and the fourth accent swatch on Profil read «Vår egen formulering».
 *   2. Fix: pin the key. Pinned to `nav.insight` — a label in the header of
 *      EVERY screen — so the override now corrupted every screenshot in the
 *      suite, and `verify:visual` caught it as a diff in the new-survey wizard,
 *      a page that state has nothing to do with.
 *   3. Fix: `teardown`, below. The state undoes its own write.
 *
 * **A FIX THAT RELOCATES A LEAK INSTEAD OF CLOSING IT IS NOT A FIX**, and the
 * tell is that each step was locally reasonable — pinning an arbitrary target
 * IS better than leaving it arbitrary. What made it worse was that nothing in
 * the fix addressed the actual property, which is that the state WROTE and
 * nothing unwrote it. Blast radius grew from one inert key, to one product
 * string, to every screenshot in the suite, while the root cause sat still.
 *
 * So the question to ask of any state you add or edit here is not «is this
 * target safe» but «does this state write, and if so what undoes it». A
 * teardown failure is a BLOCKER in both harnesses rather than a warning, for
 * the same reason: a silently-skipped teardown is exactly the condition the
 * teardown exists to prevent, and it would leave no trace at all.
 */
export type RouteState = {
  name: string
  /** Optional: skip this state on a viewport where it does not exist. */
  projects?: ('desktop' | 'mobile')[]
  setup?: (page: Page) => Promise<void>
  /**
   * Optional: undo what `setup` PERSISTED, after the capture or measurement.
   *
   * Most states are transient — a menu opened, a tab selected — and end when
   * the page closes. A few WRITE, and a write that outlives its own state is
   * not a state, it is a change to the fixture every later screen renders. The
   * one that made this necessary is in `admin-sprak/egen-tekst` below.
   */
  teardown?: (page: Page) => Promise<void>
}

export type RouteSpec = {
  route: string
  label: string
  /** Persona to sign in as. 'anon' captures signed out. */
  as: 'anon' | 'administrator' | 'redaktor' | 'leser' | 'outsider'
  /** Phase that introduced the route — groups artifacts on disk. */
  phase: string
  states: RouteState[]
}

/**
 * Open the Builder's right pane and select a tab.
 *
 * At xl the pane is a sticky column and its tabs carry role="tab". Below xl
 * RESPONSIVE.md turns it into a sheet behind a pinned button row, so the same
 * three labels are plain buttons that open the sheet. One helper so a state's
 * setup does not have to know which viewport it is running at.
 */
/**
 * T5.1 — OPEN A BUILDER TAB THROUGH THE TWO-LEVEL RAIL v8 DRAWS.
 *
 * This took a tab's LABEL — «Generelt», «Innstillinger», «Vis» — and clicked a
 * button with that name. All four of those labels are gone: T5.1 moved level
 * one into the shell rail as LINKS («Bygg · Metodikk · Innstillinger ·
 * Forhåndsvis», v8:9366-9371) and renamed level two («Spørsmål», «Kjøremodus»,
 * «Personvern og frekvens», «Slik ser den ut»). So the helper found neither a
 * button nor a tab and four manifest states timed out — **and no browser gate
 * has completed a run since T5.1, so nothing reported it.** «A gate that has
 * not run is not a gate that passed», collecting its bill.
 *
 * It takes a `BuildTab` now, which is the registry's own type, so a renamed
 * label cannot break it again: the labels are read from the shipped message
 * files, in BOTH locales, and the group is derived from `BUILD_GROUPS`.
 *
 * Both levels are CLICKED rather than the URL being constructed, for the
 * reason `openSurveyTab` already gives: a gate that types `?fane=` itself
 * never finds out whether the control that produces it works.
 */
const MSG = {
  no: JSON.parse(readFileSync('messages/no.json', 'utf8')).builder as Record<string, string>,
  en: JSON.parse(readFileSync('messages/en.json', 'utf8')).builder as Record<string, string>,
}
const bothLocales = (key: string) =>
  new RegExp(`^(${[MSG.no[key], MSG.en[key]].map((v) => (v ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`)

async function openBuilderPane(page: Page, tab: BuildTab) {
  const group = BUILD_GROUPS.find((g) => (g.tabs as ReadonlyArray<BuildTab>).includes(tab))!
  await page.getByRole('link', { name: bothLocales(group.key) }).first().click()
  await page.waitForURL((u) => u.searchParams.get(BUILD_TAB_PARAM) === group.target)

  /* LEVEL TWO IS REACHED DIFFERENTLY ON EACH SIDE OF `xl`, and the first
     rewrite of this helper got both halves wrong — four browser captures and
     two responsive states failed, all on the same two mistakes:

     - At xl the pane is always mounted (`sticky top-0 hidden xl:block`) and
       level two is `role="tab"`. `getByRole('button')` does NOT match an
       element carrying `role="tab"` — ARIA role, not tag name — so the click
       waited out its timeout on a control that was on screen the whole time.
     - Below xl the pane is ONLY inside the sheet, and the rail cannot open it:
       the `xl:hidden` row is the one control that does both (`setTab` and
       `setSheetOpen`). Navigating by rail alone left every state looking at a
       page whose right-hand pane did not exist.

     Decided by the viewport rather than by probing visibility, because
     `count()` counts `display:none` elements and a probe would have picked the
     hidden one at whichever width it happened to run. 1280 is Tailwind's `xl`. */
  const wide = (page.viewportSize()?.width ?? 1440) >= 1280
  if (!wide) {
    await page.getByRole('button', { name: bothLocales(BUILD_TAB_KEY[tab]) }).first().click()
  } else if (tab !== group.target) {
    await page.getByRole('tab', { name: bothLocales(BUILD_TAB_KEY[tab]) }).first().click()
  }
  await page.waitForURL((u) => u.searchParams.get(BUILD_TAB_PARAM) === tab)
}

/**
 * Pick a survey through the Resultater screen's own "Bytt undersøkelse" select.
 *
 * The route needs a real survey id, and the survey list's rows are ordered by
 * creation time, so addressing a row by position would silently photograph a
 * different survey the moment the seed changes. The picker addresses it by
 * name, and exercises the control while it is at it.
 */
/**
 * F4 — THE ROW'S ACTION LINKS, AND WHY THESE ARE REGEXES.
 *
 * Until F4 the list had ONE row component whose primary call to action was
 * named for the row's status: «Fortsett å bygge» on a draft, «Se svar» on an
 * active survey. Every state below reached the builder through the first of
 * those, and `.first()` therefore meant «the first DRAFT» without saying so —
 * the name did the filtering.
 *
 * v6:2339-2352 draws the table row with three ICON links instead, named for
 * what they do rather than for the row's status, so that implicit filter is
 * gone. `BUILD_LINK` matches the icon; `openDraftBuilder` restores the part the
 * name used to supply, by selecting «Utkast» first.
 *
 * Both names are matched in either language, because `verify:i18n` drives these
 * same states with the browser in English.
 */
const BUILD_LINK = /^(Rediger spørsmål|Edit questions): /
const RESULTS_LINK = /^(Resultater|Results): /

/**
 * Open the builder of the first DRAFT survey — what
 * `getByRole('link', { name: 'Fortsett å bygge' }).first()` used to mean.
 *
 * A site that has already narrowed the list (the bank's own-question state
 * searches for one survey by name) must NOT use this: the filter click would
 * discard its search. Those use `BUILD_LINK` directly.
 */
async function openDraftBuilder(page: Page) {
  await page.getByRole('link', { name: 'Utkast', exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('filter') === 'utkast')
  await page.getByRole('link', { name: BUILD_LINK }).first().click()
  await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
}

/**
 * F5 — open one survey's TAB, and optionally one of its sub-tabs.
 *
 * The survey is named rather than taken by position, for `pickSurvey`'s own
 * reason: rows are ordered by creation time, so `.first()` addresses a place
 * and not a survey. The sub-tab is clicked in the rail rather than reached by
 * typing `?vis=` — a gate that constructs the URL itself never finds out
 * whether the control that produces it works.
 */
async function openSurveyTab(page: Page, segment: string, subLabel?: string) {
  await page.getByLabel('Søk i undersøkelser…').fill('Arbeidsmiljø — månedlig')
  await page.waitForURL((u) => (u.searchParams.get('sok') ?? '').length > 0)
  await page.getByRole('link', { name: BUILD_LINK }).first().click()
  await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
  const id = new URL(page.url()).pathname.split('/')[2]
  const base = page.url().replace(/\/undersokelser.*$/, '')
  await page.goto(`${base}/undersokelser/${id}/${segment}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')
  if (subLabel) {
    await page.getByRole('link', { name: subLabel, exact: true }).click()
    await page.waitForURL((u) => (u.searchParams.get('vis') ?? '').length > 0)
    await page.waitForLoadState('load')
  }
}

async function pickSurvey(page: Page, title: string) {
  await page.getByRole('link', { name: RESULTS_LINK }).first().click()
  await page.waitForURL((u) => u.pathname.endsWith('/resultater'))
  // Addressed by its label, not by position: at desktop the header's own
  // language switcher is the first combobox on the page, so `.first()` picked
  // that instead — and only at desktop, because RESPONSIVE.md moves the
  // switcher into the slide-over panel below md.
  const select = page.getByLabel('Bytt undersøkelse')
  // `<option>` elements are not visible in Playwright's sense, so a text filter
  // on them never resolves. Read the option list off the element instead.
  const value = await select.evaluate(
    (el, wanted) =>
      [...(el as HTMLSelectElement).options].find((o) => o.text.startsWith(wanted))?.value ?? '',
    title,
  )
  if (!value) throw new Error(`pickSurvey: no option for "${title}"`)
  await select.selectOption(value)
  await page.waitForURL((u) => u.pathname.endsWith('/resultater'))
  await page.waitForLoadState('load')
  await page.getByRole('heading', { name: 'Resultater', level: 1 }).waitFor()
}

/**
 * F6 — walk the respondent questionnaire to the end and submit it.
 *
 * WRITTEN AS A LOOP RATHER THAN A FIXED NUMBER OF CLICKS, because the step
 * count is a property of the seeded survey and a literal would silently stop
 * mid-questionnaire the day a question is added — the capture would still
 * succeed and would photograph the wrong screen, which is the failure this
 * manifest has hit before under a different name.
 *
 * Each step answers the first answerable control it finds so «Neste» is not
 * refused by a required question, then advances. `respondent/required-blocked`
 * is the capture that proves the refusal works; this one exists to get past it.
 */
async function submitRespondent(page: Page, surveyComment?: string) {
  for (let guard = 0; guard < 40; guard++) {
    const choice = page.locator('section button[aria-pressed]').first()
    if (await choice.count()) {
      await choice.click()
    } else {
      const text = page.locator('section textarea, section input[type="text"]').first()
      if (await text.count()) await text.fill('Greit nok.')
    }

    const next = page.getByRole('button', { name: /^(Neste|Next)$/ })
    if (await next.count()) {
      await next.first().click()
      await page.waitForTimeout(150)
      continue
    }
    break
  }

  if (surveyComment !== undefined) {
    const fb = page.getByLabel(/Hva synes du om undersøkelsen|What did you think of the survey/)
    if (await fb.count()) await fb.first().fill(surveyComment)
  }

  await page.getByRole('button', { name: /^(Send inn svar|Submit answers)$/ }).first().click()
  await page.getByText(/^(Takk!|Thank you!)$/).waitFor({ timeout: 15_000 })
}

/**
 * N5 — THE REPORT TABS ARE NO LONGER REACHED FROM A RAIL, AND THESE STATES
 * ASKED A RAIL FOR THEM.
 *
 * Five states on `/rapporter` clicked
 * `getByRole('navigation', { name: 'Innsikt' }).getByRole('link', …)` for
 * «Maler» and «Rapporter». N1/N2 rebuilt that rail to v8:9334's — «I dag», the
 * viewer's boards, «Flere oppsett», «Arkiv» — so neither pill exists and
 * `verify:responsive` hung on the locator. **It is what found this.**
 *
 * ── THE TABS THEMSELVES ARE FINE, WHICH IS THE PART TO CHECK BEFORE FIXING ──
 *
 * Measured before touching anything: all three are reachable by click, from
 * `oversikt/ComplianceCard.tsx:42` (lov), the subnav's «Arkiv» (lov),
 * `rapporter/ReportEditor.tsx:65` (mine), `undersokelser/SurveyDetail.tsx:79`
 * and `SurveyTable.tsx:194` (standard), and four `lib/tuva/answers.ts` stems.
 * `verify:reachable` reports 0 orphans. **So there is no product regression —
 * only five states naming a control that moved.**
 *
 * And it matches the drawing: v8 defines `repTabs` (v8:8682) and renders it
 * NOWHERE in its markup. The one rail that would have carried those tabs is
 * v8:9376, which Q248 records as unreachable dead code. v8 reaches `standard`
 * and `mine` from tips (v8:7429-7430) and from `onReport` (v8:7895) — from
 * ACTIONS, never from a rail.
 *
 * ── WHY THIS NAVIGATES INSTEAD OF CLICKING ─────────────────────────────────
 *
 * The rule here is «drive the UI, never reach past the app to fake a state the
 * app cannot actually produce», and this does not break it: the app produces
 * `/rapporter?fane=mine` and several shipped controls lead there. What the old
 * setup was ALSO doing, incidentally, was proving the tab is reachable — and
 * that claim now has a check of its own. `verify:reachable` walks the link
 * graph from the front page; a manifest state's job is to photograph a state,
 * not to re-prove navigation on the way to it.
 *
 * Keeping the click would mean starting these five states on a DIFFERENT
 * screen — Oversikt or the survey row — which couples a report-editor state to
 * the survey list's markup. That is a locator with a predicate nobody declared,
 * which is D189 exactly.
 */
async function openReportTab(page: Page, fane: 'standard' | 'mine' | 'lov') {
  const url = new URL(page.url())
  url.searchParams.set('fane', fane)
  url.searchParams.delete('rapport')
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')
}

export const ROUTES: RouteSpec[] = [
  {
    /*
      The splash (HeiTuva Splash.dc.html). Signed out by definition — it is the
      only public surface in the product that writes rows, so the states worth
      photographing are the panel's three modes rather than the marketing
      sections, which have no state.

      `demo` has no counterpart in the prototype: the design's panel toggles
      between sign-up and login only, and the paid plans' CTAs had nowhere to
      go because there is no billing engine (D75).
    */
    route: '/',
    label: 'splash',
    as: 'anon',
    phase: 'phase-6',
    states: [
      { name: 'default' },
      {
        name: 'priser-manedlig',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Månedlig' }).click()
        },
      },
      {
        name: 'logg-inn',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Logg inn', exact: true }).first().click()
        },
      },
      {
        name: 'demo',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Ta en prat med oss' }).first().click()
          await page.getByRole('button', { name: 'Be om en gjennomgang' }).waitFor()
        },
      },
    ],
  },
  {
    // The two public documents the splash's footer links to (D83).
    route: '/personvern',
    label: 'personvern',
    as: 'anon',
    phase: 'phase-6',
    states: [{ name: 'default' }],
  },
  {
    route: '/databehandleravtale',
    label: 'databehandleravtale',
    as: 'anon',
    phase: 'phase-6',
    states: [{ name: 'default' }],
  },
  {
    route: '/logg-inn',
    label: 'logg-inn',
    as: 'anon',
    phase: 'phase-1',
    states: [
      { name: 'default' },
      {
        name: 'error',
        setup: async (page) => {
          await page.fill('input[name="email"]', 'ingen@example.test')
          await page.fill('input[name="password"]', 'feil-passord')
          await page.getByRole('button', { name: /^Logg inn$/ }).click()
          await page.getByRole('alert').waitFor({ state: 'visible', timeout: 10_000 })
        },
      },
      {
        // Phase 6: what a password session sees after its organisation turned
        // on "Pålogging med Entra ID" (docs/DEVIATIONS.md D82).
        name: 'sso-required',
        setup: async (page) => {
          await page.goto(`${page.url().split('?')[0]}?feil=sso`, { waitUntil: 'domcontentloaded' })
          // `p[role="alert"]`, not getByRole('alert'): Next's route announcer
          // carries the same role and made the strict locator ambiguous — the
          // same trap the `error` state above already documents.
          await page.locator('p[role="alert"]').first().waitFor({ state: 'visible', timeout: 10_000 })
        },
      },
    ],
  },
  {
    // Oversikt (HeiTuva.dc.html:218-317). Built last in Phase 5 because it
    // aggregates every other screen; the phase tag moves with it.
    route: '/oversikt',
    label: 'oversikt',
    as: 'administrator',
    phase: 'phase-5',
    states: [
      { name: 'default' },
      {
        name: 'user-menu-open',
        projects: ['desktop'],
        setup: async (page) => {
          await page.getByRole('button', { name: 'Brukermeny' }).click()
          await page.getByRole('menu').waitFor({ state: 'visible' })
        },
      },
      /*
       * W2 · Q122 — THE TWO STATES NO FIXTURE REACHES, and they are the ones
       * where the failure mode is a blank screen.
       *
       * The Tilpasset module set lives in a COOKIE, not in a table, so the
       * demo seed cannot put the product into either state — a seed reaches
       * only what the database can hold. The harness can, because a cookie is
       * exactly what a browser context carries, and that is why these are
       * states here rather than rows in seed-demo.
       *
       * Both are captured at every project width, not desktop-only: switching
       * a module off changes its row's grid template rather than hiding a card
       * in place, so the layout differs at each breakpoint (V4:6071-6074).
       */
      {
        // A personal set that is NOT any workspace's own: one card from each
        // row, which is the case where BOTH templates fall back to their
        // single-column form and both rows still render.
        name: 'arbeidsflate-tilpasset',
        setup: async (page) => {
          await page.context().addCookies([
            { name: 'heituva.workspace', value: 'custom', url: page.url() },
            {
              name: 'heituva.customMods',
              value: JSON.stringify(['activity', 'action']),
              url: page.url(),
            },
          ])
          await page.reload({ waitUntil: 'networkidle' })
          await page.getByText('Tilpasset').first().waitFor()
        },
      },
      /*
       * W3 · THE VOCABULARY ACROSS WORKSPACES, not in one.
       *
       * Norwegian inflection is not length-neutral — «kunde» to «deltaker» is
       * three characters, and «Ansatte som skal svare» is not the width of
       * «Deltakere som skal svare». A label can therefore overflow in ONE
       * workspace and not another, which no single-workspace capture can see.
       * So `cx` is captured beside the default `hr`: two vocabularies through
       * the same four sentences, at every project width.
       */
      {
        name: 'arbeidsflate-kunder',
        setup: async (page) => {
          await page.context().addCookies([
            { name: 'heituva.workspace', value: 'cx', url: page.url() },
          ])
          await page.reload({ waitUntil: 'networkidle' })
          /*
           * WAIT ON THE HINT, NOT THE LABEL.
           *
           * `getByText('Kunder og service')` matched the <option> inside the
           * chip's transparent <select> FIRST — an element Playwright can never
           * call visible, so the wait could not succeed however correct the
           * page was. CI said so exactly: «64 × locator resolved to hidden
           * <option selected value="cx">», which is also the proof the feature
           * worked: the cookie was read and the server rendered cx.
           *
           * The hint is the better anchor on its own merits, not just because
           * it is visible: it is cx's row in `workspaces`, rendered nowhere
           * else, so waiting on it asserts the SERVER resolved this workspace
           * rather than that some element mentioning its name exists.
           */
          await page.getByText('NPS i dag, trend og kritikere som venter på svar.').waitFor()
        },
      },
      /*
       * Q125 — the quiz workspace, captured even though its picker option is
       * HIDDEN. Two reasons, and the second is the one that makes this more
       * than a screenshot.
       *
       * 1. Without it the quiz card has no photograph at all: it renders only
       *    when `show.quiz` is on, and no capturable workspace switches that
       *    module on but this one. A card nobody photographed is the shape
       *    CLAUDE.md lists six times — green for something that structurally
       *    could not be seen.
       * 2. Reaching it by cookie IS the assertion that hiding governs the
       *    PICKER and never the RESOLVER. `readWorkspace` resolves against
       *    `all`; only `selectable` filters on `visible`. If a later change
       *    ever moved the filter into resolution, this state would stop
       *    rendering and say so here.
       */
      {
        name: 'arbeidsflate-quiz',
        setup: async (page) => {
          await page.context().addCookies([
            { name: 'heituva.workspace', value: 'quiz', url: page.url() },
          ])
          await page.reload({ waitUntil: 'networkidle' })
          // The card's own heading, rendered on no other screen and visible —
          // not the workspace label, which resolves to a hidden <option> first
          // (the W3 slip recorded on the cx state above).
          await page.getByText('Start en quiz nå').waitFor()
        },
      },
      {
        // Every module off. `[]` rather than a missing cookie: an ABSENT
        // cookie means «nothing chosen» and falls back to the workspace's own
        // set, while an EMPTY one means «chose nothing» and is the state that
        // renders «Ingen moduler er valgt». Collapsing the two would make this
        // state unreachable, which is why `parseModuleCookie` keeps them apart.
        name: 'arbeidsflate-tom',
        setup: async (page) => {
          await page.context().addCookies([
            { name: 'heituva.workspace', value: 'custom', url: page.url() },
            { name: 'heituva.customMods', value: '[]', url: page.url() },
          ])
          await page.reload({ waitUntil: 'networkidle' })
          await page.getByText('Ingen moduler er valgt').waitFor()
        },
      },
      // V2-4 · Q68 (DEFAULTED). The «Legg til tiltak» INPUT is gone — creating a
      // task happens in one place now, Oppgaver, where the lifecycle and the
      // close guard are. The card keeps its drawing and its button links there
      // (D113), so there is no longer an open-state to photograph here. The
      // state moved rather than vanished: `oppgaver/ny-oppgave` below.
    ],
  },
  {
    // V2-4 — Oppgaver (V2:2152-2214), the statutory task register.
    route: '/oppgaver',
    label: 'oppgaver',
    as: 'administrator',
    phase: 'phase-5',
    states: [
      { name: 'default' },
      {
        // The «Lovpålagt» scope, because the buckets and the scope rail must
        // agree about what «med hjemmel» counts and the default state cannot
        // show that.
        name: 'lovpalagt',
        setup: async (page) => {
          await page.getByRole('button', { name: /^(Lovpålagt|Statutory)$/ }).click()
          await page.waitForTimeout(400)
        },
      },
      {
        /* V5-2 — the board (v5:3356). A COOKIE state, like the workspace
           modules: `heituva.worklist` is per-person and a seed cannot reach it,
           so the state is created the way a person creates it and then read
           back from the rendered page. Five columns, not the bundle's four —
           `effektvurdert` has its own, because filing it under «Lukket» is the
           one distinction Q69 exists to protect. */
        name: 'tavle',
        setup: async (page) => {
          await page.context().addCookies([
            { name: 'heituva.worklist', value: 'board', url: page.url() },
          ])
          await page.reload({ waitUntil: 'networkidle' })
          await page.getByText(/^(Til effektvurdering|Awaiting effect assessment)$/).waitFor()
        },
        teardown: async (page) => {
          // The cookie PERSISTS, and a view mode that outlives its own state
          // would photograph every later /oppgaver capture as a board. Put it
          // back to the value the resolver would have produced anyway.
          await page.context().addCookies([
            { name: 'heituva.worklist', value: 'list', url: page.url() },
          ])
        },
      },
      {
        /* The empty view (v5:3247). Reached by combining a type with a scope
           that cannot both hold: «Tilbakemeldinger» with «Lovpålagt» — a
           comment has no hjemmel, and `matchesScope` excludes it rather than
           passing it through, so the list is genuinely empty rather than
           filtered to nothing by accident. */
        name: 'tom',
        setup: async (page) => {
          await page.goto(`${new URL(page.url()).origin}/oppgaver?type=tilbakemeldinger`, {
            waitUntil: 'networkidle',
          })
          await page.getByRole('button', { name: /^(Lovpålagt|Statutory)$/ }).click()
          await page.getByText(/^(Ingenting i denne visningen|Nothing in this view)$/).waitFor()
        },
      },
      {
        /* F6 — `/oppgaver?type=oppgaver`, the drawing's `oppgaver-oppgaver`.
           The type rail is a URL parameter, so the default capture shows only
           one of its three positions and the other two had never been walked. */
        name: 'type-oppgaver',
        setup: async (page) => {
          await page.goto(`${new URL(page.url()).origin}/oppgaver?type=oppgaver`, {
            waitUntil: 'networkidle',
          })
        },
      },
      {
        /* F6 — `/oppgaver?type=tilbakemeldinger`, the drawing's
           `oppgaver-tilbakemeldinger`. The `tom` state below already navigates
           here and then narrows it to empty; this is the same route with its
           rows, which is what the bundle draws. */
        name: 'type-tilbakemeldinger',
        setup: async (page) => {
          await page.goto(`${new URL(page.url()).origin}/oppgaver?type=tilbakemeldinger`, {
            waitUntil: 'networkidle',
          })
        },
      },
      {
        /* An expanded row, because «Interne notater» (M:0113), the six step
           chips and the reply box render only there — three quarters of what
           this phase built is behind one click. The seeded note on «Revisjon
           hos leverandør» is what makes `hasNotes` reachable. */
        name: 'rad-apen',
        setup: async (page) => {
          await page.getByRole('button', { name: /Revisjon hos leverandør/ }).first().click()
          await page.getByText(/^(Interne notater|Internal notes)$/).first().waitFor()
        },
      },
    ],
  },
  {
    // V2-9 — Live (V2:1829-1927), the presenter's screen.
    //
    // Reached the way a presenter reaches it: from the survey list, through the
    // context bar's «Kjør live» button, which renders only when
    // `surveys.run_mode = 'live'`. Navigating rather than deep-linking is what
    // the Builder's entry already does, and it means the capture also proves
    // the button appears at all — a screen photographed by URL would look
    // identical whether or not anything led to it.
    //
    // ONE STATE, and that is a statement rather than an omission. The reveal,
    // the counter and the bars all depend on Q78, which is OPEN: until Tor
    // answers, the counter is hidden below k and the reveal is refused below k,
    // so «revealed» is not a state this build can reach on the demo seed by
    // design. `docs/v2/07-v2-9-opening.md` and the phase report both say so.
    route: '/undersokelser',
    label: 'live',
    as: 'administrator',
    phase: 'phase-6',
    states: [
      {
        name: 'default',
        setup: async (page) => {
          // `pickSurvey` and not a row click, for the reason its own comment
          // gives: rows are ordered by creation time, so `.first()` addresses a
          // position rather than a survey. **This route was captured wrong
          // twice before that mattered** — the first attempt clicked the row
          // title, which is a span and not a link at all; the second clicked
          // the first «Se svar» and landed on «Pulssjekk utvikling», a survey
          // in standard mode, so «Kjør live» was correctly absent and the
          // failure looked like a missing button rather than a wrong survey.
          // The ERROR screenshot is what said which — a capture that fails
          // usefully because it photographs where it actually was.
          await pickSurvey(page, 'Arbeidsmiljø')
          await page.getByRole('link', { name: /^(Kjør live|Run live)$/ }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/live'))
        },
      },
      {
        /*
          F6 — THE REVEAL, AND THE MANIFEST'S OWN REASON FOR OMITTING IT WAS
          WRONG.

          The note above says «revealed» is not reachable on the demo seed
          because the counter is hidden and the reveal refused BELOW k. Measured
          2026-09-16, that is not what blocks it: `answered` comes from
          `aggregate_results` over the ROUND (live/page.tsx:110-122), and the
          seeded round has 12 responses against k=5 — so `belowThreshold` is
          FALSE and the button is not disabled.

          What actually blocks it is that the seeded session is CLOSED and
          EXPIRED, so `open` is false and page.tsx:165 passes `session={null}`;
          with no session there is no reveal control to click. The capture
          therefore does what a presenter does — opens a session, then reveals —
          and closes it again in teardown, because a session left open outlives
          this capture and would photograph «live/default» with an active one.
        */
        name: 'revealed',
        /*
          AND THE SECOND FINDING, FROM `verify:responsive` RATHER THAN FROM THE
          CAPTURE RUN: the setup was not IDEMPOTENT, and this state MUTATES
          STORED DATA.

          It clicked «Start live» unconditionally. Starting a session writes a
          row, so once a run leaves one open — the teardown is best-effort and
          does not fire when the setup itself fails — every later run finds
          «Avslutt live» where it is waiting for «Start live», and blocks for the
          full 30s. Reported as `could not be measured`, which is what it was.

          Same shape as `respondent-takk-invitert/resultat-onsket` in the same
          sweep, and the rule is theirs jointly: **a manifest state that writes
          must describe the END STATE, not the keystroke** — it is run once per
          viewport, once per project and again after any failure.
        */
        setup: async (page) => {
          await pickSurvey(page, 'Arbeidsmiljø')
          await page.getByRole('link', { name: /^(Kjør live|Run live)$/ }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/live'))

          const start = page.getByRole('button', { name: /^(Start live|Go live)$/ })
          const end = page.getByRole('button', { name: /^(Avslutt live|End live)$/ })
          await Promise.race([
            start.waitFor({ timeout: 15_000 }),
            end.waitFor({ timeout: 15_000 }),
          ])
          if (await start.count()) await start.click()

          // The reveal is a toggle, so the same reasoning applies one control
          // down: «Skjul resultat» means it is already revealed.
          const show = page.getByRole('button', { name: /^(Vis resultat|Show results)$/ })
          const hide = page.getByRole('button', { name: /^(Skjul resultat|Hide results)$/ })
          await Promise.race([
            show.waitFor({ timeout: 15_000 }),
            hide.waitFor({ timeout: 15_000 }),
          ])
          if (await show.count()) await show.click()
          await hide.waitFor({ timeout: 15_000 })
        },
        teardown: async (page) => {
          const close = page.getByRole('button', { name: /^(Avslutt live|End live)$/ })
          if (await close.count()) await close.first().click()
        },
      },
    ],
  },
  {
    // V2-8 — Bruksområder. PUBLIC, so mobile-first pixel-perfect at 380-420px
    // per CLAUDE.md rather than RESPONSIVE.md.
    route: '/bruksomrader',
    label: 'bruksomrader',
    as: 'anon',
    phase: 'phase-6',
    states: [
      { name: 'default' },
      {
        // One use case open: the list state shows none of the setup, the
        // question types or the report, which is most of the page.
        name: 'sak',
        setup: async (page) => {
          await page.getByRole('button', { name: /Psykososial kartlegging|Psychosocial mapping/ }).click()
          await page.waitForTimeout(400)
        },
      },
    ],
  },
  {
    // V2-7 — test mode (V2:6637). The banner (V2:3323) is the state worth
    // photographing: it is what tells an editor that nothing they do here is
    // stored, and `p_dry_run` is what makes that true.
    // Reached the way a person reaches it — from the Builder's preview pane —
    // rather than by a URL the harness composes. A capture that navigates
    // straight to a route proves the route renders and not that anything leads
    // to it, which is how V2-4's nav item nearly shipped pointing at nothing.
    route: '/undersokelser',
    label: 'test-modus',
    as: 'administrator',
    phase: 'phase-6',
    states: [
      {
        name: 'default',
        setup: async (page) => {
          // Through the row menu's «Svar selv (test)» (V2:1049), which has
          // pointed at /undersokelser/<id>/test since Phase 2 — a PENDING route
          // until this phase built it. The Builder's own CTA (V2:894) is the
          // other entry and needs a sent survey; this one reaches it from the
          // list, which is where the harness already is.
          //
          // The FIRST row is the active survey, not a draft: a draft has no
          // round, and `mint_test_token` answers `no_round` rather than
          // inventing one.
          await page.getByRole('button', { name: /Flere valg|More options/ }).first().click()
          await page.getByRole('menu').first().waitFor()
          await page.getByRole('menuitem', { name: /Svar selv \(test\)|Answer it yourself/ }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/test'))
          await page.waitForTimeout(1200)
        },
      },
    ],
  },
  {
    // V2-6 — Hjelp og støtte (V2:1944-2146). Q74 DEFAULTED: two tabs, not three.
    route: '/hjelp',
    label: 'hjelp',
    as: 'administrator',
    phase: 'phase-6',
    states: [
      { name: 'default' },
      {
        // An open article, because the list state cannot show the step rail, the
        // mock panel or the «Les videre» links — three quarters of the screen.
        name: 'artikkel',
        setup: async (page) => {
          await page.getByRole('button', { name: /Sett terskelen|Set the threshold/ }).click()
          await page.waitForTimeout(400)
        },
      },
      {
        // The contact tab. Its two right-hand cards are D116 — they say what is
        // true where the bundle drew four support channels and a service-status
        // panel with an invented maintenance date.
        name: 'kontakt',
        setup: async (page) => {
          await page.getByRole('button', { name: /^(Kontakt oss|Contact us)$/ }).click()
          await page.waitForTimeout(400)
        },
      },
    ],
  },
  {
    route: '/profil',
    label: 'profil',
    as: 'administrator',
    phase: 'phase-1',
    states: [
      { name: 'default' },
      {
        name: 'saved',
        setup: async (page) => {
          await page.fill('input[name="job_title"]', 'HR-direktør')
          await page.getByRole('button', { name: /Lagre endringer|Save changes/ }).click()
          await page.getByRole('status').first().waitFor({ state: 'visible', timeout: 15_000 })
        },
      },
      {
        name: 'notify-toggled',
        setup: async (page) => {
          await page.getByRole('switch').first().click()
          await page.waitForTimeout(1200)
        },
      },
    ],
  },
  {
    route: '/profil',
    label: 'profil-leser',
    as: 'leser',
    phase: 'phase-1',
    states: [{ name: 'default' }],
  },
  {
    route: '/oversikt',
    label: 'oversikt-leser',
    as: 'leser',
    phase: 'phase-1',
    states: [{ name: 'default' }],
  },
  {
    route: '/administrasjon',
    label: 'admin-firma',
    as: 'administrator',
    phase: 'phase-1',
    states: [
      { name: 'default' },
      {
        name: 'saved',
        setup: async (page) => {
          // The card has no save button by design — it saves when a changed
          // field loses focus, so the blur is the interaction under test.
          //
          // The value must differ from what is stored. React's value tracker
          // suppresses onChange when a field is refilled with the value it
          // already has, so a fixed string silently stopped marking the form
          // dirty as soon as a previous run had saved it — and the state failed
          // against an implementation that was working.
          const address = page.locator('input[name="address"]')
          const current = await address.inputValue()
          await address.fill(current === 'Storgata 12, 0155 Oslo' ? 'Storgata 14, 0155 Oslo' : 'Storgata 12, 0155 Oslo')
          await address.blur()
          await page.getByRole('status').first().waitFor({ state: 'visible', timeout: 15_000 })
        },
      },
    ],
  },
  {
    // V2-2 — «Profil og avsender», the two cards it builds (V2:2313-2347).
    route: '/administrasjon/profil',
    label: 'admin-profil',
    as: 'administrator',
    phase: 'phase-1',
    states: [
      { name: 'default' },
      {
        // The accent chosen. Captured as its own state because the SELECTED
        // swatch is the only thing that changes — an --ink border and a ✓ — and
        // a default-only capture photographs the state nobody is ever in after
        // the first click. V1-6's visual gate had exactly this hole.
        name: 'accent-picked',
        setup: async (page) => {
          // NOT an exact-name match. A swatch button's accessible name is the
          // whole of its three spans — «✓ Salvie Kontrast 11,3:1» — so
          // /^Salvie$/ matches nothing and the responsive gate reported it as
          // UNMEASURED rather than as a miss. That distinction is the harness
          // doing its job: a state it cannot reach is a blocker, not a pass.
          const salvie = page.getByRole('button', { name: /Salvie|Sage/ })
          const already = (await salvie.getAttribute('aria-pressed')) === 'true'
          await page
            .getByRole('button', { name: already ? /Fersken|Peach/ : /Salvie|Sage/ })
            .click()
          await page.waitForTimeout(1200)
        },
      },
    ],
  },
  {
    route: '/administrasjon/brukere',
    label: 'admin-brukere',
    as: 'administrator',
    phase: 'phase-1',
    states: [
      { name: 'default' },
      {
        name: 'invite-duplicate',
        setup: async (page) => {
          // The seeded administrator is already a member, so inviting that
          // address must surface the duplicate refusal rather than "sent".
          await page.fill('input[name="email"]', 'admin@nordiskstudio.test')
          await page.getByRole('button', { name: /^(Inviter|Invite)$/ }).click()
          await page.getByRole('alert').first().waitFor({ state: 'visible', timeout: 15_000 })
        },
      },
    ],
  },
  {
    route: '/administrasjon/grupper',
    label: 'admin-grupper',
    as: 'administrator',
    phase: 'phase-1',
    states: [{ name: 'default' }],
  },
  {
    /* I1-3 — Integrasjoner (V4:2869-2926), the sixth admin tab.
       The demo seed carries a connector whose `last_used_at` is 36 hours old and
       whose error count is zero, so `default` is the CONNECTED state — the one
       the bundle's fixture claims four times over and which nothing in this
       product could produce until I1-2. The other thirteen rows render
       «Ikke tilgjengelig» with the control disabled (D163), which is the state
       that would otherwise never be photographed. */
    route: '/administrasjon/integrasjoner',
    label: 'admin-integrasjoner',
    as: 'administrator',
    phase: 'phase-1',
    states: [{ name: 'default' }],
  },
  {
    /* V5-3 — the Entra detail page (v5:3819-3902), the first of the two states
       __3_ adds over __2_.

       ITS OWN ROUTE rather than a state of the tab, because the bundle's
       `intOpen` is a screen and not a panel: six sections, a back link and a
       full-width header card. Deep-linked here, which is also how the capture
       proves the 404 for a non-administrator is the only other outcome.

       The demo seed carries a SCIM credential, so the default state is a real
       connection — «needs_setup» until Entra has actually called, which is the
       honest state of a token nobody has pasted anywhere yet. The four
       fabrications the page refuses (tenant, next-sync time, four groups, a
       four-row log) are asserted in tests/unit/integrations.test.ts rather than
       here: a screenshot cannot show the absence of a claim. */
    route: '/administrasjon/integrasjoner/entra',
    label: 'admin-entra',
    as: 'administrator',
    phase: 'phase-6',
    states: [{ name: 'default' }],
  },
  {
    // V2-3a — Målgrupper (V2:2405-2658), the cards this phase builds.
    route: '/administrasjon/malgrupper',
    label: 'admin-malgrupper',
    as: 'administrator',
    phase: 'phase-1',
    states: [
      { name: 'default' },
      {
        // The rule builder with a field chosen. Captured because the state that
        // matters is the one where an UNAVAILABLE field is visible and
        // disabled — Q65's «the editor must say so» is only true if somebody
        // has looked at it.
        name: 'regel-felt-valgt',
        setup: async (page) => {
          // BY ACCESSIBLE NAME, NOT BY POSITION. `locator('select').first()`
          // resolved to the shell's language switcher — which is
          // `opacity-0` over a styled trigger, so it is never visible and the
          // scenario timed out for thirty seconds on both viewports rather
          // than photographing the wrong control. Loud, but the state went
          // unphotographed either way. A positional selector on a page with a
          // persistent chrome is a selector aimed at whatever loads first.
          await page.getByLabel(/^(Velg felt|Choose a field)$/).selectOption('role')
          await page.waitForTimeout(400)
        },
      },
      {
        // V2-3b. The Medlemmer card with a search applied — the state that
        // shows the four derived statuses (Q61) next to each other, which the
        // default state only shows if the seed happens to order them together.
        name: 'medlemmer-sok',
        setup: async (page) => {
          await page.getByLabel(/^(Søk i medlemmer|Search members)$/).fill('nordiskstudio')
          await page.waitForTimeout(400)
        },
      },
    ],
  },
  {
    route: '/administrasjon/personvern',
    label: 'admin-personvern',
    as: 'administrator',
    phase: 'phase-1',
    states: [
      { name: 'default' },
      {
        name: 'dsr-form-open',
        setup: async (page) => {
          await page.getByRole('button', { name: /^(Behandle|Handle)$/ }).first().click()
          await page.locator('input[name="subject_email"]').first().waitFor({ state: 'visible' })
        },
      },
      {
        name: 'privacy-toggled',
        setup: async (page) => {
          await page.getByRole('switch', { name: /EU\/EØS|EU\/EEA/ }).click()
          await page.waitForTimeout(1500)
        },
      },
    ],
  },
  {
    route: '/administrasjon/valg',
    label: 'admin-valg',
    as: 'administrator',
    phase: 'phase-1',
    states: [{ name: 'default' }],
  },
  {
    /*
      Administrasjon → Språk, the translation editor (DECISIONS Q12).

      No design reference — the bundle has no such screen (docs/DEVIATIONS.md
      D79) — so the states here are the ones the editor actually has: the list
      as it opens, a namespace filtered by search, and a message carrying this
      org's own override.
    */
    route: '/administrasjon/sprak',
    label: 'admin-sprak',
    as: 'administrator',
    phase: 'phase-6',
    states: [
      { name: 'default' },
      {
        name: 'sok',
        setup: async (page) => {
          await page.fill('input[name="q"]', 'lagre')
          await page.getByRole('button', { name: 'Søk' }).click()
          await page.waitForURL((u) => u.searchParams.get('q') === 'lagre')
          await page.waitForLoadState('load')
        },
      },
      {
        /*
          V2-2 — THE KEY IS NOW PINNED, AND IT HAD TO BE.

          This setup used to edit "the first translation form on the page",
          whichever key that happened to be, and it PERSISTS an organisation
          override on that key. V2-2 added 27 `admin.*` messages, the first form
          became `admin.accentFersken`, and the fourth accent swatch rendered as
          «Vår egen formulering» in every subsequent capture — including the one
          this phase added, whose setup then could not find a button called
          «Fersken» and timed out.

          Standing question 4: what does this leave behind? An override on a key
          nobody chose. It was harmless only for as long as the key it landed on
          happened to be inert, which is not a property anybody was maintaining.

          `nav.insight` is the pinned key deliberately: `verify:roundtrip`
          already overrides and then REMOVES exactly this row, so the two
          harnesses agree about which string is the demo override rather than
          racing over whichever one sorts first.
        */
        name: 'egen-tekst',
        setup: async (page) => {
          await page.goto(
            new URL('/administrasjon/sprak?ns=nav&q=insight', page.url()).toString(),
            { waitUntil: 'domcontentloaded' },
          )
          await page.waitForLoadState('load')
          const first = page.locator('form').filter({ has: page.locator('textarea') }).first()
          await first.locator('textarea').fill('Vår egen formulering')
          await first.getByRole('button', { name: 'Lagre' }).click()
          await page.getByText('Egen tekst').first().waitFor()
        },
        teardown: async (page) => {
          // PINNING THE KEY WAS HALF A FIX AND THE OTHER HALF WAS WORSE.
          // Pinned to `nav.insight`, the override survived the capture and the
          // header of every later screenshot read «Vår egen formulering»
          // instead of «Innsikt» — which the visual gate caught as a diff in
          // the wizard screen, a page this state has nothing to do with.
          //
          // A state that writes has to undo its write. Reaching into the
          // database from here would be reaching past the app to unmake a
          // state the app made, so it clicks the control a user would.
          await page.goto(
            new URL('/administrasjon/sprak?ns=nav&q=insight', page.url()).toString(),
            { waitUntil: 'domcontentloaded' },
          )
          await page.waitForLoadState('load')
          await page.getByRole('button', { name: 'Tilbakestill til standard' }).first().click()
          await page.waitForTimeout(1200)
        },
      },
    ],
  },
  {
    route: '/administrasjon',
    label: 'admin-forbidden-redaktor',
    as: 'redaktor',
    phase: 'phase-1',
    states: [{ name: 'default' }],
  },
  // Both were built in Phase 1 but never listed, so nothing had ever measured
  // them at any viewport. They are signed-in-but-not-yet-placed states, which
  // no persona in this manifest can reach, so they are captured signed out —
  // the middleware sends an anonymous visitor to /logg-inn, and asserting that
  // redirect is itself worth having.
  {
    route: '/undersokelser',
    label: 'undersokelser',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      { name: 'default' },
      {
        name: 'utkast',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Utkast', exact: true }).click()
          await page.waitForURL((u) => u.searchParams.get('filter') === 'utkast')
        },
      },
      {
        name: 'row-menu',
        setup: async (page) => {
          // The ··· menu is the only part of the row that is not a link, and
          // it carries the three destructive actions.
          await page.getByRole('button', { name: 'Flere valg' }).first().click()
          await page.getByRole('menu').first().waitFor()
        },
      },
      {
        name: 'share',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Flere valg' }).first().click()
          await page.getByRole('menuitem', { name: 'Del med teamet' }).click()
          await page.waitForURL((u) => u.searchParams.has('del'))
        },
      },
    ],
  },
  {
    route: '/undersokelser',
    label: 'undersokelser-leser',
    as: 'leser',
    phase: 'phase-2',
    // A reader sees the list and the read-only menu items, and is told why
    // rather than handed buttons RLS would refuse.
    states: [{ name: 'default' }],
  },
  {
    // The Builder needs a concrete survey, so the harness resolves the org's
    // most recent draft rather than hard-coding an id the seed may renumber.
    route: '/undersokelser',
    label: 'bygg',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      {
        name: 'default',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
        },
      },
      {
        name: 'avansert',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          // B2 moved «Byggemodus» into the GENERELT tab, where V2:580-587 draws
          // it; it used to float above the tab rail and was reachable from any
          // of them. Below xl the sheet still has to be open before «Avansert»
          // exists — that half is unchanged — but the pane it lives in is not
          // «Legg til» any more.
          await openBuilderPane(page, 'general')
          await page.getByRole('button', { name: 'Avansert', exact: true }).first().click()
        },
      },
      {
        name: 'vis',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'preview')
        },
      },
      {
        /**
         * V7-5 — the flow in COMPACT density, which no other state can reach.
         *
         * The switch renders only when the flow has more than one item, and
         * every other builder state opens the org's DRAFT — «Utkast uten
         * svar», one question, so `flow.length > 1` is false and the control
         * is not on the page. **A state a gate cannot reach is a state nobody
         * checks**, which is V1-6's hole exactly.
         *
         * So this one names the survey that HAS a mixed flow: «Med
         * innholdsblokker», three questions and four blocks. It is `aktiv`, so
         * the rows render read-only — which is the honest limit of this state
         * and is stated here rather than discovered: the capture proves the
         * row's LAYOUT at both widths and the arrows' disabled styling, and
         * the enabled reorder is proven by `flow-row.test.ts` plus the driven
         * round trip recorded in the phase report.
         */
        name: 'kompakt',
        setup: async (page) => {
          await page.getByLabel('Søk i undersøkelser…').fill('Med innholdsblokker')
          await page.waitForURL((u) => (u.searchParams.get('sok') ?? '').length > 0)
          await page.getByRole('link', { name: BUILD_LINK }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('button', { name: /^(Kompakt|Compact)$/ }).first().click()
          await page.locator('select[aria-label]').first().waitFor()
        },
      },
      {
        // The Settings tab was never captured or measured until now: the
        // Builder's states were default/avansert/vis only, so the readiness
        // checks, the logic list and the whole engagement panel — the largest
        // surface in this screen — had no coverage at any viewport.
        name: 'innstillinger',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'settings')
          // Scoped to the visible heading: below xl the right pane exists
          // twice in the DOM — the sticky column is `hidden` and the sheet is
          // the live copy — so an unscoped text match is a strict-mode
          // violation rather than a wait.
          await page.locator('h2:visible', { hasText: 'Engasjement og svarprosent' }).first().waitFor()
        },
      },
      {
        // The policy panel open (v1, NEW:577-635). Its closed state rides along
        // in `innstillinger`; this is the one that shows the chips, the notes
        // and the threshold row.
        name: 'policy-open',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'settings')
          await page.getByRole('button', { name: 'Endre', exact: true }).first().click()
          await page.locator('button:visible', { hasText: 'Fysiske personer' }).first().waitFor()
        },
      },
      {
        // Threshold 3: the `--sbg` box explaining what a low threshold costs.
        // The state worth capturing is the WARNING, not the chip — it is the
        // only place the product argues with the person setting it.
        name: 'policy-low-warning',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'settings')
          await page.getByRole('button', { name: 'Endre', exact: true }).first().click()
          await page.locator('button:visible', { hasText: '3' }).first().click()
          await page.locator(':visible', { hasText: 'Med terskel 3 kan svar' }).first().waitFor()
        },
      },
    ],
  },
  {
    route: '/undersokelser/ny',
    label: 'undersokelser-ny',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      { name: 'formal' },
      {
        name: 'sporsmal',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Neste' }).click()
          await page.getByRole('slider').waitFor()
        },
      },
      {
        name: 'hyppighet',
        setup: async (page) => {
          for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Neste' }).click()
          await page.getByText('Oppsummering').waitFor()
        },
      },
    ],
  },
  {
    // Send (HeiTuva.dc.html:1686-1912). Reached through the survey list, like
    // the Builder, because the route needs a real survey id.
    //
    // None of these states presses "Send undersøkelsen": sending flips the
    // draft to `aktiv` and opens a round, so a capture that sent would leave
    // the next run without a draft to photograph. The sent confirmation is
    // covered by verify:send, which drives the whole pipeline.
    route: '/undersokelser',
    label: 'send',
    as: 'administrator',
    phase: 'phase-3',
    states: [
      {
        name: 'default',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('link', { name: 'Videre til utsending' }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/send'))
          await page.waitForLoadState('load')
        },
      },
      {
        /*
         * W3 — THE VOCABULARY UNDER A SECOND WORKSPACE, on the screen carrying
         * the longest of the four substitutions.
         *
         * V4:3218 changed this heading from «Mottakere» to
         * «{personsCap} som skal svare», so `cx` renders «Kunder som skal
         * svare» where `hr` renders «Ansatte som skal svare». Norwegian
         * inflection is not length-neutral — «kunde» to «deltaker» is three
         * characters — so a label can overflow in ONE workspace and not
         * another, and no single-workspace capture would ever see it.
         *
         * The cookie is set before the navigation because the substitution
         * happens at SERVER render; setting it afterwards would photograph the
         * previous workspace's words.
         */
        name: 'arbeidsflate-kunder',
        setup: async (page) => {
          await page.context().addCookies([
            { name: 'heituva.workspace', value: 'cx', url: page.url() },
          ])
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('link', { name: 'Videre til utsending' }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/send'))
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'import-open',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('link', { name: 'Videre til utsending' }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/send'))
          await page.getByRole('button', { name: 'Importer mottakere' }).click()
          await page.waitForTimeout(150)
        },
      },
      {
        // Phase 6: the SMS card (HeiTuva.dc.html:1810-1816), reachable because
        // the seed switches `sms_channel` on for the demo org.
        name: 'sms',
        setup: async (page) => {
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('link', { name: 'Videre til utsending' }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/send'))
          await page.getByRole('button', { name: /^SMS/ }).first().click()
          await page.getByRole('heading', { name: 'SMS', exact: true }).waitFor()
        },
      },
      {
        name: 'recurring',
        setup: async (page) => {
          // The cadence panel's recurring branch — rounds, rotation and the
          // plan chips only exist once a cadence other than "Én gang" is
          // picked, so the default capture never sees them.
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('link', { name: 'Videre til utsending' }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/send'))
          await page.getByRole('button', { name: /Hver uke/ }).click()
          await page.waitForTimeout(150)
        },
      },
    ],
  },
  {
    route: '/bibliotek',
    label: 'bibliotek-maler',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      { name: 'default' },
      {
        name: 'lovpalagt',
        setup: async (page) => {
          // The statutory category is the one that carries a note, and the
          // legal_ref badges only appear on those packs.
          await page.getByRole('link', { name: 'Lovpålagt' }).click()
          await page.waitForURL((u) => u.searchParams.get('kategori') === 'Lovpålagt')
        },
      },
      {
        name: 'liste',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Liste' }).click()
          await page.waitForURL((u) => u.searchParams.get('visning') === 'liste')
        },
      },
      {
        // T4 — `packdetail`, reached the way v8 reaches it: from a template
        // card. The state is declared HERE rather than as a `/bibliotek/[id]`
        // route of its own because the id is a seeded uuid nobody can name in
        // advance, and clicking the card is also what proves the card LINKS —
        // a route with no way in is a route nobody can measure.
        name: 'pakke',
        setup: async (page) => {
          // v8's «Se», the card's own peek control. Located by href rather
          // than by name: «Se» is two letters and would match inside other
          // labels, and a name-based locator carries predicates nobody
          // declared (D189).
          await page.locator('a[href^="/bibliotek/"]').first().click()
          await page.waitForURL(/\/bibliotek\/[0-9a-f-]{36}$/)
        },
      },
    ],
  },
  {
    route: '/undersokelser',
    label: 'bibliotek-firmaets-maler',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      {
        // "Firmaets maler" — the design's own-templates section
        // (HeiTuva.dc.html:1570-1590), with its own four-colour tint cycle and
        // the "Delt med firmaet" chip.
        //
        // **«The seed ships no org templates» WAS TRUE UNTIL Q175 AND IS NOT
        // ANY MORE.** The seed now carries two — one private, one shared — so
        // the section exists on a bare reset and every other capture of the
        // library sees the screen a real organisation has. What this state
        // still proves is the part that matters and the part a row cannot
        // fake: the Builder's own "Lagre som mal" BUTTON works, asserted by
        // waiting for "Lagret som mal ✓" below.
        name: 'default',
        setup: async (page) => {
          const base = page.url().replace(/\/undersokelser.*$/, '')
          await openDraftBuilder(page)
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('button', { name: 'Lagre som mal' }).click()
          await page.getByRole('button', { name: 'Lagret som mal ✓' }).waitFor({ timeout: 15_000 })
          await page.goto(`${base}/bibliotek`, { waitUntil: 'domcontentloaded' })
          await page.getByText('Firmaets maler').waitFor({ timeout: 15_000 })
        },
      },
    ],
  },
  {
    route: '/bibliotek',
    label: 'bibliotek-bank',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      {
        name: 'default',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Spørsmålsbank' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'bank')
        },
      },
      {
        name: 'search',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Spørsmålsbank' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'bank')
          await page.fill('input[aria-label="Søk i spørsmålsbanken…"]', 'leder')
          await page.waitForURL((u) => u.searchParams.get('sok') === 'leder', { timeout: 15_000 })
        },
      },
    ],
  },
  {
    route: '/undersokelser',
    label: 'bibliotek-bank-egne',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      {
        // The bank's own-question state (HeiTuva.dc.html:1666-1680): the grey
        // "Egen" badge instead of the teal "Validert", the author in the meta
        // line, and the × that only an org's own question carries.
        //
        // **«no own ones» WAS FALSE IN BOTH DIRECTIONS BEFORE Q175.** The seed
        // declared two own bank rows AND three shared ones, and the whole
        // insert had been failing silently on a NOT NULL — so the bank held
        // only the migration's rows and the «Egne» chip was empty on every
        // reset. Fixed there; the count here is no longer a number this
        // comment should carry, since the seed owns it.
        // The state is kept because the Builder's "Lagre til banken" button is
        // what it proves, which no seeded row can.
        name: 'default',
        setup: async (page) => {
          const base = page.url().replace(/\/undersokelser.*$/, '')
          // Search for the seeded draft by name rather than taking the first
          // "Fortsett å bygge" on the page: other verifiers leave drafts of
          // their own in the demo org, and an empty one has no question and so
          // no "Lagre til banken" button at all.
          await page.getByLabel('Søk i undersøkelser…').fill('Utkast uten svar')
          await page.waitForURL((u) => (u.searchParams.get('sok') ?? '').length > 0)
          await page.getByRole('link', { name: BUILD_LINK }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          // Idempotent: an earlier verifier in the same run may already have
          // saved this question, and then the button reads "I banken ✓" and
          // waiting for "Lagre til banken" times out on a state that is in fact
          // already reached.
          const save = page.getByRole('button', { name: 'Lagre til banken' }).first()
          if (await save.count()) await save.click()
          await page.getByRole('button', { name: 'I banken ✓' }).first().waitFor({ timeout: 15_000 })
          await page.goto(`${base}/bibliotek?fane=bank`, { waitUntil: 'domcontentloaded' })
          await page.getByText('Egen', { exact: true }).first().waitFor({ timeout: 15_000 })
        },
      },
    ],
  },
  {
    route: '/bibliotek',
    label: 'bibliotek-leser',
    as: 'leser',
    phase: 'phase-2',
    states: [{ name: 'default' }],
  },
  {
    /* V7-4 — THE CONTENT BLOCKS, PHOTOGRAPHED (closes D239).

       V7-3c seeded «Med innholdsblokker» and its share token but added no
       manifest state, because the apparatus was frozen for that phase — so the
       block flow was openable and unmeasured. This project's own record says
       what that costs: «a route nobody walks is a route nobody can measure»
       (F5), and a seed that reaches a state no gate walks is better than psql
       and worse than a capture.

       ONE state is enough, and that is a property of the fixture rather than
       luck: the seeded survey has `one_question: false`, so WHOLE-LIST mode
       renders the section, the info block, the fact box and the divider on a
       single screen — four of the six types in one capture, at both widths.

       It is a SEPARATE survey from `DEMO_SHARE_TOKEN`'s, deliberately: that
       one's baseline is what `verify:visual` compares against, and interleaving
       blocks into it would have moved a reference every earlier phase was
       judged against. */
    route: `/s/${DEMO_BLOCKS_TOKEN}`,
    label: 'respondent-innholdsblokker',
    as: 'anon',
    phase: 'phase-3',
    states: [{ name: 'default' }],
  },
  {
    // The respondent surface (HeiTuva.dc.html:1936-2130). `anon` on purpose:
    // a respondent has no account, and a capture signed in as an administrator
    // would prove nothing about the screen real people see.
    route: `/s/${DEMO_SHARE_TOKEN}`,
    label: 'respondent',
    as: 'anon',
    phase: 'phase-3',
    states: [
      { name: 'default' },
      {
        name: 'answered',
        setup: async (page) => {
          // A share link stays answerable, so the follow-up and comment boxes
          // that only appear after a low score are reachable here — the design
          // states that the capture sweep would otherwise never see.
          await page.locator('section button[aria-pressed]').first().click()
          await page.waitForTimeout(150)
        },
      },
      {
        name: 'required-blocked',
        setup: async (page) => {
          // Pressing Neste with nothing answered must surface the required
          // notice rather than advancing.
          await page.getByRole('button', { name: 'Neste' }).click()
          await page.waitForTimeout(200)
        },
      },
      {
        /* F6 — the per-question comment box OPEN (`respondent-kommentar`).
           C3 built it and no capture had ever opened it, so the drawing's two
           comment states had no app half at all. The opener is a control with
           its own label rather than a position, so this does not silently move
           to another question when the seed changes. */
        name: 'kommentar',
        setup: async (page) => {
          await page.getByRole('button', { name: /Legg til en kommentar|Add a comment/ })
            .first()
            .click()
          await page.getByPlaceholder(/Skriv en kort kommentar|Write a short comment/).first().waitFor()
        },
      },
      {
        /* F6 — the SAVED state (`respondent-kommentar-lagret`), which is the
           one v6 removed the map for and whose meaning changed: `qcSaved` is a
           derived boolean over `qcSavedText` now (CLAUDE.md's third kind of
           bundle change). The app half has to exist for that to be checkable
           at all. */
        name: 'kommentar-lagret',
        setup: async (page) => {
          await page.getByRole('button', { name: /Legg til en kommentar|Add a comment/ })
            .first()
            .click()
          const box = page.getByPlaceholder(/Skriv en kort kommentar|Write a short comment/).first()
          await box.fill('Spørsmålet var litt uklart formulert.')
          await page.getByRole('button', { name: /^(Lagre kommentar|Save comment)$/ }).first().click()
          await page.getByText(/Kommentar lagret|Comment saved/).first().waitFor()
        },
      },
    ],
  },
  {
    /*
      F6 — THE THANKS SCREEN, BOTH HALVES. `ThankYou` renders on `done`, and
      `commentSent` is true only when a SURVEY-LEVEL comment actually went with
      the submission — the bundle's `fbSent` state, which the app refuses to
      fake (a confirmation of something that did not happen is a fabricated
      value). So the two are genuinely two states and not one with a flag.

      A SEPARATE ENTRY rather than two more states on `respondent`, because
      submitting is terminal: every state after it on the same token would
      photograph the thanks screen instead of the survey. The share token stays
      answerable, which is what makes a second entry possible at all.
    */
    route: `/s/${DEMO_SHARE_TOKEN}`,
    label: 'respondent-takk',
    as: 'anon',
    phase: 'phase-3',
    states: [
      {
        name: 'default',
        setup: async (page) => {
          await submitRespondent(page)
        },
      },
      {
        name: 'sendt',
        setup: async (page) => {
          // The survey-level box (`fbTitle`) is what sets `commentSent`. It is
          // the LAST card on the last step, so it is filled after the answers
          // and before Send.
          await submitRespondent(page, 'Undersøkelsen var grei, men litt lang.')
        },
      },
    ],
  },
  {
    /*
      G1 — the thanks screen as an INVITED respondent sees it, which is the only
      way to photograph the result opt-in.

      `can_opt_in` is false for a share link, on purpose: there is no address and
      nowhere to send anything. So the state above — which uses DEMO_SHARE_TOKEN —
      captures «Hva skjer nå» and «Du sa · vi gjorde» and cannot capture the
      checkbox. This token belongs to a SPENT invitation, so the page opens on the
      thanks screen with nothing to submit, repeatably.
    */
    route: `/s/${DEMO_ANSWERED_TOKEN}`,
    label: 'respondent-takk-invitert',
    as: 'anon',
    phase: 'phase-3',
    states: [
      { name: 'default' },
      {
        name: 'resultat-onsket',
        /*
          IDEMPOTENT, AND THE FIRST DRAFT WAS NOT.

          It clicked «Send meg det samlede resultatet» unconditionally, which is
          correct exactly once: the opt-in writes a PERSISTENT column on the
          invitation, so the 390px run left it on and the 320px run then waited
          thirty seconds for a label that had become «Vi har notert». The gate
          reported it as a blocker, which is what it was.

          The lesson is the state's, not the gate's: a manifest state that
          MUTATES stored data is run once per viewport and once per suite, so it
          has to describe the end state rather than the keystroke. This waits for
          whichever label is on screen and clicks only when it is the off one.
        */
        setup: async (page) => {
          const on = page.getByRole('button', { name: /Vi har notert|We have noted/ })
          const off = page.getByRole('button', { name: /Send meg det samlede|Send me the summarised/ })
          await Promise.race([
            on.waitFor({ timeout: 15_000 }),
            off.waitFor({ timeout: 15_000 }),
          ])
          if (await off.count()) await off.click()
          // The tick renders only after the write is CONFIRMED, so waiting for
          // the pressed label waits for the round trip rather than for an
          // optimistic flip.
          await on.waitFor({ timeout: 15_000 })
        },
      },
    ],
  },
  {
    route: '/s/ugyldig-token-finnes-ikke',
    label: 'respondent-closed',
    as: 'anon',
    phase: 'phase-3',
    states: [{ name: 'default' }],
  },
  {
    route: '/logg-inn',
    label: 'kom-i-gang-redirects-anon',
    as: 'anon',
    phase: 'phase-1',
    states: [{ name: 'default', setup: async (page) => {
      await page.goto(`${page.url().replace(/\/logg-inn.*$/, '')}/kom-i-gang`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForURL((u) => u.pathname.startsWith('/logg-inn'), { timeout: 15_000 })
    } }],
  },
  {
    /*
      F5 — THE THREE SURVEY SUB-ROUTES THE MANIFEST HAD NEVER WALKED.

      `send` and `resultater` were in here; `sporsmal`, `kommentarer` and
      `tiltak` were not, so no browser gate had ever loaded them at any width.
      F5 puts a rail on two of them and builds the third from nothing, and a
      screen no gate opens is the shape this project has hit eight times — most
      recently as an HTTP 500 that three gates scored green.

      Reached the way `resultater` is reached, through the list, because the
      route needs a real survey id. «Arbeidsmiljø — månedlig» is the one the
      seed gives comments, tasks and answers above k, so every sub-tab has rows
      on both sides of its predicate.
    */
    route: '/undersokelser',
    label: 'survey-sporsmal',
    as: 'administrator',
    phase: 'phase-2',
    states: [
      { name: 'default', setup: (page: Page) => openSurveyTab(page, 'sporsmal') },
      { name: 'skala', setup: (page: Page) => openSurveyTab(page, 'sporsmal', 'Skala') },
      { name: 'fritekst', setup: (page: Page) => openSurveyTab(page, 'sporsmal', 'Fritekst') },
    ],
  },
  {
    route: '/undersokelser',
    label: 'survey-kommentarer',
    as: 'administrator',
    phase: 'phase-5',
    states: [
      { name: 'default', setup: (page: Page) => openSurveyTab(page, 'kommentarer') },
      { name: 'venter', setup: (page: Page) => openSurveyTab(page, 'kommentarer', 'Venter') },
      { name: 'behandlet', setup: (page: Page) => openSurveyTab(page, 'kommentarer', 'Behandlet') },
    ],
  },
  {
    /* G2.6 — the survey's Målgruppe tab, which had NO manifest coverage at all
       before this phase. «Levering» ships three of v8's six delivery figures;
       the other three are stated as absent on the screen rather than omitted,
       so this state is also what proves that sentence renders. */
    route: '/undersokelser',
    label: 'survey-malgruppe',
    as: 'administrator',
    phase: 'phase-3',
    states: [
      { name: 'default', setup: (page: Page) => openSurveyTab(page, 'malgruppe') },
      { name: 'levering', setup: (page: Page) => openSurveyTab(page, 'malgruppe', 'Levering') },
    ],
  },
  {
    route: '/undersokelser',
    label: 'survey-tiltak',
    as: 'administrator',
    phase: 'phase-5',
    states: [
      { name: 'default', setup: (page: Page) => openSurveyTab(page, 'tiltak') },
      { name: 'alle', setup: (page: Page) => openSurveyTab(page, 'tiltak', 'Alle') },
      { name: 'hjemmel', setup: (page: Page) => openSurveyTab(page, 'tiltak', 'Med hjemmel') },
    ],
  },
  {
    // Resultater (HeiTuva.dc.html:2136-2298). Reached through the survey list
    // because the route needs a real survey id, then re-pointed with the
    // screen's own picker so each state names the survey it wants.
    route: '/undersokelser',
    label: 'resultater',
    as: 'administrator',
    phase: 'phase-4',
    states: [
      {
        name: 'default',
        setup: async (page) => {
          await pickSurvey(page, 'Arbeidsmiljø — månedlig')
        },
      },
      {
        // Every panel's insufficient-data treatment at once: three responses,
        // so the aggregate, the themes and our side of the benchmark all refuse.
        name: 'for-fa-svar',
        setup: async (page) => {
          await pickSurvey(page, 'Psykososial kartlegging')
        },
      },
      {
        name: 'ikke-sendt',
        setup: async (page) => {
          await pickSurvey(page, 'Utkast uten svar')
        },
      },
      {
        name: 'tema-valgt',
        setup: async (page) => {
          await pickSurvey(page, 'Arbeidsmiljø — månedlig')
          await page.getByRole('link', { name: /^tid · / }).click()
          await page.waitForURL((u) => u.searchParams.get('tema') === 'tid')
          await page.waitForLoadState('load')
        },
      },
      /* G2 — v8's three OTHER resultat views. Added with the phase that built
         them: a route nobody walks is a route nobody can measure, and F5 paid
         for that lesson when a sub-route's first manifest coverage immediately
         turned up a finding that predated it. `sporsmal` needs no state — it is
         the default and `default` above already lands on it. */
      {
        name: 'vis-matrise',
        setup: async (page) => {
          await pickSurvey(page, 'Arbeidsmiljø — månedlig')
          await page.getByRole('link', { name: 'Matrise', exact: true }).click()
          await page.waitForURL((u) => u.searchParams.get('vis') === 'matrise')
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'vis-sammenlign',
        setup: async (page) => {
          await pickSurvey(page, 'Arbeidsmiljø — månedlig')
          await page.getByRole('link', { name: 'Sammenligning', exact: true }).click()
          await page.waitForURL((u) => u.searchParams.get('vis') === 'sammenlign')
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'vis-frisvar',
        setup: async (page) => {
          await pickSurvey(page, 'Arbeidsmiljø — månedlig')
          await page.getByRole('link', { name: 'Frisvar', exact: true }).click()
          await page.waitForURL((u) => u.searchParams.get('vis') === 'frisvar')
          await page.waitForLoadState('load')
        },
      },
      /**
       * V7-5 — `bransje-valgt` IS REMOVED, AND THE REASON IS THE FINDING.
       *
       * It clicked «Teknologi og IT», an industry chip that renders only when
       * `benchmarks` has rows. **The seed ships none**: Q134 deleted six
       * invented industry figures because they were being rendered to a
       * customer as a comparison bar with a developer note admitting the number
       * was made up, and `isSourced` was written to refuse their like.
       *
       * The chip existed anyway, on every run, because `tests/invariants/
       * k-surface.test.ts` upserted two rows into that global table and had no
       * teardown — and the db suite runs before the browser gates. **This state
       * photographed a screen only a test's leak could produce** (D245).
       *
       * Worse, and the sharper half: the leaked rows carried
       * `source = 'Testfixtur, k-surface.test.ts'`, which `isSourced` ACCEPTS —
       * its regex can only refuse a source that declares itself provisional in
       * the words it happens to hold, exactly as its own comment says. So the
       * guard Q134 built against invented comparison figures was walked through
       * by a fixture.
       *
       * Not replaced, because there is nothing true to replace it with: a
       * sourced benchmark is a content decision and inventing one is the defect
       * Q134 closed. The benchmark comparison therefore has NO reachable demo
       * state until real figures exist — which is the honest consequence of
       * Q134 and was masked for four months.
       */
    ],
  },
  {
    route: '/dashboard',
    label: 'dashboard',
    as: 'administrator',
    phase: 'phase-4',
    states: [
      { name: 'default' },
      {
        // The seeded second team never reaches five, so every cell of its
        // heatmap row must render as n<5 rather than as a number.
        //
        // V1-4/Q46 moved the period and group selects OUT of the header and
        // into the «Tilpass» card, so reaching them now means opening the card
        // first. Both this state and `siste-runde` failed the first V1-4 run
        // for exactly that reason — the harness catching a relocation nothing
        // else would have noticed.
        name: 'gruppe-under-terskel',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Tilpass' }).click()
          await page.getByLabel('Gruppe').selectOption({ label: 'Utvikling' })
          await page.waitForURL((u) => u.searchParams.has('gruppe'))
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'siste-runde',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Tilpass' }).click()
          await page.getByLabel('Periode').selectOption('q')
          await page.waitForURL((u) => u.searchParams.get('periode') === 'q')
          await page.waitForLoadState('load')
        },
      },
      // V1-4's own states. The card's tab is a URL parameter (see
      // CustomizeToggle) so each opens directly, without a click path that
      // depends on hydration.
      {
        name: 'tilpass-utvalg',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Tilpass' }).click()
          await page.getByText('Undersøkelser i utvalget').waitFor()
        },
      },
      {
        name: 'tilpass-paneler',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Tilpass' }).click()
          await page.getByRole('button', { name: 'Paneler' }).click()
          await page.getByText('Gruppert etter spørsmålet').waitFor()
        },
      },
      {
        name: 'tilpass-oppsett',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Tilpass' }).click()
          // EXACT. Playwright matches `name` as a case-insensitive SUBSTRING by
          // default, so G1's per-panel «Panelets oppsett» button matched this
          // tab and the click became a strict-mode violation over five
          // elements. The tab is the one named exactly «Oppsett»; the loose
          // match was carrying a predicate — «the only control whose name
          // contains oppsett» — that nothing declared and G1 falsified.
          await page.getByRole('button', { name: 'Oppsett', exact: true }).click()
          await page.getByPlaceholder('Navn på oppsettet').waitFor()
        },
      },
    ],
  },
  {
    // Rapporter (HeiTuva.dc.html:911-1330). Three tabs; the Lovpålagte one is
    // the duty engine, and the seed puts its four cards in four different
    // states so the ladder is visible rather than four copies of "Mangler".
    route: '/rapporter',
    label: 'rapporter',
    as: 'administrator',
    phase: 'phase-5',
    states: [
      { name: 'lovpalagte' },
      {
        name: 'plikt-innstillinger',
        setup: async (page) => {
          await page.getByRole('button', { name: 'Innstillinger' }).first().click()
          await page.getByLabel('Publiser rapporten offentlig').first().waitFor()
        },
      },
      {
        /* F3 — the rail these five states click is the SHELL's now, so they
           ask for the subnav by its label («Innsikt») rather than for the
           in-page «Rapportfaner» that no longer exists. The rail moved because
           v6 draws the Rapporter tabs in the subnav and leaves `repTabs`
           (v6:8027) defined-and-unrendered in its own script; the manifest is
           the LAST place that still named the old one, and `verify:responsive`
           is what found it. */
        name: 'standardmaler',
        setup: async (page) => {
          await openReportTab(page, 'standard')
        },
      },
      {
        name: 'mine-rapporter',
        setup: async (page) => {
          await openReportTab(page, 'mine')
        },
      },
    ],
  },
  {
    // The editor is a STATE of /rapporter in the design (`repEditing`), not a
    // screen of its own, so it is captured through the route that opens it.
    // Each state opens one of the three side panels — they are the screen.
    route: '/rapporter',
    label: 'rapport-editor',
    as: 'redaktor',
    phase: 'phase-5',
    states: [
      {
        name: 'innhold',
        setup: async (page) => {
          await openReportTab(page, 'mine')
          /* `.first()` because v6 draws this ONE action three times — the «På
             tvers» card (v6:2809), the mine-list header (v6:3008) and the empty
             state (v6:3054), all calling `onNewReport`. Two of the three ship,
             so the locator has to say which. The card's is first in the DOM and
             is present on every tab, which is what makes it the stable one. */
          await page.getByRole('button', { name: 'Ny rapport' }).first().click()
          await page.waitForURL((u) => !!u.searchParams.get('rapport'))
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'filter',
        setup: async (page) => {
          await openReportTab(page, 'mine')
          await page.getByRole('link', { name: 'Åpne' }).first().click()
          await page.waitForURL((u) => !!u.searchParams.get('rapport'))
          await page.getByRole('button', { name: 'Filter', exact: true }).click()
          await page.getByLabel('Gruppe').first().waitFor()
        },
      },
      {
        name: 'del',
        setup: async (page) => {
          await openReportTab(page, 'mine')
          await page.getByRole('link', { name: 'Åpne' }).first().click()
          await page.waitForURL((u) => !!u.searchParams.get('rapport'))
          // `exact` because "Deltakelse og svarprosent" is also a button on
          // this screen and starts with the same three letters.
          await page.getByRole('button', { name: 'Del', exact: true }).click()
          await page.getByText('Hvem skal se den').waitFor()
        },
      },
    ],
  },
  {
    // The same screen as a leser: every control is present but inert, and the
    // signing buttons are absent because none of the slots is theirs.
    route: '/rapporter',
    label: 'rapporter-leser',
    as: 'leser',
    phase: 'phase-5',
    states: [{ name: 'lovpalagte' }],
  },
]

/** Routes not yet built. Listed so the gap is visible rather than forgotten;
 *  the capture script reports them as pending instead of failing. */
export const PENDING_ROUTES: { route: string; phase: string; note: string }[] = [
  { route: '/r/[token]', phase: 'phase-5', note: 'Shared report — captured by verify:export, which mints a token' },


]

/**
 * A route the nav links to but nobody has built yet 404s when Next prefetches
 * it. That is expected while a phase is in flight, but it must never be
 * silently swallowed: the capture reports these separately so a genuine 404
 * still fails, and a pending route that quietly stays pending stays visible.
 */
export function isPendingRoute(urlPath: string): boolean {
  const clean = urlPath.split('?')[0] ?? urlPath
  return PENDING_ROUTES.some((p) => {
    // A dynamic segment matches exactly one path segment, so the pending
    // /undersokelser/[id]/send matches /undersokelser/<uuid>/send. Dynamic
    // routes used to be excluded outright, which was harmless while none was
    // ever prefetched — the moment Undersøkelser linked to a survey's own
    // sub-screens, every row's prefetch counted as a real 404.
    if (p.route.includes('[')) {
      const pattern = p.route
        .split('/')
        .map((seg) =>
          seg.startsWith('[') && seg.endsWith(']')
            ? '[^/]+'
            : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('/')
      // Sub-paths of a pending dynamic route are pending too.
      return new RegExp(`^${pattern}(/|$)`).test(clean)
    }
    // Match sub-paths too: /administrasjon/personvern belongs to the pending
    // /administrasjon screen group.
    return p.route === clean || clean.startsWith(`${p.route}/`)
  })
}
