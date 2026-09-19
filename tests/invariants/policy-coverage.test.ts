import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, asUser, uniq, dropOrgsById } from '../helpers'

/**
 * Denial coverage for the surfaces Gate 5a3 enumerated and found UNGUARDED.
 *
 * These are not Phase 5 tables. They span Phases 2, 3 and 5, and that is the
 * point: `reports` reached production untested because each phase verified its
 * own surfaces and nobody owned the whole list. Covering by phase reproduces
 * the gap. `scripts/verify/policy-coverage.ts` derives the list from the
 * catalog, so a table added in Phase 6 arrives failing until it appears here.
 *
 * Every denial is paired with a POSITIVE CONTROL. A denial that passes because
 * the fixture was empty is not a test — it is the shape of one.
 */

type Fx = Awaited<ReturnType<typeof buildFixture>>
let fx: Fx

beforeAll(async () => {
  fx = await buildFixture()
}, 90_000)

async function buildFixture() {
  const a = admin()

  const org = await insert(a, 'organizations', { name: uniq('Cov Org') })
  const other = await insert(a, 'organizations', { name: uniq('Cov Annen') })

  const administrator = await asUser(uniq('cov-admin') + '@example.test')
  const redaktor = await asUser(uniq('cov-red') + '@example.test')
  const leser = await asUser(uniq('cov-leser') + '@example.test')
  const outsider = await asUser(uniq('cov-ute') + '@example.test')
  /** Signed in, but a member of NO organisation. Distinct from `outsider`: it
   *  separates "wrong tenant" from "authenticated but nobody". */
  const stranger = await asUser(uniq('cov-fremmed') + '@example.test')

  const adminMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: administrator.userId, email: uniq('cov-admin') + '@example.test',
    role: 'administrator', status: 'active',
  })
  const redaktorMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: redaktor.userId, email: uniq('cov-red') + '@example.test',
    role: 'redaktor', status: 'active',
  })
  const leserMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: leser.userId, email: uniq('cov-leser') + '@example.test',
    role: 'leser', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: other.id, user_id: outsider.userId, email: uniq('cov-ute') + '@example.test',
    role: 'administrator', status: 'active',
  })

  const survey = await insert(a, 'surveys', {
    org_id: org.id, title: uniq('Cov survey'), status: 'aktiv', anonymity: 'anonymous',
    created_by: redaktorMember.id,
  })
  const question = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 1, type: 'scale', text: 'Hvordan går det?',
  })
  const round = await insert(a, 'survey_rounds', {
    survey_id: survey.id, round_no: 1, status: 'open',
    question_snapshot: [{ id: question.id, type: 'scale', text: 'Hvordan går det?' }],
  })
  const duty = await insert(a, 'duties', {
    org_id: org.id, definition_key: 'apenhet', interval_months: 12,
  })
  const pack = await insert(a, 'template_packs', {
    org_id: org.id, key: uniq('cov-pack'), category: 'Ansatte', title: 'Cov pakke',
    questions: [{ text: 'Hvordan går det?', type: 'scale' }],
  })

  // Rows for the surfaces under test, created with the service role because the
  // subject here is who can READ them, not who can create them. Where a real
  // producer exists it is exercised separately, in its own test below.
  const link = await insert(a, 'duty_survey_links', { duty_id: duty.id, survey_id: survey.id })
  const importJob = await insert(a, 'import_jobs', {
    org_id: org.id, survey_id: survey.id, source: 'csv', status: 'done',
    created_by: redaktorMember.id,
  })
  const rule = await insert(a, 'logic_rules', {
    survey_id: survey.id, kind: 'low_score_follow_up',
    config: { threshold: 2, question_id: question.id },
  })
  const loop = await insert(a, 'tasks', { org_id: org.id, title: uniq('Cov tiltak'), kind: 'tiltak' })
  const notification = await insert(a, 'notifications', {
    org_id: org.id, member_id: leserMember.id, kind: 'round_closed', payload: {},
  })
  const packTranslation = await insert(a, 'template_pack_translations', {
    pack_id: pack.id, lang: 'en', title: 'Cov pack',
  })
  // A pin belongs to ONE member, so the row is the administrator's and the
  // redaktør in the same org is one of the readers that must be refused.
  const pin = await insert(a, 'dashboard_pins', {
    org_id: org.id, user_id: administrator.userId, panel_key: 'trend',
  })

  return {
    org, other, survey, question, round, duty, pack,
    link, importJob, rule, loop, notification, packTranslation, pin,
    adminMember, redaktorMember, leserMember,
    administrator, redaktor, leser, outsider, stranger,
  }
}

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}

