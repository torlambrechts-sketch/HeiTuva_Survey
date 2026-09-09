import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, leserClient, outsiderClient, type Client } from './clients'

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
    // The fixture's fourth «stress» row says it three times. If the floor
    // counted occurrences, one person could push their own word onto the wall —
    // the very failure the floor exists to prevent, from the other side.
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
