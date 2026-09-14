import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { kForMirror } from '../../lib/surveys/retention'

/**
 * The TypeScript mirror of `app.k_for` must agree with `app.k_for`.
 *
 * `app.k_for` lives in the `app` schema, so PostgREST cannot call it and a
 * screen needing the threshold has to compute one. A second implementation of a
 * security-relevant rule is what this project refuses elsewhere, and it is
 * tolerable here ONLY because this test exists: it calls the real function
 * across a matrix and requires the mirror to match.
 *
 * Catalogue-derived where it matters — the `respondent_kind` values come from
 * the CHECK constraint rather than from a list written here, so a third value
 * added later is tested automatically instead of silently skipped.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

describe('app.k_for and its TypeScript mirror agree', () => {
  it('the function exists — so the comparison below is not vacuous', () => {
    const n = psql(
      `select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'app' and p.proname = 'k_for'`,
    )[0]?.[0]
    expect(Number(n), 'app.k_for does not exist').toBe(1)
  })

  it('agrees across the matrix — and the EXPECTATION COMES FROM THE FUNCTION', () => {
    /*
      **THE FIRST VERSION OF THIS TEST RESTATED THE RULE IN SQL** — `greatest(k,
      3)` — which is the same mistake the mirror made, written a second time in
      the thing meant to catch it. A test that re-implements what it is checking
      agrees with the implementation it copied and with nothing else.

      So the matrix is evaluated by CALLING `app.k_for` on real rows, inside a
      transaction that is rolled back. The kinds come from the CHECK constraint
      rather than from a list here, so a third value added later is covered.
    */
    /*
      THREE constraints mention `respondent_kind` — the k>=2 rule, the
      organisation-must-be-named rule, and the one that ENUMERATES the kinds.
      Harvesting quoted values from all three yields duplicates of
      «organisation» and is the enumeration shape one level down, so the query
      asks for the enumerating constraint specifically and the result is deduped
      anyway.
    */
    const def = psql(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.surveys'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%respondent_kind = ANY%'`,
    )
      .map((r) => r[0] ?? '')
      .join(' ')
    const kinds = [...new Set([...def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]!))]
    expect(kinds.length, 'no respondent_kind values found in the constraint').toBeGreaterThan(0)
    expect(kinds).toContain('organisation')

    /*
      THE RANGE IS DERIVED, because guessing it cost three runs. `surveys` has a
      floor (`k_threshold >= 2 or respondent_kind = 'organisation'`) and a
      ceiling (`surveys_k_threshold_ceiling`, `k_threshold <= 10`), and a value
      outside either aborts the insert — so the matrix would silently shrink to
      nothing if the bounds moved and this test hard-coded them.
    */
    const bounds = psql(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.surveys'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%k_threshold%'`,
    )
      .map((r) => r[0] ?? '')
      .join(' ')
    const floor = Number(/k_threshold >= (\d+)/.exec(bounds)?.[1] ?? 2)
    const ceiling = Number(/k_threshold <= (\d+)/.exec(bounds)?.[1] ?? 10)
    expect(ceiling, 'no ceiling found').toBeGreaterThan(floor)
    const ks = [...new Set([floor, floor + 1, 5, ceiling])].filter(
      (k) => k >= floor && k <= ceiling,
    )
    const values = kinds
      .flatMap((kind) => ks.map((k) => `('${kind}', ${k})`))
      .join(', ')
    const rows = psql(`
      begin;
      insert into public.surveys (org_id, title, respondent_kind, k_threshold, anonymity)
      select o.id, 'kfor-' || v.kind || '-' || v.k, v.kind, v.k,
             -- surveys_organisation_named refuses an anonymous organisation
             -- survey: an organisation is not a person, so the anonymity
             -- promise does not apply to it. Found by the insert failing.
             -- (No backticks in here: this is inside a JS template literal.)
             (case when v.kind = 'organisation' then 'named' else 'anonymous' end)::app.anonymity_mode
        from (values ${values}) as v(kind, k),
             lateral (select id from public.organizations order by created_at limit 1) o;
      select respondent_kind, k_threshold::text, app.k_for(id)::text
        from public.surveys where title like 'kfor-%';
      rollback;
    `).filter((r) => r.length === 3)

    expect(rows.length, 'no matrix row was evaluated').toBe(kinds.length * ks.length)
    for (const [kind, k, actual] of rows) {
      expect(kForMirror({ respondent_kind: kind!, k_threshold: Number(k) }), `${kind}/k=${k}`).toBe(
        Number(actual),
      )
    }
  })

  it('agrees with the DEPLOYED function on every survey that exists', () => {
    /*
      The matrix above tests the rule as written; this tests the rule as
      DEPLOYED, against real rows — which is what catches a migration that
      changed `k_for` without changing the mirror.
    */
    const rows = psql(
      `select respondent_kind, k_threshold::text, app.k_for(id)::text from public.surveys`,
    )
    expect(rows.length, 'no survey exists, so nothing was compared').toBeGreaterThan(0)
    for (const [kind, k, actual] of rows) {
      expect(
        kForMirror({ respondent_kind: kind!, k_threshold: Number(k) }),
        `survey with kind=${kind} k=${k}`,
      ).toBe(Number(actual))
    }
  })
})
