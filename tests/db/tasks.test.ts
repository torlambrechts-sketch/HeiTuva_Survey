import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  anonClient,
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

    // AND THIS CAUGHT THE RULE A SECOND TIME, IN A THIRD FORM. `M:0064` made the
    // owner key composite so a reference cannot cross a tenancy boundary, and
    // wrote `on delete set null` — which on a composite key nulls EVERY
    // referencing column, `org_id` included. `org_id` is not null, so this
    // delete failed with 23502 until `M:0065` said what was meant:
    // `on delete set null (owner_member_id)`. Null the reference, keep the
    // tenant. The test written for CLAUDE.md's note caught a new instance of it
    // introduced by a fix for something else.
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

  it('a MANUAL task may not name a survey — and the other direction is deliberately open', async () => {
    /*
      RESTATED BY G1 (`M:0123`), NOT WEAKENED — the eighth instance of the
      referential-maintenance family, and the reason is worth the paragraph.

      This read `(source_kind = 'survey') = (source_ref is not null)`, a
      BICONDITIONAL over a column the database reserves the right to null:
      `tasks_source_ref_fkey` is ON DELETE SET NULL. Measured before the change,
      on the local stack:

          delete from public.surveys where id = <a survey with a blind-spot task>;
          ERROR: new row for relation "tasks" violates check constraint
                 "tasks_source_ref_needs_kind"
          CONTEXT: SQL statement "UPDATE ONLY public.tasks SET source_ref = NULL ..."

      A survey carrying a generated task could not be hard-deleted. The half that
      survives is the half no cascade can withdraw; the half that went is the one
      erasing the survey makes untrue. Fix the column, not the predicate.
    */
    const { data: own } = await svc
      .from('surveys').select('id').eq('org_id', orgId).limit(1).single()
    const manual = await svc.from('tasks').insert({
      org_id: orgId, title: `Uenig kilde ${stamp}`, kind: 'tiltak',
      source_kind: 'manuell', source_ref: own!.id,
    })
    expect(manual.error?.message ?? '', 'a manual task was allowed to name a survey')
      .toMatch(/tasks_manual_has_no_source/)

    // Permitted, because a cascade must be able to produce it.
    const orphan = await svc.from('tasks').insert({
      org_id: orgId, title: `Foreldreløs kilde ${stamp}`, kind: 'tiltak', source_kind: 'survey',
    })
    made.push(`Foreldreløs kilde ${stamp}`)
    expect(orphan.error, 'a survey task with no survey must be reachable by cascade').toBeNull()
  })

  it('and the delete that used to be refused now succeeds', async () => {
    // The PROOF that the restatement bought something, rather than only that the
    // constraint changed. A survey with a generated task attached is erased; the
    // task survives with a null source, which is what «no record may be left
    // pointing at something that stopped existing under it» actually means.
    const { data: s2 } = await svc
      .from('surveys')
      .insert({
        org_id: orgId,
        title: `Slettbar ${stamp}`,
        respondent_kind: 'person',
        anonymity: 'anonymous',
      })
      .select('id')
      .single()
    made.push(`Generert ${stamp}`)
    const created = await svc.from('tasks').insert({
      org_id: orgId, title: `Generert ${stamp}`, kind: 'tiltak',
      source_kind: 'survey', source_ref: s2!.id,
    })
    expect(created.error).toBeNull()

    const gone = await svc.from('surveys').delete().eq('id', s2!.id)
    expect(gone.error?.message ?? null, 'the survey still cannot be deleted').toBeNull()

    const { data } = await svc
      .from('tasks')
      .select('source_kind, source_ref')
      .eq('title', `Generert ${stamp}`)
      .single()
    expect(data).toEqual({ source_kind: 'survey', source_ref: null })
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

describe('(Q97) lukket is terminal, and the remedy is a row', () => {
  it('the correction reference is a real column with a composite key', () => {
    // Q97's confirmation tells the operator that an error is corrected by a new
    // task referencing the closed one. **That sentence is only true if the
    // reference exists**, and a screen promising a remedy the schema cannot
    // express is the defect this phase hit twice before this one — Teams, and
    // the weekly digest.
    const cols = psql(
      `select a.attname from pg_constraint c
         join unnest(c.conkey) k on true
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where c.conname = 'tasks_corrects_task_id_fkey' order by a.attname`,
    ).map((r) => r[0]!)
    expect(cols, 'a correction cannot reference another organisation s task').toEqual([
      'corrects_task_id', 'org_id',
    ])
  })

  it('a task cannot correct itself', async () => {
    const id = await newTask('Retter seg selv')
    const { error } = await svc.from('tasks').update({ corrects_task_id: id }).eq('id', id)
    expect(error?.message ?? '').toMatch(/tasks_corrects_not_self/)
  })

  it('a correction survives its target being deleted — the record is the point', async () => {
    // If deleting the closed task took the correction with it, the chain Q97
    // relies on would be one administrator's cleanup away from disappearing.
    // `on delete set null (corrects_task_id)` keeps the correction and drops
    // only the link — the same «null the reference, keep the row» shape M:0065
    // settled one column over.
    const closed = await newTask('Blir slettet', { status: 'effektvurdert' })
    await svc.from('task_effect_assessments').insert({ task_id: closed, note: 'Vurdert' })
    await svc.from('tasks').update({ status: 'lukket' }).eq('id', closed)

    const fix = await newTask('Retter den slettede', { corrects_task_id: closed })
    await svc.from('tasks').delete().eq('id', closed)

    const { data } = await svc.from('tasks').select('corrects_task_id').eq('id', fix).single()
    expect(data, 'the correction is still there').not.toBeNull()
    expect(data!.corrects_task_id, 'and only the link went').toBeNull()
  })
})

describe('the class test 8 belonged to — a foreign key carries EXISTENCE, not tenancy', () => {
  it('a duty cannot be owned by another organisation s member', async () => {
    // FOUND BY THE CHECK TOR ASKED FOR, and it was live: `saveDutySettings`
    // (`rapporter/actions.ts:141`) takes `ownerMemberId` from the request,
    // validates only that it is a uuid, and writes it. Demonstrated before the
    // fix: «ACCEPTED: duty <id> in another org now owned by member <id>».
    //
    // A statutory duty's owner is who a compliance record names and who its
    // reminders address. `M:0064` makes the key composite, so no caller can
    // write it — the fix does not depend on the action remembering.
    const { data: mine } = await svc
      .from('org_members')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)
      .single()
    const { data: theirDuty } = await svc
      .from('duties')
      .select('id')
      .eq('org_id', otherOrgId)
      .limit(1)
      .maybeSingle()
    if (!theirDuty) return // no cross-org duty seeded; nothing to assert against

    const { error } = await svc
      .from('duties')
      .update({ owner_member_id: mine!.id })
      .eq('id', theirDuty.id)
    expect(error?.code, 'refused by the composite key, through the SERVICE role').toBe('23503')
  })

  it('a task cannot be owned by another organisation s member either', async () => {
    const { data: theirMember } = await svc
      .from('org_members')
      .select('id')
      .eq('org_id', otherOrgId)
      .limit(1)
      .single()
    const id = await newTask('Fremmed eier')
    const { error } = await svc
      .from('tasks')
      .update({ owner_member_id: theirMember!.id })
      .eq('id', id)
    expect(error?.code).toBe('23503')
  })

  it('BOTH owner keys are composite, read back from the catalogue', () => {
    for (const name of ['duties_owner_member_id_fkey', 'tasks_owner_member_id_fkey']) {
      const cols = psql(
        `select a.attname from pg_constraint c
           join unnest(c.conkey) k on true
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
          where c.conname = '${name}' order by a.attname`,
      ).map((r) => r[0]!)
      expect(cols, `${name} carries the organisation`).toEqual(['org_id', 'owner_member_id'])
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

describe('(5a3) the task-kind registry is public by design, and carries nobody', () => {
  it('anon may read it, and it has no org id, no survey id and no count', async () => {
    // Gate 5a3 allowlists `task_kinds` with a REASON, and a reason nobody
    // checks is a comment — `use_cases`, `brand_accents` and `segment_fields`
    // each prove the same claim the same way. It arrived OPEN in this phase's
    // verification pass, which is the gate doing its job on a table that did
    // not exist a day earlier.
    const { data, error } = await anonClient().from('task_kinds').select('*')
    expect(error, 'anon may read the registry').toBeNull()
    const columns = Object.keys(data![0]!)
    expect(columns.filter((c) => /org|survey|count|_id$|user/i.test(c))).toEqual([])
  })

  it('and the LABEL is not in the table — the kind is a key, the copy is i18n', async () => {
    // Data-not-code cuts both ways: adding a kind is a row, but the row must
    // not carry Norwegian, or a sixth kind would ship untranslatable.
    const { data } = await anonClient().from('task_kinds').select('*')
    expect(Object.keys(data![0]!).sort()).toEqual(['key', 'sort_order'])
  })
})

describe('(fix pass) «Effektvurdert» is named after a record, and needs one', () => {
  /**
   * FOUND BY OPENING THE CAPTURE, not by a gate. `oppgaver.default.desktop.png`
   * showed «Møtefrie torsdager» at Gjennomført offering «Flytt til
   * Effektvurdert» beside the prompt to record the assessment — a button into a
   * state called *effect assessed*, with no assessment. `M:0062`'s guard tested
   * only at `lukket`, which is the right place for the statutory outcome and one
   * step too late for the record. CLAUDE.md's «never fabricate data in the UI»,
   * one level above a value: THE STATE IS THE FABRICATED DATUM.
   */
  it('a task at Gjennomført cannot enter Effektvurdert with no assessment row', async () => {
    const id = await newTask('Effektvurdert uten vurdering', { status: 'gjennomfort' })
    const { error } = await svc.from('tasks').update({ status: 'effektvurdert' }).eq('id', id)
    expect(error?.message ?? '', 'refused by name').toMatch(/task_effect_state_needs_assessment/)
    const after = psql(`select status from public.tasks where id = '${id}'`)[0]![0]
    expect(after, 'and the row did not move').toBe('gjennomfort')
  })

  it('and it succeeds the moment the assessment exists', async () => {
    const id = await newTask('Effektvurdert med vurdering', { status: 'gjennomfort' })
    const { error: insErr } = await svc
      .from('task_effect_assessments')
      .insert({ task_id: id, note: 'Målt i neste runde.' })
    expect(insErr, 'the assessment is recorded first').toBeNull()
    const { error } = await svc.from('tasks').update({ status: 'effektvurdert' }).eq('id', id)
    expect(error, 'the same transition is now allowed').toBeNull()
  })

  it('the statutory check at `lukket` STAYS — it is not made redundant', async () => {
    // Forward-only transitions mean `lukket` is reachable only through
    // `effektvurdert`, so the older check looks implied. It states the rule that
    // matters (V2:5197, aml. § 3-1 / ldl. § 26) at the boundary that matters, and
    // «no DELETE policy today» is a fact about a migration, not a property of the
    // table. Both predicates are present in the shipped function.
    // Asserted in the catalogue rather than by reading a body back through the
    // psql helper, which splits on newlines and would compare only line one.
    const [both] = psql(
      `select p.prosrc ~ 'task_effect_state_needs_assessment'
           and p.prosrc ~ 'task_close_needs_effect_assessment'
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'guard_task_close'`,
    )
    expect(both![0], 'both predicates are in the shipped function').toBe('t')
  })
})
