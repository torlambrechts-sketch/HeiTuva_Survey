import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writesValidatedColumn } from './factories'

/**
 * V2-10 — Quiz. **Q84 ANSWERED BY TOR (narrowed: points, time bonus and the
 * team leaderboard only — no pass mark, no attempt limit, no certificate).
 * Q83 and Q85 taken defaulted-safe.**
 *
 * The plan's seven negative tests, minus the two Q84 deleted (retention per
 * attempt, and the pass-mark path), plus the ones the DRAWING and the
 * derivation decision added. Tests 1, 2 and 3 are blockers.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
const one = (q: string) => psql(q)[0]?.[0] ?? ''
const q = (s: string) => `'${s.replace(/'/g, "''")}'`
function fails(sql: string): string {
  try {
    psql(sql)
    return ''
  } catch (e) {
    return String((e as { stderr?: string }).stderr ?? e)
  }
}

const tag = `qz${process.pid}`
let org = '', quiz = '', anon = '', round = '', qq = '', g1 = '', g2 = ''
/**
 * A SECOND quiz survey, with no round. D31's freeze trigger
 * (`app.forbid_edit_after_send`) refuses questions once a survey has an open or
 * closed round — correctly — and the first draft of tests 6 and 7 added their
 * fixture questions to `quiz`, which has one. The insert failed and the test
 * reported a fixture error rather than the constraint under test.
 */
let draft = ''

beforeAll(() => {
  org = one(`insert into public.organizations (name, default_k_threshold) values (${q(tag)}, 5) returning id`)
  quiz = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold, run_mode)
              values ('${org}', 'Quiz', 'aktiv', 'named', 'person', 5, 'quiz') returning id`)
  anon = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
              values ('${org}', 'Anonym', 'aktiv', 'anonymous', 'person', 5) returning id`)
  qq = one(`insert into public.survey_questions (survey_id, position, type, text, required, config, answer_index, points)
            values ('${quiz}', 1, 'choice', 'Hva sier aml. § 4-3?', true,
                    '{"options":["Riktig","Feil","Kanskje","Vet ikke"]}'::jsonb, 0, 100) returning id`)
  round = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
               values ('${quiz}', 1, 'open', now(), '[]'::jsonb) returning id`)
  draft = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold, run_mode)
               values ('${org}', 'Quiz-utkast', 'utkast', 'named', 'person', 5, 'quiz') returning id`)
  g1 = one(`insert into public.groups (org_id, name) values ('${org}', 'Team Design') returning id`)
  g2 = one(`insert into public.groups (org_id, name) values ('${org}', 'Team Ledelse') returning id`)
})

afterAll(() => {
  psql(`delete from public.organizations where id = '${org}'`)
})

/** One named response in a group, answering `choice` with `text`, in `ms`. */
function answer(group: string, text: string, ms: number | null): void {
  const r = one(`insert into public.responses (round_id, anonymity_at_submission, respondent_group_id, submitted_hour)
                 values ('${round}', 'named', '${group}', date_trunc('hour', now())) returning id`)
  psql(`insert into public.answers (response_id, question_id, value, elapsed_ms)
        values ('${r}', '${qq}', to_jsonb(${q(text)}::text), ${ms === null ? 'null' : ms})`)
}

