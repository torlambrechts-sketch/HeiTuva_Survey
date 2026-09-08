import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  leserClient,
  outsiderClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * V2-3a — Målgrupper. DECISIONS **Q92** (segments are a FILTER, never a
 * breakdown axis), **Q65** (a structured predicate over an allowlisted field
 * set, never free text evaluated in SQL), **Q94** (the group-insert defect).
 *
 * ── THE LOAD-BEARING FACT, AND WHY THE SHAPE IS WHAT IT IS ──────────────────
 *
 * Q92: **k does not compose.** `org_members.group_id` is scalar, and that is
 * *why* k per cell means anything — each respondent contributes to exactly one
 * breakdown. Two segments of five answers with an intersection of two disclose
 * the two by subtraction. So a segment selects the population being looked at
 * and never becomes a row beside groups.
 *
 * The plan said «`groups` gains `kind`». That was overturned by Q92's reasoning
 * and the measurement below: three RPCs iterate `public.groups` UNFILTERED, so
 * a `kind` column would put a segment into a heatmap the moment a fourth reader
 * forgot a predicate. A separate table makes it unrepresentable, and the first
 * test asserts exactly that rather than trusting it.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

let svc: Client
let admin: Client
let redaktor: Client
let leser: Client
let outsider: Client
let anon: Client
let orgId: string
let otherOrgId: string
const made: string[] = []

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor, leser, outsider] = await Promise.all([
    adminClient(),
    redaktorClient(),
    leserClient(),
    outsiderClient(),
  ])
  anon = anonClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id
})

/** Standing question 4: what does this leave behind? A segment that survives
 *  changes another phase's audience counts, so every row is named and removed. */
afterAll(async () => {
  if (made.length) await svc.from('segments').delete().in('name', made)
})

const name = (s: string) => {
  const n = `V23a ${s} ${made.length}-${process.pid}`
  made.push(n)
  return n
}

describe('(Q92) a segment can never reach the breakdown axis', () => {
  it('is a SEPARATE table — `public.groups` has no kind discriminator', () => {
    // The structural claim, asserted rather than described. If someone later
    // adds `kind` to groups and moves segments in, this fails before any
    // heatmap silently grows a row.
    const cols = psql(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='groups'`,
    ).map((r) => r[0])
    expect(cols).not.toContain('kind')
    expect(psql(`select to_regclass('public.segments') is not null`)[0]?.[0], 'segments exists as its own table').toBe('t')
  })

  it('THE MEASUREMENT THE SHAPE RESTS ON: the group readers are unfiltered', () => {
    // This is why a `kind` column would have been unsafe, and it is asserted so
    // the reasoning stays true rather than being remembered. Each of these
    // iterates every group row in the org; none filters a discriminator,
    // because there is none to filter.
    const readers = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app')
          and p.prosrc ~ 'from\\s+public\\.groups|join\\s+public\\.groups'
        order by 1`,
    ).map((r) => r[0])
    expect(readers.length, 'at least the three known readers').toBeGreaterThanOrEqual(3)
    expect(readers).toEqual(expect.arrayContaining(['compose_report', 'get_heatmap', 'results_summary']))
  })

  it('nothing references `segments` from the answer path', () => {
    // `responses.respondent_group_id` is the breakdown unit and the thing the
    // gate counts over. Q92: nothing about segments touches it. A foreign key
    // from any answer-path table to `segments` would be the leak.
    const refs = psql(
      `select c.conrelid::regclass::text
         from pg_constraint c
        where c.contype = 'f' and c.confrelid = 'public.segments'::regclass`,
    ).map((r) => r[0])
    expect(refs, 'no table may reference segments yet, least of all responses').toEqual([])
  })
})

