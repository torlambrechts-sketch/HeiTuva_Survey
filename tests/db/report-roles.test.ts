import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  leserClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * S3 item 1 — CLAUDE.md invariant 4 inside `compose_report`.
 *
 * Invariant 4: a `leser` sees «aggregates only — no quote-RPC group filters, no
 * named free text». `get_quotes` enforced it, `attributed_results` enforced it,
 * the CSV route enforced it — and `compose_report` did not. It SELECTed the
 * caller's role into `v_role`, echoed it in the returned document, and never
 * branched on it, so a leser opening a report received the selected quotes and
 * every supplier's attributed answer by name (audit `B6-05`, `B3a-11`).
 *
 * ── THE SECOND RETURN IS THE POINT ─────────────────────────────────────────
 *
 * `compose_report` has two returns that carry sections. The obvious one is the
 * live composition at the bottom. The other is the frozen document near the
 * top, which short-circuits everything when a PUBLISHED report renders from its
 * snapshot — and a published report is precisely the thing that gets shared
 * with a leser. A rule applied only to the live path would be CLAUDE.md's «a
 * guard on one transition is not a guard on the state», with publishing as the
 * road round it. `the frozen document` below is the test that would have caught
 * that, and it is written before the live one on purpose.
 *
 * ── WHY THE FLAG IS ASSERTED AS WELL AS THE BEHAVIOUR ──────────────────────
 *
 * The rule reads `report_section_types.names_individuals` rather than a literal
 * list of two keys, so that the thirteenth section is covered by the migration
 * that adds it. That only holds if the flag stays decided for every row, which
 * is a property of the registry and not of any one report — hence the last
 * describe block.
 */
let svc: Client
let admin: Client
let redaktor: Client
let leser: Client
let orgId: string
let personSurvey: string
let orgSurvey: string
const madeReports: string[] = []
const madeSnapshots: string[] = []

/** The sections a document must carry for this test to mean anything. */
type Section = {
  key: string
  unavailable?: boolean
  reason?: string | null
  extra?: unknown
  rows?: unknown
  cells?: unknown
}
type Doc = { sections?: Section[]; error?: string; role?: string }
const section = (doc: Doc, key: string) => (doc.sections ?? []).find((s) => s.key === key)

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor, leser] = await Promise.all([adminClient(), redaktorClient(), leserClient()])

  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id

  const { data: surveys } = await svc
    .from('surveys')
    .select('id, title, respondent_kind')
    .eq('org_id', orgId)
  personSurvey = surveys!.find((s) => s.respondent_kind !== 'organisation')!.id
  orgSurvey = surveys!.find((s) => s.respondent_kind === 'organisation')!.id
})

afterAll(async () => {
  if (madeReports.length) await svc.from('reports').delete().in('id', madeReports)
  if (madeSnapshots.length) await svc.from('result_snapshots').delete().in('id', madeSnapshots)
})

async function makeReport(surveyId: string, sections: string[]): Promise<string> {
  const { data, error } = await svc
    .from('reports')
    .insert({
      org_id: orgId,
      title: `S3 role rules ${sections.join('+')} ${Date.now()}`,
      kind: 'egen',
      status: 'utkast',
      sections,
      filters: { surveys: [surveyId] },
      share_scope: 'ledelse',
    })
    .select('id')
    .single()
  if (error) throw new Error(`report insert failed: ${error.message}`)
  madeReports.push(data!.id)
  return data!.id
}

