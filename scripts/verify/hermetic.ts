/**
 * VERIFY.md Gate 5a2 — prove the suite is hermetic.
 *
 * Runs the suite, then a round-trip that deliberately writes extra rows into
 * the same organisation (a second group, another survey, a bank question),
 * then runs the suite again. A suite whose green depends on nothing else
 * existing is not a suite — and this exact shape, `.single()` on a query
 * filtered only by org, is what broke access.test.ts once the Gate 2a
 * round-trip created a second group.
 *
 * Deliberately does NOT reset between runs. The reset is what hides the
 * problem.
 */
import { spawnSync } from 'node:child_process'

function run(label: string, cmd: string, args: string[]): boolean {
  console.log(`\n── ${label} ──`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false })
  const ok = r.status === 0
  console.log(`   ${label}: ${ok ? 'PASS' : 'FAIL'}`)
  return ok
}

const first = run('1. suite on the seeded database', 'npx', ['vitest', 'run'])
const polluted = run('2. round-trip writes extra rows', 'npx', [
  'tsx',
  'scripts/verify/roundtrip.ts',
  '--local',
])
const second = run('3. suite again, without a reset', 'npx', ['vitest', 'run'])

console.log('\n' + '='.repeat(60))
console.log(`suite before pollution : ${first ? 'PASS' : 'FAIL'}`)
console.log(`round-trip wrote rows  : ${polluted ? 'PASS' : 'FAIL'}`)
console.log(`suite after pollution  : ${second ? 'PASS' : 'FAIL'}`)
// The pollution step is the experiment, not a side note: if the round-trip did
// not run, the second suite ran against the same database as the first and its
// green says nothing at all. Reporting HERMETIC on that would be exactly the
// kind of unearned green this gate exists to catch.
if (!polluted) {
  console.log('INCONCLUSIVE: the round-trip did not run, so nothing polluted the database')
  process.exit(1)
}
if (first && second) console.log('HERMETIC: the suite does not depend on a pristine database')
else console.log('NOT HERMETIC')
process.exit(first && second ? 0 : 1)
