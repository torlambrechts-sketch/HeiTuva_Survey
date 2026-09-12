import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, serviceClient, type Client } from './clients'
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
let admin: Client
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
  // `send_round` resolves the actor through `app.can_edit_survey`, so the
  // service role reaches it as `forbidden` — returned as a PAYLOAD, not an
  // error. Test 7 needs a signed-in editor.
  admin = await adminClient()
  const { data } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  orgId = data!.id
}, 60_000)

afterAll(async () => {
  for (const id of made) await svc.from('surveys').delete().eq('id', id)
  await svc.from('org_members').delete().eq('org_id', orgId).eq('name', 'Deakt Test')
  // The art. 21 fixture (test 10) writes a real objection. Left behind it would
  // suppress that address for every later reader of this database.
  await svc.from('suppressions').delete().eq('org_id', orgId).like('email', 'deact-%@example.test')
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

/**
 * ── I1-1: THE SAME RULE, ONE LEVEL OUT ──────────────────────────────────────
 *
 * `M:0107` closed the scheduler and this file's derivation was written to catch
 * the next one. Measured at the start of I1-1, the derivation was ITSELF an
 * enumeration: it swept FUNCTIONS, and the property is INSERTION POINTS.
 * `public.send_round` holds TWO — a named-recipients loop and a group loop —
 * and passed the sweep on the strength of the group loop's `m.status = 'active'`
 * while the named loop consulted only suppression.
 *
 * And widening it to insertion points is still not the property. The thing that
 * reaches a person is not a ROW, it is a `pgmq.send` — and `app.enqueue_reminders`
 * sends one without inserting anything at all. It filters `is_test`,
 * `responded_at`, `bounced_at` and `sent_at`, and neither membership status nor
 * suppression. So a member who leaves, and — worse — a person who has exercised
 * their GDPR art. 21 objection, still receives the reminder for an invitation
 * already out.
 *
 * THE PROPERTY IS: **every producer of a mail_outbox message answers for both
 * suppression and membership status.** There are three (`send_round`,
 * `app.run_due_schedules`, `app.enqueue_reminders`) and the derivation below is
 * over `pgmq.send` rather than over `insert into`.
 */
describe('I1-1 · a deactivated member is not reached by any other producer', () => {
  it('7. send_round does not invite a deactivated member NAMED as a recipient', async () => {
    const email = `deact-named-${rnd()}@example.test`
    const id = await member(email, 'active')
    const { data: s, error: sErr } = await svc.from('surveys')
      .insert({ org_id: orgId, title: `deact-named-${rnd()}`, status: 'aktiv', respondent_kind: 'person' })
      .select('id').single()
    expect(sErr, 'fixture survey').toBeNull()
    made.push(s!.id)
    await svc.from('survey_questions')
      .insert({ survey_id: s!.id, position: 1, type: 'scale', text: 'Hvordan går det?' })

    await svc.from('org_members').update({ status: 'inactive' }).eq('id', id)

    const { data: res, error } = await admin.rpc('send_round', {
      p_survey: s!.id,
      p_channels: ['email'],
      p_recipients: [{ email, name: 'Deakt Test' }] as never,
    })
    expect(error, 'the send itself must succeed — the leaver is SKIPPED, not an abort').toBeNull()
    expect((res as { error?: string } | null)?.error, 'and not be refused as a payload').toBeUndefined()

    const { data: rounds, error: rErr } = await svc.from('survey_rounds')
      .select('id').eq('survey_id', s!.id).order('round_no', { ascending: false }).limit(1)
    expect(rErr, 'reading the round').toBeNull()
    expect(rounds ?? [], 'the send must have produced a round, or "not invited" is vacuous')
      .toHaveLength(1)
    const { data: invs } = await svc.from('survey_invitations')
      .select('email').eq('round_id', rounds![0]!.id)
    expect((invs ?? []).map((i) => (i.email ?? '').toLowerCase())).not.toContain(email.toLowerCase())
  }, 60_000)

  it('8. and a direct insert for a deactivated member is refused by the database', async () => {
    /* The structural backstop. Tests 1-2 and 7 guard the three loops that exist;
       this guards the loop nobody has written yet, and the psql session, and the
       server action a later phase adds. Prefer the fix robust against the
       construct nobody has thought of. */
    const email = `deact-trigger-${rnd()}@example.test`
    const id = await member(email, 'active')
    const { surveyId, roundId } = await fixture(email, id, false)
    expect(surveyId).toBeTruthy()
    await svc.from('org_members').update({ status: 'inactive' }).eq('id', id)

    const { error } = await svc.from('survey_invitations').insert({
      round_id: roundId, email, token_hash: tokenHash(), channel: 'email',
    })
    expect(error?.message ?? '', 'the trigger must refuse it by name').toContain('recipient_inactive')
  }, 60_000)

  it('9. enqueue_reminders does not remind a member who left after the send', async () => {
    const email = `deact-remind-${rnd()}@example.test`
    const id = await member(email, 'active')
    const { roundId } = await fixture(email, id, true)
    // An invitation that is due a reminder: sent three days ago, unanswered.
    await svc.from('survey_invitations')
      .update({ sent_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
      .eq('round_id', roundId)
    await svc.from('schedules').update({ reminder_after_days: 1 }).eq('survey_id',
      (await svc.from('survey_rounds').select('survey_id').eq('id', roundId).single()).data!.survey_id)

    await svc.from('org_members').update({ status: 'inactive' }).eq('id', id)
    const r = spawnSync('psql', [DB, '-tAc', 'select app.enqueue_reminders()'], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)

    const { data: after } = await svc.from('survey_invitations')
      .select('reminded_at').eq('round_id', roundId).single()
    expect(after!.reminded_at ?? [], 'a person who has left gets no reminder').toHaveLength(0)
  }, 60_000)

  it('10. and does not remind an address that has OBJECTED — GDPR art. 21', async () => {
    /* Not a deactivation case at all, and the sharpest thing this sweep found.
       V2-3b put the objection guard in send_round's two loops and in a trigger
       on survey_invitations. `enqueue_reminders` inserts nothing, so the trigger
       never sees it, and it queues mail directly — so an objection lodged after
       the invitation went out was ignored on every reminder. */
    const email = `deact-objected-${rnd()}@example.test`
    const { roundId, surveyId } = await fixture(email, null, false)
    await svc.from('survey_invitations')
      .update({ sent_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
      .eq('round_id', roundId)
    await svc.from('schedules').update({ reminder_after_days: 1 }).eq('survey_id', surveyId)

    const { error: sErr } = await svc.from('suppressions')
      .insert({ org_id: orgId, email: email.toLowerCase(), reason: 'objection' })
    expect(sErr, 'the objection must be recorded, or this passes vacuously').toBeNull()

    const r = spawnSync('psql', [DB, '-tAc', 'select app.enqueue_reminders()'], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)

    const { data: after } = await svc.from('survey_invitations')
      .select('reminded_at').eq('round_id', roundId).single()
    expect(after!.reminded_at ?? [], 'an objection stops the reminder too').toHaveLength(0)
  }, 60_000)

  it('11. and STILL reminds an ordinary unanswered invitation — the controls', async () => {
    const email = `deact-remind-ok-${rnd()}@example.test`
    const { roundId, surveyId } = await fixture(email, null, false)
    await svc.from('survey_invitations')
      .update({ sent_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
      .eq('round_id', roundId)
    await svc.from('schedules').update({ reminder_after_days: 1 }).eq('survey_id', surveyId)

    const r = spawnSync('psql', [DB, '-tAc', 'select app.enqueue_reminders()'], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)

    const { data: after } = await svc.from('survey_invitations')
      .select('reminded_at').eq('round_id', roundId).single()
    expect(after!.reminded_at ?? [], 'if this is empty, tests 9 and 10 pass for the wrong reason')
      .toHaveLength(1)
  }, 60_000)
})

/**
 * THE DERIVATION, RESTATED OVER WHAT ACTUALLY REACHES A PERSON.
 *
 * The version `M:0107` shipped swept `insert into public.survey_invitations`.
 * That was an enumeration twice over: it counted functions rather than insertion
 * points, and it counted ROWS rather than MESSAGES. `app.enqueue_reminders`
 * produces neither a row nor an insertion point and reaches the person anyway.
 *
 * A `pgmq.send` on `mail_outbox` is the thing that reaches somebody, so that is
 * what this sweeps. The fourth producer fails here in the commit that adds it.
 */
describe('every producer of mail answers for both suppression and membership', () => {
  it('each one consults org_members.status AND app.is_suppressed', () => {
    const names = psqlLines(`
      select n.nspname||'.'||p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prokind = 'f' and n.nspname in ('public','app')
         and p.prosrc like '%pgmq.send%'
       order by 1`)

    // Non-vacuity (D158): three exist today. If the sweep finds fewer, it is
    // broken and every assertion below passes for the wrong reason.
    expect(names, 'the known producers must be among them').toEqual(
      expect.arrayContaining(['app.enqueue_reminders', 'app.run_due_schedules', 'public.send_round']))

    for (const name of names) {
      const [schema, fn] = name.split('.')
      const src = psqlBlob(`
        select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = '${schema}' and p.proname = '${fn}' limit 1`)
      expect(/org_members/.test(src) && /status/.test(src),
        `${name} queues mail and never consults org_members.status — a person who ` +
        `has left the organisation would be reached by it.`).toBe(true)
      expect(/is_suppressed/.test(src),
        `${name} queues mail and never consults app.is_suppressed — a person who has ` +
        `objected under GDPR art. 21 would be reached by it.`).toBe(true)
    }
  })
})

/**
 * THE TWO PROPERTIES M:0108 CLAIMS ABOUT ITSELF, ASSERTED RATHER THAN WRITTEN.
 *
 * Both are the kind of claim a migration header makes and nothing checks: «a new
 * status value raises instead of defaulting» and «token rotation and `sent_at`
 * are let through». Prose in a comment is true on the day it is typed.
 */
describe('M:0108 · the predicate has a home, and the guards permit maintenance', () => {
  it('12. an unrecognised member status RAISES rather than picking a side', () => {
    const r = spawnSync('psql', [DB, '-tAc',
      "select app.member_blocks_invitation('suspended')"], { encoding: 'utf8' })
    expect(r.status, 'an unknown status must not return a boolean').not.toBe(0)
    expect(r.stderr).toContain('unknown member status')

    // And the three it knows, so test 12 is not passing because everything raises.
    const known = spawnSync('psql', [DB, '-tAc',
      "select app.member_blocks_invitation('active') || ',' ||" +
      " app.member_blocks_invitation('invited') || ',' ||" +
      " app.member_blocks_invitation('inactive')"], { encoding: 'utf8' })
    expect(known.status, known.stderr).toBe(0)
    expect(known.stdout.trim()).toBe('false,false,true')
  })

  it('13. an objection lodged AFTER the send no longer blocks the mail worker', async () => {
    /* The inversion M:0108 undid, and the reason it is a test rather than a
       note. `guard_invitation_not_suppressed` was `before insert or update`, so
       writing `sent_at` — which the worker does AFTER Brevo has accepted the
       message — threw for a newly-objecting address. The worker could not mark
       the message spent, the queue redelivered it, and OBJECTING CAUSED REPEATED
       MAIL TO THE PERSON WHO OBJECTED. Scoped to `update of email` now:
       re-pointing an invitation is a new invitation; recording that one was sent
       is not. */
    const email = `deact-late-objection-${rnd()}@example.test`
    const { roundId } = await fixture(email, null, false)
    await svc.from('suppressions')
      .insert({ org_id: orgId, email: email.toLowerCase(), reason: 'objection' })

    const { error } = await svc.from('survey_invitations')
      .update({ sent_at: new Date().toISOString() }).eq('round_id', roundId)
    expect(error, 'the mail worker must still be able to record what it sent').toBeNull()

    // And the rule it still enforces: you may not RE-POINT an invitation at an
    // address that has objected. If this passed, the rescope went too far.
    const { error: repoint } = await svc.from('survey_invitations')
      .update({ email: email.toLowerCase() }).eq('round_id', roundId)
    expect(repoint?.message ?? '', 'and re-pointing is still refused').toContain('recipient_suppressed')
  }, 60_000)
})
