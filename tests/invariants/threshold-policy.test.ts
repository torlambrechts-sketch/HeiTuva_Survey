import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, asUser, uniq } from '../helpers'
import { hashToken } from './fixture'

/**
 * The catalogue is read through `psql`, not PostgREST, because `pg_proc` and
 * `information_schema` are not exposed over the API — the same reason Gate 5a3
 * (scripts/verify/policy-coverage.ts) shells out. This is what makes test #8
 * derive its surfaces from the database rather than a hand list.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

/**
 * Q17 — the configurable display threshold with a law-anchored floor
 * (docs/Q17_terskel_forslag.md). This is the only change in the expansion work
 * that touches the security kernel, so its eight negative tests are written and
 * proven FAILING before any implementation exists — the same discipline the
 * k-surface file used for Phase 4.
 *
 * Every test here exercises the TARGET contract:
 *   - surveys.respondent_kind ('person' | 'organisation')
 *   - surveys.k_threshold (default 5, CHECK >= 3 unless organisation)
 *   - surveys.policy_locked (set at send; freezes the policy)
 *   - template_packs.policy / duty_definitions.policy (the law-anchored lock)
 *   - app.k_for(survey) replacing the app.k_threshold() constant everywhere
 *
 * None of that exists yet, so these fail now. They pass once the migration and
 * the RPC swap land. Test #8 is the one that carries the phase: a surface that
 * kept the old constant is the defect that ships silently and looks fine.
 *
 * Numbers 1-8 below match the proposal's "Negative tester" section exactly.
 */

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}

type Ctx = Awaited<ReturnType<typeof build>>
let ctx: Ctx

/** Only CURRENT-schema setup here, so beforeAll never throws — a fixture that
 *  throws would report "0 collected" and the census would fail for the wrong
 *  reason. Each test does its own Q17-contract operation and fails on that. */
async function build() {
  const a = admin()
  const org = await insert(a, 'organizations', { name: uniq('Terskel AS') })
  const adminEmail = uniq('t-admin') + '@example.test'
  const redaktorEmail = uniq('t-red') + '@example.test'
  const adminU = await asUser(adminEmail)
  const redaktorU = await asUser(redaktorEmail)
  const group = await insert(a, 'groups', { org_id: org.id, name: 'Alfa' })
  await insert(a, 'org_members', {
    org_id: org.id, user_id: adminU.userId, email: adminEmail, role: 'administrator', status: 'active',
  })
  const redaktorMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: redaktorU.userId, email: redaktorEmail, role: 'redaktor', status: 'active',
  })
  return { a, an: anon(), org, group, adminU, redaktorU, redaktorMember }
}

/** A person survey with an open round and n scale-answers submitted, all in
 *  current schema, returning the ids a Q17 test then acts on. */
async function personSurveyWithResponses(
  base: string,
  n: number,
  extra: Record<string, unknown> = {},
) {
  const a = ctx.a
  const survey = await insert(a, 'surveys', {
    org_id: ctx.org.id, title: uniq(base), status: 'aktiv', anonymity: 'anonymous', ...extra,
  })
  const q = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 1, type: 'scale', text: 'Hvordan har uken vært?',
  })
  const qText = await insert(a, 'survey_questions', {
    survey_id: survey.id, position: 2, type: 'text', text: 'Hva bør vi endre?',
  })
  const round = await insert(a, 'survey_rounds', {
    survey_id: survey.id, round_no: 1, status: 'open',
    question_snapshot: [
      { id: q.id, type: 'scale', text: 'Hvordan har uken vært?' },
      { id: qText.id, type: 'text', text: 'Hva bør vi endre?' },
    ],
  })
  const tokens: string[] = []
  for (let i = 0; i < n; i++) {
    const raw = uniq(`tok-${i}`)
    tokens.push(raw)
    await insert(a, 'survey_invitations', {
      round_id: round.id, email: `${raw}@example.test`,
      token_hash: hashToken(raw), group_id: ctx.group.id, channel: 'email',
    })
    const { error } = await ctx.an.rpc('submit_response', {
      p_token: raw, p_lang: 'no',
      p_answers: { [q.id]: { value: 4 }, [qText.id]: { value: 'Mer tid til dypt arbeid' } },
    })
    if (error) throw new Error(`submit_response: ${error.message}`)
  }
  return { survey, q, qText, round, tokens }
}

