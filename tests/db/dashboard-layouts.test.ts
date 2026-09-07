import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  leserClient,
  outsiderClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_OTHER, ORG_PRIMARY, PERSONAS } from './personas'

/**
 * DECISIONS Q51 — a layout stores identifiers, never values. Q25 — per member,
 * presets per organisation.
 *
 * WHERE THE CONSTRAINT LIVES: the database. Three of them, in the migration:
 *
 *   1. every panel key must be a `report_section_types` row — the registry
 *      `dashboard_pins.panel_key` already references (M:0024:9). A layout can
 *      only name readers that ALREADY EXIST; it cannot introduce a query, it
 *      selects among gated ones.
 *   2. a key-set CHECK on both payloads — `panels` may hold only `key` and
 *      `wide`, `filters` only `period`, `group_id`, `survey_ids`. No `n`, no
 *      `avg`, no `k`, no cell value.
 *   3. an organisation preset may not carry `group_id` at all.
 *
 * None of this belongs in the server action. An action is one caller; a table
 * that any authenticated session can write through PostgREST needs the rule
 * where the row lands. This is Q36's lesson applied to a payload rather than a
 * scalar: the ceiling that lives in one action is a rule about one caller.
 *
 * THE ONE THAT MATTERS is `replays under the CURRENT threshold, not the one it
 * was saved under`. Everything else here is shape; that test is the reason the
 * shape was chosen. A layout that could carry a k would be a stored query
 * outliving the promise it was composed under, and the whole k-gate is built on
 * the promise being current.
 *
 * Standing question 1 (`tests/db/clients.ts`): what ELSE could refuse this
 * before the check I am testing gets a chance? RLS could — a leser writing a
 * layout is refused by the policy, not by the CHECK — so every shape assertion
 * below is made as an ADMINISTRATOR, who may write, and fails on the constraint
 * or not at all. The RLS assertions are separate and made by the role they are
 * about.
 *
 * Standing question 3: the panel-key assertion is over the SET. It does not
 * pick a bad key and assert it is refused; it asserts that the set of keys a
 * layout may hold equals the set of registry keys, which is what makes adding a
 * panel a registry row rather than a code change.
 */
const madeLayouts: string[] = []
const madeSurveys: string[] = []

let svc: Client
let admin: Client
let redaktor: Client
let leser: Client
let outsider: Client
let orgId: string
let otherOrgId: string
let groupId: string
let adminUserId: string
let redaktorUserId: string
let personSurvey: string
let orgSurvey: string
let registryKeys: string[]

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor, leser, outsider] = await Promise.all([
    adminClient(),
    redaktorClient(),
    leserClient(),
    outsiderClient(),
  ])

  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id

  const { data: groups } = await svc.from('groups').select('id, name').eq('org_id', orgId)
  groupId = groups![0]!.id

  const { data: members } = await svc
    .from('org_members')
    .select('user_id, email')
    .eq('org_id', orgId)
  adminUserId = members!.find((m) => m.email === PERSONAS.administrator.email)!.user_id!
  redaktorUserId = members!.find((m) => m.email === PERSONAS.redaktor.email)!.user_id!

  // The DASHBOARD subset (M:0047), not the whole registry: not every report
  // section is a panel — `summary`, `method`, `participation`, `quotes` and
  // `actions` are prose with no dashboard rendering, and a layout naming one
  // would draw an empty panel, which "never fabricate data in the UI" makes
  // worse than a refusal.
  const { data: types } = await svc
    .from('report_section_types')
    .select('key')
    .eq('on_dashboard', true)
  registryKeys = types!.map((t) => t.key)

  // Two surveys: one person (which has a threshold and can be raised) and one
  // organisation (which has none — app.k_for returns 0). Q42 needs both.
  const mk = async (kind: 'person' | 'organisation', k: number) => {
    const { data, error } = await svc
      .from('surveys')
      .insert({
        org_id: orgId,
        title: `Oppsett-${kind}-${Date.now()}`,
        status: 'aktiv',
        respondent_kind: kind,
        k_threshold: k,
        // An organisation survey must be `named` (M:0034:38) — the fixture
        // obeys the constraint rather than working around it, because a
        // fixture that dodges a rule tests a schema that does not exist.
        anonymity: kind === 'organisation' ? 'named' : 'anonymous',
      })
      .select('id')
      .single()
    if (error) throw new Error(`fixture ${kind} survey: ${error.message}`)
    madeSurveys.push(data!.id)
    return data!.id
  }
  personSurvey = await mk('person', 5)
  orgSurvey = await mk('organisation', 5)
})

