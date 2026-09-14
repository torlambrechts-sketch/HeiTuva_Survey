/**
 * Q176 — count the boxes, rather than look at a screenshot and feel satisfied.
 *
 * «A double box» is a structural claim: a bordered container whose ancestor is
 * another bordered container on the same background. So that is what is
 * measured — nesting, not appearance — on the library's list view and on the
 * Arbeidsliste it is supposed to match.
 */
import { chromium, type ConsoleMessage, type Page } from '@playwright/test'
import { BASE_URL, ensureServer, serverLogTail } from '../verify/server'
import { signIn } from '../../tests/helpers/session'

/** Every bordered box inside <main>, with how many bordered boxes enclose it. */
async function boxes(page: Page) {
  // NO INNER NAMED FUNCTIONS: `tsx` compiles a const-assigned arrow with
  // esbuild's keepNames, which injects a `__name` helper that does not exist
  // inside page.evaluate — the first version failed with
  // «ReferenceError: __name is not defined». The border test is therefore
  // inlined into one loop rather than factored out.
  return page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return []
    const all = Array.from(main.querySelectorAll('*'))
    const borderedSet = new Set<Element>()
    for (const el of all) {
      const st = getComputedStyle(el)
      if (
        parseFloat(st.borderTopWidth) > 0 &&
        parseFloat(st.borderBottomWidth) > 0 &&
        parseFloat(st.borderLeftWidth) > 0 &&
        parseFloat(st.borderRightWidth) > 0 &&
        parseFloat(st.borderTopLeftRadius) >= 12
      ) {
        borderedSet.add(el)
      }
    }
    const rows: { tag: string; radius: string; w: number; depth: number; text: string }[] = []
    for (const el of borderedSet) {
      let depth = 0
      for (let q = el.parentElement; q && q !== main; q = q.parentElement) {
        if (borderedSet.has(q)) depth++
      }
      const r = el.getBoundingClientRect()
      rows.push({
        tag: el.tagName.toLowerCase(),
        radius: getComputedStyle(el).borderTopLeftRadius,
        w: Math.round(r.width),
        depth,
        text: (el.textContent ?? '').trim().slice(0, 34),
      })
    }
    return rows
  })
}

async function main() {
  const { stop } = await ensureServer()
  const browser = await chromium.launch()
  const errors: string[] = []
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    await signIn(page, 'administrator', BASE_URL)

    for (const [name, url] of [
      ['bibliotek · LISTE (the reported defect)', `${BASE_URL}/bibliotek?visning=liste`],
      ['bibliotek · KORT', `${BASE_URL}/bibliotek`],
      ['bibliotek · Spørsmålsbank', `${BASE_URL}/bibliotek?fane=bank`],
      ['HANDLINGER (the model)', `${BASE_URL}/oppgaver`],
    ] as const) {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      const found = await boxes(page)
      const nested = found.filter((b) => b.depth > 0)
      console.log(`\n── ${name} ──`)
      console.log(`   bordered boxes in <main> : ${found.length}`)
      console.log(`   NESTED (a box in a box)  : ${nested.length}`)
      for (const b of found) {
        console.log(
          `     depth=${b.depth}  ${String(b.w).padStart(4)}px  r=${b.radius.padEnd(5)}  ${b.text}`,
        )
      }
    }
    await ctx.close()
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
