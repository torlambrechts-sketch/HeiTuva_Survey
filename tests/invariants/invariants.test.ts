import { beforeAll, describe, expect, it } from 'vitest'
import { OPTION_DEFAULTS } from '../../lib/org/options'
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

describe('(b2) demo_requests is default-deny, and only request_demo writes it', () => {
  /**
   * The splash is public, so `request_demo` is one of the very few functions
   * `anon` may execute. The table behind it has no policy at all — the same
   * shape as responses/answers — because these are people who are not
   * customers yet: the rows belong to no organisation, so no organisation's
   * members may read them.
   */
  it('anon cannot select from demo_requests', async () => {
    const { data } = await anon().from('demo_requests').select('id')
    expect(data ?? []).toEqual([])
  })

  it('an administrator cannot select from demo_requests either', async () => {
    const { data } = await f.adminA.client.from('demo_requests').select('id')
    expect(data ?? []).toEqual([])
  })

  it('anon cannot insert into demo_requests directly', async () => {
    const { error } = await anon()
      .from('demo_requests')
      .insert({ name: 'X', company: 'Y', email: 'x@y.test' })
    expect(error).toBeTruthy()
  })

  it('anon CAN file one through request_demo, and gets no row handle back', async () => {
    const email = `${uniq('demo')}@annenbedrift.test`
    const { data, error } = await anon().rpc('request_demo', {
      p_name: 'Tomas Ruud', p_company: 'Annen Bedrift AS', p_email: email, p_plan: 'team',
    })
    expect(error).toBeNull()
    expect(data).toEqual({ ok: true })

    const { data: rows } = await admin().from('demo_requests').select('id, plan').eq('email', email)
    expect(rows).toHaveLength(1)
    expect(rows![0]!.plan).toBe('team')
  })

  it('request_demo validates its own input rather than trusting the caller', async () => {
    for (const bad of [
      { p_name: '  ', p_company: 'Y', p_email: 'a@b.test' },
      { p_name: 'X', p_company: '', p_email: 'a@b.test' },
      { p_name: 'X', p_company: 'Y', p_email: 'not-an-address' },
      { p_name: 'X'.repeat(121), p_company: 'Y', p_email: 'a@b.test' },
    ]) {
      const { data } = await anon().rpc('request_demo', bad)
      expect(data).toEqual({ error: 'invalid' })
    }
  })
})

describe('(b3) ui_messages overrides belong to one org and never to all of them', () => {
  /**
   * The table shipped with a policy that asked whether the caller administers
   * ANY organisation, over rows that belong to EVERY organisation. Nothing
   * exploited it because nothing wrote here; the Phase 6 editor is that writer,
   * so these are the tests that had to exist before it could ship.
   */
  const NS = 'common'
  const KEY = 'appName'

  it('the shipped default is a row with no org, and nobody may write it', async () => {
    const { data: shipped } = await admin()
      .from('ui_messages')
      .select('id, value')
      .eq('namespace', NS)
      .eq('key', KEY)
      .eq('lang', 'no')
      .is('org_id', null)
      .maybeSingle()
    expect(shipped).toBeTruthy()

    const { error } = await f.adminA.client
      .from('ui_messages')
      .update({ value: 'hijacked' })
      .eq('id', shipped!.id)
    // RLS filters rather than errors on update, so the proof is that the value
    // did not move.
    expect(error).toBeNull()
    const { data: after } = await admin()
      .from('ui_messages')
      .select('value')
      .eq('id', shipped!.id)
      .single()
    expect(after!.value).toBe(shipped!.value)
  })

  it('an administrator may write an override carrying their own org', async () => {
    const { error } = await f.adminA.client.from('ui_messages').insert({
      namespace: NS, key: KEY, lang: 'no', value: 'Org A sitt navn', org_id: f.orgA.id,
    })
    expect(error).toBeNull()

    const { data } = await admin()
      .from('ui_messages')
      .select('value')
      .eq('namespace', NS).eq('key', KEY).eq('lang', 'no').eq('org_id', f.orgA.id)
      .maybeSingle()
    expect(data?.value).toBe('Org A sitt navn')
  })

  it("an administrator cannot write an override carrying another org's id", async () => {
    const { error } = await f.adminA.client.from('ui_messages').insert({
      namespace: NS, key: KEY, lang: 'no', value: 'stolen', org_id: f.orgB.id,
    })
    expect(error).toBeTruthy()
  })

  it("and cannot delete another org's override", async () => {
    await admin().from('ui_messages').insert({
      namespace: NS, key: KEY, lang: 'en', value: 'Org B name', org_id: f.orgB.id,
    })
    await f.adminA.client
      .from('ui_messages')
      .delete()
      .eq('namespace', NS).eq('key', KEY).eq('lang', 'en').eq('org_id', f.orgB.id)

    const { data } = await admin()
      .from('ui_messages')
      .select('value')
      .eq('namespace', NS).eq('key', KEY).eq('lang', 'en').eq('org_id', f.orgB.id)
      .maybeSingle()
    expect(data?.value).toBe('Org B name')
  })

  it('a leser cannot write an override at all, not even for their own org', async () => {
    const { error } = await f.leserA.client.from('ui_messages').insert({
      namespace: NS, key: 'search', lang: 'no', value: 'nope', org_id: f.orgA.id,
    })
    expect(error).toBeTruthy()
  })

  it('reads stay open, because /s/[token] has no session', async () => {
    const { data } = await anon().from('ui_messages').select('key').eq('namespace', NS).limit(1)
    expect((data ?? []).length).toBe(1)
  })
})

