/**
 * D105 § 2 — the complete set of readers and writers of the two threshold
 * columns, derived from the catalogue rather than from reading.
 *
 * The question this answers: does anything CONSTRAIN a survey's threshold
 * against the organisation's default, or does the default only SEED?
 *
 * "I looked and found nothing" is not an answer to that — an absence is the
 * one claim reading is worst at supporting, which is the lesson this session
 * opened with. So the set is enumerated from `pg_proc`, `pg_constraint` and
 * `pg_trigger`, and every member is classified. A reader added later shows up
 * here without anyone remembering to look.
 *
 *   npx tsx scripts/verify/threshold-readers.ts
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(sql: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-At', '-R', '', '-F', '', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  // A real RECORD separator too: a function body contains newlines, so splitting
  // rows on '\n' shreds one function into dozens of "rows". The first run of this
  // script did exactly that and printed a confident VERDICT on top of the wreckage.
  return out
    .split('')
    .filter((r) => r.trim().length > 0)
    .map((row) => row.split(''))
}

/** Every function whose body mentions either column, with the body, so each can
 *  be classified rather than guessed at. */
const FUNCS = psql(`
  select n.nspname, p.proname, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','app')
     and (p.prosrc ~ 'default_k_threshold' or p.prosrc ~ 'k_threshold')
   order by 1, 2`)

/** Every CHECK constraint on either column. */
const CHECKS = psql(`
  select c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)
    from pg_constraint c
   where c.contype = 'c'
     and pg_get_constraintdef(c.oid) ~ 'k_threshold'
   order by 1, 2`)

/** Every trigger on the two tables that could touch either column. */
const TRIGGERS = psql(`
  select t.tgrelid::regclass::text, t.tgname, p.proname
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal
     and t.tgrelid in ('public.surveys'::regclass, 'public.organizations'::regclass)
   order by 1, 2`)

/** Application writers: any .ts/.tsx that updates either column. Source scan,
 *  because a server action is not in the catalogue. */
function appWriters(): string[] {
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) {
        const src = readFileSync(p, 'utf8')
        if (/k_threshold/.test(src) && /\.update\(|\.insert\(|\.upsert\(/.test(src)) hits.push(p)
      }
    }
  }
  for (const root of ['app', 'lib', 'scripts']) walk(root)
  return hits.sort()
}

/**
 * SEEDS  — writes a value once, at creation, and constrains nothing after.
 * BOUNDS — refuses a value, i.e. actually constrains.
 * READS  — consumes the value without writing it.
 */
function classify(body: string): 'BOUNDS' | 'SEEDS' | 'READS' {
  const writesSurvey = /new\.k_threshold\s*:=/.test(body)
  const raises = /raise exception/i.test(body)
  const mentionsDefault = /default_k_threshold/.test(body)
  if (raises && /k_threshold/.test(body)) return 'BOUNDS'
  if (writesSurvey) return mentionsDefault ? 'SEEDS' : 'SEEDS'
  return 'READS'
}

console.log('\n== FUNCTIONS mentioning a threshold column\n')
let boundsAgainstOrgDefault = 0
for (const [schema, name, body] of FUNCS) {
  const kind = classify(body!)
  const usesDefault = /default_k_threshold/.test(body!)
  // The question: does anything BOTH bound and reference the org default?
  const bounding = kind === 'BOUNDS' && usesDefault
  if (bounding) boundsAgainstOrgDefault++
  console.log(
    `  ${kind.padEnd(7)} ${schema}.${name}` +
      (usesDefault ? '   [reads organizations.default_k_threshold]' : '') +
      (bounding ? '   <-- BOUNDS A SURVEY AGAINST THE ORG DEFAULT' : ''),
  )
}

console.log('\n== CHECK constraints on a threshold column\n')
for (const [table, name, def] of CHECKS) {
  const refsDefault = /default_k_threshold/.test(def!) && table !== 'organizations'
  if (refsDefault) boundsAgainstOrgDefault++
  console.log(`  ${table}.${name}\n      ${def}`)
}

console.log('\n== TRIGGERS on surveys / organizations\n')
for (const [table, name, fn] of TRIGGERS) console.log(`  ${table}  ${name} -> ${fn}`)

console.log('\n== APPLICATION writers (source scan)\n')
for (const f of appWriters()) console.log(`  ${f}`)

console.log(
  `\nVERDICT: ${boundsAgainstOrgDefault} surface(s) constrain a survey's threshold against ` +
    `organizations.default_k_threshold.\n` +
    (boundsAgainstOrgDefault === 0
      ? '  The column SEEDS and does not BOUND. Any copy promising an organisation-level\n' +
        '  floor for individual surveys is describing behaviour that does not exist.\n'
      : '  A floor exists; copy may promise it.\n'),
)
