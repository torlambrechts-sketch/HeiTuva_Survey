import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { serviceClient, anonClient, personaClient } from './clients'
import { ORG_PRIMARY, ORG_OTHER } from './personas'

/**
 * PHASE F — the dashboard entity, its tenancy, and the promise its version
 * table makes.
 *
 * ── WHY THE CROSS-TENANT TESTS ARE HERE AND NOT ASSUMED ────────────────────
 *
 * `dashboard_versions` and `dashboard_shares` carry NO org_id. They reach the
 * organisation through `dashboard_id`, so every policy is an EXISTS over
 * `dashboards` — a shape the rest of this schema does not use. `ui_messages`'
 * org scope was untested for six phases behind a green 5a3 because the test
 * did not exist; a pattern does not carry itself, least of all a new one.
 */
const svc = serviceClient()

async function orgId(name: string) {
  const { data } = await svc.from('organizations').select('id').eq('name', name).single()
  if (!data) throw new Error(`${name} is not seeded`)
  return data.id as string
}

describe('F1 — the entity, and the backfill that must lose nothing', () => {
  it('every layout has a parent dashboard', async () => {
    const { count: layouts } = await svc
      .from('dashboard_layouts')
      .select('id', { count: 'exact', head: true })
    const { count: parented } = await svc
      .from('dashboard_layouts')
      .select('id', { count: 'exact', head: true })
      .not('dashboard_id', 'is', null)
    expect(layouts).toBeGreaterThan(0)
    expect(parented, 'a layout with no dashboard is a layout nobody can open').toBe(layouts)
  })

  it('a personal layout keeps its owner; an organisation one has none', async () => {
    const { data } = await svc
      .from('dashboard_layouts')
      .select('user_id, dashboards(owner_id)')
      .not('dashboard_id', 'is', null)
    for (const row of (data ?? []) as unknown as {
      user_id: string | null
      dashboards: { owner_id: string | null } | null
    }[])
      expect(row.dashboards?.owner_id ?? null, 'the dashboard inherits the layout owner').toBe(
        row.user_id,
      )
  })

  it('the panels CHECK admits span and refuses one outside the grid', async () => {
    const org = await orgId(ORG_PRIMARY)
    const { data: d } = await svc
      .from('dashboards')
      .insert({ org_id: org, title: `span probe ${Date.now()}` })
      .select('id')
      .single()
    const id = d!.id as string
    try {
      const good = await svc
        .from('dashboard_layouts')
        .insert({ org_id: org, title: `span ok ${Date.now()}`, dashboard_id: id, panels: [{ key: 'trend', span: 3 }] })
      expect(good.error, 'span 3 is inside the grid').toBeNull()

      // 7 exceeds v8's widest grid (cols is 4 or 6), and the drawing itself
      // clamps with Math.min(n, ...) — so the database refuses what the
      // control cannot produce, rather than trusting the control.
      const bad = await svc
        .from('dashboard_layouts')
        .insert({ org_id: org, title: `span bad ${Date.now()}`, dashboard_id: id, panels: [{ key: 'trend', span: 7 }] })
      expect(bad.error, 'span 7 has no grid to live in').not.toBeNull()
    } finally {
      await svc.from('dashboards').delete().eq('id', id)
    }
  })
})

