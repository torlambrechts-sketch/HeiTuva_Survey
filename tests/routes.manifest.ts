import type { Page } from '@playwright/test'
import { DEMO_SHARE_TOKEN } from './db/personas'

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
async function openBuilderPane(page: Page, tab: 'Generelt' | 'Legg til' | 'Innstillinger' | 'Vis') {
  const opener = page.getByRole('button', { name: tab, exact: true })
  if (await opener.count()) await opener.first().click()
  else await page.getByRole('tab', { name: tab, exact: true }).click()
}

/**
 * Pick a survey through the Resultater screen's own "Bytt undersøkelse" select.
 *
 * The route needs a real survey id, and the survey list's rows are ordered by
 * creation time, so addressing a row by position would silently photograph a
 * different survey the moment the seed changes. The picker addresses it by
 * name, and exercises the control while it is at it.
 */
async function pickSurvey(page: Page, title: string) {
  await page.getByRole('link', { name: 'Se svar' }).first().click()
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
        // The «Lovpålagt» filter, because the stat tiles and the filter must
        // agree about what «med hjemmel» counts and the default state cannot
        // show that.
        name: 'lovpalagt',
        setup: async (page) => {
          await page.getByRole('button', { name: /^(Lovpålagt|Statutory)$/ }).click()
          await page.waitForTimeout(400)
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
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
        },
      },
      {
        name: 'avansert',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          // B2 moved «Byggemodus» into the GENERELT tab, where V2:580-587 draws
          // it; it used to float above the tab rail and was reachable from any
          // of them. Below xl the sheet still has to be open before «Avansert»
          // exists — that half is unchanged — but the pane it lives in is not
          // «Legg til» any more.
          await openBuilderPane(page, 'Generelt')
          await page.getByRole('button', { name: 'Avansert', exact: true }).first().click()
        },
      },
      {
        name: 'vis',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'Vis')
        },
      },
      {
        // The Settings tab was never captured or measured until now: the
        // Builder's states were default/avansert/vis only, so the readiness
        // checks, the logic list and the whole engagement panel — the largest
        // surface in this screen — had no coverage at any viewport.
        name: 'innstillinger',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'Innstillinger')
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
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'Innstillinger')
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
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await openBuilderPane(page, 'Innstillinger')
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
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
          await page.waitForURL((u) => u.pathname.endsWith('/bygg'))
          await page.getByRole('link', { name: 'Videre til utsending' }).click()
          await page.waitForURL((u) => u.pathname.endsWith('/send'))
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'import-open',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
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
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
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
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
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
        // the "Delt med firmaet" chip. The seed ships no org templates, so the
        // section only exists once one has been SAVED. Producing it through
        // the Builder's own "Lagre som mal" is the point: a state faked by
        // inserting a row would not prove the button works.
        name: 'default',
        setup: async (page) => {
          const base = page.url().replace(/\/undersokelser.*$/, '')
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
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
        // line, and the × that only an org's own question carries. The seed
        // ships twelve validated questions and no own ones, so the state has
        // to be produced — through the Builder's "Lagre til banken", which is
        // also the only way a user produces it.
        name: 'default',
        setup: async (page) => {
          const base = page.url().replace(/\/undersokelser.*$/, '')
          // Search for the seeded draft by name rather than taking the first
          // "Fortsett å bygge" on the page: other verifiers leave drafts of
          // their own in the demo org, and an empty one has no question and so
          // no "Lagre til banken" button at all.
          await page.getByLabel('Søk i undersøkelser…').fill('Utkast uten svar')
          await page.waitForURL((u) => (u.searchParams.get('sok') ?? '').length > 0)
          await page.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
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
      {
        name: 'bransje-valgt',
        setup: async (page) => {
          await pickSurvey(page, 'Arbeidsmiljø — månedlig')
          await page.getByRole('link', { name: 'Teknologi og IT' }).click()
          await page.waitForURL((u) => u.searchParams.get('bransje') === 'Teknologi og IT')
          await page.waitForLoadState('load')
        },
      },
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
          await page.getByRole('button', { name: 'Oppsett' }).click()
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
        name: 'standardmaler',
        setup: async (page) => {
          await page.getByRole('navigation', { name: 'Rapportfaner' }).getByRole('link', { name: 'Maler' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'standard')
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'mine-rapporter',
        setup: async (page) => {
          await page.getByRole('navigation', { name: 'Rapportfaner' }).getByRole('link', { name: 'Rapporter' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'mine')
          await page.waitForLoadState('load')
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
          await page.getByRole('navigation', { name: 'Rapportfaner' }).getByRole('link', { name: 'Rapporter' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'mine')
          await page.getByRole('button', { name: 'Ny rapport' }).click()
          await page.waitForURL((u) => !!u.searchParams.get('rapport'))
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'filter',
        setup: async (page) => {
          await page.getByRole('navigation', { name: 'Rapportfaner' }).getByRole('link', { name: 'Rapporter' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'mine')
          await page.getByRole('link', { name: 'Åpne' }).first().click()
          await page.waitForURL((u) => !!u.searchParams.get('rapport'))
          await page.getByRole('button', { name: 'Filter', exact: true }).click()
          await page.getByLabel('Gruppe').first().waitFor()
        },
      },
      {
        name: 'del',
        setup: async (page) => {
          await page.getByRole('navigation', { name: 'Rapportfaner' }).getByRole('link', { name: 'Rapporter' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'mine')
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
