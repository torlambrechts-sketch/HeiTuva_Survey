import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  leserClient,
  outsiderClient,
  serviceClient,
  type Client,
} from './clients'
import { createRound, createShareLink, createSurvey } from './factories'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * C1 — `survey_comments`, the token read capability, and `surveys.feedback_mode`.
 *
 * DECISIONS **Q111** (a used token gains a read-after-submit capability and
 * nothing else), **Q112** (a comment is a message, not an answer — it lives
 * outside the answers vault and no aggregate path may reach it), **Q113** (the
 * anonymity choice is per SUBMISSION), **Q114** (no pack lock, with two
 * conditions that are asserted rather than assumed).
 *
 * ── WHY THIS FILE IS WRITTEN BEFORE THE MIGRATION ──────────────────────────
 *
 * Every test below fails on a database that has no `survey_comments`, and that
 * is the point: a negative test written after the thing it guards has never
 * been observed to fail, so it is a claim rather than a check. Docker is
 * unavailable in this session, so «proven failing» is proven in CI — the run
 * that carries this file and no migration is the evidence.
 *
 * ── THE PROPERTY THAT IS NOT A TEST ────────────────────────────────────────
 *
 * Q113 says a named comment and an anonymous answer must never share a
 * `response_id`. The strongest version of that is not an assertion — it is that
 * **`submit_response` takes no per-comment anonymity input at all.** The
 * comment's `is_anonymous` is written from `v_mode`, the same variable the
 * response's own `invitation_id` linkage is decided by, so the two cannot
 * disagree because there is nothing to disagree with. Test 12 asserts the
 * ABSENCE of that input over the function's source, which is the only form that
 * stays true when somebody adds a sixth parameter.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
function one(query: string): string {
  return psql(query)[0]?.[0] ?? ''
}
/**
 * A MULTI-LINE value, whole.
 *
 * `one()` splits psql's output on newlines and returns the first cell of the
 * first line — which is correct for a count and silently wrong for
 * `pg_get_functiondef`, whose value IS newlines. Test 14 caught it by asserting
 * something POSITIVE about a function body; every `not.toMatch` in this file was
 * passing against a 37-character fragment of a signature, which is D158's shape
 * again — an assertion over a result too small to contain a counterexample.
 *
 * A negative assertion cannot detect this. That is the transferable half.
 */
function whole(query: string): string {
  return execFileSync('psql', [DB_URL, '-tA', '-c', query], { encoding: 'utf8' })
}

/** The migration this phase adds. Named once: test 21 reads it, because the
 *  property it checks is invisible at runtime on a freshly reset database. */
const MIGRATION = 'supabase/migrations/20260911000099_survey_comments.sql'

/**
 * THE FIXTURE LIVES IN THE SEEDED ORG, AND THAT IS A CORRECTION.
 *
 * The first version created a fresh organisation with fresh members and then
 * asserted RLS with `adminClient()` / `leserClient()` — the PERSONA clients,
 * who are members of Nordisk Studio and of nothing else. The administrator
 * correctly saw zero rows, and the test read that as a policy failure.
 *
 * It is standing question 2b, verbatim: «Which ROWS can my roles reach — not
 * just which roles read?» A test whose personas cannot reach its fixture is
 * measuring the fixture.
 *
 * So the surveys are created INSIDE `ORG_PRIMARY`, where the personas are, and
 * the cross-org half uses `ORG_OTHER` and `outsiderClient()`, which is the pair
 * the rest of tests/db already uses for exactly this.
 */
const TAG = randomUUID().slice(0, 8)

type Fixture = {
  orgId: string
  surveyId: string
  roundId: string
  tokens: string[]
  shareToken: string
  questionId: string
  closedToken: string
}
let fx: Fixture
let fxB: { tokens: string[] }

const svc: Client = serviceClient()

