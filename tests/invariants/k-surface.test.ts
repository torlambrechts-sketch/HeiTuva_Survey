import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, asUser, uniq } from '../helpers'
import { hashToken } from './fixture'

/**
 * Phase 4 — the k-anonymity surface of the results layer.
 *
 * Tor's instruction, verbatim: "For each new RPC: assert insufficient_data at
 * n=4 AND real data at n=5, per cell, not per query. A heatmap where the query
 * is gated but individual cells are not is the exact defect that ships."
 *
 * So this file is written before the RPCs exist, and every case here is built
 * so that the WHOLE query passes the threshold while an individual cell does
 * not. A survey with thirteen responses answers every query-level gate loudly;
 * the only thing that can refuse the four-person cell inside it is a per-cell
 * gate. That is the entire point of the fixture below.
 *
 * The second instruction is the theme rule: "gate theme display on the same k
 * threshold applied to the contributor count, not the response count." A theme
 * mentioned eight times by four people is not anonymous, and the fixture
 * contains exactly that theme so a mention-counting implementation fails here
 * rather than in production.
 */

const K = 5

/** The fixture's answer matrix — the table this whole file is built around.
 *
 *  group │ responses │ q_scale │ q_sparse │ q_text │ q_enps
 *  ──────┼───────────┼─────────┼──────────┼────────┼───────
 *   A    │     5     │  all 5  │   4 of 5 │   5    │   0
 *   B    │     4     │  all 4  │     0    │   4    │   4
 *   C    │     4     │  all 4  │     0    │   0    │   0
 *  total │    13     │    13   │     4    │   9    │   4
 *
 *  Every query-level count is >= 5. Every gated thing below is a CELL:
 *   - A x q_sparse is n=4 inside a row of five responses (the heatmap trap)
 *   - B and C are n=4 rows inside a thirteen-response survey (the group trap)
 *   - round 2 is n=4 inside a thirteen-response survey (the trend trap)
 *   - q_enps is n=4 inside a thirteen-response survey (the benchmark trap)
 *   - the "møter" theme is 8 mentions from 4 people (the theme trap)
 */
type Ctx = Awaited<ReturnType<typeof buildKSurface>>

let ctx: Ctx

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}

