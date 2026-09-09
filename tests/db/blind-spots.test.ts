import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * V2-5 — tasks from a survey's blind spots. DECISIONS **Q72 CONFIRMED**, and
 * **Q98** and **Q99 DEFAULTED, not answered** (see the Gate 6 report, which is
 * where they get reviewed).
 *
 * ── THE TRIGGER IS THE DECISION, NOT THE WORDING ────────────────────────────
 *
 * Q72's drafted option was a task saying «undersøkelsesplikt utløst for denne
 * undersøkelsen», naming no group. **It still leaked by elimination**: groups
 * A(12), B(9), C(4), with A and B visible and healthy, tells the reader that C
 * scored badly. The predicate was still over a gated value, merely wrapped.
 *
 * So the condition that fires a task is NOT «a finding below threshold». It is
 *
 *     this survey has an AUDIENCE GROUP whose SIZE is below app.k_for(survey)
 *
 * — a count of people, which Q28 expressly permits, and a property of the
 * AUDIENCE rather than of the responses. Changing the trigger REMOVES the
 * predicate instead of hiding it.
 *
 * ── TEST 3 IS THE PHASE, AND ITS FORM MATTERS MORE THAN ITS EXISTENCE ───────
 *
 * Written as «the generator does not call `aggregate_results`» it is a SYMPTOM
 * test: it would miss a generator reading `responses` directly, or calling an
 * RPC added next year. V1-6's first rule — the derivation must describe the
 * PROPERTY, not a symptom of it — and the exact shape that failed there, where a
 * sweep required `send_at_local` in the body and so swept only the functions
 * that already knew about the column.
 *
 * So test 3 walks the generator's REACHABLE CALL GRAPH out of `pg_proc` and
 * fails if anything in it touches `responses` or `answers`. A future path nobody
 * thought of fails by construction, which is the only version worth having.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
function one(query: string): string {
  return psql(query)[0]?.[0] ?? ''
}

const tag = `bs${process.pid}`
const orgs: string[] = []

/**
 * A survey with `sizes.length` groups of the given sizes, k = 5.
 * `score` decides what every member answers — the point of test 2 is that it
 * changes nothing.
 */
function makeSurvey(label: string, sizes: number[], score: number) {
  const org = one(`insert into public.organizations (name, default_k_threshold)
                   values ('${tag}-${label}', 5) returning id`)
  orgs.push(org)
  const survey = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
                      values ('${org}', 'Kartlegging ${label}', 'aktiv', 'anonymous', 'person', 5)
                      returning id`)
  const q = one(`insert into public.survey_questions (survey_id, position, type, text, required)
                 values ('${survey}', 1, 'scale', 'Trives du?', true) returning id`)
  const round = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
                     values ('${survey}', 1, 'open', now(), '[]'::jsonb) returning id`)
  const groups: string[] = []
  sizes.forEach((n, i) => {
    const g = one(`insert into public.groups (org_id, name) values ('${org}', 'Gruppe ${i}-${label}') returning id`)
    groups.push(g)
    for (let j = 0; j < n; j++) {
      one(`insert into public.org_members (org_id, group_id, email, name, role, status)
           values ('${org}', '${g}', 'm${i}-${j}-${label}@${tag}.test', 'M', 'leser', 'active') returning id`)
      const r = one(`insert into public.responses
                       (round_id, anonymity_at_submission, invitation_id, respondent_group_id, lang, submitted_hour)
                     values ('${round}', 'anonymous', null, '${g}', 'no', date_trunc('hour', now()))
                     returning id`)
      psql(`insert into public.answers (response_id, question_id, value)
            values ('${r}', '${q}', '${score}'::jsonb)`)
    }
  })
  return { org, survey, round, groups }
}

function tasksFor(survey: string): string[][] {
  return psql(`select id, title, kind, law_ref, source_kind, coalesce(source_ref::text,'')
                 from public.tasks where source_ref = '${survey}'`)
}

afterAll(() => {
  for (const o of orgs) psql(`delete from public.organizations where id = '${o}'`)
  psql(`delete from auth.users where email like '%@${tag}.test'`)
})

