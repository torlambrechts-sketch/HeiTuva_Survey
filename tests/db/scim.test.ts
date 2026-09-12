import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * I1-1b — THE DATABASE HALF OF ENTRA ID / SCIM PROVISIONING.
 *
 * No HTTP here. `app.scim_upsert_member` and `app.scim_deprovision_member` are
 * the only two things a directory may do to this database, and I1-2's inbound
 * route is a caller of them rather than a second implementation. They live in
 * `app`, which PostgREST does not expose, so the only way to reach them is with
 * the service role from server code.
 *
 * The three properties the instruction names, and property 2 is the one it
 * expects to be got wrong:
 *
 *   1. A deprovisioned member cannot receive a new invitation. ALREADY STANDS —
 *      `M:0107` and `M:0108` built it and `tests/db/deactivation.test.ts` derives
 *      it over every `pgmq.send` producer. Re-asserted here only at the seam:
 *      that a SCIM deprovision reaches the same `inactive` state the guards read,
 *      rather than a parallel one they do not.
 *   2. A deprovisioned member's ALREADY GIVEN answers are untouched.
 *      Deprovisioning is not erasure: the answers are anonymous and unlinked, and
 *      a well-meant cascade would destroy a round's results — the shape
 *      `report_shares.group_id` had. Counts before and after, and both non-zero.
 *   3. Provisioning writes `org_members` and NOTHING else. Asserted by
 *      snapshotting the row count of every table in `public` and requiring that
 *      exactly one of them moved.
 */
const DB = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

/** Calls a function and returns stderr on failure instead of throwing, so a
 *  test can assert WHICH refusal happened rather than only that one did. */
