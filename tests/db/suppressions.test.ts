import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  leserClient,
  outsiderClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * V2-3b — Reservasjonsliste. DECISIONS **Q60** (an objection is org-wide) and
 * the structural constraint `03-plan.md` carries from V2-3's withdrawn
 * coupling argument.
 *
 * ── WHAT THE BLOCKER IS ACTUALLY GUARDING ───────────────────────────────────
 *
 * Not «does `send_round` skip a suppressed address» — that is one function on
 * one day. The property is **no recipient source can reach a suppressed person,
 * including one nobody has written yet**, and the two halves of it are
 * different tests:
 *
 *   the scenario   a suppressed address is not invited, by each path
 *   the derivation every `insert into survey_invitations` in `pg_proc` consults
 *                  `app.is_suppressed`, over the SET, so a fourth insertion
 *                  point fails HERE rather than in production
 *
 * **The derivation is why the plan's own count being wrong did not matter.** It
 * said two insertion points; there are three, and the third —
 * `app.run_due_schedules`, which copies round N's invitations into round N+1 —
 * is the one no screen leads to and the one that re-invites a person who
 * objected. A hand-written list of two would have passed while missing it.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

let svc: Client
let admin: Client
let redaktor: Client
let leser: Client
let outsider: Client
let orgId: string
let otherOrgId: string

const stamp = `${process.pid}`
const OBJECTOR = `reservert-${stamp}@nordiskstudio.test`
const WILLING = `villig-${stamp}@nordiskstudio.test`
let groupId = ''
const surveys: string[] = []
const members: string[] = []

/** A draft survey with one question, ready to send. */
async function makeSurvey(title: string): Promise<string> {
  const { data } = await svc
    .from('surveys')
    .insert({ org_id: orgId, title, respondent_kind: 'person', anonymity: 'anonymous' })
    .select('id')
    .single()
  surveys.push(data!.id)
  await svc
    .from('survey_questions')
    .insert({ survey_id: data!.id, position: 1, type: 'scale', text: 'Hvordan går det?' })
  return data!.id
}

const invitedEmails = async (surveyId: string): Promise<string[]> => {
  const { data: rounds } = await svc.from('survey_rounds').select('id').eq('survey_id', surveyId)
  const ids = (rounds ?? []).map((r) => r.id)
  if (!ids.length) return []
  const { data } = await svc.from('survey_invitations').select('email').in('round_id', ids)
  return (data ?? []).map((r) => r.email).filter(Boolean) as string[]
}

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor, leser, outsider] = await Promise.all([
    adminClient(),
    redaktorClient(),
    leserClient(),
    outsiderClient(),
  ])
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id

  const { data: g } = await svc
    .from('groups')
    .insert({ org_id: orgId, name: `Reservasjon ${stamp}` })
    .select('id')
    .single()
  groupId = g!.id

  // Two members of one group: one who has objected, one who has not. The
  // second is the positive control — without it, a send that reached nobody
  // would pass every assertion below.
  const { data: m } = await svc
    .from('org_members')
    .insert([
      { org_id: orgId, email: OBJECTOR, name: 'Nora Lie', role: 'leser', group_id: groupId, status: 'active' },
      { org_id: orgId, email: WILLING, name: 'Petter Holm', role: 'leser', group_id: groupId, status: 'active' },
    ])
    .select('id')
  members.push(...m!.map((r) => r.id))

  await svc.from('suppressions').insert({
    org_id: orgId,
    email: OBJECTOR,
    reason: 'har sagt nei til undersøkelser',
    source: 'manuell',
  })
}, 120_000)

/** Standing question 4. A suppression or a member surviving this file changes
 *  every later recipient count, and `verify:roundtrip` was fixed in V1-6 for
 *  exactly that. Surveys go first: `survey_invitations.group_id` is RESTRICT
 *  now (`M:0059`), so the group cannot be deleted while a round references it. */