afterAll(async () => {
  if (madeLayouts.length) await svc.from('dashboard_layouts').delete().in('id', madeLayouts)
  if (madeSurveys.length) await svc.from('surveys').delete().in('id', madeSurveys)
})

/** A layout the constraints should accept, so each test can vary one thing. */
const good = (over: Record<string, unknown> = {}) => ({
  org_id: orgId,
  user_id: adminUserId,
  title: `Mitt oppsett ${Math.random().toString(36).slice(2, 8)}`,
  panels: [
    { key: 'trend', wide: false },
    { key: 'heatmap', wide: true },
  ],
  filters: { period: 'q', group_id: null, survey_ids: [] },
  ...over,
})

const insert = async (c: Client, row: Record<string, unknown>) => {
  const res = await c.from('dashboard_layouts').insert(row as never).select('id')
  if (res.data?.[0]?.id) madeLayouts.push(res.data[0].id)
  return res
}

describe('(Q51) a layout stores identifiers, never values', () => {
  it('POSITIVE CONTROL: an administrator saves a well-formed layout', async () => {
    // First, because every refusal below is vacuous over a table nobody can
    // write. This also proves the registry keys used here are real.
    const { data, error } = await insert(admin, good())
    expect(error, 'a well-formed layout is accepted').toBeNull()
    expect(data, 'and the row exists').toHaveLength(1)
  })

  it('THE SET: a layout may name a panel key if and only if the registry has it', async () => {
    // Asserted over the SET, not over a member I picked. The property is "the
    // admissible keys ARE the registry keys" — sampling one bad key would pass
    // against a hard-coded allow-list that had drifted from the registry, which
    // is exactly the failure this is for.
    for (const key of registryKeys) {
      const { error } = await insert(admin, good({ panels: [{ key, wide: false }] }))
      expect(error, `registry key "${key}" must be admissible`).toBeNull()
    }

    // The complement is derived too: every registry row the dashboard does NOT
    // offer, plus the two keys the bundle uses that this schema does not have.
    // `stream` is in here BY DECISION (Q26) and `register` because the registry
    // calls it `per_virksomhet` — the registry key is what a layout stores.
    const { data: allTypes } = await svc.from('report_section_types').select('key')
    const notOffered = allTypes!
      .map((t) => t.key)
      .filter((k) => !registryKeys.includes(k))
      .concat(['stream', 'register', 'made-up-panel', ''])

    expect(notOffered, 'the complement is not empty, or this loop asserts nothing')
      .not.toHaveLength(0)

    for (const key of notOffered) {
      const { error } = await insert(admin, good({ panels: [{ key, wide: false }] }))
      expect(error, `"${key}" is not offered on the dashboard and must be refused`)
        .not.toBeNull()
    }
  })

  it('(Q26) the stream panel cannot be composed into a layout at all', async () => {
    // The deferral and Q51's constraint are the same mechanism: a layout may
    // only name a registry row offered on the dashboard, and `stream` has no
    // row. The flag is what the PICKER reads to draw the bundle's unavailable
    // state; the missing row is what the DATABASE enforces. Asserting both
    // says they agree — a flag flipped on without a row would still refuse.
    const { data: flag } = await svc
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'event_stream_panel')
      .is('org_id', null)
      .single()
    expect(flag!.enabled, 'the flag ships off').toBe(false)

    const { data: row } = await svc
      .from('report_section_types')
      .select('key')
      .eq('key', 'stream')
    expect(row, 'and there is no registry row to name').toEqual([])

    const { error } = await insert(admin, good({ panels: [{ key: 'stream', wide: true }] }))
    expect(error, 'so a layout naming it is refused by the database').not.toBeNull()
  })

  it('no registry key is off BOTH surfaces without a stated reason', async () => {
    // A row with on_dashboard = false and in_report = false is a row nothing
    // can render: either a mistake, or an entry waiting for a consumer that
    // does not exist yet. Both want a comment, and the danger is the same
    // either way — someone later "fixes" the orphan by flipping a flag,
    // putting a key on a surface that has no renderer for it.
    //
    // Not a CHECK constraint, because "awaiting a consumer" is a legitimate
    // state and a constraint would forbid it. The same rule 5a3 and the census
    // apply instead: a new one arrives FAILING until someone states what it is
    // worth, here by adding it below with its reason.
    const AWAITING_A_CONSUMER: Record<string, string> = {
      // key: 'why it renders nowhere yet, and what would consume it'
    }

    const { data: rows } = await svc
      .from('report_section_types')
      .select('key, on_dashboard, in_report')
    const orphans = rows!
      .filter((r) => !r.on_dashboard && !r.in_report)
      .map((r) => r.key)
      .filter((k) => !(k in AWAITING_A_CONSUMER))

    expect(orphans, 'a registry row nothing can render needs a stated reason').toEqual([])
  })

  it('(Q27) every shipped preset names only panels the dashboard offers', async () => {
    // Q27 enforced rather than remembered. A seeded default that cannot be
    // applied is worse than a missing one, and the two presets the bundle
    // draws leading with `stream` are exactly the ones that would break.
    const { data: presets } = await svc.from('dashboard_presets').select('key, panels')
    expect(presets!.length, 'the six shipped presets exist').toBe(6)

    for (const p of presets!) {
      for (const key of p.panels as string[]) {
        expect(registryKeys, `preset "${p.key}" names "${key}"`).toContain(key)
      }
    }

    const { error } = await svc
      .from('dashboard_presets')
      .insert({ key: 'probe', title: 'p', description: 'd', panels: ['stream'] } as never)
    expect(error, 'and a preset naming an unoffered panel is refused too').not.toBeNull()
  })

  it('refuses a panels entry carrying anything beyond key and wide', async () => {
    const { error } = await insert(
      admin,
      good({ panels: [{ key: 'trend', wide: false, n: 42, avg: 3.7 }] }),
    )
    expect(error, 'a cached value in a panel entry is refused').not.toBeNull()
  })

  it('refuses a filters payload carrying anything beyond period, group_id and survey_ids', async () => {
    for (const extra of [{ k: 5 }, { n: 12 }, { as_of: '2026-01-01' }, { avg: 3.2 }]) {
      const { error } = await insert(
        admin,
        good({ filters: { period: 'q', group_id: null, survey_ids: [], ...extra } }),
      )
      expect(error, `filters may not carry ${JSON.stringify(extra)}`).not.toBeNull()
    }
  })

  it('an organisation preset may not carry a group filter (Q51, Tor)', async () => {
    // user_id null = organisation preset. A preset saved by an administrator
    // with a group selected, picked by a leser, would send p_group to
    // get_quotes and be refused (M:0032:658) — a correct refusal presenting as
    // a broken panel. The boundary is structural instead.
    const { error: refused } = await insert(
      admin,
      good({ user_id: null, filters: { period: 'q', group_id: groupId, survey_ids: [] } }),
    )
    expect(refused, 'an org preset carrying a group filter is refused').not.toBeNull()

    const { error: allowed } = await insert(
      admin,
      good({ user_id: null, filters: { period: 'q', group_id: null, survey_ids: [] } }),
    )
    expect(allowed, 'the same preset without a group is fine').toBeNull()

    const { error: personal } = await insert(
      admin,
      good({ filters: { period: 'q', group_id: groupId, survey_ids: [] } }),
    )
    expect(personal, "and a PERSONAL layout may still carry one — it is the author's own")
      .toBeNull()
  })
})