beforeAll(async () => {
  const { data: orgs } = await svc.from('organizations').select('id, name')
  const orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  const otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id
  const org = { id: orgId }
  const survey = await createSurvey(org.id, `Ukespuls med kommentar ${TAG}`, [
    { type: 'scale', text: 'Hvordan har uken vært?' },
  ])
  const round = await createRound(survey, 3)
  const shareRaw = `share-${randomUUID()}`
  const share = await createShareLink(round.id, shareRaw)

  // A second round, closed, for the expiry property.
  const closed = await createRound(survey, 1, { roundNo: 2 })
  await svc.from('survey_rounds').update({ status: 'closed' }).eq('id', closed.id)

  const surveyB = await createSurvey(otherOrgId, `Annen undersøkelse ${TAG}`, [
    { type: 'scale', text: 'Hvordan går det?' },
  ])
  const roundB = await createRound(surveyB, 1)

  fx = {
    orgId: org.id,
    surveyId: survey.id,
    roundId: round.id,
    tokens: round.tokens,
    shareToken: share.token,
    questionId: survey.questions[0]!.id,
    closedToken: closed.tokens[0]!,
  }
  fxB = { tokens: roundB.tokens }
}, 120_000)

afterAll(async () => {
  // The seeded orgs are NOT dropped — they are the demo data every other gate
  // reads. Only this file's own surveys go, and the comments cascade with their
  // rounds.
  await svc.from('surveys').delete().like('title', `%${TAG}`)
})

/** Submit through the ONE write path, with comments. */
async function submit(
  token: string,
  opts: { comments?: { question_id: string | null; text: string }[]; anonChoice?: boolean } = {},
) {
  const anon = anonClient()
  return anon.rpc('submit_response', {
    p_token: token,
    p_lang: 'no',
    p_answers: { [fx.questionId]: { value: 4 } },
    p_anon_choice: opts.anonChoice ?? null,
    p_comments: opts.comments ?? null,
  } as never)
}

async function readThread(token: string) {
  const anon = anonClient()
  return anon.rpc('get_comment_thread', { p_token: token } as never)
}

describe('C1 — survey_comments exists, outside the answers vault', () => {
  it('1. the table exists and RLS is enabled on it', () => {
    expect(one(`select relrowsecurity from pg_class where oid = 'public.survey_comments'::regclass`)).toBe('t')
  })

  it('2. no SELECT policy exposes it to the anon role — a respondent reads through the RPC only', () => {
    const roles = psql(`
      select p.polname, coalesce(array_to_string(array(
        select rolname from pg_roles where oid = any(p.polroles)), ','), 'PUBLIC')
        from pg_policy p where p.polrelid = 'public.survey_comments'::regclass and p.polcmd = 'r'`)
    expect(roles.length).toBeGreaterThan(0)
    for (const [, who] of roles) {
      expect(who, 'a select policy naming anon or PUBLIC would make the RPC decorative').not.toMatch(
        /\banon\b|PUBLIC/,
      )
    }
  })

  it('3. Q112 — NO security definer function reads survey_comments except the ones that may', () => {
    // Catalogue-derived, in D115's shape: the sweep enumerates every SECURITY
    // DEFINER function in app and public and asserts that the only ones naming
    // this table are the comment RPCs themselves. The next aggregate that
    // touches it fails in the commit that adds it, not in a review.
    // Only what exists now, and each addition is DELIBERATE. C4's
    // `set_comment_handled` and C5's `reply_to_comment` arrived failing this
    // test and were added here by the phases that wrote them — which is the
    // whole mechanism (D115's shape). An aggregate that reaches this table will
    // do the same, and its author will have to say why.
    const ALLOWED = new Set([
      'submit_response',      // the ONE write path (invariant 2)
      'get_comment_thread',   // Q111, the respondent's read-after-submit
      'set_comment_handled',  // C4, the handled_at writer
      'reply_to_comment',     // C5, the reply writer
    ])
    const readers = psql(`
      select n.nspname || '.' || p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef
         and n.nspname in ('app','public')
         and pg_get_functiondef(p.oid) ~ 'survey_comments'`)
      .map(([f]) => f!)
      .filter((f) => !ALLOWED.has(f!.split('.')[1]!))
    expect(readers, 'an aggregate path reached the comment table').toEqual([])
  })

  it('4. the aggregate RPCs do not name it — asserted separately, by name, because these are the ones that matter', () => {
    for (const fn of ['aggregate_results', 'get_quotes']) {
      const src = whole(
        `select coalesce(pg_get_functiondef(p.oid),'') from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = '${fn}'`,
      )
      expect(src.length, `${fn} not found`).toBeGreaterThan(0)
      expect(src, `${fn} reads the comment table`).not.toMatch(/survey_comments/)
    }
  })
})

