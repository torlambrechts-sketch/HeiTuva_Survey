import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, leserClient, outsiderClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * M:0113 — «Interne notater».
 *
 * The properties, and each one is a thing that would be wrong in a way no
 * screen shows:
 *
 *   1. Exactly one subject. A note pointing at both a task and a comment, or at
 *      neither, is refused — the row would render in two places or in none.
 *   2. A `leser` reads the register and writes nothing on it (CLAUDE.md
 *      invariant 4's write side).
 *   3. Cross-org: an outsider can neither read nor write a note on our task,
 *      even though the table has no `org_id` of its own.
 *   4. THE CHECK SURVIVES THE CASCADE. This is V2-9's instance, asked of the
 *      constraint this migration adds: deleting the parent must delete the
 *      note, not null the column and leave a row that fails a predicate which
 *      was just written for it.
 *   5. The respondent surface cannot reach it. `get_comment_thread` is what a
 *      respondent calls; a note must not appear in what it returns.
 *   6. Someone writes it. The action exists, in the repository, and the table
 *      has no other writer.
 *
 * D158 — non-vacuity. Every negative test first establishes that the row it is
 * refused on EXISTS and that the positive case succeeds, because a refusal
 * against a row nobody can see is a pass that proves nothing.
 */
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(sql: string): { ok: boolean; out: string } {
  const r = spawnSync('psql', [DB, '-At', '-c', sql], { encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

let svc: Client
let admin: Client
let orgId: string
let taskId: string
let commentId: string

beforeAll(async () => {
  svc = serviceClient()
  admin = await adminClient()
  const { data: org } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  orgId = org!.id
  const { data: task } = await svc.from('tasks').select('id').eq('org_id', orgId).limit(1).single()
  taskId = task!.id
  const { data: c } = await svc.from('survey_comments').select('id').limit(1).single()
  commentId = c!.id
})

describe('the note has exactly one subject', () => {
  it('non-vacuity: the seeded task and comment both exist', () => {
    expect(taskId).toBeTruthy()
    expect(commentId).toBeTruthy()
  })

  it('a note on a task is accepted', async () => {
    const { error } = await admin
      .from('worklist_notes')
      .insert({ task_id: taskId, body: 'Snakket med verneombudet 12. sep.' })
    expect(error).toBeNull()
  })

  it('a note on a comment is accepted', async () => {
    const { error } = await admin
      .from('worklist_notes')
      .insert({ comment_id: commentId, body: 'Tatt opp i ledermøtet.' })
    expect(error).toBeNull()
  })

  it('a note on BOTH is refused', () => {
    const r = psql(
      `insert into public.worklist_notes (task_id, comment_id, body)
       values ('${taskId}', '${commentId}', 'begge')`,
    )
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/worklist_notes_one_subject/)
  })

  it('a note on NEITHER is refused', () => {
    const r = psql(`insert into public.worklist_notes (body) values ('ingen')`)
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/worklist_notes_one_subject/)
  })

  it('an empty body is refused', () => {
    const r = psql(
      `insert into public.worklist_notes (task_id, body) values ('${taskId}', '   ')`,
    )
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/worklist_notes_body_check|violates check constraint/)
  })
})

describe('who may write one', () => {
  it('a leser can READ a task note', async () => {
    const leser = await leserClient()
    const { data, error } = await leser.from('worklist_notes').select('id').eq('task_id', taskId)
    expect(error).toBeNull()
    // Non-vacuity: the administrator above wrote one, so an empty result would
    // mean the read was refused rather than that there is nothing to read.
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it('a leser CANNOT write one', async () => {
    const leser = await leserClient()
    const { error } = await leser
      .from('worklist_notes')
      .insert({ task_id: taskId, body: 'leser skriver' })
    expect(error).not.toBeNull()
  })

  it('an outsider can neither read nor write, though the table has no org_id', async () => {
    const outsider = await outsiderClient()
    const { data } = await outsider.from('worklist_notes').select('id').eq('task_id', taskId)
    expect(data ?? []).toHaveLength(0)
    const { error } = await outsider
      .from('worklist_notes')
      .insert({ task_id: taskId, body: 'fra en annen bedrift' })
    expect(error).not.toBeNull()
  })
})

describe('the CHECK survives what the database does on its own', () => {
  /**
   * V2-9's question, asked of this constraint. A cascade must DELETE the note;
   * if either parent column were `on delete set null` the row would survive
   * with both columns null and fail `worklist_notes_one_subject` — the exact
   * shape that made an organisation undeletable in V2-3b and broke `dropOrg`
   * in V2-9.
   */
  it('every column the CHECK names cascades rather than nulling', () => {
    // Derived from the constraint's OWN columns rather than from the two FKs I
    // happen to have written (CLAUDE.md, an enumeration mistaken for a
    // property): a third disjunct added later is covered by this test without
    // it being edited, and `author_member_id` — which IS `set null` — is
    // correctly outside the set because the predicate does not name it.
    const r = psql(`
      with subject as (
        select a.attname
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
         where t.relname = 'worklist_notes' and c.conname = 'worklist_notes_one_subject')
      select a.attname || ' ' || c.confdeltype::text
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
       where t.relname = 'worklist_notes' and c.contype = 'f'
         and a.attname in (select attname from subject)
       order by 1`)
    expect(r.ok).toBe(true)
    const lines = r.out.trim().split('\n').filter(Boolean)
    // Non-vacuity: the predicate names two columns and both must be here, or
    // the join found nothing and every assertion below is over an empty set.
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.split(' ')[0]).sort()).toEqual(['comment_id', 'task_id'])
    // 'c' = cascade. 'n' would be SET NULL and is the defect this asserts
    // against — the V2-9 shape, where a cascade nulled a column a CHECK read.
    for (const line of lines) expect(line.endsWith(' c')).toBe(true)
  })

  it('deleting a task deletes its note and leaves no orphan', () => {
    // A DO block rather than psql metacommands: `\\gset` is not processed inside
    // `-c`, which is what made the first version of this test fail against a
    // migration that was already correct. The block RAISES on either failure,
    // so a zero exit is the pass — and it asserts the note EXISTS before the
    // delete, or a note that was never inserted would pass as a clean cascade
    // (D158).
    const r = psql(`
      begin;
      do $$
      declare v_task uuid; v_before int; v_after int;
      begin
        insert into public.tasks (org_id, title, kind)
          values ('${orgId}', 'kastes av testen', 'tiltak') returning id into v_task;
        insert into public.worklist_notes (task_id, body)
          values (v_task, 'notat paa kastet oppgave');
        select count(*) into v_before from public.worklist_notes where task_id = v_task;
        if v_before <> 1 then raise exception 'setup: note not written (%)', v_before; end if;
        delete from public.tasks where id = v_task;
        select count(*) into v_after from public.worklist_notes where task_id = v_task;
        if v_after <> 0 then raise exception 'orphan survived the cascade (%)', v_after; end if;
      end $$;
      rollback;`)
    expect(r.out).not.toMatch(/orphan survived|setup: note not written/)
    expect(r.ok).toBe(true)
  })

  it('no row in the table has both parents null', () => {
    const r = psql(
      `select count(*) from public.worklist_notes where task_id is null and comment_id is null`,
    )
    expect(r.out.trim()).toBe('0')
  })
})

describe('a respondent cannot reach a note', () => {
  /**
   * The one property that matters to somebody who was promised anonymity: the
   * team's private remarks about her comment must not come back through the
   * thread she reads. Derived from the function's own source rather than from a
   * call, so a future edit that joins the table fails this test.
   */
  it('get_comment_thread does not name worklist_notes', () => {
    const r = psql(
      `select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname = 'get_comment_thread'`,
    )
    expect(r.ok).toBe(true)
    expect(r.out.length).toBeGreaterThan(50)
    expect(r.out).not.toMatch(/worklist_notes/)
  })

  it('no SECURITY DEFINER function reachable by anon reads the table', () => {
    // Catalogue-derived rather than a list of the functions I happen to know
    // about (CLAUDE.md, row 3/9: a grant is a fact about the catalogue).
    const r = psql(`
      select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef
         and has_function_privilege('anon', p.oid, 'execute')
         and p.prosrc like '%worklist_notes%'
       order by 1`)
    expect(r.ok).toBe(true)
    expect(r.out.trim()).toBe('')
  })
})

describe('somebody writes it', () => {
  /**
   * CLAUDE.md's standing question, as a test rather than as a promise in a
   * comment: three of the four times it has fired, the column existed and was
   * READ. The writer is a server action and this asserts it is there.
   */
  it('addWorklistNote exists in the worklist actions', () => {
    const src = readFileSync('app/(app)/oppgaver/actions.ts', 'utf8')
    expect(src).toMatch(/export async function addWorklistNote/)
    expect(src).toMatch(/from\('worklist_notes'\)/)
  })

  it('nothing else in the app WRITES the table', () => {
    /* The property is «one writer», not «one reader». The first version of this
       test grepped `from('worklist_notes')` and failed on `page.tsx`, which
       READS the notes to render them — a correct caller, caught by a selector
       that measured references rather than writes.
       So: enumerate every file that touches the table, derived rather than
       listed, and assert that only one of them carries an insert. */
    const r = spawnSync(
      'bash',
      ['-c', `grep -rln "from('worklist_notes')" app lib 2>/dev/null | sort`],
      { encoding: 'utf8' },
    )
    const touching = (r.stdout ?? '').trim().split('\n').filter(Boolean)
    // Non-vacuity: if the grep found nothing, every assertion below is empty.
    expect(touching.length).toBeGreaterThan(0)

    const writers = touching.filter((f) => {
      const src = readFileSync(f, 'utf8')
      // The insert, on the table, in that order — PostgREST's builder chains
      // `.from(...).insert(...)`, so anything between them is whitespace.
      return /from\('worklist_notes'\)\s*\.\s*(insert|update|upsert|delete)/.test(src)
    })
    expect(writers).toEqual(['app/(app)/oppgaver/actions.ts'])
  })
})
