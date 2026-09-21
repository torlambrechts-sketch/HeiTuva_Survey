/**
 * N4 — CAN A PERSON GET THERE BY CLICKING?
 *
 * Every other browser gate in this repository begins with `page.goto(route)`.
 * That is the right start for measuring a screen, and it is why not one of them
 * can see an ORPHAN: a route with no link to it anywhere renders perfectly,
 * passes `verify:responsive`, passes `verify:i18n`, passes `verify:browser`,
 * and cannot be reached by any human who is not typing URLs.
 *
 * N1 made that a live risk rather than a theoretical one. The nav went from
 * five items to v8's three; Oversikt, Dashboard, Rapporter and Bibliotek stopped
 * being top-level and now depend entirely on a subnav rail. **A screen whose
 * only way in is one pill is one edit away from being unreachable**, and every
 * existing gate would stay green through that edit.
 *
 * ── WHAT IT MEASURES, AND WHY `goto` IS STILL IN HERE ──────────────────────
 *
 * It builds the app's LINK GRAPH by rendering pages and harvesting the
 * destinations the DOM actually offers, then asks whether every manifest route
 * is in the component reachable from the front page. An edge exists only when a
 * rendered page OFFERED it; `page.goto` is the transport to a URL already
 * proven to be offered, never itself an edge. So the property proven is «a
 * chain of real controls leads here from /oversikt», which is the orphan
 * question, and following an edge by URL rather than by a literal click costs
 * nothing except the click's own flakiness.
 *
 * TWO KINDS OF CONTROL ARE HARVESTED, BECAUSE ONE OF THEM IS NOT AN `<a>`.
 * v8's «Flere oppsett» is a native `<select>` whose options carry paths and
 * whose handler is `router.push` (N3, v8:238-241). A crawler that looked only
 * at anchors would report every overflow dashboard as an orphan — the defect
 * would be in the CRAWLER, and it would read as a finding about the product.
 * The same applies to any `<option value="/...">` we add later.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────
 *
 * NOT one of VERIFY.md's seven gates and NOT in `verify:all`. The apparatus is
 * frozen; this is a check that runs beside it, on demand, like
 * `verify:capability` and `verify:predeploy`. It is run when the shell's
 * navigation changes — which is exactly when an orphan is created.
 *
 * Usage:  npm run verify:reachable
 *         npm run verify:reachable -- --depth=6
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, ensureServer } from './server'
import { signIn } from '../../tests/helpers/session'
import { ROUTES, isPendingRoute } from '../../tests/routes.manifest'
import { BUILD_GROUPS, BUILD_TAB_PARAM } from '../../lib/surveys/build-tabs'

config({ path: '.env.local', quiet: true })

const OUT = 'artifacts/reachable'
const DEPTH = Number(
  process.argv.find((a) => a.startsWith('--depth='))?.slice('--depth='.length) ?? 5,
)
/**
 * How many INSTANCES of one route shape to expand — see `shapeOf`.
 *
 * Not one, and the reason is a finding this check produced about itself on its
 * second run. It reported `/undersokelser/[id]/live` as an orphan. It is not:
 * `SurveyContextBar.tsx:110` links to it, **behind `liveMode`**, so only a
 * survey whose `run_mode` is live offers the link. Expanding a single instance
 * of the shape meant the crawl saw one survey, and that survey was not a live
 * one — the crawler's own narrowing, reported as a fact about the product.
 *
 * A SAMPLE, STATED AS A SAMPLE. Three instances is not a proof that every
 * state-dependent link is found; a control that renders for one row in twenty
 * can still be missed, and this check will call it an orphan when it is not.
 * That limit is written here rather than left for the next reader to rediscover
 * from a false finding — which is how it was discovered this time.
 */
const PER_SHAPE = Number(
  process.argv.find((a) => a.startsWith('--per-shape='))?.slice('--per-shape='.length) ?? 3,
)

/** The front page of the signed-in product — where the logo goes, and where
 *  `signIn` lands. Everything must be reachable from here. */
const FRONT = '/oversikt'