describe('the frozen document — the return that publishing takes', () => {
  let reportId: string

  beforeAll(async () => {
    reportId = await makeReport(personSurvey, ['summary', 'quotes'])
    // A document frozen the way `publish` writes one: the composed sections,
    // quotes included, stored inside the snapshot. Written directly rather than
    // by publishing a report, so the test states exactly which shape it is
    // about instead of depending on the publish path staying the same.
    const { data, error } = await svc
      .from('result_snapshots')
      .insert({
        org_id: orgId,
        survey_id: personSurvey,
        scope: {},
        content_hash: `s3-role-rules-${Date.now()}`,
        aggregates: {
          document: {
            report_id: reportId,
            title: 'Frozen',
            sections: [
              { key: 'summary', cells: [{ question_id: 'q1', n: 6, avg: 4.1 }] },
              {
                key: 'quotes',
                extra: { quotes: [{ text: 'Sagt i fortrolighet', group: 'Ledelse' }] },
              },
            ],
          },
        },
      })
      .select('id')
      .single()
    if (error) throw new Error(`snapshot insert failed: ${error.message}`)
    madeSnapshots.push(data!.id)
    await svc.from('reports').update({ snapshot_id: data!.id }).eq('id', reportId)
  })

  it('gives an administrator the frozen quotes', async () => {
    const { data } = await admin.rpc('compose_report', { p_report: reportId })
    const doc = data as Doc
    expect(doc.error, 'the administrator must be able to read the report').toBeUndefined()
    expect(section(doc, 'quotes')?.extra, 'the frozen quotes are the thing being protected')
      .not.toBeNull()
    expect(section(doc, 'quotes')?.unavailable).toBeFalsy()
  })

  it('refuses a leser the frozen quotes, and says why', async () => {
    const { data } = await leser.rpc('compose_report', { p_report: reportId })
    const doc = data as Doc
    expect(doc.error).toBeUndefined()
    const q = section(doc, 'quotes')
    expect(q, 'the section is still listed — a section that vanishes reads as one nobody added')
      .toBeDefined()
    expect(q?.unavailable).toBe(true)
    expect(q?.reason).toBe('role_leser')
    expect(q?.extra, 'the quotes themselves must be gone, not merely flagged').toBeNull()
  })

  it('leaves the leser every section that names nobody', async () => {
    const { data } = await leser.rpc('compose_report', { p_report: reportId })
    const doc = data as Doc
    const s = section(doc, 'summary')
    expect(s?.unavailable).toBeFalsy()
    expect(s?.cells, 'aggregates are exactly what invariant 4 says a leser DOES get').not.toBeNull()
  })
})

describe('the live composition', () => {
  it('refuses a leser the quotes section', async () => {
    const reportId = await makeReport(personSurvey, ['summary', 'quotes'])
    const { data } = await leser.rpc('compose_report', { p_report: reportId })
    const q = section(data as Doc, 'quotes')
    expect(q?.unavailable).toBe(true)
    expect(q?.reason).toBe('role_leser')
    expect(q?.extra).toBeNull()
  })

  it('refuses a leser the attributed per_virksomhet rows', async () => {
    const reportId = await makeReport(orgSurvey, ['summary', 'per_virksomhet'])
    const { data } = await leser.rpc('compose_report', { p_report: reportId })
    const p = section(data as Doc, 'per_virksomhet')
    expect(p?.unavailable).toBe(true)
    expect(p?.reason).toBe('role_leser')
    expect(p?.extra).toBeNull()
  })

  it('gives an administrator the attributed rows', async () => {
    const reportId = await makeReport(orgSurvey, ['summary', 'per_virksomhet'])
    const { data } = await admin.rpc('compose_report', { p_report: reportId })
    const p = section(data as Doc, 'per_virksomhet')
    expect(p?.reason, 'an administrator is refused for no role reason').not.toBe('role_leser')
  })

  it('does not redact a redaktør', async () => {
    const reportId = await makeReport(personSurvey, ['summary', 'quotes'])
    const { data } = await redaktor.rpc('compose_report', { p_report: reportId })
    const q = section(data as Doc, 'quotes')
    expect(q?.reason).not.toBe('role_leser')
  })

  it('reports the reader role it acted on', async () => {
    const reportId = await makeReport(personSurvey, ['summary'])
    const { data } = await leser.rpc('compose_report', { p_report: reportId })
    expect((data as Doc).role).toBe('leser')
  })
})

describe('the registry the rule reads', () => {
  it('flags the two sections that put a name beside an individual', async () => {
    const { data } = await svc
      .from('report_section_types')
      .select('key')
      .eq('names_individuals', true)
    expect(new Set((data ?? []).map((r) => r.key))).toEqual(new Set(['quotes', 'per_virksomhet']))
  })

  it('flags nothing that carries only aggregates', async () => {
    // Stated as a property of the aggregate sections rather than as «the other
    // ten», so a thirteenth aggregate section joins this assertion for free and
    // a thirteenth NAMING section fails the one above until it is decided.
    const { data } = await svc
      .from('report_section_types')
      .select('key, names_individuals')
      .in('key', ['summary', 'trend', 'heatmap', 'drivers', 'teams', 'participation', 'method'])
    expect(data).toHaveLength(7)
    for (const row of data ?? []) {
      expect(row.names_individuals, `${row.key} carries aggregates, not names`).toBe(false)
    }
  })
})
