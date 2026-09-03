import type { Page } from '@playwright/test'

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
    route: '/bibliotek',
    label: 'bibliotek-leser',
    as: 'leser',
    phase: 'phase-2',
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
]

/** Routes not yet built. Listed so the gap is visible rather than forgotten;
 *  the capture script reports them as pending instead of failing. */
export const PENDING_ROUTES: { route: string; phase: string; note: string }[] = [
  { route: '/undersokelser/[id]/send', phase: 'phase-3', note: 'Send screen (channels, import)' },
  { route: '/undersokelser/[id]/test', phase: 'phase-3', note: '"Svar selv" — the respondent flow' },
  { route: '/undersokelser/[id]/resultater', phase: 'phase-4', note: 'Resultater for one survey' },
  { route: '/undersokelser/[id]/rapport', phase: 'phase-5', note: 'Report editor for one survey' },
  { route: '/dashboard', phase: 'phase-4', note: 'Dashboard (heatmap, trends)' },
  { route: '/rapporter', phase: 'phase-5', note: 'Rapporter' },
  { route: '/s/[token]', phase: 'phase-3', note: 'Respondent flow (mobile-first)' },
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
