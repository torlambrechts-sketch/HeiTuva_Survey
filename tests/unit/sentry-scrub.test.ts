import { describe, expect, it } from 'vitest'
import type { ErrorEvent, EventHint } from '@sentry/nextjs'
import { beforeSend, enabled, dsn } from '@/sentry.config'

/**
 * CLAUDE.md rule 7 (no respondent free text off the box) and the credential
 * half of it that the original rule missed.
 *
 * The scrubber's key match used to be one anchored alternation containing
 * `token`, which dropped a key called exactly `token` and kept `access_token`,
 * `refresh_token`, `bot_token`, `client_secret` and `signing_secret`. Nothing
 * caught it: MAX_STRING is 200 and a bearer token is far shorter, so the length
 * guard passed them through as ordinary short strings.
 *
 * These are the cases, written as the shapes an integration would actually
 * produce rather than as a restatement of the regex.
 */
const run = (event: Partial<ErrorEvent>) =>
  beforeSend(event as ErrorEvent, {} as EventHint) as ErrorEvent

describe('sentry beforeSend — credentials', () => {
  it('drops credential-shaped keys whatever they are prefixed with', () => {
    const out = run({
      extra: {
        access_token: 'xoxb-1234567890',
        refresh_token: 'xoxe-1-abc',
        bot_token: 'xoxb-9',
        client_secret: 'cs_live_9',
        signing_secret: 'sh8by',
        apiKey: 'k-1',
        Authorization: 'Bearer abc',
        provider: 'slack',
      },
    })
    expect(Object.keys(out.extra ?? {})).toEqual(['provider'])
  })

  it('keeps ordinary keys that merely contain a sensitive word as a suffix of nothing', () => {
    const out = run({ extra: { context: 'send', textAlign: 'left', orgId: 'abc' } })
    expect(out.extra).toEqual({ context: 'send', textAlign: 'left', orgId: 'abc' })
  })

  it('still drops respondent content by exact key', () => {
    const out = run({ extra: { answers: { q1: 4 }, comment: 'hei', value: 3, kept: 1 } })
    expect(Object.keys(out.extra ?? {})).toEqual(['kept'])
  })

  it('scrubs nested credentials, not only top-level ones', () => {
    const out = run({ extra: { integration: { provider: 'slack', bot_token: 'xoxb-1' } } })
    expect(out.extra?.integration).toEqual({ provider: 'slack' })
  })
})

describe('sentry beforeSend — the request', () => {
  it('drops the query string, which carries one-time auth codes', () => {
    const out = run({
      request: { url: 'https://heituva.no/auth/callback', query_string: 'code=abc123' },
    })
    expect(out.request?.query_string).toBeUndefined()
  })

  it('drops signature headers, not only cookie and authorization', () => {
    const out = run({
      request: {
        headers: {
          cookie: 'sb=1',
          authorization: 'Bearer x',
          'x-slack-signature': 'v0=deadbeef',
          'x-hub-signature-256': 'sha256=abc',
          'user-agent': 'Mozilla/5.0',
        },
      },
    })
    expect(Object.keys(out.request?.headers ?? {})).toEqual(['user-agent'])
  })

  it('drops the body and the user outright', () => {
    const out = run({ request: { data: { answers: ['x'] } }, user: { id: 'u1' } })
    expect(out.request?.data).toBeUndefined()
    expect(out.user).toBeUndefined()
  })
})

describe('sentry residency', () => {
  it('accepts only an EU ingest host', () => {
    expect(enabled).toBe(/\.ingest\.de\.sentry\.io\//.test(dsn))
    expect(/\.ingest\.us\.sentry\.io\//.test(dsn) && enabled).toBe(false)
  })
})