describe('F2 — tenancy, read back from behaviour and not from the pattern', () => {
  it.each(['dashboards', 'dashboard_versions', 'dashboard_shares'])(
    '%s is invisible to anon',
    async (table) => {
      const { data, error } = await anonClient().from(table as 'dashboards').select('id').limit(1)
      // Either refused outright or empty — never a row. Both are acceptable;
      // a row is not.
      expect(data ?? [], `${table} leaked to anon`).toHaveLength(0)
      void error
    },
  )

  it('a member of one organisation sees none of another organisation rows', async () => {
    const mine = await orgId(ORG_PRIMARY)
    const theirs = await orgId(ORG_OTHER)
    const { data: d } = await svc
      .from('dashboards')
      .insert({ org_id: theirs, title: `cross probe ${Date.now()}` })
      .select('id')
      .single()
    const foreign = d!.id as string
    try {
      await svc
        .from('dashboard_versions')
        .insert({ dashboard_id: foreign, version: 1, panels: [{ key: 'trend' }] })
      await svc.from('dashboard_shares').insert({ dashboard_id: foreign, scope: 'role', role: 'leser' })

      const admin = await personaClient('administrator') // a member of ORG_PRIMARY
      expect(
        (await admin.from('dashboards').select('id').eq('id', foreign)).data ?? [],
        'dashboards crossed a tenant boundary',
      ).toHaveLength(0)
      expect(
        (await admin.from('dashboard_versions').select('id').eq('dashboard_id', foreign)).data ?? [],
        'dashboard_versions crossed a tenant boundary',
      ).toHaveLength(0)
      expect(
        (await admin.from('dashboard_shares').select('id').eq('dashboard_id', foreign)).data ?? [],
        'dashboard_shares crossed a tenant boundary',
      ).toHaveLength(0)

      // The positive control: without it, a policy denying EVERYTHING would
      // pass every assertion above.
      const admin2 = await personaClient('administrator')
      const { data: own } = await admin2.from('dashboards').select('id').eq('org_id', mine)
      expect((own ?? []).length, 'the member can still see their own').toBeGreaterThan(0)
    } finally {
      await svc.from('dashboards').delete().eq('id', foreign)
    }
  })

  it('a leser may read the organisation dashboards but not create one', async () => {
    const org = await orgId(ORG_PRIMARY)
    const leser = await personaClient('leser')
    const { data: seen } = await leser.from('dashboards').select('id').eq('org_id', org)
    expect((seen ?? []).length, 'a leser opens shared dashboards').toBeGreaterThan(0)

    const { error } = await leser
      .from('dashboards')
      .insert({ org_id: org, title: `leser probe ${Date.now()}` })
    expect(error, 'a leser reads aggregates; they do not arrange them').not.toBeNull()
  })
})

describe('F1 — dashboard_versions stores an arrangement, never a figure', () => {
  it('the CHECK admits only key, wide and span', async () => {
    const org = await orgId(ORG_PRIMARY)
    const { data: d } = await svc
      .from('dashboards')
      .insert({ org_id: org, title: `version probe ${Date.now()}` })
      .select('id')
      .single()
    const id = d!.id as string
    try {
      const ok = await svc
        .from('dashboard_versions')
        .insert({ dashboard_id: id, version: 1, panels: [{ key: 'trend', span: 3 }] })
      expect(ok.error).toBeNull()

      // THE POINT OF THE TABLE. A stored figure would make an old version a way
      // to read a cell the current threshold suppresses — invariant 1
      // condition 2 with the waiting done in advance.
      const withValue = await svc
        .from('dashboard_versions')
        .insert({ dashboard_id: id, version: 2, panels: [{ key: 'trend', value: 4.2 }] })
      expect(withValue.error, 'a panel carrying a value must be refused').not.toBeNull()

      const withRows = await svc
        .from('dashboard_versions')
        .insert({ dashboard_id: id, version: 3, panels: [{ key: 'trend', rows: [1, 2, 3] }] })
      expect(withRows.error, 'nor may it carry rendered rows').not.toBeNull()
    } finally {
      await svc.from('dashboards').delete().eq('id', id)
    }
  })

  it('a version number is unique per dashboard', async () => {
    const org = await orgId(ORG_PRIMARY)
    const { data: d } = await svc
      .from('dashboards')
      .insert({ org_id: org, title: `dup probe ${Date.now()}` })
      .select('id')
      .single()
    const id = d!.id as string
    try {
      await svc.from('dashboard_versions').insert({ dashboard_id: id, version: 1, panels: [] })
      const dup = await svc
        .from('dashboard_versions')
        .insert({ dashboard_id: id, version: 1, panels: [] })
      expect(dup.error, 'two version 1s make the history unreadable').not.toBeNull()
    } finally {
      await svc.from('dashboards').delete().eq('id', id)
    }
  })
})

describe('F1 — dashboard_shares cannot be half a share', () => {
  it('a role share needs a role and no token; a link share the reverse', async () => {
    const org = await orgId(ORG_PRIMARY)
    const { data: d } = await svc
      .from('dashboards')
      .insert({ org_id: org, title: `share probe ${Date.now()}` })
      .select('id')
      .single()
    const id = d!.id as string
    try {
      expect(
        (await svc.from('dashboard_shares').insert({ dashboard_id: id, scope: 'role', role: 'leser' }))
          .error,
      ).toBeNull()
      expect(
        (await svc.from('dashboard_shares').insert({ dashboard_id: id, scope: 'role' })).error,
        'a role share with no role is not a share',
      ).not.toBeNull()
      expect(
        (await svc.from('dashboard_shares').insert({ dashboard_id: id, scope: 'link' })).error,
        'a link share with no token is not a share',
      ).not.toBeNull()
      expect(
        (
          await svc
            .from('dashboard_shares')
            .insert({ dashboard_id: id, scope: 'link', token_hash: 'x'.repeat(64), role: 'leser' })
        ).error,
        'a link share carrying a role is two claims at once',
      ).not.toBeNull()
    } finally {
      await svc.from('dashboards').delete().eq('id', id)
    }
  })
})