async function buildKSurface() {
  const a = admin()
  const an = anon()

  const org = await insert(a, 'organizations', { name: uniq('K-Surface AS') })
  const other = await insert(a, 'organizations', { name: uniq('Utenfor AS') })

  const adminEmail = uniq('k-admin') + '@example.test'
  const leserEmail = uniq('k-leser') + '@example.test'
  const outsiderEmail = uniq('k-outsider') + '@example.test'
  const orgAdmin = await asUser(adminEmail)
  const leser = await asUser(leserEmail)
  const outsider = await asUser(outsiderEmail)

  const groupA = await insert(a, 'groups', { org_id: org.id, name: 'Alfa' })
  const groupB = await insert(a, 'groups', { org_id: org.id, name: 'Bravo' })
  const groupC = await insert(a, 'groups', { org_id: org.id, name: 'Charlie' })

  await insert(a, 'org_members', {
    org_id: org.id, user_id: orgAdmin.userId, email: adminEmail,
    role: 'administrator', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: org.id, user_id: leser.userId, email: leserEmail,
    role: 'leser', status: 'active', group_id: groupA.id,
  })
  await insert(a, 'org_members', {
    org_id: other.id, user_id: outsider.userId, email: outsiderEmail,
    role: 'administrator', status: 'active',
  })

  const survey = await insert(a, 'surveys', {
    org_id: org.id, title: uniq('Arbeidsmiljø'), status: 'aktiv', anonymity: 'anonymous',
  })
  const qScale = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 1, type: 'scale', text: 'Hvordan har uken vært?',
  })
  const qSparse = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 2, type: 'scale', text: 'Får du gjort det du skal?',
  })
  const qText = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 3, type: 'text', text: 'Hva bør vi endre?',
  })
  const qEnps = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 4, type: 'enps', text: 'Vil du anbefale oss?',
  })

  const snapshot = [
    { id: qScale.id, type: 'scale', text: 'Hvordan har uken vært?' },
    { id: qSparse.id, type: 'scale', text: 'Får du gjort det du skal?' },
    { id: qText.id, type: 'text', text: 'Hva bør vi endre?' },
    { id: qEnps.id, type: 'enps', text: 'Vil du anbefale oss?' },
  ]

  const round1 = await insert(a, 'survey_rounds', {
    survey_id: survey.id, round_no: 1, status: 'open', question_snapshot: snapshot,
  })
  const round2 = await insert(a, 'survey_rounds', {
    survey_id: survey.id, round_no: 2, status: 'open', question_snapshot: snapshot,
  })

  async function invite(roundId: string, groupId: string, n: number) {
    const tokens: string[] = []
    for (let i = 0; i < n; i++) {
      const raw = uniq(`tok-${i}`)
      tokens.push(raw)
      await insert(a, 'survey_invitations', {
        round_id: roundId, email: `${raw}@example.test`,
        token_hash: hashToken(raw), group_id: groupId, channel: 'email',
      })
    }
    return tokens
  }

  async function submit(token: string, answers: Record<string, { value: unknown }>) {
    const { data, error } = await an.rpc('submit_response', {
      p_token: token, p_lang: 'no', p_answers: answers,
    })
    if (error) throw new Error(`submit_response: ${error.message}`)
    const payload = data as { ok?: boolean; error?: string }
    if (payload?.error) throw new Error(`submit_response refused: ${payload.error}`)
  }

  // --- Group A: five responses. Four of them answer q_sparse. -----------------
  // Their free text all mentions "tid", which is five distinct contributors —
  // the one theme that may be shown.
  const tokensA = await invite(round1.id, groupA.id, 5)
  for (const [i, t] of tokensA.entries()) {
    const answers: Record<string, { value: unknown }> = {
      [qScale.id]: { value: 4 },
      [qText.id]: { value: 'Vi trenger mer tid til dypt arbeid' },
    }
    if (i < 4) answers[qSparse.id] = { value: 3 }
    await submit(t, answers)
  }

  // --- Group B: four responses. ----------------------------------------------
  // Two "møte" hits per text: eight mentions from four people. A theme gate
  // that counts mentions passes this; one that counts contributors refuses it.
  const tokensB = await invite(round1.id, groupB.id, 4)
  for (const t of tokensB) {
    await submit(t, {
      [qScale.id]: { value: 2 },
      [qText.id]: { value: 'Altfor mange møter — møtekulturen må endres' },
      [qEnps.id]: { value: 6 },
    })
  }

  // --- Group C, round two: four responses. -----------------------------------
  const tokensC = await invite(round2.id, groupC.id, 4)
  for (const t of tokensC) {
    await submit(t, { [qScale.id]: { value: 5 } })
  }

  return {
    org, other, survey, round1, round2,
    groupA, groupB, groupC,
    qScale, qSparse, qText, qEnps,
    admin: orgAdmin.client, leser: leser.client, outsider: outsider.client, anon: an,
  }
}

beforeAll(async () => {
  ctx = await buildKSurface()

  /* Q134 — the benchmark rows these tests need are created HERE, with a real
     source, instead of being taken from the seed.
     They used to rely on `seed.sql`'s six invented industry figures. Those are
     gone: they were rendered to customers as a comparison bar with a developer
     note under it admitting the number was made up. A test that depends on
     seeded fixtures also silently changes meaning the day the seed changes,
     which is what happened here — so owning the row is the better shape
     regardless of why the seed moved. */
  await admin().from('benchmarks').upsert([
    { industry: 'Teknologi og IT', metric_key: 'engagement_avg', value: 3.9,
      source: 'Testfixtur, k-surface.test.ts' },
    { industry: 'Teknologi og IT', metric_key: 'enps', value: 12,
      source: 'Testfixtur, k-surface.test.ts' },
  ], { onConflict: 'industry,metric_key' })
}, 120_000)

/** Unwraps a jsonb-returning RPC, failing loudly rather than yielding `{}`. */
async function rpc<T = Record<string, unknown>>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

type Cell = { question_id: string; n?: number; avg?: number; insufficient_data?: boolean }
type Row = { group_id: string; label: string; cells: Cell[] }

const cellFor = (rows: Row[], groupId: string, questionId: string) =>
  rows.find((r) => r.group_id === groupId)?.cells.find((c) => c.question_id === questionId)

/**
 * A gated cell must carry NO numbers at all — not the average, and not `n`.
 *
 * "Four people answered" is itself a fact about a small team (the same reason
 * get_peer_results returns no count below the threshold, D40), and a heatmap
 * that renders `n<5` from a payload containing `n: 4` has published the number
 * it claims to be hiding.
 */
