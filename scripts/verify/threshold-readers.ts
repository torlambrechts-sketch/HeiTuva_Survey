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
 * ── WHICH PART OF THIS FILE IS LOAD-BEARING, BEFORE YOU EXTEND IT ───────────
 *
 * **§ 2c is. § 2 is a symptom check and will always be one.**
 *
 * § 2 greps source text, and the day after it was written it reported «one
 * boundary, asked by every surface» over FIVE stale sites — `app.k_for` plus
 * four `Math.max(k_threshold, 3)` mirrors — because its regex required a
 * comparison operator and `Math.max(k, 3)` has none. Adding `FLOOR_MIRROR`
 * fixed that instance. It did not fix the class: clamping and comparing are the
 * same act in two syntaxes, and there is always a third
 * (`k_threshold ?? 3`, `Math.min` inverted, a CASE in SQL, a helper called
 * `atLeast`). **A PROPERTY EXPRESSED AS A PATTERN MATCH OVER SOURCE TEXT IS
 * ALWAYS A SYMPTOM OF THE PROPERTY, NEVER THE PROPERTY.** Every pattern added
 * to § 2 buys one more symptom and leaves the class open.
 *
 * § 2c is different in kind. It reads `app.k_for`'s body out of `pg_proc` and
 * asks what the function IS, on the live catalogue, in whatever syntax someone
 * wrote it. That is the measurement; § 2 is a net for the cases the measurement
 * cannot reach because they live in TypeScript rather than in the database.
 *
 * **So: extend § 2c first.** If a new rule can be asked of the catalogue — of
 * `pg_proc`, `pg_constraint`, `pg_policies` — ask it there and let § 2 stay the
 * coarse net it is. Adding a sixth regex to § 2 and calling the class closed is
 * how this file failed the first time.
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

/**
 * A FLOOR APPLIED WITHOUT A COMPARISON OPERATOR — `Math.max(k, 3)`, `greatest(k, 3)`.
 *
 * ADDED BECAUSE THE FIRST VERSION OF THIS SWEEP REPORTED CLEAN OVER FIVE LIVE
 * SITES, INCLUDING THE ONE IT WAS WRITTEN TO POLICE. `TIER_LITERAL` requires a
 * comparison operator; `Math.max(kThreshold, 3)` has none, so four TypeScript
 * mirrors of the pre-Q91 floor and `app.k_for`'s own `greatest(s.k_threshold, 3)`
 * all sat under a verdict reading «one boundary, asked by every surface, and it
 * agrees with the database».
 *
 * That is this project's named failure exactly — THE THING THAT REPORTS GREEN IS
 * NOT THE THING UNDER TEST — committed by the check built to prevent it, one day
 * after it was built. A property expressed as one syntax is a syntax list, not a
 * property: clamping and comparing are the same act written two ways.
 */
const FLOOR_MIRROR =
  /(?:Math\.max|greatest)\s*\(\s*[^),]*\b(k|kThreshold|k_threshold|defaultK|threshold)\b[^),]*,\s*([1-9][0-9]*)\s*\)/i

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
    if (TIER_LITERAL.test(text) || FLOOR_MIRROR.test(text))
      tierHits.push({ file, line: i + 1, text: shown[i]!.trim() })
  })
}

console.log('\n== § 2  TIER DERIVATION — surfaces deciding a tier by literal\n')
console.log(`  ${sourceFiles().length} source file(s) walked under app/, lib/, components/`)
console.log(`  the boundary lives in ${TIER_HOME}; comparisons against 0 are existence`)
console.log('  checks (app.k_for returns 0 for an organisation survey) and are not tiers.')
console.log('  BOTH SHAPES are caught: a comparison (k < 5) and a clamp (Math.max(k, 3)).\n')
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

