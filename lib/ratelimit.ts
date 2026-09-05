import 'server-only'

/**
 * A sliding-window limiter for the two public write paths on `/` (DECISIONS Q5,
 * amended: rate limiting on the sign-up endpoint is a launch blocker).
 *
 * Per process, in memory, on purpose. On Vercel that means per warm instance,
 * so a determined caller who lands on several instances gets several budgets —
 * this is the guard against a script, not against a botnet. The durable limit
 * for sign-ups is Supabase Auth's own, set on the project (docs/OPERATIONS.md,
 * "The pre-launch gate"), and Turnstile in front of the form is the guard
 * against automation as such. Three layers, each honest about what it stops.
 *
 * Keyed by the caller's IP. Nothing is stored beyond a ring of timestamps, and
 * the map is bounded so it cannot become a memory-exhaustion vector itself.
 */
const WINDOW_MS = 60 * 60 * 1000
const MAX_KEYS = 10_000

const hits = new Map<string, number[]>()

export function rateLimited(key: string, limit: number, windowMs = WINDOW_MS): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return true
  }
  recent.push(now)
  hits.set(key, recent)

  if (hits.size > MAX_KEYS) {
    // Drop the oldest-touched keys rather than everything: an attacker who
    // fills the map should not thereby reset their own budget.
    const stale = [...hits.entries()]
      .filter(([, ts]) => ts.every((t) => now - t >= windowMs))
      .map(([k]) => k)
    for (const k of stale) hits.delete(k)
    if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value!)
  }
  return false
}

/** The first hop of x-forwarded-for, which on Vercel is the client. */
export function clientKey(forwardedFor: string | null): string {
  return (forwardedFor ?? '').split(',')[0]?.trim() || 'unknown'
}
