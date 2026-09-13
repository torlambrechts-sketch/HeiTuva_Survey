import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { closeSync, openSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LOCAL_SUPABASE } from './local-env'

export const BASE_URL = process.env.HEITUVA_BASE_URL ?? 'http://127.0.0.1:3100'

/** Where the server the harness starts writes its stdout and stderr. */
export const SERVER_LOG = process.env.HEITUVA_SERVER_LOG ?? 'artifacts/server.log'

const LOCAL = process.argv.includes('--local')

async function isUp(url: string) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.status > 0
  } catch {
    return false
  }
}

/**
 * Whether the existing production build is wired to the local stack.
 *
 * Next inlines every `NEXT_PUBLIC_*` reference at build time, in server code as
 * well as client bundles, so setting them on the server process does nothing —
 * the built output literally contains the project URL it will talk to. Reading
 * it back is the only check that cannot drift from reality: a marker file would
 * happily claim "local" for a build made against production.
 */
async function buildTargetsLocal(): Promise<boolean> {
  const src = await readFile('.next/server/middleware.js', 'utf8').catch(() => null)
  return src?.includes(LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL) ?? false
}

/**
 * Whether any tracked source file is newer than the build.
 *
 * Without this the harness happily verifies a stale build: a run that fixed two
 * 500s reported the same two 500s, because the build already pointed at the
 * local stack and nothing else was checked. A verification pass that can pass
 * on code you did not build is worse than no pass at all.
 */
const SOURCE_DIRS = ['app', 'components', 'lib', 'messages', 'types']
const SOURCE_FILES = ['next.config.ts', 'tailwind.config.ts', 'postcss.config.mjs', 'middleware.ts']

function newestMtime(path: string): number {
  let newest = 0
  const walk = (p: string) => {
    let entries: string[]
    try {
      entries = readdirSync(p)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(p, entry)
      const st = statSync(full, { throwIfNoEntry: false })
      if (!st) continue
      if (st.isDirectory()) walk(full)
      else newest = Math.max(newest, st.mtimeMs)
    }
  }
  const st = statSync(path, { throwIfNoEntry: false })
  if (!st) return 0
  if (st.isDirectory()) walk(path)
  else newest = st.mtimeMs
  return newest
}

async function buildIsStale(): Promise<boolean> {
  const built = await stat('.next/BUILD_ID').catch(() => null)
  if (!built) return true
  const newest = Math.max(...[...SOURCE_DIRS, ...SOURCE_FILES].map(newestMtime))
  return newest > built.mtimeMs
}

async function buildLocal(): Promise<void> {
  console.log('  build: rebuilding against the local Supabase project')
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['next', 'build'], {
      stdio: 'inherit',
      env: { ...process.env, ...LOCAL_SUPABASE },
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`next build exited with ${code}`)),
    )
  })
  if (!(await buildTargetsLocal())) {
    throw new Error(
      'Rebuilt, but the output still does not reference the local Supabase URL. ' +
        'Check that .env.local is not being inlined over the injected environment.',
    )
  }
}

/**
 * Reuses an already-running server so a developer's `next dev` is not fought
 * over; otherwise starts one and returns a stop handle. Uses `next start`
 * against a production build so captures show what actually ships — dev-mode
 * overlays and unminified layout shifts would poison a pixel comparison.
 */
/**
 * Is the server on this port serving OUR build? Asked as a POSITIVE test: fetch
 * the asset that only our build can serve.
 *
 * WHY THIS EXISTS, and it is the third instance in one day of «the thing
 * measured was not the thing claimed». `buildTargetsLocal()` and
 * `buildIsStale()` both inspect OUR `.next` directory. That is an excellent
 * proxy for «the running server is correct» — and only while the running server
 * is the one we started. Neither can see the server at all. So a `next-server`
 * left behind by an earlier session, on a different Next MAJOR, serving another
 * working copy, passed both and was reused; one `verify:responsive` run against
 * it reported 6464 findings and 277 blockers on a two-pixel CSS change.
 *
 * AND THE FIRST VERSION OF THIS CHECK REPEATED THE MISTAKE IT WAS WRITTEN FOR,
 * which is why it is a fetch and not a regex. It scraped the build id out of
 * the HTML with `/_next/static/([^/]+)/` — and `/_next/static/` also holds
 * `chunks/`, `css/` and `media/`, so it read «css» as a build id, or nothing at
 * all on a page that references no build-scoped asset. Either way it never
 * equalled ours, so the guard killed a LEGITIMATE server on every run. It did
 * that twice before the walk caught it: measuring the wrong object, in the
 * function whose entire purpose is to measure the right one.
 *
 * `/_next/static/<buildId>/_buildManifest.js` is emitted by every build and
 * served only by the build that owns it, so a 200 is proof of identity and a
 * 404 is proof of difference. No parsing, nothing to mis-scrape.
 */