function expectGated(cell: Cell | undefined, what: string) {
  expect(cell, `${what}: cell missing from the payload entirely`).toBeDefined()
  expect(cell!.insufficient_data, `${what}: not flagged insufficient`).toBe(true)
  expect(cell!.avg ?? null, `${what}: leaked an average`).toBeNull()
  expect(cell!.n ?? null, `${what}: leaked a respondent count`).toBeNull()
}

describe('get_heatmap — the gate is per cell, not per query', () => {
  it('a row with five responses still gates the question only four of them answered', async () => {
    const out = await rpc<{ k: number; rows: Row[] }>(ctx.admin, 'get_heatmap', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id],
    })
    expect(out.k).toBe(K)

    // Same row, same five people: one cell is real, the neighbouring one is not.
    const shown = cellFor(out.rows, ctx.groupA.id, ctx.qScale.id)
    expect(shown?.n).toBe(5)
    expect(Number(shown?.avg)).toBeCloseTo(4, 5)

    expectGated(cellFor(out.rows, ctx.groupA.id, ctx.qSparse.id), 'Alfa x sparse question')
  })

  it('gates every cell of a four-person group inside a thirteen-response survey', async () => {
    const out = await rpc<{ rows: Row[] }>(ctx.admin, 'get_heatmap', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id],
    })
    expectGated(cellFor(out.rows, ctx.groupB.id, ctx.qScale.id), 'Bravo x scale')
    expectGated(cellFor(out.rows, ctx.groupC.id, ctx.qScale.id), 'Charlie x scale')
  })

  it('filtering to a four-person group returns a gated row, not an error and not data', async () => {
    const out = await rpc<{ rows: Row[] }>(ctx.admin, 'get_heatmap', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id], p_group: ctx.groupB.id,
    })
    expect(out.rows).toHaveLength(1)
    expectGated(out.rows[0]!.cells.find((c) => c.question_id === ctx.qScale.id), 'Bravo filtered')
  })

  it('no serialised average anywhere in the payload belongs to a gated cell', async () => {
    // A blunt backstop for the shape assertions above: whatever the structure
    // grows into, the four-person groups' averages must not appear in the wire
    // format at all. Bravo answered 2 and Charlie 5 uniformly, so a leak is
    // visible as a bare number even if the key is renamed.
    const out = await rpc<{ rows: Row[] }>(ctx.admin, 'get_heatmap', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id],
    })
    const bravo = JSON.stringify(out.rows.find((r) => r.group_id === ctx.groupB.id))
    expect(bravo).not.toMatch(/"(avg|n)":\s*[0-9]/)
  })

  it('narrowing to one round gates the cells that fall below five inside it', async () => {
    // The period filter is a real filter, not a relabelling: round two holds
    // Charlie's four responses, so every cell in it must gate even though the
    // unfiltered survey has thirteen.
    const out = await rpc<{ rows: Row[] }>(ctx.admin, 'get_heatmap', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id], p_rounds: [ctx.round2.id],
    })
    for (const row of out.rows) {
      for (const cell of row.cells) expectGated(cell, `${row.label} in round 2`)
    }
  })

  it('narrowing to the round the five-person group answered still shows it', async () => {
    const out = await rpc<{ rows: Row[] }>(ctx.admin, 'get_heatmap', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id], p_rounds: [ctx.round1.id],
    })
    expect(cellFor(out.rows, ctx.groupA.id, ctx.qScale.id)?.n).toBe(5)
  })

  it('refuses an organisation the caller is not a member of', async () => {
    const out = await rpc<{ error?: string }>(ctx.outsider, 'get_heatmap', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id],
    })
    expect(out.error).toBe('forbidden')
  })

  it('is not reachable without a session', async () => {
    const { error } = await ctx.anon.rpc('get_heatmap', { p_org: ctx.org.id })
    expect(error).not.toBeNull()
  })
})

