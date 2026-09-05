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
  // The gate is recognised by what is on screen, not by the address bar: after
  // the login action Next follows the layout's redirect client-side, and the
  // URL can still read /oversikt while the challenge is what is rendered. A
  // URL-only check returned false here and the next step timed out on a
  // screen it never reached.
  const code = page.locator('input[name="code"]')
  const enrol = page.getByRole('button', { name: /^(Slå på tofaktor|Turn on two-factor)$/ })
  const atGate = new URL(page.url()).pathname.startsWith('/sikkerhet')
  if (atGate) {
    // The screen streams in after the URL commits; give its form a moment to
    // exist before deciding which state it is in.
    await Promise.race([
      code.waitFor({ timeout: 10_000 }),
      enrol.waitFor({ timeout: 10_000 }),
    ]).catch(() => {})
  }
  const onGate = atGate || (await code.count()) > 0 || (await enrol.count()) > 0
  if (!onGate) return false

  if ((await code.count()) === 0) {
    throw new Error(
      `${persona} is being asked to ENROL a factor, so none is enrolled. Run "npm run seed:mfa" ` +
        'after seeding the demo data.',
    )
  }

  const secret = (await readMfaSecrets())[persona]
  if (!secret) {
    throw new Error(
      `${persona} was asked for TOTP but no secret is stored. Run "npm run seed:mfa" ` +
        `after seeding the demo data — expected it in ${MFA_SECRETS_FILE}.`,
    )
  }

  await code.fill(await freshTotpCode(secret))
  await page.getByRole('button', { name: /^(Bekreft|Confirm)$/ }).click()
  // Accepted means the challenge form is gone — the action redirects and the
  // next screen has no code field.
  await code.waitFor({ state: 'detached', timeout: 20_000 }).catch(async () => {
    const alert = await page
      .getByRole('alert')
      .first()
      .textContent()
      .catch(() => null)
    throw new Error(`${persona}: TOTP was not accepted${alert ? ` — "${alert.trim()}"` : ''}`)
  })
  await page.waitForLoadState('load')
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
  // A hard navigation, so that the gate — when it applies — is a server
  // redirect to /sikkerhet rather than a client-side transition whose URL
  // lags behind what is rendered. The redirect is issued by the app layout on
  // this request; this is the request.
  await page.goto(`${baseUrl}/oversikt`, { waitUntil: 'domcontentloaded' })
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