describe('(Q51) THE ONE THAT MATTERS: a layout does not outlive its threshold', () => {
  it('replays under the CURRENT threshold, not the one it was saved under', async () => {
    // Save a layout selecting a survey at k=5, then raise that survey to k=8,
    // then replay the layout's own filters through the RPC the panels read.
    // The gate must be 8. If a layout could carry a k, this is where it would
    // show, and it is the whole reason the payload is identifiers only.
    await svc.from('surveys').update({ k_threshold: 5 }).eq('id', personSurvey)

    const { data: saved, error: sErr } = await insert(
      admin,
      good({ filters: { period: 'y', group_id: null, survey_ids: [personSurvey] } }),
    )
    expect(sErr, 'the layout saves at k=5').toBeNull()
    const layoutId = saved![0]!.id

    const { data: before } = await admin.rpc('dashboard_summary', {
      p_org: orgId,
      p_surveys: [personSurvey],
    })
    expect((before as { k: number }).k, 'composed under 5').toBe(5)

    await svc.from('surveys').update({ k_threshold: 8 }).eq('id', personSurvey)

    const { data: row } = await svc
      .from('dashboard_layouts')
      .select('filters')
      .eq('id', layoutId)
      .single()
    const f = row!.filters as { survey_ids: string[] }

    const { data: after } = await admin.rpc('dashboard_summary', {
      p_org: orgId,
      p_surveys: f.survey_ids,
    })
    expect(
      (after as { k: number }).k,
      'the SAME layout now gates at 8 — the threshold is read at call time, never stored',
    ).toBe(8)

    expect(
      JSON.stringify(row!.filters),
      'and the stored payload carries no threshold to have gone stale',
    ).not.toMatch(/"k"|threshold/i)
  })

  it('a layout naming another organisation survey returns nothing, not a row', async () => {
    // p_surveys is a FILTER, never a widener: the RPC scopes to org first.
    // The foreign survey is MADE here rather than found: the seed is not
    // guaranteed to give the other organisation one, and a test that silently
    // skips when its fixture is absent proves nothing (Gate 5a2, hermeticity).
    const { data: theirs, error: tErr } = await svc
      .from('surveys')
      .insert({
        org_id: otherOrgId,
        title: `Fremmed-${Date.now()}`,
        status: 'aktiv',
        respondent_kind: 'person',
      })
      .select('id')
      .single()
    if (tErr) throw new Error(`fixture foreign survey: ${tErr.message}`)
    madeSurveys.push(theirs!.id)
    const foreign = theirs!.id

    const { data } = await admin.rpc('dashboard_summary', {
      p_org: orgId,
      p_surveys: [foreign],
    })
    const out = data as { surveys: unknown[]; n: number }
    expect(out.surveys, 'no survey from the other organisation is returned').toEqual([])
    expect(out.n, 'and no responses are counted').toBe(0)
  })
})

