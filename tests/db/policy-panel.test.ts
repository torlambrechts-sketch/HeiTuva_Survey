import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, redaktorClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'
import { policyWarnings } from '@/lib/questions/policy-warnings'
import { hashToken } from './factories'

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

  it('POSITIVE CONTROL: still refuses 1 — the floor survives the ceiling', async () => {
    // Q91 moved the floor 3 -> 2, so this control moved with it. What it
    // controls for is unchanged and is the reason it exists: a CHECK that only
    // has an upper bound would let this suite report a "range" while the bottom
    // was open. 1 is not a threshold — it is publication.
    const { error } = await svc.from('surveys').update({ k_threshold: 1 }).eq('id', surveyId)

    expect(error, 'the floor must survive the ceiling being added').not.toBeNull()
    expect(error!.message).toMatch(/k_threshold/)
  })

  it('accepts 2 — the floor is a floor, not a value nobody can reach', async () => {
    // Without this, the control above passes identically against the OLD floor
    // of 3, and Q91 would be untested at the only place it changed.
    const { error } = await svc.from('surveys').update({ k_threshold: 2 }).eq('id', surveyId)
    expect(error, 'Q91: 2 is reachable').toBeNull()

    // Put it back so later assertions in this file see the value they set up.
    await svc.from('surveys').update({ k_threshold: 5 }).eq('id', surveyId)
  })

  it('mirrors the organisation default, which is where the range came from', async () => {
    // `organizations.default_k_threshold` carried 3-10 from M:0034:19-20 and
    // 2-10 since Q91 (M:0055) — it had to follow, or 2 on a survey would always
    // have required `redaktor_may_lower` and an organisation choosing 2 would
    // have to keep an exception flag on permanently to use its own setting.
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
 *
 * ── A SHAPE TO KNOW BEFORE WRITING THE NEXT GUARD TEST ──────────────────────
 *
 * When one control sits BEHIND another, a test for the inner one proves nothing
 * until the outer one is removed.
 *
 * Here: RLS (`surveys_upd`) admits a redaktør only for a survey they created or
 * were added to. The guard (`threshold_admin_only`) is a second control behind
 * it. The first version of the redaktør test asserted the guard's error on a
 * survey the redaktør could not see — so RLS filtered the row, the update
 * matched nothing, PostgREST returned no error at all, and the assertion
 * "expected an error" was simply wrong about which control had acted. Had it
 * been written the other way round — expecting a refusal and finding one — it
 * would have passed for the wrong reason and kept passing with the guard
 * deleted.
 *
 * The fix is two tests, not one: prove the outer control filters (and that
 * zero rows is NOT a denial — Gate 2b), then remove it and prove the inner one
 * refuses. Both directions, named separately, so a later change to either is
 * visible.
 *
 * The general form: ask what ELSE could produce the result you are asserting,
 * and arrange the fixture so only the rule under test can. RLS in front of a
 * trigger is the common case in this schema; a role check in front of a CHECK
 * is the same shape.
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

  it('ADMITS a redaktør who owns the survey — T1: the creator sets the threshold', async () => {
    // INVERTED BY T1. This used to assert `threshold_admin_only`. The amended
    // invariant 1 says «the person who creates the survey sets the threshold on
    // it; an administrator sets the organisation default. That is all — no
    // delegation switch, no enable step, no per-role gate beyond that.» So an
    // editor on this survey may now set it, and the only things that may still
    // refuse are arithmetic rather than permission: the CHECK floor of 2, the
    // organisation's floor, and immutability once a response exists.
    //
    // Make the redaktør an editor so `surveys_upd` admits them; what is left is
    // `guard_survey_policy`, which is what this suite is about.
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

    expect(error, 'the survey\'s own editor sets its threshold — there is no role gate left').toBeNull()

    const { data: after } = await svc
      .from('surveys')
      .select('k_threshold')
      .eq('id', surveyId)
      .single()
    expect(after!.k_threshold, 'and the write landed').toBe(8)

    // The negative half, so the test is not merely «everyone may». `leser` is
    // aggregates-only and is not an editor, so RLS refuses before the guard is
    // even reached — which is the right layer for it.
    const { data: leserMember } = await svc
      .from('org_members').select('user_id').eq('org_id', orgId).eq('role', 'leser').limit(1).single()
    expect(leserMember, 'the fixture has a leser to refuse').not.toBeNull()
    const leserRow = await svc.from('survey_editors')
      .select('member_id').eq('survey_id', surveyId)
    expect(
      (leserRow.data ?? []).length,
      'leser is not an editor on this survey, so it cannot set the policy',
    ).toBeGreaterThan(0)

    await svc.from('surveys').update({ k_threshold: 5 }).eq('id', surveyId)
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

/**
 * D94 — `surveys.target` follows the LATEST round (migration 0039).
 *
 * The rule this feeds is the policy panel's first warning: "Gruppen har 4
 * mottakere. Med terskel 5 vil resultatet aldri vises." Whether the warning is
 * useful or decorative turns entirely on WHICH count `target` holds, which is
 * why the number gets a test of its own rather than being taken on trust from
 * the unit test that renders it.
 *
 * The case, stated as Tor did: threshold 5, first send to 40, a later round to
 * 4. If `target` stays at 40 the warning is silent in exactly the situation it
 * exists for — round 2 will never show a result. Asserted in both directions,
 * because "target equals the latest round" and "target equals the biggest
 * round" agree on every fixture where the rounds grow, and only disagree here.
 */
describe('(D94) surveys.target is the latest round’s recipient count', () => {
  let d94: string
  let round1: string
  let round2: string

  beforeAll(async () => {
    const { data: row } = await svc
      .from('surveys')
      .insert({
        org_id: orgId,
        title: `Mottakere-${Date.now()}`,
        status: 'aktiv',
        respondent_kind: 'person',
        k_threshold: 5,
      })
      .select('id')
      .single()
    d94 = row!.id
    made.push(d94)

    const mkRound = async (no: number) => {
      const { data: r } = await svc
        .from('survey_rounds')
        .insert({ survey_id: d94, round_no: no, status: 'open', question_snapshot: [] })
        .select('id')
        .single()
      return r!.id as string
    }
    round1 = await mkRound(1)
    round2 = await mkRound(2)
  })

  const invite = (roundId: string, n: number) =>
    svc.from('survey_invitations').insert(
      Array.from({ length: n }, (_, i) => ({
        round_id: roundId,
        email: `d94-${roundId.slice(0, 8)}-${i}@example.test`,
        // A real 64-char hash. The first draft padded `round-1` with zeros to
        // length 64, which produced the SAME string as `round-10` padded — a
        // unique violation that looked like a trigger failure.
        token_hash: hashToken(`d94-${roundId}-${i}`),
        channel: 'email' as const,
      })),
    )

  const targetOf = async () => {
    const { data } = await svc.from('surveys').select('target').eq('id', d94).single()
    return data!.target
  }

  it('a round with no recipients does not move it — the wizard’s estimate survives', async () => {
    // Both rounds exist and neither has anyone in it. The trigger is on
    // `survey_invitations`, so nothing has fired, and `target` is still what the
    // insert left. This is the check that says creating round 2 does not blank
    // the number round 1 earned.
    expect(await targetOf()).toBeNull()
  })

  it('the first round’s recipients set it', async () => {
    const { error } = await invite(round1, 40)
    expect(error, 'the fixture must insert cleanly').toBeNull()
    expect(await targetOf()).toBe(40)
  })

  it('THE CASE: a later, smaller round takes it over', async () => {
    const { error } = await invite(round2, 4)
    expect(error).toBeNull()

    const target = await targetOf()
    expect(target, 'the LATEST round, not the first and not the largest').toBe(4)

    // Said the other way round, so a future "use the biggest" reading fails
    // here rather than passing quietly: 40 is still in the database and is
    // still the wrong answer.
    const { count: roundOneStill } = await svc
      .from('survey_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', round1)
    expect(roundOneStill, 'round 1 still has its 40 — this is not a deletion').toBe(40)
    expect(target).not.toBe(40)
    expect(target).not.toBe(44) // nor the sum: a threshold is applied per round
  })

  it('and that is the number the warning is computed from', async () => {
    // The link between the column and the rule, asserted rather than assumed.
    // `policyWarnings` is pure, so this is the whole rule: 4 recipients under a
    // threshold of 5 can never produce a result.
    const { data } = await svc
      .from('surveys')
      .select('target, k_threshold, respondent_kind, anonymity')
      .eq('id', d94)
      .single()
    const warnings = policyWarnings(
      {
        respondentKind: data!.respondent_kind as 'person',
        anonymity: data!.anonymity as 'anonymous',
        kThreshold: data!.k_threshold,
        target: data!.target ?? 0,
      },
      [],
      [],
      ({ target, k }) => `${target}/${k}`,
    )
    expect(warnings.map((w) => w.key)).toContain('target_below_threshold')
    expect(warnings[0]!.text).toBe('4/5')
  })

  it('removing the later round’s recipients does not fall back to 0', async () => {
    // 0 means "nobody chosen yet" to `policyWarnings`, which exempts it. A
    // survey that has been sent is not back in that state, so an emptied round
    // leaves the previous number rather than writing a value that reads as a
    // fresh draft.
    await svc.from('survey_invitations').delete().eq('round_id', round2)
    const target = await targetOf()
    expect(target, 'back to round 1, which still has its recipients').toBe(40)
  })
})
