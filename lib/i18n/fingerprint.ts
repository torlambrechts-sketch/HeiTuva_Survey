import { createHash } from 'node:crypto'

/**
 * A short, stable fingerprint of one locale's COMPILED message set.
 *
 * It exists to go into the `unstable_cache` key in `messages.ts`. The cached
 * value there is `overlay(BUNDLED, rows)` — it depends on BOTH halves — and the
 * key named only the locale, so Next's Data Cache (which persists across
 * deployments on Vercel) kept serving a previous deployment's merged set after
 * a deploy that added keys. Every key the old bundle lacked then rendered as a
 * raw `namespace.key`.
 *
 * Pure and in its own module so the property can be TESTED rather than
 * replicated in a test: `messages.ts` is `server-only`, and a test that
 * recomputed the hash would assert its own arithmetic instead of the code's.
 */
export function bundleFingerprint(messages: unknown): string {
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex').slice(0, 12)
}
