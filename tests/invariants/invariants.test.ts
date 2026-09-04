import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anon, uniq } from '../helpers'
import { buildFixture, type Fixture } from './fixture'

/**
 * The security invariants from CLAUDE.md, proven against a real Postgres with
 * the real policies. If any of these fail the schema is wrong — do not "fix"
 * a test here by loosening the assertion.
 */
let f: Fixture

beforeAll(async () => {
  f = await buildFixture()
})

describe('(a) cross-org isolation', () => {
  it("org B's admin cannot read org A's surveys", async () => {
    const { data, error } = await f.adminB.client.from('surveys').select('id').eq('id', f.surveyA.id)
    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS filters rather than errors
  })

  it("org B's admin cannot read org A's members", async () => {
    const { data } = await f.adminB.client.from('org_members').select('id').eq('org_id', f.orgA.id)
    expect(data).toEqual([])
  })

  it("org A's admin CAN read org A's survey (proves the test is not vacuous)", async () => {
    const { data } = await f.adminA.client.from('surveys').select('id').eq('id', f.surveyA.id)
    expect(data).toHaveLength(1)
  })

  it("org B's admin cannot write into org A", async () => {
    const { error } = await f.adminB.client
      .from('surveys')
      .insert({ org_id: f.orgA.id, title: 'injected' })
    expect(error).not.toBeNull()
  })
})

describe('(b) responses and answers are default-deny', () => {
  it('leser cannot select from responses', async () => {
    const { data, error } = await f.leserA.client.from('responses').select('id')
    expect(error ?? { message: '' }).toBeTruthy()
    expect(data ?? []).toEqual([])
  })

  it('leser cannot select from answers', async () => {
    const { data } = await f.leserA.client.from('answers').select('id')
    expect(data ?? []).toEqual([])
  })

  it('not even an administrator can select from responses', async () => {
    const { data } = await f.adminA.client.from('responses').select('id')
    expect(data ?? []).toEqual([])
  })

  it('anon cannot reach responses or answers either', async () => {
    const a = anon()
    const r = await a.from('responses').select('id')
    const w = await a.from('answers').select('id')
    expect(r.data ?? []).toEqual([])
    expect(w.data ?? []).toEqual([])
  })
})

