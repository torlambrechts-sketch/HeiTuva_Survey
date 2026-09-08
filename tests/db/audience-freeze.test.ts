import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * V2-3a's BLOCKER — **DECISIONS Q64**, the per-round freeze.
 *
 * «Send a round, change the membership, re-read the round's denominator and
 * participation rate → unchanged.» The plan calls it *the phase's most important
 * test and the one nothing errors on*, and that second half is the reason it
 * exists: nothing throws when a denominator moves. A report simply says
 * something different in June than it said in March, and nobody can tell which
 * of the two was the lie.
 *
 * ── WHAT THIS TEST IS ACTUALLY GUARDING, AFTER THE GROUNDWORK ───────────────
 *
 * The freeze **already holds** — `survey_invitations` is a per-round snapshot,
 * written by `send_round` (`M:0052:107`, `:140`), and the denominator counts
 * those rows rather than live membership. So this is not a test for work being
 * added; it is a test for a property nothing currently protects. The plan
 * proposed `round_audience_members` to CREATE the freeze; Q64 dropped that on
 * the measurement, and dropping a proposed table is exactly when the property it
 * would have provided needs pinning down.
 *
 * **The derived half matters more than the scenario.** A scenario proves the
 * denominator did not move for the one change I made. The catalogue assertion
 * proves no denominator reader consults live membership AT ALL — over the set of
 * functions, not the one I picked (standing question 3).
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

let svc: Client
let admin: Client
let orgId: string
let surveyId = ''
let groupA = ''
let groupB = ''
const movedMembers: string[] = []
const stamp = `${process.pid}`

beforeAll(async () => {
  svc = serviceClient()
  admin = await adminClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id

  const { data: gs } = await svc
    .from('groups')
    .insert([
      { org_id: orgId, name: `Frys A ${stamp}` },
      { org_id: orgId, name: `Frys B ${stamp}` },
    ])
    .select('id, name')
  groupA = gs!.find((g) => g.name === `Frys A ${stamp}`)!.id
  groupB = gs!.find((g) => g.name === `Frys B ${stamp}`)!.id

  // Six active members in A. Six so that moving three leaves a number that
  // could not be mistaken for a rounding artefact.
  const rows = Array.from({ length: 6 }, (_, i) => ({
    org_id: orgId,
    email: `frys-${i}-${stamp}@example.test`,
    name: `Frys ${i}`,
    role: 'leser' as const,
    group_id: groupA,
    status: 'active',
  }))
  const { data: members } = await svc.from('org_members').insert(rows).select('id')
  movedMembers.push(...members!.map((m) => m.id))

  const { data: survey } = await svc
    .from('surveys')
    .insert({
      org_id: orgId,
      title: `Frysetest ${stamp}`,
      respondent_kind: 'person',
      anonymity: 'anonymous',
    })
    .select('id')
    .single()
  surveyId = survey!.id
  await svc
    .from('survey_questions')
    .insert({ survey_id: surveyId, position: 1, type: 'scale', text: 'Frys' })
}, 120_000)

afterAll(async () => {
  // Standing question 4. A survey and six members left behind would change the
  // recipient counts every later phase measures.
  await svc.from('surveys').delete().eq('id', surveyId)
  if (movedMembers.length) await svc.from('org_members').delete().in('id', movedMembers)
  await svc.from('groups').delete().in('id', [groupA, groupB])
})

/** The round's recipient count, read the way the product reads it. */
const invitedCount = async (): Promise<number> => {
  const { data: rounds } = await svc
    .from('survey_rounds')
    .select('id')
    .eq('survey_id', surveyId)
    .order('created_at', { ascending: false })
    .limit(1)
  const { count } = await svc
    .from('survey_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', rounds![0]!.id)
  return count ?? 0
}

describe('(Q64) BLOCKER — a membership change after send moves no denominator', () => {
  it('sends to the group and records six recipients', async () => {
    const { error } = await admin.rpc('send_round', {
      p_survey: surveyId,
      p_channels: ['email'],
      p_group_ids: [groupA],
    })
    expect(error, 'the round sends').toBeNull()
    expect(await invitedCount(), 'six members, six invitations').toBe(6)
  })

  it('MOVES THREE OF THE SIX, AND THE ROUND DOES NOT NOTICE', async () => {
    // The scenario. Half the group leaves for another group after the round is
    // out — the ordinary case of a reorganisation mid-quarter.
    const { error } = await svc
      .from('org_members')
      .update({ group_id: groupB })
      .in('id', movedMembers.slice(0, 3))
    expect(error).toBeNull()

    expect(await invitedCount(), 'the denominator is the snapshot, not the membership').toBe(6)

    // And the group is genuinely half its size now — without this the assertion
    // above would pass if the update had silently done nothing.
    const { count: liveA } = await svc
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupA)
    expect(liveA, 'POSITIVE CONTROL: live membership really did change').toBe(3)
  })

  it('deactivating a member does not move it either', async () => {
    // `send_round` filters `status = 'active'` when it builds the audience, so
    // a status change is the other way live membership could reach a sent round.
    await svc.from('org_members').update({ status: 'inactive' }).eq('id', movedMembers[3]!)
    expect(await invitedCount(), 'a sent round is not re-filtered by status').toBe(6)
  })

  it('THE DERIVED HALF: no denominator reader consults live membership', () => {
    // The scenario proves one change did not move one number. This proves the
    // property over the SET (standing question 3): every function that counts a
    // round's recipients reads `survey_invitations`, and none of them joins
    // `org_members` to do it.
    //
    // `send_round` and `run_due_schedules` are the two that legitimately read
    // both — they BUILD an audience, which is the one moment live membership is
    // the right source. They are named with that reason rather than pattern-
    // matched, so a third builder appearing here has to be justified by a person.
    const BUILDERS: Record<string, string> = {
      send_round: 'builds the audience — the one moment live membership is correct',
      run_due_schedules: 'builds round N+1 by copying round N, and may read members',
    }
    const offenders = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app')
          and p.prosrc ~ 'survey_invitations'
          and p.prosrc ~ 'org_members'
        order by 1`,
    )
      .map((r) => r[0]!)
      .filter((fn) => !(fn in BUILDERS))

    expect(
      offenders,
      `these read a round's invitations AND live membership: ${offenders.join(', ') || '(none)'}`,
    ).toEqual([])
  })

  it('the snapshot carries the group it was sent to, not the group they are in now', async () => {
    // `survey_invitations.group_id` is copied at send (`M:0052:137`). It is what
    // makes a per-group breakdown of a past round mean what it said at the time.
    const { data: rounds } = await svc
      .from('survey_rounds')
      .select('id')
      .eq('survey_id', surveyId)
      .order('created_at', { ascending: false })
      .limit(1)
    const { count } = await svc
      .from('survey_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', rounds![0]!.id)
      .eq('group_id', groupA)
    expect(count, 'all six were sent as group A, and still are').toBe(6)
  })
})
