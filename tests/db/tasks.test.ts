import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  leserClient,
  outsiderClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * V2-4 — Oppgaver. DECISIONS **Q68**, **Q69**, **Q70**, all three **DEFAULTED**
 * rather than answered, and **Q97** open.
 *
 * ── THE TEST THIS PHASE EXISTS FOR IS NUMBER 3, NOT NUMBER 1 ────────────────
 *
 * Test 1 — «you cannot close a task without assessing its effect» — is the
 * feature. Test 3 is the one that has cost this project five rediscoveries:
 * **deleting a member who OWNS a task must succeed**, because
 * `owner_member_id` is `ON DELETE SET NULL` and that nulling is an UPDATE the
 * DATABASE issues on its own behalf. A close guard written as «reject any
 * UPDATE unless an assessment exists» would make an owning member undeletable —
 * a broken erasure path wearing a compliance rule's clothes, which is exactly
 * V2-3b's finding one table over.
 *
 * So the guard fires only on `old.status is distinct from new.status`, and this
 * file proves both halves: it refuses the transition it is about, and it lets
 * the database's own maintenance through.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

let svc: Client
let redaktor: Client
let leser: Client
let outsider: Client
let orgId: string
let otherOrgId: string
let ownerId = ''
const stamp = `${process.pid}`
const made: string[] = []
const members: string[] = []

const newTask = async (
  title: string,
  extra: Record<string, unknown> = {},
  client: Client = svc,
): Promise<string> => {
  const n = `${title} ${stamp}`
  made.push(n)
  const { data, error } = await client
    .from('tasks')
    .insert({ org_id: orgId, title: n, kind: 'tiltak', ...extra })
    .select('id')
    .single()
  if (error) throw new Error(`newTask(${n}): ${error.message}`)
  return data!.id
}

const statusOf = async (id: string): Promise<string | null> => {
  const { data } = await svc.from('tasks').select('status').eq('id', id).maybeSingle()
  return data?.status ?? null
}

beforeAll(async () => {
  svc = serviceClient()
  ;[redaktor, leser, outsider] = await Promise.all([
    redaktorClient(),
    leserClient(),
    outsiderClient(),
  ])
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id

  const { data: m } = await svc
    .from('org_members')
    .insert({
      org_id: orgId,
      email: `oppgave-eier-${stamp}@example.test`,
      name: 'Oppgaveeier',
      role: 'leser',
      status: 'active',
    })
    .select('id')
    .single()
  ownerId = m!.id
  members.push(ownerId)
}, 120_000)

/** Standing question 4. A task surviving this file changes every later count on
 *  the Oppgaver stat tiles, and `verify:roundtrip` was fixed in V1-6 for
 *  exactly that. */
afterAll(async () => {
  if (made.length) await svc.from('tasks').delete().in('title', made)
  if (members.length) await svc.from('org_members').delete().in('id', members)
})

