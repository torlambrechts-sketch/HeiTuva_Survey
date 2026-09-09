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
