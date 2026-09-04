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
 */
export type RouteState = {
  name: string
  /** Optional: skip this state on a viewport where it does not exist. */
  projects?: ('desktop' | 'mobile')[]
  setup?: (page: Page) => Promise<void>
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
async function openBuilderPane(page: Page, tab: 'Legg til' | 'Innstillinger' | 'Vis') {
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
    ],
  },
  {
    route: '/',
    label: 'oversikt',
    as: 'administrator',
    phase: 'phase-1',
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
    route: '/',
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
          // The mode chips sit at the top of the right pane, so below xl the
          // sheet has to be open before "Avansert" exists.
          await openBuilderPane(page, 'Legg til')
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
        name: 'gruppe-under-terskel',
        setup: async (page) => {
          await page.getByLabel('Gruppe').selectOption({ label: 'Utvikling' })
          await page.waitForURL((u) => u.searchParams.has('gruppe'))
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'siste-runde',
        setup: async (page) => {
          await page.getByLabel('Periode').selectOption('q')
          await page.waitForURL((u) => u.searchParams.get('periode') === 'q')
          await page.waitForLoadState('load')
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
          await page.getByRole('link', { name: 'Standardmaler' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'standard')
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'mine-rapporter',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Mine rapporter' }).click()
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
          await page.getByRole('link', { name: 'Mine rapporter' }).click()
          await page.waitForURL((u) => u.searchParams.get('fane') === 'mine')
          await page.getByRole('button', { name: 'Ny rapport' }).click()
          await page.waitForURL((u) => !!u.searchParams.get('rapport'))
          await page.waitForLoadState('load')
        },
      },
      {
        name: 'filter',
        setup: async (page) => {
          await page.getByRole('link', { name: 'Mine rapporter' }).click()
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
          await page.getByRole('link', { name: 'Mine rapporter' }).click()
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
  { route: '/undersokelser/[id]/test', phase: 'phase-3', note: '"Svar selv" — the respondent flow' },

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
