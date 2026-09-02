/**
 * Targeted check for the Firmaopplysninger blur-save.
 *
 * A full `verify:browser` pass takes about twenty minutes because of the TOTP
 * windows, which is too slow a loop for one interaction. This drives just that
 * interaction against an already-running server and prints what happened.
 *
 *   npx next build && npx next start -p 3100   (with the local Supabase env)
 *   npx tsx scripts/verify/probe-firma.mts
 */
import { chromium } from '@playwright/test'
import { gotoRoute, signIn } from '../../tests/helpers/session'

const BASE = process.env.HEITUVA_BASE_URL ?? 'http://127.0.0.1:3100'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log(`  pageerror: ${e.message}`))
page.on('response', (r) => {
  if (r.status() >= 400) console.log(`  http ${r.status()} ${new URL(r.url()).pathname}`)
})

try {
  await signIn(page, 'administrator', BASE)
  // gotoRoute, not goto: the MFA redirect is issued on the next request, so a
  // plain navigation can land on /sikkerhet instead of the page under test.
  await gotoRoute(page, '/administrasjon', 'administrator', BASE)

  const marker = `Storgata ${Math.floor(Math.random() * 900) + 100}, 0155 Oslo`
  await page.fill('input[name="address"]', marker)
  await page.locator('input[name="address"]').blur()

  const shown = await page
    .getByRole('status')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  console.log(`status chip after blur: ${shown ? 'shown' : 'NOT shown'}`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  const persisted = await page.inputValue('input[name="address"]')
  console.log(`address after reload: ${persisted}`)
  console.log(persisted === marker ? 'PERSISTED' : 'NOT PERSISTED')
} finally {
  await browser.close()
}