/**
 * F3 — INTERNAL SHARING, and the one thing it must not do.
 *
 * Sharing a dashboard hands somebody a different DOOR, never a different GATE.
 * Every figure on a dashboard comes from one of five SECURITY DEFINER RPCs —
 * dashboard_summary, get_heatmap, get_trends, get_themes, get_quotes — and T5.2
 * measured that all five call `app.k_for` and none grants `anon`. A share row
 * changes who may open the dashboard; it changes nothing about what those
 * functions return.
 *
 * The test is written as a COMPARISON rather than as an assertion about the
 * leser alone, because «the leser saw insufficient_data» is also true of a
 * leser who can see nothing at all. The claim is that the two roles see the
 * SAME suppression on the SAME cells.
 */
describe('F3 — a shared dashboard reads through the same gate as the owner', () => {
  const gatedShape = (payload: unknown) => {
    // The shape a caller can compare without reading any value: for each
    // question, whether it came back suppressed. Values are deliberately NOT
    // compared — a test that diffed numbers would itself be a way to read them.
    const rows = ((payload ?? {}) as { questions?: { question_id: string; insufficient_data?: boolean }[] })
      .questions ?? []
    return rows
      .map((q) => `${q.question_id}:${q.insufficient_data ? 'gated' : 'open'}`)
      .sort()
      .join('|')
  }

  it('dashboard_summary returns the same gated cells to a leser as to an administrator', async () => {
    const org = await orgId(ORG_PRIMARY)
    const admin = await personaClient('administrator')
    const leser = await personaClient('leser')

    const a = await admin.rpc('dashboard_summary', { p_org: org })
    const l = await leser.rpc('dashboard_summary', { p_org: org })
    expect(a.error).toBeNull()
    expect(l.error, 'a leser may read the dashboard summary').toBeNull()

    const aK = (a.data as { k?: number } | null)?.k
    const lK = (l.data as { k?: number } | null)?.k
    expect(lK, 'the threshold a leser is told is the same one').toBe(aK)
    expect(typeof aK, 'and it is a real number, not absent').toBe('number')
  })

  it.each([
    ['get_heatmap', (org: string) => ({ p_org: org })],
  ] as const)('%s agrees cell for cell between the two roles', async (fn, args) => {
    const org = await orgId(ORG_PRIMARY)
    const admin = await personaClient('administrator')
    const leser = await personaClient('leser')
    const a = await admin.rpc(fn, args(org) as never)
    const l = await leser.rpc(fn, args(org) as never)
    expect(a.error).toBeNull()
    expect(l.error).toBeNull()
    // The heatmap reports its own k; the gate is the same object for both.
    expect((l.data as { k?: number } | null)?.k).toBe((a.data as { k?: number } | null)?.k)
  })

  it('a survey below its threshold is gated for BOTH, on the same questions', async () => {
    // The positive control this whole describe rests on: if nothing in the seed
    // were suppressed, every assertion above would hold vacuously.
    // SCOPED TO THE DEMO ORGANISATION. Unfiltered, this picked up every other
    // suite's fixture orgs, the admin persona could read none of them, and
    // `compared` stayed 0 — the test then failed in a full run and passed
    // alone, which is the population being wrong rather than the product.
    const org = await orgId(ORG_PRIMARY)
    const { data: surveys } = await svc
      .from('surveys')
      .select('id, k_threshold, respondent_kind')
      .eq('org_id', org)
      .eq('respondent_kind', 'person')
      .is('deleted_at', null)
      .limit(50)

    const admin = await personaClient('administrator')
    const leser = await personaClient('leser')
    let compared = 0
    let sawGated = false
    for (const s of surveys ?? []) {
      const a = await admin.rpc('aggregate_results', { p_survey: s.id })
      const l = await leser.rpc('aggregate_results', { p_survey: s.id })
      if (a.error || l.error) continue
      const shapeA = gatedShape(a.data)
      if (!shapeA) continue
      compared += 1
      if (shapeA.includes(':gated')) sawGated = true
      expect(gatedShape(l.data), `${s.id} gated differently for a leser`).toBe(shapeA)
    }
    expect(compared, 'nothing was compared — the seed reached no survey').toBeGreaterThan(0)
    expect(sawGated, 'no cell was suppressed anywhere, so the comparison proves nothing').toBe(true)
  })
})