beforeAll(async () => {
  ctx = await build()
}, 120_000)

// 1. En eksisterende undersøkelse uten eksplisitt valg aggregerer fortsatt på 5.
describe('(Q17 #1) a survey with no explicit setting still aggregates at 5', () => {
  it('carries the default policy — person, threshold 5, unlocked', async () => {
    const s = await personSurveyWithResponses('Standard', 0)
    const { data, error } = await ctx.a
      .from('surveys')
      .select('respondent_kind, k_threshold, policy_locked')
      .eq('id', s.survey.id)
      .single()
    expect(error).toBeNull()
    expect(data?.respondent_kind).toBe('person')
    expect(data?.k_threshold).toBe(5)
    expect(data?.policy_locked).toBe(false)
  })

  it('backfills pre-existing surveys — the column is NOT NULL DEFAULT 5', () => {
    // The half a test on a test-created row cannot reach: a survey that existed
    // before Q17 has no threshold of its own. `add column k_threshold int not
    // null default 5` backfills every existing row to 5 (Postgres rewrites the
    // table with the default), so a survey already running in prod keeps the
    // behaviour it had. That guarantee lives in the column definition, so it is
    // asserted there — not on a row this suite created after the migration ran.
    const [row] = psql(
      `select is_nullable, column_default from information_schema.columns
         where table_schema='public' and table_name='surveys' and column_name='k_threshold'`,
    )
    expect(row, 'k_threshold column is missing').toBeTruthy()
    expect(row?.[0], 'k_threshold must be NOT NULL, or a pre-existing row keeps no floor').toBe('NO')
    expect(row?.[1] ?? '', 'the backfill default must be 5').toMatch(/\b5\b/)
  })

  it('still refuses a four-person cell and reveals a five-person one — the default is 5, not 3', async () => {
    type Agg = { questions?: { question_id: string; insufficient_data?: boolean }[] }
    const cell = (d: Agg | null, q: string) => d?.questions?.find((c) => c.question_id === q)
    const s = await personSurveyWithResponses('Standard-agg', 4)
    const four = (await ctx.adminU.client.rpc('aggregate_results', { p_survey: s.survey.id })).data as Agg | null
    expect(cell(four, s.q.id)?.insufficient_data, 'four answers must stay gated under the default 5').toBe(true)

    // A fifth answer to the scale question lifts that cell over the default floor.
    const raw = uniq('fifth')
    await insert(ctx.a, 'survey_invitations', {
      round_id: s.round.id, email: `${raw}@example.test`,
      token_hash: hashToken(raw), group_id: ctx.group.id, channel: 'email',
    })
    await ctx.an.rpc('submit_response', { p_token: raw, p_lang: 'no', p_answers: { [s.q.id]: { value: 4 } } })
    const five = (await ctx.adminU.client.rpc('aggregate_results', { p_survey: s.survey.id })).data as Agg | null
    expect(cell(five, s.q.id)?.insufficient_data, 'five answers must reveal the cell').toBeFalsy()
  })
})

