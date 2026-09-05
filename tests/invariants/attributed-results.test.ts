import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, asUser, uniq } from '../helpers'
import { hashToken } from './fixture'

/**
 * Phase 9 — the attributed path, the organisation-level threshold policy, and
 * the report composition rules the design brief asks for
 * (docs/Designbrief_terskel_Q17.md §5, §6, §8; DECISIONS Q17).
 *
 * Written and proven FAILING before any implementation existed, like the Q17
 * kernel before it. The contract under test:
 *
 *   A. public.attributed_results(p_survey) — the UNGATED path. k_for = 0 is a
 *      magic value meaning "no gate", and a path that gates on nothing must be
 *      proven to actually return data (an organisation survey with ONE answer
 *      returns that answer, with the organisation's name), AND proven to refuse
 *      everything that is not an organisation survey — a person survey, even a
 *      named one, even for an administrator. Leser is refused: attributed rows
 *      are named data, and leser reads aggregates only (CLAUDE.md role 4).
 *   B. organizations.default_k_threshold (3–10, default 5) governs NEW person
 *      surveys and nothing else; a statutory pack still wins. The redaktør-may-
 *      lower flag (organizations.privacy.redaktor_may_lower, off by default)
 *      is the only thing that lets a redaktør touch a threshold, and the change
 *      is audited either way.
 *   C. compose_report: the strictest threshold among the sources WINS for the
 *      whole document (a group visible at k=3 alone is withheld once a k=5
 *      survey joins the report), the payload names each source's own k, the
 *      method section carries the k the reader must see, and «Svar per
 *      virksomhet» (per_virksomhet) is REFUSED with a reason in any report that
 *      contains a person survey — never rendered gated, never rendered empty.
 */

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}

type Ctx = Awaited<ReturnType<typeof build>>
let ctx: Ctx

async function build() {
  const a = admin()
  const org = await insert(a, 'organizations', { name: uniq('Attribuert AS') })
  const other = await insert(a, 'organizations', { name: uniq('Annen AS') })
  const group = await insert(a, 'groups', { org_id: org.id, name: 'Team' })

  const mk = async (prefix: string, orgId: string, role: string) => {
    const email = uniq(prefix) + '@example.test'
    const u = await asUser(email)
    const member = await insert(a, 'org_members', {
      org_id: orgId, user_id: u.userId, email, role, status: 'active',
    })
    return { ...u, member }
  }
  const adminU = await mk('at-admin', org.id, 'administrator')
  const redaktorU = await mk('at-red', org.id, 'redaktor')
  const leserU = await mk('at-leser', org.id, 'leser')
  const outsiderU = await mk('at-ute', other.id, 'administrator')
  const strangerU = await asUser(uniq('at-fremmed') + '@example.test')

  return { a, an: anon(), org, other, group, adminU, redaktorU, leserU, outsiderU, strangerU }
}

/** A survey with one yes/no and one text question, an open round, and `n`
 *  invitations of which the first `answered` are submitted through the real
 *  write path. `extra` sets the policy columns. */
async function surveyWith(
  base: string,
  n: number,
  answered: number,
  extra: Record<string, unknown> = {},
  opts: { groupId?: string | null; names?: string[] } = {},
) {
  const a = ctx.a
  const survey = await insert(a, 'surveys', {
    org_id: ctx.org.id, title: uniq(base), status: 'aktiv', anonymity: 'anonymous', ...extra,
  })
  const qYes = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 1, type: 'yesno',
    text: 'Har virksomheten en policy for menneskerettigheter?',
  })
  const qScale = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 2, type: 'scale', text: 'Hvordan har uken vært?',
  })
  const round = await insert(a, 'survey_rounds', {
    survey_id: survey.id, round_no: 1, status: 'open',
    question_snapshot: [
      { id: qYes.id, type: 'yesno', text: 'Har virksomheten en policy for menneskerettigheter?' },
      { id: qScale.id, type: 'scale', text: 'Hvordan har uken vært?' },
    ],
  })
  const invitations: { id: string; raw: string; name: string }[] = []
  for (let i = 0; i < n; i++) {
    const raw = uniq(`tok-${i}`)
    const name = opts.names?.[i] ?? `Leverandør ${i + 1}`
    const inv = await insert(a, 'survey_invitations', {
      round_id: round.id, email: `${raw}@example.test`, name,
      token_hash: hashToken(raw), group_id: opts.groupId === undefined ? ctx.group.id : opts.groupId,
      channel: 'email',
    })
    invitations.push({ id: inv.id, raw, name })
    if (i < answered) {
      const { data, error } = await ctx.an.rpc('submit_response', {
        p_token: raw, p_lang: 'no',
        p_answers: { [qYes.id]: { value: i % 2 === 0 }, [qScale.id]: { value: 4 } },
      })
      if (error) throw new Error(`submit_response: ${error.message}`)
      if ((data as { error?: string })?.error) throw new Error(`submit_response: ${(data as { error: string }).error}`)
    }
  }
  return { survey, qYes, qScale, round, invitations }
}

