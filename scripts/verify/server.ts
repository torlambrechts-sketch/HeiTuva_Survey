import { spawn, type ChildProcess } from 'node:child_process'

export const BASE_URL = process.env.HEITUVA_BASE_URL ?? 'http://127.0.0.1:3100'

async function isUp(url: string) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.status > 0
  } catch {
    return false
  }
}

/**
 * Reuses an already-running server so a developer's `next dev` is not fought
 * over; otherwise starts one and returns a stop handle. Uses `next start`
 * against a production build so captures show what actually ships — dev-mode
 * overlays and unminified layout shifts would poison a pixel comparison.
 */
export async function ensureServer(): Promise<{ stop: () => void; started: boolean }> {
  if (await isUp(`${BASE_URL}/logg-inn`)) {
    console.log(`  server: reusing ${BASE_URL}`)
    return { stop: () => {}, started: false }
  }

  console.log(`  server: starting on ${BASE_URL}`)
  const port = new URL(BASE_URL).port || '3100'
  const child: ChildProcess = spawn('npx', ['next', 'start', '-p', port], {
    stdio: 'ignore',
    env: process.env,
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