// 2. k_threshold under gulvet avvises av CHECK for respondent_kind = 'person'.
//    DECISIONS Q91 flyttet gulvet fra 3 til 2 (M:0055) — Q17s gulv er avløst,
//    ikke fjernet: 1 er ikke en terskel, det er publisering.
describe('(Q17 #2, floor moved by Q91) the floor is 2 for natural persons', () => {
  it('accepts a valid threshold and refuses one below the floor', async () => {
    const ok = await ctx.a.from('surveys').insert({
      org_id: ctx.org.id, title: uniq('Gyldig'), respondent_kind: 'person', k_threshold: 5,
    })
    expect(ok.error).toBeNull()

    // THE BOUNDARY MOVED, SO THE TEST TESTS THE NEW BOUNDARY FROM BOTH SIDES.
    // Asserting only "1 is refused" would pass against the OLD floor of 3 as
    // well, and a test that passes on either side of the change it exists to
    // record is not recording it.
    const two = await ctx.a.from('surveys').insert({
      org_id: ctx.org.id, title: uniq('Pa gulvet'), respondent_kind: 'person', k_threshold: 2,
    })
    expect(two.error, 'Q91: 2 is now the floor, so it is accepted').toBeNull()

    const bad = await ctx.a.from('surveys').insert({
      org_id: ctx.org.id, title: uniq('Under gulv'), respondent_kind: 'person', k_threshold: 1,
    })
    expect(bad.error).not.toBeNull()
    expect(bad.error?.message ?? '').toMatch(/k_threshold|check|constraint/i)
  })
})

// 3. Terskel og respondenttype kan ikke endres etter første respons — trigger avviser.
describe('(Q17 #3) the policy locks when the survey has been sent', () => {
  it('is editable while a draft and frozen once policy_locked is set', async () => {
    const s = await insert(ctx.a, 'surveys', {
      org_id: ctx.org.id, title: uniq('Låsbar'), status: 'utkast',
      anonymity: 'anonymous', respondent_kind: 'person', k_threshold: 5,
    })
    const draftEdit = await ctx.a.from('surveys').update({ k_threshold: 4 }).eq('id', s.id)
    expect(draftEdit.error, 'a draft survey must be freely editable').toBeNull()

    await ctx.a.from('surveys').update({ policy_locked: true }).eq('id', s.id)
    const lockedEdit = await ctx.a.from('surveys').update({ k_threshold: 3 }).eq('id', s.id)
    expect(lockedEdit.error?.message ?? '', 'a locked policy must not change').toMatch(/lock|policy|frozen|immutable/i)

    const kindEdit = await ctx.a.from('surveys').update({ respondent_kind: 'organisation' }).eq('id', s.id)
    expect(kindEdit.error?.message ?? '').toMatch(/lock|policy|frozen|immutable/i)
  })
})

// 4. En undersøkelse fra en lovpålagt mal avviser ethvert forsøk på å endre
//    terskel eller anonymitet, også som administrator.
describe('(Q17 #4) a statutory pack carries a locked policy nobody can override', () => {
  it('refuses a threshold or anonymity change even for an administrator', async () => {
    // psykososial-kartlegging is seeded as Arbeidsmiljøloven § 4-3: anonymous,
    // threshold 5, locked (docs/Q17_terskel_forslag.md, the law-anchored table).
    const s = await insert(ctx.a, 'surveys', {
      org_id: ctx.org.id, title: uniq('Psykososial'), status: 'utkast',
      anonymity: 'anonymous', template_pack_key: 'psykososial-kartlegging',
    })
    await insert(ctx.a, 'survey_editors', { survey_id: s.id, member_id: (await ctx.a
      .from('org_members').select('id').eq('org_id', ctx.org.id).eq('role', 'administrator').single()).data!.id })

    const anonChange = await ctx.adminU.client.from('surveys').update({ anonymity: 'named' }).eq('id', s.id)
    expect(anonChange.error?.message ?? '', 'the pack locks anonymity').toMatch(/lock|policy|mal|statut|frozen/i)

    const kChange = await ctx.adminU.client.from('surveys').update({ k_threshold: 3 }).eq('id', s.id)
    expect(kChange.error?.message ?? '', 'the pack locks the threshold').toMatch(/lock|policy|mal|statut|frozen/i)

    const { data } = await ctx.a.from('surveys').select('anonymity, k_threshold').eq('id', s.id).single()
    expect(data?.anonymity).toBe('anonymous')
    expect(data?.k_threshold).toBe(5)
  })
})