describe('(c) anonymity is structural', () => {
  it('an anonymous response with an invitation_id violates the CHECK', async () => {
    const a = admin()
    const { data: inv } = await a
      .from('survey_invitations')
      .select('id')
      .eq('round_id', f.round.id)
      .limit(1)
      .single()

    const { error } = await a.from('responses').insert({
      round_id: f.round.id,
      anonymity_at_submission: 'anonymous',
      invitation_id: inv!.id, // the forbidden linkage
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('responses_anonymous_unlinked')
  })

  it('a named response MAY carry an invitation_id', async () => {
    const a = admin()
    const { data: inv } = await a
      .from('survey_invitations').select('id').eq('round_id', f.round.id).limit(1).single()
    const { error } = await a.from('responses').insert({
      round_id: f.round.id, anonymity_at_submission: 'named', invitation_id: inv!.id,
    })
    expect(error).toBeNull()
  })
})

describe('(d) aggregate_results enforces k = 5', () => {
  it('returns insufficient_data at n = 4 and real data at n = 5', async () => {
    // Four submissions through the only write path.
    for (let i = 0; i < 4; i++) await submit(f.tokens[i]!, f, 3 + (i % 3), i)

    const four = await f.adminA.client.rpc('aggregate_results', { p_survey: f.surveyA.id })
    expect(four.error).toBeNull()
    const q4 = questionOf(four.data, f.scaleQ.id)
    expect(q4.insufficient_data).toBe(true)
    expect(q4.n).toBeNull()

    // The fifth crosses the threshold.
    await submit(f.tokens[4]!, f, 4, 4)

    const five = await f.adminA.client.rpc('aggregate_results', { p_survey: f.surveyA.id })
    const q5 = questionOf(five.data, f.scaleQ.id)
    expect(q5.insufficient_data).toBeUndefined()
    expect(q5.n).toBe(5)
    expect(Number(q5.avg)).toBeGreaterThan(0)
  })

  it('refuses a caller who is not a member of the org', async () => {
    const res = await f.adminB.client.rpc('aggregate_results', { p_survey: f.surveyA.id })
    expect(res.data).toMatchObject({ error: 'forbidden' })
  })

  it('refuses an unauthenticated caller', async () => {
    const res = await anon().rpc('aggregate_results', { p_survey: f.surveyA.id })
    // 0011 revoked EXECUTE from anon; if that ever regresses the RPC still
    // returns forbidden because auth.uid() is null.
    expect(res.error !== null || (res.data as { error?: string })?.error === 'forbidden').toBe(true)
  })
})

describe('(e) tokens cannot be replayed', () => {
  it('a second submit with the same token returns already_responded', async () => {
    const token = f.tokens[5]!
    const first = await anon().rpc('submit_response', {
      p_token: token, p_lang: 'no',
      p_answers: { [f.scaleQ.id]: { value: 4 } },
    })
    expect(first.data).toMatchObject({ ok: true })

    const second = await anon().rpc('submit_response', {
      p_token: token, p_lang: 'no',
      p_answers: { [f.scaleQ.id]: { value: 1 } },
    })
    expect(second.data).toMatchObject({ error: 'already_responded' })
  })

  it('an unknown token is rejected', async () => {
    const res = await anon().rpc('submit_response', {
      p_token: 'not-a-real-token', p_lang: 'no', p_answers: {},
    })
    expect(res.data).toMatchObject({ error: 'not_found_or_closed' })
  })

  it('an anonymous submission stores no linkage to the invitation', async () => {
    const a = admin()
    const { data } = await a
      .from('responses')
      .select('invitation_id, anonymity_at_submission, submitted_hour')
      .eq('round_id', f.round.id)
      .eq('anonymity_at_submission', 'anonymous')

    expect(data!.length).toBeGreaterThan(0)
    for (const row of data as { invitation_id: string | null; submitted_hour: string }[]) {
      expect(row.invitation_id).toBeNull()
      // Timestamp is truncated to the hour so it cannot correlate submissions.
      expect(new Date(row.submitted_hour).getUTCMinutes()).toBe(0)
      expect(new Date(row.submitted_hour).getUTCSeconds()).toBe(0)
    }
  })
})

describe('(f) leser cannot filter free text by group', () => {
  it('get_quotes with a group filter returns forbidden for leser', async () => {
    const res = await f.leserA.client.rpc('get_quotes', {
      p_survey: f.surveyA.id, p_question: f.textQ.id, p_group: f.groupA.id,
    })
    expect(res.data).toMatchObject({ error: 'forbidden' })
  })

  it('an administrator may use the group filter', async () => {
    const res = await f.adminA.client.rpc('get_quotes', {
      p_survey: f.surveyA.id, p_question: f.textQ.id, p_group: f.groupA.id,
    })
    expect((res.data as { error?: string })?.error).toBeUndefined()
  })

  it('returns real quotes once the threshold is met', async () => {
    // The suite previously only asserted the refusal side, so a get_quotes that
    // returned insufficient_data forever would have stayed green.
    const res = await f.adminA.client.rpc('get_quotes', {
      p_survey: f.surveyA.id,
      p_question: f.textQ.id,
    })
    const payload = res.data as { n?: number; quotes?: { text: string }[]; insufficient_data?: boolean }
    expect(payload.insufficient_data).toBeUndefined()
    expect(payload.n).toBeGreaterThanOrEqual(5)
    expect(payload.quotes?.length).toBeGreaterThan(0)
    // Never any author, group or timestamp in the payload.
    for (const q of payload.quotes ?? []) expect(Object.keys(q)).toEqual(['text'])
  })

  it('quotes stay k-gated below the threshold', async () => {
    // sparseTextQ has 2 answers, so this exercises the k gate rather than an
    // empty result.
    const res = await f.adminA.client.rpc('get_quotes', {
      p_survey: f.surveyA.id, p_question: f.sparseTextQ.id,
    })
    expect(res.data).toMatchObject({ insufficient_data: true, n: null })
  })
})

async function submit(token: string, fx: Fixture, value: number, index = 0) {
  const answers: Record<string, { value: unknown }> = {
    [fx.scaleQ.id]: { value },
    [fx.textQ.id]: { value: `Frisvar ${index}` },
  }
  // Only the first two respondents answer the sparse question, keeping it below k.
  if (index < 2) answers[fx.sparseTextQ.id] = { value: `Sjelden frisvar ${index}` }

  const res = await anon().rpc('submit_response', {
    p_token: token, p_lang: 'no', p_answers: answers,
  })
  if ((res.data as { error?: string })?.error) {
    throw new Error(`submit failed: ${JSON.stringify(res.data)}`)
  }
  return res
}

function questionOf(payload: unknown, questionId: string) {
  const questions = (payload as { questions: Record<string, unknown>[] }).questions
  const q = questions.find((x) => x['question_id'] === questionId)
  if (!q) throw new Error(`question ${questionId} missing from aggregate_results`)
  return q as { insufficient_data?: boolean; n: number | null; avg?: number }
}

describe('(g) D31 — a sent survey\'s questions are frozen in the database', () => {
  /**
   * Aggregation keys on `question_id`. A question edited after a round opened
   * silently re-labels answers already given to the old wording, and a deleted
   * one cascades its answers away — both corrupt results rather than raising,
   * so a UI-only guard fails invisibly in the place it matters most.
   *
   * The redaktør here is a co-editor on both surveys, so RLS permits every
   * write below. Anything that fails, fails because of the trigger — not
   * because a policy filtered the row away.
   */
  it('the redaktor really may edit an unsent survey (so the refusals below mean something)', async () => {
    const { data, error } = await f.redaktorA.client
      .from('survey_questions')
      .update({ text: 'Endret før utsending' })
      .eq('id', f.draftQ.id)
      .select('id, text')
    expect(error).toBeNull()
    // A non-empty result is what proves RLS is not the thing doing the work.
    expect(data).toHaveLength(1)
    expect(data?.[0]?.text).toBe('Endret før utsending')
  })

  it('a scheduled round does not freeze anything', async () => {
    // Only 'open' and 'closed' mean the questions have been seen. A survey
    // scheduled in advance must stay editable, or planning locks the Builder.
    const { error } = await f.redaktorA.client
      .from('survey_questions')
      .update({ help: 'fortsatt redigerbar' })
      .eq('id', f.draftQ.id)
    expect(error).toBeNull()
  })

  it('rejects UPDATE on a question whose survey has an open round', async () => {
    const { error } = await f.redaktorA.client
      .from('survey_questions')
      .update({ text: 'Omskrevet etter utsending' })
      .eq('id', f.scaleQ.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/frozen/i)
  })

  it('rejects DELETE on a question whose survey has an open round', async () => {
    const { error } = await f.redaktorA.client
      .from('survey_questions')
      .delete()
      .eq('id', f.scaleQ.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/frozen/i)
  })

  it('rejects INSERT of a new question into a sent survey', async () => {
    const { error } = await f.redaktorA.client.from('survey_questions').insert({
      survey_id: f.surveyA.id,
      position: 99,
      type: 'text',
      text: 'Smuglet inn etterpå',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/frozen/i)
  })

  it('the question survived every attempt', async () => {
    // The refusals must be refusals, not partial writes that errored late.
    const { data } = await admin().from('survey_questions').select('text').eq('id', f.scaleQ.id)
    expect(data?.[0]?.text).toBe('Hvordan har uken vært?')
  })

  it('rejects a translation write on a sent survey', async () => {
    // Translations carry the respondent-visible wording, so editing one after
    // sending changes what the question said just as surely as editingit source.
    const { error } = await f.redaktorA.client.from('question_translations').insert({
      question_id: f.scaleQ.id,
      lang: 'en',
      text: 'Rewritten after sending',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/frozen/i)
  })

  it('service role is refused too — this is a data rule, not a permission', async () => {
    // The trigger fires regardless of role. A background job or a migration
    // that edits a sent question corrupts results exactly as a user would.
    const { error } = await admin()
      .from('survey_questions')
      .update({ text: 'Fra en jobb' })
      .eq('id', f.scaleQ.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/frozen/i)
  })
})

/**
 * Migration 20260904000002 — two integrity triggers that also blocked the
 * cascade they were never meant to touch.
 *
 * Both fixes hinge on the same discriminator (the parent row is already gone),
 * so both need the negative half asserted: the guard must still refuse a direct
 * edit against a live parent, or the fix has simply removed the control.
 */
describe('integrity triggers survive their own cascade', () => {
  it('an audit row still cannot be deleted while its organisation exists', async () => {
    const a = admin()
    const { data: org } = await a
      .from('organizations')
      .insert({ name: uniq('Audit Live') })
      .select('id')
      .single()
    const { data: row } = await a
      .from('audit_events')
      .insert({ org_id: org!.id, action: 'test.event', actor_user_id: null })
      .select('id')
      .single()

    const { error } = await a.from('audit_events').delete().eq('id', row!.id)
    expect(error?.message ?? '').toMatch(/append-only/)

    // ...and it goes when the organisation does, which is what erasure needs.
    const { error: dropErr } = await a.from('organizations').delete().eq('id', org!.id)
    expect(dropErr).toBeNull()
    const { data: after } = await a.from('audit_events').select('id').eq('id', row!.id)
    expect(after ?? []).toHaveLength(0)
  })

  it('a co-editor grant survives its granter and does not pin the organisation open', async () => {
    const a = admin()
    const { data: org } = await a
      .from('organizations')
      .insert({ name: uniq('Grant Cascade') })
      .select('id')
      .single()
    const { data: granter } = await a
      .from('org_members')
      .insert({ org_id: org!.id, email: uniq('granter') + '@example.test', role: 'administrator', status: 'active' })
      .select('id')
      .single()
    const { data: editor } = await a
      .from('org_members')
      .insert({ org_id: org!.id, email: uniq('editor') + '@example.test', role: 'redaktor', status: 'active' })
      .select('id')
      .single()
    const { data: survey } = await a
      .from('surveys')
      .insert({ org_id: org!.id, title: uniq('Delt') })
      .select('id')
      .single()
    await a
      .from('survey_editors')
      .insert({ survey_id: survey!.id, member_id: editor!.id, granted_by: granter!.id })

    // The granter leaves: the grant stays, and only the attribution is lost.
    const { error: leaveErr } = await a.from('org_members').delete().eq('id', granter!.id)
    expect(leaveErr).toBeNull()
    const { data: grant } = await a
      .from('survey_editors')
      .select('member_id, granted_by')
      .eq('survey_id', survey!.id)
      .single()
    expect(grant!.member_id).toBe(editor!.id)
    expect(grant!.granted_by).toBeNull()

    // And the organisation is deletable, which one grant used to prevent.
    const { error: dropErr } = await a.from('organizations').delete().eq('id', org!.id)
    expect(dropErr).toBeNull()
  })

  it('a sent survey is still frozen against question edits, but deletable whole', async () => {
    const a = admin()
    const { data: org } = await a
      .from('organizations')
      .insert({ name: uniq('Freeze Live') })
      .select('id')
      .single()
    const { data: survey } = await a
      .from('surveys')
      .insert({ org_id: org!.id, title: uniq('Sendt'), status: 'aktiv' })
      .select('id')
      .single()
    const { data: q } = await a
      .from('survey_questions')
      .insert({ survey_id: survey!.id, position: 1, type: 'scale', text: 'Frosset' })
      .select('id')
      .single()
    await a.from('survey_rounds').insert({
      survey_id: survey!.id,
      round_no: 1,
      status: 'open',
      question_snapshot: [{ id: q!.id, type: 'scale', text: 'Frosset' }],
    })

    const { error } = await a.from('survey_questions').delete().eq('id', q!.id)
    expect(error?.message ?? '').toMatch(/frozen/)

    const { error: dropErr } = await a.from('surveys').delete().eq('id', survey!.id)
    expect(dropErr).toBeNull()
    const { data: after } = await a.from('survey_questions').select('id').eq('id', q!.id)
    expect(after ?? []).toHaveLength(0)

    await a.from('organizations').delete().eq('id', org!.id)
  })
})