type Attributed = {
  error?: string
  k?: number
  respondent_kind?: string
  invited?: number
  responded?: number
  rows?: {
    invitation_id: string
    name: string | null
    status: 'svart' | 'ikke_svart' | 'paaminnet'
    responded_at: string | null
    answers: { question_id: string; value: unknown }[] | null
  }[]
}

const attributed = async (client: SupabaseClient, surveyId: string) => {
  const { data, error } = await client.rpc('attributed_results', { p_survey: surveyId })
  return { data: (data ?? {}) as Attributed, error }
}

beforeAll(async () => {
  ctx = await build()
}, 120_000)

// ---------------------------------------------------------------------------
// A. attributed_results — the ungated path
// ---------------------------------------------------------------------------
describe('(P9 A) attributed_results — the one path that gates on nothing', () => {
  it('an organisation survey with ONE answer returns that answer, attributed to the organisation', async () => {
    const s = await surveyWith('Leverandør', 1, 1,
      { respondent_kind: 'organisation', anonymity: 'named' }, { names: ['Nordkapp Fisk AS'] })
    const { data, error } = await attributed(ctx.redaktorU.client, s.survey.id)
    expect(error, 'a redaktør may read attributed results').toBeNull()
    expect(data.error).toBeUndefined()
    expect(data.k, 'no gate on an organisation survey').toBe(0)
    expect(data.rows).toHaveLength(1)
    const row = data.rows![0]!
    expect(row.name).toBe('Nordkapp Fisk AS')
    expect(row.status).toBe('svart')
    expect(row.responded_at).not.toBeNull()
    expect(row.answers?.find((x) => x.question_id === s.qYes.id)?.value).toBe(true)
  })

  it('lists who has NOT answered, and who has been reminded, by name', async () => {
    const s = await surveyWith('Leverandør', 3, 1,
      { respondent_kind: 'organisation', anonymity: 'named' })
    await ctx.a.from('survey_invitations')
      .update({ reminded_at: [new Date().toISOString()] }).eq('id', s.invitations[2]!.id)
    const { data } = await attributed(ctx.adminU.client, s.survey.id)
    const byId = new Map(data.rows?.map((r) => [r.invitation_id, r]))
    expect(byId.get(s.invitations[0]!.id)?.status).toBe('svart')
    expect(byId.get(s.invitations[1]!.id)?.status).toBe('ikke_svart')
    expect(byId.get(s.invitations[2]!.id)?.status).toBe('paaminnet')
    expect(byId.get(s.invitations[1]!.id)?.answers).toBeNull()
    expect(data.invited).toBe(3)
    expect(data.responded).toBe(1)
  })

  it('refuses a person survey — even a NAMED one, even for an administrator, even above k', async () => {
    const named = await surveyWith('Navngitt person', 6, 6, { anonymity: 'named' })
    const { data, error } = await attributed(ctx.adminU.client, named.survey.id)
    expect(error).toBeNull()
    expect(data.error, 'attribution is a respondent-type property, not an anonymity setting').toBe('not_attributed')
    expect(data.rows).toBeUndefined()

    const anonP = await surveyWith('Anonym person', 6, 6)
    const r2 = await attributed(ctx.adminU.client, anonP.survey.id)
    expect(r2.data.error).toBe('not_attributed')
    expect(r2.data.rows).toBeUndefined()
  })

  it('refuses a leser: attributed rows are named data, and leser reads aggregates only', async () => {
    const s = await surveyWith('Leverandør', 2, 2, { respondent_kind: 'organisation', anonymity: 'named' })
    const { data, error } = await attributed(ctx.leserU.client, s.survey.id)
    expect(error !== null || data.error === 'forbidden').toBe(true)
    expect(data.rows).toBeUndefined()
  })

  it('refuses another organisation, a member of no organisation, and anon', async () => {
    const s = await surveyWith('Leverandør', 2, 2, { respondent_kind: 'organisation', anonymity: 'named' })
    const out = await attributed(ctx.outsiderU.client, s.survey.id)
    expect(out.error !== null || out.data.error).toBeTruthy()
    expect(out.data.rows).toBeUndefined()
    const str = await attributed(ctx.strangerU.client, s.survey.id)
    expect(str.error !== null || str.data.error).toBeTruthy()
    expect(str.data.rows).toBeUndefined()
    const { error: anonErr } = await ctx.an.rpc('attributed_results', { p_survey: s.survey.id })
    expect(anonErr, 'anon must not be able to execute attributed_results').not.toBeNull()
  })
  it('an organisation survey is always named — attribution has nothing to attribute otherwise', async () => {
    const asAnon = await ctx.a.from('surveys').insert({
      org_id: ctx.org.id, title: uniq('Org anonym'), respondent_kind: 'organisation', anonymity: 'anonymous',
    }).select('id')
    expect(asAnon.error?.message ?? '', 'organisation + anonymous is refused at insert').toMatch(/check|constraint|named/i)

    const s = await surveyWith('Leverandør', 0, 0, { respondent_kind: 'organisation', anonymity: 'named' })
    const flipped = await ctx.adminU.client.from('surveys').update({ anonymity: 'optional' }).eq('id', s.survey.id)
    expect(flipped.error?.message ?? '', 'and cannot be flipped afterwards').toMatch(/check|constraint|named/i)
  })
})

