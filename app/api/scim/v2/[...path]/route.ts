import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateScim, recordScimOutcome } from '@/lib/scim/auth'
import {
  ScimPatch,
  ScimUser,
  SCIM_LIST_SCHEMA,
  displayNameFor,
  filterAttribute,
  mailboxFor,
  parseUserNameFilter,
  scimError,
  scimJson,
  toScimUser,
  type MemberRow,
} from '@/lib/scim/resource'

/**
 * SCIM 2.0 SERVICE PROVIDER — `/api/scim/v2/*`.
 *
 * THIS IS THE FIRST AUTHENTICATED INBOUND SURFACE THIS PRODUCT HAS. Everything
 * else is a signed-in session under RLS, or a respondent token that can do one
 * thing. Here a machine holding a long-lived credential writes membership for a
 * whole organisation, so:
 *
 *   * every handler authenticates FIRST and derives `orgId` from the credential,
 *     never from the payload or the path. A connector cannot name another
 *     tenant's organisation because it is never asked to name one;
 *   * every read and every write is scoped by that `orgId`, including the
 *     lookup of `{id}` — an id is a uuid a caller may guess, and without the
 *     scope a guessed uuid would read another organisation's member;
 *   * the payload is Zod-validated at the boundary (invariant 6), and the
 *     attributes we do not map are dropped rather than trusted.
 *
 * ── WHAT HAPPENS WHEN A SYNC FAILS HALFWAY, which is the case that decides
 *    whether this is safe ─────────────────────────────────────────────────
 *
 * SCIM is one resource per request and there is no /Bulk here (deliberately —
 * see ServiceProviderConfig below). So there is no such thing as a half-applied
 * PERSON: each request is one RPC and one transaction, and it either wrote that
 * member or it did not. A sync that fails halfway is therefore N members applied
 * and M not, with each failure reported to Entra as a SCIM error for that
 * resource. Entra retries failed resources with backoff and quarantines the
 * connector after repeated failure — so the failure mode is «some members are
 * stale», never «a member is half-written».
 *
 * That leaves the failure the instruction actually warns about: a connector that
 * stops syncing looks identical to a customer with no staff changes. Every
 * request records its outcome on the credential row (`last_used_at`,
 * `last_error`, `consecutive_errors`), so the two are distinguishable, and I1-3
 * renders the difference.
 *
 * ── WHAT DELETE MEANS HERE (Q143) ─────────────────────────────────────────
 *
 * `DELETE /Users/{id}` DEACTIVATES. It does not delete. Same reasoning as Q138:
 * two FKs referencing org_members are ON DELETE CASCADE, so honouring a delete
 * literally would make an HR event silently revoke survey-editor grants and
 * throw away who created a statutory survey. Erasure has its own path and it is
 * a REQUEST under art. 17, not something a directory does on a Tuesday. The
 * response is 204, which is what the caller expects, and the effect is
 * `active: false`.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MEMBER_COLUMNS = 'id, email, name, status, external_id, created_at, synced_at'
const MAX_COUNT = 200
const DEFAULT_COUNT = 100

function baseUrl(req: Request): string {
  return new URL('/api/scim/v2', req.url).toString()
}

/** `{ org_members.role }` is never read or written here — Q139. */
async function readMember(orgId: string, id: string): Promise<MemberRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('org_members')
    .select(MEMBER_COLUMNS)
    .eq('org_id', orgId)          // the tenancy scope, on every single read
    .eq('id', id)
    .maybeSingle()
  return (data as MemberRow | null) ?? null
}

async function readByExternalId(orgId: string, ext: string): Promise<MemberRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('org_members')
    .select(MEMBER_COLUMNS)
    .eq('org_id', orgId)
    .eq('external_id', ext)
    .maybeSingle()
  return (data as MemberRow | null) ?? null
}

type Ctx = { params: Promise<{ path?: string[] }> }

async function withAuth(
  req: Request,
  ctx: Ctx,
  handler: (orgId: string, path: string[], url: URL) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticateScim(req)
  if (!auth.ok) return scimError(auth.status, auth.detail)

  const { path = [] } = await ctx.params
  const url = new URL(req.url)
  try {
    const res = await handler(auth.orgId, path, url)
    await recordScimOutcome(auth.orgId, res.status >= 400 ? `HTTP ${res.status}` : null)
    return res
  } catch (e) {
    /* NAMED, not a catch-all that hides a class (CLAUDE.md): what this turns
       into a 500 is «the database refused this write», and the refusals are the
       ones M:0109 raises by name. They are reported to the caller as SCIM errors
       and recorded on the credential so the screen can show them. Anything
       genuinely unexpected also lands here and is ALSO recorded — which is the
       point: a swallowed failure would leave the connector looking healthy. */
    const message = e instanceof Error ? e.message : 'unknown error'
    await recordScimOutcome(auth.orgId, message)
    if (message.includes('scim_last_administrator')) {
      return scimError(400, 'This is the organisation\'s last active administrator and cannot be deactivated from a directory.', 'mutability')
    }
    if (message.includes('scim_unknown_member')) return scimError(404, 'No such user.')
    if (message.includes('scim_invalid_payload')) return scimError(400, 'externalId and userName are required.', 'invalidValue')
    console.error(`scim: ${message}`)
    return scimError(500, 'The request could not be completed.')
  }
}

