import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * BEARER AUTHENTICATION FOR THE SCIM ENDPOINT.
 *
 * The token is `hei_scim_<prefix>_<secret>`: the prefix is a public identifier
 * and finds the row, the secret is compared against the stored SHA-256 with
 * `timingSafeEqual`. Invariant 4 asks for a constant-time comparison, and the
 * only way to have one is to know which row you are comparing against BEFORE
 * you compare — a single opaque token forces `where token_hash = $1`, which is
 * an index lookup and not a comparison anybody controls.
 *
 * Every failure returns the same `unauthorised` outcome. A caller cannot learn
 * whether the prefix was unknown, the secret wrong, or the token revoked.
 */
export type ScimAuth =
  | { ok: true; orgId: string }
  | { ok: false; status: 401 | 429; detail: string }

const UNAUTHORISED = {
  ok: false as const,
  status: 401 as const,
  detail: 'Invalid or missing bearer token.',
}

const TOKEN = /^hei_scim_([0-9a-f]{12})_([0-9a-f]{64})$/

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** Constant-time over two hex digests of equal, fixed length. The length guard
 *  is separate because `timingSafeEqual` THROWS on a length mismatch, and a
 *  thrown error is a timing signal of its own. */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    // Only reachable if one of them is not a string of that length, which the
    // guard above has already excluded. Named rather than `when others`: this
    // catch exists for `timingSafeEqual`'s length throw and for nothing else.
    return false
  }
}

export async function authenticateScim(req: Request): Promise<ScimAuth> {
  const header = req.headers.get('authorization') ?? ''
  const raw = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const parts = TOKEN.exec(raw)
  if (!parts) return UNAUTHORISED

  const [, prefix, secret] = parts
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('scim_lookup', { p_prefix: prefix! })
  if (error || !data || data.length === 0) return UNAUTHORISED

  const row = data[0]!
  if (row.revoked) return UNAUTHORISED
  if (!sameDigest(hashSecret(secret!), row.token_hash)) return UNAUTHORISED

  // Checked AFTER the credential, so an unauthenticated caller can never learn
  // an organisation's request volume by watching for 429s.
  if (row.over_limit) {
    return {
      ok: false,
      status: 429,
      detail: 'Too many requests. This connector is sending faster than the endpoint accepts.',
    }
  }

  return { ok: true, orgId: row.org_id }
}

/** Records the outcome so a silently-stopped connector is distinguishable from
 *  a customer with no staff changes — which is the failure the instruction names
 *  and which otherwise looks identical. */
export async function recordScimOutcome(orgId: string, error: string | null): Promise<void> {
  const admin = createAdminClient()
  // '' means «no error» — the wrapper does `nullif(p_error, '')`. `supabase gen
  // types` types every argument non-nullable, and the alternative is a cast at
  // the call site that no reader can check.
  await admin.rpc('scim_touch', { p_org: orgId, p_error: error ?? '' })
}
