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
 * WHAT THESE BASELINES ARE, AND ARE NOT
 * They are regression guards: they catch a screen changing when nobody meant
 * it to. They are NOT proof of fidelity to the design — they were generated
 * from this implementation, so they can only ever confirm it still looks like
 * itself.
 *
 * THE SENTENCE THAT USED TO FOLLOW THAT ONE WAS FALSE, and it was false in a
 * way that made the true half above stop mattering: it said «`npm run
 * verify:reference` is the fidelity gate; it renders the design bundle and
 * compares against that». The first clause is right and the second is not.
 * `scripts/verify/reference.ts` renders the bundle and compares it against its
 * own committed pictures of the bundle — which catches a baseline drifting
 * under a newer Chromium, and is why it exists. **It never looks at the app.**
 *
 * So the gap this comment correctly identifies had a gate named against it that
 * did not close it, which is why nobody went looking. `npm run verify:fidelity`
 * (F2) is what actually puts the two side by side; it reports rather than
 * asserts, because the two renders show different data and a pixel diff between
 * them would be red everywhere.
 *
 * They are committed only for screens whose pixels are a function of code and
 * seed data alone. Determinism comes from: one pinned Chromium/WebKit build,
 * `document.fonts.ready` awaited before every capture, animations disabled and
 * the caret hidden (playwright.config.ts), a fixed nb-NO locale and
 * Europe/Oslo timezone, and no rendered timestamp or relative date on any
 * captured screen.
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
    // Scoped to the form's own <p role="alert">, not getByRole('alert'):
    // Next.js injects #__next-route-announcer__ with the same role, and it
    // intermittently resolves alongside ours, failing strict mode rather than
    // producing a pixel diff.
    await page.locator('p[role="alert"]').waitFor({ state: 'visible', timeout: 15_000 })
    // The submit button carries disabled:opacity-60 while the action is in
    // flight. The alert can render before the transition settles, so capturing
    // on the alert alone caught a 40%-dimmed button under load — a real diff,
    // not noise. Wait for the form to be idle, not merely for the error.
    await expect(page.getByRole('button', { name: /^Logg inn$/ })).toBeEnabled()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('logg-inn-feil.png', TOLERANCE)
  })
})

test.describe('the new-survey wizard', () => {
  // The wizard renders from `template_packs`, which the seed fixes and the
  // database suites never mutate — so it is stable enough to pin, unlike the
  // survey list beside it.
  test('step one lists the seeded purposes', async ({ page }) => {
    await signIn(page, 'administrator', BASE_URL)
    await gotoRoute(page, '/undersokelser/ny', 'administrator', BASE_URL)
    await page.getByRole('dialog').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('veiviser-formal.png', TOLERANCE)
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

test.describe('no second factor is required (DECISIONS Q14)', () => {
  // Q14 defers administrator MFA: the enrollment screen and the login-time
  // challenge are gone, not merely switched off. This is the guard that they
  // stay gone — a reintroduced gate would strand every administrator at a
  // route that no longer exists, and password login is the whole flow.
  test('an administrator reaches /administrasjon straight after signing in', async ({ page }) => {
    await signIn(page, 'administrator', BASE_URL)
    await page.goto(`${BASE_URL}/administrasjon`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    expect(new URL(page.url()).pathname).toBe('/administrasjon')
  })

  test('a leser reaches /profil straight after signing in', async ({ page }) => {
    await signIn(page, 'leser', BASE_URL)
    await gotoRoute(page, '/profil', 'leser', BASE_URL)
    expect(new URL(page.url()).pathname).toBe('/profil')
  })
})