// ---------------------------------------------------------------------------
// B. the organisation-level policy: default threshold and the redaktør flag
// ---------------------------------------------------------------------------
describe('(P9 B) organizations.default_k_threshold and the redaktør-may-lower flag', () => {
  it('has a floor of 3 and a ceiling of 10, and only an administrator may set it', async () => {
    const low = await ctx.a.from('organizations').update({ default_k_threshold: 2 }).eq('id', ctx.org.id)
    expect(low.error?.message ?? '', 'below the floor').toMatch(/check|floor|constraint/i)
    const high = await ctx.a.from('organizations').update({ default_k_threshold: 11 }).eq('id', ctx.org.id)
    expect(high.error?.message ?? '', 'above the brief\'s ceiling').toMatch(/check|constraint/i)

    const byRed = await ctx.redaktorU.client.from('organizations')
      .update({ default_k_threshold: 8 }).eq('id', ctx.org.id).select('id')
    expect(byRed.error != null || (byRed.data?.length ?? 0) === 0, 'a redaktør cannot set the org default').toBe(true)

    const byAdmin = await ctx.adminU.client.from('organizations')
      .update({ default_k_threshold: 8 }).eq('id', ctx.org.id).select('default_k_threshold').single()
    expect(byAdmin.error).toBeNull()
    expect(byAdmin.data?.default_k_threshold).toBe(8)
  })

  it('a NEW person survey inherits the org default; a statutory pack still wins; existing surveys are untouched', async () => {
    await ctx.a.from('organizations').update({ default_k_threshold: 8 }).eq('id', ctx.org.id)
    const before = await surveyWith('Før', 0, 0)
    // (created after the default was raised — so it should carry 8)
    const { data: fresh } = await ctx.a.from('surveys').select('k_threshold').eq('id', before.survey.id).single()
    expect(fresh?.k_threshold, 'a new person survey starts at the org default').toBe(8)

    const pack = await insert(ctx.a, 'surveys', {
      org_id: ctx.org.id, title: uniq('Psykososial'), template_pack_key: 'psykososial-kartlegging',
    })
    const { data: packRow } = await ctx.a.from('surveys').select('k_threshold, policy_locked').eq('id', pack.id).single()
    expect(packRow?.k_threshold, 'the law sets the pack survey\'s threshold, not the org').toBe(5)
    expect(packRow?.policy_locked).toBe(true)

    const orgS = await insert(ctx.a, 'surveys', {
      org_id: ctx.org.id, title: uniq('Leverandør'), respondent_kind: 'organisation', anonymity: 'named',
    })
    const { data: k0 } = await ctx.a.from('surveys').select('respondent_kind, k_threshold').eq('id', orgS.id).single()
    expect(k0?.respondent_kind, 'the org default is for persons; an organisation survey is untouched').toBe('organisation')

    // Lowering the default afterwards must not reach a survey that already exists.
    await ctx.a.from('organizations').update({ default_k_threshold: 5 }).eq('id', ctx.org.id)
    const { data: still } = await ctx.a.from('surveys').select('k_threshold').eq('id', before.survey.id).single()
    expect(still?.k_threshold, 'the org default is a starting point, not a live link').toBe(8)
  })

  it('a redaktør may change a threshold ONLY when the flag is on — and it is off by default, and audited either way', async () => {
    await ctx.a.from('organizations').update({ default_k_threshold: 5 }).eq('id', ctx.org.id)
    const { data: orgRow } = await ctx.a.from('organizations').select('privacy').eq('id', ctx.org.id).single()
    const privacy = (orgRow?.privacy as Record<string, unknown>) ?? {}
    expect(privacy.redaktor_may_lower ?? false, 'off by default').toBe(false)

    const s = await surveyWith('Redaktørterskel', 0, 0)
    await insert(ctx.a, 'survey_editors', { survey_id: s.survey.id, member_id: ctx.redaktorU.member.id })

    const off = await ctx.redaktorU.client.from('surveys').update({ k_threshold: 3 }).eq('id', s.survey.id).select('id')
    expect(off.error != null || (off.data?.length ?? 0) === 0, 'flag off: a redaktør is refused').toBe(true)

    await ctx.a.from('organizations').update({ privacy: { ...privacy, redaktor_may_lower: true } }).eq('id', ctx.org.id)
    const on = await ctx.redaktorU.client.from('surveys').update({ k_threshold: 3 }).eq('id', s.survey.id).select('k_threshold').single()
    expect(on.error, 'flag on: a redaktør may lower').toBeNull()
    expect(on.data?.k_threshold).toBe(3)

    const { data: events } = await ctx.a.from('audit_events')
      .select('action, actor_user_id, meta').eq('org_id', ctx.org.id)
      .eq('action', 'threshold.change').eq('target', s.survey.id)
    expect(events?.some((e) => e.actor_user_id === ctx.redaktorU.userId), 'the redaktør\'s change is audited').toBe(true)

    const floor = await ctx.redaktorU.client.from('surveys').update({ k_threshold: 2 }).eq('id', s.survey.id)
    expect(floor.error?.message ?? '', 'the flag never opens the floor').toMatch(/check|floor|constraint/i)

    await ctx.a.from('organizations').update({ privacy: { ...privacy, redaktor_may_lower: false } }).eq('id', ctx.org.id)
  })
})

