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
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { chromium, devices, type Browser, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { ROUTES, PENDING_ROUTES, isPendingRoute } from '../../tests/routes.manifest'
import { gotoRoute, signIn } from '../../tests/helpers/session'
import sourceMessages from '../../messages/no.json'

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
  untranslatedKeys: string[]
}

/**
 * Every `namespace.key` next-intl would render when a message is missing.
 *
 * A missing key is invisible to every other check: the page renders, nothing
 * logs, no request fails, and the harness calls it "ok" while the screen shows
 * `mfa.verifyTitle` where a heading should be. That is exactly what happened
 * after two namespaces were added to messages/*.json but never seeded.
 */
const MESSAGE_KEYS: string[] = Object.entries(
  sourceMessages as Record<string, Record<string, string>>,
).flatMap(([namespace, entries]) => Object.keys(entries).map((key) => `${namespace}.${key}`))

async function findUntranslatedKeys(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText).catch(() => '')
  return MESSAGE_KEYS.filter((k) => text.includes(k))
}

/**
 * Block until nothing on the page is still animating.
 *
 * Every app screen enters with the theme's .25s fade-and-rise, and a screenshot
 * taken inside it photographs a half-transparent page that is also still
 * growing — so the image is both washed out and cut off at the bottom. It looks
 * exactly like a rendering bug, which is worse than a flake that merely fails.
 *
 * `animations: 'disabled'` on the screenshot call is not enough on its own for
 * a full-page capture, which scrolls the page and can restart what it froze.
 * Waiting for `getAnimations()` to drain is the deterministic version, and it
 * costs nothing on a settled page.
 */
async function settleAnimations(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState === 'finished' || a.playState === 'idle'),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => {
      // An indefinite animation (a spinner) must not fail a capture; the
      // screenshot's own `animations: 'disabled'` handles that case.
    })
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1]
  const routes = only ? ROUTES.filter((r) => r.phase === only) : ROUTES

  // Re-seed before capturing, locally.
  //
  // Earlier verification steps write to the demo org on purpose — verify:send
  // sends the draft, the administration suite invites users — and the invariant
  // suites used to leave surveys behind. None of that shows up until a screen
  // reads ACROSS surveys, and then the Dashboard photographs fourteen fixture
  // surveys beside the two real ones. A capture has to start from the seed it
  // documents, and `dropOrg` can finally replace it (migration 20260904000002).
  if (process.argv.includes('--local')) {
    execFileSync('npx', ['tsx', 'scripts/seed-demo.ts', '--local'], { stdio: 'inherit' })
  }

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
            untranslatedKeys: [],
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
            // Each state signs in for itself, which costs up to one 30-second
            // TOTP window per administrator capture. Reusing a persona's
            // storageState across states was tried to avoid that; two runs then
            // stalled on a capture whose setup posts a server action, and the
            // cause was not established — plausibly a restored auth cookie the
            // server had already rotated. Not re-added without a diagnosis.
            if (spec.as !== 'anon') await signIn(page, spec.as, BASE_URL)
            // Not networkidle: Next prefetches every <Link> in the nav, so the
            // network never goes idle and every app route would time out.
            await gotoRoute(page, spec.route, spec.as, BASE_URL)
            if (state.setup) await state.setup(page)

            // Let fonts settle so text metrics are stable between runs.
            await page.evaluate(() => document.fonts.ready)
            await page.waitForTimeout(150)

            log.untranslatedKeys = await findUntranslatedKeys(page)

            const base = join(OUT, spec.phase, `${spec.label}.${state.name}.${project.name}`)
            await mkdir(dirname(base), { recursive: true })
            await settleAnimations(page)
            // `animations: 'disabled'` finishes CSS animations and freezes them at
            // their end state. Without it a screenshot can land inside the
            // theme's .25s entry fade and photograph a half-transparent page
            // that is also still growing — which is exactly what the first
            // Resultater capture caught, and it is a flake, not a finding.
            await page.screenshot({ path: `${base}.png`, fullPage: true, animations: 'disabled' })
            await writeFile(`${base}.log.json`, JSON.stringify(log, null, 2))

            const bad =
              log.consoleErrors.length +
              log.pageErrors.length +
              log.failedRequests.length +
              log.httpErrors.length +
              log.untranslatedKeys.length
            captured++
            if (bad) {
              failures++
              // Keep the evidence under a name a later clean run does not
              // overwrite. A failure whose log has been replaced by the next
              // green run cannot be diagnosed at all — which is exactly what
              // happened to one capture during Gate 7.
              await writeFile(`${base}.FAIL.log.json`, JSON.stringify({ ...log, url: page.url() }, null, 2))
              await page.screenshot({ path: `${base}.FAIL.png`, fullPage: true, animations: 'disabled' })
              console.log(`  FAIL ${spec.label}/${state.name}/${project.name} — ${bad} console/network problem(s)`)
              for (const e of [
                ...log.pageErrors,
                ...log.consoleErrors,
                ...log.untranslatedKeys.map((k) => `untranslated message key rendered: ${k}`),
              ].slice(0, 3)) {
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
            // A failure with no artifact cannot be diagnosed after the fact —
            // capture whatever the browser was actually looking at.
            try {
              const base = join(OUT, spec.phase, `${spec.label}.${state.name}.${project.name}.ERROR`)
              await mkdir(dirname(base), { recursive: true })
              await settleAnimations(page)
              await page.screenshot({ path: `${base}.png`, fullPage: true, animations: 'disabled' })
              await writeFile(
                `${base}.log.json`,
                JSON.stringify({ ...log, url: page.url(), error: String(e) }, null, 2),
              )
            } catch {
              /* the page may already be gone; the console line above still stands */
            }
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