// 5. respondent_kind = 'organisation' gir attribuerte svar, men kan aldri
//    settes på en undersøkelse som allerede har person-svar.
describe('(Q17 #5) organisation mode is attributed, and cannot be turned on over person answers', () => {
  it('allows an organisation survey as a draft but refuses the switch once person answers exist', async () => {
    const orgSurvey = await ctx.a.from('surveys').insert({
      org_id: ctx.org.id, title: uniq('Leverandør'), respondent_kind: 'organisation', anonymity: 'named',
    }).select('id, k_threshold').single()
    expect(orgSurvey.error, 'an organisation survey is a valid draft').toBeNull()

    const withAnswers = await personSurveyWithResponses('Har-svar', 1)
    const switched = await ctx.a
      .from('surveys').update({ respondent_kind: 'organisation' }).eq('id', withAnswers.survey.id)
    expect(switched.error?.message ?? '', 'cannot re-cast person answers as organisation').toMatch(
      /person|answer|svar|lock|policy|respondent/i,
    )
  })
})

// 7. Redaktør kan ikke endre terskelen; administrator kan, og hendelsen havner
//    i audit_events.
describe('(Q17 #7) changing the threshold is an administrator action, audited', () => {
  it('refuses a redaktør, allows an administrator, and records the change', async () => {
    const s = await insert(ctx.a, 'surveys', {
      org_id: ctx.org.id, title: uniq('Terskelendring'), status: 'utkast',
      anonymity: 'anonymous', respondent_kind: 'person', k_threshold: 5,
    })
    // The redaktør is a co-editor, so RLS admits the row — only the personvern
    // rule (administrator-only) may refuse the threshold change specifically.
    await insert(ctx.a, 'survey_editors', { survey_id: s.id, member_id: ctx.redaktorMember.id })

    const byRedaktor = await ctx.redaktorU.client.from('surveys').update({ k_threshold: 4 }).eq('id', s.id).select('id')
    // Refused either by an error or by RLS/trigger returning no changed row.
    const redaktorChanged = !byRedaktor.error && (byRedaktor.data?.length ?? 0) > 0
    expect(redaktorChanged, 'a redaktør must not change the threshold').toBe(false)

    const byAdmin = await ctx.adminU.client.from('surveys').update({ k_threshold: 8 }).eq('id', s.id).select('id')
    expect(byAdmin.error, 'an administrator may change the threshold').toBeNull()
    expect(byAdmin.data?.length ?? 0).toBe(1)

    const { data: events } = await ctx.adminU.client
      .from('audit_events').select('action, target')
      .eq('org_id', ctx.org.id).eq('action', 'threshold.change').eq('target', s.id)
    expect((events?.length ?? 0), 'the change must be audited').toBeGreaterThan(0)
  })
})

