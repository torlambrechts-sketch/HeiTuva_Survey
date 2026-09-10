/*
  Assembles the deployable `mail-worker` bundle and prints a per-file manifest.

  ── WHY THIS EXISTS ────────────────────────────────────────────────────────

  `supabase/functions/mail-worker/index.ts` imports the provider, the copy and
  the env accessor from `lib/mail/` by relative path, so that the sending logic
  is shared with `scripts/mail-worker.ts` and is covered by Gate 1 and by unit
  tests. The Edge Runtime cannot follow those paths: a deployed function sees
  only the files uploaded beside it. So the bundle is index.ts with its three
  imports rewritten to siblings, plus those siblings copied in.

  With no `SUPABASE_ACCESS_TOKEN` in this environment the CLI cannot deploy, and
  the payload has to be passed through the MCP `deploy_edge_function` call by
  hand. **That is the step that has already gone wrong once**: version 6 shipped
  with several comment blocks shortened, because a hand-transcribed payload is
  easier to manage when it is smaller, and prose is the part that looks safe to
  cut. It is not safe to cut — a comment is where this project keeps the reason
  a line is the way it is, and OPERATIONS.md's rule is that if a payload is too
  large the answer is more calls, not shorter comments.

  A generator alone does not stop that; a generator that prints byte counts and
  md5s does, because it makes «did what I sent match what I generated» a
  question with an answer. Compare this manifest against `get_edge_function`
  after deploying — the same discipline as the ninth check on a migration, where
  an apply is not evidence and a comparison is.

  Note that `types.ts` is NOT imported by the entry point. It reaches the bundle
  as a transitive dependency of `brevo.ts`, written `import type { … } from
  './types'` — extension-less, which the Edge Runtime could not resolve if it
  ever tried to. It never tries: `import type` is erased before resolution, so
  the platform tree-shakes the file out and `get_edge_function` returns four
  files rather than five. Uploading it is still correct — it is what the deploy
  type-checks against — but it is uploaded, not rewritten, and that difference
  is why the two lists below are separate rather than one.

  Usage:  npm run edge:bundle          # writes .edge-bundle/ and prints the manifest
*/
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = '.edge-bundle'

/*
  The rewrite is an allowlist of exactly the three specifiers the worker uses,
  and it ASSERTS each one was found. A regex over `../../../lib/mail/(\w+).ts`
  would be the shorter thing to write and it would silently accept a fourth
  import added later that this script does not copy — which is the enumeration
  shape CLAUDE.md names: the list is right about its members and silent about
  the one that has not arrived. Here the enumeration is declared to BE one, and
  a missing member fails the build rather than shipping a function that throws
  `x is not defined` on its first cold start.
*/
const REWRITTEN = ['brevo', 'copy', 'env'] as const

/*
  Carried for the type-check, never rewritten: nothing in the entry point names
  it. Kept in its own list rather than folded into the one above, because the
  assertion that every REWRITTEN member appears in index.ts is the whole value
  of that list, and `types` would fail it for a reason that is correct.
*/
const TYPE_ONLY = ['types'] as const

const entry = 'supabase/functions/mail-worker/index.ts'
let index = readFileSync(entry, 'utf8')

for (const name of REWRITTEN) {
  const from = `'../../../lib/mail/${name}.ts'`
  const to = `'./${name}.ts'`
  if (!index.includes(from)) {
    console.error(
      `edge-bundle: ${entry} does not import ${from}.\n` +
        `Either the import was renamed or a shared module was added. Update REWRITTEN ` +
        `in this script — an unlisted import is copied nowhere and fails at runtime.`,
    )
    process.exit(1)
  }
  index = index.split(from).join(to)
}

const leftover = index.match(/from '\.\.\/\.\.\/\.\.\/[^']+'/g)
if (leftover) {
  console.error(`edge-bundle: unrewritten repo-relative imports remain: ${leftover.join(', ')}`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const files: { name: string; content: string }[] = [{ name: 'index.ts', content: index }]
for (const name of [...REWRITTEN, ...TYPE_ONLY]) {
  files.push({ name: `${name}.ts`, content: readFileSync(`lib/mail/${name}.ts`, 'utf8') })
}

for (const f of files) writeFileSync(join(OUT, f.name), f.content)

console.log(`wrote ${files.length} files to ${OUT}/\n`)
console.log('file           bytes  md5')
for (const f of files) {
  const md5 = createHash('md5').update(f.content).digest('hex')
  console.log(`${f.name.padEnd(12)} ${String(Buffer.byteLength(f.content)).padStart(6)}  ${md5}`)
}
console.log(
  `\nDeploy with deploy_edge_function (verify_jwt: false), then compare\n` +
    `get_edge_function's four files against these md5s. types.ts is erased by Deno.`,
)
