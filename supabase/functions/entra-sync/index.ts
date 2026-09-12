// Supabase Edge Function — pulls users from Microsoft Graph into `org_members`.
//
// Invoked by pg_cron through pg_net, exactly as the mail worker is, and
// authenticated the same way: a constant-time compare against a vault secret,
// not a bearer the caller supplies.
//
// EVERY DECISION IS IN SQL OR IN lib/directory/graph.ts. This file is the HTTP
// glue: acquire a token, walk the pages, hand each page to
// `app.entra_apply_page`, and call `app.entra_finish_sync` ONLY if the walk
// completed. That last word is the whole of property 1 — see the migration.
//
// ── WHAT IS UNPROVEN HERE, PLAINLY ────────────────────────────────────────
//
// AZURE_CLIENT_ID and AZURE_CLIENT_SECRET are not set in this deployment, so
// this function has never completed a real token exchange or a real Graph call.
// What IS proven, by tests that need no credentials: the field list, the paging
// parse, the retry policy (tests/unit/entra-graph.test.ts) and every database
// decision including partial failure and deprovisioning (tests/db/entra-*.test.ts).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { GRAPH_PAGE_SIZE, GRAPH_SELECT, parsePage, retryAfterMs } from '../../../lib/directory/graph.ts'

const TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`

/** Constant-time compare. `!==` on secrets leaks their prefix through timing,
 *  which is the same reasoning `lib/scim/auth.ts` carried before it was
 *  removed with the transport that needed it. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

type Connection = { org_id: string; tenant_id: string }

async function accessTokenFor(tenant: string, refresh: string): Promise<string> {
  const clientId = Deno.env.get('AZURE_CLIENT_ID')
  const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    // NAMED, not a catch-all: this is «the operator has not finished setting
    // this up», and it must read differently from «Microsoft refused us».
    throw new Error('entra_not_configured: AZURE_CLIENT_ID or AZURE_CLIENT_SECRET is missing')
  }
  const res = await fetch(TOKEN_URL(tenant), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refresh,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) {
    // The provider's own text, bounded. `app.entra_record_sync` bounds it again
    // at 500 characters — twice, because this one is the boundary where a token
    // could be echoed back in an error body and must not reach a column.
    throw new Error(`entra_token_refused: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('entra_token_refused: no access_token in response')
  return body.access_token
}

async function syncOne(admin: ReturnType<typeof createClient>, conn: Connection): Promise<void> {
  let seen = 0
  let withDepartment = 0
  const externalIds: string[] = []

  try {
    const { data: refresh, error } = await admin.rpc('entra_refresh_token_for_worker', {
      p_org: conn.org_id,
    })
    if (error || !refresh) throw new Error('entra_token_missing: no refresh token for this org')

    const token = await accessTokenFor(conn.tenant_id, String(refresh))
    let url: string | null =
      `https://graph.microsoft.com/v1.0/users?$select=${GRAPH_SELECT.join(',')}&$top=${GRAPH_PAGE_SIZE}`

    while (url) {
      let attempt = 0
      let page: Response | null = null
      // Retry inside the page, so a 429 does not lose the pages already applied.
      for (;;) {
        page = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
        if (page.ok) break
        const wait = retryAfterMs(page.status, page.headers.get('retry-after'), attempt)
        if (wait === null) throw new Error(`entra_graph_refused: HTTP ${page.status}`)
        await new Promise((r) => setTimeout(r, wait))
        attempt += 1
      }

      const parsed = parsePage(await page.json())
      if (parsed.users.length > 0) {
        const { data: applied, error: applyError } = await admin.rpc('apply_entra_page', {
          p_org: conn.org_id,
          p_users: parsed.users,
        })
        if (applyError) throw new Error(`entra_apply_failed: ${applyError.code ?? 'unknown'}`)
        const counts = (applied ?? {}) as { seen?: number; withDepartment?: number }
        seen += Number(counts.seen ?? 0)
        withDepartment += Number(counts.withDepartment ?? 0)
        for (const u of parsed.users) externalIds.push(u.externalId)
      }
      url = parsed.nextLink
    }

    // ONLY HERE. The walk completed, so absence from `externalIds` is departure
    // rather than a page that never arrived.
    await admin.rpc('finish_entra_sync', { p_org: conn.org_id, p_seen: externalIds })
    await admin.rpc('record_entra_sync', {
      p_org: conn.org_id, p_error: null, p_seen: seen, p_with_department: withDepartment,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    // LOUD. A connector that silently stops looks identical to a customer with
    // no staff changes, and the first sign would be a survey reaching nobody.
    // The counts so far are recorded too, so a partial run says how far it got.
    await admin.rpc('record_entra_sync', {
      p_org: conn.org_id, p_error: message, p_seen: seen, p_with_department: withDepartment,
    })
  }
}

Deno.serve(async (req) => {
  const expected = Deno.env.get('ENTRA_SYNC_SECRET') ?? ''
  const given = req.headers.get('x-worker-secret') ?? ''
  if (!expected || !sameSecret(expected, given)) {
    return new Response('forbidden', { status: 403 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: connections } = await admin.rpc('entra_connections_to_sync')
  const list = (connections ?? []) as Connection[]
  // One organisation at a time. Graph rate-limits per tenant, and a customer
  // whose sync fails must not be able to delay everybody else's — which is why
  // each `syncOne` swallows its own failure INTO A RECORDED ROW rather than
  // throwing out of the loop.
  for (const conn of list) await syncOne(admin, conn)

  return Response.json({ organisations: list.length })
})
