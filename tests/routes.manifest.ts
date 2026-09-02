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
]

/** Routes not yet built. Listed so the gap is visible rather than forgotten;
 *  the capture script reports them as pending instead of failing. */
export const PENDING_ROUTES: { route: string; phase: string; note: string }[] = [
  { route: '/undersokelser', phase: 'phase-2', note: 'Undersøkelser list' },
  { route: '/undersokelser/ny', phase: 'phase-2', note: 'New-survey wizard entry' },
  { route: '/bibliotek', phase: 'phase-2', note: 'Bibliotek' },
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
  return PENDING_ROUTES.some(
    (p) =>
      !p.route.includes('[') &&
      // Match sub-paths too: /administrasjon/personvern belongs to the pending
      // /administrasjon screen group.
      (p.route === clean || clean.startsWith(`${p.route}/`)),
  )
}