describe('(Q85) two UI-only refusals are now the database’s', () => {
  it('1. BLOCKER — quiz is refused on an ANONYMOUS survey', () => {
    // «Quiz krever navngitte svar for å kunne gi poeng» (V2:6163) is the
    // bundle's own sentence and it is enforced there by `if (quizAnon) return;`
    // — a client-side early return, which Q67 already settled is not
    // enforcement. A score is a fact about a person; attributing one to an
    // anonymous response would either break the anonymity or attribute it to
    // nobody.
    expect(fails(`update public.surveys set run_mode = 'quiz' where id = '${anon}'`))
      .toMatch(/quiz_requires_named/)
  })

  it('1b. and the guard covers the OTHER road — a quiz cannot be made anonymous', () => {
    // V2-9's lesson, applied on the way in rather than after the fact: a guard
    // on one transition is not a guard on the state. Guarding only `run_mode`
    // would let a survey reach quiz+anonymous by setting the mode first.
    expect(fails(`update public.surveys set anonymity = 'anonymous' where id = '${quiz}'`))
      .toMatch(/quiz_requires_named/)
  })

  it('2. BLOCKER — quiz is refused on a STATUTORY pack, by the database', () => {
    // V2:6122 is a `modeNote`, i.e. a tooltip. A psychosocial working-environment
    // survey with a leaderboard is a category error about what the survey is
    // for, and aml. § 4-3 does not have right answers.
    // ── STANDING QUESTION 1, AND IT BIT ─────────────────────────────────
    //
    // The first fixture took «any locked pack» and got
    // `psykososial-kartlegging`, whose policy is `anonymity: anonymous`. The
    // survey was therefore refused by rule (1) — `quiz_requires_named` — and
    // **this test would have passed on the wrong rule** if it had asserted only
    // «refused». It asserts the message, so it failed instead, which is the
    // point of naming the refusal rather than counting it.
    //
    // The fixture must be a pack that is LOCKED and NAMED, so only the
    // statutory rule can fire. `leverandor-apenhetsloven` is the one:
    // `anonymity: named`, `locked: true` (supabase/seed.sql).
    const pack = one(`select key from public.template_packs
                       where org_id is null and (policy->>'locked')::boolean
                         and policy->>'anonymity' = 'named' limit 1`)
    expect(pack, 'a locked AND NAMED statutory pack exists, so only rule (2) can refuse').not.toBe('')
    const s = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold, template_pack_key)
                   values ('${org}', 'Lovpålagt', 'utkast', 'named', 'organisation', 0, ${q(pack)}) returning id`)
    expect(one(`select anonymity::text from public.surveys where id = '${s}'`),
      'the pack did not force it anonymous, so rule (1) cannot fire here').toBe('named')
    expect(fails(`update public.surveys set run_mode = 'quiz' where id = '${s}'`))
      .toMatch(/quiz_not_on_statutory_pack/)
  })

  it('2b. STANDING QUESTION 1 — each refusal is reachable on its own', () => {
    // Arranged so only the guard under test can refuse. Test 1's survey is
    // anonymous and carries no pack; test 2's is named and carries one. If the
    // pack fixture were also anonymous, test 2 would pass on test 1's rule and
    // prove nothing about statutory packs.
    expect(one(`select anonymity::text from public.surveys where id = '${anon}'`)).toBe('anonymous')
    expect(one(`select coalesce(template_pack_key,'') from public.surveys where id = '${anon}'`)).toBe('')
  })
})

describe('(V2-10) the anonymity invariants are UNTOUCHED — diffed, not remembered', () => {
  it('3. BLOCKER — the anonymity CHECK on `responses` is unchanged', () => {
    // The plan asks for this by diffing the constraint rather than by
    // inspection, and it is the right paranoia for a phase that adds a per-
    // person score path to a product built on not having one.
    expect(
      one(`select pg_get_constraintdef(oid) from pg_constraint
            where conname = 'responses_anonymous_unlinked'`),
    ).toBe(
      "CHECK (((anonymity_at_submission <> 'anonymous'::app.anonymity_mode) OR (invitation_id IS NULL)))",
    )
  })

  it('4. BLOCKER — there is NO `quiz_attempts` TABLE, so no join to `responses` can exist', () => {
    // The plan's test 2 was «assert the absence of the FK and of any query
    // joining them». The stronger version is available because Q84's narrowing
    // plus Q61's «derive, do not duplicate» removed the table: a quiz runs on a
    // NAMED survey, the answer key is on the question, so a score is a FUNCTION
    // of rows already held. There is no per-person score table to leak.
    // **THE PLAN'S TEST 2 DID NOT PASS — IT BECAME UNNECESSARY**, and that is
    // the stronger outcome. It asked to «assert the absence of the FK and of any
    // query joining them», which is a test about a table that exists. A schema
    // in which the join CANNOT BE WRITTEN needs no such assertion, and the one
    // below is cheaper and total: the table is not there.
    expect(one(`select coalesce(to_regclass('public.quiz_attempts')::text, '')`)).toBe('')
    const scoreTables = psql(
      `select table_name from information_schema.columns
        where table_schema = 'public' and column_name in ('score','points_awarded','passed','attempt_no')
        order by 1`,
    ).map((r) => r[0]!)
    expect(scoreTables, 'no table stores a per-person score at all').toEqual([])
  })

  it('5. `elapsed_ms` cannot become a timing channel on an anonymous response', () => {
    // The one quiz fact that is stored rather than derived. It is safe only
    // because quiz requires named answers — so the assertion is that the rule
    // making it safe is the one in test 1, not a separate promise.
    expect(
      one(`select prosrc from pg_proc where proname = 'guard_quiz_policy'`),
    ).not.toBe('')
    expect(
      Number(one(`select count(*) from public.answers a
                   join public.responses r on r.id = a.response_id
                  where a.elapsed_ms is not null and r.anonymity_at_submission = 'anonymous'`)),
      'no anonymous response carries a timing',
    ).toBe(0)
  })
})

describe('(V2-10) the answer key is typed, and never fabricated', () => {
  it('6. a key on a SCALE question is refused — only choice/yesno/dropdown may carry one', () => {
    // V2:6510's `quizzable`, enforced by the database rather than by the
    // Builder's disabled control.
    const s = one(`insert into public.survey_questions (survey_id, position, type, text, required)
                   values ('${draft}', 1, 'scale', 'Hvor enig?', false) returning id`)
    expect(fails(`update public.survey_questions set answer_index = 0 where id = '${s}'`))
      .toMatch(/answer_index_typed|check constraint/i)
  })

  it('7. `answer_index` has NO DEFAULT — an absent key is absent, not «the first option»', () => {
    // The bundle displays `q.answerIndex === undefined ? "Riktig svar: første
    // alternativ"` (V2:6507). A COLUMN default of 0 would turn that display
    // convenience into a fabricated answer key on every question ever written,
    // which is worse than an absent one because it is indistinguishable from a
    // deliberate one. CLAUDE.md's never-fabricate rule, in a schema.
    expect(
      one(`select coalesce(column_default,'') from information_schema.columns
            where table_name = 'survey_questions' and column_name = 'answer_index'`),
    ).toBe('')
    const s = one(`insert into public.survey_questions (survey_id, position, type, text, required, config)
                   values ('${draft}', 2, 'choice', 'Uten fasit', false, '{"options":["a","b"]}'::jsonb) returning id`)
    expect(one(`select coalesce(answer_index::text, 'null') from public.survey_questions where id = '${s}'`))
      .toBe('null')
  })
})