describe('get_trends — the gate is per round', () => {
  it('shows the nine-response round and gates the four-response one', async () => {
    type Point = { round_id: string; round_no: number; n?: number; avg?: number; insufficient_data?: boolean }
    const out = await rpc<{ k: number; points: Point[] }>(ctx.admin, 'get_trends', {
      p_survey: ctx.survey.id,
    })
    expect(out.k).toBe(K)

    const first = out.points.find((p) => p.round_id === ctx.round1.id)
    expect(first?.n).toBe(9)
    expect(first?.avg).not.toBeNull()

    const second = out.points.find((p) => p.round_id === ctx.round2.id)
    expect(second?.insufficient_data).toBe(true)
    expect(second?.avg ?? null, 'nothing derived from what they said').toBeNull()
    // DECISIONS Q49 (V1-6): the COUNT now survives its own threshold. Was
    // asserted null here; a count of people is participation, and Q28's line is
    // people-versus-derived rather than population size.
    expect(second?.n, 'Q49: the count survives the gate').toBe(4)
  })

  it('gates every round when the group filter puts each one below the threshold', async () => {
    type Point = { round_id: string; insufficient_data?: boolean; n?: number }
    const out = await rpc<{ points: Point[] }>(ctx.admin, 'get_trends', {
      p_survey: ctx.survey.id, p_group: ctx.groupB.id,
    })
    // Bravo has four responses in round one and none in round two. Neither
    // round may report a number, including the round it did not participate in.
    for (const p of out.points) {
      expect(p.insufficient_data, `round ${p.round_id} leaked`).toBe(true)
      // Q49: a count may travel; nothing derived may. The round Bravo did not
      // answer reports 0, which is a true count of people and not a number
      // about anything anyone said.
      expect(typeof p.n, `round ${p.round_id} must carry a count`).toBe('number')
    }
  })

  it('(Q49) THE NARROWING: a gated point carries the count and NOTHING DERIVED', async () => {
    // Tor's narrowing is the decision, so it is enforced as a CLOSED KEY SET
    // rather than as a sentence: `n` is the count only, never accompanied by
    // anything derived from what those people said, and never a breakdown that
    // turns two counts into a difference.
    //
    // Asserted over the keys rather than over the values I thought to check —
    // an `avg` arriving beside the count would pass `expect(avg).toBeNull()`
    // only if I had remembered to write it, and the next field nobody thought
    // of would pass silently. The set is the assertion.
    type Point = Record<string, unknown>
    const out = await rpc<{ points: Point[] }>(ctx.admin, 'get_trends', {
      p_survey: ctx.survey.id, p_group: ctx.groupB.id,
    })

    const GATED_KEYS = [
      'round_id', 'round_no', 'opens_at', 'closes_at', 'status', 'n', 'insufficient_data',
    ].sort()

    const gated = out.points.filter((p) => p.insufficient_data === true)
    expect(gated.length, 'or this asserts nothing').toBeGreaterThan(0)

    for (const p of gated) {
      expect(Object.keys(p).sort(), `a gated point carries exactly the permitted keys`)
        .toEqual(GATED_KEYS)
    }
  })

  it('(Q49) an UNGATED point is unchanged — the narrowing is about the gated one', async () => {
    // The positive control the narrowing needs: without it, a change that
    // stripped `avg` from every point would satisfy the test above.
    type Point = Record<string, unknown>
    const out = await rpc<{ points: Point[] }>(ctx.admin, 'get_trends', {
      p_survey: ctx.survey.id,
    })
    const open = out.points.find((p) => p.insufficient_data !== true)
    expect(open, 'a survey with an ungated round').toBeTruthy()
    expect(Object.keys(open!).sort()).toEqual(
      ['round_id', 'round_no', 'opens_at', 'closes_at', 'status', 'n', 'avg'].sort(),
    )
  })

  it('shows the five-person group as real data in the round it answered', async () => {
    type Point = { round_id: string; n?: number; avg?: number }
    const out = await rpc<{ points: Point[] }>(ctx.admin, 'get_trends', {
      p_survey: ctx.survey.id, p_group: ctx.groupA.id,
    })
    const first = out.points.find((p) => p.round_id === ctx.round1.id)
    expect(first?.n).toBe(5)
    expect(Number(first?.avg)).toBeGreaterThan(0)
  })
})