describe('(b4) Phase 6 constraints refuse what they exist to refuse', () => {
  /**
   * Gate 2d, constraint proof: attempt the violation each CHECK/UNIQUE is
   * meant to prevent and show the database rejecting it. A constraint that is
   * never asked to refuse is indistinguishable from one that is not there.
   */
  it('an invitation with neither an email nor a phone is refused', async () => {
    const { data: round } = await admin()
      .from('survey_rounds').select('id').eq('survey_id', f.surveyA.id).limit(1).single()
    const { error } = await admin().from('survey_invitations').insert({
      round_id: round!.id, lang: 'no', channel: 'sms', token_hash: uniq('hash'),
    })
    expect(error?.message ?? '').toMatch(/invitations_reachable_check/)
  })

  it('a phone-only invitation is accepted, an email-only one too', async () => {
    const { data: round } = await admin()
      .from('survey_rounds').select('id').eq('survey_id', f.surveyA.id).limit(1).single()
    const byPhone = await admin().from('survey_invitations').insert({
      round_id: round!.id, phone: '+4791827364', lang: 'no', channel: 'sms', token_hash: uniq('hash'),
    })
    const byMail = await admin().from('survey_invitations').insert({
      round_id: round!.id, email: `${uniq('x')}@example.test`, lang: 'no', token_hash: uniq('hash'),
    })
    expect(byPhone.error).toBeNull()
    expect(byMail.error).toBeNull()
  })

  it('one shipped default per message: a second global row for the same key is refused', async () => {
    const first = await admin().from('ui_messages')
      .insert({ namespace: 'zz_test', key: 'dup', lang: 'no', value: 'a' })
    const second = await admin().from('ui_messages')
      .insert({ namespace: 'zz_test', key: 'dup', lang: 'no', value: 'b' })
    expect(first.error).toBeNull()
    expect(second.error?.message ?? '').toMatch(/ui_messages_scope_uk/)
    await admin().from('ui_messages').delete().eq('namespace', 'zz_test')
  })

  it('but an org may hold its own copy of that same key', async () => {
    await admin().from('ui_messages').insert({ namespace: 'zz_test2', key: 'k', lang: 'no', value: 'shipped' })
    const own = await admin().from('ui_messages')
      .insert({ namespace: 'zz_test2', key: 'k', lang: 'no', value: 'mine', org_id: f.orgA.id })
    expect(own.error).toBeNull()
    await admin().from('ui_messages').delete().eq('namespace', 'zz_test2')
  })
})

