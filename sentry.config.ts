/**
 * Sentry, EU region, opt-in by DSN — shared by the server, edge and client
 * entry points (instrumentation.ts, instrumentation-client.ts).
 *
 * CLAUDE.md rule 7: no respondent free text in logs or error payloads. The
 * scrubber below is the enforcement: it drops request bodies and cookies
 * outright, and any string longer than a short label anywhere in the event —
 * a free-text answer is long, a variable name is not. It errs towards losing
 * context rather than keeping an answer.
 *
 * Two rules, because the two things being dropped are different shapes.
 *
 * Respondent CONTENT is matched exactly: the keys are known (`answers`,
 * `value`, `comment`, `text`) and a substring rule would eat `context` and
 * `textAlign` for nothing.
 *
 * CREDENTIALS are matched as substrings, and that is a correction. The rule
 * used to be one anchored alternation containing `token`, which caught a key
 * called exactly `token` and let `access_token`, `refresh_token`, `bot_token`,
 * `client_secret` and `signing_secret` straight through. The length guard did
 * not catch them either — MAX_STRING is 200 and a bearer token is far shorter.
 * That was survivable while every credential in this product was a
 * process-wide env var never placed in an event; it stops being survivable the
 * moment a per-tenant integration token exists to be mishandled
 * (docs/INTEGRATION_ARCHITECTURE.md G0).
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs'

const MAX_STRING = 200

/** Credential-shaped key names, matched as a SUBSTRING — `refresh_token` and
 *  `client_secret` must not survive because they are not spelled `token`. */
const CREDENTIAL_KEY =
  /(secret|token|credential|signature|password|passphrase|cookie|authorization|api[-_]?key|bearer)/i

/** Respondent content, matched EXACTLY — see the note above. */
const CONTENT_KEY = /^(answers?|value|comment|text)$/i

function isSensitiveKey(key: string): boolean {
  return CREDENTIAL_KEY.test(key) || CONTENT_KEY.test(key)
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined
  if (typeof value === 'string') return value.length > MAX_STRING ? '[scrubbed]' : value
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) continue
      out[k] = scrub(v, depth + 1)
    }
    return out
  }
  return value
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    // The query string is a credential channel too: `/auth/callback?code=…`
    // carries a one-time auth code, and an OAuth callback would carry the
    // provider's. Nothing in an event needs it.
    delete event.request.query_string
    if (event.request.headers) {
      // Not just cookie and authorization by name — a provider's signature
      // header (`x-slack-signature`, `x-hub-signature-256`) is a credential
      // that identifies a request, and naming each one is a race we lose.
      for (const k of Object.keys(event.request.headers)) {
        if (isSensitiveKey(k)) delete event.request.headers[k]
      }
    }
  }
  delete event.user
  if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>
  if (event.contexts) event.contexts = scrub(event.contexts) as ErrorEvent['contexts']
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? (scrub(b.data) as Record<string, unknown>) : undefined,
      message: typeof b.message === 'string' && b.message.length > MAX_STRING ? '[scrubbed]' : b.message,
    }))
  }
  return event
}

export const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''

/** Only an EU ingest host is accepted: a DSN pointing anywhere else is a
 *  residency breach waiting to happen, so it is treated as "not configured". */
export const enabled = /\.ingest\.de\.sentry\.io\//.test(dsn)
