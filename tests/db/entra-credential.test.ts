import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, leserClient, outsiderClient, redaktorClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * I2-1 — THE FIRST LONG-LIVED THIRD-PARTY CREDENTIAL IN THIS PRODUCT.
 *
 * Every secret this schema has held until now is a HASH: `token_hash` on
 * invitations, share links and report shares. A hash verifies a token somebody
 * presents; it cannot produce one. An Entra refresh token is the opposite — it
 * must come back out in cleartext to be sent to Microsoft — and that single
 * property is what makes this table a different kind of thing from every table
 * before it.
 *
 * So the posture is `mail_worker_secret`'s (`M:0095`), which 5a3 caught as
 * protected-but-unproven **precisely because its return value IS a
 * credential**: the token lives in `vault`, never in `public`; one definer
 * function can decrypt it; that function is granted to `service_role` alone.
 *
 * These tests are written on the assumption that this table WILL be attacked.
 * They are the four denials the instruction names, each proven RED before the
 * migration existed, plus the two properties that make the denials meaningful:
 * that there is a row to be denied, and that deleting the connection takes the
 * secret with it rather than orphaning it in a schema no foreign key reaches.
 */
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(sql: string): { ok: boolean; out: string } {
  const r = spawnSync('psql', [DB, '-At', '-c', sql], { encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** The plaintext this suite plants. Never a realistic-looking token: a fixture
 *  that looks like a credential is one somebody later tries to use. */
const FIXTURE_TOKEN = 'SYNTHETIC-NOT-A-REAL-REFRESH-TOKEN-a1b2c3'
const FIXTURE_TENANT = '00000000-dead-beef-0000-000000000001'

let svc: Client
let orgId: string
let adminMemberId: string

beforeAll(async () => {
  svc = serviceClient()
  const { data: a } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  orgId = a!.id
  const { data: m } = await svc
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'administrator')
    .limit(1)
    .single()
  adminMemberId = m!.id

  // Plant a connection through the write path, not by hand: a fixture inserted
  // around the function under test proves nothing about the function.
  psql(`select app.entra_store_connection(
          '${orgId}'::uuid, '${FIXTURE_TENANT}', array['User.Read.All','Group.Read.All'],
          '${FIXTURE_TOKEN}', '${adminMemberId}'::uuid)`)
})

describe('non-vacuity — there is something here to deny', () => {
  it('a connection exists for the primary org', () => {
    const r = psql(`select count(*) from public.entra_connections where org_id = '${orgId}'`)
    expect(r.out.trim()).toBe('1')
  })

  it('and the token really is retrievable by the one path that may', () => {
    // If this failed, every denial below would be denying access to nothing.
    const r = psql(`select app.entra_refresh_token('${orgId}'::uuid)`)
    expect(r.ok).toBe(true)
    expect(r.out.trim()).toBe(FIXTURE_TOKEN)
  })
})

describe('1. no client role can select the token table, by any policy, for any org', () => {
  it('the table has RLS on and NO policy at all', () => {
    const rls = psql(`select relrowsecurity from pg_class where relname = 'entra_connections'`)
    expect(rls.out.trim()).toBe('t')
    const pol = psql(`select count(*) from pg_policies where tablename = 'entra_connections'`)
    // Not «no select policy» — NO POLICY. A policy that exists is a policy that
    // can be widened by a later migration that means well.
    expect(pol.out.trim()).toBe('0')
  })

  for (const [name, client] of [
    ['administrator', () => adminClient()],
    ['redaktor', () => redaktorClient()],
    ['leser', () => leserClient()],
  ] as const) {
    it(`a ${name} reads nothing`, async () => {
      const c = await client()
      const { data } = await c.from('entra_connections').select('org_id')
      expect(data ?? []).toHaveLength(0)
    })
  }

  it('an anonymous caller reads nothing', async () => {
    const { data } = await anonClient().from('entra_connections').select('org_id')
    expect(data ?? []).toHaveLength(0)
  })

  it('no client role holds any grant on the table', () => {
    // The catalogue, not the policy: RLS filters, grants are the other half, and
    // this project has paid twice for reading one and assuming the other
    // (CLAUDE.md rows 3 and 9).
    const r = psql(`
      select grantee || ':' || privilege_type
        from information_schema.role_table_grants
       where table_name = 'entra_connections' and grantee in ('anon','authenticated')
       order by 1`)
    expect(r.out.trim()).toBe('')
  })
})

describe('2. the token cannot be read cross-tenant', () => {
  it('an administrator of another organisation cannot reach ours through the status RPC', async () => {
    const outsider = await outsiderClient()
    const { data } = await outsider.rpc('entra_connection_status')
    // The RPC resolves the org from the CALLER, never from an argument — so
    // there is no id to tamper with. The other org has no connection.
    expect((data ?? []).length === 0 || (data as { configured: boolean }[])[0]?.configured === false).toBe(true)
  })

  it('and the status RPC never returns the secret, for anybody', async () => {
    const admin = await adminClient()
    const { data, error } = await admin.rpc('entra_connection_status')
    expect(error).toBeNull()
    const row = (data as Record<string, unknown>[])[0] ?? {}
    expect(JSON.stringify(row)).not.toContain(FIXTURE_TOKEN)
    // Nor the handle that would fetch it.
    expect(Object.keys(row)).not.toContain('secret_id')
  })

  it('app.entra_refresh_token is granted to service_role and to nothing else', () => {
    const r = psql(`
      select r.rolname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated'),('service_role')) as v(rolname)
        join pg_roles r on r.rolname = v.rolname
       where n.nspname = 'app' and p.proname = 'entra_refresh_token'
         and has_function_privilege(r.rolname, p.oid, 'execute')
       order by 1`)
    expect(r.out.trim().split('\n').filter(Boolean)).toEqual(['service_role'])
  })

  it('a signed-in administrator cannot call the decrypting function', async () => {
    const admin = await adminClient()
    // Not exposed in `public` at all, so PostgREST has no route to it. Asserted
    // as the absence of a public wrapper rather than as an error string.
    /*
      RESTATED TWICE, and each restatement was the code getting MORE right.

      First it said «no public function mentions decrypt» — and
      `public.mail_worker_secret` does, legitimately, since M:0095. Narrowed to
      the entra token's own name, it then said «no public function mentions
      entra_refresh_token» — and M:0118's worker wrapper does, necessarily,
      because `app.*` is off PostgREST's search path and the Edge Function has
      to reach it somehow.

      So the property is not «there is no public route». It is **«no public
      route is reachable by a client role»**, which is what actually keeps the
      token away from a browser. The grant is the control; the existence of the
      wrapper is not.
    */
    const r = psql(`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosrc ilike '%entra_refresh_token%'
         and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute'))
       order by 1`)
    expect(r.out.trim()).toBe('')
    const { error } = await admin.rpc('entra_refresh_token' as never, { p_org: orgId } as never)
    expect(error).not.toBeNull()
  })
})

describe('3. revoking a connection deletes the token rather than orphaning it', () => {
  /**
   * THE VAULT IS OUTSIDE THE FOREIGN-KEY GRAPH. `vault.secrets` is not
   * referenced by anything in `public`, so no cascade reaches it — which makes
   * this the one place in the schema where referential maintenance has to be
   * written by hand rather than declared. CLAUDE.md's family, arriving through
   * a construct that is neither a trigger scope, an FK, nor a CHECK: a table in
   * another schema that the database will not tidy for you.
   */
  it('deleting the connection removes the vault row in the same transaction', () => {
    const r = psql(`
      begin;
      do $$
      declare v_org uuid; v_secret uuid; v_before int; v_after int;
      begin
        insert into public.organizations (name) values ('Slettes av testen') returning id into v_org;
        perform app.entra_store_connection(v_org, 'tenant-x', array['User.Read.All'], 'TOKEN-X', null);
        select secret_id into v_secret from public.entra_connections where org_id = v_org;
        select count(*) into v_before from vault.secrets where id = v_secret;
        if v_before <> 1 then raise exception 'setup: no vault row (%)', v_before; end if;
        delete from public.entra_connections where org_id = v_org;
        select count(*) into v_after from vault.secrets where id = v_secret;
        if v_after <> 0 then raise exception 'orphaned vault secret survived (%)', v_after; end if;
      end $$;
      rollback;`)
    expect(r.out).not.toMatch(/orphaned vault secret|setup: no vault row/)
    expect(r.ok).toBe(true)
  })

  it('and erasing the ORGANISATION takes the token with it, through the cascade', () => {
    const r = psql(`
      begin;
      do $$
      declare v_org uuid; v_secret uuid; v_after int;
      begin
        insert into public.organizations (name) values ('Slettes helt av testen') returning id into v_org;
        perform app.entra_store_connection(v_org, 'tenant-y', array['User.Read.All'], 'TOKEN-Y', null);
        select secret_id into v_secret from public.entra_connections where org_id = v_org;
        delete from public.organizations where id = v_org;
        select count(*) into v_after from vault.secrets where id = v_secret;
        if v_after <> 0 then raise exception 'erasure left a token behind (%)', v_after; end if;
      end $$;
      rollback;`)
    expect(r.out).not.toMatch(/erasure left a token behind/)
    expect(r.ok).toBe(true)
  })

  it('no vault secret exists whose connection is gone', () => {
    // The property over the whole table rather than over the rows this test
    // made: an orphan from any earlier path fails here.
    const r = psql(`
      select count(*) from vault.secrets s
       where s.name like 'entra_refresh_token:%'
         and not exists (select 1 from public.entra_connections c where c.secret_id = s.id)`)
    expect(r.out.trim()).toBe('0')
  })
})

describe('4. the token is never in a log, an error payload, or an audit row', () => {
  it('no column of entra_connections holds the token', () => {
    const r = psql(`
      select count(*) from public.entra_connections
       where (to_jsonb(entra_connections)::text) like '%${FIXTURE_TOKEN}%'`)
    expect(r.out.trim()).toBe('0')
  })

  it('no audit row holds it', () => {
    const r = psql(`select count(*) from public.audit_events where meta::text like '%${FIXTURE_TOKEN}%'`)
    expect(r.out.trim()).toBe('0')
  })

  it('the error column cannot be filled with it — the recorder truncates and the test proves the bound', () => {
    // A provider error is third-party text and is stored. The defence is that
    // what is stored is bounded and that the recorder is the ONLY writer, so a
    // token cannot arrive by being appended to a message.
    const r = psql(`
      begin;
      select app.entra_record_sync('${orgId}'::uuid, repeat('E', 5000), 0, 0);
      select length(last_sync_error) from public.entra_connections where org_id = '${orgId}';
      rollback;`)
    expect(r.ok).toBe(true)
    // psql prints BEGIN, a blank line for the void select, the length, then
    // ROLLBACK — so `pop()` took «ROLLBACK» and the first run read NaN. The
    // truncation was working; the reader was wrong. Pick the numeric line.
    const len = Number(
      r.out.split('\n').map((l) => l.trim()).filter((l) => /^\d+$/.test(l)).pop(),
    )
    expect(Number.isFinite(len)).toBe(true)
    expect(len).toBeGreaterThan(0)
    expect(len).toBeLessThanOrEqual(500)
  })

  it('catalogue-derived: only ONE function anywhere decrypts, and it is the named one', () => {
    // Not «the function I wrote is fine» but «no other function does this»,
    // which is the shape D115's catch-all sweep established.
    const r = psql(`
      select n.nspname || '.' || p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','app') and p.prosrc ilike '%decrypted_secrets%'
       order by 1`)
    const fns = r.out.trim().split('\n').filter(Boolean).sort()
    /*
      THE FIRST VERSION OF THIS LIST HELD TWO AND THE ANSWER WAS THREE, which is
      CLAUDE.md's own shape inside a test written to prevent it: I enumerated the
      decrypting functions I knew about. `app.run_mail_worker` reads the vault
      too, has since M:0095, and is as legitimate as the other two.

      So the list is stated as what it is an enumeration OF — every function in
      `public` or `app` that can decrypt a vault secret — with each member's
      reason beside it, and a new one fails here in the commit that adds it:

        app.entra_refresh_token   I2-1. The Entra refresh token. service_role only.
        app.run_entra_sync        M:0118. Reads the sync worker's own URL and
                                  signing secret, exactly as run_mail_worker
                                  does — it decrypts OUR secret, never a
                                  customer's token.
        app.run_mail_worker       M:0095. Signs the mail worker's own call.
        public.mail_worker_secret M:0095. Returns that signing secret. service_role only.

      `app.run_entra_sync` joined the list in the same phase that wrote this
      comment, which is the mechanism working: the list is derived, so a new
      member arrives as a failure rather than as silence.
    */
    expect(fns).toEqual([
      'app.entra_refresh_token',
      'app.run_entra_sync',
      'app.run_mail_worker',
      'public.mail_worker_secret',
    ])
  })
})

describe('who writes each column', () => {
  it('every column added here is written by a function named in the migration', () => {
    const src = readFileSync('supabase/migrations/20260912000115_entra_connection.sql', 'utf8')
    for (const col of [
      'tenant_id',
      'scopes',
      'secret_id',
      'consented_at',
      'consented_by',
      'last_sync_at',
      'last_sync_error',
      'consecutive_errors',
      'members_seen',
      'members_with_department',
    ]) {
      expect(src, `${col} must be named in the migration`).toContain(col)
    }
    expect(src).toMatch(/WHO WRITES/i)
  })
})

describe('the two functions 5a3 named as protected-but-unguarded', () => {
  /**
   * Gate 5a3 reports a SECURITY DEFINER function as UNGUARDED when nothing
   * asserts its refusal — «protected» being a fact about the grant and
   * «guarded» a fact about whether anybody checked. These two are the whole
   * write side of the connection, so the gate is right to want them named.
   */
  it('store_entra_connection is unreachable by anon and by a signed-in administrator', async () => {
    const r = psql(`
      select r.rolname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated'),('service_role')) as v(rolname)
        join pg_roles r on r.rolname = v.rolname
       where n.nspname = 'public' and p.proname = 'store_entra_connection'
         and has_function_privilege(r.rolname, p.oid, 'execute')
       order by 1`)
    expect(r.out.trim().split('\n').filter(Boolean)).toEqual(['service_role'])

    // And behaviourally: a session that could store an arbitrary refresh token
    // for its own organisation could store one pointing at a directory it does
    // not own, which is why this is service_role and not administrator.
    const admin = await adminClient()
    const { error } = await admin.rpc('store_entra_connection' as never, {
      p_org: orgId, p_tenant: 'evil', p_scopes: ['User.Read.All'],
      p_token: 'x', p_by: null,
    } as never)
    expect(error).not.toBeNull()

    const { error: anonError } = await anonClient().rpc('store_entra_connection' as never, {
      p_org: orgId, p_tenant: 'evil', p_scopes: ['User.Read.All'],
      p_token: 'x', p_by: null,
    } as never)
    expect(anonError).not.toBeNull()
  })

  it('disconnect_entra refuses anon, and refuses a leser who is signed in', async () => {
    const { error } = await anonClient().rpc('disconnect_entra')
    expect(error).not.toBeNull()

    // A `leser` reaches the RPC — it is granted to `authenticated` — and the
    // function refuses on role rather than on grant, which is the half a grant
    // check cannot see. The connection must still be there afterwards.
    const leser = await leserClient()
    const { data } = await leser.rpc('disconnect_entra')
    expect((data as { error?: string } | null)?.error).toBe('forbidden')

    const still = psql(`select count(*) from public.entra_connections where org_id = '${orgId}'`)
    expect(still.out.trim()).toBe('1')
  })
})

describe('the worker wrappers are reachable by the service role and by nothing else', () => {
  /**
   * `app.*` is off PostgREST's search path, so the Edge Function needs a
   * `public` wrapper for each sync function. Five of them, and 5a3 named every
   * one as protected-but-unguarded — «protected» being a fact about the grant
   * and «guarded» a fact about whether anybody checked.
   *
   * Asserted AS A PROPERTY over the whole family rather than one test each: a
   * sixth wrapper added later is covered without editing this file, which is
   * the difference between a rule and a list.
   */
  const WRAPPERS = [
    'entra_connections_to_sync',
    'entra_refresh_token_for_worker',
    'apply_entra_page',
    'finish_entra_sync',
    'record_entra_sync',
  ]

  it('every public entra_* worker wrapper is granted to service_role alone', () => {
    const r = psql(`
      select p.proname || ':' || string_agg(r.rolname, ',' order by r.rolname)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated'),('service_role')) as v(rolname)
        join pg_roles r on r.rolname = v.rolname
       where n.nspname = 'public'
         and (p.proname like '%entra%' or p.proname like '%_entra_%')
         and has_function_privilege(r.rolname, p.oid, 'execute')
       group by p.proname order by 1`)
    const grants = Object.fromEntries(
      r.out.trim().split('\n').filter(Boolean).map((l) => {
        const [name, roles] = l.split(':')
        return [name!, roles!]
      }),
    )
    // Non-vacuity: every wrapper must be IN the result, or an empty map would
    // satisfy the loop below.
    for (const w of WRAPPERS) {
      expect(grants, `${w} must appear in the catalogue`).toHaveProperty(w)
      expect(grants[w], `${w} is service_role only`).toBe('service_role')
    }
    // And the one function a screen legitimately calls is the only exception.
    expect(grants['entra_connection_status']).toContain('authenticated')
  })

  it('and none of them answers an anonymous caller', async () => {
    const anon = anonClient()
    for (const w of WRAPPERS) {
      const { error } = await anon.rpc(w as never, {} as never)
      expect(error, `${w} must refuse anon`).not.toBeNull()
    }
  })

  it('the decrypting wrapper returns the token ONLY to the service role', async () => {
    // The sharpest of the five: `entra_refresh_token_for_worker` returns a live
    // credential over PostgREST, which this schema has never done before. It is
    // acceptable because the caller is the service role over TLS from our own
    // Edge runtime — and that is only true if no other role can reach it.
    const admin = await adminClient()
    const { error } = await admin.rpc('entra_refresh_token_for_worker' as never, {
      p_org: orgId,
    } as never)
    expect(error).not.toBeNull()

    const { data } = await svc.rpc('entra_refresh_token_for_worker' as never, {
      p_org: orgId,
    } as never)
    expect(String(data)).toBe(FIXTURE_TOKEN)
  })
})