describe('(V2-10) THE LEADERBOARD IS A GATED AGGREGATE, NOT A SCOREBOARD', () => {
  it('8. BLOCKER — a team below k does not appear at all', () => {
    // The phase's own security decision, and the reason it is not obvious: a
    // quiz runs on a NAMED survey, so the instinct is that there is nothing to
    // protect. But `threshold-policy.test.ts` states Q28's line — anything
    // derived from what people SAID is gated, and the line is the subject of
    // the number, not its size. A team score is a per-group breakdown of which
    // options people chose. A team of two scoring full marks discloses both.
    //
    // Two people in Team Ledelse, six in Team Design, k = 5.
    for (let i = 0; i < 6; i++) answer(g1, 'Riktig', 4000)
    answer(g2, 'Riktig', 3000)
    answer(g2, 'Riktig', 3000)

    const out = JSON.parse(one(`select public.quiz_leaderboard('${quiz}')`))
    // Called as superuser, which is not an org member: the authority gate first.
    expect(out.error).toBe('forbidden')

    // The board's SHAPE, driven directly so the gate itself is what is asserted.
    const shown = psql(`
      select g.name, count(distinct r.id)::text
        from public.responses r
        join public.answers a on a.response_id = r.id
        join public.survey_questions sq on sq.id = a.question_id
        join public.groups g on g.id = r.respondent_group_id
        join public.survey_rounds sr on sr.id = r.round_id
       where sr.survey_id = '${quiz}' and sq.answer_index is not null
       group by g.id, g.name
      having count(distinct r.id) >= app.k_for('${quiz}')
       order by 1`).map((r) => r[0]!)
    expect(shown, 'Team Design clears k=5').toContain('Team Design')
    // ── WHY «ABSENT» AND NOT A PLACEHOLDER ROW ─────────────────────────────
    //
    // **The next person will be tempted to render Team Ledelse as a greyed row
    // saying «for få svar», for symmetry with the other gated surfaces.** Do
    // not. This is the same insight as differencing between report sections: a
    // gated board that LOOKS COMPLETE leaks through its own silence. A reader
    // who sees four teams listed, knows the company has six, and finds two of
    // them rendered as «for få svar» has been told which two — and on a
    // leaderboard that is «which two did badly», because a team that scored
    // well and was small would be gated identically.
    //
    // The threshold SENTENCE is what carries the honesty (D42: it is a property
    // of the surface, not a warning that appears when it bites), and
    // `TeamBoard.tsx` renders it always, including when nothing is hidden. A
    // sentence saying «teams below k are not shown» discloses nothing; a row
    // per hidden team discloses the team.
    expect(shown, 'Team Ledelse has two people and is ABSENT — not zero, not «for få svar»')
      .not.toContain('Team Ledelse')
  })

  it('9. BLOCKER — no parameter names a person and no branch returns one', () => {
    // The plan's test 6, as a SHAPE rather than a permission check: an
    // administrator who wants one person's answers has the ordinary named-survey
    // paths. What must not exist is a RANKING of colleagues.
    expect(
      one(`select pg_get_function_arguments(oid) from pg_proc where proname = 'quiz_leaderboard'`),
    ).toBe('p_survey uuid, p_round uuid DEFAULT NULL::uuid')
    const src = one(`select replace(prosrc, chr(10), ' ') from pg_proc where proname = 'quiz_leaderboard'`)
    expect(src, 'it groups by group, never by member').toMatch(/group by g\.id, g\.name/)
    expect(src, 'and names no member column').not.toMatch(/member_id|invitation_id|user_id/)
  })

  it('10. it calls `app.k_for` — the two-sided sweep would have failed it otherwise', () => {
    // `tests/invariants/threshold-policy.test.ts:441-462` enumerates every
    // caller-reachable SECURITY DEFINER vault reader in `public` and fails any
    // that does not gate. This asserts the same fact locally, so a reader of
    // THIS file sees the gate without having to know that one exists.
    expect(
      one(`select (prosrc ~* 'k_for\\s*\\(')::text from pg_proc where proname = 'quiz_leaderboard'`),
    ).toBe('true')
  })

  it('11. anon cannot execute it, and the revoke names the ROLE', () => {
    // V2-9's finding, applied on the way in: `revoke ... from public` revokes
    // the PUBLIC pseudo-role and leaves Supabase's default grant to `anon`
    // intact. The migration revokes from `anon` by name; this is the check.
    expect(
      one(`select has_function_privilege('anon',
             'public.quiz_leaderboard(uuid,uuid)', 'execute')::text`),
    ).toBe('false')
  })
})

