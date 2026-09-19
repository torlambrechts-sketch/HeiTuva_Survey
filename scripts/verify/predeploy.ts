#!/usr/bin/env tsx
/**
 * verify:predeploy — WHAT THE DEPLOYED CODE NEEDS, AGAINST WHAT THE TARGET HAS.
 *
 * ── WHY THIS EXISTS (F8.4) ────────────────────────────────────────────────
 *
 * Every phase verified production's CATALOGUE against the migration FILES.
 * A1's content diff, F7's rollups — both compare a database to a repository.
 * **Nothing compared it to the DEPLOYED CODE**, and that is the gap that took
 * `/undersokelser` down on 2026-09-19:
 *
 *   - T3.1's page.tsx called `survey_scale_means`
 *   - production had no such function (M:0131 was unapplied)
 *   - the Vercel build at 2202dd2 was GREEN, because a `.rpc('name')` string is
 *     not type-checked against any database
 *   - the screen returned HTTP 500 to every signed-in user
 *
 * `tsc` cannot catch it: `supabase.rpc('survey_scale_means', …)` is a string
 * literal, and `types/database.ts` is generated from whatever database the
 * generator was last pointed at — LOCAL. So the type system confirms the call
 * matches the LOCAL schema and says nothing about the one being deployed to.
 *
 * This is the eighth instance of «green for something that structurally could
 * not be seen», with the unseen thing being the target database itself.
 *
 * ── NOT PART OF THE APPARATUS ─────────────────────────────────────────────
 *
 * NOT one of VERIFY.md's seven gates. NOT in `verify:all`. It answers a
 * different question from every gate there — not «is the code correct» but «is
 * the database this code is about to run against ready for it» — and it is the
 * only check in the project that names a DEPLOY TARGET.
 *
 * ── HOW IT REACHES PRODUCTION, WHICH IS THE AWKWARD PART ──────────────────
 *
 * CLAUDE.md records as settled that **TCP 5432 does not leave a Claude Code
 * container**, by any hostname, IPv4 pooler included. So this cannot simply
 * connect to production. Three modes, in order of convenience:
 *
 *   --db=<url>          query the catalogue directly with psql. Works for the
 *                       local stack, and for production from any machine or CI
 *                       runner that HAS a Postgres route.
 *   --emit-sql          print the catalogue query and exit. Run it through the
 *                       Supabase MCP (which speaks HTTPS to api.supabase.com
 *                       and needs no socket) and save the JSON.
 *   --catalogue=<path>  compare against that saved JSON.
 *
 * PostgREST's OpenAPI document was tried first and REJECTED, and the reason is
 * worth keeping: **it is ROLE-SCOPED.** Asked with the service_role key it
 * lists 12 functions, and `survey_scale_means` is not among them — because that
 * function is granted to `authenticated` alone. A gate built on it would report
 * a function missing from a production that has it, and block every deploy.
 * «The thing measured was not the thing claimed», caught before it shipped.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const ROOTS = ['app', 'lib', 'components']

/* ── THE CATALOGUE QUERY ───────────────────────────────────────────────────
 * One statement, one JSON value, so it survives both psql and the MCP
 * unchanged. Functions are taken from `pg_proc` rather than from anything
 * role-scoped: what matters is whether the function EXISTS to be called. */
const CATALOGUE_SQL = `
select json_build_object(
  'functions', (select coalesce(json_agg(distinct p.proname order by p.proname),'[]'::json)
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'),
  'columns',   (select coalesce(json_agg(c.table_name || '.' || c.column_name order by c.table_name || '.' || c.column_name),'[]'::json)
                  from information_schema.columns c
                 where c.table_schema = 'public'),
  'relations', (select coalesce(json_agg(distinct t.table_name order by t.table_name),'[]'::json)
                  from information_schema.tables t
                 where t.table_schema = 'public')
)::text`.trim()

/* ── 1. WHAT THE CODE REQUIRES ─────────────────────────────────────────────
 * Swept off the source rather than from a list somebody maintains, so a new
 * call site is covered by existing in the tree — the catalogue-derived shape
 * this project uses for its other sweeps. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}

/** Strip `--` and block comments: a file that documents a refusal contains the
 *  string it refuses, and this project has been bitten by that three times. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

type Req = { kind: 'function' | 'relation' | 'column'; name: string; where: string }
const required: Req[] = []

/** Split a PostgREST select list on TOP-LEVEL commas only, so an embedded
 *  `groups!hint(name)` stays one token instead of becoming two columns. */
function splitTop(sel: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of sel) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

function walkSelect(table: string, sel: string, where: string) {
  for (const rawTok of splitTop(sel)) {
    const tok = rawTok.trim()
    if (!tok || tok === '*') continue
    const nested = /^([A-Za-z_][A-Za-z0-9_]*)(?:![A-Za-z0-9_]+)?\s*\(([\s\S]*)\)$/.exec(tok)
    if (nested) {
      // An embedded resource: its own relation, and its own columns.
      required.push({ kind: 'relation', name: nested[1]!, where })
      walkSelect(nested[1]!, nested[2]!, where)
      continue
    }
    // `alias:column` — the column is the right-hand side.
    const col = (tok.includes(':') ? tok.split(':').pop()! : tok).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) continue
    if (col === 'count') continue // an aggregate, not a column
    required.push({ kind: 'column', name: `${table}.${col}`, where })
  }
}