afterAll(async () => {
  for (const id of surveys) await svc.from('surveys').delete().eq('id', id)
  await svc.from('suppressions').delete().eq('org_id', orgId).in('email', [OBJECTOR, WILLING])
  if (members.length) await svc.from('org_members').delete().in('id', members)
  if (groupId) await svc.from('groups').delete().eq('id', groupId)
})

describe('(Q60) a suppressed address is not invited, by any path', () => {
  it('1. a NAMED recipient who has objected is not invited', async () => {
    const s = await makeSurvey(`Navngitt ${stamp}`)
    const { error } = await admin.rpc('send_round', {
      p_survey: s,
      p_channels: ['email'],
      p_recipients: [{ email: OBJECTOR, name: 'Nora' }, { email: WILLING, name: 'Petter' }],
    })
    expect(error, 'the round still sends — one objection does not abort it').toBeNull()

    const invited = await invitedEmails(s)
    expect(invited, 'the objector is absent').not.toContain(OBJECTOR)
    // POSITIVE CONTROL: without this the assertion above passes if the send
    // silently reached nobody at all.
    expect(invited, 'and the other recipient really was invited').toContain(WILLING)
  })

  it('2. BLOCKER — re-sending the SAME list does not let them back in', async () => {
    // The failure mode that makes suppression theatre: somebody re-uploads last
    // quarter's spreadsheet and the objection is quietly undone. The guard is at
    // send, so the list is irrelevant — it can be imported as many times as
    // anyone likes.
    const s = await makeSurvey(`Import igjen ${stamp}`)
    for (const round of [1, 2]) {
      const { error } = await admin.rpc('send_round', {
        p_survey: s,
        p_channels: ['email'],
        p_recipients: [{ email: OBJECTOR }, { email: WILLING }],
      })
      expect(error, `send ${round} succeeds`).toBeNull()
    }
    const invited = await invitedEmails(s)
    expect(invited.filter((e) => e === OBJECTOR), 'never, on either send').toEqual([])
    expect(invited.filter((e) => e === WILLING).length, 'twice, once per round').toBe(2)
  })

  it('5. a suppressed GROUP MEMBER is excluded from a group-targeted send', async () => {
    const s = await makeSurvey(`Gruppe ${stamp}`)
    const { error } = await admin.rpc('send_round', {
      p_survey: s,
      p_channels: ['email'],
      p_group_ids: [groupId],
    })
    expect(error).toBeNull()
    const invited = await invitedEmails(s)
    expect(invited).not.toContain(OBJECTOR)
    expect(invited, 'POSITIVE CONTROL: the group send worked').toContain(WILLING)
  })

  it('THE BACKSTOP: inserting one directly RAISES rather than being dropped', async () => {
    // The trigger never fires in normal operation, because each loop skips
    // first. So this is the only place it can be shown to exist — and a
    // suppression suite that never tests it would pass with the trigger
    // deleted.
    //
    // It must RAISE, not drop. Each loop does `insert …; perform pgmq.send(…)`,
    // and **the worker sends BEFORE it touches `survey_invitations`** — so a
    // dropped row would mean NO INVITATION AND A DELIVERED EMAIL, which is the
    // one outcome a suppression test checking this table would call a pass.
    // **A test that confirms the duty was met in exactly the case where it was
    // broken.** That is why the trigger raises, and why this test exists.
    const s = await makeSurvey(`Direkte ${stamp}`)
    const { data: round } = await svc
      .from('survey_rounds')
      .insert({ survey_id: s, round_no: 1, question_snapshot: [], status: 'open' })
      .select('id')
      .single()

    const { error } = await svc.from('survey_invitations').insert({
      round_id: round!.id,
      email: OBJECTOR,
      lang: 'no',
      channel: 'email',
      token_hash: 'x'.repeat(64),
    })
    expect(error?.message ?? '', 'the database refuses it by name').toMatch(/recipient_suppressed/)
  })

  it('THE DERIVATION: every insertion point consults the predicate', () => {
    // Standing question 3 — assert over the SET, not over the ones I edited.
    // This is what makes a FOURTH recipient source fail here instead of in
    // production, and it is why the plan's count of two did not matter.
    const inserters = psql(
      `select n.nspname||'.'||p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app')
          and p.prosrc ~* 'insert\\s+into\\s+(public\\.)?survey_invitations'
        order by 1`,
    ).map((r) => r[0]!)

    expect(inserters.length, 'at least the three known points, in two functions').toBeGreaterThanOrEqual(2)
    expect(inserters).toEqual(expect.arrayContaining(['app.run_due_schedules', 'public.send_round']))

    const unguarded = psql(
      `select n.nspname||'.'||p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app')
          and p.prosrc ~* 'insert\\s+into\\s+(public\\.)?survey_invitations'
          and p.prosrc !~* 'is_suppressed'
        order by 1`,
    ).map((r) => r[0]!)

    expect(
      unguarded,
      `these create invitations without consulting app.is_suppressed: ${unguarded.join(', ') || '(none)'}`,
    ).toEqual([])
  })
})

