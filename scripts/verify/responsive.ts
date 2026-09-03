/**
 * Rule-based mobile check for app routes (docs/RESPONSIVE.md § Verification bar).
 *
 * App screens have no mobile reference image — DECISIONS Q15 puts admin mobile
 * in v1 and RESPONSIVE.md supplies the patterns instead — so mobile is verified
 * against rules, not against a PNG. This measures the rules that can be
 * measured; "nothing clipped or overlapping" and "the named pattern was
 * applied" stay a human read of the screenshots the capture harness produces.
 *
 *   npm run verify:responsive
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { ROUTES } from '../../tests/routes.manifest'
import { gotoRoute, signIn } from '../../tests/helpers/session'

if (!process.argv.includes('--local')) config({ path: '.env.local' })

/** RESPONSIVE.md: reference viewport 390px, and the header must not overflow at
 *  320px either. */
const WIDTHS = [390, 320] as const
const MIN_TAP = 44

type Finding = { route: string; width: number; severity: 'blocker' | 'defect'; detail: string }

async function overflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

/** Interactive controls below the 44px tap target rule. Elements that are not
 *  rendered at all are skipped — a control inside a closed panel is not a
 *  violation, it is a control you have not opened yet. */
async function smallTapTargets(page: Page) {
  return page.evaluate((min) => {
    const sel = 'a[href], button, select, input:not([type="hidden"]), [role="switch"]'
    const out: { label: string; w: number; h: number }[] = []
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (r.width >= min && r.height >= min) continue
      const label =
        el.getAttribute('aria-label') ||
        (el.textContent ?? '').trim().slice(0, 40) ||
        `<${el.tagName.toLowerCase()}>`
      out.push({ label, w: Math.round(r.width), h: Math.round(r.height) })
    }
    return out
  }, MIN_TAP)
}

/** RESPONSIVE.md rule 3: tokens never change across breakpoints. Read them off
 *  the live page rather than trusting the stylesheet. */
async function tokens(page: Page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    const names = ['--bg', '--sf', '--sf2', '--ink', '--mut', '--line', '--ac', '--ac2', '--ac3', '--sbg']
    return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n).trim()]))
  })
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const findings: Finding[] = []
  let desktopTokens: Record<string, string> | null = null

  try {
    // Baseline the tokens once at desktop so mobile can be compared to them.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
      const page = await ctx.newPage()
      await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
      desktopTokens = await tokens(page)
      await ctx.close()
    }

    for (const width of WIDTHS) {
      for (const spec of ROUTES) {
        // One capture per route; the manifest's extra states are the capture
        // harness's job, this is about layout.
        if (spec.states[0]?.name !== 'default') continue

        const ctx = await browser.newContext({
          viewport: { width, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          locale: 'nb-NO',
        })
        const page = await ctx.newPage()
        try {
          if (spec.as !== 'anon') await signIn(page, spec.as, BASE_URL)
          await gotoRoute(page, spec.route, spec.as, BASE_URL)
          await page.evaluate(() => document.fonts.ready)

          const { scrollWidth, clientWidth } = await overflow(page)
          if (scrollWidth > clientWidth) {
            findings.push({
              route: spec.label,
              width,
              severity: 'blocker',
              detail: `horizontal scroll: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
            })
          }

          const small = await smallTapTargets(page)
          for (const t of small) {
            findings.push({
              route: spec.label,
              width,
              severity: 'defect',
              detail: `tap target ${t.w}x${t.h} (<${MIN_TAP}): ${t.label}`,
            })
          }

          const mobileTokens = await tokens(page)
          for (const [name, value] of Object.entries(mobileTokens)) {
            if (desktopTokens![name] !== value) {
              findings.push({
                route: spec.label,
                width,
                severity: 'defect',
                detail: `token ${name} is "${value}" at ${width}px but "${desktopTokens![name]}" at desktop`,
              })
            }
          }

          const status = scrollWidth > clientWidth ? 'OVERFLOW' : 'ok'
          console.log(
            `  ${status.padEnd(8)} ${spec.label.padEnd(26)} ${width}px  scrollWidth=${scrollWidth}  small-targets=${small.length}`,
          )
        } catch (e) {
          findings.push({
            route: spec.label,
            width,
            severity: 'blocker',
            detail: `could not be measured: ${e instanceof Error ? e.message : e}`,
          })
          console.log(`  ERROR    ${spec.label} ${width}px: ${e instanceof Error ? e.message : e}`)
        } finally {
          await ctx.close()
        }
      }
    }
  } finally {
    await browser.close()
    server.stop()
  }

  const blockers = findings.filter((f) => f.severity === 'blocker')
  console.log(`\n${findings.length} finding(s), ${blockers.length} blocker(s)`)
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.route} @${f.width}px — ${f.detail}`)
  }
  process.exit(blockers.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
