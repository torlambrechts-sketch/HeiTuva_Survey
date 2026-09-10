import { afterEach, describe, expect, it, vi } from 'vitest'

/*
  TURNSTILE IS THE ABUSE CONTROL ON THE ONE ANON-CALLABLE RPC THAT WRITES.
  `request_demo` is reachable by `anon` and inserts into `demo_requests`; the
  only thing standing in front of it is `guard()` in the marketing actions, and
  the only thing inside `guard()` that a bot cannot walk through is this.

  These tests exist because the control is configured by ENVIRONMENT, and a
  control whose presence is a matter of configuration has a state nobody thinks
  about: HALF configured. Setting `NEXT_PUBLIC_TURNSTILE_SITE_KEY` alone renders
  Cloudflare's widget on the splash — visible, convincing, and enforcing
  nothing, because the old `turnstileConfigured()` was an AND and the verifier
  returned `true` whenever it was false. **A visible control that enforces
  nothing is the same shape as a revoke that grants nothing** (D115): the
  reviewer's eye confirms the thing the code does not do.

  So the property under test is not «both keys work». It is:
  **a partial configuration is never treated as an absent one.**
*/
/* `lib/turnstile.ts` opens with `import 'server-only'`, which throws outside a
   Server Component. Stubbed so these tests fail on their ASSERTIONS — a suite
   that goes red on an import error proves nothing about the behaviour it
   claims to pin, and reads identically in CI to one that does. */
vi.mock('server-only', () => ({}))

const SITE = 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'
const SECRET = 'TURNSTILE_SECRET_KEY'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function turnstile() {
  vi.resetModules()
  return await import('@/lib/turnstile')
}

describe('turnstileState', () => {
  it('is absent when neither key is set — the local and CI case', async () => {
    vi.stubEnv(SITE, '')
    vi.stubEnv(SECRET, '')
    expect((await turnstile()).turnstileState()).toBe('absent')
  })

  it('is configured when both are set', async () => {
    vi.stubEnv(SITE, '0x4AAA')
    vi.stubEnv(SECRET, '0x4AAB')
    expect((await turnstile()).turnstileState()).toBe('configured')
  })

  it('is PARTIAL when only the site key is set — the dangerous half', async () => {
    vi.stubEnv(SITE, '0x4AAA')
    vi.stubEnv(SECRET, '')
    expect((await turnstile()).turnstileState()).toBe('partial')
  })

  it('is PARTIAL when only the secret is set', async () => {
    vi.stubEnv(SITE, '')
    vi.stubEnv(SECRET, '0x4AAB')
    expect((await turnstile()).turnstileState()).toBe('partial')
  })
})

describe('verifyTurnstile', () => {
  it('passes when the control is absent, so local and CI have nothing to solve', async () => {
    vi.stubEnv(SITE, '')
    vi.stubEnv(SECRET, '')
    await expect((await turnstile()).verifyTurnstile(null, '1.2.3.4')).resolves.toBe(true)
  })

  /* THE TWO THAT MATTER. Before this suite the site-key-only case returned
     `true` — the widget on the splash and no verification behind it. */
  it('REFUSES when only the site key is set, rather than waving the request through', async () => {
    vi.stubEnv(SITE, '0x4AAA')
    vi.stubEnv(SECRET, '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect((await turnstile()).verifyTurnstile('a-token', '1.2.3.4')).resolves.toBe(false)
    // and it does not pretend to check: no round trip is made on a broken config
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('REFUSES when only the secret is set', async () => {
    vi.stubEnv(SITE, '')
    vi.stubEnv(SECRET, '0x4AAB')
    await expect((await turnstile()).verifyTurnstile('a-token', '1.2.3.4')).resolves.toBe(false)
  })

  it('refuses a missing token when fully configured, without calling Cloudflare', async () => {
    vi.stubEnv(SITE, '0x4AAA')
    vi.stubEnv(SECRET, '0x4AAB')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect((await turnstile()).verifyTurnstile('', '1.2.3.4')).resolves.toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses when Cloudflare says the token is not valid', async () => {
    vi.stubEnv(SITE, '0x4AAA')
    vi.stubEnv(SECRET, '0x4AAB')
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: false }) })))
    await expect((await turnstile()).verifyTurnstile('t', '1.2.3.4')).resolves.toBe(false)
  })

  it('accepts only when Cloudflare says success', async () => {
    vi.stubEnv(SITE, '0x4AAA')
    vi.stubEnv(SECRET, '0x4AAB')
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: true }) })))
    await expect((await turnstile()).verifyTurnstile('t', '1.2.3.4')).resolves.toBe(true)
  })

  it('refuses when Cloudflare is unreachable — the control must not vanish under load', async () => {
    vi.stubEnv(SITE, '0x4AAA')
    vi.stubEnv(SECRET, '0x4AAB')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    await expect((await turnstile()).verifyTurnstile('t', '1.2.3.4')).resolves.toBe(false)
  })
})
