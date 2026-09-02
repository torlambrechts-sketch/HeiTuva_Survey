import { beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  leserClient,
  outsiderClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * Access rules asserted through real persona sessions.
 *
 * Every assertion uses a persona client. The service client appears only to
 * look up fixture ids — if an assertion used it, the test would pass whether
 * or not the policy it claims to check exists.
 */
let admin: Client, redaktor: Client, leser: Client, outsider: Client
let orgId: string, otherOrgId: string, surveyId: string

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
    const { error } = await redaktor
      .from('surveys')
      .insert({ org_id: orgId, title: 'Redaktør-utkast' })
    expect(error).toBeNull()
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
    expect(payload.questions[0]!.n).toBe(6)
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
    const { data: g } = await svc.from('groups').select('id').eq('org_id', orgId).single()

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
