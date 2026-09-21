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
    for (const p of ['/profil', '/hjelp', '/administrasjon', '/administrasjon/brukere']) {
      expect(rails(p), `${p} should have no rail`).toBeNull()
    }
    /* N2 — /oversikt CHANGED SIDES and is asserted rather than dropped. It was
       in the list above until v8, whose insight rail covers `dash`,
       `dashboard` and `reports` alike (v8:9334); `dash` is v8's «I dag», which
       is this screen. Deleting the line would have left the move unguarded —
       the honest form is the opposite claim, with the pill that lights. */
    const today = rails('/oversikt')
    expect(today, '/oversikt carries the Innsikt rail since v8').not.toBeNull()
    expect(today!.currentId).toBe('dash')
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
    /* T5.1 — the builder no longer wears the SURVEY rail at all. v8:9366-9371
       gives `build` its own: four group pills plus an exit. Before T5.1 this
       asserted «Spørsmål» through TAB_ALIAS, which was true of a rail the
       builder no longer carries. */
    expect(rails(`/undersokelser/${ID}/bygg`)!.currentId).toBe('build')
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
    /* Emphasis must depend on `exit`, never on `on` alone — that is the whole
       property, and it is stated over both declarations rather than pinned to
       one spelling. V7-1 asserted the literal `on || exit`; V7-2 added the
       dormant qualifier and this went red on correct code, which is the guard
       doing its job and the assertion being a spelling rather than a rule. */
    for (const decl of c.match(/(fontWeight|opacity): [^,\n]+/g) ?? []) {
      expect(decl, `emphasis ignores kind: ${decl}`).toMatch(/\bexit\b/)
    }
    expect((c.match(/(fontWeight|opacity): [^,\n]+/g) ?? []).length).toBe(2)
    // And the current pill is a filter by construction, not by convention.
    expect(c).toMatch(/pill\.kind === 'filter' && pill\.id === rail\.currentId/)
  })

  it('11. V7-2 — the survey rail carries the «Bygger» EXIT, and not on /bygg itself', () => {
    const on = (seg: string) => rails(`/undersokelser/${ID}/${seg}`)!

    /* Twelve drawn, eight tabs, and the twelfth is an exit rather than a ninth
       tab — which is what makes it compatible with F5-2 rather than a reversal
       of it. A tab competes with «Spørsmål» for which screen you are on; an
       exit cannot, and v7 forces it never to light (`v7:8923`). */
    const bygger = on('sporsmal').pills.find((p) => p.id === 'bygger')
    expect(bygger, 'no «Bygger» pill on the survey rail').toBeDefined()
    expect(bygger!.kind).toBe('exit')
    expect(bygger!.emphasis).toBe('dormant')
    expect(bygger!.href).toBe(`/undersokelser/${ID}/bygg`)
    expect(on('sporsmal').pills.filter((p) => p.kind === 'filter')).toHaveLength(8)

    /* T5.1 — `/bygg` carries v8's OWN rail now, so «Bygger» cannot appear
       there for a stronger reason than before: it is a different rail, not the
       same rail with one pill suppressed. v7's problem («an exit pointing at
       the page you are standing on») is gone rather than handled. */
    expect(on('bygg').pills.some((p) => p.id === 'bygger'), 'exit to the current page').toBe(false)

    // v8:9366-9371 — four group pills, then «Undersøkelsen» as the exit back.
    const build = on('bygg')
    expect(build.pills.filter((p) => p.kind === 'filter').map((p) => p.id)).toEqual([
      'build',
      'method',
      'settings',
      'preview',
    ])
    expect(build.currentId).toBe('build')
    const back = build.pills.find((p) => p.id === 'survey')
    expect(back, 'v8 concats «Undersøkelsen»').toBeDefined()
    expect(back!.kind).toBe('exit')
    expect(back!.href).toBe(`/undersokelser/${ID}/sporsmal`)

    // It can never be the current pill — asserted by the registry itself, over
    // every route, in test 3. Stated here too because this is the first pill
    // that could make it false.
    for (const seg of ['sporsmal', 'send', 'resultater', 'live']) {
      expect(on(seg).currentId, seg).not.toBe('bygger')
    }
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

  /* ── N2 — THE INSIGHT RAIL'S DASHBOARD PILLS ────────────────────────────
   *
   * Every test above drives `resolveSubnav` with the default empty dashboard
   * list, which is the right default — the rail must be sound with no boards —
   * and it means the pills themselves were unreached. These four reach them.
   */
  const boards = (n: number, currentIdx = -1) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${i}0000000-0000-4000-8000-000000000000`,
      title: `Tavle ${i}`,
      ...(i === currentIdx ? { current: true as const } : {}),
    }))
  const insight = (q: string, list: ReturnType<typeof boards>) =>
    resolveSubnav('/dashboard', new URLSearchParams(q), list)!

  it('11. the rail lists the boards, capped at v8\'s four, with the title as RAW text', () => {
    const r = insight('', boards(6))
    const pills = r.pills.filter((p) => p.id.startsWith('dash:'))
    // v8:9347 caps at four; the fifth and sixth reach the rail via «Flere
    // oppsett», which is what that pill is for.
    expect(pills).toHaveLength(4)
    expect(r.pills.some((p) => p.id === 'more')).toBe(true)
    // A board's name is whatever the person typed. Sent through next-intl it
    // would MISS and render as a key — the defect Tor found nine of behind
    // seventeen green gates, arriving from the other direction.
    expect(pills[0]!.label).toEqual({ ns: 'raw', key: 'Tavle 0' })
    expect(pills[0]!.href).toBe('/dashboard?flate=00000000-0000-4000-8000-000000000000')
    // With no boards at all the rail is still sound — two pills, no dangling
    // current.
    const empty = insight('', boards(0))
    expect(railFaults(empty)).toEqual([])
  })

  it('12. `?flate=` lights the board it names, and an unknown one never lights a different board', () => {
    const list = boards(3, 0)
    const named = list[2]!.id
    expect(insight(`flate=${named}`, list).currentId).toBe(`dash:${named}`)
    /* An id naming no board falls back to the one the SERVER says is current,
       never to «the first pill». The page resolves the same value the same way
       — an unreadable or unknown `flate` renders the viewer's own working row
       — so the rail and the screen cannot disagree about what is open. */
    expect(insight('flate=00000000-0000-4000-8000-0000000000ff', list).currentId).toBe(
      `dash:${list[0]!.id}`,
    )
  })

  it('13. nothing lights when the server flags no current board — a guess would be a claim', () => {
    // A member who has never customised has no working row, so no board is
    // open. Null is true; `dashboards[0]` was the guess this replaced.
    expect(insight('', boards(3)).currentId).toBeNull()
    expect(railFaults(insight('', boards(3)))).toEqual([])
    /* N3 — `?tilpass` DOES NOT WIN ANY MORE, and this assertion changed sides
       rather than being deleted. «Flere oppsett» is a `<select>` in v8, always
       `value=""`, so nothing in it can read as selected; the customize panel is
       a STATE of the board on screen, and the board stays lit under it. */
    expect(insight('tilpass=', boards(3, 1)).currentId).toBe(`dash:${boards(3, 1)[1]!.id}`)
  })

  it('15. «Flere oppsett» is a more-pill carrying the OVERFLOW, and is absent when there is none', () => {
    /* v8:9347 caps the rail at four inline; the rest reach it through this
       control. Ours omits the pill when the overflow is empty, because v8's
       other three option classes all CREATE a dashboard and are refused —
       without them a ≤4-board dropdown would have nothing in it. */
    const four = insight('', boards(4))
    expect(four.pills.some((p) => p.kind === 'more'), 'no overflow, no pill').toBe(false)

    const six = insight('', boards(6))
    const more = six.pills.find((p) => p.kind === 'more')!
    expect(more, 'six boards, four inline, two over').toBeTruthy()
    expect(more.options).toHaveLength(2)
    expect(more.options![0]!.href).toBe(`/dashboard?flate=${boards(6)[4]!.id}`)
    // Every option is a board that is NOT already a pill — the two sets
    // partition the list, so no board is both inline and in the dropdown.
    const inlineHrefs = six.pills.filter((p) => p.id.startsWith('dash:')).map((p) => p.href)
    for (const o of more.options!) expect(inlineHrefs).not.toContain(o.href)
    expect(railFaults(six)).toEqual([])
  })

  it('16. railFaults refuses an empty dropdown and a more-pill that lights — proven, not trusted', () => {
    const base = { label: { ns: 'nav' as const, key: 'x' } }
    // An empty dropdown is decoration wearing a control's clothes.
    expect(
      railFaults({
        ...base,
        pills: [{ id: 'more', label: base.label, href: '/x', kind: 'more', options: [] }],
        currentId: null,
      })[0],
    ).toMatch(/has no options/)
    // And it can never be current: v8's select is `value=""` on every render.
    expect(
      railFaults({
        ...base,
        pills: [
          { id: 'more', label: base.label, href: '/x', kind: 'more', options: [{ href: '/y', label: base.label }] },
        ],
        currentId: 'more',
      })[0],
    ).toMatch(/is a more-pill/)
    // Options on a pill that is not a dropdown would render nowhere at all.
    expect(
      railFaults({
        ...base,
        pills: [
          { id: 'a', label: base.label, href: '/x', kind: 'filter', options: [{ href: '/y', label: base.label }] },
        ],
        currentId: null,
      })[0],
    ).toMatch(/not a more-pill/)
  })

  it('17. the subnav RENDERS the dropdown with v8\'s own geometry, and with the field hit area', () => {
    /* A third `kind` that no renderer branches on is a registry entry nobody
       draws. And the utility matters: a `<select>` is a REPLACED element, so
       `touch-44`'s `::after` hit area renders nothing on it — `touch-44-field`
       is the one globals.css keeps for this case, and taking the wrong one is
       the mistake C4 made on `FeedbackList`'s select. */
    const c = code(component)
    expect(c).toMatch(/pill\.kind === 'more'/)
    expect(c).toMatch(/touch-44-field/)
    for (const decl of ['h-\\[32px\\]', 'rounded-\\[9px\\]', 'px-\\[10px\\]', 'text-\\[13px\\]', 'font-semibold']) {
      expect(c, decl).toMatch(new RegExp(decl))
    }
  })

  it('14. `flate` is READ by the dashboard page — a pill emitting a dead parameter is D208', () => {
    /* THE HALF A REGISTRY TEST CANNOT SEE. Every assertion above is about the
       rail; none of them notices that the href it builds changes nothing when
       followed. A control whose parameter nothing reads is D208's second face,
       and it is the worse one — the link works, the page renders, and only the
       selection silently does not happen. So this asserts the READER, on the
       far side of the link. */
    const page = code(readFileSync('app/(app)/dashboard/page.tsx', 'utf8'))
    expect(page, 'the page must destructure `flate`').toMatch(/flate\s*\}\s*=\s*await searchParams/)
    expect(page, 'and resolve it against the layouts it may read').toMatch(
      /dashboard_id === flate/,
    )
    /* And the customize panel must be shut on a board that is not yours: every
       write in `actions.ts` targets `(org, me, WORKING_TITLE)`, so an open
       «Lagre» there would claim a write it does not perform (D221). */
    expect(page).toMatch(/customizeOpen=\{tilpass !== undefined && !viewingOther\}/)
  })
})
