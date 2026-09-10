import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { toJsRegex } from '@/lib/questions/quality'

/**
 * Two assertions that exist because a DEFENCE hid a bug, not because a feature
 * needed testing. Both are derived from the CATALOGUE — `pg_proc`, and the
 * seeded rows themselves — rather than from a list of the cases I happened to
 * think of, because a list is exactly what both failures got past.
 *
 * ── 1. NO CATCH-ALL EXCEPTION HANDLER ANYWHERE (D115) ──────────────────────
 *
 * `M:0070` patched `public.send_round` five times over. The reason nobody
 * noticed was a handler I had written myself:
 *
 *     exception when others then null;
 *
 * I put it there knowing exactly which failure it was for — «the AI prompt row
 * is missing». What actually landed inside it was «the call site is wrong», and
 * the handler swallowed that just as faithfully. The defence did not fail. It
 * worked as designed, on the wrong thing.
 *
 * CLAUDE.md now carries the general form beside the referential-maintenance
 * rule: **a catch-all is not a safety measure, it is a decision to make one
 * class of failure invisible, and it is only sound if you know which class.**
 * This is the half of that rule a machine can check.
 *
 * The current answer is ZERO, so there is no allowlist — which is the strongest
 * shape this assertion can have, and it is worth keeping that way. A handler
 * that genuinely needs to swallow something names the condition
 * (`when unique_violation or foreign_key_violation`, as `send_round` now does):
 * that is a decision about a class, written down, and it passes this test
 * because it is not a catch-all.
 *
 * The recorded LIMIT of the check: it reads `when others`, which is what
 * PL/pgSQL spells a catch-all. A handler listing thirty conditions would be a
 * catch-all in spirit and would pass here. That is a bound on this test, not a
 * gap this test hides.
 *
 * ── 2. EVERY SEEDED REGEX SURVIVES THE DIALECT CROSSING (D116) ─────────────
 *
 * `quality_rules.pattern` is written in Postgres's regex dialect and evaluated
 * in JavaScript's. `toJsRegex` translates, and on a pattern it cannot compile it
 * returns `null` — which makes the rule VANISH. That is the same shape as case
 * 1: a defence that turns a loud failure into no failure at all. It is
 * acceptable at runtime (this evaluator runs on every keystroke in the Builder
 * and must not throw), and it is only acceptable because of this test.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

describe('(D115) a catch-all is a decision to make one class of failure invisible', () => {
  it('no function in `app` or `public` swallows everything', () => {
    // Comments are stripped first: a line explaining why there is no catch-all
    // must not read as one.
    const swallowers = psql(
      `select n.nspname || '.' || p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public')
          and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~* 'when\\s+others'
        order by 1`,
    ).map((r) => r[0]!)

    expect(
      swallowers,
      'A catch-all hides the bug that made it necessary — M:0070 patched send_round five ' +
        'times inside one. If a handler is genuinely needed, name the conditions it is for.',
    ).toEqual([])
  })

  it('and the enumeration is real — the sweep sees functions at all', () => {
    // The assertion above is an empty-set claim, and an empty-set claim is also
    // what a broken query returns. This is what tells the two apart.
    const n = Number(
      psql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('app','public') and p.prokind = 'f'`)[0]![0],
    )
    expect(n, 'the catalogue sweep enumerated functions').toBeGreaterThan(80)
  })
})

describe('(D116) every seeded pattern crosses the Postgres → JavaScript dialect intact', () => {
  const rows = psql(
    `select key, pattern from public.quality_rules where pattern is not null order by key`,
  )

  it('there are patterns to check', () => {
    expect(rows.length, 'a seed that stopped seeding patterns would pass the loop below').toBeGreaterThan(0)
  })

  it('none of them compiles to null — a rule that vanishes raises nothing for ever', () => {
    const dead = rows.filter(([, pattern]) => toJsRegex(pattern!) === null).map(([key]) => key!)
    expect(dead, 'toJsRegex returned null: the rule is silently disabled in the Builder').toEqual([])
  })

  it('and the boundary is letter-aware, not ASCII — «å» is not a word break', () => {
    // The defect this whole file's second half exists for. JavaScript's `\b` is
    // ASCII-only, so it puts a word boundary between `å` and `d`. The three
    // seeded rules all match ASCII alternatives (`du`, `og`, `ikke`), which
    // means `\b` could only ever OVER-match there — a pronoun warning on a word
    // that merely contains `du` beside an `å`.
    //
    // Asserted against a real rule read from the catalogue rather than against a
    // regex written here, so a re-seed that changes the pattern is checked too.
    const pronoun = rows.find(([key]) => key === 'policy_pronoun')
    expect(pronoun, 'the policy pronoun rule is seeded').toBeTruthy()
    const re = toJsRegex(pronoun![1]!)!

    expect(re.test('trives du i jobben'), 'a real pronoun still matches').toBe(true)
    expect(re.test('pådu'), '`du` inside a word is not a pronoun — `\\b` says it is').toBe(false)
    expect(re.test('vurdering'), 'no false hit on an ordinary word').toBe(false)
  })
})

describe('(M:0096) every function in `app` and `public` pins its search_path', () => {
  /*
    THE THIRD SWEEP IN THIS FILE, AND IT EXISTS FOR THE SAME REASON AS THE FIRST
    TWO: something real was found by a tool outside CI, and the fix is worthless
    unless the NEXT instance fails a test rather than waiting for the next person
    to read an advisor.

    Six functions had a mutable `search_path` — `task_step_index`,
    `below_threshold`, `guard_live_is_anonymous`, `live_word_floor`,
    `guard_run_mode_anonymous`, `guard_quiz_policy` — arriving across V2-4, V2-9
    and V2-10. Every one of those phases was green. Nothing in the gate set
    enumerates `proconfig`, so «green» was silent on it, which is the shape
    CLAUDE.md keeps recording: the check became a different check.

    CATALOGUE-DERIVED, NOT A LIST. Scoped to the six already known it would have
    the same blind spot as the thing it is written about (D115's argument, which
    that file's first sweep makes in full). It asks pg_proc which functions have
    no setting at all, so the answer is currently zero AND there is no allowlist
    to rot.

    `''` vs `public` is deliberately NOT asserted. Both are pinned, both are
    decisions, and 57 and 35 functions respectively use them; forcing one would
    be this test inventing a policy rather than checking one. What is not a
    decision is having none.
  */
  it('no function is left with a mutable search_path', () => {
    const rows = psql(
      `select n.nspname || '.' || p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f' and p.proconfig is null
        order by 1`,
    )
    expect(
      rows.map((r) => r[0]),
      'a function with no search_path setting resolves names from the CALLER’s path — ' +
        'and three of the six that prompted this sweep are trigger functions, which run ' +
        'on whoever writes the row. Add `set search_path = \'\'` (or `= public`) in the ' +
        'migration that creates it.',
    ).toEqual([])
  })

  it('and the sweep is actually reading a populated catalogue', () => {
    // The other half of every sweep in this file: zero findings is only
    // meaningful if the enumeration found something to look at.
    const pinned = Number(
      psql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('app','public') and p.prokind = 'f' and p.proconfig is not null`)[0]![0],
    )
    expect(pinned, 'functions WITH a pinned search_path').toBeGreaterThan(80)
  })
})
