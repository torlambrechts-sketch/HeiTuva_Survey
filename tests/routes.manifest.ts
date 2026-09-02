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
    route: '/',
    label: 'oversikt-leser',
    as: 'leser',
    phase: 'phase-1',
    states: [{ name: 'default' }],
  },
]

/** Routes not yet built. Listed so the gap is visible rather than forgotten;
 *  the capture script reports them as pending instead of failing. */
export const PENDING_ROUTES: { route: string; phase: string; note: string }[] = [
  { route: '/profil', phase: 'phase-1', note: 'Profil — next slice' },
  { route: '/administrasjon', phase: 'phase-1', note: 'Administrasjon, five tabs — next slice' },
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
