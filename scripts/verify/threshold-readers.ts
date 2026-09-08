/**
 * The threshold catalogue sweep. Two halves, both DERIVED rather than listed.
 *
 * § 1 (D105) — the complete set of readers and writers of the two threshold
 * columns, derived from `pg_proc` / `pg_constraint` / `pg_trigger`.
 *
 * § 2 (Q91, added after V2-2) — the complete set of APPLICATION surfaces that
 * derive a threshold TIER, derived by walking the source tree. No surface may
 * decide a tier by comparing to a literal; `lib/questions/threshold-tier.ts`
 * owns the boundary and everything else asks it. And the constant it owns is
 * checked against the CHECK constraint in the live catalogue, so the two cannot
 * drift apart silently.
 *
 * The question § 1 answers: does anything CONSTRAIN a survey's threshold
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

/* ── § 2 — TIER DERIVATION ──────────────────────────────────────────────────
 *
 * DECISIONS Q91 gave the threshold three tiers, and the defect that produced
 * `lib/questions/threshold-tier.ts` was not a wrong comparison — it was a
 * CORRECT comparison in one of three copies of the boundary. `anonymityPromise`
 * returned `promiseAnonymousLow` at k=2 because its own `< 5` was doing exactly
 * what it was written to do.
 *
 * So the property is not "the boundary is right". It is: **THERE IS ONLY ONE
 * BOUNDARY, AND EVERY SURFACE ASKS IT.** A surface deciding a tier by comparing
 * a threshold to a literal has made a second copy, whether or not the number in
 * it currently agrees.
 *
 * THE SET OF SURFACES IS DERIVED, NOT LISTED. Walking the tree means a screen
 * added next phase is covered without anyone remembering to add it — which is
 * the whole difference between this and the phrase list that missed four keys
 * in V2-0.
 *
 * COMPARING TO ZERO IS NOT A TIER, AND THAT IS A RULE RATHER THAN AN ALLOWLIST.
 * `app.k_for` returns 0 for an organisation survey (Q17/Q47): 0 means THERE IS
 * NO THRESHOLD, decided by `respondent_kind`, not "a very low one". `k === 0`
 * and `k > 0` are therefore existence checks on a different axis, and six of
 * them exist across the report and dashboard paths. Stating that as a property
 * collapses six allowlist entries into one reason — and an allowlist entry is a
 * place a finding goes to be forgotten.
 */
const TIER_HOME = 'lib/questions/threshold-tier.ts'

/** A threshold-carrying identifier compared against a NON-ZERO numeric literal,
 *  in either order. `\b(k)\b` is deliberately included: the surface this check
 *  was written to catch spells it exactly that way. */
const TIER_LITERAL =
  /\b(k|kThreshold|k_threshold|defaultK|threshold|kFor|orgFloor)\s*(?:<=|>=|<|>|===|!==|==|!=)\s*([1-9][0-9]*)\b|\b([1-9][0-9]*)\s*(?:<=|>=|<|>|===|!==|==|!=)\s*(k|kThreshold|k_threshold|defaultK|threshold|kFor|orgFloor)\b/

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
  }
  // The APPLICATION only. Tests and verify scripts assert specific numbers on
  // purpose — `k_threshold === 8` in a round-trip IS the assertion — and a rule
  // that forbade that would forbid testing the boundary at all.
  for (const root of ['app', 'lib', 'components']) walk(root)
  return out.sort()
}

type Tier = { file: string; line: number; text: string }

/**
 * Comments out, LINE NUMBERS INTACT — every comment body becomes blanks and
 * every newline survives, so a hit still reports the line it is on.
 *
 * Written properly on the first failure rather than worked around: the check
 * initially stripped only `//` and leading `*`, and then flagged the JSX block
 * comment that EXPLAINS this rule, on the very line the rule had just fixed. A
 * sweep that trips over prose describing it teaches people to stop writing the
 * prose, which is the opposite of what this file is for.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

const tierHits: Tier[] = []
for (const file of sourceFiles()) {
  if (file.replace(/\\/g, '/') === TIER_HOME) continue
  const raw = readFileSync(file, 'utf8')
  const code = stripComments(raw).split('\n')
  const shown = raw.split('\n')
  code.forEach((text, i) => {
    if (TIER_LITERAL.test(text)) tierHits.push({ file, line: i + 1, text: shown[i]!.trim() })
  })
}

console.log('\n== § 2  TIER DERIVATION — surfaces deciding a tier by literal\n')
console.log(`  ${sourceFiles().length} source file(s) walked under app/, lib/, components/`)
console.log(`  the boundary lives in ${TIER_HOME}; comparisons against 0 are existence`)
console.log('  checks (app.k_for returns 0 for an organisation survey) and are not tiers.\n')
if (tierHits.length === 0) {
  console.log('  CLEAN — every surface asks thresholdTier(); none carries its own boundary.')
} else {
  for (const h of tierHits) {
    console.log(`  ${h.file}:${h.line}`)
    console.log(`      ${h.text.slice(0, 140)}`)
  }
}

/* The constant against the live catalogue. `threshold-tier.test.ts` asserts
 * THRESHOLD_FLOOR === 2 from the TypeScript side; this asserts the DATABASE
 * agrees, which is the half a unit test structurally cannot reach. Q91 moved
 * both together and the next change has to move both too. */
const floorDef = CHECKS.find(([, name]) => name === 'surveys_k_threshold_floor')?.[2] ?? ''
const dbFloor = Number(/>=\s*([0-9]+)/.exec(floorDef)?.[1] ?? NaN)
const tsFloor = Number(
  /export const THRESHOLD_FLOOR\s*=\s*([0-9]+)/.exec(readFileSync(TIER_HOME, 'utf8'))?.[1] ?? NaN,
)
const floorsAgree = Number.isFinite(dbFloor) && dbFloor === tsFloor

console.log('\n== § 2b  THE CONSTANT AGAINST THE CATALOGUE\n')
console.log(`  surveys_k_threshold_floor : >= ${Number.isFinite(dbFloor) ? dbFloor : '(not found)'}`)
console.log(`  THRESHOLD_FLOOR           : ${Number.isFinite(tsFloor) ? tsFloor : '(not found)'}`)
console.log(`  ${floorsAgree ? 'agree' : 'DISAGREE — the copy and the constraint promise different floors'}`)

if (tierHits.length > 0 || !floorsAgree) {
  console.log(
    `\nVERDICT: ${tierHits.length} surface(s) derive a tier by literal; the floor constant ` +
      `${floorsAgree ? 'agrees with' : 'DISAGREES WITH'} the catalogue.\n` +
      '  A second copy of the boundary is the defect Q91 produced threshold-tier.ts to end.\n',
  )
  process.exit(1)
}
console.log('\nVERDICT: one boundary, asked by every surface, and it agrees with the database.\n')
