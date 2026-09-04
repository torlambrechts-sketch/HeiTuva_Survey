import { beforeAll, describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, asUser, uniq } from '../helpers'

/**
 * The k-gate is per cell. A report is a COMPOSITION of cells, and composition
 * is where per-cell gating stops being enough.
 *
 * Every assertion here is about something a document can disclose that no
 * single RPC call in it discloses:
 *
 *   1. Gate at render, per token. The document is composed for whoever is
 *      reading it — a share-link reader re-runs the gate under their own
 *      scope. Numbers gated for the author must never be carried to a reader,
 *      and a reader's token can only ever narrow the report, never widen it.
 *   2. Scope-aware snapshots. A frozen aggregate belongs to the filter that
 *      produced it. A section filtered to one group may not be served from a
 *      snapshot taken across all of them — the numbers would be truthful about
 *      a scope nobody asked for.
 *   3. Composition. Suppressing exactly one cell of a partition discloses it:
 *      total minus the visible parts IS the suppressed part. A report that
 *      renders a per-group breakdown alongside a total must suppress a second
 *      group, or refuse the breakdown.
 *
 * WRITTEN BEFORE `compose_report` EXISTED. Every test below failed against the
 * naive composition (per-cell gate only, snapshot used whenever pinned, token
 * ignored once membership was satisfied) — see docs/DEVIATIONS.md D60 for the
 * mutation run. A negative test that has never seen the defect it guards is a
 * decoration.
 */

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex')

type Fx = Awaited<ReturnType<typeof buildCompositionFixture>>
let fx: Fx

beforeAll(async () => {
  fx = await buildCompositionFixture()
}, 60_000)

/**
 * One survey, one open round, one scale question, and a partition designed so
 * that per-cell gating alone leaks:
 *
 *   Stor    n = 12   above k, renders
 *   Liten   n =  3   below k, suppressed
 *   ------------------------
 *   total   n = 15
 *
 * 15 − 12 = 3. The suppressed group's size is arithmetic, and if both
 * distributions render, so is its distribution. This is the whole point of the
 * fixture: the numbers are chosen so a correct implementation MUST do something
 * beyond gating each cell.
 */
