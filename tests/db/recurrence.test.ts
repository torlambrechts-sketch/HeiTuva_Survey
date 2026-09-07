import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * DECISIONS Q20 and Q22 — the cadence vocabulary, and what pause means.
 *
 * These run as the service role deliberately, and it is the one place in this
 * suite where that is right: the subject is `app.run_due_schedules`, a cron
 * job with no session at all. Asserting it through a persona would prove
 * something about a caller that never calls it. Who may PAUSE a schedule is a
 * different question and is `schedules-rls.test.ts`, through personas.
 */
const made: string[] = []
let svc: Client
let orgId: string

const survey = async (title: string) => {
  const { data, error } = await svc
    .from('surveys')
    .insert({ org_id: orgId, title: `${title}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              status: 'aktiv', respondent_kind: 'person' })
    .select('id')
    .single()
  if (error) throw new Error(`fixture survey: ${error.message}`)
  made.push(data!.id)
  // A round with a question and one invitation, so the scheduler has a previous
  // round to copy recipients from — without it the loop runs and invites nobody,
  // and "the round stayed open" would pass for the wrong reason.
  const { data: q } = await svc
    .from('survey_questions')
    .insert({ survey_id: data!.id, position: 1, type: 'scale', text: 'Hvordan går det?' })
    .select('id, type, text')
    .single()
  const { data: round } = await svc
    .from('survey_rounds')
    .insert({ survey_id: data!.id, round_no: 1, status: 'open', question_snapshot: [q] as never })
    .select('id')
    .single()
  await svc.from('survey_invitations').insert({
    round_id: round!.id,
    email: `rec-${Math.random().toString(36).slice(2, 10)}@example.test`,
    token_hash: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    channel: 'email',
  })
  return { surveyId: data!.id, roundId: round!.id }
}

const schedule = async (surveyId: string, extra: Record<string, unknown> = {}) => {
  const { data, error } = await svc
    .from('schedules')
    .insert({
      survey_id: surveyId,
      cadence: 'weekly',
      runs_total: 12,
      runs_done: 1,
      // Due now, so the scheduler would pick it up if nothing stopped it.
      next_run_at: new Date(Date.now() - 60_000).toISOString(),
      active: true,
      ...extra,
    })
    .select('*')
    .single()
  if (error) throw new Error(`fixture schedule: ${error.message}`)
  return data!
}

/**
 * The sweep, invoked the way cron does.
 *
 * `app.run_due_schedules` is not exposed to PostgREST and must not be: adding a
 * public wrapper for a test's convenience would put a new SECURITY DEFINER
 * function into Gate 5a3's catalogue to serve nothing a customer can reach.
 * `scripts/verify/send.ts:253` already invokes the sweeps through psql for the
 * same reason; this is that pattern, not a new one.
 */
const runScheduler = () => {
  const r = spawnSync(
    'psql',
    [
      process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-tAc',
      'select app.run_due_schedules()',
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`run_due_schedules: ${r.stderr || r.stdout}`)
  return Number((r.stdout ?? '').trim())
}

beforeAll(async () => {
  svc = serviceClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
})

afterAll(async () => {
  if (made.length) await svc.from('surveys').delete().in('id', made)
})

describe('(Q20) the cadence vocabulary', () => {
  it('accepts biennial and custom, and still accepts annual', async () => {
    const { surveyId } = await survey('Kadens')
    for (const cadence of ['annual', 'biennial'] as const) {
      const { error } = await svc
        .from('schedules')
        .insert({ survey_id: surveyId, cadence, runs_total: 2 })
      expect(error, `${cadence} must be a valid cadence`).toBeNull()
    }
    const { error } = await svc.from('schedules').insert({
      survey_id: surveyId, cadence: 'custom', runs_total: 2,
      custom_every: 3, custom_unit: 'weeks', custom_weekday: 1,
    })
    expect(error, 'custom, with the settings that make it mean something').toBeNull()
  })

  it('refuses a custom cadence with no settings, and a half-configured one', async () => {
    /*
      Found by writing the test above: `{cadence: 'custom'}` alone has no
      interval to compute, and the scheduler would fall through to the `else`
      arm of `app.cadence_interval` — which is exactly the class of bug this
      phase is fixing one line up, where `annual` fell through to seven days.
      So the shape is a CHECK rather than a hope.
    */
    const { surveyId } = await survey('Halv-kadens')

    const bare = await svc
      .from('schedules').insert({ survey_id: surveyId, cadence: 'custom', runs_total: 2 })
    expect(bare.error, 'custom without an interval is not a cadence').not.toBeNull()

    const half = await svc.from('schedules').insert({
      survey_id: surveyId, cadence: 'custom', runs_total: 2, custom_every: 3,
    })
    expect(half.error, 'and all three settings travel together').not.toBeNull()

    const weekend = await svc.from('schedules').insert({
      survey_id: surveyId, cadence: 'custom', runs_total: 2,
      custom_every: 1, custom_unit: 'weeks', custom_weekday: 6,
    })
    expect(weekend.error, 'the bundle offers Monday–Friday; Saturday is not a send day')
      .not.toBeNull()

    const { count } = await svc
      .from('schedules').select('id', { count: 'exact', head: true }).eq('survey_id', surveyId)
    expect(count, 'none of the three landed').toBe(0)
  })

  it('a long cadence does not silently re-run weekly', async () => {
    /*
      The interval CASE in `app.run_due_schedules` (M:0027:359) handles weekly,
      biweekly, monthly and quarterly and sends everything else to
      `else interval '7 days'` — so an ANNUAL survey re-sent every week, and
      `biennial` and `custom` would have joined it. A defect that predates Q20
      and is only visible once the vocabulary grows.

      Asserted as a property over the whole vocabulary rather than one value: a
      cadence whose next run is sooner than its own name is wrong for every
      cadence, and naming them individually stops covering the next one added.
    */
    const floors: Record<string, number> = {
      weekly: 6, biweekly: 13, monthly: 28, quarterly: 89,
      annual: 360, biennial: 720,
      // Three weeks, from the custom settings rather than from the cadence name.
      custom: 20,
    }
    for (const [cadence, minDays] of Object.entries(floors)) {
      const { surveyId } = await survey(`Intervall-${cadence}`)
      await schedule(surveyId, {
        cadence, runs_total: 5,
        ...(cadence === 'custom'
          ? { custom_every: 3, custom_unit: 'weeks', custom_weekday: 1 }
          : {}),
      })
      runScheduler()
      const { data } = await svc
        .from('schedules')
        .select('next_run_at')
        .eq('survey_id', surveyId)
        .single()
      const days = (new Date(data!.next_run_at!).getTime() - Date.now()) / 86_400_000
      expect(days, `${cadence} scheduled its next run in ${days.toFixed(1)} days`)
        .toBeGreaterThan(minDays)
    }
  })
})

describe('(Q20) …and BOTH places that compute a next run', () => {
  it('send_round sets the first next run from the cadence too', async () => {
    /*
      The test above drives `app.run_due_schedules`. It is the right SHAPE —
      the relation asserted over every cadence in the vocabulary — and it still
      missed a live instance of the same bug, because a next run is computed in
      TWO places and it exercised one.

      `send_round` carried its own eleven-line copy of the interval CASE with
      the same four arms and the same `else interval '7 days'` (M:0027:210), so
      after 0044 the sweep advanced an annual survey by a year while the FIRST
      next run was still a week out. Enumerating the cadences and sampling the
      call sites is the same mistake one level up.

      So this drives the other site, through the real RPC, as a real editor.
    */
    const admin = await adminClient()
    const floors: Record<string, number> = { annual: 360, biennial: 720, quarterly: 89 }
    for (const [cadence, minDays] of Object.entries(floors)) {
      const { surveyId } = await survey(`Send-${cadence}`)
      const { data, error } = await admin.rpc('send_round', {
        p_survey: surveyId,
        p_channels: ['link'],
        p_recipients: [] as never,
        p_group_ids: [],
        p_anonymity: 'anonymous',
        p_cadence: cadence,
        p_runs: 4,
        p_reminder_days: 2,
        p_rotate: false,
        p_test_only: false,
      })
      expect(error, `send_round(${cadence})`).toBeNull()
      expect((data as { ok?: boolean })?.ok, `send_round(${cadence}) refused`).toBe(true)

      const { data: sched } = await svc
        .from('schedules').select('next_run_at').eq('survey_id', surveyId).single()
      const days = (new Date(sched!.next_run_at!).getTime() - Date.now()) / 86_400_000
      expect(days, `${cadence}'s FIRST next run is ${days.toFixed(1)} days out`)
        .toBeGreaterThan(minDays)
    }
  })

  it('send_round carries the custom settings onto the schedule', async () => {
    const admin = await adminClient()
    const { surveyId } = await survey('Send-tilpasset')
    const { error } = await admin.rpc('send_round', {
      p_survey: surveyId,
      p_channels: ['link'],
      p_recipients: [] as never,
      p_group_ids: [],
      p_anonymity: 'anonymous',
      p_cadence: 'custom',
      p_runs: 4,
      p_reminder_days: 2,
      p_rotate: false,
      p_test_only: false,
      p_custom_every: 3,
      p_custom_unit: 'weeks',
      p_custom_weekday: 2,
      p_send_at_local: '08:30',
    })
    expect(error).toBeNull()

    const { data } = await svc
      .from('schedules')
      .select('cadence, custom_every, custom_unit, custom_weekday, send_at_local, next_run_at')
      .eq('survey_id', surveyId)
      .single()
    expect(data).toMatchObject({
      cadence: 'custom', custom_every: 3, custom_unit: 'weeks', custom_weekday: 2,
    })
    expect(data!.send_at_local).toMatch(/^08:30/)
    // Three weeks, from the settings rather than from the cadence name.
    const days = (new Date(data!.next_run_at!).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(20)
  })
})