describe('C1 — Q111: the token capability, five properties', () => {
  it('5. property 1 — a USED token reads its own thread', async () => {
    const token = fx.tokens[0]!
    const sub = await submit(token, {
      comments: [{ question_id: fx.questionId, text: 'Prioriteringene endres midt i uken.' }],
    })
    expect(sub.error, sub.error?.message).toBeNull()

    const read = await readThread(token)
    expect(read.error, read.error?.message).toBeNull()
    const rows = (read.data as { comments: { text: string }[] }).comments
    expect(rows.map((c) => c.text)).toContain('Prioriteringene endres midt i uken.')
  })

  it('6. property 2 — a used token still cannot submit; already_responded holds', async () => {
    const token = fx.tokens[0]!
    const again = await submit(token, { comments: [{ question_id: null, text: 'en gang til' }] })
    expect(again.error).toBeNull()
    expect((again.data as { error?: string }).error).toBe('already_responded')
  })

  it('7. property 2, the half a regression would undo silently — the refused submission wrote NO comment', async () => {
    // The dangerous shape is a handler that refuses the response and writes the
    // comments anyway, because they are inserted from the same payload. Count
    // rather than trust: one comment from test 5, none from test 6.
    const n = one(`
      select count(*) from public.survey_comments c
        join public.survey_invitations i on i.id = c.invitation_id
       where i.round_id = '${fx.roundId}' and c.body = 'en gang til'`)
    expect(n, 'a refused submission still wrote its comment').toBe('0')
  })

  it('8. property 3 — a token cannot read ANOTHER respondent’s thread in the same round', async () => {
    const other = fx.tokens[1]!
    await submit(other, { comments: [{ question_id: null, text: 'naboens kommentar' }] })

    const read = await readThread(fx.tokens[0]!)
    const rows = (read.data as { comments: { text: string }[] }).comments
    expect(rows.map((c) => c.text)).not.toContain('naboens kommentar')
  })

  it('9. property 3 across ORGS — a token from another organisation reads nothing of ours', async () => {
    const read = await readThread(fxB.tokens[0]!)
    expect(read.error).toBeNull()
    const rows = (read.data as { comments: { text: string }[] }).comments ?? []
    expect(rows.map((c) => c.text)).not.toContain('Prioriteringene endres midt i uken.')
  })

  it('10. property 4 — the capability reads no results: the payload carries no answer, score or aggregate', async () => {
    const read = await readThread(fx.tokens[0]!)
    // NON-VACUITY FIRST. The red run proved this test passed against a database
    // with no such function at all: `read.data` was null, JSON.stringify(null)
    // is "null", and "null" contains none of the forbidden strings. A test that
    // passes when the thing it guards does not exist is a claim, not a check —
    // it would keep passing if the RPC were dropped tomorrow.
    expect(read.error, read.error?.message).toBeNull()
    const d = read.data as { comments?: unknown[] }
    expect(Array.isArray(d.comments), 'no thread came back to inspect').toBe(true)
    expect((d.comments ?? []).length, 'an empty thread proves nothing here').toBeGreaterThan(0)

    const payload = JSON.stringify(read.data)
    for (const forbidden of ['"value"', '"answers"', '"score"', '"n"', '"average"']) {
      expect(payload, `the thread payload carries ${forbidden}`).not.toContain(forbidden)
    }
    // And the function itself must not name the vault — over a body that exists.
    const src = whole(`select pg_get_functiondef(p.oid) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='get_comment_thread'`)
    expect(src.length, 'get_comment_thread does not exist').toBeGreaterThan(0)
    expect(src).not.toMatch(/\bfrom\s+public\.answers\b|\bjoin\s+public\.answers\b/)
  })

  it('11. property 5 — a token whose round is CLOSED reads nothing', async () => {
    const read = await readThread(fx.closedToken)
    expect(read.error).toBeNull()
    const d = read.data as { error?: string; comments?: unknown[] }
    expect(d.error ?? 'not_found_or_closed').toBe('not_found_or_closed')
  })
})