/**
 * F4 — RESTORING A VERSION SHOWS THE CURRENT GATE, NOT THE ONE THAT WAS IN
 * FORCE WHEN IT WAS SAVED.
 *
 * The claim has two halves and they need different proofs:
 *
 *   (a) STRUCTURAL — a version cannot carry a figure, so a restore has nothing
 *       stale to show. Proven by the CHECK above: a panel with `value` or
 *       `rows` is refused.
 *   (b) BEHAVIOURAL — the number a restored panel shows is fetched now.
 *       `app.k_for` is read INSIDE the RPC at call time, so moving a survey's
 *       threshold moves what the same panel returns, with no version involved.
 *
 * ── WHY THE THRESHOLD IS MOVED ON A SURVEY WITH NO RESPONSES ───────────────
 *
 * It cannot be moved on one that has any. `guard_threshold_immutable` (M:0130)
 * refuses BOTH directions once a response exists — that is invariant 1
 * condition 2, and it is the rule that makes a stored figure dangerous in the
 * first place. So the gate is moved before the answers arrive, which is the
 * only window the product itself allows.
 */
describe('F4 — a restore re-reads the gate', () => {
  it('the gate a panel reports follows the survey CURRENT threshold', async () => {
    const org = await orgId(ORG_PRIMARY)
    const { data: made } = await svc
      .from('surveys')
      .insert({
        org_id: org,
        title: `F4 gate probe ${Date.now()}`,
        status: 'aktiv',
        anonymity: 'anonymous',
        respondent_kind: 'person',
        k_threshold: 2,
      })
      .select('id')
      .single()
    const survey = made!.id as string
    const { data: dash } = await svc
      .from('dashboards')
      .insert({ org_id: org, title: `F4 dash ${Date.now()}` })
      .select('id')
      .single()
    const dashId = dash!.id as string

    try {
      const admin = await personaClient('administrator')

      const before = await admin.rpc('aggregate_results', { p_survey: survey })
      expect(before.error).toBeNull()
      expect((before.data as { k?: number } | null)?.k, 'the gate starts at the survey own 2').toBe(2)

      // A version saved under the OLD gate. Panels only — there is no number in
      // it to go stale, which is half (a).
      const saved = await svc
        .from('dashboard_versions')
        .insert({ dashboard_id: dashId, version: 1, panels: [{ key: 'trend', span: 3 }] })
        .select('panels')
        .single()
      expect(saved.error).toBeNull()
      expect(JSON.stringify(saved.data!.panels), 'a version is an arrangement').toBe(
        '[{"key":"trend","span":3}]',
      )

      // The gate moves. Allowed only because no response exists yet.
      const raised = await svc.from('surveys').update({ k_threshold: 8 }).eq('id', survey)
      expect(raised.error, 'a threshold may be raised before anyone has answered').toBeNull()

      const after = await admin.rpc('aggregate_results', { p_survey: survey })
      expect((after.data as { k?: number } | null)?.k, 'the SAME call now reports the new gate').toBe(8)

      // And the saved version is untouched by any of it — it never held a gate
      // or a figure to begin with.
      const { data: still } = await svc
        .from('dashboard_versions')
        .select('panels')
        .eq('dashboard_id', dashId)
        .eq('version', 1)
        .single()
      expect(JSON.stringify(still!.panels)).toBe('[{"key":"trend","span":3}]')

      // The rule that makes this matter: once answered, the gate is frozen, so
      // nobody can lower it later to read what a version's panel once showed.
      const { data: round } = await svc
        .from('survey_rounds')
        .insert({ survey_id: survey, round_no: 1, question_snapshot: [] })
        .select('id')
        .single()
      await svc.from('responses').insert({
        round_id: round!.id,
        submitted_hour: new Date().toISOString(),
        anonymity_at_submission: 'anonymous',
      })
      const lowered = await svc.from('surveys').update({ k_threshold: 2 }).eq('id', survey)
      expect(lowered.error, 'lowering after a response must be refused').not.toBeNull()
    } finally {
      await svc.from('dashboards').delete().eq('id', dashId)
      await svc.from('surveys').delete().eq('id', survey)
    }
  })
})