for (const root of ROOTS) {
  for (const file of sourceFiles(root)) {
    const text = stripComments(readFileSync(file, 'utf8'))

    for (const m of text.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/g))
      required.push({ kind: 'function', name: m[1]!, where: file })

    // Pair each `.from('t')` with the nearest following `.select('…')` before
    // the next `.from(`. A heuristic, stated as one: a select built from a
    // variable, or split across a builder, is not visible here.
    const froms = [...text.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g)]
    froms.forEach((m, i) => {
      const table = m[1]!
      required.push({ kind: 'relation', name: table, where: file })
      const end = i + 1 < froms.length ? froms[i + 1]!.index! : text.length
      const window = text.slice(m.index! + m[0].length, end)
      const sel = /\.select\(\s*'([^']*)'/.exec(window)
      if (sel) walkSelect(table, sel[1]!, file)
    })
  }
}

/* ── 2a. --emit-sql — ASK THE TARGET TO DO THE DIFF ────────────────────────
 *
 * The requirements travel TO the database and only the MISSING rows come back.
 * That matters for the production mode: the full catalogue is ~15 KB of names
 * that would have to be copied back by hand through the MCP, and hand-copying
 * a payload is the failure `scripts/edge-bundle.ts` exists to prevent. This way
 * the answer is a handful of rows, or none. */
if (args.includes('--emit-sql')) {
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`
  const tuples = [...new Set(required.map((r) => `${r.kind}\u0000${r.name}`))]
    .sort()
    .map((k) => { const [kind, name] = k.split('\u0000') as [string, string]; return `(${lit(kind)},${lit(name)})` })
  console.log(`-- verify:predeploy — ${tuples.length} requirements swept from app/, lib/, components/.
-- Returns one row per object the CODE needs and the TARGET lacks. No rows = ready to deploy.
with required(kind, name) as (values\n  ${tuples.join(',\n  ')}\n),
have(kind, name) as (
  select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  union all
  select 'relation', t.table_name::text from information_schema.tables t where t.table_schema = 'public'
  union all
  select 'column', c.table_name || '.' || c.column_name from information_schema.columns c where c.table_schema = 'public'
)
select r.kind, r.name from required r
where not exists (select 1 from have h where h.kind = r.kind and h.name = r.name)
order by r.kind, r.name;`)
  process.exit(0)
}

/* ── 2b. WHAT THE TARGET HAS ───────────────────────────────────────────────*/
let raw: string
const catFile = argOf('catalogue')
if (catFile) {
  raw = readFileSync(catFile, 'utf8')
} else {
  const db = argOf('db') ?? process.env.LOCAL_DB_URL ?? process.env.SUPABASE_DB_URL
  if (!db) {
    console.error('predeploy: give --db=<url>, --catalogue=<file>, or set LOCAL_DB_URL.')
    console.error('           --emit-sql prints the query to run through the Supabase MCP.')
    process.exit(2)
  }
  raw = execFileSync('psql', [db, '-At', '-c', CATALOGUE_SQL], { encoding: 'utf8' })
}
// Accept the MCP's row wrapper as well as a bare object, since the two
// transports render the same query differently.
let parsed: unknown = JSON.parse(raw.trim())
if (Array.isArray(parsed)) parsed = (parsed[0] as Record<string, unknown>)
const firstVal = Object.values(parsed as Record<string, unknown>)[0]
if (typeof firstVal === 'string' && firstVal.trim().startsWith('{')) parsed = JSON.parse(firstVal)
const cat = parsed as { functions: string[]; columns: string[]; relations: string[] }

const have = {
  function: new Set(cat.functions ?? []),
  column: new Set(cat.columns ?? []),
  relation: new Set(cat.relations ?? []),
}

/* ── 3. THE COMPARISON ─────────────────────────────────────────────────────*/
const label = catFile ? `catalogue ${catFile}` : (argOf('db') ? 'the named database' : 'LOCAL_DB_URL')
console.log(`\n== verify:predeploy — the deployed code against ${label}\n`)

const missing: Req[] = []
const seen = new Set<string>()
for (const r of required) {
  const key = `${r.kind}:${r.name}`
  if (seen.has(key)) continue
  seen.add(key)
  if (!have[r.kind].has(r.name)) missing.push(r)
}

for (const kind of ['function', 'relation', 'column'] as const) {
  const req = [...new Set(required.filter((r) => r.kind === kind).map((r) => r.name))]
  const miss = missing.filter((m) => m.kind === kind)
  console.log(`  ${kind.padEnd(9)} required ${String(req.length).padStart(4)}   present ${String(req.length - miss.length).padStart(4)}   MISSING ${miss.length}`)
}

if (missing.length > 0) {
  console.log('\n  ABSENT FROM THE TARGET — deploying this code would 500 on these:\n')
  for (const m of missing) console.log(`    ${m.kind.padEnd(9)} ${m.name.padEnd(46)} ${m.where}`)
  console.log(
    '\nVERDICT: the target database is BEHIND the code. Apply the missing migrations\n' +
      '  before deploying, or the screens that call these will return 500 while the\n' +
      '  build stays green.\n',
  )
  process.exit(1)
}
console.log('\nVERDICT: every function, relation and column the code calls exists on the target.\n')