// 8. get_quotes og heatmap-cellene bruker samme app.k_for — ingen vei rundt via
//    en RPC som glemte oppslaget. Expanded (Tor): heatmap, get_quotes, trends,
//    results_summary, aggregate_results, get_peer_results, compose_report — all
//    of it. This is the whole risk of the phase.
describe('(Q17 #8) every aggregate path routes through app.k_for — none kept the constant', () => {
  it('is proven from the catalogue, not a hand list — two-sided', () => {
    // (a) Nothing but k_for's own lookup may still reference the old global
    //     constant. A surface that kept app.k_threshold() gates at 5 while the
    //     policy says 3 — the silent defect this phase exists to prevent.
    const callsOldConstant = psql(
      `select n.nspname || '.' || p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app') and p.prosrc ilike '%k_threshold()%'
        order by 1`,
    ).map((r) => r[0])
    expect(
      callsOldConstant,
      `these functions still call app.k_threshold(): ${callsOldConstant.join(', ') || '(none)'}`,
    ).toEqual([])

    // (a2) The SAME SHAPE, for a different constant — DECISIONS Q20, added in
    //      V1-3 because the pattern earned a second instance.
    //
    //      How long a cadence step is has exactly one definition,
    //      `app.cadence_interval` (M:0044). It got that definition after a CASE
    //      with four arms and `else interval '7 days'` was found making an
    //      ANNUAL survey re-send weekly — and then a SECOND copy of the same
    //      CASE was found in `send_round` (M:0045), because 0044 fixed the site
    //      that had the symptom rather than the set of sites that could have it.
    //
    //      0044's comment predicted the second copy in as many words and the
    //      second copy still survived it. A comment warning about a class of
    //      bug does not go looking for other instances; only a query does. So
    //      this is the query: any function that does interval arithmetic on a
    //      cadence, other than the one definition, fails on the PR that adds it.
    //      COMMENTS ARE STRIPPED FIRST, and that is not a detail: `prosrc` is
    //      the whole body, so the first version of this query flagged
    //      `send_round` for the comment explaining what it had stopped doing —
    //      a function quoting `else interval '7 days'` to say why it no longer
    //      does that. A sweep that reads prose as code produces exactly the
    //      false positive that gets a check switched off.
    const doesOwnIntervalMath = psql(
      `select n.nspname || '.' || p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app')
          and p.proname <> 'cadence_interval'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~ 'cadence'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~ 'interval\\s'
        order by 1`,
    ).map((r) => r[0])
    expect(
      doesOwnIntervalMath,
      `these compute a cadence interval themselves instead of calling app.cadence_interval(): ${
        doesOwnIntervalMath.join(', ') || '(none)'
      }`,
    ).toEqual([])

    // (b) The other side, derived from the catalogue too: every SECURITY
    //     DEFINER function a caller can reach that READS the vault must consult
    //     app.k_for. This catches the likelier mistake in a phase that adds
    //     surfaces — a NEW aggregate that gates on nothing at all — because it
    //     fails by construction, without being named here.
    //
    //     THE RULE THE EXEMPTIONS FOLLOW (DECISIONS Q28, confirmed 2026-09-06).
    //     A count of PEOPLE is participation and is not gated: how many were
    //     invited, how many took part, what share that is. Anything derived
    //     from what those people SAID is gated: averages, distributions,
    //     themes, quotes, per-group breakdowns. The line is the subject of the
    //     number, not its size — "42 answered" says nothing about any answer,
    //     while "3.8 average" is the answers themselves in one figure. The
    //     design brief's § "Hva som ikke skal designes" was amended to match
    //     ("aldri et svarutledet tall"), and the survey list's own "N av T"
    //     stays for the same reason.
    //
    //     A pair of grandfathered names decays into "these two are special
    //     because they always were". A stated rule does not, and it is what a
    //     third entry must argue against.
    //
    //     THE LIST IS ENUMERATED AND CLOSED, like the k_for allowlist above: a
    //     new count-only function reading the vault FAILS this assertion until
    //     someone adds it here deliberately, with a reason. Failing first is
    //     the point — it forces the question "is this participation, or is it
    //     derived from what they said?" to be answered by a person.
    // DECISIONS Q49 (V1-6) DOES NOT APPEAR IN THIS LIST, and the reason is
    // worth stating because the decision's own draft got it wrong.
    //
    // `get_trends` now emits `n` on a gated point. That does NOT make it a
    // count-only function: it CALLS `app.k_for` and gates everything derived
    // behind it, so it never qualified for this list and adding a count does
    // not change that. The list is for a vault reader that gates on NOTHING.
    //
    // What Q49 needed instead is a tighter assertion, and it lives beside the
    // trends tests rather than here: the gated payload must carry the count and
    // NOTHING DERIVED. See `(Q49) a gated point carries the count and nothing
    // else` — Tor's narrowing, enforced as a closed key set rather than as a
    // sentence someone wrote once.
    const DO_NOT_GATE: Record<string, string> = {
      overview_activity: 'activity/participation counts, never answer content',
      survey_response_counts: 'per-survey response counts (svarprosent), not answer distributions',
    }
    const vaultReaders = psql(
      `select p.proname, (p.prosrc ~* 'k_for\\s*\\(')::text
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and (has_function_privilege('authenticated', p.oid, 'execute')
               or has_function_privilege('anon', p.oid, 'execute'))
          and (p.prosrc ~* 'from\\s+(public\\.)?(responses|answers)'
               or p.prosrc ~* 'join\\s+(public\\.)?(responses|answers)')
        order by 1`,
    )
    const offenders = vaultReaders
      .filter(([name, hasKfor]) => hasKfor !== 'true' && !(name! in DO_NOT_GATE))
      .map(([name]) => name)
    expect(
      offenders,
      `these read the vault, are caller-reachable, but never call app.k_for: ${offenders.join(', ') || '(none)'}`,
    ).toEqual([])
  })

  it('an organisation survey with a single response returns it — the ungated path yields data', async () => {
    const survey = await insert(ctx.a, 'surveys', {
      org_id: ctx.org.id, title: uniq('Leverandør-1'), status: 'aktiv',
      anonymity: 'named', respondent_kind: 'organisation',
    })
    const q = await insert(ctx.a, 'survey_questions', {
      survey_id: survey.id, position: 1, type: 'scale', text: 'Har dere en policy?',
    })
    const round = await insert(ctx.a, 'survey_rounds', {
      survey_id: survey.id, round_no: 1, status: 'open',
      question_snapshot: [{ id: q.id, type: 'scale', text: 'Har dere en policy?' }],
    })
    const raw = uniq('org-1')
    await insert(ctx.a, 'survey_invitations', {
      round_id: round.id, email: `${raw}@x.test`, token_hash: hashToken(raw), group_id: ctx.group.id, channel: 'email',
    })
    await ctx.an.rpc('submit_response', { p_token: raw, p_lang: 'no', p_answers: { [q.id]: { value: 4 } } })

    // k_for returns 0 for an organisation survey — "no gate". That is a magic
    // value, so this proves the ungated path RETURNS THE DATA, not merely that
    // it does not error: the single response must come back with n = 1, never
    // suppressed and never a fall-through to nothing.
    const agg = (await ctx.adminU.client.rpc('aggregate_results', { p_survey: survey.id })).data
    expect(JSON.stringify(agg), 'an organisation aggregate was gated').not.toContain('"insufficient_data":true')
    const cell = (agg as { questions?: { question_id: string; n?: number }[] } | null)
      ?.questions?.find((x) => x.question_id === q.id)
    expect(cell?.n, 'the single organisation response was not returned as data').toBe(1)
  })

  it('serves real data at n=3 when the survey policy is threshold 3, on every surface', async () => {
    const s = await personSurveyWithResponses('Terskel-tre', 3)
    // Set the survey's threshold to 3. Until app.k_for exists and every RPC
    // consults it, this is where the phase fails: the column is absent now, and
    // even once present, any RPC that kept app.k_threshold() returns
    // insufficient_data at n=3 and trips the assertions below.
    const lowered = await ctx.a.from('surveys').update({ k_threshold: 3 }).eq('id', s.survey.id)
    expect(lowered.error, 'threshold must be settable to the person floor').toBeNull()

    // A second round with three answers, so get_trends has two real points.
    const round2 = await insert(ctx.a, 'survey_rounds', {
      survey_id: s.survey.id, round_no: 2, status: 'open',
      question_snapshot: [{ id: s.q.id, type: 'scale', text: 'Hvordan har uken vært?' }],
    })
    for (let i = 0; i < 3; i++) {
      const raw = uniq(`r2-${i}`)
      await insert(ctx.a, 'survey_invitations', {
        round_id: round2.id, email: `${raw}@example.test`,
        token_hash: hashToken(raw), group_id: ctx.group.id, channel: 'email',
      })
      await ctx.an.rpc('submit_response', { p_token: raw, p_lang: 'no', p_answers: { [s.q.id]: { value: 5 } } })
    }

    const c = ctx.adminU.client

    // Shape-agnostic: at n=3 under a threshold-3 policy, NO cell on any surface
    // may be gated. A surface that kept `app.k_threshold()` (5) still emits
    // `"insufficient_data":true` at three answers — wherever it hides in the
    // payload, this catches it. That is the whole point of the phase.
    const ungated = (data: unknown, label: string) => {
      expect(data, `${label} returned nothing`).toBeTruthy()
      expect(JSON.stringify(data), `${label} kept the constant`).not.toContain('"insufficient_data":true')
    }

    ungated((await c.rpc('aggregate_results', { p_survey: s.survey.id, p_round: s.round.id })).data, 'aggregate_results')
    ungated((await c.rpc('get_heatmap', { p_org: ctx.org.id, p_surveys: [s.survey.id] })).data, 'get_heatmap')
    ungated((await c.rpc('get_quotes', { p_survey: s.survey.id, p_question: s.qText.id })).data, 'get_quotes')
    ungated((await ctx.an.rpc('get_peer_results', { p_token: s.tokens[0]! })).data, 'get_peer_results')

    const summary = (await c.rpc('results_summary', { p_survey: s.survey.id, p_round: s.round.id })).data as
      | { n?: number; avg?: number | null } | null
    ungated(summary, 'results_summary')
    expect(summary?.avg ?? null, 'results_summary suppressed a legitimate average').not.toBeNull()

    const trends = (await c.rpc('get_trends', { p_survey: s.survey.id })).data as
      | { points?: { insufficient_data?: boolean }[] } | null
    ungated(trends, 'get_trends')
    expect((trends?.points?.length ?? 0), 'get_trends saw no round at threshold 3').toBeGreaterThanOrEqual(1)

    // compose_report's aggregate section must honour the survey's threshold too.
    const report = await insert(ctx.a, 'reports', {
      org_id: ctx.org.id, title: uniq('Rapport'), kind: 'egen', status: 'utkast',
      sections: ['summary'], filters: { surveys: [s.survey.id], rounds: [s.round.id], group: null },
    })
    const doc = (await c.rpc('compose_report', { p_report: report.id })).data as
      | { sections?: { key: string }[] } | null
    expect(doc?.sections?.length ?? 0, 'compose_report produced no sections').toBeGreaterThanOrEqual(1)
    ungated(doc, 'compose_report')
  })
})

