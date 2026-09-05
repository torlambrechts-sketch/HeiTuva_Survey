/**
 * The splash, exercised as a visitor.
 *
 * Its own script rather than a state in the capture manifest because it is the
 * only PUBLIC write path in the product: an account is created and a demo
 * request is filed by somebody with no session. Those two behaviours need
 * asserting, not photographing.
 *
 * `--local` pins the spawned server to the local stack through `LOCAL_SUPABASE`.
 * That is not optional here for the usual reason and one worse one: this script
 * CREATES ACCOUNTS, and a bare `next start` reads `.env.local`, which points at
 * production. That is not hypothetical — it happened while this file was being
 * written, and a test account had to be deleted off prod afterwards.
 */
import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { anonClient, serviceClient } from '../../tests/db/clients'

if (!process.argv.includes('--local')) config({ path: '.env.local', quiet: true })

let failures = 0
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} ${detail.slice(0, 80)}`)
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'nb-NO' })
    const page = await ctx.newPage()
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => consoleErrors.push(e.message))

    const res = await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
    check('the splash is public — no session, no redirect', res?.status() === 200 && new URL(page.url()).pathname === '/',
      `HTTP ${res?.status()} at ${new URL(page.url()).pathname}`)

    const heroText = await page.locator('h1').first().innerText()
    check('the hero renders', heroText.includes('De svarer'), heroText.replace(/\n/g, ' '))

    // DECISIONS Q11: two languages, and the page must not claim four.
    const langs = await page.getByLabel('Velg språk').locator('option').allTextContents()
    check('the language picker offers exactly the active languages', langs.join(',') === 'Norsk,English', langs.join(','))
    const body = await page.locator('body').innerText()
    check('the page does not claim inactive languages', !/svensk|dansk/i.test(body),
      /svensk|dansk/i.test(body) ? 'found a claim about sv/da' : 'no sv/da claim')

    // ---- sign-up ---------------------------------------------------------
    const email = `splash-${Date.now()}@nordiskstudio.test`
    await page.fill('input[name="name"]', 'Tuva Berg')
    await page.fill('input[name="company"]', 'Nordisk Studio AS')
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', 'et-langt-passord-1')
    await page.getByRole('button', { name: 'Opprett konto' }).click()
    await page.waitForTimeout(2500)
    check('signing up reports that the account is ready',
      (await page.locator('[role="status"]').first().innerText()).includes('Kontoen er klar'),
      await page.locator('[role="status"]').first().innerText())

    const { data: users } = await svc.auth.admin.listUsers({ perPage: 200 })
    const created = users?.users.find((u) => u.email === email)
    check('the account exists', Boolean(created), created ? created.id : 'not found')
    check('name and company ride on the user, not on a tenant table',
      created?.user_metadata?.company_name === 'Nordisk Studio AS',
      String(created?.user_metadata?.company_name))

    // ---- free-mail is refused, and the note says so ----------------------
    //
    // Every field is refilled, not just the address: React resets the form on
    // a successful action, and leaving the rest empty means the BROWSER blocks
    // the submit on `required` and the server never sees the address at all —
    // the check would then pass on the client-side guard while proving nothing
    // about the server's.
    // Back to being a visitor. Locally `enable_confirmations` is off, so the
    // sign-up above returned a session and set cookies; the middleware would
    // then bounce `/` to `/oversikt` and there would be no form to fill.
    await ctx.clearCookies()
    await page.reload({ waitUntil: 'networkidle' })
    await page.fill('input[name="name"]', 'Tuva Berg')
    await page.fill('input[name="company"]', 'Nordisk Studio AS')
    await page.fill('input[name="email"]', 'someone@gmail.com')
    await page.fill('input[name="password"]', 'et-langt-passord-1')
    await page.getByRole('button', { name: 'Opprett konto' }).click()
    await page.waitForTimeout(2500)
    const freemailNote = await page.locator('[role="alert"]').first().innerText()
    check('a free-mail address is refused, and told why',
      !freemailNote.includes('Kontoen er klar') && freemailNote.includes('jobben'), freemailNote)
    const { data: after } = await svc.auth.admin.listUsers({ perPage: 200 })
    check('and no account was created for it',
      !after?.users.some((u) => u.email === 'someone@gmail.com'), 'no gmail user')

    // ---- a paid plan's CTA files a real request --------------------------
    await ctx.clearCookies()
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Ta en prat med oss' }).first().click()
    await page.waitForTimeout(600)
    await page.fill('input[name="name"]', 'Tomas Ruud')
    await page.fill('input[name="company"]', 'Annen Bedrift AS')
    await page.fill('input[name="email"]', `demo-${Date.now()}@annenbedrift.test`)
    await page.getByRole('button', { name: 'Be om en gjennomgang' }).click()
    await page.waitForTimeout(2500)
    check('the demo request is acknowledged',
      (await page.locator('[role="status"]').first().innerText()).includes('Vi tar kontakt'),
      await page.locator('[role="status"]').first().innerText())

    const { count } = await svc.from('demo_requests').select('id', { count: 'exact', head: true })
    check('and it landed in demo_requests', (count ?? 0) > 0, `${count} row(s)`)

    // The table has no policy at all, so an anonymous reader sees nothing even
    // though an anonymous writer just wrote to it.
    const anonRead = await anonClient().from('demo_requests').select('id')
    check('but nobody can read it back through the API',
      (anonRead.data ?? []).length === 0, `anon sees ${(anonRead.data ?? []).length} row(s)`)

    check('no page errors', consoleErrors.length === 0, consoleErrors.join(' | ') || 'none')
    await ctx.close()
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nsplash verified' : `\n${failures} splash check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