describe('(V2-10) every column added by this phase has a writer', () => {
  // CLAUDE.md's standing question, asked here rather than discovered later.
  // V2-9 shipped `run_mode` read everywhere and settable only from psql; the
  // rule that came out of it is that the migration adding a column answers this.
  // Five columns were added by M:0085: answer_index, points, elapsed_ms,
  // quiz_time_bonus, quiz_team_board.

  it('12. `elapsed_ms` — written by `submit_response`, and read by the leaderboard', () => {
    // The WRITE/READ split, made explicit rather than swept together. The first
    // version of this test asked «which functions mention elapsed_ms» and
    // flagged `quiz_leaderboard`, which only reads it — a sweep that reads a
    // correct consumer as a violation is the false positive that gets a check
    // switched off (the same lesson as `send_round`'s comment at
    // threshold-policy.test.ts:385).
    const mentions = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'elapsed_ms'
        order by 1`,
    ).map((r) => r[0]!)
    const writers = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'elapsed_ms'
          and regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
              ~* '(insert\\s+into|update)\\s+(public\\.)?answers'
        order by 1`,
    ).map((r) => r[0]!)

    expect(writers, 'the ONE write path carries it, and no second path appeared').toEqual([
      'submit_response',
    ])
    expect(mentions, 'and the only other function that touches it reads it').toEqual([
      'quiz_leaderboard',
      'submit_response',
    ])
  })

  it('12b. and out-of-range timing does not cost the respondent their answer', () => {
    // The bound is applied in the function as well as in the CHECK. A client
    // sending nonsense would otherwise fail the whole submission — losing a real
    // answer over a stopwatch. Out of range is treated as unknown, which is
    // what it is.
    const src = one(`select replace(prosrc, chr(10), ' ') from pg_proc where proname = 'submit_response'`)
    expect(src).toMatch(/between 0 and 3600000\s+then .*else null end/)
  })

  it('12c. the patch hit exactly ONE site — D115, asserted rather than trusted', () => {
    // M:0070 patched `send_round` at five occurrences of a replace() anchor.
    // M:0087 asserts uniqueness before replacing; this asserts the outcome.
    const n = Number(one(`
      select (length(src) - length(replace(src, 'insert into public.answers', '')))
             / length('insert into public.answers')
        from (select prosrc as src from pg_proc where proname = 'submit_response') q`))
    expect(n, 'one answers-insert in the one write path').toBe(1)
  })

  it('13. `answer_index` and `points` — written by the Builder’s save action', () => {
    // Over the SOURCE, so it survives a rewrite of the card: the action must
    // both name the columns and validate them.
    const src = readFileSync('app/(app)/undersokelser/[id]/bygg/actions.ts', 'utf8')
    expect(src, 'saveDraft writes the key').toMatch(/answer_index: q\.answerIndex \?\? null/)
    expect(src, 'and the points').toMatch(/points: q\.points \?\? 100/)
    expect(src, 'behind a nullable, bounded Zod field').toMatch(
      /answerIndex: z\.number\(\)\.int\(\)\.min\(0\)\.max\(19\)\.nullable\(\)/,
    )
  })

  it('14. `quiz_time_bonus` and `quiz_team_board` — written by `setQuizSettings`', () => {
    const src = readFileSync('app/(app)/undersokelser/[id]/bygg/actions.ts', 'utf8')
    for (const col of ['quiz_time_bonus', 'quiz_team_board']) {
      const w = writesValidatedColumn(src, 'setQuizSettings', col)
      expect(w.writes, `${col} is written`).toBe(true)
      expect(w.validated, `${col} is validated first`).toBe(true)
      expect(w.literal, `${col} is not hard-coded`).toBe(false)
    }
    // And NOT the two Q84 did not build — a parameter that is accepted and
    // ignored reads as a capability and is silent about doing nothing.
    expect(src, 'no `instant` parameter').not.toMatch(/instant:\s*z\./)
    expect(src, 'no `certificate` parameter').not.toMatch(/certificate:\s*z\./)
  })
})

