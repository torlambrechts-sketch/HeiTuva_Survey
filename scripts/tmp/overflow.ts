import { chromium } from '@playwright/test'
import { signIn, gotoRoute } from '../../tests/helpers/session'

const BASE = 'http://127.0.0.1:3100'

async function main() {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 320, height: 900 }, locale: 'nb-NO' })
  const page = await ctx.newPage()
  await signIn(page, 'administrator', BASE)
  await gotoRoute(page, '/undersokelser', 'administrator', BASE)
  await page.getByRole('link', { name: 'Se svar' }).first().click()
  await page.waitForURL((u) => u.pathname.endsWith('/resultater'))
  await page.waitForLoadState('load')

  const out = await page.evaluate(() => {
    const w = document.documentElement.clientWidth
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect()
      if (r.right > w + 0.5 || r.width > w + 0.5) {
        bad.push(
          `${el.tagName}.${el.className?.toString().slice(0, 70)} w=${Math.round(r.width)} right=${Math.round(r.right)} text="${(el.textContent ?? '').trim().slice(0, 40)}"`,
        )
      }
    }
    return { w, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 25) }
  })
  console.log(JSON.stringify(out, null, 2))
  await b.close()
}
main()