/**
 * ── THE POPULATION, AND WHY IT IS TWO ─────────────────────────────────────
 *
 * The instruction said «every manifest route». Measured, `tests/routes.manifest.ts`
 * holds 49 specs over 28 unique routes, and **not one of them is a survey
 * sub-route**: `/undersokelser/[id]/bygg`, `/send`, `/resultater`, `/live` and
 * the seven sub-tabs are reached there through a STATE that clicks into them,
 * never as entries of their own.
 *
 * Those are precisely the screens N1 put at risk. So the manifest is checked
 * because it was asked for, and the FILESYSTEM is checked because it is the
 * population the question is actually about — «a derivation is only as wide as
 * the set it iterates», and the manifest's set is 28 where the app's is larger.
 *
 * The filesystem scope is DERIVED rather than listed: every `page.tsx` under
 * `app/(app)`, which is the signed-in route group. That is the same sweep
 * `tests/unit/subnav.test.ts` uses and it needs no exclusion list — the splash,
 * the login page, the legal pages and the token surfaces live outside that
 * group by construction, which is the property, not a set of names somebody
 * remembered.
 */
function appRouteShapes(): string[] {
  const out: string[] = []
  const walk = (dir: string, url: string) => {
    if (existsSync(join(dir, 'page.tsx'))) out.push(url === '' ? '/' : url)
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      // Route groups `(app)` contribute no segment.
      const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`
      walk(join(dir, e.name), url + seg)
    }
  }
  walk('app/(app)', '')
  return [...new Set(out)].sort()
}

/**
 * A manifest route reduced to what the crawler can compare against.
 *
 * Dynamic segments are the reason this is not string equality: the manifest
 * says `/undersokelser/[id]/send` and the DOM says
 * `/undersokelser/<uuid>/send`. A route is «covered» when some harvested path
 * matches its pattern — one real survey standing in for the shape, which is
 * what the manifest itself means by that entry.
 */
function patternOf(route: string): RegExp {
  const body = route
    .split('/')
    .map((seg) =>
      seg.startsWith('[') && seg.endsWith(']')
        ? '[^/]+'
        : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/')
  return new RegExp(`^${body}$`)
}

/**
 * A path reduced to its ROUTE SHAPE — `/undersokelser/<uuid>/send` ->
 * `/undersokelser/[id]/send`.
 *
 * WHY THE CRAWL RENDERS ONE INSTANCE PER SHAPE AND NOT ONE PER PATH. The demo
 * organisation has ten surveys and each has eight sub-tabs, so expanding every
 * instance is eighty page loads that answer one question eight times. The
 * question is «is this ROUTE reachable», which the manifest also asks by shape
 * — `/undersokelser/[id]/send` is one entry there, not ten.
 *
 * The distinction that keeps this honest: only EXPANSION is collapsed. Every
 * offered path is still recorded, so coverage is decided over what the product
 * actually linked to, and a second survey's links are not needed to prove the
 * first survey's sub-tab is reachable.
 */
function shapeOf(path: string): string {
  return path
    .split('/')
    .map((seg) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ||
      /^\d+$/.test(seg)
        ? '[id]'
        : seg,
    )
    .join('/')
}

/** In-app paths only. An external link, a mailto, an anchor or a download is
 *  not an edge in this graph. */
function normalise(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  const path = raw.split('#')[0]!.split('?')[0]!
  return path === '' ? '/' : path
}

/**
 * T5.1 — EVERY OFFERED HREF, QUERY STRING AND ALL.
 *
 * `normalise` throws the query away, and it must: the route graph is about
 * PAGES, and keeping `?filter=` would make every filter chip a separate node
 * and the crawl would never terminate. But the builder's six tabs moved into
 * the shell rail in T5.1, and the rail's pills are `?fane=` links on ONE
 * route — so «is /undersokelser/[id]/bygg reachable» is now a question that
 * four of the six tabs can be invisible behind while it answers yes.
 *
 * That is this file's own recorded shape, one level in: a derivation is only
 * as wide as the set it iterates, and the set here had been PAGES. So the raw
 * hrefs are kept beside the normalised ones and checked against the tab
 * registry at the end — the population is `BUILD_GROUPS`, derived, not a list
 * of four strings somebody typed here.
 */
const QUERIED = new Set<string>()

/** Every destination this rendered page OFFERS — anchors and select options
 *  alike, because a control that navigates is an edge whatever its tag. */
async function destinationsOf(page: Page): Promise<string[]> {
  /* ── OPEN WHAT IS CLOSED, FIRST ──────────────────────────────────────────
   *
   * A link inside a closed menu is NOT IN THE DOM. `RowMenu` renders its items
   * under `{open ? … }`, so `/undersokelser/[id]/test` — reachable by two
   * clicks, which is what this check claims to measure — was invisible to a
   * plain anchor harvest and reported as an orphan on the second run.
   *
   * The controls are found by a PROPERTY, not by a list of components:
   * `aria-expanded="false"` is what a disclosure says about itself, and
   * `<details>` is the same idea in markup. A registry of «components that hide
   * links» would be an enumeration, and the next one would not be in it.
   *
   * Clicking can navigate — a control that is both a link and a disclosure —
   * so the URL is checked afterwards and the harvest is abandoned rather than
   * silently taken from a different page. */
  const before = page.url()
  for (const el of await page.locator('[aria-expanded="false"]').all()) {
    try {
      await el.click({ timeout: 1500 })
    } catch {
      /* Not clickable, covered, or it detached when a sibling opened. A
         disclosure this crawl cannot open is a link it cannot see, which is
         reported as an orphan — a false one is better than a silent pass, and
         `via` in the graph is what tells the reader which. */
    }
    if (page.url() !== before) return []
  }
  for (const el of await page.locator('details:not([open]) > summary').all()) {
    try {
      await el.click({ timeout: 1500 })
    } catch {
      /* as above */
    }
    if (page.url() !== before) return []
  }

  const raw = await page.evaluate(() => {
    const out: string[] = []
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      out.push(a.getAttribute('href') ?? '')
    }
    // N3's «Flere oppsett» and anything shaped like it: an option whose value
    // is a path is a navigation the handler performs.
    for (const o of Array.from(document.querySelectorAll('option[value]'))) {
      out.push(o.getAttribute('value') ?? '')
    }
    return out
  })
  const seen = new Set<string>()
  for (const r of raw) {
    if (r.startsWith('/') && !r.startsWith('//')) QUERIED.add(r.split('#')[0]!)
    const p = normalise(r)
    if (p) seen.add(p)
  }
  return [...seen]
}

async function main() {
  await ensureServer()
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  /* Administrator, deliberately: it is the role that can SEE the most, so a
     route unreachable here is unreachable for everybody. A leser crawl would
     report role-gated screens as orphans, which is a different question and a
     true answer to it — worth its own run, not worth conflating with this. */
  await signIn(page, 'administrator', BASE_URL)

  const downloads: string[] = []
  const visited = new Set<string>()
  /** Route SHAPE -> how many instances of it have been rendered. */
  const expanded = new Map<string, number>()
  const offered = new Set<string>([FRONT])
  /** path -> the page that offered it, for the report. An orphan is only
   *  actionable with the answer to «what SHOULD have linked here». */
  const via = new Map<string, string>([[FRONT, '(front page)']])
  let frontier = [FRONT]

  for (let depth = 0; depth < DEPTH && frontier.length; depth++) {
    const next: string[] = []
    for (const path of frontier) {
      if (visited.has(path)) continue
      const shape = shapeOf(path)
      if ((expanded.get(shape) ?? 0) >= PER_SHAPE) continue
      visited.add(path)
      expanded.set(shape, (expanded.get(shape) ?? 0) + 1)
      /* A pending route is not built, so it cannot offer edges. Visiting it
         would be the crawler generating its own 404s. */
      if (isPendingRoute(path)) continue
      try {
        const res = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
        /* «A gate that never reads the status code scores a 500 as a pass» —
           and here it would be worse than a pass: a dead page offers no links,
           so every screen behind it would be reported as an orphan and the
           cause would be invisible. Read it. */
        const status = res?.status() ?? 0
        if (status >= 400) {
          console.log(`  HTTP ${status}  ${path}  (offers nothing — via ${via.get(path)})`)
          continue
        }
        await page.waitForLoadState('load')
      } catch (e) {
        const msg = (e as Error).message.split('\n')[0] ?? ''
        /* A DOWNLOAD IS NOT A PAGE, and calling it «unreachable» would be the
           crawler reporting its own category error as a finding about the
           product. `/undersokelser/<id>/resultater/csv` is an export: Playwright
           refuses to navigate to it and says so in those words. It is an edge
           that leads OUT of the page graph, so it is recorded and not expanded.
           Classified from what the browser said, rather than from a list of
           paths that end in `/csv`. */
        if (msg.includes('Download is starting')) {
          downloads.push(path)
          continue
        }
        console.log(`  unreachable  ${path}: ${msg}`)
        continue
      }
      for (const dest of await destinationsOf(page)) {
        if (!offered.has(dest)) {
          offered.add(dest)
          via.set(dest, path)
          next.push(dest)
        }
      }
    }
    frontier = next
  }

  /* ── The verdict ────────────────────────────────────────────────────────
     Stated over the MANIFEST rather than over what was found: «which routes
     did the crawl reach» is a fact about the crawl, and the question is which
     routes a person can get to. A manifest entry with no matching offered path
     is an orphan whatever the crawl's shape. */
  const offeredShapes = new Set([...offered].map(shapeOf))
  const covers = (route: string) => {
    const re = patternOf(route)
    return [...offeredShapes].some((p) => re.test(p)) || [...offered].some((p) => re.test(p))
  }

  /* DEDUPED BY ROUTE. The manifest holds 49 specs over 28 routes — several
     screens are captured as more than one persona — and counting specs would
     report `/undersokelser` thirteen times. The question is about routes. */
  const anon = new Set(ROUTES.filter((r) => r.as === 'anon').map((r) => r.route))
  const manifestRoutes = [...new Set(ROUTES.map((r) => r.route))].sort()
  const inScope = manifestRoutes.filter((r) => !anon.has(r) && !isPendingRoute(r))
  const manifestOrphans = inScope.filter((r) => !covers(r))

  /* The second population, and the one the question is actually about. */
  const appRoutes = appRouteShapes()
  const appOrphans = appRoutes.filter((r) => !covers(r))

  /* T5.1 — THE BUILDER'S TABS, which live in a query parameter rather than in
     a path. Derived from `BUILD_GROUPS` so a seventh tab is checked by
     existing, and reported as its own line rather than folded into `orphans`:
     an unreachable TAB is not an unreachable route, and calling it one would
     misname the fix. */
  const tabTargets = BUILD_GROUPS.map((g) => `${BUILD_TAB_PARAM}=${g.target}`)
  const unreachableTabs = tabTargets.filter(
    (q) => ![...QUERIED].some((h) => h.includes('/bygg?') && h.includes(q)),
  )

  const orphans = [...new Set([...manifestOrphans, ...appOrphans])].sort()

  console.log(`\nfront page       ${FRONT}`)
  console.log(`depth            ${DEPTH}`)
  console.log(`pages rendered   ${visited.size} (up to ${PER_SHAPE} per route shape)`)
  console.log(`paths offered    ${offered.size} over ${offeredShapes.size} shapes`)
  if (downloads.length) console.log(`downloads        ${downloads.length} (edges out of the page graph)`)
  console.log(
    `manifest routes  ${inScope.length} in scope of ${manifestRoutes.length}` +
      ` (${anon.size} signed-out, excluded by construction)`,
  )
  console.log(`  reachable      ${inScope.length - manifestOrphans.length}`)
  console.log(`app/(app)        ${appRoutes.length} route shapes swept off the filesystem`)
  console.log(`  reachable      ${appRoutes.length - appOrphans.length}`)
  console.log(
    `builder tabs     ${tabTargets.length - unreachableTabs.length} of ${tabTargets.length} offered as rail links`,
  )
  for (const q of unreachableTabs) console.log(`  no rail link  /bygg?${q}`)
  console.log(`\nORPHANED         ${orphans.length}`)
  for (const o of orphans) {
    const where = manifestOrphans.includes(o) && appOrphans.includes(o) ? 'both' :
      manifestOrphans.includes(o) ? 'manifest' : 'app/(app)'
    console.log(`  orphan  ${o}  [${where}]`)
  }

  await writeFile(
    `${OUT}/graph.json`,
    JSON.stringify(
      {
        front: FRONT,
        depth: DEPTH,
        rendered: [...visited].sort(),
        offered: [...offered].sort(),
        downloads: downloads.sort(),
        via: Object.fromEntries([...via].sort()),
        manifestRoutes: inScope,
        appRoutes,
        orphans,
        unreachableTabs,
      },
      null,
      2,
    ),
  )
  console.log(`\nwrote ${OUT}/graph.json`)

  await browser.close()
  process.exit(orphans.length || unreachableTabs.length ? 1 : 0)
}

main()