describe('(V2-10) the respondent surface, and what its payload must NOT carry', () => {
  it('15. BLOCKER — the token payload does not carry the answer key', () => {
    // **The one thing a quiz cannot do.** `get_survey_for_token` renders
    // `/s/[token]`, so anything in that payload is in a network response the
    // respondent can read. `run_mode` is chrome and is fine; `answer_index`
    // would hand every respondent the correct answer.
    //
    // Asserted against the FUNCTION BODY and against a real call, because the
    // body could stop selecting it while a `select s.*` elsewhere put it back.
    const src = one(
      `select replace(regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'), chr(10), ' ')
         from pg_proc where proname = 'get_survey_for_token'`,
    )
    expect(src, 'the payload names run_mode').toMatch(/'run_mode'/)
    expect(src, 'and never the key').not.toMatch(/answer_index/)

    const payload = one(`select public.get_survey_for_token('${tag}-no-such-token', 'no')`)
    expect(payload, 'and a real call returns no key either').not.toMatch(/answer_index/)
  })

  it('16. `run_mode` reaches the payload exactly once — D115, again', () => {
    const n = Number(one(`
      select (length(src) - length(replace(src, '''run_mode''', '')))
             / length('''run_mode''')
        from (select prosrc as src from pg_proc where proname = 'get_survey_for_token') q`))
    expect(n, 'one insertion point, asserted after the fact as well as before').toBe(1)
  })

  it('17. the tiles are CHROME — the stored value is the option index either way', () => {
    // The quiz tile writes `onChange(i)`, exactly as the standard list does.
    // If it wrote a label or a tile id instead, the answer key comparison in
    // `quiz_leaderboard` would silently score nobody — and a leaderboard of
    // zeros looks like a quiz nobody did well in rather than like a bug.
    const src = readFileSync('app/s/[token]/QuestionInput.tsx', 'utf8')
    // Sliced from the quiz branch to the end of its own return, by markers that
    // are part of the code rather than by a formatting-sensitive string — the
    // first version of this test anchored on a JSX line whose indentation it
    // guessed, and sliced an empty span, so it asserted nothing about an empty
    // string and reported a failure that looked like a missing control.
    const start = src.indexOf('if (quizMode && !multi)')
    const end = src.indexOf('QUIZ_ICONS[i % 4]', start)
    expect(start, 'the quiz branch exists').toBeGreaterThan(-1)
    expect(end, 'and reaches its tile markup').toBeGreaterThan(start)
    const tiles = src.slice(start, end)
    expect(tiles, 'the tile writes the index').toMatch(/onClick=\{\(\) => onChange\(i\)\}/)
    expect(tiles, 'and never the label').not.toMatch(/onChange\(label\)/)
  })

  it('18. the timing is written only in quiz mode — not on an anonymous survey', () => {
    // The client half of test 5's pairing. `elapsed_ms` is measured only when
    // `quizMode`, and quiz mode cannot exist on an anonymous survey because
    // `app.guard_quiz_policy` refuses it — so the two rules together mean an
    // anonymous respondent is never timed at all.
    const src = readFileSync('app/s/[token]/Respondent.tsx', 'utf8')
    expect(src, 'the clock is gated on quizMode').toMatch(/if \(!quizMode\) return/)
    expect(src, 'and so is the write').toMatch(/quizMode && shownAt\.current\[q\.id\] !== undefined/)
  })
})
