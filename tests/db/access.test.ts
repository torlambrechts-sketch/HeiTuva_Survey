import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  leserClient,
  outsiderClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_OTHER, ORG_PRIMARY, GROUP_PRIMARY } from './personas'

/**
 * Access rules asserted through real persona sessions.
 *
 * Every assertion uses a persona client. The service client appears only to
 * look up fixture ids — if an assertion used it, the test would pass whether
 * or not the policy it claims to check exists.
 */
let admin: Client, redaktor: Client, leser: Client, outsider: Client
let orgId: string, otherOrgId: string, surveyId: string
/** Set by «redaktor may create a survey»; removed by the `afterAll` below. */
let createdSurveyId: string | null = null

/**
 * The teardown READS its own error and throws it.
 *
 * A teardown whose rejection nobody reads is a leak that reports success —
 * which is how the twelve drafts accumulated unseen. If this delete ever stops
 * working, the suite must go red here rather than quietly resume leaking.
 */
afterAll(async () => {
  if (!createdSurveyId) return
  const { error } = await serviceClient().from('surveys').delete().eq('id', createdSurveyId)
  if (error) throw new Error(`teardown: could not remove the created survey: ${error.message}`)
})

beforeAll(async () => {
  ;[admin, redaktor, leser, outsider] = await Promise.all([
    adminClient(),
    redaktorClient(),
    leserClient(),
    outsiderClient(),
  ])

  const svc = serviceClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id

  const { data: survey } = await svc
    .from('surveys')
    .select('id')
    .eq('org_id', orgId)
    .eq('title', 'Arbeidsmiljø — månedlig')
    // `.limit(1)` before `.single()`, everywhere the filter is not a primary
    // key. A title is not unique — "Kopier som ny runde" and the round-trip
    // harness both create surveys in this org — and `.single()` errors on more
    // than one row, so without the limit this suite's green depends on nothing
    // else ever writing here (VERIFY.md Gate 5a2).
    .limit(1)
    .single()
  surveyId = survey!.id
})

describe('persona sessions are real', () => {
  it('each persona resolves to a distinct authenticated user', async () => {
    const ids = await Promise.all(
      [admin, redaktor, leser, outsider].map(async (c) => (await c.auth.getUser()).data.user?.id),
    )
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(4)
  })

  it('the anon client has no session', async () => {
    const { data } = await anonClient().auth.getUser()
    expect(data.user).toBeNull()
  })
})

describe('org scoping', () => {
  it('members of the org see its surveys', async () => {
    const { data } = await admin.from('surveys').select('id').eq('org_id', orgId)
    expect(data!.length).toBeGreaterThan(0)
  })

  it('an outsider sees none of them', async () => {
    const { data } = await outsider.from('surveys').select('id').eq('org_id', orgId)
    expect(data).toEqual([])
  })

  it('an outsider cannot read the org row', async () => {
    const { data } = await outsider.from('organizations').select('id').eq('id', orgId)
    expect(data).toEqual([])
  })

  it('members cannot read the other org', async () => {
    const { data } = await admin.from('organizations').select('id').eq('id', otherOrgId)
    expect(data).toEqual([])
  })
})

describe('role boundaries', () => {
  it('leser cannot invite members', async () => {
    const { error } = await leser
      .from('org_members')
      .insert({ org_id: orgId, email: 'sneak@example.test', role: 'leser', status: 'invited' })
    expect(error).not.toBeNull()
  })

  it('redaktor cannot invite members either — that is administrator only', async () => {
    const { error } = await redaktor
      .from('org_members')
      .insert({ org_id: orgId, email: 'sneak2@example.test', role: 'leser', status: 'invited' })
    expect(error).not.toBeNull()
  })

  it('redaktor may create a survey', async () => {
    /* The row is KEPT so the assertion is about the policy and not about a
       transaction — and then removed in `afterAll`, because this insert lands
       in the DEMO organisation, which is the one every manifest state
       photographs.
    
       It leaked for twelve runs. `select count(*) … where title =
       'Redaktør-utkast'` returned 12 against a seed that makes one, one per
       suite run, and the twelfth pushed a survey row's centre below the 844px
       fold on `undersokelser/row-menu` — where `verify:responsive`'s occlusion
       guard cannot run `elementFromPoint` and scores the unmeasurable case as
       «not occluded». Four blockers at 320px, on a screen nobody had touched.
       D245's shape (a gate photographing a test's residue) with a longer fuse.
    
       The file already carried the symptom's workaround: the `.limit(1)` in
       `beforeAll` exists because «a title is not unique … the round-trip
       harness both create surveys in this org». That made this suite survive
       the residue instead of stopping it. */
    const { data, error } = await redaktor
      .from('surveys')
      .insert({ org_id: orgId, title: 'Redaktør-utkast' })
      .select('id')
      .single()
    expect(error).toBeNull()
    createdSurveyId = data!.id
  })

  it('leser may not create a survey', async () => {
    const { error } = await leser.from('surveys').insert({ org_id: orgId, title: 'Leser-utkast' })
    expect(error).not.toBeNull()
  })
})