describe('(Q65) a rule is data, and the allowlist is enforced by the database', () => {
  it('accepts a predicate over available fields', async () => {
    const { error } = await admin.from('segments').insert({
      org_id: orgId,
      name: name('gyldig'),
      predicate: [{ field: 'role', op: 'eq', value: 'leser' }],
    })
    expect(error, 'a well-formed predicate is accepted').toBeNull()
  })

  it('REFUSES a field outside the allowlist — at write time, not in the form', async () => {
    const { error } = await admin.from('segments').insert({
      org_id: orgId,
      name: name('ukjent felt'),
      predicate: [{ field: 'lønnstrinn', op: 'eq', value: '7' }],
    })
    expect(error?.message ?? '').toMatch(/segment_field_not_allowed/)
  })

  it('refuses an AVAILABLE-looking field the product has no column for, and says which', async () => {
    // A different message from the one above, deliberately: «not in the
    // registry» is a typo, «no column yet» is a product gap the design shows.
    // The bundle's own examples use this field (V2:4319).
    const { error } = await admin.from('segments').insert({
      org_id: orgId,
      name: name('stillingsprosent'),
      predicate: [{ field: 'stillingsprosent', op: 'lt', value: 100 }],
    })
    expect(error?.message ?? '').toMatch(/segment_field_unavailable/)
  })

  it('refuses an operator outside the closed set', async () => {
    const { error } = await admin.from('segments').insert({
      org_id: orgId,
      name: name('ugyldig op'),
      predicate: [{ field: 'role', op: 'matches', value: '.*' }],
    })
    expect(error?.message ?? '').toMatch(/segment_op_not_allowed/)
  })

  it('STORES SQL AS DATA AND NEVER EXECUTES IT', async () => {
    // The rule text is user input. It is stored, rendered, and never
    // interpolated. Two halves: the value round-trips intact, and no function
    // in the schema builds SQL from a predicate.
    const n = name('sql')
    const payload = "'; drop table public.responses; --"
    const { error } = await admin.from('segments').insert({
      org_id: orgId,
      name: n,
      predicate: [{ field: 'status', op: 'eq', value: payload }],
    })
    expect(error).toBeNull()

    const { data } = await svc.from('segments').select('predicate').eq('name', n).single()
    expect((data!.predicate as { value: string }[])[0]!.value, 'stored verbatim').toBe(payload)
    expect(psql(`select to_regclass('public.responses') is not null`)[0]?.[0], 'the payload did not execute').toBe('t')

    // And the derived half — no function anywhere composes SQL from a
    // predicate. Asserted over the SET of functions, not the ones I wrote.
    const dynamic = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app')
          and p.prosrc ~* 'predicate'
          and p.prosrc ~* '\\mexecute\\M'
        order by 1`,
    ).map((r) => r[0])
    expect(dynamic, 'no function may EXECUTE anything built from a predicate').toEqual([])
  })

  it('the field registry is public by design and carries nothing identifying', async () => {
    const { data, error } = await anon.from('segment_fields').select('*')
    expect(error).toBeNull()
    const columns = Object.keys(data![0]!)
    expect(columns.filter((c) => /org|survey|count|user|email/i.test(c))).toEqual([])
  })
})

describe('who may write an audience', () => {
  it('(Q94) a redaktør MAY create a group — the defect is fixed', async () => {
    // Send is a redaktør surface and «Lagre som målgruppe» lives on it, so an
    // administrator-only insert refused exactly the role the design shows.
    const n = `V23a gruppe ${process.pid}`
    const { error } = await redaktor.from('groups').insert({ org_id: orgId, name: n })
    expect(error, 'a redaktør may compose an audience').toBeNull()
    await svc.from('groups').delete().eq('org_id', orgId).eq('name', n)
  })

  it('a redaktør may create a segment too, for the same reason', async () => {
    const { error } = await redaktor.from('segments').insert({
      org_id: orgId,
      name: name('av redaktor'),
      predicate: [{ field: 'status', op: 'eq', value: 'active' }],
    })
    expect(error).toBeNull()
  })

  it('a leser may NOT — and the refusal is RLS, so assert the value did not move', async () => {
    const n = name('av leser')
    await leser.from('segments').insert({ org_id: orgId, name: n, predicate: [] })
    const { data } = await svc.from('segments').select('id').eq('name', n)
    expect(data ?? [], 'nothing was written').toEqual([])
  })

  it('a leser MAY read them — the audience list is not a secret', async () => {
    // Positive control on the same client: without it, the denial above would
    // pass identically if the leser session were simply broken.
    const { error } = await leser.from('segments').select('id').eq('org_id', orgId)
    expect(error).toBeNull()
  })

  it('cross-org: another organisation cannot write OR read this one', async () => {
    const n = name('kryss')
    await outsider.from('segments').insert({ org_id: orgId, name: n, predicate: [] })
    const { data: written } = await svc.from('segments').select('id').eq('name', n)
    expect(written ?? [], 'no cross-org write').toEqual([])

    const { data: seen } = await outsider.from('segments').select('id').eq('org_id', orgId)
    expect(seen ?? [], 'no cross-org read').toEqual([])

    // POSITIVE CONTROL: the outsider is a working administrator at home.
    const home = `V23a hjemme ${process.pid}`
    const { error } = await outsider.from('segments').insert({
      org_id: otherOrgId,
      name: home,
      predicate: [{ field: 'role', op: 'eq', value: 'leser' }],
    })
    expect(error, 'the outsider works in their own organisation').toBeNull()
    await svc.from('segments').delete().eq('org_id', otherOrgId).eq('name', home)
  })

  it('deletion stays administrator-only, and that asymmetry is deliberate', async () => {
    const n = name('slett')
    await admin.from('segments').insert({ org_id: orgId, name: n, predicate: [] })
    await redaktor.from('segments').delete().eq('name', n)
    const { data } = await svc.from('segments').select('id').eq('name', n)
    expect(data?.length, 'a redaktør may not delete an audience').toBe(1)
  })
})
