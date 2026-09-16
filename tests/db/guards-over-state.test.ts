import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, redaktorClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * S3 item 4 — «a guard on one transition is not a guard on the state».
 *
 * CLAUDE.md already names this shape, with V2-9's example: a trigger written
 * `before update of run_mode` was correct for «switch this survey to live» and
 * blind to «make this live survey named». The audit found six more instances,
 * and every one of them is the same mistake — the guard was written for the
 * SCREEN somebody had in mind rather than for the RULE.
 *
 *   B1-02          the suppression guard ran on INSERT and not on UPDATE
 *   B7a-03/B7b-03  the org floor and the admin-only rule ran on UPDATE only,
 *                  so INSERT escaped both
 *   B3c-3          the role check and the audit covered k_threshold alone,
 *                  so anonymity could be changed by a redaktør, unaudited
 *   A6-4           the live-anonymity rule existed on two transitions and in
 *                  no form that describes the forbidden STATE
 *
 * A6-4's test is the one to read. It performs ONE update that changes
 * `run_mode` and `anonymity` together — which is what defeated both transition
 * guards, because after it neither column is in the combination either guard
 * was watching for.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
function psqlErr(query: string): string {
  try {
    execFileSync('psql', [DB_URL, '-tA', '-v', 'ON_ERROR_STOP=1', '-c', query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return ''
  } catch (e) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string }
    return String(err.stderr ?? '') + String(err.stdout ?? '')
  }
}
/** A fresh six-character code per row: live_sessions.code is unique, and a
 *  fixed literal makes the second run of this file fail on its own residue. */
let codeSeq = 0
const code = () => `S${String(Date.now() % 100000).padStart(5, '0')}`.slice(0, 5) + (codeSeq++ % 10)

const one = (q: string) => {
  const v = psql(q)[0]?.[0]
  if (v === undefined) throw new Error(`no row for: ${q}`)
  return v
}

let svc: Client
let admin: Client
let redaktor: Client
let orgId: string
/** The redaktør's own member id. `surveys_upd` lets a redaktør edit only a
 *  survey they CREATED or are a named editor of, so a fixture with
 *  `created_by` NULL is invisible to them and every update returns zero rows
 *  and no error — which reads exactly like a guard refusing it. */
let redaktorMemberId: string
const madeSurveys: string[] = []

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor] = await Promise.all([adminClient(), redaktorClient()])
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  redaktorMemberId = one(
    `select id from public.org_members where org_id = '${orgId}' and role = 'redaktor' limit 1`,
  )
})

afterAll(async () => {
  if (madeSurveys.length) await svc.from('surveys').delete().in('id', madeSurveys)
})

