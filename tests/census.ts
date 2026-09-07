import { readFileSync } from 'node:fs'
import type { File, Reporter } from 'vitest'

/**
 * Fails the run when a file collects FEWER tests than it is committed to.
 *
 * Every probe bug in this project so far shares one root cause: a test that
 * passed for a reason other than the behaviour under test. The worst version of
 * that is a file collecting nothing at all — a fixture that throws in
 * `beforeAll` reports "27 skipped" or "0 collected", vitest exits green for the
 * other files, and the suite says success while an entire surface went
 * unchecked. It happened twice here: report-rls collected 27 as skipped on a
 * UNIQUE collision, and policy-coverage collected 46 as zero when a helper read
 * the fixture before `beforeAll` built it.
 *
 * A committed count makes that impossible to miss and costs one number per file.
 *
 * IT HAS NOW PAID FOR ITSELF TWICE, both times on the SKIPPED path, which is
 * the one it exists for — a skipped test is green to vitest and absent to the
 * surface it was meant to cover:
 *
 *   Phase 7  `report-rls` collected 27 as SKIPPED on a UNIQUE collision, and
 *            `policy-coverage` collected 46 as zero when a helper read the
 *            fixture before `beforeAll` built it.
 *   V1-5     `use-cases.test.ts` came back 9 SKIPPED after a `supabase db
 *            reset` wiped the demo personas, so `personaClient` threw in
 *            `beforeAll`. Every other file passed; the run would have read as
 *            success with an entire decision unverified.
 *
 * Which is why `countTests` counts skipped tests as EXISTING. Counting them as
 * absent would hide precisely the failure this reporter is for, and both
 * occasions above would have been silent.
 *
 * Growth is fine and needs no ceremony — adding tests must never fail a run.
 * A DROP fails, and so does a file that has vanished from the run entirely,
 * because "the file stopped existing" and "the file stopped collecting" look
 * identical from the outside and both mean a surface is no longer covered.
 *
 * A new file must be added to the manifest. That is the point rather than a
 * chore: it is the same rule Gate 5a3 applies to database surfaces — new things
 * arrive failing until someone states what they are worth.
 *
 * ---------------------------------------------------------------------------
 * KNOWN LIMIT, AND THE FIX, TO BE APPLIED THE NEXT TIME THIS FILE IS TOUCHED
 * (Tor, 2026-09-07, after V1-3). Not a separate errand — do it in the same
 * commit as whatever brings you here next.
 *
 * Because only a DROP fails, a manifest entry that drifts UPWARD is invisible.
 * V1-3 found two: `recurrence.test.ts` was committed at 7 while collecting 9,
 * and the run stayed green for a fortnight. So the number this reporter defends
 * is evidence that tests were not DELETED. It is not evidence that they were
 * all counted, and the phase reports must not claim otherwise.
 *
 * THE FIX IS TO GENERATE THE MANIFEST RATHER THAN MAINTAIN IT, so a stale entry
 * cannot exist. A hand-kept number can be wrong; a written-back one cannot.
 * Add a `--write` mode that serialises the observed counts back to MANIFEST and
 * wire it to a script; committing the regenerated file is then the ceremony,
 * replacing the hand edit. This is a change to something that already runs, not
 * a new gate — the freeze permits it on exactly that ground.
 *
 * ONE THING THE FIX MUST NOT DO: regenerate on an ordinary run. If every run
 * rewrote the file, a file that shrank would have its number quietly lowered
 * and the floor — the whole purpose of this reporter — would be gone. Writing
 * back is an explicit act; the default path still reads the committed file and
 * still fails on a drop.
 * ---------------------------------------------------------------------------
 */
const MANIFEST = 'tests/expected-counts.json'

export default class CensusReporter implements Reporter {
  private root = ''

  onInit(ctx: { config: { root: string } }) {
    this.root = ctx.config.root
  }

  onFinished(files: File[] = []) {
    let expected: Record<string, number>
    try {
      expected = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, number>
    } catch {
      console.error(`\ncensus: ${MANIFEST} is missing or unreadable — cannot verify test counts.`)
      process.exitCode = 1
      return
    }

    const seen = new Map<string, number>()
    for (const f of files) {
      const rel = f.filepath.replace(`${this.root}/`, '')
      seen.set(rel, countTests(f))
    }

    const problems: string[] = []

    // A partial run is legitimate — `verify:db` runs tests/invariants and
    // tests/db and never touches tests/unit. So a directory none of whose files
    // ran was not part of this run; a directory where SOME ran and one did not
    // is a file that stopped collecting, which is the case worth failing on.
    const dirsInRun = new Set([...seen.keys()].map(dirOf))

    for (const [file, want] of Object.entries(expected)) {
      if (!seen.has(file)) {
        if (dirsInRun.has(dirOf(file))) {
          problems.push(`${file}: expected ${want} tests, the file did not run at all`)
        }
        continue
      }
      const got = seen.get(file)!
      if (got < want) problems.push(`${file}: expected at least ${want} tests, collected ${got}`)
    }

    for (const [file, got] of seen) {
      if (!(file in expected)) {
        problems.push(`${file}: ${got} tests, not in ${MANIFEST} — add it with its count`)
      }
    }

    if (problems.length) {
      console.error(`\ncensus: ${problems.length} problem(s) with collected test counts`)
      for (const p of problems) console.error(`  - ${p}`)
      console.error(
        '\nA file that collects fewer tests than committed has stopped checking something.\n' +
          `If the drop is intended, lower the number in ${MANIFEST} in the same commit.`,
      )
      process.exitCode = 1
    }
  }
}

const dirOf = (file: string) => file.slice(0, file.lastIndexOf('/'))

/** Tests in a file, counting nested suites and INCLUDING skipped ones: a test
 *  skipped by a failing hook still exists, and counting it as absent would hide
 *  exactly the failure this reporter is for. */
function countTests(node: { tasks?: unknown[]; type?: string }): number {
  const tasks = (node.tasks ?? []) as { type?: string; tasks?: unknown[] }[]
  let n = 0
  for (const t of tasks) {
    if (t.type === 'suite') n += countTests(t)
    else n += 1
  }
  return n
}
