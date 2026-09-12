import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SERVICE_KEY, SUPABASE_URL, serviceClient, type Client } from './clients'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/* The route builds its own service client from the environment, the way it does
   in production — so the environment is what has to be right here, rather than a
   client being injected for the test. Set BEFORE the route module is imported:
   `createAdminClient` reads the key at call time, but keeping the order explicit
   means a later refactor that reads it at module scope does not break silently. */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY ??= SERVICE_KEY

const { DELETE, GET, PATCH, POST, PUT } = await import('@/app/api/scim/v2/[...path]/route')

/**
 * I1-2 — THE INBOUND SURFACE, EXERCISED AS A CALLER WOULD.
 *
 * The handlers are plain functions over `Request`, so this calls them directly
 * rather than against a running server. That is not a shortcut: it means the
 * bearer check, the Zod boundary, the tenancy scope and the SCIM envelope are
 * all in the normal suite, on every run, with no gate added and no server to be
 * stale (which cost this project a 6464-finding scare on 2026-09-12).
 */
const DB = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(q: string): string[][] {
  return execFileSync('psql', [DB, '-tAF\t', '-c', q], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map((r) => r.split('\t'))
}
function one(q: string): string[] {
  const rows = psql(q)
  if (!rows[0]) throw new Error(`no row for: ${q}`)
  return rows[0]
}

const rnd = () => Math.random().toString(36).slice(2, 10)
const MARK = 'SCIM Endpoint Person'
const BASE = 'http://127.0.0.1:3100/api/scim/v2'

let svc: Client
let orgId: string
let otherOrgId: string
let token: string

/** Mints a credential directly, because `create_scim_token` needs an
 *  administrator SESSION and this suite has a service client. The token SHAPE is
 *  the contract under test, so it is built the same way the function builds it. */
function mintFor(org: string): string {
  const prefix = rnd().padEnd(12, '0').slice(0, 12).replace(/[^0-9a-f]/g, 'a')
  const secret = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const hash = createHash('sha256').update(secret).digest('hex')
  execFileSync('psql', [DB, '-tAc',
    `insert into public.scim_credentials (org_id, token_prefix, token_hash)
     values ('${org}', '${prefix}', '${hash}')
     on conflict (org_id) do update set token_prefix = excluded.token_prefix,
       token_hash = excluded.token_hash, revoked_at = null, consecutive_errors = 0,
       last_error = null, window_started_at = null, window_count = 0`])
  return `hei_scim_${prefix}_${secret}`
}

function req(method: string, path: string, body?: unknown, bearer: string | null = token): Request {
  return new Request(`${BASE}/${path}`, {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      'content-type': 'application/scim+json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split('/').filter(Boolean) }) })

const user = (ext: string, email: string, active = true) => ({
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
  externalId: ext,
  userName: `${email.split('@')[0]}@upn.example.test`,  // a UPN, NOT the mailbox
  displayName: MARK,
  emails: [{ value: email, type: 'work', primary: true }],
  active,
})

beforeAll(async () => {
  svc = serviceClient()
  const { data: a } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  const { data: b } = await svc.from('organizations').select('id').eq('name', ORG_OTHER).single()
  orgId = a!.id
  otherOrgId = b!.id
  token = mintFor(orgId)
}, 60_000)

afterAll(async () => {
  await svc.from('org_members').delete().eq('name', MARK)
  await svc.from('org_members').delete().like('email', 'ep-%@example.test')
  await svc.from('scim_credentials').delete().eq('org_id', otherOrgId)
  /* PUT THE DEMO CONNECTOR BACK. `beforeAll` mints over it, and deleting it
     instead of restoring it is precisely the trap `tests/routes.manifest.ts`
     warns about: «does this state write, and if so what undoes it». Measured
     rather than reasoned about — a live `curl` against the endpoint returned 401
     after this suite had run, because the demo token no longer existed. Two
     consequences, and the second is worse: the seeded row is what gives
     `verify:policy` something to refuse, so without it 5a3 reports
     scim_credentials PROTECTED BUT UNPROVEN, in a later run, for a reason nobody
     would look for in this file. */
  await svc.from('scim_credentials').upsert(
    {
      org_id: orgId,
      token_prefix: 'deadbeef1234',
      token_hash: createHash('sha256').update('f'.repeat(64)).digest('hex'),
      last_used_at: new Date(Date.now() - 36 * 3600_000).toISOString(),
    },
    { onConflict: 'org_id' },
  )
})

describe('I1-2 · the bearer check', () => {
  it('1. refuses with no token at all', async () => {
    const r = await GET(req('GET', 'Users', undefined, null), ctx('Users'))
    expect(r.status).toBe(401)
    expect((await r.json()).schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error')
  })

  it('2. refuses a RIGHT prefix with a WRONG secret — and says the same thing', async () => {
    const [, , prefix] = token.split('_')
    const wrong = `hei_scim_${prefix}_${'0'.repeat(64)}`
    const bad = await GET(req('GET', 'Users', undefined, wrong), ctx('Users'))
    const none = await GET(req('GET', 'Users', undefined, 'hei_scim_ffffffffffff_' + '0'.repeat(64)),
      ctx('Users'))
    expect(bad.status).toBe(401)
    expect(none.status).toBe(401)
    // A caller must not be able to tell «this prefix exists» from «it does not».
    expect(await bad.text()).toBe(await none.text())
  })

  it('3. refuses a malformed token without touching the database', async () => {
    for (const t of ['', 'Bearer', 'hei_scim_short_x', 'hei_scim_' + 'z'.repeat(12) + '_' + '0'.repeat(64)]) {
      const r = await GET(req('GET', 'Users', undefined, t), ctx('Users'))
      expect(r.status, `token: ${t}`).toBe(401)
    }
  })

  it('4. refuses a REVOKED token', async () => {
    const t = mintFor(otherOrgId)
    execFileSync('psql', [DB, '-tAc',
      `update public.scim_credentials set revoked_at = now() where org_id = '${otherOrgId}'`])
    const r = await GET(req('GET', 'Users', undefined, t), ctx('Users'))
    expect(r.status).toBe(401)
    execFileSync('psql', [DB, '-tAc',
      `delete from public.scim_credentials where org_id = '${otherOrgId}'`])
  })
})

describe('I1-2 · discovery', () => {
  it('5. ServiceProviderConfig says what is true, including what is NOT supported', async () => {
    const r = await GET(req('GET', 'ServiceProviderConfig'), ctx('ServiceProviderConfig'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.patch.supported, 'PATCH is how Entra deprovisions').toBe(true)
    // Advertising /Bulk would make the connector fail at the moment it used it.
    expect(body.bulk.supported).toBe(false)
    expect(body.changePassword.supported).toBe(false)
    expect(body.authenticationSchemes[0].type).toBe('oauthbearertoken')
  })
})

describe('I1-2 · provisioning over HTTP', () => {
  it('6. POST /Users creates a member, and takes the MAILBOX rather than the UPN', async () => {
    /* Q144. Entra's default mapping sends userName = userPrincipalName and
       emails[work].value = mail, and at most real customers those differ. Taking
       userName would address every invitation to something that does not
       receive — and the failure would look like «the survey reached nobody»,
       because sent_at means ACCEPTED BY THE PROVIDER (D133). */
    const ext = `ep-${rnd()}`
    const email = `ep-${rnd()}@example.test`
    const r = await POST(req('POST', 'Users', user(ext, email)), ctx('Users'))
    expect(r.status).toBe(201)
    const body = await r.json()
    expect(body.userName, 'the resource reports the mailbox we will actually use').toBe(email)

    const [storedEmail, source, status] = one(
      `select email, source, status from public.org_members
        where org_id = '${orgId}' and external_id = '${ext}'`)
    expect(storedEmail).toBe(email)
    expect(source).toBe('scim')
    expect(status).toBe('active')
  })

  it('7. and a second POST with the same externalId is 409, not a duplicate', async () => {
    const ext = `ep-${rnd()}`
    const email = `ep-${rnd()}@example.test`
    await POST(req('POST', 'Users', user(ext, email)), ctx('Users'))
    const r = await POST(req('POST', 'Users', user(ext, email)), ctx('Users'))
    expect(r.status, 'RFC 7644 §3.3 — it is how Entra learns to PATCH instead').toBe(409)
    expect((await r.json()).scimType).toBe('uniqueness')
  })

  it('8. an invalid payload is refused at the boundary, not by the database', async () => {
    const r = await POST(req('POST', 'Users', { schemas: [], nope: true }), ctx('Users'))
    expect(r.status).toBe(400)
    expect((await r.json()).scimType).toBe('invalidValue')
  })
})

describe('I1-2 · TENANCY — the property a bearer token makes possible to get wrong', () => {
  it('9. a member of ANOTHER organisation is 404 by id, not readable', async () => {
    const { data: victim } = await svc.from('org_members')
      .select('id').eq('org_id', otherOrgId).limit(1).single()
    expect(victim?.id, 'the other organisation must have a member, or this is vacuous').toBeTruthy()

    const r = await GET(req('GET', `Users/${victim!.id}`), ctx(`Users/${victim!.id}`))
    expect(r.status, 'an id is a uuid a caller may present; the org scope is what refuses it')
      .toBe(404)
  })

  it('10. and the list never contains one', async () => {
    const { data: theirs } = await svc.from('org_members')
      .select('email').eq('org_id', otherOrgId)
    const theirEmails = (theirs ?? []).map((m) => m.email.toLowerCase())
    expect(theirEmails.length, 'the other organisation must have members').toBeGreaterThan(0)

    const r = await GET(req('GET', 'Users?count=200'), ctx('Users'))
    const body = await r.json()
    const got = (body.Resources as { userName: string }[]).map((u) => u.userName.toLowerCase())
    expect(got.length, 'and ours must be non-empty, or the intersection is trivially empty')
      .toBeGreaterThan(0)
    for (const e of theirEmails) expect(got).not.toContain(e)
  })

  it('11. and a PATCH cannot deprovision one — even when it HAS an externalId', async () => {
    /* THE EXTERNALID IS THE POINT, AND THE FIRST VERSION OF THIS TEST WAS GREEN
       WITHOUT IT FOR THE WRONG REASON: the victim had no `external_id`, so the
       handler's 404 came from that check and not from tenancy at all — it would
       have passed against a connector that could reach any organisation.

       TWO INDEPENDENT DEFENCES, ONE TEST EACH, and the measurement says which is
       which. With the org scope deleted from `readMember`, test 9 fails (200
       instead of 404) and THIS ONE STILL PASSES — because the read scope is a
       convenience and the control is the org scope inside
       `scim_deprovision_member`, which takes the organisation from the
       CREDENTIAL and never from the request. That is the right division and it
       is stated rather than assumed: this test is not a second check of the
       read, it is the only check of the write. */
    const { data: victim } = await svc.from('org_members')
      .select('id, status').eq('org_id', otherOrgId).limit(1).single()
    const ext = `ep-victim-${rnd()}`
    execFileSync('psql', [DB, '-tAc',
      `update public.org_members set external_id = '${ext}', source = 'scim'
        where id = '${victim!.id}'`])

    const r = await PATCH(
      req('PATCH', `Users/${victim!.id}`, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      }),
      ctx(`Users/${victim!.id}`))
    expect(r.status).toBe(404)
    const [after] = one(`select status from public.org_members where id = '${victim!.id}'`)
    expect(after, 'and they are untouched').toBe(victim!.status)

    // And the same externalId presented directly to the write path, which is the
    // defence that actually matters: the read refusing is a convenience, the
    // function's org scope is the control. It must RAISE, by name.
    const direct = spawnSync('psql', [DB, '-tAc',
      `select app.scim_deprovision_member('${orgId}', '${ext}')`], { encoding: 'utf8' })
    expect(direct.status, 'a foreign externalId must not resolve under our org').not.toBe(0)
    expect(direct.stderr).toContain('scim_unknown_member')

    execFileSync('psql', [DB, '-tAc',
      `update public.org_members set external_id = null, source = null where id = '${victim!.id}'`])
  })
})

describe('I1-2 · deprovisioning over HTTP', () => {
  it('12. PATCH active:false deactivates, and reaches the state the mail guards read', async () => {
    const ext = `ep-${rnd()}`
    const email = `ep-${rnd()}@example.test`
    const created = await (await POST(req('POST', 'Users', user(ext, email)), ctx('Users'))).json()

    const r = await PATCH(
      req('PATCH', `Users/${created.id}`, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      }),
      ctx(`Users/${created.id}`))
    expect(r.status).toBe(200)
    expect((await r.json()).active).toBe(false)

    const [status, src, blocks] = one(
      `select status, status_source, app.member_blocks_invitation(status)::text
         from public.org_members where id = '${created.id}'`)
    expect(status).toBe('inactive')
    expect(src).toBe('scim')
    expect(blocks, 'the whole point: it is the state M:0107/M:0108 already guard').toBe('true')
  })

  it('13. DELETE deactivates and does NOT delete — Q143', async () => {
    const ext = `ep-${rnd()}`
    const email = `ep-${rnd()}@example.test`
    const created = await (await POST(req('POST', 'Users', user(ext, email)), ctx('Users'))).json()

    const r = await DELETE(req('DELETE', `Users/${created.id}`), ctx(`Users/${created.id}`))
    expect(r.status, 'the caller gets what it expects').toBe(204)

    const [status] = one(`select status from public.org_members where id = '${created.id}'`)
    expect(status, 'and the effect is deactivation').toBe('inactive')
    const [count] = one(`select count(*)::text from public.org_members where id = '${created.id}'`)
    expect(count, 'the row is still there — two FKs referencing it are ON DELETE CASCADE').toBe('1')
  })

  it('14. and the last active administrator is refused, by name', async () => {
    const [adminId] = one(
      `select id::text from public.org_members where org_id = '${orgId}'
        and role = 'administrator' and status = 'active' limit 1`)
    const [n] = one(
      `select count(*)::text from public.org_members where org_id = '${orgId}'
        and role = 'administrator' and status = 'active'`)
    expect(n, 'exactly one, or this proves nothing about the LAST one').toBe('1')

    const ext = `ep-admin-${rnd()}`
    execFileSync('psql', [DB, '-tAc',
      `update public.org_members set external_id = '${ext}', source = 'scim' where id = '${adminId}'`])
    const r = await DELETE(req('DELETE', `Users/${adminId}`), ctx(`Users/${adminId}`))
    expect(r.status).toBe(400)
    expect((await r.json()).detail).toMatch(/last active administrator/i)

    const [still] = one(`select status from public.org_members where id = '${adminId}'`)
    expect(still).toBe('active')
    execFileSync('psql', [DB, '-tAc',
      `update public.org_members set external_id = null, source = null where id = '${adminId}'`])
  })

  it('15. PATCH active:true brings them back', async () => {
    const ext = `ep-${rnd()}`
    const email = `ep-${rnd()}@example.test`
    const created = await (await POST(req('POST', 'Users', user(ext, email, false)), ctx('Users'))).json()
    expect(created.active, 'created inactive, so the reactivation is not a no-op').toBe(false)

    await PATCH(
      req('PATCH', `Users/${created.id}`, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: true }],
      }),
      ctx(`Users/${created.id}`))
    const [status] = one(`select status from public.org_members where id = '${created.id}'`)
    expect(status).toBe('active')
  })
})

describe('I1-2 · filter and paging', () => {
  it('16. finds a user by the ONE filter Entra sends', async () => {
    const ext = `ep-${rnd()}`
    const email = `ep-${rnd()}@example.test`
    await POST(req('POST', 'Users', user(ext, email)), ctx('Users'))

    const r = await GET(req('GET', `Users?filter=${encodeURIComponent(`userName eq "${email}"`)}`),
      ctx('Users'))
    const body = await r.json()
    expect(body.totalResults).toBe(1)
    expect(body.Resources[0].userName).toBe(email)
  })

  it('17. an UNSUPPORTED filter returns an empty list, not a 400', async () => {
    /* A service provider that errors on a filter it does not understand makes
       Entra quarantine the connector — the loud failure in the wrong place. An
       empty list makes Entra create the user, which is recoverable. */
    const r = await GET(req('GET', `Users?filter=${encodeURIComponent('title co "chief"')}`),
      ctx('Users'))
    expect(r.status).toBe(200)
    expect((await r.json()).totalResults).toBe(0)
  })

  it('18. startIndex is 1-BASED, which is the off-by-one this would otherwise ship', async () => {
    const all = await (await GET(req('GET', 'Users?count=200'), ctx('Users'))).json()
    expect(all.Resources.length, 'need at least two members to tell 0-based from 1-based')
      .toBeGreaterThan(1)

    const first = await (await GET(req('GET', 'Users?startIndex=1&count=1'), ctx('Users'))).json()
    const second = await (await GET(req('GET', 'Users?startIndex=2&count=1'), ctx('Users'))).json()

    expect(first.startIndex).toBe(1)
    expect(first.itemsPerPage).toBe(1)
    expect(first.Resources[0].id, 'startIndex=1 is the FIRST, not the second')
      .toBe(all.Resources[0].id)
    expect(second.Resources[0].id).toBe(all.Resources[1].id)
    expect(first.totalResults, 'and totalResults counts the whole set, not the page')
      .toBe(all.totalResults)
  })

  it('19. PUT replaces without letting the payload repoint the row', async () => {
    const ext = `ep-${rnd()}`
    const email = `ep-${rnd()}@example.test`
    const created = await (await POST(req('POST', 'Users', user(ext, email)), ctx('Users'))).json()

    const r = await PUT(
      req('PUT', `Users/${created.id}`, { ...user('ep-someone-else', email), displayName: 'Nytt Navn' }),
      ctx(`Users/${created.id}`))
    expect(r.status).toBe(200)

    const [extAfter, nameAfter] = one(
      `select external_id, name from public.org_members where id = '${created.id}'`)
    expect(extAfter, 'the PATH decides who; a payload naming another externalId is the ' +
      'connector having lost track, not permission to repoint the row').toBe(ext)
    expect(nameAfter).toBe('Nytt Navn')
  })
})

describe('I1-2 · a failure is loud', () => {
  it('20. a refusal is recorded on the credential, and a success clears it', async () => {
    /* The failure the instruction names: a connector that silently stops looks
       identical to a customer with no staff changes. These four columns are the
       only thing that tells them apart, and I1-3 renders the difference. */
    await POST(req('POST', 'Users', { nope: true }), ctx('Users'))
    const [errs, lastError] = one(
      `select consecutive_errors::text, coalesce(last_error,'')
         from public.scim_credentials where org_id = '${orgId}'`)
    expect(Number(errs), 'a refused request must leave a mark').toBeGreaterThan(0)
    expect(lastError).not.toBe('')

    await GET(req('GET', 'ServiceProviderConfig'), ctx('ServiceProviderConfig'))
    const [after, lastUsed] = one(
      `select consecutive_errors::text, coalesce(last_used_at::text,'')
         from public.scim_credentials where org_id = '${orgId}'`)
    expect(after, 'and a success clears the streak').toBe('0')
    expect(lastUsed).not.toBe('')
  })
})

describe('I1-2 · the grants, read back from the catalogue', () => {
  it('21. nothing but service_role may execute the four route entry points', () => {
    /* Row 3 and row 9 of CLAUDE.md's table, which this project has paid for
       twice: `revoke ... from public` alone leaves standing the grant `anon`
       INHERITS from PUBLIC. A grant is a fact about the catalogue and is read
       back from the catalogue — the only form of the rule that does not depend
       on remembering to spell it right. */
    const fns = ['scim_lookup', 'scim_touch', 'scim_provision_user', 'scim_deprovision_user']
    for (const fn of fns) {
      const [anon, auth, svcRole] = one(
        `select has_function_privilege('anon', p.oid, 'execute')::text,
                has_function_privilege('authenticated', p.oid, 'execute')::text,
                has_function_privilege('service_role', p.oid, 'execute')::text
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = '${fn}' limit 1`)
      expect(anon, `anon must not execute ${fn}`).toBe('false')
      expect(auth, `authenticated must not execute ${fn}`).toBe('false')
      expect(svcRole, `service_role must — or the route cannot work`).toBe('true')
    }
  })

  it('22. and scim_credentials has RLS on with NO policy, like responses and answers', () => {
    const [rls] = one(
      `select relrowsecurity::text from pg_class where oid = 'public.scim_credentials'::regclass`)
    expect(rls, 'RLS must be on').toBe('true')
    const [policies] = one(
      `select count(*)::text from pg_policies
        where schemaname = 'public' and tablename = 'scim_credentials'`)
    expect(policies, 'and there must be NO policy — nothing reaches the hash but a definer function')
      .toBe('0')
  })
})

/**
 * THE ONE THING THESE TESTS STRUCTURALLY CANNOT SEE, GUARDED AS A PROXY AND
 * RECORDED AS A LIMIT (D162).
 *
 * Every test above calls the route handlers as functions, which is what makes
 * them fast, serverless and free of the stale-`next-server` failure that cost
 * this project a 6464-finding scare. It is also why all twenty-two of them
 * passed while the endpoint was UNREACHABLE IN PRODUCTION: Next's middleware
 * matcher catches `/api/scim/*`, the public-path list in
 * `lib/supabase/middleware.ts` did not name it, and an unauthenticated SCIM
 * request was answered with a 307 to `/logg-inn` — an HTML login page, sent to
 * a machine that speaks JSON.
 *
 * Found by READING the middleware, not by any gate, and fixed there. Measured
 * afterwards against a real server: `401 application/scim+json` with no token,
 * `200` on ServiceProviderConfig with one.
 *
 * WHAT THIS TEST IS: a proxy. It asserts the line exists, so deleting it fails
 * here. WHAT IT IS NOT: proof the route is served — only an HTTP request to a
 * running server is that, and no gate makes one for an API route. That gap is
 * D162 rather than a gate added mid-phase.
 */
describe('I1-2 · the endpoint is reachable at all', () => {
  it('23. the middleware names /api/scim/ as public — the bearer IS the credential', () => {
    const src = execFileSync('cat', ['lib/supabase/middleware.ts'], { encoding: 'utf8' })
    expect(src, 'without this line every test above passes and Entra gets a 307 to /logg-inn')
      .toMatch(/path\.startsWith\('\/api\/scim\/'\)/)
    // Non-vacuity: the file must actually be the public-path list, or the match
    // above could be satisfied by any file that happened to contain the string.
    expect(src).toContain("path.startsWith('/s/')")
    expect(src).toContain('!user && !isPublic')
  })
})