async function makeSurvey(fields: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await svc
    .from('surveys')
    .insert({
      org_id: orgId,
      title: `S3 guard probe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'utkast',
      anonymity: 'anonymous',
      ...fields,
    })
    .select('id')
    .single()
  if (error) throw new Error(`survey insert failed: ${error.message}`)
  madeSurveys.push(data!.id)
  return data!.id
}

describe('A6-4 — the state, not the two transitions', () => {
  it('refuses ONE update that leaves a redeemable voucher on a named survey', async () => {
    const surveyId = await makeSurvey({ anonymity: 'anonymous', run_mode: 'live' })
    const roundId = one(`
      insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
      values ('${surveyId}', 1, 'open', '[]'::jsonb) returning id`)
    psql(`
      insert into public.live_sessions (org_id, survey_id, round_id, code, status, expires_at)
      values ('${orgId}', '${surveyId}', '${roundId}', '${code()}', 'open', now() + interval '2 hours')`)

    // THE DEFEATING MOVE: both columns at once. `guard_run_mode_anonymous`
    // asks «is this live AND named?» — after this statement it is neither
    // live nor, as far as that guard can see, interesting.
    const err = psqlErr(`
      update public.surveys set run_mode = 'standard', anonymity = 'named'
       where id = '${surveyId}'`)

    expect(
      err,
      'the survey is now NAMED with an outstanding live voucher — a device that ' +
        'scans the code was promised anonymity by the screen it scanned from',
    ).not.toBe('')
    expect(err).toMatch(/live_session_open/)
  })

  it('allows the same rename once the session is closed', async () => {
    const surveyId = await makeSurvey({ anonymity: 'anonymous', run_mode: 'live' })
    const roundId = one(`
      insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
      values ('${surveyId}', 1, 'open', '[]'::jsonb) returning id`)
    psql(`
      insert into public.live_sessions (org_id, survey_id, round_id, code, status, expires_at, closed_at)
      values ('${orgId}', '${surveyId}', '${roundId}', '${code()}', 'closed', now(), now())`)
    // A rule that refuses the forbidden state must still permit every other
    // one, or it has closed the feature rather than the hole.
    expect(
      psqlErr(`update public.surveys set run_mode = 'standard', anonymity = 'named'
                where id = '${surveyId}'`),
    ).toBe('')
  })

  it('does not block on an open session that has already expired', async () => {
    // `close_live_session` expires the session AND its tokens, so an
    // open-but-expired row can harm nobody. Blocking on it would be a stricter
    // rule than the one that was meant, and stricter is not the same as right.
    const surveyId = await makeSurvey({ anonymity: 'anonymous', run_mode: 'live' })
    const roundId = one(`
      insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
      values ('${surveyId}', 1, 'open', '[]'::jsonb) returning id`)
    psql(`
      insert into public.live_sessions (org_id, survey_id, round_id, code, status, expires_at)
      values ('${orgId}', '${surveyId}', '${roundId}', '${code()}', 'open', now() - interval '1 minute')`)
    expect(
      psqlErr(`update public.surveys set run_mode = 'standard', anonymity = 'named'
                where id = '${surveyId}'`),
    ).toBe('')
  })
})

describe('B7a-03 / B7b-03 — INSERT escaped the floor', () => {
  it('refuses a NEW survey below the organisation’s floor', async () => {
    const floor = Number(
      one(`select default_k_threshold from public.organizations where id = '${orgId}'`),
    )
    expect(floor, 'the fixture organisation has a floor worth testing against').toBeGreaterThan(1)
    const { error } = await redaktor
      .from('surveys')
      .insert({
        org_id: orgId,
        title: `S3 below floor ${Date.now()}`,
        status: 'utkast',
        anonymity: 'anonymous',
        respondent_kind: 'person',
        k_threshold: floor - 1,
      })
      .select('id')
      .single()
    expect(
      error,
      'a redaktør could POST a survey under the floor while two admin sentences ' +
        'promise that cannot happen',
    ).not.toBeNull()
    expect(error!.message).toMatch(/below_org_floor/)
  })

  it('still lets a redaktør create an ordinary survey', async () => {
    const floor = Number(
      one(`select default_k_threshold from public.organizations where id = '${orgId}'`),
    )
    const { data, error } = await redaktor
      .from('surveys')
      .insert({
        org_id: orgId,
        title: `S3 at floor ${Date.now()}`,
        status: 'utkast',
        anonymity: 'anonymous',
        respondent_kind: 'person',
        k_threshold: floor,
      })
      .select('id')
      .single()
    expect(error, 'creating surveys is what a redaktør is FOR').toBeNull()
    if (data) madeSurveys.push(data.id)
  })
})

describe('B3c-3 — the role check covered one policy column of three', () => {
  it('refuses a redaktør changing a survey’s ANONYMITY', async () => {
    // created_by matters: without it the row is invisible to the redaktør and
    // the update is a silent no-op, which would pass a naive «did it change?»
    // assertion for entirely the wrong reason.
    const surveyId = await makeSurvey({ anonymity: 'anonymous', created_by: redaktorMemberId })
    const { data, error } = await redaktor
      .from('surveys')
      .update({ anonymity: 'named' })
      .eq('id', surveyId)
      .select('id')
    // Both halves. A zero-row update is not a refusal, and this test would have
    // passed on one before the fixture was corrected.
    expect(data?.length ?? 0, 'the row must be visible to the redaktør').toBe(0)
    expect(
      error,
      'anonymity is what the respondent was promised — a larger decision than ' +
        'the threshold, and it was the one nobody checked',
    ).not.toBeNull()
    expect(error!.message).toMatch(/policy_admin_only/)
    expect(
      one(`select anonymity from public.surveys where id = '${surveyId}'`),
      'and the value on disk is unchanged',
    ).toBe('anonymous')
  })

  it('lets an administrator change it, and writes an audit row', async () => {
    const surveyId = await makeSurvey({ anonymity: 'anonymous', created_by: redaktorMemberId })
    const before = Number(
      one(`select count(*) from public.audit_events where action = 'policy.change'`),
    )
    const { error } = await admin
      .from('surveys')
      .update({ anonymity: 'named' })
      .eq('id', surveyId)
      .select('id')
    expect(error).toBeNull()
    const after = Number(
      one(`select count(*) from public.audit_events where action = 'policy.change'`),
    )
    expect(after, 'a threshold change was audited and an anonymity change was not').toBe(before + 1)
  })
})

describe('B1-02 — the suppression guard ran on one statement', () => {
  it('refuses an UPDATE that moves an invitation onto a suppressed address', () => {
    const email = `s3-suppressed-${Date.now()}@example.test`
    psql(`insert into public.suppressions (org_id, email, reason)
          values ('${orgId}', '${email}', 'S3 probe')`)
    const surveyId = one(`
      select s.id from public.surveys s join public.survey_rounds r on r.survey_id = s.id
       where s.org_id = '${orgId}' limit 1`)
    const roundId = one(`select id from public.survey_rounds where survey_id = '${surveyId}' limit 1`)
    const invId = one(`
      insert into public.survey_invitations (round_id, email, token_hash, channel, expires_at)
      values ('${roundId}', 's3-ok-${Date.now()}@example.test',
              encode(extensions.digest('s3-${Date.now()}', 'sha256'), 'hex'),
              'email', now() + interval '7 days')
      returning id`)
    try {
      const err = psqlErr(
        `update public.survey_invitations set email = '${email}' where id = '${invId}'`,
      )
      expect(
        err,
        'the address is on the Reservasjonsliste (GDPR art. 21) and an UPDATE ' +
          'reached the state the guard exists to prevent',
      ).not.toBe('')
      expect(err).toMatch(/recipient_suppressed/)
    } finally {
      psql(`delete from public.survey_invitations where id = '${invId}'`)
      psql(`delete from public.suppressions where org_id = '${orgId}' and email = '${email}'`)
    }
  })
})

describe('the shape itself', () => {
  it('no guard trigger on these tables is narrower than the rule it carries', () => {
    // Stated as the property rather than as the four names: a BEFORE trigger
    // whose function is a `guard_` and which fires on INSERT alone, or UPDATE
    // alone, is the shape this whole item is about. The two that legitimately
    // fire on one statement are named with their reason, which is D110's rule
    // about allowlists — say the SCOPE, not only the content.
    const singleEvent = psql(`
      select t.relname || '.' || tg.tgname
        from pg_trigger tg
        join pg_class t on t.oid = tg.tgrelid
        join pg_proc p on p.oid = tg.tgfoid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and not tg.tgisinternal
         and p.proname like 'guard\\_%'
         and (tg.tgtype & 28) in (4, 16)
       order by 1`).map((r) => r[0])
    // Each remaining name carries the SCOPE of its reason, not only the
    // content — D110's rule about allowlists, which applies here too.
    expect(singleEvent).toEqual([
      // A break-glass rule about CHANGING the SSO option. On INSERT an
      // organisation is created with the default and there is no option to
      // break out of; the state «SSO enforced with no exempt administrator» is
      // unreachable at creation because the org has no members yet.
      'organizations.organizations_guard_sso',
      // G2 — the same reasoning, same table, and the list is `order by 1`, so
      // it sits here rather than where it was written. The rule is «a mode may
      // not be DISALLOWED while a survey is in it», which is an EDGE: allowed
      // -> disallowed. On INSERT an organisation is created with the column
      // default and has no surveys at all, so the state this guard is about is
      // unreachable at creation. Scoped `of options` for Q137's reason — every
      // other switch on the screen rewrites that column, and an unscoped guard
      // would re-check all of them on every save.
      'organizations.organizations_mode_in_use',
      // Closing a task IS an event rather than a state: a closed task is
      // immutable by a separate rule (M:0066, «lukket is terminal»), so there
      // is no second road to the state this guard is about.
      'tasks.guard_task_close',
    ])
  })
})
