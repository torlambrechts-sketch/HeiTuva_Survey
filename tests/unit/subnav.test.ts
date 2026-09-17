import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUBNAV, railFaults, resolveSubnav, type SubnavRail } from '../../lib/shell/subnav'

/**
 * V7-1 — THE SUBNAV AS ONE REGISTRY.
 *
 * Every property here is stated over the WHOLE registry and driven from routes
 * swept off the filesystem, never over the entries or the screens somebody
 * remembered. That is the difference between this file and the five `if`
 * branches it replaces: a sixth entry is covered by these tests the moment it
 * exists, and a seventh screen with no rail is covered too.
 */

const ID = '11111111-2222-4333-8444-555555555555'
const src = readFileSync('lib/shell/subnav.ts', 'utf8')
const component = readFileSync('components/AppSubnav.tsx', 'utf8')
/** Code with comments stripped. A file that documents its own refusals contains
 *  the words it refuses — and this registry's comments name every pill it does
 *  NOT draw. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

/** Every route under `app/(app)`, as a pathname, `[id]` filled in. Swept rather
 *  than listed: «a derivation is only as wide as the set it iterates». */
function appRoutes(): string[] {
  const out: string[] = []
  const walk = (dir: string, url: string) => {
    if (existsSync(join(dir, 'page.tsx'))) out.push(url === '' ? '/' : url)
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      // Route groups `(app)` contribute no segment.
      const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name.replace(/^\[.*\]$/, ID)}`
      walk(join(dir, e.name), url + seg)
    }
  }
  walk('app/(app)', '')
  return out.sort()
}

const ROUTES = appRoutes()
const rails = (p: string, q = ''): SubnavRail | null => resolveSubnav(p, new URLSearchParams(q))

const MESSAGES = Object.fromEntries(
  (['no', 'en'] as const).map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')) as Record<
      string,
      Record<string, string>
    >,
  ]),
)

describe('V7-1 — the subnav registry', () => {
  it('1. the sweep found the app — a zero here is the finding, not a pass', () => {
    // «A zero on a page that cannot be empty is a finding.» The same reading
    // applies to a derivation: an empty route list would make every property
    // below vacuously true.
    expect(ROUTES.length).toBeGreaterThan(20)
    expect(ROUTES).toContain('/dashboard')
    expect(ROUTES).toContain(`/undersokelser/${ID}/sporsmal`)
  })

  it('2. no pathname matches two entries', () => {
    const clashes: string[] = []
    for (const p of ROUTES) {
      const hit = SUBNAV.filter((e) => e.match(p)).map((e) => e.key)
      if (hit.length > 1) clashes.push(`${p} -> ${hit.join(' + ')}`)
    }
    expect(clashes, `ambiguous: ${clashes.join('; ')}`).toEqual([])
  })

  it('3. every rail the registry returns is SOUND — no duplicate id, no current that is an exit', () => {
    const faults: string[] = []
    for (const p of ROUTES) {
      const r = rails(p)
      if (r) for (const f of railFaults(r)) faults.push(`${p}: ${f}`)
    }
    // And the parameterised shapes, which a bare pathname never reaches.
    for (const [p, q] of [
      ['/rapporter', 'fane=mine'],
      ['/rapporter', 'fane=standard'],
      ['/rapporter', 'fane=vrøvl'],
      ['/undersokelser', 'filter=lukket&sok=abc&sorter=tittel'],
      ['/undersokelser', 'filter=finnesikke'],
      ['/oppgaver', 'type=tilbakemeldinger'],
      ['/oppgaver', 'type=vrøvl'],
      ['/bibliotek', 'fane=bank'],
      ['/bibliotek', 'fane=vrøvl'],
    ] as const) {
      const r = rails(p, q)
      if (r) for (const f of railFaults(r)) faults.push(`${p}?${q}: ${f}`)
    }
    expect(faults, faults.join('; ')).toEqual([])
  })

  it('4. railFaults actually FIRES — proven, not trusted', () => {
    // A guard that cannot fail is a declaration wearing a guard's clothes.
    expect(
      railFaults({
        label: { ns: 'nav', key: 'x' },
        pills: [
          { id: 'a', label: { ns: 'nav', key: 'x' }, href: '/a', kind: 'filter' },
          { id: 'a', label: { ns: 'nav', key: 'x' }, href: '/b', kind: 'filter' },
        ],
        currentId: null,
      }),
    ).toHaveLength(1)
    expect(
      railFaults({
        label: { ns: 'nav', key: 'x' },
        pills: [{ id: 'e', label: { ns: 'nav', key: 'x' }, href: '/e', kind: 'exit' }],
        currentId: 'e',
      })[0],
    ).toMatch(/is an exit/)
    expect(
      railFaults({
        label: { ns: 'nav', key: 'x' },
        pills: [],
        currentId: 'ghost',
      })[0],
    ).toMatch(/names no pill/)
  })

  it('5. every label resolves in ITS OWN namespace, in both languages', () => {
    /* A key without its namespace is not a message: one resolved in the wrong
       namespace renders as a RAW KEY on a shipped screen, which is the defect
       Tor found nine of behind seventeen green gates. The rails draw from three
       namespaces, so this has to check the pair and not the key. */
    const missing: string[] = []
    const seen = new Set<string>()
    for (const p of [...ROUTES, '/rapporter', '/oppgaver', '/bibliotek']) {
      const r = rails(p)
      if (!r) continue
      for (const m of [r.label, ...r.pills.map((x) => x.label)]) {
        const id = `${m.ns}.${m.key}`
        if (seen.has(id)) continue
        seen.add(id)
        for (const lang of ['no', 'en'] as const) {
          const v = MESSAGES[lang]?.[m.ns]?.[m.key]
          if (!v) missing.push(`${lang}.${id}`)
        }
      }
    }
    expect(missing, `unresolvable: ${missing.join(', ')}`).toEqual([])
    // The floor: a derivation that finds nothing looks identical to a product
    // that has nothing.
    expect(seen.size).toBeGreaterThan(15)
  })

  it('6. every pill href names a route that exists', () => {
    /* D198's sweep, one level over: an href naming a path nobody built 404s
       from EVERY screen that renders the rail, because Next prefetches every
       `<Link>` in the viewport. It is also what keeps the refused Innsikt
       «Bygger» pill refused — a deep link into the report editor has no id to
       resolve, so adding it would fail here rather than ship. */
    const bad: string[] = []
    for (const p of [...ROUTES, '/rapporter', '/oppgaver', '/bibliotek']) {
      const r = rails(p)
      if (!r) continue
      for (const pill of r.pills) {
        const path = pill.href.split('?')[0]!
        if (!ROUTES.includes(path)) bad.push(`${p}: ${pill.id} -> ${pill.href}`)
      }
    }
    expect(bad, `href with no route: ${bad.join('; ')}`).toEqual([])
  })

  it('7. the screens with no rail get null, and /live and /test get a rail with NOTHING current', () => {
    for (const p of ['/oversikt', '/profil', '/hjelp', '/administrasjon', '/administrasjon/brukere']) {
      expect(rails(p), `${p} should have no rail`).toBeNull()
    }
    /* `admin` is the measured refusal, not an oversight: the bundle's six-item
       list is missing three tabs the app has (D164), and a shell rail may
       absorb an in-page one only when its list is COMPLETE. */

    for (const seg of ['live', 'test']) {
      const r = rails(`/undersokelser/${ID}/${seg}`)
      expect(r, `${seg} is a survey route and keeps the rail`).not.toBeNull()
      // «No pill is current» and «the first pill is current» are different
      // claims, and only the first is true here.
      expect(r!.currentId, seg).toBeNull()
    }
    // And the builder lights «Spørsmål» through TAB_ALIAS rather than nothing.
    expect(rails(`/undersokelser/${ID}/bygg`)!.currentId).toBe('sporsmal')
  })

  it('8. the component knows no pathname — adding a screen is a row, not an edit', () => {
    /* The registry's whole claim. `AppSubnav` had five `pathname === '/…'`
       branches; if any route literal comes back here, the rail set has two
       homes again and they can disagree. */
    const literals = code(component).match(/['"`]\/[a-zæøå-]+/gi) ?? []
    expect(literals, `route literals left in the component: ${literals.join(', ')}`).toEqual([])

    // Proven to fire: the same matcher over a synthetic branch finds it.
    expect(code(`if (pathname === '/dashboard') return null`)).toMatch(/['"`]\/[a-zæøå-]+/i)
  })

  it('9. the two kinds render differently, and only a filter can light', () => {
    /* «A jump rendered as a filter is a pill that never lights.» No exit ships
       yet — the two rails that carry one are V7-2's — so this is a source
       assertion on the branch that will receive the first one. Without it V7-2
       adds the pill and inherits the filter treatment silently, which is the
       defect the type exists to make unrepresentable. */
    const c = code(component)
    expect(c).toMatch(/kind === 'exit'/)
    // Emphasis is `on OR exit`, never `on` alone — that is the whole property.
    expect(c).toMatch(/fontWeight: on \|\| exit/)
    expect(c).toMatch(/opacity: on \|\| exit/)
    // And the current pill is a filter by construction, not by convention.
    expect(c).toMatch(/pill\.kind === 'filter' && pill\.id === rail\.currentId/)
  })

  it('10. the registry builds its pills FROM the registries, never from a literal list', () => {
    /* The admin rail's six-of-eight is what a hand-written array looks like
       after three phases. Four rails are derived; the two that are not —
       Innsikt and Arbeidsliste — have no registry to derive from, and their
       pills are cross-screen destinations rather than a set that grows. */
    const c = code(src)
    expect(c).toMatch(/FILTERS\.map/)
    expect(c).toMatch(/LIBRARY_TABS\.map/)
    expect(c).toMatch(/SURVEY_TABS\.map/)
  })
})
