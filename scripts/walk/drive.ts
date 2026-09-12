/**
 * The walk driver — temporary, for docs/walk/. Not a gate.
 *
 * It exists because the instruction's third column is the one that matters:
 * «whether the database actually changed». A Playwright click that returns
 * cleanly proves a request completed; only a query either side of it proves a
 * write happened. So every action here is wrapped in a before/after snapshot
 * of the rows it claims to touch.
 *
 * psql via execFileSync rather than the `pg` package, because that is what
 * tests/db/* already does and a walk should not introduce a dependency.
 */
import { execFileSync } from 'node:child_process'
import { chromium, type Browser, type Page, type ConsoleMessage } from 'playwright'
import { ensureServer, BASE_URL } from '../verify/server'
import { signIn } from '../../tests/helpers/session'
import type { PersonaName } from '../../tests/db/personas'

export const DB_URL =
  process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export function psql(q: string): string[][] {
  return execFileSync('psql', [DB_URL, '-tAF\t', '-c', q], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
}
export const one = (q: string) => psql(q)[0]?.[0] ?? ''

export type Obs = { kind: 'console' | 'pageerror' | 'requestfailed' | 'http'; text: string }

export function watch(page: Page, sink: Obs[]) {
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning')
      sink.push({ kind: 'console', text: `[${m.type()}] ${m.text()}`.slice(0, 400) })
  })
  page.on('pageerror', (e) => sink.push({ kind: 'pageerror', text: String(e).slice(0, 800) }))
  page.on('requestfailed', (r) =>
    sink.push({
      kind: 'requestfailed',
      text: `${r.method()} ${r.url()} — ${r.failure()?.errorText}`.slice(0, 300),
    }),
  )
  page.on('response', (r) => {
    if (r.status() >= 400)
      sink.push({ kind: 'http', text: `${r.status()} ${r.request().method()} ${r.url()}`.slice(0, 300) })
  })
}

export async function open(persona: PersonaName | 'anon', viewport = { width: 1440, height: 900 }) {
  const browser: Browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport, locale: 'nb-NO' })
  const page = await ctx.newPage()
  const obs: Obs[] = []
  watch(page, obs)
  if (persona !== 'anon') await signIn(page, persona, BASE_URL)
  return { browser, page, obs }
}

export function report(label: string, obs: Obs[]) {
  if (!obs.length) return console.log(`    clean: no console error, no pageerror, no 4xx/5xx`)
  console.log(`    ${obs.length} observation(s) during ${label}:`)
  for (const o of obs) console.log(`      ${o.kind}: ${o.text}`)
}

export { ensureServer, BASE_URL }
