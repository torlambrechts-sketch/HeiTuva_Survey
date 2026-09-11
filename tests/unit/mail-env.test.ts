import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEnv } from '@/lib/mail/env'
import { brevoProvider } from '@/lib/mail/brevo'
import { readFileSync } from 'node:fs'

/**
 * WHERE THE CREDENTIALS COME FROM, AND WHICH PROTOCOL CARRIES THEM.
 *
 * `BREVO_API_KEY`, `MAIL_FROM` and `MAIL_FROM_NAME` live in Supabase Edge
 * Function secrets. The platform injects those into the function's environment,
 * where Deno reads them with `Deno.env.get` — so the ordering inside `readEnv`
 * is not a stylistic choice, it is the thing that makes the secrets reachable
 * at all. It had no test.
 */
type Host = { Deno?: unknown; process?: unknown }
const host = globalThis as Host

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Installs a Deno-shaped env accessor, the way the Edge Runtime provides one. */
function withDenoEnv(vars: Record<string, string>) {
  vi.stubGlobal('Deno', { env: { get: (n: string) => vars[n] } })
}

describe('readEnv reads the runtime that is actually hosting us', () => {
  it('prefers Deno.env.get, which is where an Edge Function secret arrives', () => {
    const saved = process.env.BREVO_API_KEY
    process.env.BREVO_API_KEY = 'from-process-env'
    try {
      withDenoEnv({ BREVO_API_KEY: 'from-deno-env' })
      expect(
        readEnv('BREVO_API_KEY'),
        'the platform accessor must win: under Deno the Node compat shim may ' +
          'also expose a `process`, and it is not the one carrying the secret',
      ).toBe('from-deno-env')
    } finally {
      if (saved === undefined) delete process.env.BREVO_API_KEY
      else process.env.BREVO_API_KEY = saved
    }
  })

  it('falls back to process.env, which is where the Node worker reads', () => {
    expect(host.Deno).toBeUndefined()
    const saved = process.env.MAIL_FROM
    process.env.MAIL_FROM = 'node@example.test'
    try {
      expect(readEnv('MAIL_FROM')).toBe('node@example.test')
    } finally {
      if (saved === undefined) delete process.env.MAIL_FROM
      else process.env.MAIL_FROM = saved
    }
  })

  it('is undefined when neither runtime has it, so configured() can name the gap', () => {
    withDenoEnv({})
    expect(readEnv('A_NAME_NOTHING_SETS')).toBeUndefined()
  })
})

describe('the provider picks up all three secrets from the Deno environment', () => {
  it('reports no gap and uses the injected sender', async () => {
    // The three names exactly as they are set in Edge Function secrets.
    withDenoEnv({
      BREVO_API_KEY: 'xkeysib-injected',
      MAIL_FROM: 'undersokelse@heituva.com',
      MAIL_FROM_NAME: 'HeiTuva Undersøkelser',
    })
    const provider = brevoProvider()
    expect(provider.configured(), 'all three are present, so there is no gap').toBeNull()

    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return { ok: true, status: 201, json: async () => ({ messageId: 'm1' }) } as unknown as Response
    })

    const result = await provider.send({
      to: { email: 'someone@example.test' },
      subject: 's',
      text: 't',
      idempotencyKey: 'k',
    })
    expect(result.ok).toBe(true)

    const { url, init } = calls[0]!
    const body = JSON.parse(String(init.body)) as { sender: { email: string; name: string } }
    expect(body.sender.email).toBe('undersokelse@heituva.com')
    expect(body.sender.name, 'MAIL_FROM_NAME is read too, not just defaulted').toBe(
      'HeiTuva Undersøkelser',
    )
    // The key travels in a header, never in the body or the URL.
    const headers = init.headers as Record<string, string>
    expect(headers['api-key']).toBe('xkeysib-injected')
    expect(url).not.toContain('xkeysib')
    expect(String(init.body)).not.toContain('xkeysib')
  })
})

describe('it is the HTTP API, not SMTP', () => {
  /*
    Worth asserting because the endpoint PATH is misleading: Brevo's
    transactional HTTP endpoint is `/v3/smtp/email`. The word «smtp» is in the
    URL of an HTTPS POST. Someone reading the path could reasonably conclude
    this speaks SMTP and «fix» it toward a relay — which would not work at all
    from an Edge Function, and does not work from CI either, where ports 465 and
    587 are dropped and only 443 is open.
  */
  it('posts over https to api.brevo.com', async () => {
    withDenoEnv({ BREVO_API_KEY: 'k', MAIL_FROM: 'f@example.test' })
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      return { ok: true, status: 201, json: async () => ({}) } as unknown as Response
    })
    await brevoProvider().send({
      to: { email: 'a@b.test' },
      subject: 's',
      text: 't',
      idempotencyKey: 'k',
    })
    expect(calls[0]).toBe('https://api.brevo.com/v3/smtp/email')
    expect(calls[0]!.startsWith('https://'), 'never a bare http:// endpoint').toBe(true)
  })

  it('and the worker refuses to drain without an absolute origin', () => {
    /*
      Not a behavioural test — there is no deno binary here to run the function
      with, so this asserts the guard is PRESENT and ordered before the drain.
      Weaker than exercising it, and said so rather than dressed up.

      What exercised it for real was prod: the first invocation returned
      503 «NEXT_PUBLIC_APP_URL is not set; an invitation whose link is relative
      is a spent message with a dead link», with max_read_ct still 0 — the queue
      was not even read. Before the guard, that deployment would have sent both
      real invitations with a link of `/s/<token>` and written sent_at on them.
    */
    const src = readFileSync('supabase/functions/mail-worker/index.ts', 'utf8')
    const guard = src.indexOf("readEnv('NEXT_PUBLIC_APP_URL')")
    const drainCall = src.indexOf('await drain(svc')
    expect(guard, 'the origin must be checked').toBeGreaterThan(-1)
    expect(guard, 'and checked BEFORE the queue is read').toBeLessThan(drainCall)
    expect(src, 'a relative origin must not be accepted either').toContain('^https?:')
    // The old default is what made the gap invisible; it must not come back.
    expect(src).not.toContain("Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''")
  })

  it('and the Edge Function does not pull in the SMTP or SES adapter', () => {
    // Both need `node:` builtins (nodemailer, node:crypto) that the Edge
    // Runtime does not provide, so importing either would break the deploy —
    // and `lib/mail/index.ts` imports all three, which is exactly why the
    // function imports `brevo.ts` and `copy.ts` directly rather than the barrel.
    const src = readFileSync('supabase/functions/mail-worker/index.ts', 'utf8')
    expect(src).toContain("from '../../../lib/mail/brevo.ts'")
    expect(src).not.toMatch(/from '.*lib\/mail\/(smtp|ses)/)
    expect(src, 'importing the barrel would drag in node:crypto').not.toMatch(
      /from '\.\.\/\.\.\/\.\.\/lib\/mail'/,
    )
  })
})