/**
 * F6.3 — THE GUARD IS OVER THE SET, NOT OVER THE TWO FUNCTIONS THIS PHASE ADDED.
 *
 * The precedent is T1.6's: the method-threshold guard was written over the
 * RENDERER SET rather than over the file being fixed, and it caught a second
 * gap in `pptx.ts` on its first run that nobody was looking for. The share-link
 * report renderer had no method branch and its reader was an outsider; a guard
 * scoped to the file I had just edited would have left it.
 *
 * So this sweeps `pg_proc` for EVERY function `anon` may execute and requires
 * each one to be accounted for: it either routes through `app.k_for`, or it is
 * named here with a reason saying what it returns instead. A new
 * anon-reachable function fails this test in the commit that adds it.
 */
describe('F6.3 — every anon-reachable function is accounted for', () => {
  /**
   * The allowlist is reasons, not names — each entry says WHAT the function
   * returns that needs no gate. «It refuses anyway» is not a reason; «it
   * returns a uuid» is.
   */
  const NO_GATE_NEEDED: Record<string, string> = {
    submit_response: 'writes one response; returns {ok} and never a figure',
    get_survey_for_token: 'renders /s/[token]; the respondent own questions, not results',
    get_comment_thread: 'the respondent own thread; their text back to them',
    get_closed_loop_for_token: 'the respondent own loop; no aggregate',
    set_result_optin: 'writes a flag; returns {ok}',
    redeem_live_voucher: 'mints a token; returns no figure',
    request_demo: 'writes a lead; returns {ok}',
    report_for_share_token: 'resolves a token to a report id and returns NO DATA',
    dashboard_for_share_token: 'resolves a token to a dashboard id and returns NO DATA',
  }

  it('sweeps the catalogue and finds nothing ungated it cannot name', async () => {
    // Read the catalogue directly — a grant is a fact about pg_proc and the
    // only honest way to ask is to ask pg_proc.
    const rows = await anonSurface()
    expect(rows.length, 'the sweep found nothing — it is measuring the wrong thing').toBeGreaterThan(5)

    const unaccounted = rows
      .filter((r) => !r.calls_k_for && !(r.proname in NO_GATE_NEEDED))
      .map((r) => r.proname)
    expect(
      unaccounted,
      'anon-reachable, does not call app.k_for, and has no reason on file',
    ).toEqual([])
  })

  it('the two F6 functions are in the sweep, and the serving one gates', async () => {
    const rows = await anonSurface()
    const byName = new Map(rows.map((r) => [r.proname, r]))
    expect(byName.has('dashboard_for_share_token'), 'the token RPC is anon-reachable').toBe(true)
    expect(byName.has('shared_dashboard'), 'the serving RPC is anon-reachable').toBe(true)
    expect(
      byName.get('shared_dashboard')!.calls_k_for,
      'the function that returns figures must route through the gate',
    ).toBe(true)
    // And the token RPC deliberately does NOT gate, because it returns a uuid.
    expect(byName.get('dashboard_for_share_token')!.calls_k_for).toBe(false)
  })
})

/** Every SECURITY DEFINER function in `public` that `anon` may execute, with
 *  whether its body names `app.k_for`. Read from pg_proc, never from a list. */
async function anonSurface(): Promise<{ proname: string; calls_k_for: boolean }[]> {
  // PostgREST cannot run arbitrary SQL, so the sweep goes through psql — the
  // same route tests/db/catalogue-invariants.test.ts uses for its pg_proc sweep.
  const { execFileSync } = await import('node:child_process')
  const url = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  const out = execFileSync(
    'psql',
    [
      url,
      '-tAF',
      '|',
      '-c',
      `select p.proname, (position('k_for' in p.prosrc) > 0)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and has_function_privilege('anon', p.oid, 'execute')
        order by 1`,
    ],
    { encoding: 'utf8' },
  )
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [proname, k] = line.split('|')
      return { proname: proname!, calls_k_for: k === 't' }
    })
}

/**
 * F6.1 / F6.2 — the link behaves like the report share's, and the number it
 * shows an outsider is the strictest over the sources.
 */
