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

/**
 * TWO bundles, both rendered, both kept (DECISIONS Q18).
 *
 * `design-reference/` is the first handoff and remains the reference for
 * Phase 1–7 work AS BUILT: a fidelity question about a screen no v1 phase has
 * touched is answered against the bundle it was built from, not against a
 * later one that moved the frame under it.
 *
 * `design-reference-v1/` is the second handoff and is the TARGET for every
 * screen a v1 phase touches.
 *
 * So the renders are two sets side by side, named for what they are rather
 * than by which ran last. Overwriting the first set would have destroyed the
 * only evidence of what Phases 1–7 were built against.
 */
type Bundle = {
  key: string
  /** What this render set is FOR, printed in the run so the reader need not infer. */
  role: string
  design: string
  splash: string
  out: string
}

const BUNDLES: Bundle[] = [
  {
    key: 'legacy',
    role: 'first handoff — the baseline Phases 1–7 were built against',
    design: 'design-reference/heituva-survey-app-design/project/HeiTuva.dc.html',
    splash: 'design-reference/heituva-survey-app-design/project/HeiTuva Splash.dc.html',
    out: 'artifacts/reference',
  },
  {
    key: 'v1',
    role: 'second handoff — the target for every screen a v1 phase touches',
    design: 'design-reference-v1/heituva-survey-app-design/project/HeiTuva.dc.html',
    splash: 'design-reference-v1/heituva-survey-app-design/project/HeiTuva Splash.dc.html',
    out: 'artifacts/reference-v1',
  },
]

const WIDTH = 1440

/** Screens, keyed by the prototype's own `screen` state value. Extra state is
 *  merged in for screens that need a sub-tab or a specific condition. */
type Screen = {
  name: string
  state: Record<string, unknown>
  width?: number
  /** The splash is a SECOND prototype file in each bundle. It shares the
   *  DCLogic base and the fiber trick, but nothing else — its own state shape,
   *  its own copy object, and no `screen` key at all — so it is named per
   *  screen rather than assumed. Marked here, resolved per bundle below. */
  splash?: true
}

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

  // Phase 6's splash. Three states, because two of its controls change the
  // page rather than a detail: the billing toggle changes every price, and the
  // auth tab changes which form is on the page.
  { name: 'splash', state: {}, splash: true },
  { name: 'splash-priser-manedlig', state: { billing: 'mnd' }, splash: true },
  { name: 'splash-logg-inn', state: { mode: 'login' }, splash: true },
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

/**
 * Which bundles this run renders. Default: the v1 set only.
 *
 * The legacy set is FROZEN, and not by discipline: re-rendering it moved five
 * PNGs the first time this ran, with no design change behind them — a newer
 * Chromium paints them slightly differently. A baseline that drifts with the
 * browser build is a baseline that silently stops being the thing Phases 1-7
 * were judged against, which is the whole reason Q18 keeps it. So it is
 * regenerated only when someone asks for it by name:
 *
 *   npx tsx scripts/verify/reference.ts              v1 only (default)
 *   npx tsx scripts/verify/reference.ts --all        both
 *   npx tsx scripts/verify/reference.ts --bundle=legacy
 *
 * Either way both sets stay on disk, named, side by side.
 */
function selectedBundles(): Bundle[] {
  const args = process.argv.slice(2)
  if (args.includes('--all')) return BUNDLES
  const named = args.find((a) => a.startsWith('--bundle='))?.split('=')[1]
  if (named) {
    const hit = BUNDLES.filter((b) => b.key === named)
    if (!hit.length) throw new Error(`unknown bundle "${named}" — try ${BUNDLES.map((b) => b.key).join(' | ')}`)
    return hit
  }
  return BUNDLES.filter((b) => b.key === 'v1')
}

async function main() {
  const browser = await chromium.launch()
  let captured = 0
  let failed = 0
  const bundles = selectedBundles()
  const skipped = BUNDLES.filter((b) => !bundles.includes(b))
  for (const b of skipped) {
    console.log(`   (${b.key} not rendered this run — ${b.out}/ kept as committed; --all to regenerate)`)
  }

  try {
  for (const bundle of bundles) {
    await mkdir(bundle.out, { recursive: true })
    console.log(`\n== ${bundle.key} — ${bundle.role}\n   ${bundle.design}\n   -> ${bundle.out}/`)
    // Per bundle: two bundles rendering the same unchanged screen are not a
    // silent failure, but two SCREENS rendering identically within one bundle
    // still are.
    const hashes = new Map<string, string>()
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
        await page.goto(pathToFileURL(resolve(s.splash ? bundle.splash : bundle.design)).href, {
          waitUntil: 'domcontentloaded',
        })

        // Wait for hydration: until the fiber is reachable the page is still
        // showing literal {{ }} templates. The app bundle proves it through a
        // nav button; the splash has no `nav button`, so both files are checked
        // the same way instead — no `{{` left anywhere in the body.
        await page.waitForFunction(
          () => {
            const text = document.body.innerText
            return text.length > 0 && !text.includes('{{')
          },
          { timeout: 30_000 },
        )

        const applied = await setPrototypeState(page, s.state)
        if (!applied.ok) throw new Error('could not reach the prototype logic instance')

        await page.waitForTimeout(400)
        await page.evaluate(() => document.fonts.ready)

        const file = `${bundle.out}/${s.name}.png`
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
        console.log(`  ok   ${s.name.padEnd(22)} ${width}px  ${applied.screen ? `screen=${applied.screen}` : 'splash prototype (no screen state)'}`)
        if (errors.length) console.log(`       note: ${errors.length} page error(s): ${errors[0]?.slice(0, 90)}`)
      } catch (e) {
        failed++
        console.log(`  FAIL ${s.name}: ${e instanceof Error ? e.message : e}`)
      } finally {
        await ctx.close()
      }
    }
  }
  } finally {
    await browser.close()
  }

  console.log(
    `\nreference: captured ${captured}, failed ${failed} across ${bundles.length} bundle(s)` +
      `\n  ${BUNDLES.map((b) => `${b.out}/ = ${b.key}`).join('\n  ')}`,
  )
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
