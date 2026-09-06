/**
 * "Missing dependency" must never look like "failing check".
 *
 * Three of the verifiers reach outside the app for something the local stack
 * does not start by default — Mailpit for `verify:send`, Storage for
 * `verify:export`, WebKit for the visual suite's mobile project. When one is
 * absent, the check it feeds reports as a FAIL with a plausible-looking detail
 * ("the worker drains the queue: smtp: Error", "only the writing role archived
 * its exports: "), which costs review attention on a phantom defect — and, in
 * the other direction, is exactly how a real failure gets waved away as "just
 * the environment".
 *
 * So each verifier states its dependencies up front and refuses to start
 * without them, naming which one is missing and how to get it. The exit is
 * distinguishable by design: a dependency problem prints `DEPENDENCY MISSING`
 * and never reaches a single `check(...)` line, so nothing that follows can be
 * read as a verdict on the code.
 *
 * The converse is the point of it: once the preflight passes, every FAIL below
 * it is about the application, and cannot be explained away.
 *
 * This is not a gate. It runs inside the checks VERIFY.md already defines,
 * adds no assertions of its own, and cannot fail a run that would otherwise
 * pass — it can only turn a misleading failure into an accurate one.
 */

export type Dependency = {
  /** What is missing, in the words the reader will search for. */
  name: string
  /** Where the verifier expects to find it. */
  where: string
  /** Proves it is actually there — not merely that a port is bound. */
  probe: () => Promise<boolean>
  /** The exact command that provides it. */
  howto: string
}

/** A TCP/HTTP probe that treats any answer as present and any refusal as absent. */
export async function reachable(url: string, timeoutMs = 3000): Promise<boolean> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    await fetch(url, { signal: ac.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

/**
 * Checks every dependency before the verifier does anything else. Missing ones
 * are reported together — a developer who is short Mailpit is usually short
 * Storage too, and finding that out one run at a time is the annoyance this
 * avoids.
 */
export async function requireDependencies(gate: string, deps: Dependency[]): Promise<void> {
  const results = await Promise.all(deps.map(async (d) => [d, await d.probe()] as const))
  const missing = results.filter(([, ok]) => !ok).map(([d]) => d)
  if (missing.length === 0) return

  console.error(`\nDEPENDENCY MISSING — ${gate} did not run.\n`)
  for (const d of missing) {
    console.error(`  ${d.name}`)
    console.error(`    expected at : ${d.where}`)
    console.error(`    provide it  : ${d.howto}\n`)
  }
  console.error(
    `This is NOT a check failure: ${gate} stopped before its first assertion, so it\n` +
      `has said nothing about the application. Install the above and re-run — and if a\n` +
      `check fails once they are present, that failure is real.\n`,
  )
  process.exit(2)
}
