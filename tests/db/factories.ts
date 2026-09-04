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
    const userId = await findOrCreateUser(svc, m.email)

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

/**
 * Find an auth user by address, paging through the admin list.
 *
 * `listUsers()` returns the FIRST PAGE ONLY — 50 users by default — so an
 * unpaged call silently stops finding the demo personas the moment the local
 * stack accumulates more test users than that. The seed then failed with
 * "already been registered" for a user it had itself created, and the i18n
 * verifier with "administrator persona not found". Both were the same missing
 * loop, written twice; this is the one copy.
 */
export async function findUserByEmail(svc: Client, email: string): Promise<string | null> {
  const perPage = 200
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers(${email}): ${error.message}`)
    const hit = data.users.find((u) => u.email === email)
    if (hit) return hit.id
    if (data.users.length < perPage) break
  }
  return null
}

/** The auth user behind a persona, created once and reused afterwards. */
async function findOrCreateUser(svc: Client, email: string): Promise<string> {
  const existing = await findUserByEmail(svc, email)
  if (existing) return existing

  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: process.env.DEMO_PASSWORD ?? 'heituva-dev-password-1!',
    email_confirm: true,
  })
  if (error) throw new Error(`createUser(${email}): ${error.message}`)
  return data.user!.id
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
    /**
     * Which languages the survey was BUILT in. The respondent locale chain
     * only offers a language listed here — otherwise a `?lang=` would render
     * questions in a language nobody wrote them in.
     */
    langs?: string[]
    /**
     * Which template pack the survey came from. The duty engine links a survey
     * to a statutory duty through this key (duty_definitions.pack_key), so a
     * fixture that omits it produces a duty card that can never find its own
     * survey.
     */
    templatePackKey?: string
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
      langs: opts.langs ?? ['no'],
      anonymity: opts.anonymity ?? 'anonymous',
      status: opts.status ?? 'aktiv',
      template_pack_key: opts.templatePackKey ?? null,
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
  opts: { groupId?: string | null; roundNo?: number; svc?: Client } = {},
) {
  const svc = opts.svc ?? serviceClient()

  const { data: round, error } = await svc
    .from('survey_rounds')
    .insert({
      survey_id: survey.id,
      // `round_no` is unique per survey, so a fixture that wants a trend line
      // has to say which round it is building rather than making a second one.
      round_no: opts.roundNo ?? 1,
      status: 'open',
      question_snapshot: survey.questions as never,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createRound: ${error.message}`)

  const tokens = await inviteTo(round.id, invitations, opts.groupId ?? null, svc)
  return { id: round.id, tokens }
}

/**
 * More invitations on an existing round, optionally for a different group.
 *
 * A round's recipients are not all one team — that is the whole point of a
 * heatmap — so a fixture that only ever puts a round in one group cannot
 * produce the case the k gate exists for: one team above the threshold beside
 * one below it.
 */
export async function inviteTo(
  roundId: string,
  count: number,
  groupId: string | null = null,
  svc: Client = serviceClient(),
) {
  const tokens: string[] = []
  for (let i = 0; i < count; i++) {
    const raw = `${randomUUID()}`
    tokens.push(raw)
    const { error } = await svc.from('survey_invitations').insert({
      round_id: roundId,
      email: `respondent-${raw.slice(0, 8)}@example.test`,
      token_hash: hashToken(raw),
      group_id: groupId,
      channel: 'email',
    })
    if (error) throw new Error(`createInvitation(${i}): ${error.message}`)
  }
  return tokens
}

/**
 * A reusable share link on a round, with a token the caller chose.
 *
 * The capture and responsive sweeps need a respondent URL that survives being
 * visited over and over. An invitation token cannot do that — it is single-use
 * by design, and the second visit correctly shows the thank-you screen. A share
 * link has no `responded_at` to set, so it stays answerable, which is exactly
 * what "delbar lenke" means in the design.
 *
 * Only ever called from the local seed. The raw token is a fixed string there
 * for the same reason DEMO_PASSWORD is: a harness cannot look up a value that
 * is only stored hashed.
 */
export async function createShareLink(
  roundId: string,
  rawToken: string,
  opts: { kind?: 'link' | 'qr'; svc?: Client } = {},
) {
  const svc = opts.svc ?? serviceClient()
  const { error } = await svc.from('share_links').insert({
    round_id: roundId,
    kind: opts.kind ?? 'link',
    token_hash: hashToken(rawToken),
    active: true,
  })
  if (error) throw new Error(`createShareLink: ${error.message}`)
  return { token: rawToken }
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
  const { data, error } = await svc.from('organizations').select('id').eq('name', name)
  if (error) throw new Error(`dropOrg(${name}) lookup: ${error.message}`)
  for (const org of data ?? []) {
    // The error was swallowed here, and that is how the seed spent weeks
    // claiming to be idempotent while an append-only trigger silently blocked
    // every cascade (migration 20260904000002). A seed that cannot replace its
    // own data must say so.
    const { error: delErr } = await svc.from('organizations').delete().eq('id', org.id)
    if (delErr) throw new Error(`dropOrg(${name}): ${delErr.message}`)
  }
}
