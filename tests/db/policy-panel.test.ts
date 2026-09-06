import { beforeAll, describe, expect, it } from 'vitest'
import { serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * The policy panel's server-side rules (DECISIONS Q36, confirmed 2026-09-06).
 *
 * The threshold now has a ceiling as well as a floor, and both live in the
 * DATABASE. Q17 put the floor in a CHECK precisely so a writer that is not the
 * UI could not go under it; the ceiling gets the same treatment, because an
 * action's `z.number().max(10)` is a rule about one caller and a CHECK is a rule
 * about the column.
 *
 * These assert the constraint directly, with the service role — the strongest
 * writer there is. If the ceiling held only in `setSurveyPolicy`, every one of
 * these would pass while a psql session, a future action, or a migration could
 * still write 50.
 */
let svc: Client
let orgId: string
let surveyId: string

beforeAll(async () => {
  svc = serviceClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id

  // A survey of this suite's own, so the assertions do not depend on which
  // fixtures exist or what another test left behind (Gate 5a2).
  const { data: made, error } = await svc
    .from('surveys')
    .insert({
      org_id: orgId,
      title: `Terskeltak-${Date.now()}`,
      status: 'utkast',
      respondent_kind: 'person',
      k_threshold: 5,
    })
    .select('id')
    .single()
  if (error) throw new Error(`could not create the fixture survey: ${error.message}`)
  surveyId = made!.id
})

describe('(Q36) the threshold ceiling is the database’s rule, not one caller’s', () => {
  it('refuses 11 — one past the ceiling', async () => {
    const { error } = await svc
      .from('surveys')
      .update({ k_threshold: 11 })
      .eq('id', surveyId)

    expect(error, 'the database must refuse a threshold above 10').not.toBeNull()
    expect(error!.message).toMatch(/k_threshold/)

    // And nothing was written. A refusal that left the row changed would be a
    // different bug wearing the same error.
    const { data } = await svc.from('surveys').select('k_threshold').eq('id', surveyId).single()
    expect(data!.k_threshold, 'the refused write must not have landed').toBe(5)
  })

  it('POSITIVE CONTROL: accepts 10 — the ceiling itself', async () => {
    const { error } = await svc
      .from('surveys')
      .update({ k_threshold: 10 })
      .eq('id', surveyId)

    expect(error, 'ten is the panel’s top chip and must be writable').toBeNull()

    const { data } = await svc.from('surveys').select('k_threshold').eq('id', surveyId).single()
    expect(data!.k_threshold).toBe(10)
  })

  it('POSITIVE CONTROL: still refuses 2 — the floor Q17 put there is untouched', async () => {
    const { error } = await svc
      .from('surveys')
      .update({ k_threshold: 2 })
      .eq('id', surveyId)

    expect(error, 'the floor must survive the ceiling being added').not.toBeNull()
    expect(error!.message).toMatch(/k_threshold/)
  })

  it('mirrors the organisation default, which is where the range came from', async () => {
    // `organizations.default_k_threshold` has carried 3-10 since M:0034:19-20.
    // A survey that could hold 50 while the organisation default could not was
    // the inconsistency Q36 closed, so the two ranges are asserted together:
    // if someone widens one, this fails rather than the two drifting quietly.
    const { error: high } = await svc
      .from('organizations')
      .update({ default_k_threshold: 11 })
      .eq('id', orgId)
    expect(high, 'the organisation default must refuse 11 too').not.toBeNull()

    const { error: ok } = await svc
      .from('organizations')
      .update({ default_k_threshold: 10 })
      .eq('id', orgId)
    expect(ok, 'and accept 10').toBeNull()

    // Put it back: the demo organisation ships at 5 and other suites read it.
    await svc.from('organizations').update({ default_k_threshold: 5 }).eq('id', orgId)
  })
})
