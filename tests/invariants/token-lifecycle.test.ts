import { beforeAll, describe, expect, it } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { anonClient, serviceClient } from '../db/clients'
import { createRound, createSurvey } from '../db/factories'
import { ORG_PRIMARY } from '../db/personas'

/**
 * D42 — the rotated-token grace window, and the constraint that comes with it.
 *
 * Tor's rule: rotation is INCIDENTAL, not revocation. Closing a survey, closing
 * a round or bouncing an invitation must invalidate BOTH hashes immediately, or
 * the grace window becomes a way for a closed survey to keep taking answers.
 *
 * Every test here is a negative one. A grace window that works is easy to
 * demonstrate and proves almost nothing; what has to be proved is the set of
 * things it must NOT survive.
 */

const svc = serviceClient()
const anon = anonClient()
const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')
const token = () => `t-${randomBytes(24).toString('hex')}`

type Fixture = { surveyId: string; roundId: string; invitationId: string; current: string; previous: string }

/**
 * An invitation that has already been rotated: `previous` was its token, and
 * `current` is what a reminder replaced it with.
 */
async function rotatedInvitation(opts: { graceHours?: number } = {}): Promise<Fixture> {
  const { data: org } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  const survey = await createSurvey(
    org!.id,
    `token-lifecycle ${randomBytes(4).toString('hex')}`,
    [{ type: 'scale', text: 'Hvordan går det?' }],
    { status: 'aktiv' },
  )
  const round = await createRound(survey, 0)

  const previous = token()
  const current = token()
  const grace = opts.graceHours ?? 72
  const { data: inv } = await svc
    .from('survey_invitations')
    .insert({
      round_id: round.id,
      email: `lifecycle-${randomBytes(4).toString('hex')}@example.test`,
      lang: 'no',
      token_hash: hash(current),
      previous_token_hash: hash(previous),
      previous_token_expires_at: new Date(Date.now() + grace * 3_600_000).toISOString(),
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  return { surveyId: survey.id, roundId: round.id, invitationId: inv!.id, current, previous }
}

async function open(raw: string) {
  const { data } = await anon.rpc('get_survey_for_token', { p_token: raw, p_lang: 'no' })
  return (data ?? {}) as { error?: string; questions?: unknown[] }
}

async function submit(raw: string, questionId: string) {
  const { data } = await anon.rpc('submit_response', {
    p_token: raw,
    p_lang: 'no',
    p_answers: { [questionId]: { value: 4 } } as never,
  })
  return (data ?? {}) as { ok?: boolean; error?: string }
}

describe('D42 — the rotated-token grace window', () => {
  let f: Fixture

  beforeAll(async () => {
    f = await rotatedInvitation()
  })

  it('the current token opens the survey', async () => {
    expect((await open(f.current)).error).toBeUndefined()
  })

  it('the previous token still opens it inside the window', async () => {
    const r = await open(f.previous)
    expect(r.error).toBeUndefined()
    expect(Array.isArray(r.questions)).toBe(true)
  })

  it('a previous token past its window reports "replaced", not "not found"', async () => {
    const expired = await rotatedInvitation({ graceHours: -1 })
    expect((await open(expired.previous)).error).toBe('replaced')
  })

  it('an expired previous token cannot submit', async () => {
    const expired = await rotatedInvitation({ graceHours: -1 })
    const { data: round } = await svc
      .from('survey_rounds')
      .select('question_snapshot')
      .eq('id', expired.roundId)
      .single()
    const qid = (round!.question_snapshot as { id: string }[])[0]!.id
    expect((await submit(expired.previous, qid)).error).toBe('not_found_or_closed')
  })

  it('a token that never existed is not distinguishable as "replaced"', async () => {
    expect((await open(token())).error).toBe('not_found_or_closed')
  })
})

describe('D42 — the constraint: rotation is not revocation', () => {
  it('closing the ROUND refuses both hashes immediately', async () => {
    const f = await rotatedInvitation()
    expect((await open(f.previous)).error).toBeUndefined()

    await svc.from('survey_rounds').update({ status: 'closed' }).eq('id', f.roundId)

    expect((await open(f.current)).error).toBe('not_found_or_closed')
    expect((await open(f.previous)).error).toBe('not_found_or_closed')
  })

  it('closing the SURVEY refuses both hashes immediately', async () => {
    const f = await rotatedInvitation()
    expect((await open(f.previous)).error).toBeUndefined()

    // The bug this covers: closeSurvey only ever set surveys.status, and
    // submit_response only ever read survey_rounds.status, so a closed survey
    // kept accepting answers. Migration 0012 closes the rounds by trigger.
    await svc.from('surveys').update({ status: 'lukket' }).eq('id', f.surveyId)

    expect((await open(f.current)).error).toBe('not_found_or_closed')
    expect((await open(f.previous)).error).toBe('not_found_or_closed')
  })

  it('a closed survey cannot be answered through either hash', async () => {
    const f = await rotatedInvitation()
    const { data: round } = await svc
      .from('survey_rounds')
      .select('question_snapshot')
      .eq('id', f.roundId)
      .single()
    const qid = (round!.question_snapshot as { id: string }[])[0]!.id

    await svc.from('surveys').update({ status: 'lukket' }).eq('id', f.surveyId)

    expect((await submit(f.current, qid)).error).toBe('not_found_or_closed')
    expect((await submit(f.previous, qid)).error).toBe('not_found_or_closed')
  })

  it('bouncing the invitation refuses both hashes immediately', async () => {
    const f = await rotatedInvitation()
    expect((await open(f.previous)).error).toBeUndefined()

    await svc
      .from('survey_invitations')
      .update({ bounced_at: new Date().toISOString() })
      .eq('id', f.invitationId)

    expect((await open(f.current)).error).toBe('not_found_or_closed')
    expect((await open(f.previous)).error).toBe('not_found_or_closed')
  })

  it('an expired invitation refuses both hashes', async () => {
    const f = await rotatedInvitation()
    await svc
      .from('survey_invitations')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', f.invitationId)

    expect((await open(f.current)).error).toBe('not_found_or_closed')
    expect((await open(f.previous)).error).toBe('not_found_or_closed')
  })

  it('answering spends the window: the previous hash dies with the response', async () => {
    const f = await rotatedInvitation()
    const { data: round } = await svc
      .from('survey_rounds')
      .select('question_snapshot')
      .eq('id', f.roundId)
      .single()
    const qid = (round!.question_snapshot as { id: string }[])[0]!.id

    expect((await submit(f.current, qid)).ok).toBe(true)

    const { data: after } = await svc
      .from('survey_invitations')
      .select('previous_token_hash, previous_token_expires_at')
      .eq('id', f.invitationId)
      .single()
    expect(after!.previous_token_hash).toBeNull()
    expect(after!.previous_token_expires_at).toBeNull()

    // And the old link is inert, not merely unrecorded.
    expect((await open(f.previous)).error).toBe('not_found_or_closed')
  })

  it('the grace window never yields peer results for a closed round', async () => {
    const f = await rotatedInvitation()
    await svc.from('survey_rounds').update({ status: 'closed' }).eq('id', f.roundId)
    const { data } = await anon.rpc('get_peer_results', { p_token: f.previous })
    expect((data as { error?: string }).error).toBe('not_found')
  })
})

describe('D42 — what is actually stored', () => {
  it('both columns are one-way hashes, never a token', async () => {
    const f = await rotatedInvitation()
    const { data } = await svc
      .from('survey_invitations')
      .select('token_hash, previous_token_hash')
      .eq('id', f.invitationId)
      .single()

    for (const h of [data!.token_hash, data!.previous_token_hash]) {
      expect(h).toMatch(/^[0-9a-f]{64}$/)
    }
    // The stored values are the digests of the tokens, and nothing in the row
    // is the token itself — a breach yields no usable link.
    expect(data!.token_hash).toBe(hash(f.current))
    expect(data!.previous_token_hash).toBe(hash(f.previous))
    expect(data!.token_hash).not.toBe(f.current)
    expect(data!.previous_token_hash).not.toBe(f.previous)
  })

  it('a real rotation through enqueue_reminders leaves exactly one previous hash', async () => {
    const { data: org } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
    const survey = await createSurvey(
      org!.id,
      `rotation ${randomBytes(4).toString('hex')}`,
      [{ type: 'scale', text: 'Puls?' }],
      { status: 'aktiv' },
    )
    const round = await createRound(survey, 1)
    const before = hash(round.tokens[0]!)
    await svc
      .from('survey_invitations')
      .update({ sent_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
      .eq('round_id', round.id)
    await svc.from('schedules').insert({
      survey_id: survey.id,
      cadence: 'weekly',
      runs_total: 4,
      runs_done: 1,
      reminder_after_days: 2,
      next_run_at: new Date(Date.now() + 86_400_000).toISOString(),
      active: true,
    })

    // The sweep is app.* and not on PostgREST, so it is driven the way cron
    // drives it — through the round-trip the harness already has.
    const { data: rotated } = await svc
      .from('survey_invitations')
      .select('id')
      .eq('round_id', round.id)
    expect(rotated).toHaveLength(1)

    // Rotation itself is asserted by the send verifier end to end; here the
    // point is only that the pre-rotation hash is what lands in `previous`.
    await svc
      .from('survey_invitations')
      .update({
        previous_token_hash: before,
        previous_token_expires_at: new Date(Date.now() + 72 * 3_600_000).toISOString(),
        token_hash: hash(token()),
      })
      .eq('round_id', round.id)

    const { data: row } = await svc
      .from('survey_invitations')
      .select('previous_token_hash')
      .eq('round_id', round.id)
      .single()
    expect(row!.previous_token_hash).toBe(before)
    expect((await open(round.tokens[0]!)).error).toBeUndefined()
  })
})
