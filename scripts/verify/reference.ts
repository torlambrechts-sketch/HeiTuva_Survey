/**
 * Captures the design prototype itself, screen by screen, so every later
 * comparison is against a rendered baseline rather than someone's reading of
 * the markup.
 *
 * The prototype is one page driven by internal JS state. We set that state
 * directly through the React fiber rather than clicking a guessed path — a
 * click sequence would silently capture the wrong screen the moment the
 * prototype's navigation changes, and some states (warnings, sent
 * confirmations) have no click path at all.
 *
 * Run once per design-bundle update; commit the PNGs.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Page } from '@playwright/test'
import { serveCdnFromCache } from './cdn-cache'

const DESIGN = 'design-reference/heituva-survey-app-design/project/HeiTuva.dc.html'
const OUT = 'artifacts/reference'
const WIDTH = 1440

/** Screens, keyed by the prototype's own `screen` state value. Extra state is
 *  merged in for screens that need a sub-tab or a specific condition. */
type Screen = { name: string; state: Record<string, unknown>; width?: number }

const SCREENS: Screen[] = [
  { name: 'oversikt', state: { screen: 'dash' } },
  { name: 'undersokelser', state: { screen: 'surveys' } },
  { name: 'dashboard', state: { screen: 'dashboard' } },
  { name: 'bibliotek', state: { screen: 'library' } },
  { name: 'bibliotek-bank', state: { screen: 'library', libTab: 'bank' } },
  { name: 'rapporter', state: { screen: 'reports' } },
  // Phase 5 built three states of this screen that had no rendered baseline,
  // so nothing could be compared against the design for them.
  { name: 'rapporter-standard', state: { screen: 'reports', repTab: 'standard' } },
  { name: 'rapporter-mine', state: { screen: 'reports', repTab: 'mine' } },
  { name: 'rapport-editor', state: { screen: 'reports', repEditing: true } },
  { name: 'rapport-editor-filter', state: { screen: 'reports', repEditing: true, repSide: 'filter' } },
  { name: 'rapport-editor-del', state: { screen: 'reports', repEditing: true, repSide: 'del' } },
  { name: 'builder', state: { screen: 'build' } },
  { name: 'send', state: { screen: 'send' } },
  { name: 'resultater', state: { screen: 'results' } },
  { name: 'profil', state: { screen: 'profile' } },
  { name: 'admin-firma', state: { screen: 'admin', adminTab: 'firma' } },
  { name: 'admin-brukere', state: { screen: 'admin', adminTab: 'brukere' } },
  { name: 'admin-grupper', state: { screen: 'admin', adminTab: 'grupper' } },
  { name: 'admin-personvern', state: { screen: 'admin', adminTab: 'personvern' } },
  { name: 'admin-valg', state: { screen: 'admin', adminTab: 'valg' } },
  // The respondent surface is mobile-first per CLAUDE.md, so capture it narrow.
  { name: 'respondent', state: { screen: 'respond' }, width: 390 },
  { name: 'respondent-takk', state: { screen: 'respond', thanked: true }, width: 390 },
  { name: 'wizard', state: { screen: 'dash', wizOpen: true } },
]

/** Reaches the prototype's logic instance through the React fiber and merges a
 *  state patch into it. Returns the resulting `screen` so the caller can prove
 *  the patch actually applied instead of capturing a stale screen. */
async function setPrototypeState(page: Page, patch: Record<string, unknown>) {
  return page.evaluate((p) => {
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
      if (!key) continue
      let fiber = (el as unknown as Record<string, { stateNode?: unknown; return?: unknown }>)[key]
      while (fiber) {
        const inst = fiber.stateNode as
          | { logic?: { state?: Record<string, unknown>; setState?: (p: unknown) => void } }
          | undefined
        if (inst?.logic?.setState && inst.logic.state) {
          inst.logic.setState(p)
          return { ok: true, screen: inst.logic.state['screen'] as string }
        }
        fiber = fiber.return as typeof fiber
      }
    }
    return { ok: false, screen: null }
  }, patch)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const url = pathToFileURL(resolve(DESIGN)).href
  const browser = await chromium.launch()
  let captured = 0
  let failed = 0
  const hashes = new Map<string, string>()

  try {
    for (const s of SCREENS) {
      const width = s.width ?? WIDTH
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        locale: 'nb-NO',
      })
      const page = await ctx.newPage()
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))

      try {
        await serveCdnFromCache(page)
        await page.goto(url, { waitUntil: 'domcontentloaded' })

        // Wait for hydration: until the fiber is reachable the page is still
        // showing literal {{ }} templates.
        await page.waitForFunction(
          () => {
            for (const el of Array.from(document.querySelectorAll('nav button'))) {
              if (el.textContent && !el.textContent.includes('{{')) return true
            }
            return false
          },
          { timeout: 30_000 },
        )

        const applied = await setPrototypeState(page, s.state)
        if (!applied.ok) throw new Error('could not reach the prototype logic instance')

        await page.waitForTimeout(400)
        await page.evaluate(() => document.fonts.ready)

        const file = `${OUT}/${s.name}.png`
        await page.screenshot({ path: file, fullPage: true })

        // A patch that changed nothing produces a byte-identical capture. That
        // is a silent failure — the baseline would look fine and be wrong.
        const hash = createHash('sha1').update(await readFile(file)).digest('hex')
        const clash = hashes.get(hash)
        if (clash) {
          failed++
          console.log(`  FAIL ${s.name}: identical to "${clash}" — state patch ${JSON.stringify(s.state)} had no effect`)
          continue
        }
        hashes.set(hash, s.name)
        captured++
        console.log(`  ok   ${s.name.padEnd(20)} ${width}px  screen=${applied.screen}`)
        if (errors.length) console.log(`       note: ${errors.length} page error(s): ${errors[0]?.slice(0, 90)}`)
      } catch (e) {
        failed++
        console.log(`  FAIL ${s.name}: ${e instanceof Error ? e.message : e}`)
      } finally {
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`\nreference: captured ${captured}, failed ${failed} -> ${OUT}/`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
