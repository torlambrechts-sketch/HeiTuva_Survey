/**
 * The Microsoft Graph half of the Entra pull, as a pure module.
 *
 * PURE ON PURPOSE: it takes a `fetch` and returns pages, so the paging, the
 * retry policy and the field list can all be tested without a network and
 * without credentials. The Edge Function supplies the real `fetch` and the real
 * token; everything a test needs to know about our behaviour is decided here.
 */

/** The fields we ask Graph for, and nothing else.
 *
 *  THREE OF THESE NEED `$select` AND THAT IS WHY THE LIST IS EXPLICIT. Graph
 *  returns only a subset of user properties by default — `displayName`, `mail`,
 *  `id` and `jobTitle` among them — and `department` and `accountEnabled` are
 *  NOT in it. A worker that omitted `$select` would receive users with no
 *  department at all and would report, truthfully and uselessly, that nobody
 *  has one. Measured against Microsoft's own reference at I2-0. */
export const GRAPH_SELECT = ['id', 'displayName', 'mail', 'userPrincipalName', 'department', 'accountEnabled'] as const

/** Graph's maximum page size for /users. Asking for more is refused; asking for
 *  less multiplies the round trips on a thousand-user tenant. */
export const GRAPH_PAGE_SIZE = 999

export type GraphUser = {
  externalId: string
  displayName: string | null
  mail: string | null
  department: string | null
  accountEnabled: boolean
}

export type GraphPage = { users: GraphUser[]; nextLink: string | null }

/**
 * `mail` is nullable in Graph and `userPrincipalName` is not — but the UPN is a
 * sign-in name and only «by convention» an address, which is Microsoft's own
 * word for it. So the mailbox is `mail` when there is one and the UPN when
 * there is not, and a user with neither is SKIPPED rather than invented for:
 * `app.entra_apply_page` refuses a user with no address, and a synthetic
 * `id@tenant` would be an address nobody reads.
 */
export function mailboxFor(raw: Record<string, unknown>): string | null {
  const mail = typeof raw.mail === 'string' ? raw.mail.trim() : ''
  if (mail) return mail.toLowerCase()
  const upn = typeof raw.userPrincipalName === 'string' ? raw.userPrincipalName.trim() : ''
  // A UPN without an `@` is not an address at all — Graph allows it for some
  // federated identities — and is likewise skipped.
  return upn.includes('@') ? upn.toLowerCase() : null
}

export function parsePage(body: unknown): GraphPage {
  const b = (body ?? {}) as { value?: unknown[]; '@odata.nextLink'?: unknown }
  const raw = Array.isArray(b.value) ? b.value : []
  const users: GraphUser[] = []
  for (const item of raw) {
    const u = (item ?? {}) as Record<string, unknown>
    const externalId = typeof u.id === 'string' ? u.id : ''
    const mail = mailboxFor(u)
    if (!externalId || !mail) continue
    users.push({
      externalId,
      displayName: typeof u.displayName === 'string' ? u.displayName : null,
      mail,
      department: typeof u.department === 'string' && u.department.trim() ? u.department.trim() : null,
      // ABSENT IS NOT FALSE. If `$select` failed to ask for it, or Graph omitted
      // it, the honest reading is «we do not know» and the safe one is «still
      // employed» — deactivating somebody on a field we failed to request is the
      // worst available reading of an absence.
      accountEnabled: u.accountEnabled === false ? false : true,
    })
  }
  const next = b['@odata.nextLink']
  return { users, nextLink: typeof next === 'string' ? next : null }
}

/**
 * Whether to retry, and how long to wait.
 *
 * Graph answers 429 with `Retry-After` in seconds and expects it to be
 * honoured; 5xx is transient. Everything else is a decision we got wrong —
 * 401 means the refresh token is dead, 403 means consent was revoked — and
 * retrying those just delays telling the customer.
 */
export function retryAfterMs(status: number, header: string | null, attempt: number): number | null {
  if (status !== 429 && status < 500) return null
  if (attempt >= 4) return null
  const stated = header ? Number(header) : NaN
  if (Number.isFinite(stated) && stated > 0) return Math.min(stated, 60) * 1000
  // Exponential, capped. No jitter: one worker per organisation per run, so
  // there is no thundering herd to spread.
  return Math.min(2 ** attempt * 1000, 30_000)
}