async function servesOurBuild(ourBuildId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/_next/static/${ourBuildId}/_buildManifest.js`, {
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

/** Kill whatever holds the harness port. Used only when the server answering it
 *  is provably not ours — never on a server we are about to legitimately
 *  reuse, because a developer's `next dev` on the same port is a valid case the
 *  build-id check already distinguishes. */
function killPort(port: string) {
  for (const cmd of [['fuser', '-k', `${port}/tcp`], ['pkill', '-9', '-f', `next start -p ${port}`]]) {
    try {
      spawnSync(cmd[0]!, cmd.slice(1), { stdio: 'ignore' })
    } catch {
      // Best effort: the next isUp() check is what decides, not this.
    }
  }
}

export async function ensureServer(): Promise<{ stop: () => void; started: boolean }> {
  const port = new URL(BASE_URL).port || '3100'

  if (await isUp(`${BASE_URL}/logg-inn`)) {
    // ASK THE SERVER, NOT OUR DIRECTORY. A stale process from an earlier run —
    // or an earlier session, on another Next major — answers this port exactly
    // like ours does, and every other check here would pass. Killed at the
    // START of the run rather than discovered after a scare.
    const ours = await readFile('.next/BUILD_ID', 'utf8').then((t) => t.trim()).catch(() => null)
    if (ours && !(await servesOurBuild(ours))) {
      console.log(`  server: ${BASE_URL} is not serving our build (${ours}) — killing it`)
      killPort(port)
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  if (await isUp(`${BASE_URL}/logg-inn`)) {
    // A server started elsewhere is serving some build this script did not
    // make. Under --local, refuse it unless that build is wired to the local
    // stack: silently driving a browser against the production project is the
    // exact failure this check exists to stop.
    if (LOCAL && !(await buildTargetsLocal())) {
      throw new Error(
        `A server is already running at ${BASE_URL}, but the build in .next is not wired to ` +
          `${LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL}. Stop it and re-run, or rebuild locally.`,
      )
    }
    if (LOCAL && (await buildIsStale())) {
      throw new Error(
        `A server is already running at ${BASE_URL}, but source files are newer than the build ` +
          `it is serving. Stop it and re-run so the harness rebuilds.`,
      )
    }
    console.log(`  server: reusing ${BASE_URL}`)
    return { stop: () => {}, started: false }
  }

  if (LOCAL && (!(await buildTargetsLocal()) || (await buildIsStale()))) await buildLocal()

  // UI copy is read from `ui_messages` through `unstable_cache`, whose entries
  // are written to disk and therefore outlive the server. A run that started
  // after a reseed kept rendering the old message set for up to the revalidate
  // window, and untranslated keys showed up in captures of code that was
  // actually fine. Verification must not inherit a previous run's cache.
  await rm('.next/cache/fetch-cache', { recursive: true, force: true })

  console.log(`  server: starting on ${BASE_URL}${LOCAL ? ' (local Supabase)' : ''}`)

  // THE CHILD'S OUTPUT IS KEPT, NOT DISCARDED. This was `stdio: 'ignore'`, and
  // the walk of 2026-09-12 is what it cost: two screens were completely dead —
  // every server action on Live and on the Arbeidsliste returning HTTP 500 —
  // and the cause was ONE LINE the server wrote on every failed click:
  //
  //   ⨯ Error: A "use server" file can only export async functions, found object.
  //
  // In production Next sends the browser only a digest, by design, so that line
  // is the entire diagnosis and the harness that provoked it threw it away.
  // Not a blind spot: evidence produced and then dropped on the floor.
  //
  // A FILE RATHER THAN 'inherit': piping to our stdout would interleave Next's
  // request log into every gate's output and bury the gate's own findings, which
  // is why it was silenced in the first place. This keeps it and stays quiet —
  // and `serverLogTail()` below is what a gate prints when something fails.
  await mkdir(dirname(SERVER_LOG), { recursive: true })
  const log = openSync(SERVER_LOG, 'w')
  const child: ChildProcess = spawn('npx', ['next', 'start', '-p', port], {
    stdio: ['ignore', log, log],
    // Under --local these must be set on the child: Next loads .env.local
    // itself, and .env.local points at the remote project. process.env wins.
    env: LOCAL ? { ...process.env, ...LOCAL_SUPABASE } : process.env,
    detached: false,
  })

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await isUp(`${BASE_URL}/logg-inn`)) {
      return {
        stop: () => {
          child.kill('SIGTERM')
          try {
            closeSync(log)
          } catch {
            // already closed by the exiting child; nothing to report
          }
        },
        started: true,
      }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  child.kill('SIGTERM')
  throw new Error(
    `Server did not become ready at ${BASE_URL} within 90s. ` +
      `Run "npx next build" first — the harness starts a production build, not dev.` +
      serverLogTail(),
  )
}

/**
 * The interesting end of the server log, for a gate to print when it fails.
 *
 * Returns '' when there is nothing worth showing, so a caller can append it
 * unconditionally. Only lines Next itself marks as a problem, plus their
 * stack frames — a full tail would be mostly request logging.
 */
export function serverLogTail(maxLines = 40): string {
  let text: string
  try {
    text = readFileSync(SERVER_LOG, 'utf8')
  } catch {
    return ''
  }
  const lines = text.split('\n')
  const first = lines.findIndex((l) => /^\s*[⨯✕]|\bError\b|\bTypeError\b|unhandledRejection/.test(l))
  if (first === -1) return ''
  const slice = lines.slice(first, first + maxLines).filter((l) => l.trim().length)
  if (!slice.length) return ''
  return `\n\n  the server said (${SERVER_LOG}):\n${slice.map((l) => `    ${l}`).join('\n')}`
}
