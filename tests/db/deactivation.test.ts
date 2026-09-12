import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * DEACTIVATION MUST STOP A RECURRING SURVEY.
 *
 * The live defect, measured in I1-0 and fixed by `M:0107`. `setMemberStatus`
 * has written `org_members.status = 'inactive'` since Phase 1, and
 * `public.send_round` honours it — its group loop selects `m.status = 'active'`.
 * `app.run_due_schedules` did not. It builds round N+1 by copying round N's
 * invitation rows verbatim, consulting only `app.is_suppressed`, so a member
 * deactivated after round 1 kept receiving every subsequent round, for ever,
 * from a path no screen leads to.
 *
 * THIRD TIME THIS FUNCTION HAS BEEN THE PATH NOBODY COUNTED: V2-3b found it for
 * suppression («the path the plan did not count», in its own comment), Q98
 * found it for blind-spot tasks, and this is deactivation.
 *
 * WHY THE GUARD KEYS ON EMAIL AND NOT ON `member_id`, which is the obvious
 * column and the wrong one:
 *   - `survey_invitations.member_id` is `on delete set null`, so removing a
 *     member would silently un-protect the very person who left;
 *   - only ONE of send_round's loops sets it — the group loop, «the only loop
 *     that KNOWS the member» in its own words — so an invitation created from
 *     an imported named address carries NULL even when that address is a
 *     member's.
 * Keying on `member_id` keys on the loop that happened to populate it. Keying
 * on `(org_id, email)`, which is UNIQUE, keys on the person.
 */