describe('get_themes — gated on contributors, not on mentions', () => {
  type Theme = { key: string; label: string; mentions: number; contributors: number }

  it('drops a theme mentioned eight times by four people', async () => {
    const out = await rpc<{ k: number; themes: Theme[] }>(ctx.admin, 'get_themes', {
      p_survey: ctx.survey.id,
    })
    expect(out.k).toBe(K)
    // "møter" is the loudest theme in the free text by mention count. It must
    // not be in the payload at all: naming it, even without a count, tells the
    // reader what a four-person team wrote about.
    expect(out.themes.map((t) => t.key)).not.toContain('moter')
    expect(JSON.stringify(out.themes)).not.toMatch(/møte/i)
  })

  it('keeps a theme five people contributed to', async () => {
    const out = await rpc<{ themes: Theme[] }>(ctx.admin, 'get_themes', {
      p_survey: ctx.survey.id,
    })
    const tid = out.themes.find((t) => t.key === 'tid')
    expect(tid, 'the five-contributor theme should be shown').toBeDefined()
    expect(tid!.contributors).toBeGreaterThanOrEqual(K)
  })

  it('gates the whole set when the group filter leaves fewer than five contributors', async () => {
    const out = await rpc<{ insufficient_data?: boolean; themes?: Theme[] }>(ctx.admin, 'get_themes', {
      p_survey: ctx.survey.id, p_group: ctx.groupB.id,
    })
    expect(out.insufficient_data).toBe(true)
    expect(out.themes ?? []).toHaveLength(0)
  })

  it('refuses a leser a group filter, exactly as get_quotes does', async () => {
    const out = await rpc<{ error?: string }>(ctx.leser, 'get_themes', {
      p_survey: ctx.survey.id, p_group: ctx.groupA.id,
    })
    expect(out.error).toBe('forbidden')
  })

  it('refuses a caller outside the organisation', async () => {
    const out = await rpc<{ error?: string }>(ctx.outsider, 'get_themes', { p_survey: ctx.survey.id })
    expect(out.error).toBe('forbidden')
  })
})

describe('get_quotes — a theme filter is a narrower slice, and gated as one', () => {
  type Q = { n: number | null; quotes?: { text: string }[]; insufficient_data?: boolean; theme?: string }

  it('shows the nine quotes unfiltered', async () => {
    const out = await rpc<Q>(ctx.admin, 'get_quotes', {
      p_survey: ctx.survey.id, p_question: ctx.qText.id,
    })
    expect(out.n).toBe(9)
    expect(out.quotes!.length).toBeGreaterThanOrEqual(K)
  })

  it('gates the four-contributor theme even though the question has nine answers', async () => {
    // The defect this exists for: gating on the QUESTION's count and then
    // filtering. Nine passes; the four texts it hands back are one small team's.
    const out = await rpc<Q>(ctx.admin, 'get_quotes', {
      p_survey: ctx.survey.id, p_question: ctx.qText.id, p_theme: 'moter',
    })
    expect(out.insufficient_data).toBe(true)
    expect(out.n).toBeNull()
    expect(out.quotes ?? []).toHaveLength(0)
    expect(JSON.stringify(out)).not.toMatch(/møte/i)
  })

  it('shows the five-contributor theme', async () => {
    const out = await rpc<Q>(ctx.admin, 'get_quotes', {
      p_survey: ctx.survey.id, p_question: ctx.qText.id, p_theme: 'tid',
    })
    expect(out.n).toBe(5)
    expect(out.quotes!.every((q) => /tid/i.test(q.text))).toBe(true)
  })

  it('an unknown theme key refuses rather than widening back to every quote', async () => {
    const out = await rpc<Q>(ctx.admin, 'get_quotes', {
      p_survey: ctx.survey.id, p_question: ctx.qText.id, p_theme: 'ikke-et-tema',
    })
    expect(out.insufficient_data).toBe(true)
    expect(out.quotes ?? []).toHaveLength(0)
  })
})

