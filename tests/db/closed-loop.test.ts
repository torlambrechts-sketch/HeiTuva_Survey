import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, serviceClient, type Client } from './clients'
import { createOrg, createRound, createShareLink, createSurvey, dropOrg } from './factories'

/**
 * G1 — the respondent's half of the closed loop, and the opt-in.
 *
 * ── THE TWO QUESTIONS THIS ANSWERS, IN TOR'S WORDS ────────────────────────
 *
 *  1. «Show what was DONE, never what was found.» Q72 decides what a task may
 *     contain when it came from a blind spot; the same rule governs what a
 *     RESPONDENT may read off one. Tests 3-7.
 *  2. «The opt-in is an address against an anonymous response. Either it
 *     writes nothing that links to her answers, or it is not built. Say which,
 *     with the negative test.» It writes nothing. Tests 8-12, and test 11 is
 *     the negative one: the response row is compared field by field across the
 *     opt-in.
 *
 * ── AND WHY A STATUS FILTER WAS NOT ENOUGH ────────────────────────────────
 *
 * The measurement that decided the design is in `M:0123`'s header: the demo
 * seed's own register carries «Undersøkelse etter varsel» at `pagar`, one
 * status change from the done band. Under a pure filter, an administrator
 * recording that a harassment investigation finished would publish that
 * sentence to every holder of a link — including a share link, which has no
 * addressee at all. So publication is a per-task decision with a default of
 * false, and test 5 is what proves the default.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** The catalogue is read from the catalogue, not from a second copy of it. */
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

const TAG = `g1-loop-${randomUUID().slice(0, 8)}`
const ORG = `Sløyfe ${TAG}`

const svc: Client = serviceClient()
const anon: Client = anonClient()

let orgId = ''
let surveyId = ''
let roundId = ''
let token = ''
let shareToken = ''

type Loop = { items: { title: string; when: string | null }[]; wants_result: boolean; can_opt_in: boolean }

async function loop(tok: string): Promise<Loop> {
  const { data, error } = await anon.rpc('get_closed_loop_for_token', { p_token: tok } as never)
  if (error) throw new Error(`get_closed_loop_for_token: ${error.message}`)
  return data as unknown as Loop
}

async function addTask(
  fields: Record<string, unknown>,
): Promise<{ id: string; error: string | null }> {
  const { data, error } = await svc
    .from('tasks')
    .insert({ org_id: orgId, kind: 'tiltak', title: 'Tiltak', ...fields } as never)
    .select('id')
    .single()
  return { id: (data as { id?: string } | null)?.id ?? '', error: error?.message ?? null }
}

beforeAll(async () => {
  const org = await createOrg(ORG)
  orgId = org.id
  const survey = await createSurvey(orgId, `Sløyfepuls ${TAG}`, [
    { type: 'scale', text: 'Hvordan har uken vært?' },
  ])
  surveyId = survey.id
  const round = await createRound(survey, 3)
  roundId = round.id
  token = round.tokens[0]!

  // A share link on the SAME round: the no-invitation case, which is what the
  // opt-in has to refuse and what `can_opt_in` has to report.
  shareToken = `g1-share-${randomUUID()}`
  await createShareLink(roundId, shareToken, { svc })
}, 180_000)

afterAll(async () => {
  await dropOrg(ORG, svc)
})