describe('(Q69) the close guard refuses the transition it is about', () => {
  it('1. BLOCKER — `lukket` without an effect assessment is refused by the DATABASE', async () => {
    const id = await newTask('Lukke uten vurdering', { status: 'effektvurdert' })
    const { error } = await svc.from('tasks').update({ status: 'lukket' }).eq('id', id)
    expect(error?.message ?? '', 'refused by name').toMatch(/task_close_needs_effect_assessment/)
    expect(await statusOf(id), 'POSITIVE CONTROL: it really did not move').toBe('effektvurdert')
  })

  it('…and WITH an assessment it closes', async () => {
    // Without this the test above passes if closing were refused always, which
    // is a different and much worse bug.
    const id = await newTask('Lukke med vurdering', { status: 'effektvurdert' })
    await svc.from('task_effect_assessments').insert({ task_id: id, note: 'Vurdert' })
    const { error } = await svc.from('tasks').update({ status: 'lukket' }).eq('id', id)
    expect(error).toBeNull()
    expect(await statusOf(id)).toBe('lukket')
  })

  it('3. BLOCKER — deleting the OWNING member succeeds, and the guard lets the FK through', async () => {
    // The CLAUDE.md case, and the reason the guard is written the way it is.
    // `owner_member_id` is ON DELETE SET NULL, so this delete makes Postgres
    // issue an UPDATE on a task row. A blanket «reject any UPDATE» guard would
    // refuse it and the member could never be deleted — discovered, as always,
    // far from the trigger.
    const id = await newTask('Eid av noen som slutter', { owner_member_id: ownerId })

    const { error } = await svc.from('org_members').delete().eq('id', ownerId)
    expect(error, 'the member can be deleted').toBeNull()
    members.length = 0

    const { data } = await svc.from('tasks').select('owner_member_id, status').eq('id', id).single()
    expect(data!.owner_member_id, 'the FK nulled it').toBeNull()
    expect(data!.status, 'and nothing else moved').toBe('foreslatt')
  })

  it('4. skipping a lifecycle step is refused', async () => {
    const id = await newTask('Hopper over steg')
    const { error } = await svc.from('tasks').update({ status: 'gjennomfort' }).eq('id', id)
    expect(error?.message ?? '').toMatch(/task_step_skipped/)
    expect(await statusOf(id)).toBe('foreslatt')
  })

  it('…and advancing ONE step is allowed', async () => {
    const id = await newTask('Ett steg')
    const { error } = await svc.from('tasks').update({ status: 'besluttet' }).eq('id', id)
    expect(error).toBeNull()
    expect(await statusOf(id)).toBe('besluttet')
  })

  it('5. moving BACKWARDS out of `lukket` is refused — the drawing behaviour, pending Q97', async () => {
    // The plan says «decide and test, either way». Q97 is open with Tor, so the
    // migration takes the only shape with evidence behind it: `onAdvance`
    // (V2:5192-5195) moves forward only and stops at the last step, and the
    // bundle has no backwards transition anywhere. **This test is what changes
    // when Q97 lands** — one predicate in `app.guard_task_close`, one assertion
    // here.
    const id = await newTask('Gjenåpne', { status: 'effektvurdert' })
    await svc.from('task_effect_assessments').insert({ task_id: id, note: 'Vurdert' })
    await svc.from('tasks').update({ status: 'lukket' }).eq('id', id)

    const { error } = await svc.from('tasks').update({ status: 'pagar' }).eq('id', id)
    expect(error?.message ?? '').toMatch(/task_step_backwards/)
    expect(await statusOf(id), 'it stayed closed').toBe('lukket')
  })

  it('THE ORDER IS DEFINED ONCE, and the guard reads it rather than repeating it', () => {
    // Standing question 3 — assert over the SET. A second copy of an order is an
    // order that disagrees with itself the first time a step is inserted, so
    // this asserts there IS only one copy: the enum and app.task_step_index.
    const steps = psql(
      `select e.enumlabel from pg_enum e
         join pg_type t on t.oid = e.enumtypid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'app' and t.typname = 'task_status'
        order by e.enumsortorder`,
    ).map((r) => r[0]!)
    expect(steps, 'six steps, in the order V2:5185 draws them').toEqual([
      'foreslatt', 'besluttet', 'pagar', 'gjennomfort', 'effektvurdert', 'lukket',
    ])

    const idx = psql(
      `select app.task_step_index('foreslatt'), app.task_step_index('lukket')`,
    )[0]!
    expect([idx[0], idx[1]], 'the index function agrees with the enum').toEqual(['1', '6'])
  })
})

describe('(Q70) a task s legal basis is a reference, not a parsed string', () => {
  it('law_ref references duty_definitions and refuses anything else', async () => {
    const { error } = await svc.from('tasks').insert({
      org_id: orgId,
      title: `Ugyldig hjemmel ${stamp}`,
      kind: 'tiltak',
      law_ref: 'aml. § 4-3 (3)',
    })
    expect(error?.code, 'foreign_key_violation — a citation string is not a key').toBe('23503')
  })

  it('…and a real duty key is accepted', async () => {
    const id = await newTask('Med hjemmel', { law_ref: 'arbeidsmiljo' })
    const { data } = await svc.from('tasks').select('law_ref').eq('id', id).single()
    expect(data!.law_ref).toBe('arbeidsmiljo')
  })

  it('the four duties are still four, so the reference set has not drifted', () => {
    // Q70 rests on `duty_definitions` being the registry. CI has asserted
    // `duties = 4` since Phase 5; this is that assertion where Q70 can see it.
    expect(psql(`select count(*) from public.duty_definitions`)[0]![0]).toBe('4')
  })

  it('kind is a registry key too, and an unknown one is refused', async () => {
    const { error } = await svc.from('tasks').insert({
      org_id: orgId,
      title: `Ukjent art ${stamp}`,
      kind: 'noe-annet',
    })
    expect(error?.code).toBe('23503')
  })
})

describe('who may write a task', () => {
  it('6. a leser may NOT advance one; a redaktør who owns it MAY', async () => {
    // Standing question 1: RLS filters rather than errors, so assert the VALUE
    // did not move. And standing question 2b — which ROWS can the role reach,
    // not just which role reads.
    const id = await newTask('Rollesjekk')
    await leser.from('tasks').update({ status: 'besluttet' }).eq('id', id)
    expect(await statusOf(id), 'the leser moved nothing').toBe('foreslatt')

    const { error } = await redaktor.from('tasks').update({ status: 'besluttet' }).eq('id', id)
    expect(error, 'POSITIVE CONTROL: a redaktør may').toBeNull()
    expect(await statusOf(id)).toBe('besluttet')
  })

  it('a leser MAY read the register — it is the organisation s record, not a queue', async () => {
    const { error } = await leser.from('tasks').select('id').eq('org_id', orgId)
    expect(error).toBeNull()
  })

  it('7. cross-org: another organisation cannot advance or read this one s tasks', async () => {
    const id = await newTask('Kryss')
    await outsider.from('tasks').update({ status: 'besluttet' }).eq('id', id)
    expect(await statusOf(id), 'nothing moved').toBe('foreslatt')

    const { data: seen } = await outsider.from('tasks').select('id').eq('org_id', orgId)
    expect(seen ?? [], 'no cross-org read').toEqual([])

    // POSITIVE CONTROL: the outsider is a working administrator at home.
    const home = `Kryss hjemme ${stamp}`
    const { error } = await outsider
      .from('tasks')
      .insert({ org_id: otherOrgId, title: home, kind: 'tiltak' })
    expect(error, 'and it works in their own organisation').toBeNull()
    await svc.from('tasks').delete().eq('org_id', otherOrgId).eq('title', home)
  })

  it('deleting a task stays administrator-only', async () => {
    const id = await newTask('Slett')
    await redaktor.from('tasks').delete().eq('id', id)
    expect(await statusOf(id), 'a redaktør may not delete the record').not.toBeNull()
  })
})

