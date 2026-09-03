/**
 * Runs the Playwright pixel suite against a server this harness controls.
 *
 * `playwright test` on its own needs a server already listening on 3100 and
 * has no opinion about which build it is serving — so it passed or failed
 * depending on what happened to be running, and failed outright with
 * ERR_CONNECTION_REFUSED when nothing was. `ensureServer` is the same gate
 * every other verify script uses: it refuses a build wired to production,
 * refuses a build older than the source, and clears the fetch cache so a
 * reseed is actually visible.
 */
import { spawnSync } from 'node:child_process'
import { ensureServer } from './server'

async function main() {
  const server = await ensureServer()
  try {
    // `--local` is for ensureServer, which reads process.argv directly.
    // Forwarding it to Playwright would make it reject the run.
    const forwarded = process.argv.slice(2).filter((a) => a !== '--local')
    const r = spawnSync('npx', ['playwright', 'test', ...forwarded], {
      stdio: 'inherit',
      shell: false,
    })
    process.exitCode = r.status ?? 1
  } finally {
    server.stop()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
