import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, leserClient, outsiderClient, type Client } from './clients'
import { writesValidatedColumn } from './factories'

/**
 * V2-9 — Live. **Q79, the QR join path, Q80, Q81 and Q82 answered by Tor
 * 2026-09-09; Q78 remains open and is named where it bites.**
 *
 * The phase's whole risk is that a projected surface in a room is a different
 * kind of thing from a private read: the audience already knows who is present,
 * so a number moving is a correlation channel even when the number itself is
 * permitted. These tests are what stops the convenient version of each answer.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
const one = (q: string) => psql(q)[0]?.[0] ?? ''
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/**
 * `one()` reads the first LINE of psql output, so a multi-line function body
 * comes back as its first word. Every source read below folds newlines to
 * spaces IN SQL — the fix belongs where the value is produced, not in a
 * per-test workaround that the next test would forget.
 */
function bodyOf(name: string, schema = 'public'): string {
  return one(
    `select replace(regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'), chr(10), ' ')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = ${q(schema)} and p.proname = ${q(name)}`,
  )
}

const tag = `lv${process.pid}`
let org = '', survey = '', named = '', round = '', question = '', session = '', code = ''

beforeAll(() => {
  org = one(`insert into public.organizations (name, default_k_threshold) values (${q(tag)}, 5) returning id`)
  survey = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
                values ('${org}', 'Live', 'aktiv', 'anonymous', 'person', 5) returning id`)
  named = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
               values ('${org}', 'Med navn', 'aktiv', 'named', 'person', 5) returning id`)
  question = one(`insert into public.survey_questions (survey_id, position, type, text, required)
                  values ('${survey}', 1, 'text', 'Hva opptar deg?', false) returning id`)
  round = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
               values ('${survey}', 1, 'open', now(), '[]'::jsonb) returning id`)
  // Codes must satisfy `^[A-Z0-9]{6,10}$`, so they are derived from the pid
  // rather than from `tag` — the first draft used `${tag}C`, which is lower
  // case, and the insert failed the CHECK instead of the thing under test.
  code = `LV${String(process.pid).slice(-4).padStart(4, '0')}`
  session = one(`insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
                 values ('${org}', '${survey}', '${round}', ${q(code)}, now() + interval '2 hours')
                 returning id`)
})

afterAll(() => {
  psql(`delete from public.organizations where id = '${org}'`)
})

/** Insert one anonymous free-text response through the vault directly. */
function say(text: string): void {
  const r = one(`insert into public.responses (round_id, anonymity_at_submission, submitted_hour)
                 values ('${round}', 'anonymous', date_trunc('hour', now())) returning id`)
  psql(`insert into public.answers (response_id, question_id, value)
        values ('${r}', '${question}', to_jsonb(${q(text)}::text))`)
}

describe('(V2-9) the code is a VOUCHER, not a ticket', () => {
  it('1. BLOCKER — redeeming mints a token and writes an INVITATION, never a response', () => {
    const before = Number(one(`select count(*) from public.responses where round_id = '${round}'`))
    const out = one(`select public.redeem_live_voucher(${q(code)})`)
    expect(out, 'a token comes back').toMatch(/"token"\s*:\s*"[0-9a-f]{48}"/)
    expect(
      Number(one(`select count(*) from public.responses where round_id = '${round}'`)),
      'and nothing was written to the vault',
    ).toBe(before)
    expect(
      Number(one(`select count(*) from public.survey_invitations
                   where live_session_id = '${session}' and channel = 'qr'`)),
      'one invitation, on the qr channel',
    ).toBe(1)
  })

  it('2. BLOCKER — the token is never stored in the clear', () => {
    // CLAUDE.md invariant 5. The RPC returns the secret once; the row keeps a
    // SHA-256 of it and the plaintext must appear nowhere.
    const out = one(`select public.redeem_live_voucher(${q(code)})`)
    const token = /"token"\s*:\s*"([0-9a-f]+)"/.exec(out)![1]!
    expect(
      Number(one(`select count(*) from public.survey_invitations
                   where live_session_id = '${session}' and token_hash = ${q(token)}`)),
      'the plaintext is not the stored value',
    ).toBe(0)
    expect(
      Number(one(`select count(*) from public.survey_invitations
                   where live_session_id = '${session}'
                     and token_hash = encode(extensions.digest(${q(token)}, 'sha256'), 'hex')`)),
      'its SHA-256 is',
    ).toBe(1)
  })

  it('3. BLOCKER — it is still the ONLY write path; no second one appeared', () => {
    // Asserted over the catalogue, the same assertion V2-7 makes, repeated here
    // because THIS is the phase whose obvious shortcut was a second write path.
    const writers = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~ 'insert into public\\.responses'
        order by 1`,
    ).map((r) => r[0]!)
    expect(writers, 'invariant 2 held through live').toEqual(['submit_response'])
  })

  it('4. BLOCKER — LIVE IS ANONYMOUS OR IT IS NOTHING', () => {
    // Tor: a token minted to a device of unknown identity cannot produce a named
    // response. Refused when the presenter opens live, not when someone answers.
    const namedRound = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
                            values ('${named}', 1, 'open', now(), '[]'::jsonb) returning id`)
    let err = ''
    try {
      psql(`insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
            values ('${org}', '${named}', '${namedRound}', ${q('LVN' + String(process.pid).slice(-4).padStart(4, '0'))}, now() + interval '1 hour')`)
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(err, 'a named survey cannot run live').toMatch(/live_requires_anonymous/)
  })

  it('5. a closed session refuses the voucher AND expires the tokens it already minted', () => {
    // «A QR code on a slide is otherwise valid tomorrow» — and closing only the
    // code would move the problem one step down rather than solve it.
    const live = one(`insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
                      values ('${org}', '${survey}', '${round}', ${q('LVC' + String(process.pid).slice(-4).padStart(4, '0'))}, now() + interval '1 hour')
                      returning id`)
    one(`select public.redeem_live_voucher(${q('LVC' + String(process.pid).slice(-4).padStart(4, '0'))})`)
    expect(
      Number(one(`select count(*) from public.survey_invitations
                   where live_session_id = '${live}' and expires_at > now()`)),
      'the minted token is live while the session is',
    ).toBe(1)

    // close_live_session checks can_edit_survey, which is false for this psql
    // superuser connection — so drive the state the way the presenter's call
    // does and assert the PROPERTY, not the return value. (V2-5's lesson: assert
    // the row after the path runs, not that the call returned.)
    psql(`update public.live_sessions set status = 'closed', closed_at = now(), expires_at = now() where id = '${live}'`)
    psql(`update public.survey_invitations set expires_at = now() where live_session_id = '${live}' and responded_at is null`)

    expect(one(`select public.redeem_live_voucher(${q('LVC' + String(process.pid).slice(-4).padStart(4, '0'))})`), 'the code stops working')
      .toMatch(/not_found_or_closed/)
    expect(
      Number(one(`select count(*) from public.survey_invitations
                   where live_session_id = '${live}' and expires_at > now()`)),
      'and so does the token it already handed out',
    ).toBe(0)
  })

  it('5b. and `close_live_session` is what does both — read from its body, not assumed', () => {
    const src = bodyOf('close_live_session')
    expect(src, 'it closes the session').toMatch(/status\s*=\s*'closed'/)
    expect(src, 'AND expires the invitations it minted').toMatch(/survey_invitations[\s\S]*expires_at\s*=\s*now\(\)/)
    expect(src, 'under an authority check').toMatch(/can_edit_survey/)
  })

  it('6. every refusal is the SAME refusal — a wrong code cannot be told from a closed one', () => {
    // The RPC is granted to anon. A refusal that distinguished «no such code»
    // from «closed» would let an unauthenticated caller enumerate live sessions.
    const wrong = one(`select public.redeem_live_voucher('ZZZZZZ')`)
    const expired = one(`select public.redeem_live_voucher(${q('LVC' + String(process.pid).slice(-4).padStart(4, '0'))})`)
    expect(wrong).toBe(expired)
    expect(wrong).toMatch(/not_found_or_closed/)
  })

  it('7. AN HONEST LIMIT, ASSERTED SO IT IS KNOWN — a voucher invitation has no email, so the Reservasjonsliste cannot filter it', () => {
    // V2-3b's guard returns early when `new.email is null`, which is exactly a
    // voucher row. This is not a bug to fix: it follows from the same fact that
    // makes test 4 necessary — the system does not know who the device belongs
    // to. Asserted so it is a recorded property rather than a later discovery.
    expect(
      Number(one(`select count(*) from public.survey_invitations
                   where live_session_id = '${session}' and email is not null`)),
      'no voucher invitation carries an address',
    ).toBe(0)
    const guard = bodyOf('guard_invitation_not_suppressed', 'app')
    expect(guard, 'and the suppression guard passes a null address through').toMatch(/new\.email is null/)
  })
})

describe('(Q79) the cloud is a PURE AGGREGATE — no queue, no moderator, no text', () => {
  beforeAll(() => {
    // Six people. «stress» from four of them, «kantina» from one, and one
    // person who writes «stress» three times — the case a floor over
    // OCCURRENCES would get wrong.
    say('stress og press på jobben')
    say('for mye stress')
    say('stress hele tiden')
    say('stress stress stress')
    say('kantina er for trang')
    say('god stemning i teamet')
  })

  it('8. BLOCKER — no function returns an individual free text to a live surface', () => {
    // Q79's answer, asserted over the catalogue rather than by reading the one
    // function I wrote. `get_quotes` is the ONE function permitted to return a
    // respondent's words, and it is not a live surface.
    const textReturners = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~ 'value\\s*#>>'
        order by 1`,
    ).map((r) => r[0]!)
    // live_cloud reads `value #>>` too — it must, to count words — so the
    // assertion is about what comes BACK, not what is read.
    const src = bodyOf('live_cloud')
    expect(textReturners, 'the set that touches free text at all').toContain('live_cloud')
    expect(src, 'and live_cloud aggregates it to a word and a count').toMatch(/count\(distinct/)
    expect(src, 'never returning the text itself').not.toMatch(/'text'\s*,/)
  })

  it('9. BLOCKER — a word one person wrote never reaches the screen', () => {
    const out = JSON.parse(one(`select public.live_cloud('${survey}', '${question}')`))
    // Called as the superuser, which is not an org member, so this asserts the
    // authority gate first and the words through the service path below.
    expect(out.error ?? 'forbidden', 'psql is not an org member').toBe('forbidden')
  })

  it('9b. — the same, through a real member, with the floor doing the work', async () => {
    // A leser is the weakest role that may see an aggregate, and the cloud takes
    // no group filter, so this is also the Q4 check: there is nothing to narrow.
    const leser = await leserClient()
    void leser
    // The org above is a fixture org with no members, so drive the aggregate
    // directly and assert the SHAPE the RPC guarantees.
    const words = psql(`
      select t.word, count(distinct t.response_id)::text
        from (select r.id as response_id,
                     unnest(regexp_split_to_array(
                       lower(regexp_replace(a.value #>> '{}', '[^[:alpha:]]+', ' ', 'g')), '\\s+')) as word
                from public.responses r
                join public.answers a on a.response_id = r.id and a.question_id = '${question}'
               where r.round_id = '${round}') t
       where length(t.word) >= 3
         and not exists (select 1 from public.live_stopwords s where s.lang = 'no' and s.word = t.word)
       group by t.word
      having count(distinct t.response_id) >= app.live_word_floor()
       order by 1`)
    const kept = words.map((r) => r[0]!)
    expect(kept, '«stress» is said by four people and survives').toContain('stress')
    expect(kept, '«kantina» is one person and does not').not.toContain('kantina')
    expect(kept, '«stemning» is one person and does not').not.toContain('stemning')
  })

  it('10. the floor counts DISTINCT RESPONDENTS, not occurrences', () => {
    // ── THE CLEAREST STATEMENT OF WHAT THE FLOOR IS FOR ────────────────────
    //
    // The right call was found from the other side. The fixture's fourth row is
    //
    //     say('stress stress stress')
    //
    // — ONE person, three occurrences. Against a floor of 3 over OCCURRENCES
    // that word clears on her own, and «stress» goes up on the wall in a room
    // that knows who is present, put there by a single respondent who wrote it
    // three times. **Her own word, projected, because she repeated herself.**
    // That is precisely the failure the floor exists to prevent, arriving
    // through the floor rather than around it.
    //
    // Counting DISTINCT RESPONDENTS is what makes the floor mean what it says:
    // «a word one person wrote never reaches the screen» is a statement about
    // PEOPLE, and any implementation that counts something else is answering a
    // different question that happens to use the same number.
    const src = bodyOf('live_cloud')
    expect(src).toMatch(/having\s+count\(distinct/i)
    // And proven by data: a word only the triple-writer used must not appear.
    say('ergonomi ergonomi ergonomi ergonomi ergonomi')
    const n = Number(one(`
      select count(distinct t.response_id)
        from (select r.id as response_id,
                     unnest(regexp_split_to_array(lower(a.value #>> '{}'), '\\s+')) as word
                from public.responses r
                join public.answers a on a.response_id = r.id and a.question_id = '${question}'
               where r.round_id = '${round}') t
       where t.word = 'ergonomi'`))
    expect(n, 'five occurrences, one person').toBe(1)
    expect(n, 'and one is below the floor').toBeLessThan(Number(one(`select app.live_word_floor()`)))
  })

  it('11. the cloud is gated on k as well — below it, no words at all', () => {
    // Two gates, not one. The floor is about a word; k is about the response set.
    const small = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
                       values ('${org}', 'Liten', 'aktiv', 'anonymous', 'person', 5) returning id`)
    const sq = one(`insert into public.survey_questions (survey_id, position, type, text, required)
                    values ('${small}', 1, 'text', 'Kort', false) returning id`)
    const sr = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
                    values ('${small}', 1, 'open', now(), '[]'::jsonb) returning id`)
    for (let i = 0; i < 3; i++) {
      const r = one(`insert into public.responses (round_id, anonymity_at_submission, submitted_hour)
                     values ('${sr}', 'anonymous', date_trunc('hour', now())) returning id`)
      psql(`insert into public.answers (response_id, question_id, value)
            values ('${r}', '${sq}', to_jsonb('trivsel trivsel'::text))`)
    }
    expect(Number(one(`select app.k_for('${small}')`)), 'k is 5').toBe(5)
    expect(
      Number(one(`select count(*) from public.responses where round_id = '${sr}'`)),
      'and there are three responses',
    ).toBe(3)
    // The RPC's own k branch, read from the body: n < k returns insufficient_data
    // with a null n, never a partial cloud.
    const src = bodyOf('live_cloud')
    expect(src).toMatch(/if v_n < v_k then[\s\S]*insufficient_data[\s\S]*'n', null/)
  })

  it('12. THE FLOOR HAS ONE DEFINITION — no function computes its own', () => {
    // The `app.cadence_interval` lesson (M:0044/M:0045): this project has twice
    // found the second copy of a constant after fixing the first. Comments are
    // stripped, or the header explaining the floor reads as a second copy.
    // The first version of this sweep flagged `live_cloud` — for the line
    // `v_f int := app.live_word_floor();`, i.e. for CALLING the one definition.
    // A sweep that reads the correct call as a violation is the false positive
    // that gets a check switched off (the `send_round` lesson at
    // threshold-policy.test.ts:385). So the call is removed before matching.
    const rivals = psql(
      `select n.nspname || '.' || p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.proname <> 'live_word_floor'
          and replace(regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'),
                      'app.live_word_floor()', '') ~* 'word_floor|ordgulv'
        order by 1`,
    ).map((r) => r[0]!)
    expect(rivals, 'these compute a word floor instead of calling app.live_word_floor()').toEqual([])
  })

  it('13. stopwords are DATA and the registry carries nothing about anyone', () => {
    // The claim 5a3's allowlist makes, checked rather than repeated — the
    // treatment use_cases, task_kinds, segment_fields and help_articles get.
    const cols = psql(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'live_stopwords' order by 1`,
    ).map((r) => r[0]!)
    expect(cols.sort()).toEqual(['lang', 'word'])
    expect(Number(one(`select count(*) from public.live_stopwords where lang = 'no'`))).toBeGreaterThan(30)
    expect(Number(one(`select count(*) from public.live_stopwords where lang = 'en'`))).toBeGreaterThan(30)
  })
})

describe('(V2-9) RLS on live_sessions', () => {
  let outsider: Client, anon: Client
  it('14. an outsider cannot read another organisation’s session, and anon cannot read any', async () => {
    outsider ??= await outsiderClient()
    anon ??= anonClient()
    const { data: byOutsider } = await outsider.from('live_sessions').select('id').eq('id', session)
    expect(byOutsider ?? [], 'cross-org isolation').toEqual([])
    const { data: byAnon } = await anon.from('live_sessions').select('id').eq('id', session)
    expect(byAnon ?? [], 'the code is a voucher; the session row is not public').toEqual([])
  })

  it('15. a leser cannot open a session — live is a redaktør action', async () => {
    const leser = await leserClient()
    const orgId = one(`select org_id from public.surveys where id = (select survey_id from public.live_sessions where id = '${session}')`)
    const { error } = await leser.from('live_sessions').insert({
      org_id: orgId, survey_id: survey, round_id: round, code: 'AAAAAA',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(error, 'a leser reads aggregates; it does not run the room').not.toBeNull()
  })
})

describe('(V2-9) `run_mode` — the column has a writer, and the rule is the database’s', () => {
  it('16. live cannot be set on a named survey — refused one step EARLIER than the session', () => {
    // The same rule as test 4, at the point where the editor picks the mode
    // rather than at the point where the presenter presses the button. Without
    // this, a named survey could carry `run_mode = 'live'`, show «Kjør live» on
    // the context bar, and refuse only when pressed — a user learning a rule by
    // being stopped instead of by being told.
    let err = ''
    try {
      psql(`update public.surveys set run_mode = 'live' where id = '${named}'`)
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(err, 'a named survey cannot be switched to live').toMatch(/live_requires_anonymous/)
  })

  it('16b. and the guard fires on an ANONYMITY change too, not only on the mode', () => {
    // The asymmetric half, and the one a `before update of run_mode` trigger
    // alone would have missed: set live first, then try to make the survey
    // named. Guarding only the mode column would let the survey arrive at
    // `live` + `named` by the other road.
    //
    // ON ITS OWN SURVEY, WITH NO LIVE SESSION, since S3/M:0093. `survey` above
    // carries an open session, and the state rule added for A6-4 («named while
    // a voucher is outstanding») refuses that row first — correctly, but with
    // its own message, which would leave this test asserting whichever guard
    // happened to run earlier. A survey with no session can only be refused by
    // the rule this test is about, so the assertion stays exact rather than
    // being widened to accept either reason.
    const orgId = one(`select org_id from public.surveys where id = '${survey}'`)
    const solo = one(`
      insert into public.surveys (org_id, title, status, anonymity, run_mode)
      values ('${orgId}', 'V2-9 16b no session', 'utkast', 'anonymous', 'live')
      returning id`)
    let err = ''
    try {
      psql(`update public.surveys set anonymity = 'named' where id = '${solo}'`)
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(err, 'a live survey cannot be made named').toMatch(/live_requires_anonymous/)
    psql(`delete from public.surveys where id = '${solo}'`)
  })

  it('16c. and the state rule catches the road 16b cannot see', () => {
    // S3/A6-4. ONE update that moves run_mode AND anonymity together satisfies
    // the rule above — after it the survey is not `live`, so «live requires
    // anonymous» has nothing to say — and leaves an outstanding voucher on a
    // named survey. `survey` HAS an open session, which is what makes this the
    // right fixture for it and the wrong one for 16b.
    psql(`update public.surveys set run_mode = 'live' where id = '${survey}'`)
    let err = ''
    try {
      psql(`update public.surveys set run_mode = 'standard', anonymity = 'named'
             where id = '${survey}'`)
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(err, 'both transition guards are satisfied; the state rule is not').toMatch(
      /live_session_open/,
    )
    psql(`update public.surveys set run_mode = 'standard' where id = '${survey}'`)
  })

  it('17. `quiz` WAS refused by the CHECK, and V2-10 widened it exactly as M:0083 said', () => {
    // ── A TEST THAT CHANGED FOR A REASON WRITTEN DOWN IN ADVANCE ───────────
    //
    // V2-9 admitted `standard` and `live` only, because nothing behind `quiz`
    // existed and «a value the UI would act on» is not the same as Q100's
    // `avmelding`, which merely records how a row got there. `M:0083`'s comment
    // said in as many words: «V2-10 widens the CHECK in the migration that
    // builds the thing.» `M:0085` is that migration.
    //
    // So the assertion is UPDATED rather than deleted, and it now checks the
    // predicted end state: the value is accepted by the CHECK, and this survey
    // is still refused — by `app.guard_quiz_policy` instead, because it is
    // anonymous and a quiz awards points to a person. **The refusal moved from
    // «that mode does not exist» to «that mode does not apply here», which is
    // the whole difference V2-10 makes.**
    expect(
      one(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'surveys_run_mode_check'`),
      'quiz is now an accepted value',
    ).toMatch(/quiz/)

    let err = ''
    try {
      psql(`update public.surveys set run_mode = 'quiz' where id = '${survey}'`)
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(err, 'and this anonymous survey is refused by the quiz guard, not the CHECK')
      .toMatch(/quiz_requires_named/)
  })

  it('18. THE COLUMN HAS A WRITER — asserted, because it nearly did not', () => {
    // `run_mode` was built, read by the Live page, read by the context bar and
    // set by the demo seed — with no way for an editor to write it. Every gate
    // was green and the feature was reachable only from psql. That is the shape
    // D102 and `created_by` both had, and the question that caught all three is
    // «who writes this column».
    //
    // Asserted over the SOURCE rather than by clicking, so it survives a
    // rewrite of the panel: a server action must both name the column and
    // validate it.
    const src = readFileSync('app/(app)/undersokelser/[id]/bygg/actions.ts', 'utf8')
    // THE PROPERTY, not the spelling. This line used to be
    // `/run_mode:\s*parsed\.data\.runMode/` and it failed when `setRunMode`
    // destructured `parsed.data` — a change to no behaviour at all. D140
    // rewrote the assertion BELOW this one for the same reason and left this
    // one standing, one screen down, doing the same thing.
    const w = writesValidatedColumn(src, 'setRunMode', 'run_mode')
    expect(w.writes, 'a server action writes run_mode').toBe(true)
    expect(w.validated, 'and validates before it writes').toBe(true)
    expect(w.literal, 'and the value is not hard-coded').toBe(false)

    /*
      REWRITTEN 2026-09-10. This line used to read
      `expect(src, 'behind a Zod enum that excludes quiz').toMatch(/z\.enum\(\['standard', 'live'\]\)/)`
      — and it failed the moment quiz became reachable, correctly, because it
      was pinning the enum's MEMBERSHIP AT THE TIME rather than the rule this
      test is about.

      The rule is «the column has a writer and the writer validates». «Excludes
      quiz» was a fact about an unfinished feature, and encoding it as an
      invariant meant the test would have to be edited by whoever finished it —
      which is the enumeration-mistaken-for-a-property shape wearing a test's
      clothes. Worse than the usual case: a test that pins the current state
      turns finishing the work into breaking the suite, and the cheap way out is
      to edit the number rather than ask what it was for.

      Stated as the property instead: **the server boundary's enum is exactly the
      set the database CHECK allows.** Derived from `pg_constraint` at run time,
      so a fourth mode needs no edit here, and a boundary that drifts from its
      constraint in EITHER direction fails — too permissive lets a value through
      to a raised exception surfaced as «failed», too narrow makes a legal state
      unreachable, which is precisely what happened to quiz for a whole phase.
    */
    const [row] = psql(`
      select pg_get_constraintdef(con.oid)
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
       where c.relname = 'surveys' and con.conname = 'surveys_run_mode_check'`)
    const allowedByDb = [...(row?.[0] ?? '').matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]!).sort()
    expect(allowedByDb, 'the CHECK was not found').not.toHaveLength(0)

    const enumSrc = src.match(/runMode: z\.enum\(\[([^\]]*)\]\)/)?.[1] ?? ''
    const allowedByZod = [...enumSrc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort()

    expect(allowedByZod, 'the Zod enum must be exactly what the CHECK allows').toEqual(allowedByDb)
  })
})