describe('get_benchmarks — the gate is per metric', () => {
  type BenchRow = { metric_key: string; bench: number; mine?: number; n?: number; insufficient_data?: boolean }

  it('gates the four-answer eNPS metric while the thirteen-answer score is shown', async () => {
    const out = await rpc<{ k: number; rows: BenchRow[] }>(ctx.admin, 'get_benchmarks', {
      p_survey: ctx.survey.id, p_industry: 'Teknologi og IT',
    })
    expect(out.k).toBe(K)

    const score = out.rows.find((r) => r.metric_key === 'engagement_avg')
    expect(score?.mine).not.toBeNull()
    expect(Number(score?.mine)).toBeGreaterThan(0)

    const enps = out.rows.find((r) => r.metric_key === 'enps')
    expect(enps, 'the eNPS row should still exist, with the industry value').toBeDefined()
    expect(enps!.insufficient_data).toBe(true)
    expect(enps!.mine ?? null).toBeNull()
    expect(enps!.n ?? null).toBeNull()
    // The industry figure is a public reference value, not our respondents'.
    expect(Number(enps!.bench)).toBeGreaterThan(0)
  })

  it('gates our own score when the group filter drops it below the threshold', async () => {
    const out = await rpc<{ rows: BenchRow[] }>(ctx.admin, 'get_benchmarks', {
      p_survey: ctx.survey.id, p_industry: 'Teknologi og IT', p_group: ctx.groupB.id,
    })
    const score = out.rows.find((r) => r.metric_key === 'engagement_avg')
    expect(score?.insufficient_data).toBe(true)
    expect(score?.mine ?? null).toBeNull()
  })

  it('refuses a caller outside the organisation', async () => {
    const out = await rpc<{ error?: string }>(ctx.outsider, 'get_benchmarks', {
      p_survey: ctx.survey.id,
    })
    expect(out.error).toBe('forbidden')
  })
})

describe('results_summary — the gate is per team row', () => {
  type Team = { group_id: string; label: string; n?: number; avg?: number; insufficient_data?: boolean }
  type Insight = { key: string; tone: string; question_id?: string; group_id?: string; value?: number }
  type Summary = {
    k: number; n: number; invited: number; avg: number | null
    teams: Team[]; insights: Insight[]
  }

  it('shows the survey average and gates the four-person teams inside it', async () => {
    const out = await rpc<Summary>(ctx.admin, 'results_summary', { p_survey: ctx.survey.id })
    expect(out.k).toBe(K)
    expect(out.n).toBe(13)
    expect(out.avg).not.toBeNull()

    const alfa = out.teams.find((t) => t.group_id === ctx.groupA.id)
    expect(alfa?.n).toBe(5)
    expect(alfa?.avg).not.toBeNull()

    for (const gid of [ctx.groupB.id, ctx.groupC.id]) {
      const row = out.teams.find((t) => t.group_id === gid)
      expect(row?.insufficient_data, `group ${gid} not gated`).toBe(true)
      expect(row?.avg ?? null).toBeNull()
      expect(row?.n ?? null).toBeNull()
    }
  })

  it('never references a gated team or question in the generated insights', async () => {
    // The insight generator reads the same rows the panel renders. If it reads
    // them before the gate instead of after, "Bravo ligger lavest" ships a
    // four-person team's score as an insight, past every cell assertion above.
    //
    // Insights carry ids and numbers, never prose — the sentence is composed by
    // next-intl in the UI — so the assertion is that no gated subject's id
    // appears anywhere in the payload, whatever shape it grows.
    const out = await rpc<Summary>(ctx.admin, 'results_summary', { p_survey: ctx.survey.id })
    const wire = JSON.stringify(out.insights)
    for (const id of [ctx.groupB.id, ctx.groupC.id, ctx.qSparse.id]) {
      expect(wire, `insights referenced gated subject ${id}`).not.toContain(id)
    }
    expect(wire, 'insights must not carry server-rendered Norwegian prose').not.toMatch(/Bravo|Charlie/)
  })

  it('gates the average when the caller filters to a four-person group', async () => {
    const out = await rpc<Summary & { insufficient_data?: boolean }>(ctx.admin, 'results_summary', {
      p_survey: ctx.survey.id, p_group: ctx.groupB.id,
    })
    expect(out.avg).toBeNull()
    expect(out.insights ?? []).toHaveLength(0)
  })

  it('refuses a caller outside the organisation', async () => {
    const out = await rpc<{ error?: string }>(ctx.outsider, 'results_summary', {
      p_survey: ctx.survey.id,
    })
    expect(out.error).toBe('forbidden')
  })
})

