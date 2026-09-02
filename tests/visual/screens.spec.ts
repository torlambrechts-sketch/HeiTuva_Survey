import { expect, test } from '@playwright/test'
import { BASE_URL } from '../../playwright.config'
import { gotoRoute, signIn } from '../helpers/session'

/**
 * Screenshot regression for the screens whose pixels are a function of code
 * alone.
 *
 * Deliberately not every route. The signed-in screens render live data that the
 * database suites in tests/db mutate on every run — timestamped contact names,
 * DSR due dates, member counts — so a baseline over them would fail for reasons
 * that have nothing to do with the diff under review, and a suite that cries
 * wolf gets switched off. Those screens are covered by the capture harness
 * (`npm run verify:browser`), which reviews them state by state and fails on
 * console errors, HTTP errors, unexpected redirects and untranslated keys.
 * Extending this file to them needs a per-run fixture snapshot first.
 *
 * Tolerance is CLAUDE.md's 0.1%: maxDiffPixelRatio 0.001.
 *
 * Update baselines deliberately, never reflexively:
 *   npx playwright test --update-snapshots
 */
const TOLERANCE = { maxDiffPixelRatio: 0.001, fullPage: true } as const

test.describe('signed out', () => {
  test('login screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('logg-inn.png', TOLERANCE)
  })

  test('login screen shows a generic error for bad credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="email"]', 'ingen@example.test')
    await page.fill('input[name="password"]', 'feil-passord')
    await page.getByRole('button', { name: /^Logg inn$/ }).click()
    await page.getByRole('alert').waitFor({ state: 'visible', timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('logg-inn-feil.png', TOLERANCE)
  })
})

test.describe('focus is visible', () => {
  // CLAUDE.md specifies a 3px #191510 outline at 2px offset. It has been lost
  // once already, to a Tailwind `outline-none` utility that won the cascade, so
  // it is asserted as a measurement rather than left to the eye.
  test('an input shows the design focus ring', async ({ page }) => {
    await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[name="email"]').focus()
    const ring = await page.locator('input[name="email"]').evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        color: s.outlineColor,
        offset: s.outlineOffset,
      }
    })
    expect(ring).toEqual({
      width: '3px',
      style: 'solid',
      color: 'rgb(25, 21, 16)',
      offset: '2px',
    })
  })
})

test.describe('administrator MFA gate', () => {
  // The gate itself has no org data on it, so it is stable enough to pin.
  test('an administrator is held at /sikkerhet until TOTP is confirmed', async ({ page }) => {
    await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="email"]', 'admin@nordiskstudio.test')
    await page.fill('input[name="password"]', 'heituva-dev-password-1!')
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/logg-inn'), { timeout: 20_000 }),
      page.getByRole('button', { name: /^Logg inn$/ }).click(),
    ])
    await page.goto(`${BASE_URL}/administrasjon`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')

    expect(new URL(page.url()).pathname).toBe('/sikkerhet')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('sikkerhet.png', TOLERANCE)
  })

  test('a leser is never asked for TOTP', async ({ page }) => {
    await signIn(page, 'leser', BASE_URL)
    await gotoRoute(page, '/profil', 'leser', BASE_URL)
    expect(new URL(page.url()).pathname).toBe('/profil')
  })
})
