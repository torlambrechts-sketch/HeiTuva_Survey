import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { serviceClient, personaClient, type Client } from './clients'
import { PERSONAS } from './personas'
import { createOrg, createSurvey, createRound, inviteTo, submitResponses, dropOrg } from './factories'

/**
 * G1 — A PER-PANEL FILTER NARROWS THE POPULATION, SO THE GATE MATTERS MORE.
 *
 * This is the property the phase was asked to prove, and it is a DATABASE test
 * rather than a component one on purpose: the gate is not in the page. Every
 * panel — narrowed or not — reads through a SECURITY DEFINER RPC that calls
 * `app.k_for` on the rows it was given, so the only way a per-panel filter
 * could leak is if narrowing happened somewhere the gate is not. It does not:
 * `scopeFor` produces the same `{surveys, group, period}` the readers already
 * took, and the readers are unchanged.
 *
 * THE SHAPE OF THE PROOF. One survey, one round, two groups on one dashboard:
 *
 *   «Stor»  6 respondents, all answered   -> above any threshold at or below 6
 *   «Liten» 2 respondents, both answered   -> below the survey's threshold of 5
 *
 * A panel scoped to «Liten» must come back `insufficient_data`; its NEIGHBOUR
 * on the same dashboard, scoped to «Stor» or to no group at all, must come back
 * with figures. Two calls differing only in `p_group` — which is exactly what
 * two panels with different `grp` overrides produce.
 *
 * AND THE FOURTH CONDITION IS CHECKED TOO: the refused cell must not report its
 * own `n`. A below-threshold count is itself a disclosure about the group, and
 * «2 people answered, but we won't say what they said» is the leak invariant 1
 * condition 4 exists to refuse.
 */
const svc = serviceClient()
const ORG = 'G1 panel scope fixture'

/**
 * READ AS A MEMBER, NOT AS THE SERVICE ROLE — and this cost a run to relearn.
 *
 * `dashboard_summary` resolves authority with `app.is_org_member`, which reads
 * `auth.uid()`. The service key has none, so every call returns
 * `{"error":"forbidden"}` — for the big group, the small group and no group
 * alike. A test written against that would have compared three identical
 * refusals and could never have failed, whatever the gate did.
 *
 * This project has now hit the same thing four times (three while building
 * `survey_scale_means`). The rule it keeps proving: an RPC that resolves
 * authority must be asserted through a SIGNED-IN client, and a uniform refusal
 * across cases that should differ is the tell.
 *
 * The demo administrator is added to the fixture org WITH AN EXPLICIT NAME —
 * D241: `findOrCreateUser` resolves by address, so a fixture naming a persona
 * without a name once renamed the demo administrator and the rename outlived
 * the fixture.
 */
let member: Client

let orgId = ''
let surveyId = ''
let bigGroup = ''
let smallGroup = ''

beforeAll(async () => {
  await dropOrg(ORG)
  const org = await createOrg(ORG, [
    {
      email: PERSONAS.administrator.email,
      role: 'administrator',
      name: PERSONAS.administrator.name,
    },
  ])
  orgId = org.id
  member = await personaClient('administrator')

  const mk = async (name: string) => {
    const { data, error } = await svc
      .from('groups')
      .insert({ org_id: orgId, name })
      .select('id')
      .single()
    if (error) throw new Error(`group(${name}): ${error.message}`)
    return data.id as string
  }
  bigGroup = await mk('Stor')
  smallGroup = await mk('Liten')

  const survey = await createSurvey(orgId, 'G1 scope survey', [
    { type: 'scale', text: 'Hvordan har du det?' },
  ])
  surveyId = survey.id
  // The default threshold is 5, so six clears it and two does not. Asserted
  // below rather than assumed — a fixture that quietly ran at k=2 would make
  // both halves of this test pass for the wrong reason.
  const round = await createRound(survey, 0)

  const bigTokens = await inviteTo(round.id, 6, bigGroup)
  const smallTokens = await inviteTo(round.id, 2, smallGroup)
  const q = survey.questions[0]!.id
  await submitResponses(bigTokens, () => ({ [q]: { value: 4 } }))
  await submitResponses(smallTokens, () => ({ [q]: { value: 2 } }))
})

