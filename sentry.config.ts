/**
 * Sentry, EU region, opt-in by DSN — the SERVER and edge entry point
 * (instrumentation.ts). There is no client entry point any more.
 *
 * ── WHY THE CLIENT HALF IS GONE (S3, audit C4-1) ──────────────────────────
 *
 * `instrumentation-client.ts` shipped 81 kB of Sentry to every visitor and
 * MAY NEVER HAVE INITIALISED: `Sentry.init` was guarded by `if (enabled)`, but
 * the file also carried `export const onRouterTransitionStart =
 * Sentry.captureRouterTransitionStart` — an unconditional live reference — so
 * the guard removed the CALL and not the MODULE. The cost was unconditional
 * whether or not a DSN was ever configured.
 *
 * It fell hardest on the surface CLAUDE.md holds to 380–420px: `/s/[token]` was
 * the heaviest route in the product at 227 kB, of which Sentry was 82 kB.
 *
 * Server-side reporting is unaffected and costs a visitor nothing.
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

/**
 * Paths where the URL IS the credential. `/s/<token>` is a respondent's
 * one-time invitation, `/r/<token>` a report share link, `/l/<code>` a live
 * voucher — none of them is a secret held in a header the scrubber already
 * drops; each is the address itself (audit B5-3, B5-4).
 *
 * A property rather than a list of three, as far as it can be: the segment
 * after any of these prefixes is replaced whatever it looks like, so a
 * malformed or truncated token is scrubbed too. The prefixes themselves are an
 * enumeration, and it is an enumeration OF «routes whose first path segment
 * authenticates the caller» — the three that exist. A fourth is added here by
 * the phase that adds the route.
 */
const CREDENTIAL_PATHS = /\/(s|r|l)\/[^/?#]+/g

function scrubUrl(url: string): string {
  return url.replace(CREDENTIAL_PATHS, (_m, p: string) => `/${p}/[token]`)
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    // The URL is scrubbed, not deleted: the ROUTE is what makes an error
    // report useful, and it survives. Only the segment that authenticates goes.
    if (typeof event.request.url === 'string') {
      event.request.url = scrubUrl(event.request.url)
    }
    if (event.request.headers) {
      delete event.request.headers['cookie']
      delete event.request.headers['authorization']
      for (const h of ['referer', 'referrer'] as const) {
        const v = event.request.headers[h]
        if (typeof v === 'string') event.request.headers[h] = scrubUrl(v)
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