async function buildCompositionFixture() {
  const a = admin()

  const org = await insert(a, 'organizations', { name: uniq('Komposisjon') })
  const other = await insert(a, 'organizations', { name: uniq('Annen bedrift') })

  const stor = await insert(a, 'groups', { org_id: org.id, name: 'Stor' })
  const liten = await insert(a, 'groups', { org_id: org.id, name: 'Liten' })

  const editor = await asUser(uniq('redaktor') + '@example.test')
  const reader = await asUser(uniq('leser') + '@example.test')
  const outsider = await asUser(uniq('utenfor') + '@example.test')

  const editorMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: editor.userId, email: uniq('redaktor') + '@example.test',
    role: 'redaktor', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: org.id, user_id: reader.userId, email: uniq('leser') + '@example.test',
    role: 'leser', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: other.id, user_id: outsider.userId, email: uniq('utenfor') + '@example.test',
    role: 'administrator', status: 'active',
  })

  const survey = await insert(a, 'surveys', {
    org_id: org.id, title: uniq('Arbeidsmiljø — komposisjon'), status: 'aktiv',
    anonymity: 'anonymous',
  })
  const scaleQ = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 1, type: 'scale', text: 'Hvordan har uken vært?',
  })
  const round = await insert(a, 'survey_rounds', {
    survey_id: survey.id, round_no: 1, status: 'open',
    question_snapshot: [{ id: scaleQ.id, type: 'scale', text: 'Hvordan har uken vært?' }],
  })

  // Freezing a result takes edit authority on the survey, not mere membership
  // (snapshot_results checks app.can_edit_survey). The redaktør has to be a
  // co-editor for the snapshot-scope tests to get as far as the scope check.
  await insert(a, 'survey_editors', { survey_id: survey.id, member_id: editorMember.id })

  // 12 in Stor, 3 in Liten. Values differ per group so a leak is visible as a
  // wrong-but-specific number, not just a count.
  await addResponses(a, round.id, scaleQ.id, stor.id, 12, 4)
  await addResponses(a, round.id, scaleQ.id, liten.id, 3, 2)

  const report = await insert(a, 'reports', {
    org_id: org.id, title: 'Teamrapport — komposisjon', kind: 'egen', status: 'utkast',
    base_template: 'team', created_by: editorMember.id,
    sections: ['teams', 'summary'],
    filters: { surveys: [survey.id], rounds: [round.id], group: null },
  })

  // A share link scoped to Stor only. Its whole job in these tests is to prove
  // the composition is redone for the reader rather than replayed.
  const shareRaw = uniq('share')
  await insert(a, 'report_shares', {
    report_id: report.id, token_hash: hashToken(shareRaw), scope: 'ledelse', group_id: stor.id,
  })

  const expiredRaw = uniq('expired')
  await insert(a, 'report_shares', {
    report_id: report.id, token_hash: hashToken(expiredRaw), scope: 'ledelse',
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  })

  // A second partition, for the case complementary suppression does NOT cover.
  //
  //   Stor2   n = 12   visible
  //   Bitte1  n =  1   hidden by the per-cell gate
  //   Bitte2  n =  1   hidden by the per-cell gate
  //
  // Two rows are already hidden, so complementary suppression stops — correctly,
  // since neither hidden group is recoverable from the other. But the TOTAL is
  // 14, and 14 − 12 = 2: the document would disclose that two people are hidden
  // between them, which is a sub-k residual and exactly what k=5 forbids. Only
  // the cross-section pass catches this.
  const stor2 = await insert(a, 'groups', { org_id: org.id, name: 'Stor 2' })
  const bitte1 = await insert(a, 'groups', { org_id: org.id, name: 'Bitte 1' })
  const bitte2 = await insert(a, 'groups', { org_id: org.id, name: 'Bitte 2' })

  const survey2 = await insert(a, 'surveys', {
    org_id: org.id, title: uniq('Arbeidsmiljø — residual'), status: 'aktiv',
    anonymity: 'anonymous',
  })
  const scaleQ2 = await insert(a, 'survey_questions', {
    survey_id: survey2.id, position: 1, type: 'scale', text: 'Hvordan har uken vært?',
  })
  const round2 = await insert(a, 'survey_rounds', {
    survey_id: survey2.id, round_no: 1, status: 'open',
    question_snapshot: [{ id: scaleQ2.id, type: 'scale', text: 'Hvordan har uken vært?' }],
  })
  await addResponses(a, round2.id, scaleQ2.id, stor2.id, 12, 4)
  await addResponses(a, round2.id, scaleQ2.id, bitte1.id, 1, 1)
  await addResponses(a, round2.id, scaleQ2.id, bitte2.id, 1, 5)

  // A survey in the OTHER organisation, with results above k. `reports.filters`
  // is editor-supplied jsonb, not a foreign key — nothing in the schema stops a
  // survey id from another tenant being written into it.
  const foreignGroup = await insert(a, 'groups', { org_id: other.id, name: 'Fremmed' })
  const foreignSurvey = await insert(a, 'surveys', {
    org_id: other.id, title: uniq('Annen bedrift — HMS'), status: 'aktiv',
    anonymity: 'anonymous',
  })
  const foreignQ = await insert(a, 'survey_questions', {
    survey_id: foreignSurvey.id, position: 1, type: 'scale', text: 'Fremmed spørsmål',
  })
  const foreignRound = await insert(a, 'survey_rounds', {
    survey_id: foreignSurvey.id, round_no: 1, status: 'open',
    question_snapshot: [{ id: foreignQ.id, type: 'scale', text: 'Fremmed spørsmål' }],
  })
  await addResponses(a, foreignRound.id, foreignQ.id, foreignGroup.id, 9, 3)

  const residualReport = await insert(a, 'reports', {
    org_id: org.id, title: 'Residual', kind: 'egen', status: 'utkast',
    sections: ['teams', 'summary'],
    filters: { surveys: [survey2.id], rounds: [round2.id], group: null },
  })

  return {
    org, other, stor, liten, survey, scaleQ, round, report,
    survey2, scaleQ2, round2, stor2, bitte1, bitte2, residualReport,
    foreignSurvey, foreignQ, foreignRound, foreignGroup,
    editor, reader, outsider, shareRaw, expiredRaw,
  }
}

