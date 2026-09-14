import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, outsiderClient, type Client } from './clients'
import { toJsRegex } from '../../lib/questions/method'

/**
 * V6-3 — `method_rules` (`M:0120`), the Metodikk registry.
 *
 * The evaluator's logic is unit-tested. THIS file reads what actually ships,
 * because Q178–Q182 are claims about the ROWS and «the rule says so» is not
 * evidence that the row does.
 *
 * Every test establishes the thing it is about EXISTS before asserting what is
 * true of it — D158's shape, where four negative tests passed against a database
 * with none of the feature in it.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

let anon: Client, outsider: Client

beforeAll(async () => {
  anon = anonClient()
  outsider = await outsiderClient()
})

describe('V6-3 — the Metodikk registry ships as data, and advises', () => {
  it('1. the registry is populated — so everything below refuses something real', () => {
    const n = Number(psql('select count(*) from public.method_rules')[0]![0])
    expect(n, 'no method rule exists, so every assertion below is vacuous').toBeGreaterThan(0)
    expect(n).toBe(11)
  })

  it('2. Q178 — NO ROW CAN EVER BE A BLOCKER, and the database enforces it', () => {
    // Not «no row is blokkert today»: the CHECK makes the severity
    // unrepresentable, so the decision survives a future seed that forgets it.
    const sev = psql('select distinct severity from public.method_rules').map((r) => r[0])
    expect(sev.sort()).toEqual(['advarsel', 'forslag'])

    const def = psql(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.method_rules'::regclass and contype = 'c'`,
    )
      .map((r) => r[0])
      .join(' ')
    expect(def).toMatch(/severity/)
    expect(def).toMatch(/advarsel/)
    expect(def).toMatch(/forslag/)
    expect(def, 'a blocking severity must be unrepresentable').not.toMatch(/blokkert/)
  })

  it('3. THE rank→ranking FINDING — every type a rule names is a type the enum holds', () => {
    /*
      The bundle's rule tests `q.type === "rank"`; our enum value is `ranking`.
      As drawn it would have fired on NOTHING — in a bundle that also made it a
      publish blocker. A rule written against an identifier nobody checked is a
      rule that silently does nothing, so this asserts the join rather than the
      spelling.
    */
    const enumTypes = psql(
      `select unnest(enum_range(null::app.question_type))::text`,
    ).map((r) => r[0]!)
    expect(enumTypes.length).toBeGreaterThan(0)

    const rows = psql(
      `select key, config->>'types' from public.method_rules where kind = 'type_in'`,
    )
    expect(rows.length, 'no type_in rule exists').toBeGreaterThan(0)
    for (const [key, json] of rows) {
      for (const t of JSON.parse(json ?? '[]') as string[]) {
        expect(enumTypes, `${key} names type «${t}», which the enum does not hold`).toContain(t)
      }
    }
    // And the one that caused it is spelled the product's way.
    expect(
      psql(`select config->>'types' from public.method_rules where key = 'ranking_drag'`)[0]![0],
    ).toBe('["ranking"]')
  })

  it('4. Q179 — the four types the bundle blocks are still first-class', () => {
    const enumTypes = psql(
      `select unnest(enum_range(null::app.question_type))::text`,
    ).map((r) => r[0]!)
    for (const t of ['matrix', 'slider', 'ranking', 'dropdown']) {
      expect(enumTypes, t).toContain(t)
    }
  })

  it('5. Q180 — the order rule carries its own exemption for a locked policy', () => {
    const cfg = psql(
      `select config::text from public.method_rules where kind = 'sensitive_position'`,
    )
    expect(cfg.length, 'no order rule exists').toBeGreaterThan(0)
    for (const [json] of cfg) {
      expect(JSON.parse(json!).exempt_policy_locked).toBe(true)
    }
  })

  it('6. Q181/Q182 — NO EMPIRICAL FIGURE SHIPS', () => {
    /*
      «69 % høyere andel ubesvarte», «OR 1,77», «kvalitetskoeffisient 0,74–0,89
      mot 0,18–0,51», «~30 px trykkflater», «10–15 prosentpoeng». Each is a
      claim about the world carrying a number a customer could check, and
      nothing in this repository sources any of them.

      **The property is NOT «no digits».** «Skala 0–10 på én rad» names the
      scale's actual range, which is a fact about our own control and stays. So
      this forbids the SHAPES an empirical claim takes: a percentage, an odds
      ratio, a decimal coefficient, a pixel measurement, a percentage-point
      prediction.
    */
    const rows = psql(`select key, title || ' ' || why || ' ' || fix from public.method_rules`)
    expect(rows.length).toBeGreaterThan(0)
    for (const [key, text] of rows) {
      expect(text, `${key} ships a percentage`).not.toMatch(/%|prosent(poeng)?\b/i)
      expect(text, `${key} ships an odds ratio`).not.toMatch(/\bOR\s*\d/i)
      expect(text, `${key} ships a decimal figure`).not.toMatch(/\d+[.,]\d/)
      expect(text, `${key} ships a pixel measurement`).not.toMatch(/\bpx\b/i)
      expect(text, `${key} ships a doubling claim`).not.toMatch(/doblet|dobbelt så/i)
    }
    // And the exact strings the sweep found, by name.
    const all = rows.map((r) => r[1]).join(' ')
    for (const s of ['69', '1,77', '0,74', '0,18', '30 px', '10–15']) {
      expect(all, `the bundle's «${s}» reached a shipped row`).not.toContain(s)
    }
  })

  it('7. every seeded pattern COMPILES — the swallow never fires on our own data', () => {
    /*
      `toJsRegex` returns null on a pattern it cannot compile, which would
      silently disable a rule. That is only acceptable if a test proves the
      swallowed case does not occur, and the assertion must be CATALOGUE-DERIVED
      rather than a list — D115's discipline, applied to a second table.
    */
    const rows = psql(
      `select key, config->>'pattern' from public.method_rules where config ? 'pattern'`,
    )
    expect(rows.length, 'no rule carries a pattern').toBeGreaterThan(0)
    for (const [key, pattern] of rows) {
      expect(toJsRegex(pattern!), `${key} has a pattern that does not compile`).not.toBeNull()
    }
  })

  it('8. RLS is on, and the only thing permitted is SELECT', () => {
    // `::text` on a boolean is 'true', not 't' — psql's -tA does no coercion
    // of its own. Written as what the query actually returns.
    const rls = psql(
      `select relrowsecurity::text from pg_class where oid = 'public.method_rules'::regclass`,
    )[0]?.[0]
    expect(rls).toBe('true')

    const cmds = psql(
      `select cmd from pg_policies where schemaname='public' and tablename='method_rules'`,
    ).map((r) => r[0])
    expect(cmds.length, 'no policy exists').toBeGreaterThan(0)
    expect([...new Set(cmds)], 'a registry nobody writes must permit only SELECT').toEqual([
      'SELECT',
    ])
  })

  it('9. a signed-in user of ANY org reads it; anon does not', async () => {
    // It is a shipped registry, so an outsider reading it is correct — that is
    // why it is allowlisted in 5a3 rather than treated as tenant data. But a
    // methodology rule is not respondent-facing, so anon gets nothing.
    const { data: seen } = await outsider.from('method_rules').select('key')
    expect((seen ?? []).length, 'an authenticated user reads the registry').toBe(11)

    const { data: none } = await anon.from('method_rules').select('key')
    expect((none ?? []).length, 'anon must not read the registry').toBe(0)
  })

  it('10. it carries nothing tenant-shaped — the allowlist reason, CHECKED', () => {
    // The same check `use_cases`, `task_kinds` and `workspaces` get: a registry
    // is allowlisted because it holds no org id, no survey id and no number,
    // and that is measured rather than trusted.
    const cols = psql(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='method_rules'`,
    ).map((r) => r[0]!)
    expect(cols.length).toBeGreaterThan(0)
    for (const c of cols) {
      expect(c, `method_rules.${c} looks tenant-scoped`).not.toMatch(
        /org|survey|count|threshold|total|member/i,
      )
    }
  })
})
