import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { readFile, rm, stat } from 'node:fs/promises'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LOCAL_SUPABASE } from './local-env'

export const BASE_URL = process.env.HEITUVA_BASE_URL ?? 'http://127.0.0.1:3100'

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
 * The build id the RUNNING SERVER is actually serving, or null.
 *
 * WHY THIS EXISTS, and it is the third instance in one day of «the thing
 * measured was not the thing claimed». `buildTargetsLocal()` and
 * `buildIsStale()` both inspect OUR `.next` directory. That is an excellent
 * proxy for «the running server is correct» — and only while the running server
 * is the one we started. Neither can see the server at all.
 *
 * So a `next-server` left behind by an earlier session, on a different Next
 * MAJOR, serving an entirely different working copy, passed both guards and was
 * reused. One `verify:responsive` run against it reported 6464 findings and 277
 * blockers on a two-pixel CSS change, and the CSS was fine. The guards were not
 * wrong; they were answering a different question.
 *
 * Next serves its assets under `/_next/static/<buildId>/`, so the id is in the
 * HTML of any page. Comparing it against `.next/BUILD_ID` asks the server what
 * it is, rather than asking our directory what it ought to be.
 */
async function serverBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/logg-inn`, { cache: 'no-store' })
    const html = await res.text()
    return /\/_next\/static\/([^/"']+)\//.exec(html)?.[1] ?? null
  } catch {
    return null
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
    const [serving, ours] = await Promise.all([
      serverBuildId(),
      readFile('.next/BUILD_ID', 'utf8').then((t) => t.trim()).catch(() => null),
    ])
    if (ours && serving !== ours) {
      console.log(
        `  server: ${BASE_URL} is serving build ${serving ?? 'unknown'}, not ours (${ours}) — killing it`,
      )
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
  const child: ChildProcess = spawn('npx', ['next', 'start', '-p', port], {
    stdio: 'ignore',
    // Under --local these must be set on the child: Next loads .env.local
    // itself, and .env.local points at the remote project. process.env wins.
    env: LOCAL ? { ...process.env, ...LOCAL_SUPABASE } : process.env,
    detached: false,
  })

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await isUp(`${BASE_URL}/logg-inn`)) {
      return { stop: () => child.kill('SIGTERM'), started: true }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  child.kill('SIGTERM')
  throw new Error(
    `Server did not become ready at ${BASE_URL} within 90s. ` +
      `Run "npx next build" first — the harness starts a production build, not dev.`,
  )
}