/* ── § 2c — THE GATE'S FLOOR AGREES WITH THE CHECK ─────────────────────────
 *
 * CORRECTED AT F8.1, AND THE CORRECTION IS A REVERSAL. What follows is what
 * this section used to assert, kept because a rule replaced silently is a rule
 * nobody can re-derive:
 *
 *   «So the floor must not live in `app.k_for` AT ALL. The CHECK guarantees
 *    `k_threshold >= 2` for every person survey, which makes a clamp inside the
 *    gate a second copy of a bound that has now gone stale once.»
 *
 * That was written 2026-09-14 (V6-4, b534337). T1.2 decided the opposite on
 * 2026-09-18 (M:0130, 12d3101), in the migration's own words:
 *
 *   «The floor is applied HERE as well as in the CHECK, deliberately. Two
 *    mechanisms, not one: if the constraint is ever dropped by a migration
 *    meaning well, every result read still refuses below 2 for a person.»
 *
 * T1.2 is the later decision and it governs. The gate MUST clamp.
 *
 * ── WHAT THE OLD RULE WAS ACTUALLY PROTECTING, WHICH SURVIVES ──────────────
 *
 * The danger was never that a clamp EXISTS. It was that a second copy of a
 * bound can DISAGREE with the first — `app.k_for` carried Q17's 3 for a full
 * phase after Q91 moved the floor to 2, so the CHECK said 2, the copy warned
 * about 2, and the gate applied 3. Absence was one way to guarantee agreement;
 * it was not the only one, and it is no longer available.
 *
 * So this section now measures AGREEMENT rather than absence: the clamp must be
 * there, and its constant must equal the CHECK's own bound read out of
 * `pg_constraint` in § 2b. That catches the exact 2-vs-3 divergence the old
 * rule existed for, and it catches it whichever of the two moves. Inverting the
 * boolean alone would have bought a green gate and lost the guard — the same
 * choice as «fix the column, not the predicate» one level up.
 *
 * AND THE CLAMP MAKES THE ORGANISATION BRANCH LOAD-BEARING. `greatest(k, 2)`
 * applied to an organisation survey would impose a floor on a respondent kind
 * invariant 1 puts OUTSIDE k entirely. The branch returning 0 is what keeps
 * that from happening, so it is asserted here: it was decoration before the
 * clamp and it is a guard after it.
 */
const kForBody = psql(
  `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'k_for'`,
)[0]?.[0] ?? ''
const clampMatch = FLOOR_MIRROR.exec(kForBody)
const gateClampValue = clampMatch ? Number(clampMatch[2]) : NaN
const gateClamps = clampMatch !== null
// T1.2's second mechanism only holds for a NATURAL PERSON. An organisation is
// outside k, and the 0 branch is what stops the clamp reaching it.
const orgBranchIntact = /respondent_kind\s*=\s*'organisation'\s*then\s*0/i.test(kForBody)
const gateFloorAgrees = gateClamps && Number.isFinite(dbFloor) && gateClampValue === dbFloor

console.log("\n== § 2c  THE GATE CLAMPS, AND ITS FLOOR AGREES WITH THE CHECK\n")
console.log(`  app.k_for clamp           : ${gateClamps ? `greatest(..., ${gateClampValue})` : 'ABSENT — T1.2 requires two mechanisms, not one'}`)
console.log(`  surveys_k_threshold_floor : >= ${Number.isFinite(dbFloor) ? dbFloor : '(not found)'}`)
console.log(`  ${gateFloorAgrees ? 'agree' : 'DISAGREE — a second copy of the boundary has gone stale, which is the 2-vs-3 defect'}`)
console.log(`  organisation branch       : ${orgBranchIntact ? 'returns 0 — the clamp cannot reach a legal entity' : 'MISSING — greatest() would impose a floor on a kind outside k'}`)

if (tierHits.length > 0 || !floorsAgree || !gateFloorAgrees || !orgBranchIntact) {
  console.log(
    `\nVERDICT: ${tierHits.length} surface(s) derive a tier by literal; the copy constant ` +
      `${floorsAgree ? 'agrees with' : 'DISAGREES WITH'} the catalogue; the gate ` +
      `${!gateClamps ? 'DOES NOT CLAMP' : gateFloorAgrees ? 'clamps at the CHECK\'s own floor' : `clamps at ${gateClampValue} while the CHECK says ${dbFloor}`}` +
      `${orgBranchIntact ? '' : '; THE ORGANISATION BRANCH IS GONE'}.\n` +
      '  Two mechanisms are T1.2\'s decision (M:0130). Two mechanisms that DISAGREE\n' +
      '  is the defect Q91 produced threshold-tier.ts to end.\n',
  )
  process.exit(1)
}
console.log('\nVERDICT: one boundary value, mirrored deliberately in two mechanisms that agree.\n')