// ---------------------------------------------------------------------------
// C. compose_report — strictest k, sources, method, per_virksomhet
// ---------------------------------------------------------------------------
type Composed = {
  error?: string
  k?: number
  sources?: { survey_id: string; title: string; k: number; respondent_kind: string }[]
  sections?: {
    key: string
    pending?: boolean
    unavailable?: boolean
    reason?: string
    rows?: { group_id: string | null; label: string | null; n: number | null; avg: number | null; suppressed?: boolean }[] | null
    cells?: { question_id: string; n: number | null; insufficient_data?: boolean }[] | null
    extra?: { k?: number; sources?: unknown[]; rows?: { name: string | null; status: string }[] } | null
  }[]
}

const compose = async (client: SupabaseClient, reportId: string) => {
  const { data, error } = await client.rpc('compose_report', { p_report: reportId })
  if (error) throw new Error(`compose_report: ${error.message}`)
  return data as Composed
}

async function report(sections: string[], surveys: string[], rounds: string[]) {
  return insert(ctx.a, 'reports', {
    org_id: ctx.org.id, title: uniq('Rapport'), kind: 'egen', status: 'utkast',
    created_by: ctx.redaktorU.member.id, sections,
    filters: { surveys, rounds, group: null },
  })
}

describe('(P9 C) compose_report — the strictest threshold among the sources governs the document', () => {
  it('a group visible at k=3 alone is withheld once a k=5 survey joins the report', async () => {
    const k3 = await surveyWith('Terskel 3', 4, 4, { k_threshold: 3 })
    const k5 = await surveyWith('Terskel 5', 6, 6)

    const alone = await compose(ctx.redaktorU.client, (await report(['teams', 'summary'], [k3.survey.id], [k3.round.id])).id)
    expect(alone.k).toBe(3)
    const aloneRows = alone.sections?.find((s) => s.key === 'teams')?.rows ?? []
    expect(aloneRows.some((r) => r.group_id === ctx.group.id && !r.suppressed && r.n === 4),
      'four answers render under a threshold of three').toBe(true)

    const mixed = await compose(ctx.redaktorU.client,
      (await report(['teams', 'summary'], [k3.survey.id, k5.survey.id], [k3.round.id])).id)
    expect(mixed.k, 'the strictest source wins for the whole document').toBe(5)
    const mixedRows = mixed.sections?.find((s) => s.key === 'teams')?.rows ?? []
    const team = mixedRows.find((r) => r.group_id === ctx.group.id)
    expect(team === undefined || team.suppressed === true, 'the same four answers are withheld at five').toBe(true)
    if (team) { expect(team.n).toBeNull(); expect(team.avg).toBeNull() }
    const total = mixed.sections?.find((s) => s.key === 'summary')?.cells?.find((c) => c.question_id === k3.qScale.id)
    expect(total?.insufficient_data ?? total?.n === null, 'nor may the total disclose them').toBe(true)
  })

  it('names each source with its own threshold, so the editor can say «X har terskel 3, men rapporten bruker 5»', async () => {
    const k3 = await surveyWith('Kilde 3', 0, 0, { k_threshold: 3 })
    const k5 = await surveyWith('Kilde 5', 0, 0)
    const doc = await compose(ctx.redaktorU.client,
      (await report(['method'], [k3.survey.id, k5.survey.id], [k3.round.id])).id)
    const byId = new Map((doc.sources ?? []).map((s) => [s.survey_id, s]))
    expect(byId.get(k3.survey.id)?.k).toBe(3)
    expect(byId.get(k5.survey.id)?.k).toBe(5)
    expect(doc.k).toBe(5)
  })

  it('the method section is composed, not pending, and carries the threshold the reader must see', async () => {
    const s = await surveyWith('Metode', 0, 0, { k_threshold: 3 })
    const doc = await compose(ctx.redaktorU.client, (await report(['method'], [s.survey.id], [s.round.id])).id)
    const method = doc.sections?.find((x) => x.key === 'method')
    expect(method?.pending, 'a report that lives on must state its threshold').not.toBe(true)
    expect(method?.extra?.k).toBe(3)
    expect(method?.extra?.k).toBe(doc.k)
  })
})