describe('C1 — Q113: enforced by two absences rather than by a check', () => {
  it('12. THE TABLE HAS NO COLUMN REFERENCING responses — catalogue-derived', () => {
    // This is the strongest form of Q113 and it replaces what this test first
    // asserted. The original design gave `survey_comments` BOTH a `response_id`
    // and an `invitation_id`, so that a test could compare the comment's
    // anonymity against its response's. Written out, that is a join from an
    // invitation to a response — **which is exactly the link the anonymity
    // CHECK on `responses` exists to forbid.** A comment table built that way
    // would have defeated invariant 2 through the side door, in the phase whose
    // job was to protect it.
    //
    // So there is no such column, and the property is structural: nothing can
    // share a `response_id` when no row has one. Asserted over the catalogue —
    // ANY foreign key into `responses` or `answers` fails this, including one
    // named something else.
    const refs = psql(`
      select a.attname, cf.relname
        from pg_constraint c
        join pg_class cf on cf.oid = c.confrelid
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.conrelid = 'public.survey_comments'::regclass
         and c.contype = 'f'
         and cf.relname in ('responses','answers')`)
    expect(refs, 'a comment can be joined to a response — invariant 2 is defeated').toEqual([])
  })

  it('13. and no column merely NAMED like one, either — an untyped uuid is the same link without the FK', () => {
    const cols = psql(`
      select column_name from information_schema.columns
       where table_schema='public' and table_name='survey_comments'`).map(([c]) => c!)
    // Non-vacuity: the red run passed this on a table that did not exist, where
    // the loop below ran zero times.
    expect(cols.length, 'survey_comments has no columns — the table is missing').toBeGreaterThan(0)
    for (const c of cols) {
      expect(c, `${c} looks like a link to the answers vault`).not.toMatch(/^(response|answer)_id$/)
    }
  })

  it('14. submit_response takes NO per-comment anonymity input', () => {
    const src = whole(`select pg_get_functiondef(p.oid) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='submit_response'`)
    expect(src.length, 'submit_response not found').toBeGreaterThan(0)
    // The comment payload is read for its text and its question, and for
    // nothing else. A key named anon/anonymous/named inside the comment loop is
    // the door Q113 closes; `is_anonymous` is written from v_mode, the same
    // variable that decides the response's own linkage, so the two cannot
    // disagree because there is nothing to disagree with.
    const loop = src.slice(src.indexOf('p_comments'))
    expect(loop, 'a per-comment anonymity key reached the writer').not.toMatch(
      /->>?\s*'(anon|anonymous|is_anonymous|named|with_name)'/,
    )
    expect(loop, 'the comment anonymity is not taken from the submission mode').toMatch(/v_mode/)
  })

  it('15. ONE CHOICE, BOTH EFFECTS — p_anon_choice decides the answer AND the comment together', async () => {
    // The positive half of Q113, and the one that would still be broken if the
    // comment had its own input. A survey that is optional on BOTH axes: the
    // single choice must move both, in the same direction, from one call.
    const s2 = await createSurvey(fx.orgId, `Begge valgfrie ${TAG}`, [
      { type: 'scale', text: 'Hvordan går det?' },
    ], { anonymity: 'optional' })
    await svc.from('surveys').update({ feedback_mode: 'optional' }).eq('id', s2.id)
    const r2 = await createRound(s2, 2)

    const named = await anonClient().rpc('submit_response', {
      p_token: r2.tokens[0]!,
      p_lang: 'no',
      p_answers: { [s2.questions[0]!.id]: { value: 4 } },
      p_anon_choice: false,
      p_comments: [{ question_id: null, text: 'signert av meg' }],
    } as never)
    expect(named.error, named.error?.message).toBeNull()

    const row = psql(`
      select c.is_anonymous,
             (select count(*)::text from public.responses r
               where r.round_id = '${r2.id}' and r.invitation_id is not null)
        from public.survey_comments c where c.body = 'signert av meg'`)
    expect(row.length, 'the comment was not written').toBe(1)
    expect(row[0]![0], 'the comment came back anonymous after a named choice').toBe('f')
    expect(row[0]![1], 'the response did not link after a named choice').toBe('1')
  })

  it('16. feedback_mode=off is enforced at the WRITE, not only in the UI', async () => {
    const s3 = await createSurvey(fx.orgId, `Ingen kommentarer ${TAG}`, [
      { type: 'scale', text: 'Hvordan går det?' },
    ])
    await svc.from('surveys').update({ feedback_mode: 'off' }).eq('id', s3.id)
    const r3 = await createRound(s3, 1)

    const out = await anonClient().rpc('submit_response', {
      p_token: r3.tokens[0]!,
      p_lang: 'no',
      p_answers: { [s3.questions[0]!.id]: { value: 2 } },
      p_anon_choice: null,
      p_comments: [{ question_id: null, text: 'skulle ikke vært lagret' }],
    } as never)
    expect(out.error, out.error?.message).toBeNull()
    // Dropped, and SAID so: a client that sent one and is told 0 knows why.
    expect((out.data as { comments?: number }).comments, 'the mode is decorative').toBe(0)
    expect(one(`select count(*) from public.survey_comments where body = 'skulle ikke vært lagret'`)).toBe('0')
  })
})

