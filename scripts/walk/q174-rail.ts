/**
 * Q174 — drive the category rail, rather than trust the ranking function.
 *
 * The split is unit-tested; what a unit test cannot say is whether the SHIPPED
 * counts put the right four on screen, whether the dropdown carries the rest,
 * and whether picking one out of it promotes that chip and filters the grid.
 */
import { chromium, type ConsoleMessage, type Page } from '@playwright/test'
import { BASE_URL, ensureServer, serverLogTail } from '../verify/server'
import { signIn } from '../../tests/helpers/session'

async function read(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  const card = page.locator('main .rounded-\\[20px\\]').first()
  /*
    **SCOPED TO THE RAIL CONTAINER, AND THE FIRST VERSION WAS NOT.** Every
    filter href preserves the current view, so `a[href*="kategori"]` also
    matched Kort and Liste — and the `aria-current` it reported was the view
    toggle's, which would have hidden the one thing this run exists to check:
    that a promoted category is actually LIT.
  */
  const rail = card.locator('.rounded-\\[11px\\].bg-sf2 a')
  const n = await rail.count()
  const chips: string[] = []
  let current = ''
  for (let i = 0; i < n; i++) {
    const text = ((await rail.nth(i).textContent()) ?? '').trim()
    chips.push(text)
    if ((await rail.nth(i).getAttribute('aria-current')) === 'page') current = text
  }
  const select = card.locator('select').first()
  const opts = (await select.count())
    ? await select.locator('option').evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''))
    : []
  // UNROUNDED. `verify:responsive` filters on the real hit box and prints a
  // rounded painted one, so «44» in a report can be 43.98 failing «< 44».
  const box = (await select.count()) ? await select.boundingBox() : null
  // `UsePackButton` is a <button>, not a link — the first version counted
  // anchors and reported 0 for a grid that was full.
  const cards = await card.getByRole('button', { name: 'Bruk mal' }).count()
  return { chips, current, opts, box, cards }
}

async function main() {
  const { stop } = await ensureServer()
  const browser = await chromium.launch()
  const errors: string[] = []
  try {
    for (const width of [1440, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      page.on('console', (m: ConsoleMessage) => {
        if (m.type() === 'error') errors.push(`[@${width}] ${m.text()}`)
      })
      page.on('pageerror', (e) => errors.push(`[@${width}] pageerror: ${e.message}`))
      await signIn(page, 'administrator', BASE_URL)

      for (const [name, url] of [
        ['default', `${BASE_URL}/bibliotek`],
        ['a rail category', `${BASE_URL}/bibliotek?kategori=Lovp%C3%A5lagt`],
        ['an OVERFLOW category', `${BASE_URL}/bibliotek?kategori=leverandor`],
      ] as const) {
        const r = await read(page, url)
        console.log(`\n── @${width} · ${name} ──`)
        console.log(`   rail        ${r.chips.join(' · ')}`)
        console.log(`   selected    ${r.current || '(none)'}`)
        console.log(`   dropdown    ${r.opts.join(' · ') || '(absent)'}`)
        console.log(`   select box  ${r.box ? `${r.box.width.toFixed(2)}x${r.box.height.toFixed(2)}` : '(none)'}`)
        console.log(`   pack cards  ${r.cards}`)
      }
      const doc = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }))
      console.log(`   document    scrollWidth=${doc.sw} clientWidth=${doc.cw} overflow=${Math.max(0, doc.sw - doc.cw)}`)
      await ctx.close()
    }
  } finally {
    await browser.close()
    stop()
  }
  console.log(`\nconsole/page errors: ${errors.length}`)
  for (const e of errors) console.log(`   ${e}`)
  const tail = serverLogTail()
  if (tail) console.log(tail)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
