import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  RETENTION_DEFAULT,
  RETENTION_MONTHS,
  RETENTION_NEVER,
  RETENTION_ORDER,
  isRetention,
} from '../../lib/surveys/retention'

/**
 * THE RETENTION SET IS A FACT ABOUT THE CATALOGUE AND IS READ BACK FROM THE
 * CATALOGUE.
 *
 * ── WHAT THIS EXISTS TO STOP, MEASURED BEFORE IT WAS WRITTEN ──────────────
 *
 * On 2026-09-15 there were THREE statements of one rule:
 *
 *   `PrivacyPanel.tsx:17`  const RETENTIONS = [6, 12, 24, 0] as const
 *   `actions.ts:199`       .refine((n) => [0, 6, 12, 24].includes(n))
 *   `M:0002`               check (retention_months in (0, 6, 12, 24))
 *
 * All three agreed, and nothing made them. That is F3's `responsePct` shape —
 * one name, four implementations, three agreeing by luck — and the public
 * privacy notice was about to become a fourth. It is the worst place for the
 * fourth to be: the other three are read by an administrator who can see the
 * control, and that one is read by a data subject who cannot.
 *
 * ── AND IT IS DERIVED, NOT LISTED ─────────────────────────────────────────
 *
 * The assertion is over `pg_constraint`, not over a copy of the values kept
 * here. CLAUDE.md's row 9, in its own words: «a grant is a fact about the
 * catalogue and must be read back from the catalogue … the only form of the
 * rule that does not depend on remembering.» A spelling has to be recalled at
 * the moment of writing, which is exactly what failed twice with
 * `revoke … from public`. A value added to the column without being added to
 * the registry fails HERE, rather than silently making the public notice
 * incomplete.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

describe('Q187 — the retention set has one definition', () => {
  it('1. the constraint exists — so everything below refuses something real', () => {
    const rows = psql(
      `select conname from pg_constraint
        where conrelid = 'public.organizations'::regclass
          and conname = 'organizations_retention_months_check'`,
    )
    expect(rows.length, 'no retention CHECK exists, so the assertions below are vacuous').toBe(1)
  })

  it('2. the registry offers exactly the values the column accepts', () => {
    const def = psql(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.organizations'::regclass
          and conname = 'organizations_retention_months_check'`,
    )[0]![0]!

    // `CHECK ((retention_months = ANY (ARRAY[0, 6, 12, 24])))` — the numerals
    // are the set. Derived from the rendered definition rather than compared
    // against a second copy of it, so adding 36 to the column and not to the
    // registry is a failure here rather than a notice that omits it.
    const fromDb = [...def.matchAll(/\d+/g)].map((m) => Number(m[0])).sort((a, b) => a - b)
    const fromRegistry = [...RETENTION_ORDER].sort((a, b) => a - b)

    expect(fromDb).toEqual(fromRegistry)
  })

  it('3. the default the public notice names IS the column default', () => {
    // `legal.privacy5P` said «standard 24 måneder» while the column default was
    // 12 — wrong for every reader, in both languages, on a public GDPR page.
    // The figure now comes from the registry, and the registry is checked here.
    const def = psql(
      `select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'organizations'
          and column_name = 'retention_months'`,
    )[0]![0]!

    expect(Number(def)).toBe(RETENTION_DEFAULT)
    expect(isRetention(RETENTION_DEFAULT)).toBe(true)
  })

  it('4. the durations are separated from the never case', () => {
    // `RETENTION_MONTHS` is what a sentence about «etter så lenge» may name. A
    // notice listing 0 among the months would be saying «0 måneder», which is
    // not what 0 means — it means kept until somebody deletes them.
    expect(RETENTION_MONTHS).not.toContain(RETENTION_NEVER)
    expect(RETENTION_ORDER).toContain(RETENTION_NEVER)
    expect([...RETENTION_MONTHS].every((m) => m > 0)).toBe(true)
  })

  it('5. the column itself refuses what the mirror refuses', () => {
    // Asserted against the LIVE constraint rather than against a second copy of
    // the array: the predicate is evaluated by the database that owns the rule.
    for (const n of [18, 36, -1, 1]) {
      expect(isRetention(n), `${n} is not in the CHECK`).toBe(false)
      const verdict = psql(
        `select case when (select conbin is not null from pg_constraint
                            where conrelid = 'public.organizations'::regclass
                              and conname = 'organizations_retention_months_check')
                     and ${n} in (select (regexp_matches(
                           pg_get_constraintdef(oid), '(\\d+)', 'g'))[1]::int
                         from pg_constraint
                        where conrelid = 'public.organizations'::regclass
                          and conname = 'organizations_retention_months_check')
                    then 'accepts' else 'refuses' end`,
      )[0]![0]
      expect(verdict).toBe('refuses')
    }
  })
})