async function provision(orgId: string, body: unknown): Promise<MemberRow> {
  const parsed = ScimUser.safeParse(body)
  if (!parsed.success) throw new Error('scim_invalid_payload')
  const u = parsed.data
  const ext = u.externalId ?? u.id
  if (!ext) throw new Error('scim_invalid_payload')

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('scim_provision_user', {
    p_org: orgId,
    p_external_id: ext,
    p_email: mailboxFor(u),
    // '' means «no name»: M:0109 writes `nullif(trim(coalesce(p_name,'')),'')`,
    // so an empty string is already stored as NULL rather than as a blank name.
    p_name: displayNameFor(u) ?? '',
    p_active: u.active ?? true,
  })
  if (error) throw new Error(error.message)
  const row = await readMember(orgId, data as unknown as string)
  if (!row) throw new Error('scim_invalid_payload')
  return row
}

export async function GET(req: Request, ctx: Ctx) {
  return withAuth(req, ctx, async (orgId, path, url) => {
    const base = baseUrl(req)

    if (path[0] === 'ServiceProviderConfig') {
      return scimJson({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
        documentationUri: 'https://www.heituva.com',
        // Stated honestly rather than optimistically: a service provider that
        // advertises a capability it does not implement makes the connector fail
        // at the moment it tries to use it, which is the worst time to find out.
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: MAX_COUNT },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
          {
            type: 'oauthbearertoken',
            name: 'OAuth Bearer Token',
            description: 'A long-lived bearer token minted in Administrasjon → Integrasjoner.',
            primary: true,
          },
        ],
      })
    }

    if (path[0] === 'ResourceTypes') {
      return scimJson({
        schemas: [SCIM_LIST_SCHEMA],
        totalResults: 1,
        Resources: [
          {
            schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
            id: 'User',
            name: 'User',
            endpoint: '/Users',
            schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
          },
        ],
      })
    }

    if (path[0] === 'Schemas') {
      return scimJson({
        schemas: [SCIM_LIST_SCHEMA],
        totalResults: 1,
        Resources: [{ id: 'urn:ietf:params:scim:schemas:core:2.0:User', name: 'User' }],
      })
    }

    if (path[0] !== 'Users') return scimError(404, 'No such endpoint.')

    if (path[1]) {
      const row = await readMember(orgId, path[1])
      if (!row) return scimError(404, 'No such user.')
      return scimJson(toScimUser(row, base))
    }

    // LIST, with paging. `startIndex` is 1-based in SCIM and 0-based in every
    // language, which is the off-by-one this endpoint would otherwise ship.
    const startIndex = Math.max(1, Number(url.searchParams.get('startIndex') ?? '1') || 1)
    const count = Math.min(
      MAX_COUNT,
      Math.max(0, Number(url.searchParams.get('count') ?? String(DEFAULT_COUNT)) || DEFAULT_COUNT),
    )
    const filter = url.searchParams.get('filter')
    const wanted = parseUserNameFilter(filter)
    const attr = filterAttribute(filter)

    const admin = createAdminClient()
    let q = admin
      .from('org_members')
      .select(MEMBER_COLUMNS, { count: 'exact' })
      .eq('org_id', orgId)
    if (filter && wanted === null) {
      // An unsupported filter returns an EMPTY list rather than a 400. A service
      // provider that errors on a filter it does not understand makes Entra
      // quarantine the connector — the loud failure in the wrong place. An empty
      // list makes Entra create the user, which is the recoverable answer.
      return scimJson({ schemas: [SCIM_LIST_SCHEMA], totalResults: 0, startIndex, itemsPerPage: 0, Resources: [] })
    }
    if (wanted) q = attr === 'externalId' ? q.eq('external_id', wanted) : q.eq('email', wanted)

    const { data, count: total } = await q
      .order('created_at', { ascending: true })
      .range(startIndex - 1, startIndex - 1 + Math.max(count, 1) - 1)

    const rows = (data ?? []) as MemberRow[]
    const resources = count === 0 ? [] : rows.map((m) => toScimUser(m, base))
    return scimJson({
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: total ?? resources.length,
      startIndex,
      itemsPerPage: resources.length,
      Resources: resources,
    })
  })
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(req, ctx, async (orgId, path) => {
    if (path[0] !== 'Users' || path[1]) return scimError(404, 'No such endpoint.')
    const body = await req.json().catch(() => null)
    const parsed = ScimUser.safeParse(body)
    if (!parsed.success) return scimError(400, 'Invalid User resource.', 'invalidValue')

    // RFC 7644 § 3.3: creating a resource that already exists is 409. Entra
    // relies on it — it is how the connector learns to PATCH instead.
    const ext = parsed.data.externalId ?? parsed.data.id
    if (ext && (await readByExternalId(orgId, ext))) {
      return scimError(409, 'A user with that externalId already exists.', 'uniqueness')
    }

    const row = await provision(orgId, body)
    return scimJson(toScimUser(row, baseUrl(req)), 201)
  })
}