describe('(Q72) what a task may reference, and what it may not', () => {
  it('8. BLOCKER — source_ref pointing at another organisation s survey is refused by the FK', async () => {
    // THE PLAN SAID THIS ALREADY HELD AND IT DID NOT. A plain
    // `references public.surveys(id)` constrains EXISTENCE, not TENANCY, and
    // RLS on `tasks` checks `tasks.org_id` and never what `source_ref` points
    // at — so this test failed on its first run with a task in Nordisk Studio
    // referencing Annen Bedrift's survey. `M:0063` makes the key COMPOSITE,
    // (source_ref, org_id) -> surveys(id, org_id), so the row is
    // unrepresentable rather than filtered (Q93's reasoning, one table over).
    const { data: other } = await svc
      .from('surveys')
      .insert({
        org_id: otherOrgId,
        title: `Annen undersøkelse ${stamp}`,
        respondent_kind: 'person',
        anonymity: 'anonymous',
      })
      .select('id')
      .single()

    const t = `Kryss-kilde ${stamp}`
    made.push(t)
    const { error } = await svc.from('tasks').insert({
      org_id: orgId, title: t, kind: 'tiltak', source_kind: 'survey', source_ref: other!.id,
    })
    // Asserted through the SERVICE role deliberately: RLS is not the control
    // here and must not be allowed to look like it is. The refusal has to
    // survive a caller that RLS does not filter at all.
    expect(error?.code, 'foreign_key_violation, from the composite key').toBe('23503')

    const { data: written } = await svc.from('tasks').select('id').eq('title', t)
    expect(written ?? [], 'POSITIVE CONTROL: nothing was written').toEqual([])

    // And the same shape WITHIN the organisation is accepted, or the assertion
    // above would pass with source_ref simply broken.
    const { data: own } = await svc
      .from('surveys')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)
      .single()
    const ok = `Egen kilde ${stamp}`
    made.push(ok)
    const { error: okErr } = await svc.from('tasks').insert({
      org_id: orgId, title: ok, kind: 'tiltak', source_kind: 'survey', source_ref: own!.id,
    })
    expect(okErr, 'POSITIVE CONTROL: a survey in the same org is accepted').toBeNull()

    await svc.from('surveys').delete().eq('id', other!.id)
  })

  it('THE KEY IS COMPOSITE, asserted from the catalogue rather than from the migration', () => {
    // The whole finding is that a single-column FK looked right. This reads the
    // constraint back so a later migration cannot quietly narrow it again.
    const cols = psql(
      `select a.attname from pg_constraint c
         join unnest(c.conkey) k on true
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where c.conname = 'tasks_source_ref_fkey' and c.conrelid = 'public.tasks'::regclass
        order by a.attname`,
    ).map((r) => r[0]!)
    expect(cols, 'the organisation rides along in the reference itself').toEqual([
      'org_id', 'source_ref',
    ])
  })

  it('source_kind and source_ref cannot disagree', async () => {
    const { error } = await svc.from('tasks').insert({
      org_id: orgId, title: `Uenig kilde ${stamp}`, kind: 'tiltak', source_kind: 'survey',
    })
    expect(error?.message ?? '', 'the CHECK binds them together').toMatch(/tasks_source_ref_needs_kind/)
  })

  it('THE REGISTER CARRIES NO GATED VALUE — asserted over the columns, not the rows', () => {
    // Q72's decision is about what a task may CONTAIN. This is the structural
    // half: there is no column on `tasks` that could hold a group, a question or
    // a score, so a generator cannot construct one even by mistake. V2-5 adds
    // the behavioural half.
    const cols = psql(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'tasks'`,
    ).map((r) => r[0]!)
    for (const forbidden of ['group_id', 'question_id', 'score', 'avg', 'value', 'n']) {
      expect(cols, `tasks must have no ${forbidden} column`).not.toContain(forbidden)
    }
  })
})

describe('(Q68) loop_actions is gone, not running in parallel', () => {
  it('the table no longer exists', () => {
    expect(psql(`select to_regclass('public.loop_actions') is null`)[0]![0]).toBe('t')
  })

  it('and nothing in the schema still reads it', () => {
    const readers = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app') and p.prosrc ~ 'loop_actions' order by 1`,
    ).map((r) => r[0]!)
    expect(readers, 'a dropped table with a live reader is the worst of both').toEqual([])
  })
})
