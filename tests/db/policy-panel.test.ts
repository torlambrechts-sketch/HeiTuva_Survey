import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, redaktorClient, serviceClient, type Client } from './clients'
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
const made: string[] = []

let svc: Client
let admin: Client
let redaktor: Client
let orgId: string
let surveyId: string

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor] = await Promise.all([adminClient(), redaktorClient()])
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id

  // A survey of this suite's own, so the assertions do not depend on which
  // fixtures exist or what another test left behind (Gate 5a2).
  const { data: row, error } = await svc
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
  surveyId = row!.id
  made.push(surveyId)
})

/**
 * These fixtures live in the DEMO organisation, which is also what the browser
 * checks render. Leaving them behind changed which survey `/resultater` opened
 * — its picker is ordered, and a new row at the top gave a different screen
 * with two fewer focusable controls, which broke `verify:interaction`'s focus
 * assertion four steps away from anything to do with policy.
 *
 * So the suite cleans up after itself. Gate 5a2's rule is usually read as "do
 * not depend on what else exists"; this is its other half — do not become what
 * else exists.
 */
afterAll(async () => {
  if (made.length) await svc.from('surveys').delete().in('id', made)
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

/**
 * The three refusals `app.guard_survey_policy` (M:0034:76-121) enforces. The
 * panel disables what these would refuse, but the panel is a screen — these
 * assert the rule where it actually lives, through persona sessions rather
 * than the service role, because a rule asserted with the service key is a rule
 * proven against the one caller it does not apply to.
 */
describe('the guard refuses what the panel disables', () => {
  it('refuses any policy change once the survey is sent', async () => {
    const { data: sent } = await svc
      .from('surveys')
      .insert({
        org_id: orgId,
        title: `Låst-etter-svar-${Date.now()}`,
        status: 'aktiv',
        respondent_kind: 'person',
        k_threshold: 5,
        policy_locked: true,
      })
      .select('id')
      .single()
    made.push(sent!.id)

    const { error } = await admin!
      .from('surveys')
      .update({ k_threshold: 8 })
      .eq('id', sent!.id)

    expect(error, 'a locked survey must refuse a threshold change').not.toBeNull()
    expect(error!.message).toMatch(/policy_locked/)

    const { data } = await svc.from('surveys').select('k_threshold').eq('id', sent!.id).single()
    expect(data!.k_threshold, 'and must not have written it anyway').toBe(5)
  })

  it('refuses a policy change on a statutory pack, whoever asks', async () => {
    // `psykososial-kartlegging` carries `policy.locked` — the law sets the
    // policy, so even an administrator may not move it.
    const { data: packed } = await svc
      .from('surveys')
      .insert({
        org_id: orgId,
        title: `Pakkelåst-${Date.now()}`,
        status: 'utkast',
        respondent_kind: 'person',
        k_threshold: 5,
        template_pack_key: 'psykososial-kartlegging',
      })
      .select('id')
      .single()
    made.push(packed!.id)

    const { error } = await admin!
      .from('surveys')
      .update({ anonymity: 'named' })
      .eq('id', packed!.id)

    expect(error, 'a statutory pack governs the policy').not.toBeNull()
    expect(error!.message).toMatch(/policy_locked/)
  })

  it('a redaktør who cannot see the survey is stopped by RLS, not by the guard', async () => {
    // This distinction is the one VERIFY.md Gate 2b insists on: an empty result
    // is not a denial. `surveys_upd` admits a redaktør only for a survey they
    // created or were added to, so for any other survey the update matches zero
    // rows and returns NO error. Asserting `threshold_admin_only` here would
    // pass for the wrong reason and would keep passing if the guard were
    // deleted.
    await svc.from('surveys').update({ k_threshold: 5 }).eq('id', surveyId)

    const { data, error } = await redaktor!
      .from('surveys')
      .update({ k_threshold: 8 })
      .eq('id', surveyId)
      .select('id')

    expect(error, 'RLS filters the row rather than raising').toBeNull()
    expect(data, 'and nothing was updated').toEqual([])

    const { data: after } = await svc
      .from('surveys')
      .select('k_threshold')
      .eq('id', surveyId)
      .single()
    expect(after!.k_threshold, 'the row is untouched').toBe(5)
  })

  it('refuses a redaktør who CAN see it — the guard, with RLS out of the way', async () => {
    // Make the redaktør an editor so `surveys_upd` admits them. Now the only
    // thing left to refuse the write is `guard_survey_policy`, which is what
    // this suite is about.
    await svc.from('surveys').update({ k_threshold: 5 }).eq('id', surveyId)

    const { data: member } = await svc
      .from('org_members')
      .select('id, user_id, role')
      .eq('org_id', orgId)
      .eq('role', 'redaktor')
      .limit(1)
      .single()
    await svc.from('survey_editors').insert({ survey_id: surveyId, member_id: member!.id })

    const { error } = await redaktor!
      .from('surveys')
      .update({ k_threshold: 8 })
      .eq('id', surveyId)

    expect(error, 'the threshold is administrator-only by default').not.toBeNull()
    expect(error!.message).toMatch(/threshold_admin_only/)

    const { data: after } = await svc
      .from('surveys')
      .select('k_threshold')
      .eq('id', surveyId)
      .single()
    expect(after!.k_threshold, 'and the refusal left the row alone').toBe(5)
  })

  it('POSITIVE CONTROL: an administrator may move an unlocked threshold, and it is audited', async () => {
    // Without this the three refusals above would also pass if nobody could
    // ever write the column.
    const { error } = await admin!
      .from('surveys')
      .update({ k_threshold: 8 })
      .eq('id', surveyId)
    expect(error, 'an administrator may set the threshold on an open draft').toBeNull()

    const { data: audit } = await svc
      .from('audit_events')
      .select('action, meta')
      .eq('action', 'threshold.change')
      .eq('target', surveyId)
      .order('created_at', { ascending: false })
      .limit(1)
    expect(audit?.[0]?.meta, 'the change is on the record').toMatchObject({ to: 8 })
  })
})