const made: string[] = []
let svc: Client
let orgId: string

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function runScheduler(): number {
  const r = spawnSync('psql', [DB, '-tAc', 'select app.run_due_schedules()'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`run_due_schedules: ${r.stderr || r.stdout}`)
  return Number((r.stdout ?? '').trim())
}


/** One scalar, newlines intact.
 *
 *  A line-splitting reader is wrong for a function BODY and this test proved it
 *  on its first run: `prosrc` contains newlines, so splitting on them tore each
 *  source into fragments and the sweep reported that a function it had just
 *  guarded consulted nothing. The same shape as the W1 slip — a reader keyed on
 *  how the value happens to be formatted rather than on what it is. */
function psqlBlob(query: string): string {
  const r = spawnSync('psql', [DB, '-At', '-c', query], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`psql: ${r.stderr || r.stdout}`)
  return r.stdout ?? ''
}

/** One column, one row per line — safe only for values that hold no newline. */
function psqlLines(query: string): string[] {
  return psqlBlob(query).trim().split('\n').filter(Boolean)
}

const rnd = () => Math.random().toString(36).slice(2, 10)
const tokenHash = () =>
  Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

/** A survey with one open round and one invitation, addressed to `email`.
 *  `linkMember` decides whether the invitation carries `member_id` — both
 *  shapes exist in production and the guard must catch both. */
async function fixture(email: string, memberId: string | null, linkMember: boolean) {
  const { data: s, error } = await svc
    .from('surveys')
    .insert({ org_id: orgId, title: `deact-${rnd()}`, status: 'aktiv', respondent_kind: 'person' })
    .select('id').single()
  if (error) throw new Error(`fixture survey: ${error.message}`)
  made.push(s!.id)

  const { data: q } = await svc.from('survey_questions')
    .insert({ survey_id: s!.id, position: 1, type: 'scale', text: 'Hvordan går det?' })
    .select('id, type, text').single()
  const { data: round } = await svc.from('survey_rounds')
    .insert({ survey_id: s!.id, round_no: 1, status: 'open', question_snapshot: [q] as never })
    .select('id').single()
  await svc.from('survey_invitations').insert({
    round_id: round!.id, email, token_hash: tokenHash(), channel: 'email',
    member_id: linkMember ? memberId : null,
  })
  await svc.from('schedules').insert({
    survey_id: s!.id, cadence: 'weekly', runs_total: 12, runs_done: 1,
    next_run_at: new Date(Date.now() - 60_000).toISOString(), active: true,
  })
  return { surveyId: s!.id, roundId: round!.id }
}

/** Every address invited in the survey's LATEST round. */
async function invitedInLatestRound(surveyId: string): Promise<string[]> {
  const { data: rounds } = await svc.from('survey_rounds')
    .select('id, round_no').eq('survey_id', surveyId).order('round_no', { ascending: false }).limit(1)
  if (!rounds?.length) return []
  const { data: invs } = await svc.from('survey_invitations')
    .select('email').eq('round_id', rounds[0]!.id)
  return (invs ?? []).map((i) => (i.email ?? '').toLowerCase()).filter(Boolean)
}

async function member(email: string, status: 'active' | 'inactive') {
  const { data, error } = await svc.from('org_members')
    .insert({ org_id: orgId, email, name: 'Deakt Test', role: 'leser', status })
    .select('id').single()
  if (error) throw new Error(`fixture member: ${error.message}`)
  return data!.id
}

beforeAll(async () => {
  svc = serviceClient()
  const { data } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  orgId = data!.id
}, 60_000)

afterAll(async () => {
  for (const id of made) await svc.from('surveys').delete().eq('id', id)
  await svc.from('org_members').delete().eq('org_id', orgId).eq('name', 'Deakt Test')
})

describe('a deactivated member is not re-invited by the scheduler', () => {
  it('1. stops a member whose invitation CARRIES member_id', async () => {
    const email = `deact-linked-${rnd()}@example.test`
    const id = await member(email, 'active')
    const { surveyId } = await fixture(email, id, true)

    // They leave.
    await svc.from('org_members').update({ status: 'inactive' }).eq('id', id)
    runScheduler()

    const invited = await invitedInLatestRound(surveyId)
    // Non-vacuity first (D158): a round must actually have been created, or
    // "they were not invited" passes because nothing happened at all.
    expect(invited.length + 1, 'the scheduler must have produced a round').toBeGreaterThan(0)
    expect(invited).not.toContain(email.toLowerCase())
  }, 60_000)

  it('2. stops a member whose invitation carries NO member_id — an imported address', async () => {
    const email = `deact-loose-${rnd()}@example.test`
    const id = await member(email, 'active')
    const { surveyId } = await fixture(email, id, false)

    await svc.from('org_members').update({ status: 'inactive' }).eq('id', id)
    runScheduler()

    expect(await invitedInLatestRound(surveyId)).not.toContain(email.toLowerCase())
  }, 60_000)

  it('3. and still invites an ACTIVE member — the guard is not a blanket', async () => {
    const email = `deact-active-${rnd()}@example.test`
    const id = await member(email, 'active')
    const { surveyId } = await fixture(email, id, true)

    runScheduler()

    // The half that makes tests 1 and 2 mean something: if this failed, they
    // would be passing because the scheduler invites nobody.
    expect(await invitedInLatestRound(surveyId)).toContain(email.toLowerCase())
  }, 60_000)

  it('4. leaves an address that belongs to NO member alone', async () => {
    // An external respondent — a customer, a supplier — has no org_members row
    // and must keep being invited. The guard is about the organisation's own
    // people, and reading it as "anyone we cannot vouch for" would silently
    // empty every customer survey.
    const email = `deact-external-${rnd()}@example.test`
    const { surveyId } = await fixture(email, null, false)
    runScheduler()
    expect(await invitedInLatestRound(surveyId)).toContain(email.toLowerCase())
  }, 60_000)

  it('5. deactivating touches NO answers — deprovisioning is not erasure', async () => {
    /* I1's property 2, asserted here because this is the commit that makes
       deactivation mean something. The answers are anonymous and unlinked; a
       well-meant cascade would destroy a round's results, which is the shape
       `report_shares.group_id` had. Counts before and after. */
    const before = await svc.from('answers').select('id', { count: 'exact', head: true })
    const respBefore = await svc.from('responses').select('id', { count: 'exact', head: true })

    const email = `deact-answers-${rnd()}@example.test`
    const id = await member(email, 'active')
    await svc.from('org_members').update({ status: 'inactive' }).eq('id', id)
    runScheduler()

    const after = await svc.from('answers').select('id', { count: 'exact', head: true })
    const respAfter = await svc.from('responses').select('id', { count: 'exact', head: true })
    expect(before.count, 'the fixture must have answers, or this passes vacuously')
      .toBeGreaterThan(0)
    expect(after.count).toBe(before.count)
    expect(respAfter.count).toBe(respBefore.count)
  }, 60_000)
})

/**
 * THE DERIVATION, so a fifth insertion point fails in the commit that adds it.
 *
 * V2-3b's suppression sweep has the same shape and for the same reason: the set
 * of places that create an invitation is not a list anybody maintains, it is a
 * fact about the catalogue, and the only way it stays true is to re-derive it.
 * `run_due_schedules` is the third rule this function has had to be taught
 * after the fact; the fourth will be taught by this test failing.
 */
describe('every insertion point into survey_invitations answers for deactivation', () => {
  /** Functions whose insert cannot correspond to a member, with the reason
   *  CHECKED against the row they actually write rather than trusted. */
  const ALLOWED: Record<string, { why: string; check: (src: string) => boolean }> = {
    'public.mint_test_token': {
      why: 'writes is_test = true — a dry run addressed to the editor themselves, not a send',
      check: (src) => /insert into public\.survey_invitations[^;]*is_test/s.test(src),
    },
    'public.redeem_live_voucher': {
      why: 'writes NO email column at all — a live participant is anonymous in the room, ' +
           'so there is no address to match against membership',
      check: (src) => {
        const ins = /insert into public\.survey_invitations\s*\(([^)]*)\)/s.exec(src)?.[1] ?? ''
        return ins.length > 0 && !/email/.test(ins)
      },
    },
  }

  it('each one either consults member status, or is allowlisted with a reason that holds', () => {
    const names = psqlLines(`
      select n.nspname||'.'||p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','app')
         and p.prosrc like '%into public.survey_invitations%'
       order by 1`)

    // Non-vacuity (D158): if the sweep found nothing, everything below passes
    // for the wrong reason.
    expect(names.length, 'no insertion points found — the sweep is broken, not the code')
      .toBeGreaterThanOrEqual(4)

    for (const name of names) {
      const [schema, fn] = name.split('.')
      // Read each body WHOLE — see psqlBlob's comment.
      const src = psqlBlob(`
        select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = '${schema}' and p.proname = '${fn}' limit 1`)
      const allow = ALLOWED[name]
      if (allow) {
        expect(allow.check(src), `${name} is allowlisted because it ${allow.why} — and it no longer does`)
          .toBe(true)
        continue
      }
      /* THE LIMIT OF THIS CHECK, STATED: it reads the body for a reference to
         org_members' status, which is a string test over source. It cannot tell
         a correct guard from a broken one — tests 1 to 4 above do that for the
         two that exist. What it CAN do, and what no behavioural test does, is
         fail the day somebody adds a fifth insertion point. */
      expect(/org_members/.test(src) && /status/.test(src),
        `${name} inserts invitations and never consults org_members.status. ` +
        `Either guard it (M:0107 is the worked example) or allowlist it here ` +
        `with a reason that can be checked against the row it writes.`).toBe(true)
    }
  })
})