describe('C1 — RLS: who reads a comment, and the invariant-4 boundary', () => {
  it('17. an administrator of the owning org reads it', async () => {
    const admin = await adminClient()
    const { data, error } = await admin
      .from('survey_comments')
      .select('id, body')
      .eq('round_id', fx.roundId)
    expect(error, error?.message).toBeNull()
    expect((data ?? []).length, 'the owning org’s administrator reads none of it').toBeGreaterThan(0)
  })

  it('18. an outsider reads nothing at all — and there was something to refuse', async () => {
    // The red run passed this against a missing table: PostgREST errored, `data`
    // was null, and `[] toEqual []` was satisfied by the absence of everything.
    // 5a3 makes exactly this distinction between PROTECTED and PROVEN, and a
    // test that does not make it is measuring the fixture, not the policy.
    const total = Number(one(`select count(*) from public.survey_comments`))
    expect(total, 'no comment exists, so nothing was refused').toBeGreaterThan(0)

    const outsider = await outsiderClient()
    const { data, error } = await outsider.from('survey_comments').select('id')
    expect(error, error?.message).toBeNull()
    expect((data ?? []).length, `outsider saw ${(data ?? []).length} of ${total}`).toBe(0)
  })

  it('19. Q114 condition 2 + invariant 4 — a leser reads ANONYMOUS comments and never a NAMED one', async () => {
    // "On the same footing as the rest of the documentation" means the rules
    // that already exist, not a new grant. CLAUDE.md invariant 4 says a leser
    // gets no named free text, anywhere. Both hold: the thread is documentation
    // a verneombud may read, and a named comment is named free text.
    // NON-VACUITY FIRST, and this one needs BOTH halves: a test that loops over
    // what the leser can see passes when the leser sees nothing, and it also
    // passes when no named comment exists to be refused. The demo seed carries
    // one of each in this org for exactly that reason.
    const named = Number(one(`select count(*) from public.survey_comments where not is_anonymous`))
    expect(named, 'no NAMED comment exists, so nothing was refused').toBeGreaterThan(0)

    const leser = await leserClient()
    const { data, error } = await leser.from('survey_comments').select('id, is_anonymous')
    expect(error, error?.message).toBeNull()
    expect((data ?? []).length, 'the leser saw nothing at all — the loop below is empty').toBeGreaterThan(0)
    for (const row of data ?? []) {
      expect(row.is_anonymous, 'a leser reached a NAMED comment — invariant 4').toBe(true)
    }
  })

  it('20. a comment’s question belongs to the same survey as its round', () => {
    // The A5-1 shape, for this table. `live-round-tenancy.test.ts` derives its
    // sweep from tables carrying BOTH round_id and survey_id; survey_comments
    // carries round_id and question_id, so it falls outside that anchor and is
    // checked here instead rather than being assumed covered.
    //
    // The only writer is submit_response, which matches q.survey_id against the
    // round's survey — but "the only writer does it right" is the assumption
    // this project keeps finding wrong, so it is asserted over the ROWS.
    const stray = one(`
      select count(*)
        from public.survey_comments c
        join public.survey_rounds r on r.id = c.round_id
        join public.survey_questions q on q.id = c.question_id
       where q.survey_id <> r.survey_id`)
    expect(stray, 'a comment points at a question from another survey').toBe('0')
  })

  it('21. survey_comment_replies is reachable only through the comment it answers', async () => {
    // 5a3 requires every RLS table to be NAMED by a test, or it reports the
    // surface protected but UNGUARDED — a real failure, not a warning. This is
    // that test, and it checks the property rather than merely spelling the
    // name: an outsider sees none of the replies the service role can see.
    const total = Number(one(`select count(*) from public.survey_comment_replies`))
    const outsider = await outsiderClient()
    const { data } = await outsider.from('survey_comment_replies').select('id')
    expect((data ?? []).length, `outsider saw ${(data ?? []).length} of ${total}`).toBe(0)

    const anon = anonClient()
    const { data: anonSaw } = await anon.from('survey_comment_replies').select('id')
    expect((anonSaw ?? []).length, 'anon reads replies directly').toBe(0)
  })

  it('22. nobody may UPDATE a comment’s body — a message is not editable by its recipient', async () => {
    // ASSERTED ON THE ROW, NOT ON AN ERROR. There is no UPDATE policy, so the
    // statement matches nothing and PostgREST returns NO error — the first
    // version of this test read that silence as success and would have passed
    // with an update policy that simply failed to match. V1-1's exact trap, and
    // standing question 1: «what ELSE could refuse this before the check I am
    // testing gets a chance?» Here the answer is "nothing refused it; nothing
    // happened", and only the stored value can tell them apart.
    const admin = await adminClient()
    const { data: rows } = await admin
      .from('survey_comments')
      .select('id, body')
      .eq('round_id', fx.roundId)
      .limit(1)
    const row = (rows ?? [])[0]
    expect(row, 'no comment to attempt an edit on').toBeTruthy()
    const before = row!.body

    await admin.from('survey_comments').update({ body: 'noe helt annet' }).eq('id', row!.id)

    const after = one(`select body from public.survey_comments where id = '${row!.id}'`)
    expect(after, 'an administrator rewrote a respondent’s words').toBe(before)
  })
})

