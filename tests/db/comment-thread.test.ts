import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, leserClient, outsiderClient, serviceClient, type Client } from './clients'
import { createRound, createShareLink, createSurvey } from './factories'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * C4 + C5 — handling a comment, replying to it, and the ROUND TRIP.
 *
 * `02-plan.md` says C5 does not close on a green gate. It closes on a comment
 * written from `/s/<token>`, a reply written by a manager, and **the reply read
 * back through the same token after submission, with Q111's four refusals still
 * refusing.** Test 9 is that trip, in one test, in order, so a partial pass
 * cannot be mistaken for it.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(q: string): string[][] {
  return execFileSync('psql', [DB_URL, '-tAF\t', '-c', q], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map((r) => r.split('\t'))
}
const one = (q: string) => psql(q)[0]?.[0] ?? ''

const TAG = randomUUID().slice(0, 8)
const svc: Client = serviceClient()

let orgId: string
let tokens: string[]
let shareToken: string
let questionId: string
let commentId: string
let otherToken: string

beforeAll(async () => {
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  const otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id

  const survey = await createSurvey(orgId, `Tråd ${TAG}`, [
    { type: 'scale', text: 'Hvordan er arbeidsmengden?' },
  ])
  await svc.from('surveys').update({ feedback_mode: 'anonymous' }).eq('id', survey.id)
  questionId = survey.questions[0]!.id
  const round = await createRound(survey, 3)
  tokens = round.tokens
  shareToken = `share-${randomUUID()}`
  await createShareLink(round.id, shareToken)

  const otherSurvey = await createSurvey(otherOrgId, `Annen tråd ${TAG}`, [
    { type: 'scale', text: 'Og der?' },
  ])
  await svc.from('surveys').update({ feedback_mode: 'anonymous' }).eq('id', otherSurvey.id)
  const otherRound = await createRound(otherSurvey, 1)
  otherToken = otherRound.tokens[0]!
}, 120_000)

afterAll(async () => {
  await svc.from('surveys').delete().like('title', `%${TAG}`)
})

const submit = (token: string, text: string | null, qid: string | null = null) =>
  anonClient().rpc('submit_response', {
    p_token: token,
    p_lang: 'no',
    p_answers: { [questionId]: { value: 2 } },
    p_anon_choice: null,
    p_comments: text ? [{ question_id: qid, text }] : null,
  } as never)

describe('C4 — set_comment_handled is the only way handled_at moves', () => {
  it('1. it is the ONE writer, catalogue-derived', () => {
    const writers = psql(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('app','public') and p.prokind = 'f'
         and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~ 'handled_at'
       order by 1`).map(([f]) => f!)
    // reply_to_comment sets it too, on purpose: replying IS handling it.
    expect(writers).toEqual(['reply_to_comment', 'set_comment_handled'])
  })

  it('2. anon executes NEITHER new function — this is what keeps them CHECKED surfaces in 5a3', () => {
    // An enumeration, and it says what it is an enumeration OF: the two
    // functions this tranche added that no unauthenticated caller may run. Gate
    // 5a3 asserts the general property over the whole catalogue; this fails
    // here, by name, with the reason attached.
    //
    // IT CAUGHT A REAL DEFECT ON ITS FIRST RUN. Both migrations said
    // `revoke all ... from public`, which leaves the grant `anon` INHERITS from
    // PUBLIC standing. M:0013 learned that in September and wrote it down;
    // CLAUDE.md lists it as instance 3 of «an enumeration mistaken for a
    // property». Reproduced anyway. Not exploitable — the bodies resolve
    // authority from app.has_role and an anon caller has no auth.uid() — and
    // «it refuses anyway» is exactly the argument that keeps a wrong grant alive.
    for (const sig of ['public.set_comment_handled(uuid,boolean)', 'public.reply_to_comment(uuid,text)']) {
      expect(
        one(`select has_function_privilege('anon','${sig}','execute')::text`),
        `anon can execute ${sig}`,
      ).toBe('false')
    }
    // And the one that MUST be anon-executable still is, so this test cannot
    // pass by the grants having been stripped wholesale.
    expect(
      one(`select has_function_privilege('anon','public.get_comment_thread(text)','execute')::text`),
    ).toBe('true')
  })

  it('3. an administrator of the owning org marks a comment handled', async () => {
    const sub = await submit(tokens[0]!, 'Prioriteringene endres midt i uken.', questionId)
    expect(sub.error, sub.error?.message).toBeNull()
    commentId = one(`select id from public.survey_comments where body = 'Prioriteringene endres midt i uken.'`)
    expect(commentId.length, 'the comment was not written').toBeGreaterThan(0)

    const admin = await adminClient()
    const { data } = await admin.rpc('set_comment_handled', { p_comment: commentId, p_handled: true })
    expect((data as { ok?: boolean }).ok).toBe(true)
    expect(one(`select handled_at is not null from public.survey_comments where id = '${commentId}'`)).toBe('t')
    expect(one(`select handled_by is not null from public.survey_comments where id = '${commentId}'`)).toBe('t')
  })

  it('4. a leser cannot, and is refused the same way a stranger is', async () => {
    const leser = await leserClient()
    const { data } = await leser.rpc('set_comment_handled', { p_comment: commentId, p_handled: false })
    expect((data as { error?: string }).error).toBe('not_found')
    // and nothing moved
    expect(one(`select handled_at is not null from public.survey_comments where id = '${commentId}'`)).toBe('t')
  })

  it('5. an outsider gets the SAME answer for a real id as for an invented one', async () => {
    // Two different answers here would let a caller enumerate comment ids
    // across organisations, one uuid at a time.
    const outsider = await outsiderClient()
    const real = await outsider.rpc('set_comment_handled', { p_comment: commentId, p_handled: true })
    const fake = await outsider.rpc('set_comment_handled', {
      p_comment: '00000000-0000-0000-0000-000000000000',
      p_handled: true,
    })
    expect((real.data as { error?: string }).error).toBe('not_found')
    expect(JSON.stringify(real.data)).toBe(JSON.stringify(fake.data))
  })

  it('6. and the BODY is untouched by any of it', () => {
    expect(one(`select body from public.survey_comments where id = '${commentId}'`)).toBe(
      'Prioriteringene endres midt i uken.',
    )
  })
})

describe('C5 — reply_to_comment', () => {
  it('7. an administrator replies, the author is resolved server-side, and the comment becomes handled', async () => {
    const fresh = await submit(tokens[1]!, 'Jeg vet ikke hvem jeg skal gå til.')
    expect(fresh.error, fresh.error?.message).toBeNull()
    const id = one(`select id from public.survey_comments where body = 'Jeg vet ikke hvem jeg skal gå til.'`)
    expect(one(`select handled_at is null from public.survey_comments where id = '${id}'`)).toBe('t')

    const admin = await adminClient()
    const { data } = await admin.rpc('reply_to_comment', {
      p_comment: id,
      p_body: 'Takk for at du sier det. Rutinen ligger under Sikkerhet, og vi tar den opp mandag.',
    })
    expect((data as { ok?: boolean }).ok, JSON.stringify(data)).toBe(true)

    // The author is the CALLER's member id, not a value anybody supplied.
    expect(one(`select author_member_id is not null from public.survey_comment_replies
                 where comment_id = '${id}'`)).toBe('t')
    // Replying IS handling it.
    expect(one(`select handled_at is not null from public.survey_comments where id = '${id}'`)).toBe('t')
  })

  it('8. a leser cannot reply', async () => {
    const leser = await leserClient()
    const { data } = await leser.rpc('reply_to_comment', { p_comment: commentId, p_body: 'nei' })
    expect((data as { error?: string }).error).toBe('not_found')
    expect(one(`select count(*) from public.survey_comment_replies where body = 'nei'`)).toBe('0')
  })
})

describe('C5 — THE ROUND TRIP, in order, with the four refusals still refusing', () => {
  it('9. comment from /s/<token> → manager reply → read back through the SAME token', async () => {
    const token = tokens[2]!
    const text = `Vi mangler et sted å ta opp ting som haster ${TAG}`

    // 1 — she comments as she submits.
    const sub = await submit(token, text, questionId)
    expect(sub.error, sub.error?.message).toBeNull()
    expect((sub.data as { comments?: number }).comments, 'the comment did not ride along').toBe(1)
    const id = one(`select id from public.survey_comments where body = '${text}'`)
    expect(id.length).toBeGreaterThan(0)

    // 2 — a manager replies.
    const admin = await adminClient()
    const reply = `Vi setter av tid i mandagsmøtet fra neste uke ${TAG}`
    const r = await admin.rpc('reply_to_comment', { p_comment: id, p_body: reply })
    expect((r.data as { ok?: boolean }).ok, JSON.stringify(r.data)).toBe(true)

    // 3 — she reads it back, through the token she already spent.
    const read = await anonClient().rpc('get_comment_thread', { p_token: token } as never)
    expect(read.error, read.error?.message).toBeNull()
    const payload = read.data as { thread: boolean; comments: { text: string; replies: { text: string }[] }[] }
    expect(payload.thread).toBe(true)
    const mine = payload.comments.find((c) => c.text === text)
    expect(mine, 'her own comment did not come back').toBeTruthy()
    expect(mine!.replies.map((x) => x.text)).toContain(reply)

    // ── AND THE FOUR REFUSALS, on the very token that just read ────────────

    // (a) it did not re-open submission
    const again = await submit(token, 'enda en')
    expect((again.data as { error?: string }).error).toBe('already_responded')
    expect(one(`select count(*) from public.survey_comments where body = 'enda en'`)).toBe('0')

    // (b) it cannot read another respondent's thread — the neighbour's comment
    //     from test 7 is in the same ROUND and must not appear
    expect(
      payload.comments.map((c) => c.text),
      'a token read a comment that was not its own',
    ).not.toContain('Jeg vet ikke hvem jeg skal gå til.')

    // (c) it cannot read results
    const body = JSON.stringify(payload)
    for (const forbidden of ['"value"', '"answers"', '"score"', '"average"']) {
      expect(body, `the thread payload carries ${forbidden}`).not.toContain(forbidden)
    }

    // (d) it expires with the round
    const roundId = one(`select round_id from public.survey_comments where id = '${id}'`)
    await svc.from('survey_rounds').update({ status: 'closed' }).eq('id', roundId)
    const after = await anonClient().rpc('get_comment_thread', { p_token: token } as never)
    expect((after.data as { error?: string }).error).toBe('not_found_or_closed')
    await svc.from('survey_rounds').update({ status: 'open' }).eq('id', roundId)
  })

  it('10. a token from ANOTHER organisation reads none of it', async () => {
    await submit(otherToken, null)
    const read = await anonClient().rpc('get_comment_thread', { p_token: otherToken } as never)
    const payload = read.data as { comments?: { text: string }[] }
    expect((payload.comments ?? []).map((c) => c.text).join(' ')).not.toContain(TAG)
  })

  it('11. a share-link token reads an empty thread, not somebody else’s', async () => {
    const sub = await anonClient().rpc('submit_response', {
      p_token: shareToken,
      p_lang: 'no',
      p_answers: { [questionId]: { value: 5 } },
      p_anon_choice: null,
      p_comments: [{ question_id: null, text: `fra en delt lenke ${TAG}` }],
    } as never)
    expect(sub.error, sub.error?.message).toBeNull()

    const read = await anonClient().rpc('get_comment_thread', { p_token: shareToken } as never)
    const payload = read.data as { thread?: boolean; comments?: unknown[] }
    // `thread: false` rather than an error: nothing is wrong with the token,
    // there is simply no thread that belongs to ONE holder of it.
    expect(payload.thread).toBe(false)
    expect((payload.comments ?? []).length).toBe(0)
  })
})