describe('(Q72) the blind-spot generator fires on audience size, never on a finding', () => {
  it('2. a task IS produced when a group is smaller than k — EVEN THOUGH EVERY GROUP SCORES WELL', () => {
    // The test that forces the trigger to read audience size rather than
    // responses, and the one that would have caught the drafted option. Score 5
    // of 5 everywhere: nothing is wrong, and the duty still applies.
    const f = makeSurvey('good', [12, 9, 4], 5)
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    const rows = tasksFor(f.survey)
    expect(rows.length, 'one task for the survey with a sub-threshold group').toBe(1)
    expect(rows[0]![2], 'kind').toBe('undersokelsesplikt')
  })

  it('2b. and NO task when every group reaches k, however badly they score', () => {
    // The other half of the same property. Score 1 of 5 everywhere — every
    // finding is terrible — and there is no blind spot, so there is no task.
    // Without this, a generator that fired unconditionally would pass 2.
    const f = makeSurvey('bad', [12, 9, 8], 1)
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    expect(tasksFor(f.survey).length, 'no group is invisible, so no blind spot').toBe(0)
  })

  it('1. the produced row carries no group name, no question text, no score, no derived value', () => {
    // Standing question 3: assert over the SET — every field that reaches a
    // reader — not the ones I happened to pick. And guarded on the task
    // EXISTING, because «the body has no group name» is satisfied by no body.
    const f = makeSurvey('payload', [11, 3], 4)
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    const rows = tasksFor(f.survey)
    expect(rows.length, 'the task exists — otherwise this test proves nothing').toBe(1)

    const groupNames = psql(`select name from public.groups where org_id = '${f.org}'`).map((r) => r[0]!)
    const questionText = one(`select text from public.survey_questions where survey_id = '${f.survey}'`)

    // Every column of the row, as one string — so a value added later is
    // covered without editing this test.
    const whole = one(`select to_jsonb(t)::text from public.tasks t where t.source_ref = '${f.survey}'`)
    for (const name of groupNames) {
      expect(whole, `the group name «${name}» must not appear anywhere in the row`).not.toContain(name)
    }
    expect(whole, 'no question text').not.toContain(questionText)
    // No score and no count: the sizes are 11 and 3, and «3» must not be in the
    // row as a number the reader could subtract with. Checked as a word
    // boundary so a uuid containing the digit does not false-positive.
    expect(
      /(^|[^0-9a-f])3([^0-9a-f]|$)/.test(whole.replace(/"[0-9a-f-]{36}"/g, '"uuid"')),
      'no group size in the payload',
    ).toBe(false)
  })

  it('3. THE PHASE: nothing in the generator’s reachable call graph reads responses or answers', () => {
    // Catalogue-derived, in the shape `tests/invariants/threshold-policy.test.ts`
    // already uses. Walk the call graph transitively out of `pg_proc.prosrc`
    // rather than naming the functions the generator happens to call today.
    const reached = psql(`
      with recursive callee as (
        select p.oid, p.proname, p.prosrc
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'app' and p.proname = 'generate_blind_spot_tasks'
        union
        select p2.oid, p2.proname, p2.prosrc
          from callee c
          join pg_proc p2 on p2.prosrc is not null
          join pg_namespace n2 on n2.oid = p2.pronamespace
         where n2.nspname in ('app','public')
           and p2.oid <> c.oid
           and c.prosrc ~ ('\\m' || p2.proname || '\\M')
      )
      select proname from callee
       where regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ '\\mresponses\\M'
          or regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ '\\manswers\\M'
       order by 1`).map((r) => r[0]!)

    expect(
      Number(one(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'app' and p.proname = 'generate_blind_spot_tasks'`)),
      'the generator exists — a call-graph walk over nothing passes for free, ' +
        'which is D110 case 4 arriving as a query',
    ).toBe(1)
    expect(
      reached,
      'a function reachable from the generator reads gated data. The trigger must be a ' +
        'property of the AUDIENCE, not of the responses — Q72. Adding an allowlist here ' +
        'would be re-hiding the predicate rather than removing it.',
    ).toEqual([])
  })

  it('3b. and the call graph walk is not vacuous — it finds a known reader when pointed at one', () => {
    // A catalogue test that enumerates nothing passes for free, which is D110's
    // case 4 arriving as a query. Point the same walk at `close_round`, which
    // provably reaches the aggregate body, and require a non-empty answer.
    const reached = psql(`
      with recursive callee as (
        select p.oid, p.proname, p.prosrc
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'close_round'
        union
        select p2.oid, p2.proname, p2.prosrc
          from callee c
          join pg_proc p2 on p2.prosrc is not null
          join pg_namespace n2 on n2.oid = p2.pronamespace
         where n2.nspname in ('app','public')
           and p2.oid <> c.oid
           and c.prosrc ~ ('\\m' || p2.proname || '\\M')
      )
      select proname from callee
       where regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ '\\mresponses\\M'
          or regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ '\\manswers\\M'`).map((r) => r[0]!)
    expect(reached.length, 'the walk does reach readers when they are there').toBeGreaterThan(0)
  })

  it('(Q98 DEFAULTED) firing twice for the same round produces one task, not two', () => {
    // DEFAULT TAKEN: fire at SEND, once per round, de-duplicated on
    // (survey, round). Not nightly, not on audience edit. Defaulted rather than
    // answered — named as such in the Gate 6 report.
    const f = makeSurvey('dedup', [11, 2], 4)
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    expect(tasksFor(f.survey).length, 'de-duplicated').toBe(1)
  })

  it('(Q99 DEFAULTED) a group growing past k does NOT close the task', () => {
    // DEFAULT TAKEN: no auto-close. A person closes it, with an assessment —
    // which is V2-4's guard, and the reason is that a blind spot having gone
    // away is not the same as somebody having looked.
    const f = makeSurvey('grow', [11, 2], 4)
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    const before = tasksFor(f.survey)
    expect(before.length).toBe(1)

    const small = f.groups[1]!
    for (let j = 0; j < 6; j++) {
      psql(`insert into public.org_members (org_id, group_id, email, name, role, status)
            values ('${f.org}', '${small}', 'grow${j}@${tag}.test', 'G', 'leser', 'active')`)
    }
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    expect(
      one(`select status from public.tasks where id = '${before[0]![0]}'`),
      'still open — closing it is a person’s act, not a size change',
    ).toBe('foreslatt')
  })

  it('the task’s law_ref comes from the duty registry, not from a string on the task', () => {
    // Q70's rule, one phase on: data-not-code. A generator writing Norwegian
    // into `law_ref` would make the fourth statutory duty untranslatable.
    const f = makeSurvey('law', [11, 3], 4)
    psql(`select app.generate_blind_spot_tasks('${f.survey}')`)
    const ref = one(`select law_ref from public.tasks where source_ref = '${f.survey}'`)
    // AND THE COLUMN IS A KEY, NOT THE DISPLAY TEXT — which is how the schema
    // enforces Q70 rather than leaving it to review. `M:0070` wrote the law's
    // Norwegian into it and `tasks_law_ref_fkey` refused the insert. The label
    // is resolved from the registry at render time, so a fifth duty is a row.
    expect(
      Number(one(`select count(*) from public.duty_definitions where key = '${ref}'`)),
      'law_ref is a duty_definitions KEY',
    ).toBe(1)
    expect(ref, 'and not Norwegian prose').not.toMatch(/[ÆØÅæøå§]| /)
  })

  it('(Q98) SEND fires it — and the call appears in `send_round` exactly ONCE', () => {
    // THE FIX PASS'S OWN FINDING. `M:0070` patched send_round with
    // `replace(src, '  return jsonb_build_object(', …)`, and replace() replaces
    // EVERY occurrence — there are five, four of them error paths where
    // `v_round` is not yet selected. Worse, I had wrapped the call in
    // `exception when others then null` so a missing prompt could never fail a
    // send: **the defence turned a wrong patch into a silent one**, and every
    // gate stayed green over it.
    //
    // Found by asking why the demo seed produced no generated task — CLAUDE.md's
    // own warning read forwards: the seed reaches only states the current code
    // creates, so a state absent from it is a state no gate has seen.
    const body = one(`select regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'send_round'`)
    void body
    const calls = Number(one(`
      select (length(src) - length(replace(src, 'generate_blind_spot_tasks', ''))) 
             / length('generate_blind_spot_tasks')
        from (select regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') as src
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'send_round') q`))
    expect(calls, 'exactly one call site, on the success path').toBe(1)

    // The catch-all half of this finding MOVED to
    // `tests/db/catalogue-invariants.test.ts`, and moved deliberately: scoped to
    // `send_round` it was a LIST of one — the same shape as the defence it was
    // written about. It now sweeps every function in `app` and `public`, so the
    // next handler like mine fails a test in the commit that adds it rather
    // than in the phase that trips over it. See D115.
  })
})
