import { describe, expect, it } from 'vitest'
import { beforeSend } from '@/sentry.config'
import type { ErrorEvent, EventHint } from '@sentry/nextjs'

/**
 * S3 — the URL is the credential (audit `B5-3`, `B5-4`).
 *
 * The scrubber removed bodies, cookies and headers, and left
 * `event.request.url` alone. For `/s/<token>`, `/r/<token>` and `/l/<code>`
 * that is the whole secret: there is no header to drop, because the address
 * itself authenticates the caller. `app/s/[token]/page.tsx` states that the
 * token is never passed to anything that might serialise it — and Sentry
 * serialised it.
 *
 * The client half of Sentry is gone (C4-1), so this is about the SERVER half,
 * which still reports request URLs.
 */
const ev = (url: string, referer?: string): ErrorEvent =>
  ({ request: { url, headers: referer ? { referer } : {} } }) as unknown as ErrorEvent
const hint = {} as EventHint

describe('a credential in the path never reaches the wire', () => {
  for (const [prefix, what] of [
    ['s', 'a respondent’s one-time invitation'],
    ['r', 'a report share link'],
    ['l', 'a live voucher'],
  ] as const) {
    it(`/${prefix}/<token> — ${what}`, () => {
      const out = beforeSend(ev(`https://heituva.no/${prefix}/abc123deadbeef`), hint)
      expect(out!.request!.url).toBe(`https://heituva.no/${prefix}/[token]`)
      expect(out!.request!.url).not.toContain('abc123deadbeef')
    })
  }

  it('keeps the route, because that is what makes the report useful', () => {
    const out = beforeSend(ev('https://heituva.no/s/tok?lang=no#q3'), hint)
    // Query and fragment survive; only the authenticating segment goes.
    expect(out!.request!.url).toBe('https://heituva.no/s/[token]?lang=no#q3')
  })

  it('scrubs a malformed or truncated token too', () => {
    // The segment is replaced whatever it looks like, so «not token-shaped» is
    // never the reason something survives.
    expect(beforeSend(ev('https://heituva.no/s/x'), hint)!.request!.url)
      .toBe('https://heituva.no/s/[token]')
  })

  it('leaves an ordinary app route alone', () => {
    const url = 'https://heituva.no/undersokelser/42/resultater'
    expect(beforeSend(ev(url), hint)!.request!.url).toBe(url)
  })

  it('scrubs the referer as well, which is the second copy of the same URL', () => {
    const out = beforeSend(ev('https://heituva.no/x', 'https://heituva.no/s/secrettoken'), hint)
    expect(out!.request!.headers!.referer).toBe('https://heituva.no/s/[token]')
  })
})

describe('the client half is gone', () => {
  it('there is no instrumentation-client entry point', async () => {
    // C4-1: it shipped 81 kB to every visitor and may never have initialised,
    // because `onRouterTransitionStart` was an unconditional live reference.
    const { existsSync } = await import('node:fs')
    expect(existsSync('instrumentation-client.ts')).toBe(false)
  })
})