describe('G1 — «DU SA · VI GJORDE» shows what was done', () => {
  it('1. the RPC exists and answers a live token', async () => {
    const r = await loop(token)
    expect(Array.isArray(r.items), 'no items array came back').toBe(true)
  })

  it('2. an unknown token is indistinguishable from an empty loop', async () => {
    const r = await loop(`nonsense-${randomUUID()}`)
    expect(r).toEqual({ items: [], wants_result: false, can_opt_in: false })
  })

  it('3. a BLIND-SPOT task cannot be shared at all — the CHECK refuses it', async () => {
    // Q72: such a task's TITLE is the finding. The column refuses the flag
    // rather than the reading RPC filtering it out, so a hand-set flag on a
    // generated row is impossible rather than merely ineffective.
    const bad = await addTask({
      source_kind: 'survey',
      source_ref: surveyId,
      status: 'lukket',
      shared_with_respondents: true,
      title: 'Denne undersøkelsen har grupper som ikke får egne resultater.',
    })
    expect(bad.error, 'a generated task was allowed to be shared').toMatch(/tasks_shared_is_manual/)
  })

  it('4. a shared, done, manual task reaches her — title and date, nothing else', async () => {
    const t = await addTask({
      source_kind: 'manuell',
      status: 'gjennomfort',
      law_ref: 'arbeidsmiljo',
      shared_with_respondents: true,
      title: `Møtefrie torsdager ${TAG}`,
    })
    expect(t.error).toBeNull()

    const r = await loop(token)
    const mine = r.items.find((i) => i.title === `Møtefrie torsdager ${TAG}`)
    expect(mine, 'the shared task did not reach the respondent').toBeTruthy()
    // THE PROPERTY, not a list of forbidden fields: the object carries exactly
    // two keys. A later edit that adds `law_ref`, an owner or a status fails
    // here rather than on a respondent's screen.
    expect(Object.keys(mine!).sort()).toEqual(['title', 'when'])
    expect(mine!.when, 'completed_at was not stamped by the trigger').toBeTruthy()
  })

  it('5. NOT shared is the default, and a done task stays private without it', async () => {
    const t = await addTask({
      source_kind: 'manuell',
      status: 'gjennomfort',
      title: `Undersøkelse etter varsel ${TAG}`,
    })
    expect(t.error).toBeNull()
    const { data } = await svc
      .from('tasks')
      .select('shared_with_respondents')
      .eq('id', t.id)
      .single()
    expect((data as { shared_with_respondents: boolean }).shared_with_respondents).toBe(false)

    const r = await loop(token)
    expect(r.items.map((i) => i.title)).not.toContain(`Undersøkelse etter varsel ${TAG}`)
  })

  it('6. a shared task that is NOT yet done stays private', async () => {
    const t = await addTask({
      source_kind: 'manuell',
      status: 'pagar',
      shared_with_respondents: true,
      title: `Pågår ennå ${TAG}`,
    })
    expect(t.error).toBeNull()
    const r = await loop(token)
    expect(r.items.map((i) => i.title)).not.toContain(`Pågår ennå ${TAG}`)
  })

  it('7. no task from ANOTHER organisation ever appears', async () => {
    const other = await createOrg(`Annen ${TAG}`)
    const { error } = await svc.from('tasks').insert({
      org_id: other.id,
      kind: 'tiltak',
      source_kind: 'manuell',
      status: 'lukket',
      shared_with_respondents: true,
      title: `Fremmed tiltak ${TAG}`,
    } as never)
    expect(error).toBeNull()

    const r = await loop(token)
    expect(r.items.map((i) => i.title)).not.toContain(`Fremmed tiltak ${TAG}`)
    await dropOrg(`Annen ${TAG}`, svc)
  })

  it('8. the stamp needs no clearing branch, because a task cannot leave the done band', async () => {
    // WRITTEN THE OTHER WAY FIRST, AND THE FAILURE IS WHY THIS TEST EXISTS.
    // `app.stamp_task_completed` originally cleared `completed_at` on falling
    // back below `gjennomfort` — symmetric, and unreachable: Q97 makes the
    // lifecycle advance-only. A defence against a state the database already
    // refuses is only sound when something PROVES the state cannot occur, so
    // this is that proof rather than a branch nobody can run.
    const t = await addTask({ source_kind: 'manuell', status: 'gjennomfort', title: `Frem og tilbake ${TAG}` })
    const stamped = await svc.from('tasks').select('completed_at').eq('id', t.id).single()
    expect((stamped.data as { completed_at: string | null }).completed_at).toBeTruthy()

    const back = await svc.from('tasks').update({ status: 'pagar' } as never).eq('id', t.id)
    expect(back.error?.message, 'a task went backwards, so the missing branch is reachable')
      .toMatch(/task_step_backwards/)

    // And advancing does NOT move the date: the stamp is when the work was
    // first done, which is what «gjennomført 5. sep» claims on the card.
    await svc.from('task_effect_assessments').insert({ task_id: t.id } as never)
    await svc.from('tasks').update({ status: 'effektvurdert' } as never).eq('id', t.id)
    const after = await svc.from('tasks').select('completed_at').eq('id', t.id).single()
    expect((after.data as { completed_at: string | null }).completed_at).toBe(
      (stamped.data as { completed_at: string | null }).completed_at,
    )
  })
})