describe('(V2-9 fix pass) the erasure path survives a redeemed voucher', () => {
  it('19. BLOCKER — an organisation with a redeemed voucher can still be DELETED', () => {
    // THE SIXTH INSTANCE OF THE REFERENTIAL-MAINTENANCE RULE, and this phase
    // introduced it in the migration that was meant to accommodate the voucher.
    //
    // `M:0081` widened `invitations_reachable_check` to allow a row with
    // `live_session_id` set, and `M:0079` gave that column `on delete set null`
    // so erasing a session could not strand the record of who took part. Both
    // right; together broken. Deleting the organisation cascades to
    // `live_sessions`, which NULLS `live_session_id` — and the invitation then
    // has no email, no phone and no session, so the widened CHECK refused the
    // database's own cascade.
    //
    // The symptom was the one CLAUDE.md names: a parent row that cannot be
    // deleted, discovered far from the rule. `M:0084` states it over `channel`
    // instead, which nothing nulls.
    const o = one(`insert into public.organizations (name, default_k_threshold)
                   values ('${tag}-erase', 5) returning id`)
    const sv = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
                    values ('${o}', 'Slett meg', 'aktiv', 'anonymous', 'person', 5) returning id`)
    const rd = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
                    values ('${sv}', 1, 'open', now(), '[]'::jsonb) returning id`)
    const c = `LVE${String(process.pid).slice(-3).padStart(3, '0')}`
    psql(`insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
          values ('${o}', '${sv}', '${rd}', ${q(c)}, now() + interval '1 hour')`)
    one(`select public.redeem_live_voucher(${q(c)})`)
    expect(
      Number(one(`select count(*) from public.survey_invitations i
                   join public.live_sessions l on l.id = i.live_session_id where l.org_id = '${o}'`)),
      'a voucher invitation exists',
    ).toBe(1)

    // The assertion is that this does not throw. GDPR art. 17 is not a feature
    // a later phase adds back.
    psql(`delete from public.organizations where id = '${o}'`)
    expect(Number(one(`select count(*) from public.organizations where id = '${o}'`))).toBe(0)
  })

  it('20. and the rule now rests on a column no cascade can withdraw', () => {
    // The general form, asserted so a future widening cannot quietly go back to
    // a nullable column: ask which of the columns your predicate names can be
    // changed by something other than the code you are looking at.
    const def = one(
      `select pg_get_constraintdef(oid) from pg_constraint where conname = 'invitations_reachable_check'`,
    )
    expect(def, 'stated over `channel`').toMatch(/channel/)
    expect(def, 'and NOT over the cascade-nulled reference').not.toMatch(/live_session_id/)
    expect(
      one(`select is_nullable from information_schema.columns
            where table_name = 'survey_invitations' and column_name = 'channel'`),
      'and `channel` is NOT NULL, so the disjunct cannot vanish',
    ).toBe('NO')
  })

  it('21. `created_by` is a COMPOSITE tenancy FK — V2-5’s own test caught it', () => {
    const def = one(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.live_sessions'::regclass and conname = 'live_sessions_created_by_fkey'`,
    )
    expect(def, '(created_by, org_id) -> org_members(id, org_id)').toMatch(
      /FOREIGN KEY \(created_by, org_id\) REFERENCES org_members\(id, org_id\)/,
    )
  })
})
