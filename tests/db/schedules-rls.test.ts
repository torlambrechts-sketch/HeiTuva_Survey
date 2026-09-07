import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  leserClient,
  outsiderClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * DECISIONS Q23 — a viewer may READ a schedule; writes stay with editors.
 *
 * The ↻ chip («Runde 3 av 12 · neste 14. mars») is on the survey row, the
 * context bar and the rounds panel, and a leser sees all three. Today they
 * cannot: `schedules_all_sel` (M:0030:117) is `app.can_edit_survey`, so the
 * chip would render from a row a leser reads as absent — indistinguishable
 * from a survey with no schedule.
 *
 * WHERE THE CONSTRAINT LIVES: the database, as RLS on `schedules`. Not in the
 * component and not in the page's select — a page that decided who may see a
 * schedule would be one `PostgREST` call away from being wrong, and this table
 * is readable by any authenticated session that can name a survey id.
 *
 * WHAT THIS CHANGE ACTUALLY RISKS. Migration 0030 already split `schedules_all`
 * into four per-command policies, so this is a one-line predicate swap on the
 * SELECT policy — not a split. The danger is therefore not a missing policy but
 * a careless edit that widens more than one: swapping `can_edit_survey` for
 * `can_view_survey` in the `_ins`, `_upd` or `_del` policy too would hand every
 * leser in the organisation the ability to pause, restart or delete a series.
 * Assertions 2–4 are shaped to catch exactly that.
 *
 * The positive control is FIRST on purpose. Three "a leser cannot" assertions
 * over a table nobody can read all pass, and keep passing with the whole policy
 * set deleted (`tests/db/clients.ts`, standing question 1 in its positive
 * form). Prove the read works, then prove the writes do not.
 */
const made: string[] = []

let svc: Client
let admin: Client
let leser: Client
let outsider: Client
let orgId: string
let surveyId: string
let scheduleId: string

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, leser, outsider] = await Promise.all([adminClient(), leserClient(), outsiderClient()])

  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id

  const { data: survey, error } = await svc
    .from('surveys')
    .insert({
      org_id: orgId,
      title: `Gjentakelse-${Date.now()}`,
      status: 'aktiv',
      respondent_kind: 'person',
    })
    .select('id')
    .single()
  if (error) throw new Error(`fixture survey: ${error.message}`)
  surveyId = survey!.id
  made.push(surveyId)

  const { data: sched, error: sErr } = await svc
    .from('schedules')
    .insert({
      survey_id: surveyId,
      cadence: 'weekly',
      runs_total: 12,
      runs_done: 3,
      reminder_after_days: 2,
      active: true,
    })
    .select('id')
    .single()
  if (sErr) throw new Error(`fixture schedule: ${sErr.message}`)
  scheduleId = sched!.id
})

/** Gate 5a2's other half: do not become what else exists. The survey cascades
 *  its schedule, so one delete is enough. */
afterAll(async () => {
  if (made.length) await svc.from('surveys').delete().in('id', made)
})

describe('(Q23) a leser sees the recurrence status', () => {
  it('POSITIVE CONTROL: a leser reads the schedule of a survey in their organisation', async () => {
    const { data, error } = await leser
      .from('schedules')
      .select('id, cadence, runs_total, runs_done, next_run_at, active')
      .eq('id', scheduleId)

    expect(error, 'reading a schedule is not an error for a leser').toBeNull()
    expect(data, 'and it returns the row — without this the three below are vacuous')
      .toHaveLength(1)
    // The whole row, deliberately (Q23, simple version): it carries operational
    // settings and no results. The boundary is written into the decision line —
    // a field derived from responses reopens the decision.
    expect(data![0]!.cadence).toBe('weekly')
    expect(data![0]!.runs_done).toBe(3)
  })

  it('but cannot pause one — RLS filters the update, and the row does not move', async () => {
    // Gate 2b: an empty result is NOT a denial, so the proof is the stored row
    // being unchanged, not an error appearing. RLS filters rather than raises.
    const { data, error } = await leser
      .from('schedules')
      .update({ active: false })
      .eq('id', scheduleId)
      .select('id')

    expect(error, 'RLS filters rather than raising').toBeNull()
    expect(data, 'and nothing was updated').toEqual([])

    const { data: after } = await svc
      .from('schedules')
      .select('active')
      .eq('id', scheduleId)
      .single()
    expect(after!.active, 'the series is still running').toBe(true)
  })

  it('cannot create one either — the swap must touch SELECT and nothing else', async () => {
    const { error } = await leser
      .from('schedules')
      .insert({ survey_id: surveyId, cadence: 'weekly', runs_total: 4 })

    // INSERT has no row to filter, so the WITH CHECK raises rather than
    // silently matching nothing — the one write of the four that fails loudly.
    expect(error, 'a leser may not schedule a survey').not.toBeNull()

    const { count } = await svc
      .from('schedules')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', surveyId)
    expect(count, 'still exactly the one the fixture made').toBe(1)
  })

  it('cannot delete one', async () => {
    const { error } = await leser.from('schedules').delete().eq('id', scheduleId)
    expect(error).toBeNull()

    const { data: still } = await svc.from('schedules').select('id').eq('id', scheduleId)
    expect(still, 'the schedule survives a leser trying to remove it').toHaveLength(1)
  })

  it('another organisation reads nothing — can_view_survey is org-scoped', async () => {
    // The widened predicate must not widen ACROSS organisations. `can_view_survey`
    // is `is_org_member` on the survey's org, so this is the assertion that says
    // the new policy inherited that and did not become "any authenticated user".
    const { data, error } = await outsider.from('schedules').select('id').eq('id', scheduleId)

    expect(error, 'RLS filters rather than raising').toBeNull()
    expect(data, 'an outsider sees no schedule at all').toEqual([])
  })

  it('POSITIVE CONTROL: an administrator still writes it', async () => {
    // Without this, every "cannot" above would also pass on a table nobody can
    // write — including the editors the feature is for.
    const { error } = await admin
      .from('schedules')
      .update({ runs_total: 24 })
      .eq('id', scheduleId)
    expect(error, 'an editor may still change the series').toBeNull()

    const { data } = await svc.from('schedules').select('runs_total').eq('id', scheduleId).single()
    expect(data!.runs_total).toBe(24)
  })
})