describe('C1 — surveys.feedback_mode', () => {
  it('23. the column exists, is NOT NULL, and its CHECK names exactly the four modes', () => {
    expect(
      one(`select is_nullable from information_schema.columns
            where table_schema='public' and table_name='surveys' and column_name='feedback_mode'`),
    ).toBe('NO')
    const check = one(`
      select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.surveys'::regclass and conname = 'surveys_feedback_mode_known'`)
    for (const mode of ['off', 'anonymous', 'named', 'optional']) {
      expect(check, `the CHECK does not admit ${mode}`).toContain(`'${mode}'`)
    }
  })

  it('24. THE BACKFILL — asserted over the migration, because a reset cannot observe it', () => {
    // Tor's correction: a survey already sent without a comment field must not
    // acquire one by migration. Its respondents were invited to something else.
    //
    // **A LIMIT, STATED RATHER THAN PAPERED OVER.** `supabase db reset` runs the
    // migration against an empty schema, so at backfill time there are no
    // surveys and the effect is unobservable at runtime — in CI and on a fresh
    // local stack alike. The only place the property is visible is the
    // migration itself, so that is what is read. It is a weaker check than a
    // row assertion and it is named as one.
    //
    // What it checks is the ORDER that produces the outcome, which is where
    // this goes wrong in practice: `add column ... not null default 'anonymous'`
    // in one statement writes 'anonymous' to every existing row, and the
    // backfill that follows is then a no-op on rows it was meant to fix.
    const sql = readFileSync(MIGRATION, 'utf8')
    const addIdx = sql.search(/alter table public\.surveys\s+add column (if not exists )?feedback_mode/i)
    expect(addIdx, 'the migration does not add surveys.feedback_mode').toBeGreaterThan(-1)
    const addStmt = sql.slice(addIdx, addIdx + sql.slice(addIdx).indexOf(';'))
    expect(addStmt, 'the column is added WITH a default, which backfills every existing row').not.toMatch(
      /default/i,
    )
    const backfill = sql.search(/update public\.surveys[\s\S]{0,200}?feedback_mode\s*=\s*'off'/i)
    expect(backfill, 'no backfill to off').toBeGreaterThan(addIdx)
    const setDefault = sql.search(/alter column feedback_mode set default\s*'anonymous'/i)
    expect(setDefault, 'the default is set before the backfill, or not at all').toBeGreaterThan(backfill)
  })

  it('25. the DEFAULT for new rows is anonymous', () => {
    expect(
      one(`select column_default from information_schema.columns
            where table_schema='public' and table_name='surveys' and column_name='feedback_mode'`),
    ).toMatch(/anonymous/)
  })

  it('26. Q114 condition 1 — a comment is NEVER a precondition of submitting, at any mode', async () => {
    // Written as a property over the modes, not as a check of the one caller we
    // have: every mode, statutory pack or not, accepts a submission with no
    // comments at all.
    for (const mode of ['off', 'anonymous', 'named', 'optional']) {
      const { error: setErr } = await svc
        .from('surveys')
        .update({ feedback_mode: mode })
        .eq('id', fx.surveyId)
      // Non-vacuity: the red run passed this loop on a schema with no such
      // column, because nothing checked that setting the mode had worked.
      expect(setErr, `could not set feedback_mode=${mode}: ${setErr?.message}`).toBeNull()
      const token = fx.tokens[2]!
      const probe = await anonClient().rpc('submit_response', {
        p_token: token,
        p_lang: 'no',
        p_answers: { [fx.questionId]: { value: 3 } },
        p_anon_choice: null,
        p_comments: null,
      } as never)
      expect(probe.error, `${mode}: ${probe.error?.message}`).toBeNull()
      expect(probe.data, `${mode} returned no payload at all`).not.toBeNull()
      // Only the first iteration can succeed — after that the invitation is
      // spent. What must NEVER appear is a refusal that blames the comment.
      const err = (probe.data as { error?: string } | null)?.error ?? null
      expect(
        err === null || err === 'already_responded',
        `mode ${mode} refused a submission with no comment: ${err}`,
      ).toBe(true)
    }
    await svc.from('surveys').update({ feedback_mode: 'anonymous' }).eq('id', fx.surveyId)
  })

  it('27. the column says WHO WRITES IT, in its own comment', () => {
    // CLAUDE.md's standing question, answered in the migration that adds the
    // column rather than in an audit four phases later. Four instances so far,
    // and in three of them the column was READ everywhere — which is why the
    // question is not «is it there» but «who writes it».
    //
    // C2 builds the writer. What C1 owes is that the answer is recorded beside
    // the column, so a reader in C2's absence knows the state is «nothing yet»
    // rather than guessing.
    const c = whole(`
      select col_description('public.surveys'::regclass, a.attnum)
        from pg_attribute a
       where a.attrelid = 'public.surveys'::regclass and a.attname = 'feedback_mode'`)
    expect(c.length, 'surveys.feedback_mode carries no column comment').toBeGreaterThan(0)
    expect(c, 'the comment does not answer «who writes this column?»').toMatch(/writ/i)
  })
})

