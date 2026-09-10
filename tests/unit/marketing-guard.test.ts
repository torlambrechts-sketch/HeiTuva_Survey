import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  EVERY EXPORTED SERVER ACTION ON THE PUBLIC SPLASH IS GUARDED — stated over
  the file, not over the two actions that happen to exist today.

  `app/(marketing)/actions.ts` is the only unauthenticated write surface in the
  product: no session, no membership, reachable by anyone who can load `/`.
  `guard()` is the rate limit and Turnstile together, and it has to run BEFORE
  parsing and before any RPC, because a guard that runs after the insert is a
  log line rather than a control.

  Writing this as «signUpFromSplash and requestDemo call guard» would be the
  mistake CLAUDE.md names: correct about its members, silent about the third
  action somebody adds next to them. So the assertion enumerates the exports
  from the source and requires the property of each — the list is derived, never
  written down here.
*/
const SRC = 'app/(marketing)/actions.ts'
const source = readFileSync(SRC, 'utf8')

/** Exported async server actions, read out of the file rather than listed. */
function exportedActions(): string[] {
  return [...source.matchAll(/^export async function (\w+)\s*\(/gm)].map((m) => m[1]!)
}

/** The body of one function, from its signature to the next top-level `}`.
 *  `guard` is module-private, so the `export` keyword is optional here — the
 *  first version of this helper required it and could not find the very
 *  function the suite exists to check. */
function bodyOf(name: string): string {
  const start = source.search(new RegExp(`^(?:export )?async function ${name}\\s*\\(`, 'm'))
  expect(start, `${name} not found in ${SRC}`).toBeGreaterThan(-1)
  const rest = source.slice(start)
  const end = rest.search(/\n\}/)
  return rest.slice(0, end === -1 ? undefined : end)
}

describe('the public splash actions', () => {
  it('has at least the two known actions, so the sweep is not vacuously true', () => {
    const found = exportedActions()
    expect(found).toContain('requestDemo')
    expect(found).toContain('signUpFromSplash')
    expect(found.length).toBeGreaterThanOrEqual(2)
  })

  it.each(exportedActions())('%s calls guard() before anything else', (name) => {
    const body = bodyOf(name)
    expect(body, `${name} does not call guard()`).toMatch(/await guard\(/)

    /* Before the RPC, before the parse — the first statement. Anything the
       action does before guarding is work an unguarded caller can make it do. */
    const guardAt = body.indexOf('await guard(')
    const rpcAt = body.indexOf('.rpc(')
    const parseAt = body.indexOf('safeParse')
    if (rpcAt > -1) expect(guardAt).toBeLessThan(rpcAt)
    if (parseAt > -1) expect(guardAt).toBeLessThan(parseAt)
  })

  it('guard() refuses on the rate limit AND on turnstile, not one of the two', () => {
    const head = bodyOf('guard')
    expect(head).toMatch(/rateLimited\(/)
    expect(head).toMatch(/verifyTurnstile\(/)
  })

  it('reads the turnstile token from the field Cloudflare writes', () => {
    expect(source).toContain("formData.get('cf-turnstile-response')")
  })
})