describe('aggregate_results — the group filter is a cell too', () => {
  type Q = { question_id: string; n: number | null; insufficient_data?: boolean; avg?: number | null }

  it('gates a question the whole survey answers when the group did not reach five', async () => {
    const whole = await rpc<{ questions: Q[] }>(ctx.admin, 'aggregate_results', {
      p_survey: ctx.survey.id,
    })
    expect(whole.questions.find((q) => q.question_id === ctx.qScale.id)?.n).toBe(13)

    const bravo = await rpc<{ questions: Q[] }>(ctx.admin, 'aggregate_results', {
      p_survey: ctx.survey.id, p_group: ctx.groupB.id,
    })
    const cell = bravo.questions.find((q) => q.question_id === ctx.qScale.id)
    expect(cell?.insufficient_data).toBe(true)
    expect(cell?.n ?? null).toBeNull()
  })

  it('gates a sparsely answered question even with no group filter at all', async () => {
    const whole = await rpc<{ questions: Q[] }>(ctx.admin, 'aggregate_results', {
      p_survey: ctx.survey.id,
    })
    const sparse = whole.questions.find((q) => q.question_id === ctx.qSparse.id)
    expect(sparse?.insufficient_data).toBe(true)
    expect(sparse?.n ?? null).toBeNull()
  })
})

describe('snapshot_results — a snapshot cannot preserve what the gate removed', () => {
  it('stores gated aggregates, so retention cannot resurrect a four-person cell', async () => {
    const out = await rpc<{ snapshot_id: string; content_hash: string }>(ctx.admin, 'snapshot_results', {
      p_survey: ctx.survey.id,
    })
    expect(out.snapshot_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(out.content_hash).toMatch(/^[0-9a-f]{64}$/)

    // Read back through the SERVICE client since S3/M:0094. `aggregates` used
    // to be selectable by any org member, which is how a leser could read a
    // published report's quotes and attributed rows straight off the table
    // (audit B6-03) — SELECT on the column is now revoked from every client
    // role and the payload is reached only through the RPCs.
    //
    // The claim under test is unaffected and is the stronger one: it is about
    // what is STORED, not about who may read it. Reading with a role that can
    // see everything is the right way to assert that even THAT view carries no
    // resurrectable cell.
    // `admin()` from tests/helpers is the SERVICE-ROLE client, despite the name.
    const { data, error } = await admin()
      .from('result_snapshots')
      .select('aggregates')
      .eq('id', out.snapshot_id)
      .single()
    expect(error).toBeNull()

    const frozen = JSON.stringify(data!.aggregates)
    // The sparse question's four answers were all the value 3, and Bravo's
    // thirteen-response neighbours answered 2. Neither may be recoverable from
    // the frozen copy: a snapshot outlives the raw answers by design, so a leak
    // here survives retention deletion forever.
    expect(frozen).toContain('insufficient_data')
    const sparseEntry = (data!.aggregates as { questions?: { question_id: string; n: number | null }[] })
      .questions?.find((q) => q.question_id === ctx.qSparse.id)
    expect(sparseEntry?.n ?? null).toBeNull()
  })

  it('refuses a leser: freezing results is an editor action', async () => {
    const out = await rpc<{ error?: string }>(ctx.leser, 'snapshot_results', { p_survey: ctx.survey.id })
    expect(out.error).toBe('forbidden')
  })
})

describe('dashboard_summary — cross-survey, still per cell', () => {
  type Driver = { question_id: string; n?: number; avg?: number; insufficient_data?: boolean }

  it('drops a sparsely answered question from the drivers rather than ranking it', async () => {
    const out = await rpc<{ k: number; drivers: Driver[] }>(ctx.admin, 'dashboard_summary', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id],
    })
    expect(out.k).toBe(K)
    // Drivers are a ranking of real numbers. A gated question has no number, so
    // it cannot be ranked — and must not be invented as a zero either, which
    // would place it at the bottom of "lowest scoring" as though it were data.
    expect(out.drivers.map((d) => d.question_id)).toContain(ctx.qScale.id)
    expect(out.drivers.map((d) => d.question_id)).not.toContain(ctx.qSparse.id)
  })

  it('gates every driver when the group filter puts them under the threshold', async () => {
    const out = await rpc<{ drivers: Driver[] }>(ctx.admin, 'dashboard_summary', {
      p_org: ctx.org.id, p_surveys: [ctx.survey.id], p_group: ctx.groupB.id,
    })
    expect(out.drivers).toHaveLength(0)
  })

  it('refuses a caller outside the organisation', async () => {
    const out = await rpc<{ error?: string }>(ctx.outsider, 'dashboard_summary', { p_org: ctx.org.id })
    expect(out.error).toBe('forbidden')
  })

  it('is not reachable without a session', async () => {
    const { error } = await ctx.anon.rpc('dashboard_summary', { p_org: ctx.org.id })
    expect(error).not.toBeNull()
  })
})