describe('(Q42) the threshold the card reports is the one the RPC applied', () => {
  it('an organisation-only selection reports k = 0, which is why it needs its own sentence', async () => {
    // app.k_for returns 0 for an organisation survey (Q17/Q47). The bundle's
    // formula cannot produce this — it filters to person surveys and floors at
    // 3 — so adopting the RPC's k means inheriting a case the drawing never
    // had. `lib/dashboard/threshold-line.ts` is what turns it into a sentence
    // rather than the numeral 0.
    const { data } = await admin.rpc('dashboard_summary', {
      p_org: orgId,
      p_surveys: [orgSurvey],
    })
    expect((data as { k: number }).k, 'no threshold protects an organisation').toBe(0)
  })

  it('a MIXED selection reports the person maximum, not 0', async () => {
    // max() over the selection, so one person survey re-imposes its threshold
    // on the whole board. Without this assertion the test above would pass
    // just as well against a k that ignored person surveys entirely.
    await svc.from('surveys').update({ k_threshold: 8 }).eq('id', personSurvey)
    const { data } = await admin.rpc('dashboard_summary', {
      p_org: orgId,
      p_surveys: [orgSurvey, personSurvey],
    })
    expect((data as { k: number }).k, 'the strictest of the selection').toBe(8)
  })

  it('an empty selection falls back to 5 rather than to 0', async () => {
    // coalesce(max(...), 5): max over no rows is NULL, and a NULL k would gate
    // nothing. The fallback is the default threshold, not the absence of one.
    const { data } = await admin.rpc('dashboard_summary', {
      p_org: orgId,
      p_surveys: [],
    })
    expect((data as { k: number }).k).toBe(5)
  })
})