describe('(P9 C) «Svar per virksomhet» — refused with a reason wherever a person survey is in the report', () => {
  it('is registered as a section type, so the picker can show it as unavailable rather than hide it', async () => {
    const { data } = await ctx.adminU.client.from('report_section_types').select('key').eq('key', 'per_virksomhet')
    expect(data?.length).toBe(1)
  })

  it('renders one row per organisation, with its answers, in a report whose sources are all organisation surveys', async () => {
    const s = await surveyWith('Leverandør', 2, 1,
      { respondent_kind: 'organisation', anonymity: 'named' }, { names: ['Fjordlaks AS', 'Trelast Nord AS'] })
    const doc = await compose(ctx.redaktorU.client, (await report(['per_virksomhet'], [s.survey.id], [s.round.id])).id)
    const sec = doc.sections?.find((x) => x.key === 'per_virksomhet')
    expect(sec?.unavailable).not.toBe(true)
    expect(sec?.pending).not.toBe(true)
    const rows = sec?.extra?.rows ?? []
    expect(rows.map((r) => r.name).sort()).toEqual(['Fjordlaks AS', 'Trelast Nord AS'])
    expect(rows.find((r) => r.name === 'Fjordlaks AS')?.status).toBe('svart')
    expect(rows.find((r) => r.name === 'Trelast Nord AS')?.status).toBe('ikke_svart')
  })

  it('is REFUSED — unavailable, with a reason, carrying no rows — when any source is a person survey', async () => {
    const org = await surveyWith('Leverandør', 2, 2,
      { respondent_kind: 'organisation', anonymity: 'named' }, { names: ['Lekk AS', 'Lekk 2 AS'] })
    const person = await surveyWith('Ansatte', 6, 6)
    const doc = await compose(ctx.redaktorU.client,
      (await report(['per_virksomhet', 'summary'], [org.survey.id, person.survey.id], [org.round.id])).id)
    const sec = doc.sections?.find((x) => x.key === 'per_virksomhet')
    expect(sec, 'shown as unavailable, not silently dropped').toBeDefined()
    expect(sec?.unavailable).toBe(true)
    expect(sec?.reason).toBeTruthy()
    expect(sec?.extra?.rows ?? null).toBeNull()
    expect(sec?.rows ?? null).toBeNull()
    expect(JSON.stringify(sec), 'no organisation name may leak through a refused section').not.toMatch(/Lekk/)

    // And a person-only report never gets it either, gated or otherwise.
    const p = await compose(ctx.redaktorU.client,
      (await report(['per_virksomhet'], [person.survey.id], [person.round.id])).id)
    const psec = p.sections?.find((x) => x.key === 'per_virksomhet')
    expect(psec?.unavailable).toBe(true)
    expect(psec?.extra?.rows ?? null).toBeNull()
  })
})
