import type { Page } from '@playwright/test'
import { DEMO_PASSWORD, PERSONAS, type PersonaName } from '../db/personas'

/**
 * Browser-side sign-in, shared by the capture harness and the visual suite.
 *
 * There is no second factor to satisfy: DECISIONS Q14 defers administrator MFA,
 * so a successful password login lands straight on the requested screen.
 */
export async function signIn(page: Page, persona: PersonaName, baseUrl: string) {
  await page.goto(`${baseUrl}/logg-inn`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[name="email"]')
  await page.fill('input[name="email"]', PERSONAS[persona].email)
  await page.fill('input[name="password"]', DEMO_PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/logg-inn'), { timeout: 20_000 }),
    page.getByRole('button', { name: /^Logg inn$/ }).click(),
  ])
  await page.waitForLoadState('load')
}

/**
 * Navigates and confirms the browser actually stayed there. An unexpected
 * redirect used to be captured as a clean screenshot of a different screen.
 */
export async function gotoRoute(
  page: Page,
  route: string,
  persona: PersonaName | 'anon',
  baseUrl: string,
) {
  void persona
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')

  const landed = new URL(page.url()).pathname
  if (landed !== route) {
    throw new Error(`asked for ${route} as ${persona} but the browser ended up on ${landed}`)
  }
}