/**
 * Rows this client can see, matched on the table's OWN key columns.
 *
 * Not `select('id')`: duty_survey_links is keyed (duty_id, survey_id) and
 * template_pack_translations (pack_id, lang), so selecting a column that does
 * not exist returns zero rows and a denial test passes for the wrong reason —
 * which is exactly what it did before this was generalised.
 */
async function visible(client: SupabaseClient, table: string, match: Record<string, string>) {
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
    .match(match)
  if (error) return 0
  return count ?? 0
}

/**
 * The readers every org-scoped surface is checked against, named at collection
 * time and RESOLVED INSIDE the test. Returning clients from a helper called in
 * a describe body reads `fx` before beforeAll has built it — the whole file
 * then fails to collect with "Cannot read properties of undefined".
 */
const OUTSIDE_READERS = ['another organisation', 'a signed-in non-member', 'an anonymous caller'] as const
type Reader = (typeof OUTSIDE_READERS)[number]

function reader(who: Reader): SupabaseClient {
  if (who === 'another organisation') return fx.outsider.client
  if (who === 'a signed-in non-member') return fx.stranger.client
  return anon()
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

describe('duty_survey_links', () => {
  test('POSITIVE CONTROL: a redaktør in the org reads it', async () => {
    expect(await visible(fx.redaktor.client, 'duty_survey_links', { duty_id: fx.duty.id, survey_id: fx.survey.id })).toBe(1)
  })
  for (const who of OUTSIDE_READERS) {
    test(`${who} cannot read it`, async () => {
      expect(await visible(reader(who), 'duty_survey_links', { duty_id: fx.duty.id, survey_id: fx.survey.id })).toBe(0)
    })
  }
  test('a leser cannot link a survey to a duty', async () => {
    const { error } = await fx.leser.client
      .from('duty_survey_links').insert({ duty_id: fx.duty.id, survey_id: fx.survey.id }).select()
    expect(error).not.toBeNull()
  })
})

describe('import_jobs — a recipient import holds email addresses', () => {
  test('POSITIVE CONTROL: a redaktør in the org reads it', async () => {
    expect(await visible(fx.redaktor.client, 'import_jobs', { id: fx.importJob.id })).toBe(1)
  })
  for (const who of OUTSIDE_READERS) {
    test(`${who} cannot read it`, async () => {
      expect(await visible(reader(who), 'import_jobs', { id: fx.importJob.id })).toBe(0)
    })
  }
  test('a leser cannot read import jobs', async () => {
    // imports_all is the only policy, and it excludes leser entirely.
    expect(await visible(fx.leser.client, 'import_jobs', { id: fx.importJob.id })).toBe(0)
  })
})

describe('dashboard_pins — one member\'s working selection, not the org\'s', () => {
  test('POSITIVE CONTROL: the member who pinned it reads it back', async () => {
    expect(await visible(fx.administrator.client, 'dashboard_pins', { id: fx.pin.id })).toBe(1)
  })
  for (const who of OUTSIDE_READERS) {
    test(`${who} cannot read it`, async () => {
      expect(await visible(reader(who), 'dashboard_pins', { id: fx.pin.id })).toBe(0)
    })
  }
  test('a colleague in the same organisation cannot read another member\'s pins', async () => {
    // Membership is not enough on this table, deliberately: two people looking
    // at the same dashboard must not share one selection.
    expect(await visible(fx.redaktor.client, 'dashboard_pins', { id: fx.pin.id })).toBe(0)
  })
  test('a colleague cannot unpin what another member pinned', async () => {
    await fx.redaktor.client.from('dashboard_pins').delete().eq('id', fx.pin.id)
    expect(await visible(fx.administrator.client, 'dashboard_pins', { id: fx.pin.id })).toBe(1)
  })
  test('a member cannot pin on behalf of somebody else', async () => {
    const { error } = await fx.redaktor.client.from('dashboard_pins')
      .insert({ org_id: fx.org.id, user_id: fx.administrator.userId, panel_key: 'themes' })
      .select()
    expect(error).not.toBeNull()
  })
  test('a member cannot pin into an organisation they do not belong to', async () => {
    const { error } = await fx.redaktor.client.from('dashboard_pins')
      .insert({ org_id: fx.other.id, user_id: fx.redaktor.userId, panel_key: 'themes' })
      .select()
    expect(error).not.toBeNull()
  })
})

describe('logic_rules', () => {
  test('POSITIVE CONTROL: the survey creator reads it', async () => {
    expect(await visible(fx.redaktor.client, 'logic_rules', { id: fx.rule.id })).toBe(1)
  })
  for (const who of OUTSIDE_READERS) {
    test(`${who} cannot read it`, async () => {
      expect(await visible(reader(who), 'logic_rules', { id: fx.rule.id })).toBe(0)
    })
  }
  test('a leser cannot add a logic rule', async () => {
    const { error } = await fx.leser.client.from('logic_rules')
      .insert({ survey_id: fx.survey.id, kind: 'low_score_follow_up', config: {} }).select()
    expect(error).not.toBeNull()
  })
})

describe('tasks — the register loop_actions was superseded by (V2-4, Q68)', () => {
  test('POSITIVE CONTROL: a leser in the org reads it', async () => {
    // `tasks_sel` is `is_org_member`, and that is deliberate: the register is
    // the organisation's compliance record, not a private queue. A leser must
    // be able to see what is owed — the same reasoning `loop_sel` carried for
    // «sløyfen lukket», which is the surface this one replaces.
    expect(await visible(fx.leser.client, 'tasks', { id: fx.loop.id })).toBe(1)
  })
  for (const who of OUTSIDE_READERS) {
    test(`${who} cannot read it`, async () => {
      expect(await visible(reader(who), 'tasks', { id: fx.loop.id })).toBe(0)
    })
  }
  test('a leser cannot write one', async () => {
    const { error } = await fx.leser.client
      .from('tasks').insert({ org_id: fx.org.id, title: 'leser', kind: 'tiltak' }).select()
    expect(error).not.toBeNull()
  })
  test('another organisation cannot write one into this org', async () => {
    const { error } = await fx.outsider.client
      .from('tasks').insert({ org_id: fx.org.id, title: 'fremmed', kind: 'tiltak' }).select()
    expect(error).not.toBeNull()
  })
})

describe('notifications — addressed to one member, not to the org', () => {
  test('POSITIVE CONTROL: the addressee reads it', async () => {
    expect(await visible(fx.leser.client, 'notifications', { id: fx.notification.id })).toBe(1)
  })
  test('another member of the SAME org cannot read it', async () => {
    // The sharpest case: same tenant, wrong person. An org-scoped policy would
    // pass every other test in this file and still leak here.
    expect(await visible(fx.administrator.client, 'notifications', { id: fx.notification.id })).toBe(0)
  })
  for (const who of OUTSIDE_READERS) {
    test(`${who} cannot read it`, async () => {
      expect(await visible(reader(who), 'notifications', { id: fx.notification.id })).toBe(0)
    })
  }
})

describe('template_pack_translations', () => {
  test('POSITIVE CONTROL: a member of the owning org reads it', async () => {
    expect(await visible(fx.leser.client, 'template_pack_translations', { pack_id: fx.pack.id, lang: 'en' })).toBe(1)
  })
  for (const who of OUTSIDE_READERS) {
    test(`${who} cannot read an org-owned pack translation`, async () => {
      expect(await visible(reader(who), 'template_pack_translations', { pack_id: fx.pack.id, lang: 'en' })).toBe(0)
    })
  }
})

// ---------------------------------------------------------------------------
// SECURITY DEFINER functions
// ---------------------------------------------------------------------------

describe('mail_outbox_* — the queue holds invitation tokens and addresses', () => {
  const calls = [
    ['mail_outbox_read', { p_batch: 1, p_visibility: 5 }],
    ['mail_outbox_archive', { p_msg_id: 1 }],
    ['mail_outbox_delete', { p_msg_id: 1 }],
  ] as const

  for (const [fn, args] of calls) {
    test(`anon cannot execute ${fn}`, async () => {
      const { error } = await anon().rpc(fn, args)
      expect(error, `${fn} was callable without a session`).not.toBeNull()
    })
    test(`a signed-in user cannot execute ${fn}`, async () => {
      // These belong to the mail worker, which runs as the service role. No
      // human role has any business draining the outbox.
      const { error } = await fx.administrator.client.rpc(fn, args)
      expect(error, `${fn} was callable by an administrator`).not.toBeNull()
    })
  }

  test('POSITIVE CONTROL: the service role can read the outbox', async () => {
    const { error } = await admin().rpc('mail_outbox_read', { p_batch: 1, p_visibility: 5 })
    expect(error).toBeNull()
  })
})

describe('close_round', () => {
  test('anon cannot execute it', async () => {
    const { error } = await anon().rpc('close_round', { p_round: fx.round.id })
    expect(error).not.toBeNull()
  })
  test('a signed-in non-member is refused', async () => {
    const { data, error } = await fx.stranger.client.rpc('close_round', { p_round: fx.round.id })
    expect(error !== null || (data as { error?: string })?.error).toBeTruthy()
  })
  test('another organisation is refused', async () => {
    const { data, error } = await fx.outsider.client.rpc('close_round', { p_round: fx.round.id })
    expect(error !== null || (data as { error?: string })?.error).toBeTruthy()
  })
  test('a leser is refused: closing a round is an editor action', async () => {
    const { data, error } = await fx.leser.client.rpc('close_round', { p_round: fx.round.id })
    expect(error !== null || (data as { error?: string })?.error).toBeTruthy()
    const { data: after } = await admin().from('survey_rounds').select('status').eq('id', fx.round.id).single()
    expect(after?.status, 'a leser closed the round').toBe('open')
  })
  test('POSITIVE CONTROL: the survey creator can close it', async () => {
    const { data, error } = await fx.redaktor.client.rpc('close_round', { p_round: fx.round.id })
    expect(error).toBeNull()
    expect((data as { error?: string })?.error).toBeUndefined()
    const { data: after } = await admin().from('survey_rounds').select('status').eq('id', fx.round.id).single()
    expect(after?.status).toBe('closed')
  })
})

describe('send_round', () => {
  const args = (surveyId: string) => ({
    p_survey: surveyId,
    p_channels: ['link'],
    p_recipients: [],
    p_test_only: true,
  })

  test('anon cannot execute it', async () => {
    const { error } = await anon().rpc('send_round', args(fx.survey.id))
    expect(error).not.toBeNull()
  })
  test('a signed-in non-member is refused', async () => {
    const { data, error } = await fx.stranger.client.rpc('send_round', args(fx.survey.id))
    expect(error !== null || (data as { error?: string })?.error).toBeTruthy()
  })
  test('another organisation is refused', async () => {
    const { data, error } = await fx.outsider.client.rpc('send_round', args(fx.survey.id))
    expect(error !== null || (data as { error?: string })?.error).toBeTruthy()
  })
  test('a leser is refused: sending is an editor action', async () => {
    const before = await admin().from('survey_rounds').select('id').eq('survey_id', fx.survey.id)
    const { data, error } = await fx.leser.client.rpc('send_round', args(fx.survey.id))
    expect(error !== null || (data as { error?: string })?.error).toBeTruthy()
    const after = await admin().from('survey_rounds').select('id').eq('survey_id', fx.survey.id)
    expect((after.data ?? []).length, 'a leser created a round').toBe((before.data ?? []).length)
  })
})

/**
 * N10.2 — the organisations this file makes are removed here.
 *
 * It READS its own error and throws: a teardown whose rejection nobody reads is
 * a leak that reports success (D262). Deleting the organisation cascades to
 * everything org-scoped beneath it.
 */
afterAll(async () => {
  await dropOrgsById(fx?.org?.id, fx?.other?.id)
}, 120_000)