describe('(Q25) per member, presets per organisation', () => {
  it('POSITIVE CONTROL: a redaktør saves their own layout', async () => {
    const { error } = await insert(redaktor, good({ user_id: redaktorUserId }))
    expect(error, 'a member may save their own layout').toBeNull()
  })

  it('a member cannot write a layout owned by a colleague', async () => {
    // Asserted on the STORED ROW after a BARE insert, and both halves of that
    // sentence were forced by mutation.
    //
    // Written first as `insert(...).select('id')` and an error assertion, it
    // passed with dashboard_layouts_ins widened to `is_org_member` alone —
    // because PostgreSQL applies the SELECT policy to an INSERT's RETURNING,
    // so the error came from `_sel` and the test was proving the read policy
    // under a write policy's name. A bare insert (no returning) is ACCEPTED
    // under the widened policy, measured directly.
    //
    // Standing question 1, and I wrote it: what ELSE could refuse this before
    // the check I am testing gets a chance? Here, the read policy could.
    const title = `Kollega-${Math.random().toString(36).slice(2, 8)}`
    await redaktor
      .from('dashboard_layouts')
      .insert(good({ user_id: adminUserId, title }) as never)

    const { data: landed } = await svc
      .from('dashboard_layouts')
      .select('id')
      .eq('title', title)
    expect(landed, "no row claiming someone else's user_id reached the table").toEqual([])
  })

  it("a colleague cannot clear someone's saved setup — enforced by _sel, not _del (whose user check is DEFENCE IN DEPTH and unobservable through PostgREST)", async () => {
    // This asserts the BEHAVIOUR, and the comment says which policy delivers
    // it, because mutation showed they are not the same thing.
    //
    // Dropping the user check from dashboard_layouts_del changes NOTHING
    // observable here: PostgreSQL requires SELECT permission to reference the
    // columns in a DELETE's WHERE clause, so a colleague who cannot READ the
    // row cannot name it either. Through PostgREST it is `_sel` that protects
    // a personal layout from deletion; `_del`'s user check is defence in depth
    // for any future path that reaches the row another way.
    //
    // Recorded rather than dressed up: a test whose mutation is silent proves
    // less than it appears to, and saying which policy is load-bearing is the
    // difference between a passing test and a known one.
    const { data: mine } = await insert(admin, good())
    const id = mine![0]!.id

    const { error } = await redaktor.from('dashboard_layouts').delete().eq('id', id)
    expect(error, 'RLS filters rather than raising').toBeNull()

    const { data: still } = await svc.from('dashboard_layouts').select('id').eq('id', id)
    expect(still, "a colleague cannot clear someone's saved setup").toHaveLength(1)
  })

  it("a colleague's PERSONAL layout is not readable, only their org presets", async () => {
    // Found by mutation, not by design: widening dashboard_layouts_sel to drop
    // its user check failed NO test, because every read assertion here was
    // either about an org preset (which is meant to be shared) or about an
    // outsider (which the org scope catches). "A member cannot read a
    // colleague's own setup" is the half of the SELECT policy nothing was
    // asserting. Standing question 2, one dimension over: I asserted over the
    // ROLES that read and not over the ROWS they may reach.
    const { data: mine } = await insert(admin, good({ title: 'Bare mitt' }))
    const id = mine![0]!.id

    const { data, error } = await redaktor.from('dashboard_layouts').select('id').eq('id', id)
    expect(error, 'RLS filters rather than raising').toBeNull()
    expect(data, "a colleague's personal layout is invisible").toEqual([])
  })

  it('an outsider sees no layout of this organisation', async () => {
    const { data, error } = await outsider
      .from('dashboard_layouts')
      .select('id')
      .eq('org_id', orgId)
    expect(error).toBeNull()
    expect(data, 'org scope holds across organisations').toEqual([])
  })

  it('every member reads the organisation presets, and a leser reads them too', async () => {
    const { data: preset } = await insert(admin, good({ user_id: null, title: 'Felles oppsett' }))
    const id = preset![0]!.id

    for (const [who, c] of [
      ['redaktør', redaktor],
      ['leser', leser],
    ] as const) {
      const { data } = await c.from('dashboard_layouts').select('id').eq('id', id)
      expect(data, `a ${who} reads the organisation preset`).toHaveLength(1)
    }

    const { data: theirs } = await outsider.from('dashboard_layouts').select('id').eq('id', id)
    expect(theirs, 'but another organisation does not').toEqual([])
  })

  it('an organisation preset may not take a SHIPPED preset name (M:0048)', async () => {
    // Found by looking at the «Bytt oppsett» row, not by a test: it draws the
    // shipped presets and the organisation's own side by side, and the demo
    // seed had named one «Arbeidsmiljø» — which is also shipped. Two identical
    // chips, one deletable and one not.
    //
    // `dashboard_layouts`' unique index is (org_id, user_id, title) and cannot
    // see `dashboard_presets`, so this is the collision it structurally cannot
    // catch. Asserted over the SET of shipped titles rather than the one that
    // happened to clash.
    const { data: shipped } = await svc.from('dashboard_presets').select('title')
    expect(shipped!.length, 'or this loop asserts nothing').toBeGreaterThan(0)

    for (const { title } of shipped!) {
      const { error } = await insert(admin, good({ user_id: null, title }))
      expect(error, `"${title}" is a shipped preset name`).not.toBeNull()
      expect(error!.code, 'reported as a duplicate, so the action says so').toBe('23505')
    }

    // Case and surrounding space do not make it a different name to a reader.
    const one = shipped![0]!.title
    const { error: cased } = await insert(
      admin,
      good({ user_id: null, title: `  ${one.toUpperCase()}  ` }),
    )
    expect(cased, 'case and padding are not a new name').not.toBeNull()
  })

  it("a MEMBER'S OWN layout may still be titled anything — the rule is scoped", async () => {
    // The switch list only shows organisation presets, so a personal row that
    // shares a shipped name is invisible and forbidding it would be a rule
    // with no reader. Stated as a test so the scope is deliberate rather than
    // an oversight someone later "tightens".
    const { data: shipped } = await svc.from('dashboard_presets').select('title').limit(1)
    const { error } = await insert(admin, good({ title: shipped![0]!.title }))
    expect(error, 'a personal row is not in the switch list').toBeNull()
  })

  it('a leser cannot save an organisation preset', async () => {
    const { error } = await insert(leser, good({ user_id: null, title: 'Leser-oppsett' }))
    expect(error, 'writing a shared preset is an editor act').not.toBeNull()
  })
})