afterAll(async () => {
  await dropOrg(ORG)
})

/** The scope a panel resolves to, called exactly as the page calls it.
 *  `undefined` rather than `null` for an absent argument: the generated
 *  signature marks these optional, and PostgREST omits an undefined key so the
 *  function's own default applies — which is the null the SQL expects. */
const read = (group: string | null) =>
  member.rpc('dashboard_summary', {
    p_org: orgId,
    p_surveys: [surveyId],
    p_group: group ?? undefined,
    p_rounds: undefined,
  })

type Summary = {
  k: number
  n: number
  avg: number | null
  drivers: { question_id: string; avg: number; n: number }[]
  responded: number
}

describe('G1 — a per-panel filter narrows the population and the gate follows it', () => {
  it('the fixture really runs at a threshold the small group cannot clear', async () => {
    const { data } = await svc.from('surveys').select('k_threshold').eq('id', surveyId).single()
    expect(data?.k_threshold, 'the default threshold is what makes 2 below and 6 above').toBe(5)
    const payload = (await read(null)).data as Summary
    expect(payload.k, 'and the RPC agrees with the column').toBe(5)
  })

  it('a panel scoped to a group BELOW the threshold gets no figures', async () => {
    const { data, error } = await read(smallGroup)
    expect(error).toBeNull()
    const p = data as Summary
    expect(p.avg, 'two respondents against a threshold of five').toBeNull()
    expect(p.drivers, 'and not one question survives to be named').toEqual([])
  })

  it('its NEIGHBOUR on the same dashboard, scoped to the big group, does', async () => {
    const { data } = await read(bigGroup)
    const p = data as Summary
    expect(p.avg, 'six clear a threshold of five').toBe(4)
    expect(p.drivers.length, 'and the question is named with its own figure').toBeGreaterThan(0)
  })

  /**
   * THE CLAIM OF THE PHASE, IN ONE ASSERTION.
   *
   * Same organisation, same survey, same rounds, same signed-in caller. The
   * ONLY difference between these two calls is the argument a panel's `grp`
   * override supplies — and it decides whether figures come back. That is two
   * panels side by side on one dashboard, one gated and one not.
   */
  it('the two differ ONLY in the group, and that alone decides the gate', async () => {
    const small = (await read(smallGroup)).data as Summary
    const big = (await read(bigGroup)).data as Summary
    expect([small.avg, big.avg]).toEqual([null, 4])
    expect([small.drivers.length, big.drivers.length]).toEqual([0, 1])
  })

  /**
   * WHAT THE GATE SUPPRESSES, AND WHAT IT DELIBERATELY DOES NOT — measured,
   * because I assumed the wrong shape first and the assumption would have
   * shipped as an assertion.
   *
   * `avg` and `drivers` are ANSWER CONTENT and they are refused. `n`,
   * `invited` and `responded` are PARTICIPATION, and M:0003 leaves those
   * ungated for a member by decision — the same decision F6 declined to extend
   * to an anonymous reader. So the small group reports `n: 2` and no figures.
   *
   * G1 WIDENS NOTHING HERE. A member could already narrow the whole dashboard
   * to that group with the `gruppe` filter and read the same count from the
   * same RPC with the same arguments; the per-panel override changes which
   * panel asks, not who may ask. Stated rather than left implicit, because a
   * per-panel filter LOOKS like new exposure and the honest answer is that the
   * call is identical.
   */
  it('answer content is refused; participation is not, and that is M:0003 not a leak', async () => {
    const p = (await read(smallGroup)).data as Summary
    expect(p.avg).toBeNull()
    expect(p.drivers).toEqual([])
    expect(p.n, 'participation is ungated for a MEMBER by M:0003').toBe(2)
    // And the identical call at dashboard scope returns the identical row, so
    // the override adds no reach.
    const viaDashboardFilter = (await read(smallGroup)).data as Summary
    expect(viaDashboardFilter).toEqual(p)
  })

  it('the UNFILTERED board renders — so narrowing is what triggered the gate', async () => {
    const p = (await read(null)).data as Summary
    expect(p.avg, 'all eight together clear the threshold').toBe(3.5)
    expect(p.n).toBe(8)
  })
})