async function addResponses(
  a: SupabaseClient, roundId: string, questionId: string, groupId: string,
  count: number, value: number,
) {
  for (let i = 0; i < count; i++) {
    const r = await insert(a, 'responses', {
      round_id: roundId, respondent_group_id: groupId, anonymity_at_submission: 'anonymous',
      submitted_hour: new Date().toISOString().slice(0, 13) + ':00:00Z',
    })
    await insert(a, 'answers', { response_id: r.id, question_id: questionId, value })
  }
}

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}

type Composed = {
  error?: string
  k?: number
  sections?: {
    key: string
    source: 'live' | 'snapshot'
    snapshot_id: string | null
    scope: { group: string | null; rounds: string[] | null }
    rows?: { group_id: string | null; label: string | null; n: number | null; avg: number | null; suppressed?: boolean }[]
    cells?: { question_id: string; n: number | null; avg: number | null; insufficient_data?: boolean }[]
  }[]
  suppressed_groups?: string[]
}

const compose = async (client: SupabaseClient, reportId: string, token?: string) => {
  const { data, error } = await client.rpc('compose_report', {
    p_report: reportId,
    ...(token === undefined ? {} : { p_token: token }),
  })
  if (error) throw new Error(`compose_report: ${error.message}`)
  return data as Composed
}

const teamRows = (doc: Composed) =>
  doc.sections?.find((s) => s.key === 'teams')?.rows ?? []

// ---------------------------------------------------------------------------
// 3. Composition — the property no single RPC can hold
// ---------------------------------------------------------------------------