// ---------------------------------------------------------------------------
// Q47 — peer results on an organisation survey (DECISIONS Q47, was v1 conflict C1)
// ---------------------------------------------------------------------------
/**
 * `app.k_for` returns 0 for an organisation survey: attribution is the whole
 * point, so there is no threshold to clear. `get_peer_results` gated on exactly
 * that number, which made the thank-you screen's "slik svarte de andre" panel
 * hand a supplier the distribution of its COMPETITORS' answers — and, because
 * the RPC is anon-executable by design, hand it to anyone holding a live token
 * whatever the screen chooses to draw.
 *
 * The rule therefore lives in the function, not in the component: a client that
 * lies about what it renders gets nothing back either way.
 *
 * Written before the migration and proven failing against it.
 */
describe('(Q47) an organisation respondent learns nothing about the other organisations', () => {
  /** An organisation survey with `n` suppliers, all of whom answered the same
   *  numeric question with a distinctive value, plus their raw tokens. */
  async function orgSurveyWithSuppliers(n: number) {
    const survey = await insert(ctx.a, 'surveys', {
      org_id: ctx.org.id, title: uniq('Leverandørkjede'), status: 'aktiv',
      anonymity: 'named', respondent_kind: 'organisation',
    })
    const q = await insert(ctx.a, 'survey_questions', {
      survey_id: survey.id, position: 1, type: 'scale',
      text: 'Hvor mange ledd bakover kartlegger dere?',
    })
    const round = await insert(ctx.a, 'survey_rounds', {
      survey_id: survey.id, round_no: 1, status: 'open',
      question_snapshot: [{ id: q.id, type: 'scale', text: 'Hvor mange ledd bakover kartlegger dere?' }],
    })
    const suppliers: { raw: string; name: string; value: number }[] = []
    for (let i = 0; i < n; i++) {
      const raw = uniq(`lev-${i}`)
      const name = `Leverandør ${i + 1} AS`
      // Distinct values, so a leaked distribution is identifiable rather than
      // a coincidence: supplier i answered i + 1.
      const value = i + 1
      await insert(ctx.a, 'survey_invitations', {
        round_id: round.id, email: `${raw}@example.test`, name,
        token_hash: hashToken(raw), group_id: ctx.group.id, channel: 'email',
      })
      const { error } = await ctx.an.rpc('submit_response', {
        p_token: raw, p_lang: 'no', p_answers: { [q.id]: { value } },
      })
      if (error) throw new Error(`submit_response: ${error.message}`)
      suppliers.push({ raw, name, value })
    }
    return { survey, q, round, suppliers }
  }

  it('refuses the peer distribution to a supplier holding a live token', async () => {
    const s = await orgSurveyWithSuppliers(3)
    const { data, error } = await ctx.an.rpc('get_peer_results', { p_token: s.suppliers[0]!.raw })
    expect(error, 'the RPC itself must answer, not fail').toBeNull()

    const body = (data ?? {}) as {
      hidden?: boolean; n?: number; buckets?: { value: number; count: number }[]
      insufficient_data?: boolean; question?: string
    }
    expect(body.hidden, 'an organisation survey has no peer view at all').toBe(true)

    // Nothing about any other respondent, stated as a property of the whole
    // payload rather than of the fields we happen to know about: no bucket
    // list, no count of participants, and none of the other suppliers' values.
    expect(body.buckets, 'no distribution').toBeUndefined()
    expect(body.n, 'not even how many answered').toBeUndefined()
    const payload = JSON.stringify(data)
    for (const other of s.suppliers.slice(1)) {
      expect(payload, `supplier ${other.name}'s answer leaked`).not.toContain(`"value":${other.value}`)
      expect(payload, `supplier ${other.name} named`).not.toContain(other.name)
    }
  })

  it('POSITIVE CONTROL: the supplier\'s own submission is still there, on the paths that own it', async () => {
    const s = await orgSurveyWithSuppliers(2)
    const mine = s.suppliers[0]!

    // (a) The respondent surface still resolves the supplier's own token and
    //     reports its own participation. If this broke, "hidden" would be
    //     indistinguishable from a dead link.
    const { data: tokenView } = await ctx.an.rpc('get_survey_for_token', { p_token: mine.raw })
    const view = (tokenView ?? {}) as { error?: string; already_responded?: boolean; survey_id?: string }
    expect(view.error, 'the token still resolves').toBeUndefined()
    expect(view.already_responded, 'and knows this supplier answered').toBe(true)
    expect(view.survey_id).toBe(s.survey.id)

    // (b) The answer itself is readable on the path that is meant to carry it —
    //     the attributed view, for the organisation running the survey. So the
    //     refusal above is a scoping decision, not the data being absent.
    const { data: attributed } = await ctx.adminU.client
      .rpc('attributed_results', { p_survey: s.survey.id })
    const rows = (attributed as { rows?: { name: string | null; answers: { value: unknown }[] | null }[] } | null)?.rows ?? []
    const row = rows.find((r) => r.name === mine.name)
    expect(row, 'the supplier appears in the attributed view').toBeTruthy()
    expect(row?.answers?.[0]?.value, 'with the answer it gave').toBe(mine.value)
  })

  it('POSITIVE CONTROL: a PERSON survey still shows peer results above its threshold', async () => {
    // The rule must narrow to organisation surveys only. Without this, turning
    // peer results off everywhere would pass the denial above.
    const s = await personSurveyWithResponses('Peer-person', 5)
    const { data } = await ctx.an.rpc('get_peer_results', { p_token: s.tokens[0]! })
    const body = (data ?? {}) as { hidden?: boolean; n?: number; buckets?: unknown[] }
    expect(body.hidden, 'a person survey keeps its peer panel').toBeUndefined()
    expect(body.n, 'and reports the real number of answers').toBe(5)
    expect((body.buckets ?? []).length, 'with a real distribution').toBeGreaterThan(0)
  })
})