export async function PUT(req: Request, ctx: Ctx) {
  return withAuth(req, ctx, async (orgId, path) => {
    if (path[0] !== 'Users' || !path[1]) return scimError(404, 'No such endpoint.')
    const existing = await readMember(orgId, path[1])
    if (!existing) return scimError(404, 'No such user.')

    const body = await req.json().catch(() => null)
    const parsed = ScimUser.safeParse(body)
    if (!parsed.success) return scimError(400, 'Invalid User resource.', 'invalidValue')

    // The path decides WHO, always. A payload naming a different externalId is
    // the connector having lost track, not permission to repoint the row.
    const row = await provision(orgId, {
      ...parsed.data,
      externalId: existing.external_id ?? parsed.data.externalId ?? existing.id,
    })
    return scimJson(toScimUser(row, baseUrl(req)))
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(req, ctx, async (orgId, path) => {
    if (path[0] !== 'Users' || !path[1]) return scimError(404, 'No such endpoint.')
    const existing = await readMember(orgId, path[1])
    if (!existing) return scimError(404, 'No such user.')

    const body = await req.json().catch(() => null)
    const parsed = ScimPatch.safeParse(body)
    if (!parsed.success) return scimError(400, 'Invalid PatchOp.', 'invalidSyntax')

    // The ONLY patch this endpoint acts on is `active`, because it is the only
    // one Entra sends that changes anything we store beyond what a PUT carries —
    // and it is the deprovision. Ops on attributes we do not map are accepted
    // and ignored rather than refused: refusing would quarantine the connector
    // over a `department` nobody reads.
    let active: boolean | undefined
    for (const op of parsed.data.Operations) {
      if (!['replace', 'add'].includes(op.op.toLowerCase())) continue
      const path0 = (op.path ?? '').toLowerCase()
      if (path0 === 'active') {
        active = op.value === true || op.value === 'True' || op.value === 'true'
      } else if (!op.path && op.value && typeof op.value === 'object') {
        const v = (op.value as Record<string, unknown>).active
        if (v !== undefined) active = v === true || v === 'True' || v === 'true'
      }
    }

    if (active === false) {
      const admin = createAdminClient()
      const ext = existing.external_id
      if (!ext) {
        // A member this directory has never claimed. Deprovisioning them from a
        // directory that does not manage them would let one connector deactivate
        // people it never provisioned.
        return scimError(404, 'No such user.')
      }
      const { error } = await admin.rpc('scim_deprovision_user', { p_org: orgId, p_external_id: ext })
      if (error) throw new Error(error.message)
    } else if (active === true) {
      await provision(orgId, {
        userName: existing.email,
        externalId: existing.external_id ?? existing.id,
        displayName: existing.name ?? undefined,
        active: true,
      })
    }

    const row = await readMember(orgId, path[1])
    return scimJson(toScimUser(row ?? existing, baseUrl(req)))
  })
}

export async function DELETE(req: Request, ctx: Ctx) {
  return withAuth(req, ctx, async (orgId, path) => {
    if (path[0] !== 'Users' || !path[1]) return scimError(404, 'No such endpoint.')
    const existing = await readMember(orgId, path[1])
    if (!existing) return scimError(404, 'No such user.')
    if (!existing.external_id) return scimError(404, 'No such user.')

    // Q143 — DELETE DEACTIVATES. See the header.
    const admin = createAdminClient()
    const { error } = await admin.rpc('scim_deprovision_user', {
      p_org: orgId,
      p_external_id: existing.external_id,
    })
    if (error) throw new Error(error.message)
    return new Response(null, { status: 204 })
  })
}