describe('C1 — a share link has no thread, and the product must not pretend otherwise', () => {
  it('28. a malformed question_id is treated as absent, never as fatal', async () => {
    // The draft cast the client's string straight to uuid, so 'not-a-uuid'
    // would have raised inside the transaction and lost the respondent's real
    // answers. The comment beside it claimed the opposite protection, which is
    // the failure mode worth a test: a defence that exists only in prose.
    const s4 = await createSurvey(fx.orgId, `Feil id ${TAG}`, [{ type: 'scale', text: 'Vel?' }])
    const r4 = await createRound(s4, 1)
    const out = await anonClient().rpc('submit_response', {
      p_token: r4.tokens[0]!,
      p_lang: 'no',
      p_answers: { [s4.questions[0]!.id]: { value: 5 } },
      p_anon_choice: null,
      p_comments: [{ question_id: 'ikke-en-uuid', text: 'lagres uten spørsmål' }],
    } as never)
    expect(out.error, out.error?.message).toBeNull()
    expect((out.data as { ok?: boolean }).ok, 'the submission was lost over a stray field').toBe(true)
    expect(
      one(`select coalesce(question_id::text,'null') from public.survey_comments
            where body = 'lagres uten spørsmål'`),
      'a malformed id was stored rather than dropped',
    ).toBe('null')
    // And the answer it came with survived.
    expect(one(`select count(*) from public.responses where round_id = '${r4.id}'`)).toBe('1')
  })

  it('29. a share-link submission can carry a comment, and that comment has no invitation', async () => {
    const sub = await submit(fx.shareToken, {
      comments: [{ question_id: null, text: 'fra en delt lenke' }],
    })
    expect(sub.error, sub.error?.message).toBeNull()
    // `response_id` was in this query and is not in the table — the design
    // changed under it (see the migration header) and the query did not. psql
    // errored, which is the loud failure a schema-shaped assertion should have.
    const row = psql(`
      select invitation_id is null, question_id is null
        from public.survey_comments where body = 'fra en delt lenke'`)
    expect(row.length, 'the share-link comment was not written').toBe(1)
    expect(row[0]![0], 'a share link produced an invitation from nowhere').toBe('t')
  })

  it('30. and the token that wrote it reads NOTHING back — there is no thread to read', async () => {
    const read = await readThread(fx.shareToken)
    expect(read.error).toBeNull()
    const d = read.data as { comments?: unknown[]; thread?: boolean }
    expect(
      (d.comments ?? []).length,
      'a share link read a thread it cannot own — every share-link holder is the same principal',
    ).toBe(0)
  })
})
