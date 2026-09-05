/**
 * Sentry, EU region, opt-in by DSN — shared by the server, edge and client
 * entry points (instrumentation.ts, instrumentation-client.ts).
 *
 * CLAUDE.md rule 7: no respondent free text in logs or error payloads. The
 * scrubber below is the enforcement: it drops request bodies and cookies
 * outright, and any string longer than a short label anywhere in the event —
 * a free-text answer is long, a variable name is not. It errs towards losing
 * context rather than keeping an answer.
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs'

const MAX_STRING = 200

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined
  if (typeof value === 'string') return value.length > MAX_STRING ? '[scrubbed]' : value
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(cookie|authorization|password|token|answers?|value|comment|text)$/i.test(k)) continue
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
    if (event.request.headers) {
      delete event.request.headers['cookie']
      delete event.request.headers['authorization']
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