describe('k-anonymity through persona sessions', () => {
  it('a survey above the threshold returns real data to a member', async () => {
    const { data } = await admin.rpc('aggregate_results', { p_survey: surveyId })
    const payload = data as { questions: { n: number | null; insufficient_data?: boolean }[] }
    expect(payload.questions[0]!.insufficient_data).toBeUndefined()
    // At or above the threshold, not exactly the seed count. The behaviour
    // under test is "a round above k reports a real n"; pinning the number
    // made this fail the moment the respondent harness submitted a genuine
    // answer to the same round, which is a correct thing for it to do.
    expect(payload.questions[0]!.n).toBeGreaterThanOrEqual(5)
  })

  it('the same call from an outsider is refused', async () => {
    const { data } = await outsider.rpc('aggregate_results', { p_survey: surveyId })
    expect(data).toMatchObject({ error: 'forbidden' })
  })

  it('a survey below the threshold reports insufficient_data', async () => {
    const svc = serviceClient()
    const { data: below } = await svc
      .from('surveys')
      .select('id')
      .eq('org_id', orgId)
      .eq('title', 'Psykososial kartlegging')
      .limit(1)
      .single()

    const { data } = await admin.rpc('aggregate_results', { p_survey: below!.id })
    const payload = data as { questions: { n: number | null; insufficient_data?: boolean }[] }
    expect(payload.questions[0]!.insufficient_data).toBe(true)
    expect(payload.questions[0]!.n).toBeNull()
  })

  it('leser cannot filter quotes by group', async () => {
    const svc = serviceClient()
    const { data: q } = await svc
      .from('survey_questions')
      .select('id')
      .eq('survey_id', surveyId)
      .eq('type', 'text')
      .single()
    // Pinned to the seeded group by name. Filtering on org alone made this
    // assertion depend on the org having exactly one group, and it broke the
    // moment the Gate 2a round-trip created a second one — the failure that
    // exposed the whole class.
    const { data: g } = await svc
      .from('groups')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', GROUP_PRIMARY)
      .limit(1)
      .single()

    const { data } = await leser.rpc('get_quotes', {
      p_survey: surveyId,
      p_question: q!.id,
      p_group: g!.id,
    })
    expect(data).toMatchObject({ error: 'forbidden' })
  })
})

describe('the answers vault stays closed to every persona', () => {
  it('no persona can select from responses or answers', async () => {
    for (const [name, client] of [
      ['administrator', admin],
      ['redaktor', redaktor],
      ['leser', leser],
      ['anon', anonClient()],
    ] as const) {
      const r = await client.from('responses').select('id')
      const a = await client.from('answers').select('id')
      expect(r.data ?? [], `${name} responses`).toEqual([])
      expect(a.data ?? [], `${name} answers`).toEqual([])
    }
  })
})

describe('survey_response_counts exposes participation, never answers', () => {
  it('a member gets a count for every survey in their own org', async () => {
    const { data, error } = await leser.rpc('survey_response_counts', { p_org: orgId })
    expect(error).toBeNull()
    // The seed has one survey above k=5 and one below, so a real count must be
    // present and non-zero somewhere — a silently-empty result is exactly what
    // an aggregate embed on `responses` would have produced.
    expect((data ?? []).length).toBeGreaterThan(0)
    expect((data ?? []).some((r) => Number(r.responses) > 0)).toBe(true)
  })

  it('an outsider counts nothing in another org', async () => {
    // SECURITY DEFINER bypasses RLS, so the org check inside the function is
    // the only thing standing between two tenants.
    const { data, error } = await outsider.rpc('survey_response_counts', { p_org: orgId })
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  it('anon cannot execute it at all', async () => {
    const { error } = await anonClient().rpc('survey_response_counts', { p_org: orgId })
    expect(error).not.toBeNull()
  })

  it('counting does not open a path to the answers themselves', async () => {
    // The RPC returns totals only; the vault stays shut for the same persona.
    await leser.rpc('survey_response_counts', { p_org: orgId })
    const r = await leser.from('responses').select('id')
    const a = await leser.from('answers').select('id')
    expect(r.data ?? []).toEqual([])
    expect(a.data ?? []).toEqual([])
  })
})
