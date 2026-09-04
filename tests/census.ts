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
 * Growth is fine and needs no ceremony — adding tests must never fail a run.
 * A DROP fails, and so does a file that has vanished from the run entirely,
 * because "the file stopped existing" and "the file stopped collecting" look
 * identical from the outside and both mean a surface is no longer covered.
 *
 * A new file must be added to the manifest. That is the point rather than a
 * chore: it is the same rule Gate 5a3 applies to database surfaces — new things
 * arrive failing until someone states what they are worth.
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

    for (const [file, want] of Object.entries(expected)) {
      if (!seen.has(file)) {
        // Only a problem when the run should have included it. A targeted
        // `vitest run one.test.ts` legitimately runs one file.
        if (seen.size > 1) problems.push(`${file}: expected ${want} tests, the file did not run at all`)
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