describe('(Q22) pause skips the series and leaves the round alone', () => {
  it('a paused schedule is skipped by the scheduler', async () => {
    const { surveyId } = await survey('Pauset')
    const s = await schedule(surveyId, { paused_at: new Date().toISOString() })

    runScheduler()

    const { data: after } = await svc
      .from('schedules').select('runs_done').eq('id', s.id).single()
    expect(after!.runs_done, 'a paused series does not advance').toBe(1)

    const { count } = await svc
      .from('survey_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', surveyId)
    expect(count, 'and opens no new round').toBe(1)
  })

  it('THE POINT: the open round stays open while the series is paused', async () => {
    // Pausing the series is not closing the round someone is answering. The
    // scheduler closes the open round as its first act on a due schedule
    // (M:0027:309), so "skipped" has to mean skipped before that, not after.
    const { surveyId, roundId } = await survey('Pauset-åpen')
    await schedule(surveyId, { paused_at: new Date().toISOString() })

    runScheduler()

    const { data } = await svc.from('survey_rounds').select('status').eq('id', roundId).single()
    expect(data!.status, 'the round someone is answering is untouched').toBe('open')
  })

  it('POSITIVE CONTROL: an unpaused schedule DOES run', async () => {
    // Without this, every assertion above passes on a scheduler that does
    // nothing at all.
    const { surveyId, roundId } = await survey('Ikke-pauset')
    const s = await schedule(surveyId)

    runScheduler()

    const { data: after } = await svc
      .from('schedules').select('runs_done').eq('id', s.id).single()
    expect(after!.runs_done, 'the series advanced').toBe(2)

    const { data: old } = await svc.from('survey_rounds').select('status').eq('id', roundId).single()
    expect(old!.status, 'and the previous round closed behind it').toBe('closed')
  })

  it('resume recomputes the next run from send_at_local, not from when it was paused', async () => {
    /*
      Q22: resume recomputes `next_run_at` from `send_at_local` + weekday. The
      alternative — leaving the stale pre-pause timestamp — means a series
      paused over a holiday fires the instant it resumes, which is the opposite
      of what pausing was for. Recomputing from "now + cadence" is wrong too: a
      Monday-morning survey would drift to whatever day someone unpaused it.

      So: the same weekday as before the pause, at `send_at_local`, in the
      future.
    */
    const { surveyId } = await survey('Gjenopptatt')
    // Pre-pause next run: a Wednesday at 09:00, already in the past.
    const past = new Date('2026-08-05T07:00:00.000Z') // a Wednesday
    const s = await schedule(surveyId, {
      next_run_at: past.toISOString(),
      send_at_local: '09:00',
      paused_at: new Date().toISOString(),
    })

    await svc.from('schedules').update({ paused_at: null }).eq('id', s.id)

    const { data } = await svc
      .from('schedules').select('next_run_at, paused_at').eq('id', s.id).single()
    expect(data!.paused_at).toBeNull()
    const next = new Date(data!.next_run_at!)
    expect(next.getTime(), 'the next run is in the future, not the stale timestamp')
      .toBeGreaterThan(Date.now())
    expect(next.getUTCDay(), 'and it is still a Wednesday').toBe(past.getUTCDay())
  })
})