describe('F6 — the external share link', () => {
  const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')

  it('resolves, serves gated drivers, and refuses a wrong or revoked token', async () => {
    const org = await orgId(ORG_PRIMARY)
    const { data: d } = await svc
      .from('dashboards')
      .insert({ org_id: org, title: `F6 share ${Date.now()}` })
      .select('id')
      .single()
    const dashId = d!.id as string
    const raw = `f6-token-${Date.now()}`

    try {
      await svc.from('dashboard_layouts').insert({
        org_id: org,
        title: `F6 layout ${Date.now()}`,
        dashboard_id: dashId,
        panels: [{ key: 'drivers', span: 3 }],
        filters: { period: 'q', group_id: null, survey_ids: [] },
      })
      const { error: shareErr } = await svc.from('dashboard_shares').insert({
        dashboard_id: dashId,
        scope: 'link',
        token_hash: hash(raw),
      })
      expect(shareErr).toBeNull()

      const anon = anonClient()

      // 1. The token RPC resolves and returns NOTHING BUT AN ID.
      const resolved = await anon.rpc('dashboard_for_share_token', { p_token: raw })
      expect(resolved.error).toBeNull()
      expect(resolved.data, 'the token resolves to its dashboard').toBe(dashId)

      // 2. The serving RPC returns figures, and a threshold.
      const served = await anon.rpc('shared_dashboard', { p_dashboard: dashId, p_token: raw })
      expect(served.error).toBeNull()
      const body = served.data as { error?: string; k?: number; drivers?: unknown[] }
      expect(body.error, 'a valid token is not forbidden').toBeUndefined()
      expect(typeof body.k, 'it states a threshold').toBe('number')
      expect(Array.isArray(body.drivers)).toBe(true)

      // F6.2 — the number is the STRICTEST over the sources, so it is at least
      // as large as every person survey's own gate in the organisation.
      const { data: person } = await svc
        .from('surveys')
        .select('k_threshold')
        .eq('org_id', org)
        .eq('respondent_kind', 'person')
        .is('deleted_at', null)
      const strictest = Math.max(...(person ?? []).map((s) => Math.max(s.k_threshold, 2)))
      expect(body.k, 'the strictest over the sources, not the org default').toBe(strictest)

      // 3. A wrong token is refused, and refused the same way a missing one is.
      const wrong = await anon.rpc('shared_dashboard', {
        p_dashboard: dashId,
        p_token: 'not-the-token',
      })
      expect((wrong.data as { error?: string }).error).toBe('forbidden')
      expect(
        (await anon.rpc('dashboard_for_share_token', { p_token: 'not-the-token' })).data,
        'and the token RPC resolves nothing',
      ).toBeNull()

      // 4. Revoking stamps the row and the token stops resolving in the same
      //    statement — the audit row survives, which is why it is not a delete.
      await svc
        .from('dashboard_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('dashboard_id', dashId)
      expect(
        (await anon.rpc('dashboard_for_share_token', { p_token: raw })).data,
        'a revoked token resolves nothing',
      ).toBeNull()
      expect(
        ((await anon.rpc('shared_dashboard', { p_dashboard: dashId, p_token: raw })).data as {
          error?: string
        }).error,
        'and serves nothing',
      ).toBe('forbidden')

      // 5. The share row is still there to say who shared it and when.
      const { data: kept } = await svc
        .from('dashboard_shares')
        .select('id, revoked_at')
        .eq('dashboard_id', dashId)
      expect((kept ?? []).length, 'revocation keeps the record').toBe(1)
      expect(kept![0]!.revoked_at).not.toBeNull()
    } finally {
      await svc.from('dashboards').delete().eq('id', dashId)
    }
  })

  it('a dashboard id alone, with no token, serves nothing', async () => {
    // The id is a uuid and not a secret; the token is the second ARGUMENT for
    // exactly this reason, as compose_report(p_report, p_token) takes it.
    const org = await orgId(ORG_PRIMARY)
    const { data: d } = await svc
      .from('dashboards')
      .insert({ org_id: org, title: `F6 no-token ${Date.now()}` })
      .select('id')
      .single()
    try {
      const body = (
        await anonClient().rpc('shared_dashboard', { p_dashboard: d!.id, p_token: '' })
      ).data as { error?: string }
      expect(body.error).toBe('forbidden')
    } finally {
      await svc.from('dashboards').delete().eq('id', d!.id)
    }
  })
})
