import type { Page } from '@playwright/test'
import { DEMO_PASSWORD, PERSONAS, type PersonaName } from '../db/personas'
import { MFA_SECRETS_FILE, freshTotpCode, readMfaSecrets } from '../db/mfa'

/**
 * Browser-side sign-in, shared by the capture harness and the visual suite.
 *
 * Kept in one place because the MFA step is easy to get subtly wrong: the
 * redirect to /sikkerhet is issued by the app layout on the *next* request, so
 * a check made immediately after the login POST can miss it entirely.
 */
export async function satisfyMfa(page: Page, persona: PersonaName, baseUrl: string) {
  void baseUrl
  if (!new URL(page.url()).pathname.startsWith('/sikkerhet')) return false

  const secret = (await readMfaSecrets())[persona]
  if (!secret) {
    throw new Error(
      `${persona} was asked for TOTP but no secret is stored. Run "npm run seed:mfa" ` +
        `after seeding the demo data — expected it in ${MFA_SECRETS_FILE}.`,
    )
  }

  await page.fill('input[name="code"]', await freshTotpCode(secret))
  await page.getByRole('button', { name: /^(Bekreft|Confirm)$/ }).click()
  await page
    .waitForURL((u) => !u.pathname.startsWith('/sikkerhet'), { timeout: 20_000 })
    .catch(async () => {
      const alert = await page
        .getByRole('alert')
        .first()
        .textContent()
        .catch(() => null)
      throw new Error(`${persona}: TOTP was not accepted${alert ? ` — "${alert.trim()}"` : ''}`)
    })
  return true
}

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
  await satisfyMfa(page, persona, baseUrl)
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
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')

  if (persona !== 'anon' && (await satisfyMfa(page, persona, baseUrl))) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
  }

  const landed = new URL(page.url()).pathname
  if (landed !== route) {
    throw new Error(`asked for ${route} as ${persona} but the browser ended up on ${landed}`)
  }
}