describe('G1 — the opt-in writes nothing that links to her answers', () => {
  it('9. a share link cannot opt in — there is no invitation and nowhere to send it', async () => {
    const r = await loop(shareToken)
    expect(r.can_opt_in, 'a share link was offered the opt-in').toBe(false)

    const { data } = await anon.rpc('set_result_optin', {
      p_token: shareToken,
      p_want: true,
    } as never)
    expect((data as unknown as { ok: boolean }).ok).toBe(false)
  })

  it('10. an invited respondent can opt in, and it is readable back through her token', async () => {
    const before = await loop(token)
    expect(before.can_opt_in).toBe(true)
    expect(before.wants_result).toBe(false)

    const { data } = await anon.rpc('set_result_optin', { p_token: token, p_want: true } as never)
    expect((data as unknown as { ok: boolean }).ok).toBe(true)
    expect((await loop(token)).wants_result).toBe(true)
  })

  it('11. THE NEGATIVE TEST — the response is byte-identical across the opt-in', async () => {
    // Submit first, so there IS a response to compare. This is the real order:
    // the checkbox lives on the thanks screen, which only exists after submit.
    const fresh = await createRound(
      { id: surveyId, questions: [] },
      1,
      { roundNo: 2, svc },
    )
    const tok = fresh.tokens[0]!
    const { data: q } = await svc
      .from('survey_questions')
      .select('id')
      .eq('survey_id', surveyId)
      .limit(1)
      .single()
    const qid = (q as { id: string }).id

    await anon.rpc('submit_response', {
      p_token: tok,
      p_lang: 'no',
      p_answers: { [qid]: { value: 4 } },
      p_anon_choice: null,
      p_dry_run: false,
      p_comments: [],
    } as never)

    const cols = 'id, round_id, submission_key, anonymity_at_submission, invitation_id, respondent_group_id, lang, submitted_hour'
    const { data: before } = await svc.from('responses').select(cols).eq('round_id', fresh.id)
    const { data: ansBefore } = await svc
      .from('answers')
      .select('*')
      .in('response_id', (before as { id: string }[]).map((r) => r.id))

    // ASSERTED, NOT ASSUMED. Before the migration this same test PASSED —
    // vacuously, because the RPC did not exist and nothing changed. A negative
    // test that is green whether or not the write happened proves nothing, so
    // the write is confirmed here before its effects are compared.
    const { data: wrote } = await anon.rpc('set_result_optin', {
      p_token: tok,
      p_want: true,
    } as never)
    expect(
      (wrote as unknown as { ok: boolean }).ok,
      'the opt-in did not write, so the comparison below is vacuous',
    ).toBe(true)

    const { data: after } = await svc.from('responses').select(cols).eq('round_id', fresh.id)
    const { data: ansAfter } = await svc
      .from('answers')
      .select('*')
      .in('response_id', (after as { id: string }[]).map((r) => r.id))

    expect(after, 'the opt-in changed the response row').toEqual(before)
    expect(ansAfter, 'the opt-in changed an answer row').toEqual(ansBefore)
    expect((after as { invitation_id: string | null }[])[0]!.invitation_id).toBeNull()
  })

  it('12. and it is a boolean with no timestamp — the column adds no precision', async () => {
    // `responded_at` is already written at full precision by `submit_response`,
    // while the response gets `date_trunc('hour', now())`. The opt-in must not
    // add a SECOND moment to the invitation, because a second timestamp would
    // re-introduce ordering that hour-truncation removed.
    const cols = psql(
      `select column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'survey_invitations'`,
    )
    const want = cols.find((c) => c[0] === 'wants_result')
    expect(want?.[1]).toBe('boolean')
    const timestamps = cols
      .filter((c) => c[1]!.startsWith('timestamp'))
      .map((c) => c[0]!)
      .sort()
    expect(timestamps, 'a new timestamp appeared on the invitation').toEqual([
      'bounced_at',
      'created_at',
      'expires_at',
      'previous_token_expires_at',
      'responded_at',
      'sent_at',
    ])
  })
})
