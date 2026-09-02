/**
 * Browser verification pass.
 *
 * For every route and state in tests/routes.manifest.ts, captures a full-page
 * PNG per viewport and records console output plus failed network requests.
 *
 * The log is the point as much as the picture: a screen that looks right while
 * throwing a hydration error or 404-ing a request is not done, and a reviewer
 * reading a PNG alone cannot see that.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { chromium, devices, type Browser, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { ROUTES, PENDING_ROUTES, isPendingRoute, type RouteSpec } from '../../tests/routes.manifest'
import { DEMO_PASSWORD, PERSONAS } from '../../tests/db/personas'

if (!process.argv.includes('--local')) config({ path: '.env.local' })

const OUT = 'artifacts'
const PROJECTS = [
  { name: 'desktop' as const, viewport: { width: 1440, height: 900 }, scale: 2, ua: undefined },
  { name: 'mobile' as const, ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
]

type LogEntry = {
  route: string
  state: string
  project: string
  consoleErrors: string[]
  consoleWarnings: string[]
  consoleAll: { type: string; text: string }[]
  pageErrors: string[]
  failedRequests: { url: string; failure: string }[]
  httpErrors: { url: string; status: number }[]
  pendingRoutePrefetches: string[]
}

async function signIn(page: Page, persona: Exclude<RouteSpec['as'], 'anon'>) {
  await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[name="email"]')
  await page.fill('input[name="email"]', PERSONAS[persona].email)
  await page.fill('input[name="password"]', DEMO_PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/logg-inn'), { timeout: 20_000 }),
    page.getByRole('button', { name: /^Logg inn$/ }).click(),
  ])
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1]
  const routes = only ? ROUTES.filter((r) => r.phase === only) : ROUTES

  const server = await ensureServer()
  const browser: Browser = await chromium.launch()
  let failures = 0
  let captured = 0

  try {
    for (const project of PROJECTS) {
      for (const spec of routes) {
        for (const state of spec.states) {
          if (state.projects && !state.projects.includes(project.name)) continue

          const ctx = await browser.newContext({
            viewport: project.viewport,
            deviceScaleFactor: project.name === 'desktop' ? 2 : undefined,
            locale: 'nb-NO',
            timezoneId: 'Europe/Oslo',
          })
          const page = await ctx.newPage()

          const log: LogEntry = {
            route: spec.route,
            state: state.name,
            project: project.name,
            consoleErrors: [],
            consoleWarnings: [],
            consoleAll: [],
            pageErrors: [],
            failedRequests: [],
            httpErrors: [],
            pendingRoutePrefetches: [],
          }

          page.on('console', (m) => {
            log.consoleAll.push({ type: m.type(), text: m.text() })

            // Chromium logs its own "Failed to load resource" line for the
            // prefetch 404s classified below. Attribute it to the same pending
            // route rather than counting the one problem twice.
            const src = m.location()?.url ?? ''
            if (src) {
              try {
                if (isPendingRoute(new URL(src).pathname)) return
              } catch {
                /* not a URL we can parse — fall through and record it */
              }
            }

            if (m.type() === 'error') log.consoleErrors.push(m.text())
            if (m.type() === 'warning') log.consoleWarnings.push(m.text())
          })
          page.on('pageerror', (e) => log.pageErrors.push(e.message))
          page.on('requestfailed', (r) => {
            const failure = r.failure()?.errorText ?? 'unknown'
            // Next cancels its own in-flight RSC prefetches when navigation
            // supersedes them. An aborted request is the router working, not a
            // broken one — anything else still counts.
            if (failure === 'net::ERR_ABORTED') return
            log.failedRequests.push({ url: r.url(), failure })
          })
          page.on('response', (r) => {
            if (r.status() < 400) return
            const path = new URL(r.url()).pathname
            // Next prefetches every <Link>; a route a later phase will build
            // 404s until then. Record it as pending, not as a failure.
            if (r.status() === 404 && isPendingRoute(path)) {
              if (!log.pendingRoutePrefetches.includes(path)) log.pendingRoutePrefetches.push(path)
              return
            }
            log.httpErrors.push({ url: r.url(), status: r.status() })
          })

          try {
            if (spec.as !== 'anon') await signIn(page, spec.as)
            // Not networkidle: Next prefetches every <Link> in the nav, so the
            // network never goes idle and every app route would time out.
            await page.goto(`${BASE_URL}${spec.route}`, { waitUntil: 'domcontentloaded' })
            await page.waitForLoadState('load')
            if (state.setup) await state.setup(page)

            // Let fonts settle so text metrics are stable between runs.
            await page.evaluate(() => document.fonts.ready)
            await page.waitForTimeout(150)

            const base = join(OUT, spec.phase, `${spec.label}.${state.name}.${project.name}`)
            await mkdir(dirname(base), { recursive: true })
            await page.screenshot({ path: `${base}.png`, fullPage: true })
            await writeFile(`${base}.log.json`, JSON.stringify(log, null, 2))

            const bad =
              log.consoleErrors.length +
              log.pageErrors.length +
              log.failedRequests.length +
              log.httpErrors.length
            captured++
            if (bad) {
              failures++
              console.log(`  FAIL ${spec.label}/${state.name}/${project.name} — ${bad} console/network problem(s)`)
              for (const e of [...log.pageErrors, ...log.consoleErrors].slice(0, 3)) {
                console.log(`       ${e.slice(0, 160)}`)
              }
            } else {
              const pending = log.pendingRoutePrefetches.length
              console.log(
                `  ok   ${spec.label}/${state.name}/${project.name}` +
                  (pending ? `  (${pending} pending-route prefetch${pending > 1 ? 'es' : ''})` : ''),
              )
            }
          } catch (e) {
            failures++
            console.log(`  ERROR ${spec.label}/${state.name}/${project.name}: ${e instanceof Error ? e.message : e}`)
          } finally {
            await ctx.close()
          }
        }
      }
    }
  } finally {
    await browser.close()
    server.stop()
  }

  if (PENDING_ROUTES.length) {
    console.log('\n  pending (declared, not yet built):')
    for (const p of PENDING_ROUTES) console.log(`    ${p.route.padEnd(22)} ${p.phase}  ${p.note}`)
  }

  console.log(`\ncaptured ${captured}, failed ${failures} -> ${OUT}/`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