describe('(b5) SSO break-glass — the organisation can always get back in (D82, migration 0029)', () => {
  /**
   * Decision 2 of the Phase 6 acceptance: enforcement is org-wide, but at
   * least one active administrator must always be able to authenticate
   * without SSO. Runs with the service role deliberately — this is a data
   * rule, not a permission, and if the service role could bypass it a script
   * could lock an organisation out of its own settings.
   */
  let org: { id: string }
  let first: { id: string }
  let second: { id: string }
  /* G2 — SPREAD ONTO THE STORED OBJECT, which is what `setOption` does.
     These were bare `{ sso: true }` and replaced the whole column, dropping
     every other switch. Harmless while the fixture was the only writer and
     invisible while `options` had one meaningful key — and then `M:0124` added
     four that GOVERN features, and a whole-object write became a way to turn
     Tuva, quiz, live and klarspråk off by saving an unrelated setting.
     The product never wrote that way; the test did, and it was the test that
     made the difference visible. */
  const on = { ...OPTION_DEFAULTS, sso: true }
  const off = { ...OPTION_DEFAULTS, sso: false }

  const member = async (row: Record<string, unknown>) => {
    const { data, error } = await admin().from('org_members').insert(row).select('id').single()
    if (error) throw new Error(`org_members insert: ${error.message}`)
    return data as { id: string }
  }

  beforeAll(async () => {
    const { data } = await admin().from('organizations').insert({ name: uniq('Org SSO') }).select('id').single()
    org = data as { id: string }
    first = await member({ org_id: org.id, email: `${uniq('bg1')}@example.test`, role: 'administrator', status: 'active' })
    second = await member({ org_id: org.id, email: `${uniq('bg2')}@example.test`, role: 'administrator', status: 'active' })
  })

  it('turning SSO on while nobody is exempt is refused', async () => {
    const { error } = await admin().from('organizations').update({ options: on }).eq('id', org.id)
    expect(error?.message ?? '').toMatch(/sso_no_break_glass/)
  })

  it('with one exempt active administrator it is accepted', async () => {
    const mark = await admin().from('org_members').update({ sso_exempt: true }).eq('id', first.id)
    expect(mark.error).toBeNull()
    const { error } = await admin().from('organizations').update({ options: on }).eq('id', org.id)
    expect(error).toBeNull()
  })

  it('while on, the last exempt administrator cannot be un-exempted', async () => {
    const { error } = await admin().from('org_members').update({ sso_exempt: false }).eq('id', first.id)
    expect(error?.message ?? '').toMatch(/sso_last_break_glass/)
  })

  it('nor demoted, deactivated or deleted', async () => {
    const demote = await admin().from('org_members').update({ role: 'leser' }).eq('id', first.id)
    const deactivate = await admin().from('org_members').update({ status: 'inactive' }).eq('id', first.id)
    const remove = await admin().from('org_members').delete().eq('id', first.id)
    expect(demote.error?.message ?? '').toMatch(/sso_last_break_glass/)
    expect(deactivate.error?.message ?? '').toMatch(/sso_last_break_glass/)
    expect(remove.error?.message ?? '').toMatch(/sso_last_break_glass/)
  })

  it('but ordinary maintenance of that row passes — the trigger compares what carries meaning', async () => {
    const { error } = await admin().from('org_members').update({ name: 'Renamed' }).eq('id', first.id)
    expect(error).toBeNull()
  })

  it('a second exempt administrator releases the first, and becomes the protected one', async () => {
    await admin().from('org_members').update({ sso_exempt: true }).eq('id', second.id)
    const release = await admin().from('org_members').update({ sso_exempt: false }).eq('id', first.id)
    expect(release.error).toBeNull()
    const again = await admin().from('org_members').update({ sso_exempt: false }).eq('id', second.id)
    expect(again.error?.message ?? '').toMatch(/sso_last_break_glass/)
  })

  it('turning SSO off releases everyone', async () => {
    const { error: offError } = await admin().from('organizations').update({ options: off }).eq('id', org.id)
    expect(offError).toBeNull()
    const { error } = await admin().from('org_members').update({ sso_exempt: false }).eq('id', second.id)
    expect(error).toBeNull()
  })

  it('an exemption on a non-administrator counts for nothing', async () => {
    const leser = await member({
      org_id: org.id, email: `${uniq('bg3')}@example.test`, role: 'leser', status: 'active', sso_exempt: true,
    })
    const { error } = await admin().from('organizations').update({ options: on }).eq('id', org.id)
    expect(error?.message ?? '').toMatch(/sso_no_break_glass/)
    await admin().from('org_members').delete().eq('id', leser.id)
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
