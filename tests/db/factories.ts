import { createHash, randomUUID } from 'node:crypto'
import { anonClient, serviceClient, type Client } from './clients'

/** Mirrors app.hash_token — invitation tokens are only ever stored hashed. */
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex')

export type MemberSpec = { email: string; role: 'administrator' | 'redaktor' | 'leser'; name?: string }

export type QuestionSpec = {
  type: 'scale' | 'likert' | 'text' | 'choice' | 'yesno' | 'enps' | 'smiley' | 'slider'
  text: string
  config?: Record<string, unknown>
}

/**
 * Fixtures are arranged with the service role deliberately: setup is not the
 * thing under test. Every assertion must still run through a persona client.
 */
export async function createOrg(
  name: string,
  members: MemberSpec[] = [],
  opts: { groupName?: string; svc?: Client } = {},
) {
  const svc = opts.svc ?? serviceClient()

  const { data: org, error } = await svc
    .from('organizations')
    .insert({ name })
    .select('id, name')
    .single()
  if (error) throw new Error(`createOrg(${name}): ${error.message}`)

  let groupId: string | null = null
  if (opts.groupName) {
    const { data: group, error: gErr } = await svc
      .from('groups')
      .insert({ org_id: org.id, name: opts.groupName })
      .select('id')
      .single()
    if (gErr) throw new Error(`createGroup(${opts.groupName}): ${gErr.message}`)
    groupId = group.id
  }

  const created: { memberId: string; userId: string; email: string; role: string }[] = []
  for (const m of members) {
    // Reuse the auth user if a previous seed already made it.
    const { data: list } = await svc.auth.admin.listUsers()
    let userId = list?.users.find((u) => u.email === m.email)?.id
    if (!userId) {
      const { data, error: uErr } = await svc.auth.admin.createUser({
        email: m.email,
        password: process.env.DEMO_PASSWORD ?? 'heituva-dev-password-1!',
        email_confirm: true,
      })
      if (uErr) throw new Error(`createUser(${m.email}): ${uErr.message}`)
      userId = data.user!.id
    }

    const { data: member, error: mErr } = await svc
      .from('org_members')
      .insert({
        org_id: org.id,
        user_id: userId,
        email: m.email,
        name: m.name ?? null,
        role: m.role,
        status: 'active',
        group_id: m.role === 'leser' ? groupId : null,
      })
      .select('id')
      .single()
    if (mErr) throw new Error(`addMember(${m.email}): ${mErr.message}`)

    await svc
      .from('profiles')
      .upsert({ user_id: userId, display_name: m.name ?? m.email, lang: 'no' })

    created.push({ memberId: member.id, userId, email: m.email, role: m.role })
  }

  return { id: org.id, name: org.name, groupId, members: created }
}

export async function createSurvey(
  orgId: string,
  title: string,
  questions: QuestionSpec[],
  opts: {
    anonymity?: 'anonymous' | 'named' | 'optional'
    status?: 'utkast' | 'aktiv' | 'lukket'
    /** The design's meta line starts with who the survey is for. */
    audience?: string
    svc?: Client
  } = {},
) {
  const svc = opts.svc ?? serviceClient()

  const { data: survey, error } = await svc
    .from('surveys')
    .insert({
      org_id: orgId,
      title,
      audience_label: opts.audience ?? null,
      anonymity: opts.anonymity ?? 'anonymous',
      status: opts.status ?? 'aktiv',
    })
    .select('id, title')
    .single()
  if (error) throw new Error(`createSurvey(${title}): ${error.message}`)

  const created: { id: string; type: string; text: string }[] = []
  for (const [i, q] of questions.entries()) {
    const { data, error: qErr } = await svc
      .from('survey_questions')
      .insert({
        survey_id: survey.id,
        position: i + 1,
        type: q.type,
        text: q.text,
        config: (q.config ?? {}) as never,
      })
      .select('id, type, text')
      .single()
    if (qErr) throw new Error(`addQuestion(${q.text}): ${qErr.message}`)
    created.push(data)
  }

  return { ...survey, questions: created }
}

/** A round plus `invitations` unused tokens. Raw tokens are returned so tests
 *  can submit; only their hashes reach the database. */
export async function createRound(
  survey: { id: string; questions: { id: string; type: string; text: string }[] },
  invitations: number,
  opts: { groupId?: string | null; svc?: Client } = {},
) {
  const svc = opts.svc ?? serviceClient()

  const { data: round, error } = await svc
    .from('survey_rounds')
    .insert({
      survey_id: survey.id,
      round_no: 1,
      status: 'open',
      question_snapshot: survey.questions as never,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createRound: ${error.message}`)

  const tokens: string[] = []
  for (let i = 0; i < invitations; i++) {
    const raw = `${randomUUID()}`
    tokens.push(raw)
    const { error: iErr } = await svc.from('survey_invitations').insert({
      round_id: round.id,
      email: `respondent-${i}@example.test`,
      token_hash: hashToken(raw),
      group_id: opts.groupId ?? null,
      channel: 'email',
    })
    if (iErr) throw new Error(`createInvitation(${i}): ${iErr.message}`)
  }

  return { id: round.id, tokens }
}

/**
 * Submits `count` responses through rpc.submit_response — the only real write
 * path. Never insert into responses/answers directly: doing so would bypass the
 * anonymity CHECK and the participation bookkeeping, so a test built that way
 * would pass against a schema that is actually broken.
 */
export async function submitResponses(
  tokens: string[],
  answersFor: (index: number) => Record<string, { value: unknown; comment?: string }>,
  count = tokens.length,
) {
  const anon = anonClient()
  const used: string[] = []

  for (let i = 0; i < count; i++) {
    const token = tokens[i]
    if (!token) throw new Error(`submitResponses: only ${tokens.length} tokens for count ${count}`)

    const { data, error } = await anon.rpc('submit_response', {
      p_token: token,
      p_lang: 'no',
      p_answers: answersFor(i) as never,
    })
    if (error) throw new Error(`submit_response(${i}): ${error.message}`)
    const payload = data as { ok?: boolean; error?: string }
    if (payload?.error) throw new Error(`submit_response(${i}) refused: ${payload.error}`)
    used.push(token)
  }

  return { submitted: used.length, usedTokens: used, unusedTokens: tokens.slice(count) }
}

/** Removes seeded demo data so a re-seed is idempotent. Service role by
 *  necessity — nothing else can delete across orgs. */
export async function dropOrg(name: string, svc: Client = serviceClient()) {
  const { data } = await svc.from('organizations').select('id').eq('name', name)
  for (const org of data ?? []) {
    await svc.from('organizations').delete().eq('id', org.id)
  }
}