function tryPsql(query: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync('psql', [DB, '-tAc', query], { encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: r.stderr ?? '' }
}

/** Every table in `public` and how many rows it holds. Catalogue-derived: a
 *  table added later is covered without editing this. */
function rowCounts(): Record<string, number> {
  const tables = psql(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`).map((r) => r[0]!)
  const union = tables
    .map((t) => `select '${t}' as t, count(*)::bigint as n from public."${t}"`)
    .join(' union all ')
  const out: Record<string, number> = {}
  for (const [t, n] of psql(union)) out[t!] = Number(n)
  return out
}

/** The first row of a one-row query, as a tuple. Throws rather than returning
 *  undefined, so a test that asserts about a row nobody created fails on the
 *  missing row and not three lines later on a destructured `undefined`. */
function one(query: string): string[] {
  const rows = psql(query)
  if (rows.length === 0 || rows[0] === undefined) throw new Error(`no row for: ${query}`)
  return rows[0]
}

function movedTables(before: Record<string, number>, after: Record<string, number>): string[] {
  return Object.keys(after).filter((t) => (before[t] ?? 0) !== after[t]).sort()
}

const rnd = () => Math.random().toString(36).slice(2, 10)
const MARK = 'SCIM Test Person'
let svc: Client
let orgId: string

beforeAll(async () => {
  svc = serviceClient()
  const { data } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  orgId = data!.id
}, 60_000)

afterAll(async () => {
  await svc.from('org_members').delete().eq('org_id', orgId).eq('name', MARK)
  await svc.from('org_members').delete().eq('org_id', orgId).like('email', 'scim-%@example.test')
  /* Test 14 mints a real credential over the demo one. Put the demo row back
     rather than leaving the database in a state the seed did not create: the
     demo connector is what gives `verify:policy` a row to refuse and I1-3 a
     state to render, and a suite that silently removes it makes the NEXT run of
     5a3 report PROTECTED BUT UNPROVEN for a reason nobody would look for here. */
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

describe('I1-1b · property 3 — provisioning writes org_members and nothing else', () => {
  it('1. an upsert creates exactly one row, in exactly one table', () => {
    const before = rowCounts()
    const r = tryPsql(
      `select app.scim_upsert_member('${orgId}', 'ext-${rnd()}', 'scim-${rnd()}@example.test',
                                     '${MARK}', true)`)
    expect(r.ok, r.err).toBe(true)
    const after = rowCounts()

    expect(movedTables(before, after),
      'a provisioning call must touch org_members and nothing else — no survey, no ' +
      'invitation, no group, no audit row the payload did not ask for')
      .toEqual(['org_members'])
    expect(after.org_members, 'and exactly one row').toBe((before.org_members ?? 0) + 1)
  })

  it('2. and it does NOT write role or group_id — those are not the directory’s to decide', () => {
    const ext = `ext-${rnd()}`
    const email = `scim-${rnd()}@example.test`
    tryPsql(`select app.scim_upsert_member('${orgId}', '${ext}', '${email}', '${MARK}', true)`)
    const row = one(
      `select role::text, coalesce(group_id::text,''), source, status, status_source
         from public.org_members where org_id = '${orgId}' and external_id = '${ext}'`)
    expect(row, 'the row must exist, or the assertions below are vacuous').toBeTruthy()
    const [role, group, source, status, statusSource] = row
    // `leser` is the table default. A directory tells us a person exists; who may
    // administer this organisation is an authorisation decision and stays here.
    expect(role).toBe('leser')
    expect(group).toBe('')
    expect(source).toBe('scim')
    expect(status).toBe('active')
    expect(statusSource).toBe('scim')
  })

  it('3. a second sync of the same person updates rather than duplicating', () => {
    const ext = `ext-${rnd()}`
    const email = `scim-${rnd()}@example.test`
    tryPsql(`select app.scim_upsert_member('${orgId}', '${ext}', '${email}', 'Old Name', true)`)
    const before = rowCounts()
    const r = tryPsql(
      `select app.scim_upsert_member('${orgId}', '${ext}', '${email}', '${MARK}', true)`)
    expect(r.ok, r.err).toBe(true)
    expect(movedTables(before, rowCounts()), 'no new row').toEqual([])
    const [name] = one(
      `select name from public.org_members where org_id = '${orgId}' and external_id = '${ext}'`)
    expect(name).toBe(MARK)
  })

  it('4. and the FIRST sync ADOPTS a member who already exists by address', () => {
    /* The case that would otherwise fail on `org_members_org_id_email_key` and
       look like a broken connector on the customer's first sync: the people the
       directory is about are already in the product, invited by hand. Matching
       on external_id alone would try to insert a duplicate; matching on address
       when external_id is unseen adopts the existing row and stamps it. */
    const email = `scim-${rnd()}@example.test`
    const ext = `ext-${rnd()}`
    execFileSync('psql', [DB, '-tAc',
      `insert into public.org_members (org_id, email, name, role, status)
       values ('${orgId}', '${email}', '${MARK}', 'redaktor', 'active')`])
    const before = rowCounts()

    const r = tryPsql(`select app.scim_upsert_member('${orgId}', '${ext}', '${email}', '${MARK}', true)`)
    expect(r.ok, r.err).toBe(true)
    expect(movedTables(before, rowCounts()), 'adopted, not duplicated').toEqual([])

    const [extId, role] = one(
      `select external_id, role::text from public.org_members
        where org_id = '${orgId}' and lower(email) = '${email}'`)
    expect(extId, 'the existing row is stamped with the directory key').toBe(ext)
    // And the role they were given here SURVIVES adoption. A connector that
    // reset an editor to `leser` on first sync would be a silent demotion.
    expect(role, 'adoption must not overwrite a role decided in this product').toBe('redaktor')
  })
})

describe('I1-1b · property 2 — deprovisioning is not erasure', () => {
  it('5. a deprovision touches NO answers and NO responses, and both exist', async () => {
    const beforeA = await svc.from('answers').select('id', { count: 'exact', head: true })
    const beforeR = await svc.from('responses').select('id', { count: 'exact', head: true })
    expect(beforeA.count, 'the database must hold answers, or this passes vacuously')
      .toBeGreaterThan(0)
    expect(beforeR.count, 'and responses').toBeGreaterThan(0)

    const ext = `ext-${rnd()}`
    tryPsql(`select app.scim_upsert_member('${orgId}', '${ext}',
             'scim-${rnd()}@example.test', '${MARK}', true)`)
    const r = tryPsql(`select app.scim_deprovision_member('${orgId}', '${ext}')`)
    expect(r.ok, r.err).toBe(true)

    const afterA = await svc.from('answers').select('id', { count: 'exact', head: true })
    const afterR = await svc.from('responses').select('id', { count: 'exact', head: true })
    expect(afterA.count, 'deprovisioning is not erasure').toBe(beforeA.count)
    expect(afterR.count).toBe(beforeR.count)
  })

  it('6. and it moves EXACTLY ONE table — the row stays, nothing cascades', () => {
    const ext = `ext-${rnd()}`
    tryPsql(`select app.scim_upsert_member('${orgId}', '${ext}',
             'scim-${rnd()}@example.test', '${MARK}', true)`)
    const before = rowCounts()

    const r = tryPsql(`select app.scim_deprovision_member('${orgId}', '${ext}')`)
    expect(r.ok, r.err).toBe(true)

    // Q138: the row STAYS. A delete would cascade `notifications` and
    // `survey_editors` and null twenty other referents — an HR event silently
    // performing an erasure and a permissions change nobody asked for.
    expect(movedTables(before, rowCounts()), 'nothing is created and nothing is destroyed')
      .toEqual([])
    const [status, src] = one(
      `select status, status_source from public.org_members
        where org_id = '${orgId}' and external_id = '${ext}'`)
    expect(status).toBe('inactive')
    expect(src, 'and the reversal story is recorded: a sync wrote this').toBe('scim')
  })

  it('7. the deprovisioned state is the SAME state the invitation guards read', () => {
    /* Property 1, asserted at the seam rather than rebuilt. The guards in
       M:0107/M:0108 all go through app.member_blocks_invitation; if a SCIM
       deprovision wrote some parallel state they would not see it. */
    const ext = `ext-${rnd()}`
    const email = `scim-${rnd()}@example.test`
    tryPsql(`select app.scim_upsert_member('${orgId}', '${ext}', '${email}', '${MARK}', true)`)
    tryPsql(`select app.scim_deprovision_member('${orgId}', '${ext}')`)

    const [blocks] = one(
      `select app.member_blocks_invitation(status)::text from public.org_members
        where org_id = '${orgId}' and external_id = '${ext}'`)
    expect(blocks, 'a SCIM deprovision must reach the state the guards already read').toBe('true')
  })
})

describe('I1-1b · the two refusals', () => {
  it('8. a sync may NOT deprovision the last active administrator', () => {
    /* Q140. `setMemberStatus` refuses this in application code — a directory
       reaching the same row from outside must meet the same rule, or an
       organisation loses access to its own settings because HR closed a leaver's
       record on a Friday. Loud: the function raises and I1-2 reports it for that
       one resource. */
    const [adminId] = one(
      `select id::text from public.org_members
        where org_id = '${orgId}' and role = 'administrator' and status = 'active' limit 1`)
    expect(adminId, 'the fixture needs an active administrator').toBeTruthy()
    const [count] = one(
      `select count(*)::text from public.org_members
        where org_id = '${orgId}' and role = 'administrator' and status = 'active'`)
    expect(count, 'and exactly one, or this proves nothing about the LAST one').toBe('1')

    const ext = `ext-${rnd()}`
    execFileSync('psql', [DB, '-tAc',
      `update public.org_members set external_id = '${ext}', source = 'scim'
        where id = '${adminId}'`])
    const r = tryPsql(`select app.scim_deprovision_member('${orgId}', '${ext}')`)
    expect(r.ok, 'it must be refused').toBe(false)
    expect(r.err).toContain('scim_last_administrator')

    const [still] = one(`select status from public.org_members where id = '${adminId}'`)
    expect(still, 'and the administrator is untouched').toBe('active')
    execFileSync('psql', [DB, '-tAc',
      `update public.org_members set external_id = null, source = null where id = '${adminId}'`])
  })

  it('9. and an unknown external id is refused rather than silently doing nothing', () => {
    /* A deprovision that matches nobody is a sync talking about a person this
       organisation does not have. Returning quietly would let a misconfigured
       connector look healthy while deprovisioning nobody — the failure mode
       I1-2 exists to make loud. */
    const r = tryPsql(`select app.scim_deprovision_member('${orgId}', 'ext-nobody-${rnd()}')`)
    expect(r.ok).toBe(false)
    expect(r.err).toContain('scim_unknown_member')
  })
})

describe('I1-1b · who writes these columns', () => {
  it('10. every column the connector touches has a writer, named in its comment', () => {
    /* Invariant 8, asserted rather than promised. Four columns arrive in M:0109
       and all four are written by the two functions in the same migration — the
       standing question answered in the migration that adds them. */
    const cols = ['source', 'synced_at', 'external_id', 'status_source']
    const src = psql(
      `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname in ('scim_upsert_member','scim_deprovision_member')`)
      .map((r) => r[0]!).join('\n')
    expect(src.length, 'both functions must exist').toBeGreaterThan(0)

    for (const c of cols) {
      const [comment] = one(
        `select coalesce(col_description('public.org_members'::regclass, a.attnum), '')
           from pg_attribute a where a.attrelid = 'public.org_members'::regclass
            and a.attname = '${c}'`)
      expect(comment, `org_members.${c} must answer «who writes this column?» in its comment`)
        .toMatch(/WHO WRITES IT/i)
      expect(src.includes(c), `org_members.${c} claims a writer — one of the SCIM ` +
        `functions must actually write it`).toBe(true)
    }
  })

  it('11. and setMemberStatus stamps status_source too, or a hand edit is invisible', () => {
    /* The half that makes the interface honest. If an administrator overrides a
       SCIM-written status and the column still says `scim`, the screen cannot
       warn them that the next sync will undo it — and they watch their own
       change disappear with no explanation. Grepped, because the writer is a
       server action and not a catalogue object. */
    const src = execFileSync('grep', ['-n', 'status_source', 'app/(app)/administrasjon/actions.ts'],
      { encoding: 'utf8' })
    expect(src, 'setMemberStatus must write status_source').toMatch(/status_source/)
  })
})

/**
 * THE THREE ADMINISTRATOR-FACING RPCs, DENIED FROM EVERY SIDE.
 *
 * `verify:policy` reported these as PROTECTED BUT UNGUARDED, which is the state
 * this project has learned to distrust most: the grant is right and nothing
 * proves it, so the day it stops being right nothing says so. Invariant 4 —
 * `administrator` owns settings, `redaktor` creates and sends, `leser` reads
 * aggregates — and a SCIM token writes membership for the whole organisation, so
 * it is squarely a settings power.
 */
describe('I1-2 · minting a connector is an administrator power', () => {
  const RPCS = ['create_scim_token', 'revoke_scim_token', 'scim_connection_status'] as const

  it('12. anon cannot execute any of the three — read back from the catalogue', () => {
    for (const fn of RPCS) {
      const [anon] = one(
        `select has_function_privilege('anon', p.oid, 'execute')::text
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = '${fn}' limit 1`)
      expect(anon, `anon must not execute ${fn}`).toBe('false')
    }
  })

  it('13. and a redaktor and a leser are refused at runtime, not merely by a grant', async () => {
    /* The grant lets `authenticated` in — it has to, or no administrator could
       call it either. The role check is INSIDE each function, so the only way to
       know it is there is to sign in as someone who should be refused. */
    const { redaktorClient, leserClient } = await import('./clients')
    for (const make of [redaktorClient, leserClient]) {
      const client = await make()
      for (const fn of RPCS) {
        const { error } = await client.rpc(fn)
        expect(error?.message ?? '', `${fn} must refuse a non-administrator`).toContain('forbidden')
      }
    }
  }, 60_000)

  it('14. an administrator gets a token, and it is the only time it exists', async () => {
    const { adminClient } = await import('./clients')
    const client = await adminClient()
    const { data, error } = await client.rpc('create_scim_token')
    expect(error?.message ?? '').toBe('')
    const token = String(data)
    expect(token, 'the shape the endpoint parses').toMatch(/^hei_scim_[0-9a-f]{12}_[0-9a-f]{64}$/)

    // Non-vacuity AND the invariant in one: the token must NOT be findable in
    // the table. Only the prefix and a hash of the secret are stored.
    const secret = token.split('_')[3]!
    const [rows] = one(
      `select count(*)::text from public.scim_credentials
        where token_hash = '${secret}' or token_prefix = '${secret}'`)
    expect(rows, 'the secret half is never stored').toBe('0')

    const [prefix] = one(
      `select token_prefix from public.scim_credentials where org_id = '${orgId}'`)
    expect(token, 'and the prefix is — it is the public half').toContain(prefix!)

    // The status RPC may see the prefix and must not see the hash: it has no
    // column for one.
    const { data: status } = await client.rpc('scim_connection_status')
    const row = (status as Record<string, unknown>[])[0]!
    expect(row.configured).toBe(true)
    expect(row.token_prefix).toBe(prefix)
    expect(Object.keys(row), 'no shape of this result carries the hash')
      .not.toContain('token_hash')
  }, 60_000)
})