describe('who may record and lift an objection', () => {
  it('3. a redaktør may NOT — recording an objection is a privacy action', async () => {
    // Standing question 1: what ELSE could refuse this? RLS filters rather than
    // errors, so assert the VALUE did not move. And this is deliberately NOT
    // Q94's answer: composing an audience is routine, recording that a person
    // objected to being processed is the administrator's tab.
    const mail = `redaktorforsok-${stamp}@example.test`
    await redaktor.from('suppressions').insert({ org_id: orgId, email: mail })
    const { data } = await svc.from('suppressions').select('id').eq('email', mail)
    expect(data ?? [], 'nothing was written').toEqual([])
  })

  it('a leser may not either, but MAY read the list', async () => {
    const mail = `leserforsok-${stamp}@example.test`
    await leser.from('suppressions').insert({ org_id: orgId, email: mail })
    const { data } = await svc.from('suppressions').select('id').eq('email', mail)
    expect(data ?? []).toEqual([])

    // Reading is deliberate: a redaktør about to send needs to know why the
    // recipient count is lower than the group, and hiding it turns a legal
    // obligation into an unexplained number. Also the positive control for the
    // two refusals above.
    const { error } = await leser.from('suppressions').select('id').eq('org_id', orgId)
    expect(error, 'the list is not a secret inside the organisation').toBeNull()
  })

  it('4. cross-org: one organisation cannot suppress into another, or read it', async () => {
    const mail = `kryss-${stamp}@example.test`
    await outsider.from('suppressions').insert({ org_id: orgId, email: mail })
    const { data: written } = await svc.from('suppressions').select('id').eq('email', mail)
    expect(written ?? [], 'no cross-org write').toEqual([])

    const { data: seen } = await outsider.from('suppressions').select('id').eq('org_id', orgId)
    expect(seen ?? [], 'no cross-org read').toEqual([])

    // POSITIVE CONTROL: the outsider is a working administrator at home, so the
    // refusals above are about tenancy and not about a broken session.
    const home = `hjemme-${stamp}@example.test`
    const { error } = await outsider.from('suppressions').insert({ org_id: otherOrgId, email: home })
    expect(error, 'and it works in their own organisation').toBeNull()
    await svc.from('suppressions').delete().eq('org_id', otherOrgId).eq('email', home)
  })

  it('6. lifting an objection is audited', async () => {
    const mail = `opphevet-${stamp}@example.test`
    await svc.from('suppressions').insert({ org_id: orgId, email: mail, reason: 'feilført' })
    // `since` rather than a bare count: a previous RUN of this file leaves audit
    // rows behind, and asserting on a row an earlier run wrote is how V2-2's
    // branding test passed with its trigger dropped.
    const since = new Date().toISOString()
    await admin.from('suppressions').delete().eq('org_id', orgId).eq('email', mail)

    const { data } = await svc
      .from('audit_events')
      .select('action, target, meta')
      .eq('org_id', orgId)
      .eq('action', 'suppression.lift')
      .gte('created_at', since)
    expect(data ?? [], 'exactly one audit row, from this delete').toHaveLength(1)
    expect(data![0]!.target, 'and it names the address').toBe(mail)
  })

  it('(Q96) THE SAME PERSON MAY DO BOTH, AND THE AUDIT ROW SHOWS THAT THEY DID', async () => {
    // Q96 rejects separation of duties and keeps audit: four-eyes would leave a
    // single-administrator organisation unable to lift anything, and prod has
    // one member. So the product does not REFUSE the same person entering and
    // lifting an objection — it makes it VISIBLE, and that is only true if the
    // row carries both halves.
    //
    // Written through the persona client rather than the service role, because
    // `created_by` defaults to `auth.uid()` and the service role has none: this
    // is the path a real administrator takes.
    const mail = `sammeperson-${stamp}@example.test`
    const { error: insErr } = await admin
      .from('suppressions')
      .insert({ org_id: orgId, email: mail, reason: 'skrivefeil' })
    expect(insErr).toBeNull()

    const { data: row } = await svc
      .from('suppressions')
      .select('created_by')
      .eq('org_id', orgId)
      .eq('email', mail)
      .single()
    // The column had NO WRITER before `M:0061` — D110's instance 2 in the same
    // phase that named it. Asserted here rather than assumed, because Q96's
    // whole mechanism reads it.
    expect(row!.created_by, 'the default recorded who entered it').not.toBeNull()

    const since = new Date().toISOString()
    await admin.from('suppressions').delete().eq('org_id', orgId).eq('email', mail)

    const { data } = await svc
      .from('audit_events')
      .select('actor_user_id, meta')
      .eq('org_id', orgId)
      .eq('action', 'suppression.lift')
      .gte('created_at', since)
    expect(data ?? [], 'one row').toHaveLength(1)

    const meta = data![0]!.meta as { entered_by: string | null; entered_at: string | null }
    expect(meta.entered_by, 'the row names who ENTERED it').toBe(row!.created_by)
    expect(meta.entered_at, 'and when').toBeTruthy()
    // The point of the whole decision, asserted as an equality rather than
    // described: a reviewer reading this row sees one person on both sides.
    expect(data![0]!.actor_user_id, 'and the lifter is the same person').toBe(meta.entered_by)
  })

  it('ERASING AN ORGANISATION IS NOT A LIFT — the audit trigger lets the cascade through', async () => {
    // CLAUDE.md's referential-maintenance rule, and this asserts the claim
    // `M:0060`'s trigger comment makes rather than leaving it as prose. Deleting
    // an org cascades to `suppressions`; the trigger fires per row and would
    // write an audit row referencing an organisation that is already gone,
    // which `audit_events_org_id_fkey` refuses — taking the whole delete with
    // it. It surfaced as `dropOrg` failing in the seed, which is the «far from
    // the trigger» the note warns about.
    //
    // Two halves, and the second is the one that would rot quietly: the erase
    // SUCCEEDS, and it wrote no audit row — because an audit row exists to
    // answer «who let this address back in», and there is nobody left to answer.
    const { data: org } = await svc
      .from('organizations')
      .insert({ name: `Slettes ${stamp}` })
      .select('id')
      .single()
    await svc.from('suppressions').insert({ org_id: org!.id, email: `slett-${stamp}@example.test` })

    const since = new Date().toISOString()
    const { error } = await svc.from('organizations').delete().eq('id', org!.id)
    expect(error, 'the organisation can be erased — RESTRICT could not say this').toBeNull()

    const { count } = await svc
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'suppression.lift')
      .gte('created_at', since)
    expect(count, 'a cascade is not a lift').toBe(0)
  })

  it('one objection per address, however it is capitalised', async () => {
    const { error } = await admin.from('suppressions').insert({
      org_id: orgId,
      email: OBJECTOR.toUpperCase(),
    })
    expect(error?.code, 'the unique index is on lower(email)').toBe('23505')
  })
})