describe('composition: one suppressed cell in a partition is not suppression', () => {
  test('a per-group breakdown with a single sub-k group suppresses a second group', async () => {
    const doc = await compose(fx.editor.client, fx.report.id)
    const rows = teamRows(doc)
    expect(rows.length).toBeGreaterThan(0)

    const shown = rows.filter((r) => !r.suppressed)
    const hidden = rows.filter((r) => r.suppressed)

    // Liten is below k and must be hidden. That much per-cell gating already
    // does. The assertion that matters is the second one.
    expect(hidden.map((r) => r.group_id)).toContain(fx.liten.id)
    expect(hidden.length).toBeGreaterThanOrEqual(2)

    // Stor is the only other group, so it is the complement and must go too.
    // Stated as "nothing visible" rather than "Stor is hidden" so the test
    // keeps its meaning if the fixture grows a third group.
    expect(shown, 'a partition of two where one is sub-k can show neither').toHaveLength(0)
  })

  test('a suppressed row carries no n and no avg, not merely a flag', async () => {
    const doc = await compose(fx.editor.client, fx.report.id)
    for (const row of teamRows(doc).filter((r) => r.suppressed)) {
      expect(row.n, `${row.label ?? row.group_id} leaked n`).toBeNull()
      expect(row.avg, `${row.label ?? row.group_id} leaked avg`).toBeNull()
    }
  })

  test('the document names which groups it withheld, without naming their numbers', async () => {
    const doc = await compose(fx.editor.client, fx.report.id)
    expect(doc.suppressed_groups ?? []).toEqual(
      expect.arrayContaining([fx.liten.id, fx.stor.id]),
    )
  })

  test('the total minus every visible group can never isolate a sub-k residual', async () => {
    const doc = await compose(fx.editor.client, fx.report.id)
    const rows = teamRows(doc)
    const visible = rows.filter((r) => !r.suppressed && typeof r.n === 'number')

    const summary = doc.sections?.find((s) => s.key === 'summary')
    const total = summary?.cells?.find((c) => c.question_id === fx.scaleQ.id)?.n ?? null

    if (total === null) return // withholding the total is a legal answer too

    const residual = total - visible.reduce((sum, r) => sum + (r.n ?? 0), 0)
    const k = doc.k ?? 5
    expect(
      residual === 0 || residual >= k,
      `residual ${residual} isolates fewer than k=${k} respondents`,
    ).toBe(true)
  })

  test('two already-hidden groups do not become one disclosed residual', async () => {
    // 12 visible, 1 + 1 hidden, total 14. Complementary suppression is already
    // satisfied — two rows are hidden and neither is recoverable from the other
    // — so this leak survives it entirely. 14 − 12 = 2 says how many people the
    // two hidden groups hold between them, which is below k.
    const doc = await compose(fx.editor.client, fx.residualReport.id)
    const rows = teamRows(doc)

    const visible = rows.filter((r) => !r.suppressed && typeof r.n === 'number')
    expect(visible.map((r) => r.group_id)).toEqual([fx.stor2.id])

    const total = doc.sections
      ?.find((s) => s.key === 'summary')
      ?.cells?.find((c) => c.question_id === fx.scaleQ2.id)

    // The total must be withheld: publishing 14 beside a visible 12 is the leak.
    expect(total?.n, 'the total disclosed a residual of 2').toBeNull()
    expect(total?.insufficient_data).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 1. Gate at render, per token
// ---------------------------------------------------------------------------

describe('gate at render: the document is composed for its reader', () => {
  test('an anonymous caller with no token gets nothing', async () => {
    const doc = await compose(anon(), fx.report.id)
    expect(doc.error).toBe('forbidden')
    expect(doc.sections).toBeUndefined()
  })

  test('a member of another organisation is refused even with the report id', async () => {
    const doc = await compose(fx.outsider.client, fx.report.id)
    expect(doc.error).toBe('forbidden')
  })

  test('an expired share token is refused', async () => {
    const doc = await compose(anon(), fx.report.id, fx.expiredRaw)
    expect(doc.error).toBe('forbidden')
  })

  test('a wrong token is refused rather than falling back to the report', async () => {
    const doc = await compose(anon(), fx.report.id, 'not-a-real-token')
    expect(doc.error).toBe('forbidden')
  })

  test('a share token narrows the composition and re-runs the gate under its own scope', async () => {
    const doc = await compose(anon(), fx.report.id, fx.shareRaw)
    expect(doc.error).toBeUndefined()

    // The token is scoped to Stor. Under that scope there is no partition to
    // leak, but the reader must not receive a row for a group outside it.
    const outside = teamRows(doc).filter((r) => r.group_id && r.group_id !== fx.stor.id)
    expect(outside.map((r) => r.group_id), 'the token saw a group outside its scope').toEqual([])
  })

  test('a token cannot widen a report that is already filtered to one group', async () => {
    const a = admin()
    const narrowed = await insert(a, 'reports', {
      org_id: fx.org.id, title: 'Kun Liten', kind: 'egen', status: 'utkast',
      sections: ['teams'],
      filters: { surveys: [fx.survey.id], rounds: [fx.round.id], group: fx.liten.id },
    })
    const raw = uniq('wide')
    await insert(a, 'report_shares', {
      report_id: narrowed.id, token_hash: hashToken(raw), scope: 'ledelse', group_id: null,
    })

    const doc = await compose(anon(), narrowed.id, raw)
    const leaked = teamRows(doc).filter((r) => r.group_id && r.group_id !== fx.liten.id)
    expect(leaked, 'a null-scoped token widened a group-filtered report').toEqual([])
  })

  test('a filter naming another tenant\'s survey is refused, not quietly composed', async () => {
    // reports.filters is jsonb the editor controls. Nothing about the schema
    // stops them writing another organisation's survey id into it, and the
    // function runs SECURITY DEFINER — so this is the one place that check can
    // live. Without it, a hand-edited filter reads across the tenancy boundary
    // with the report owner's own report id.
    const a = admin()
    const smuggled = await insert(a, 'reports', {
      org_id: fx.org.id, title: 'Smuglet filter', kind: 'egen', status: 'utkast',
      sections: ['summary', 'teams'],
      filters: {
        surveys: [fx.foreignSurvey.id], rounds: [fx.foreignRound.id], group: null,
      },
    })

    const doc = await compose(fx.editor.client, smuggled.id)
    expect(doc.error).toBe('forbidden')
    expect(JSON.stringify(doc)).not.toContain(fx.foreignQ.id)
  })

  test('a filter mixing an own survey with a foreign one is refused whole', async () => {
    const a = admin()
    const mixed = await insert(a, 'reports', {
      org_id: fx.org.id, title: 'Blandet filter', kind: 'egen', status: 'utkast',
      sections: ['summary'],
      filters: {
        surveys: [fx.survey.id, fx.foreignSurvey.id], rounds: [fx.round.id], group: null,
      },
    })
    const doc = await compose(fx.editor.client, mixed.id)
    expect(doc.error, 'one legitimate survey laundered the other').toBe('forbidden')
  })

  test('a leser composing the same report sees no more than the redaktør', async () => {
    const asEditor = await compose(fx.editor.client, fx.report.id)
    const asLeser = await compose(fx.reader.client, fx.report.id)

    const visible = (d: Composed) =>
      teamRows(d).filter((r) => !r.suppressed).map((r) => r.group_id).sort()
    expect(visible(asLeser).length).toBeLessThanOrEqual(visible(asEditor).length)
  })
})

// ---------------------------------------------------------------------------
// 2. Scope-aware snapshots
// ---------------------------------------------------------------------------

describe('scope-aware snapshots: a frozen number belongs to the filter that froze it', () => {
  test('a report pinned to an all-groups snapshot does not serve it to a group-filtered section', async () => {
    const a = admin()

    // Freeze at "all groups", then pin it to a report whose section is filtered
    // to Stor. The snapshot's numbers are true — about a scope nobody asked for.
    const { data: snap } = await fx.editor.client.rpc('snapshot_results', {
      p_survey: fx.survey.id, p_round: fx.round.id, p_group: null,
    })
    const snapshotId = (snap as { snapshot_id?: string }).snapshot_id
    expect(snapshotId, 'the fixture could not freeze a snapshot').toBeTruthy()

    const pinned = await insert(a, 'reports', {
      org_id: fx.org.id, title: 'Feil omfang', kind: 'egen', status: 'utkast',
      sections: ['summary'], snapshot_id: snapshotId,
      filters: { surveys: [fx.survey.id], rounds: [fx.round.id], group: fx.stor.id },
    })

    const doc = await compose(fx.editor.client, pinned.id)
    const summary = doc.sections?.find((s) => s.key === 'summary')

    expect(summary?.source, 'a mismatched snapshot was served as if it fit').toBe('live')
    expect(summary?.snapshot_id).toBeNull()
  })

  test('a snapshot whose scope matches is used, so the rule is not just "never use snapshots"', async () => {
    const a = admin()
    const { data: snap } = await fx.editor.client.rpc('snapshot_results', {
      p_survey: fx.survey.id, p_round: fx.round.id, p_group: fx.stor.id,
    })
    const snapshotId = (snap as { snapshot_id?: string }).snapshot_id

    const pinned = await insert(a, 'reports', {
      org_id: fx.org.id, title: 'Riktig omfang', kind: 'egen', status: 'utkast',
      sections: ['summary'], snapshot_id: snapshotId,
      filters: { surveys: [fx.survey.id], rounds: [fx.round.id], group: fx.stor.id },
    })

    const doc = await compose(fx.editor.client, pinned.id)
    const summary = doc.sections?.find((s) => s.key === 'summary')
    expect(summary?.source).toBe('snapshot')
    expect(summary?.snapshot_id).toBe(snapshotId)
  })

  test('a snapshot from another organisation is never composed, pinned or not', async () => {
    const a = admin()
    const foreign = await insert(a, 'result_snapshots', {
      org_id: fx.other.id, survey_id: fx.survey.id, round_id: fx.round.id,
      scope: { group: null, round: fx.round.id },
      aggregates: { questions: [{ question_id: fx.scaleQ.id, n: 999, avg: 5 }] },
      content_hash: 'forged',
    })
    const pinned = await insert(a, 'reports', {
      org_id: fx.org.id, title: 'Fremmed snapshot', kind: 'egen', status: 'utkast',
      sections: ['summary'], snapshot_id: foreign.id,
      filters: { surveys: [fx.survey.id], rounds: [fx.round.id], group: null },
    })

    const doc = await compose(fx.editor.client, pinned.id)
    const summary = doc.sections?.find((s) => s.key === 'summary')
    expect(summary?.source).toBe('live')
    expect(JSON.stringify(doc)).not.toContain('999')
  })
})
