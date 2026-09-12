import { spawnSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import { serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * I2-2 — THE SYNC, and its three properties.
 *
 * The whole of this file runs against `app.entra_apply_page` and
 * `app.entra_finish_sync`, which take a page of Graph users as JSON and apply
 * it. No network: the HTTP half lives in the Edge Function, and putting the
 * DECISIONS in SQL is what makes them testable at all — which is the same
 * reasoning that put `submit_response` in the database rather than in a route.
 *
 * The model decision under test throughout: **department is the breakdown axis
 * and becomes `org_members.group_id`; an Entra GROUP is an audience and never
 * becomes a breakdown row.** A person with no department lands in NO group.
 */
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(sql: string): { ok: boolean; out: string } {
  const r = spawnSync('psql', [DB, '-At', '-c', sql], { encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** A Graph user as a QUOTED SQL literal. The first version interpolated raw
 *  JSON and psql choked on the leading brace — the object was correct and the
 *  quoting was not. Single quotes doubled, the way a SQL string literal needs. */
const user = (ext: string, name: string, mail: string, dept: string | null, active = true) => {
  const json = JSON.stringify({
    externalId: ext,
    displayName: name,
    mail,
    department: dept,
    accountEnabled: active,
  })
  return `'${json.replace(/'/g, "''")}'`
}

let svc: Client
let orgId: string

beforeAll(async () => {
  svc = serviceClient()
  const { data } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  orgId = data!.id
})

describe('the model decision: department breaks down, groups do not', () => {
  it('a department becomes the member’s ONE group', () => {
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-a', 'Ada Lovelace', 'ada@nordiskstudio.test', 'Utvikling')}::jsonb));
      select g.name from public.org_members m join public.groups g on g.id = m.group_id
       where m.org_id = '${orgId}' and m.external_id = 'ext-a';
      rollback;`)
    expect(r.ok).toBe(true)
    expect(r.out).toContain('Utvikling')
  })

  it('A PERSON WITH NO DEPARTMENT LANDS IN NO GROUP — never an invented one', () => {
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-b', 'Ingen Avdeling', 'ingen@nordiskstudio.test', null)}::jsonb));
      select coalesce(m.group_id::text, 'NULL') from public.org_members m
       where m.org_id = '${orgId}' and m.external_id = 'ext-b';
      rollback;`)
    expect(r.ok).toBe(true)
    expect(r.out).toMatch(/(^|\n)NULL(\n|$)/)
  })

  it('and the coverage is measured, so the screen can say «84 av 92 fikk avdeling»', () => {
    const r = psql(`
      begin;
      select (app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-c', 'Med', 'med@nordiskstudio.test', 'Ledelse')}::jsonb,
        ${user('ext-d', 'Uten', 'uten@nordiskstudio.test', null)}::jsonb
      )))::text;
      rollback;`)
    expect(r.ok).toBe(true)
    expect(r.out).toMatch(/"seen":\s*2/)
    expect(r.out).toMatch(/"withDepartment":\s*1/)
  })

  it('a group the sync creates is marked as the directory’s, not hand-made', () => {
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-e', 'Ny', 'ny@nordiskstudio.test', 'Helt Ny Avdeling')}::jsonb));
      select coalesce(source,'(null)') from public.groups
       where org_id = '${orgId}' and name = 'Helt Ny Avdeling';
      rollback;`)
    expect(r.out).toContain('entra')
  })
})

describe('1. a sync that fails halfway does not look like «no changes»', () => {
  /**
   * The failure mode that hides: a connector that silently stops looks
   * identical to a customer with no staff changes, and the first sign would be
   * a survey reaching nobody. So a partial run must be LOUD — and the two
   * halves of loud are that the error is recorded and that the members already
   * applied are kept rather than rolled back into invisibility.
   */
  it('an interrupted sync keeps what it applied AND records the failure', () => {
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-f', 'Halvveis', 'halvveis@nordiskstudio.test', 'Utvikling')}::jsonb));
      select app.entra_record_sync('${orgId}'::uuid, 'Graph 429 Too Many Requests', 1, 1);
      select
        (select count(*) from public.org_members where org_id='${orgId}' and external_id='ext-f')::text
        || '|' || (select consecutive_errors::text from public.entra_connections where org_id='${orgId}')
        || '|' || (select coalesce(last_sync_error,'-') from public.entra_connections where org_id='${orgId}')
        || '|' || (select coalesce(last_sync_at::text,'NEVER') from public.entra_connections where org_id='${orgId}');
      rollback;`)
    expect(r.ok).toBe(true)
    const line = r.out.split('\n').find((l) => l.includes('|'))!
    const [kept, errs, msg, lastOk] = line.split('|')
    expect(kept).toBe('1')                       // the member applied before the failure survives
    expect(Number(errs)).toBeGreaterThan(0)      // the failure is counted, not swallowed
    expect(msg).toContain('429')                 // and named
    expect(lastOk).toBe('NEVER')                 // last_sync_at is NOT advanced by a failure
  })

  it('a FAILED run never deprovisions — absence from a partial enumeration is not departure', () => {
    /*
      The answer to «what happens when a sync is interrupted between pages».
      Deprovisioning is the one operation that cannot be done from a partial
      view: a member missing from page 3 of 7 is missing because page 4 never
      arrived. `entra_finish_sync` is a SEPARATE call the worker makes only
      after the last page, and this asserts the separation exists rather than
      trusting the worker to honour it.
    */
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-g', 'Blir Igjen', 'igjen@nordiskstudio.test', 'Utvikling')}::jsonb));
      -- A second page that never arrives. No finish call.
      select app.entra_record_sync('${orgId}'::uuid, 'connection reset on page 2', null, null);
      select status from public.org_members where org_id='${orgId}' and external_id='ext-g';
      rollback;`)
    expect(r.out).toContain('active')
  })

  it('and a SUCCEEDING run clears the error and advances the clock', () => {
    const r = psql(`
      begin;
      select app.entra_record_sync('${orgId}'::uuid, 'earlier failure', null, null);
      select app.entra_record_sync('${orgId}'::uuid, null, 5, 4);
      select consecutive_errors::text || '|' || coalesce(last_sync_error,'CLEARED')
             || '|' || case when last_sync_at is null then 'NEVER' else 'SET' end
        from public.entra_connections where org_id='${orgId}';
      rollback;`)
    const line = r.out.split('\n').find((l) => l.includes('|'))!
    expect(line).toBe('0|CLEARED|SET')
  })
})

describe('2. deprovisioning goes through M:0107’s guard and adds no second mechanism', () => {
  it('a member who leaves Entra becomes status <> active, and nothing else happens to them', () => {
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-h', 'Slutter', 'slutter@nordiskstudio.test', 'Utvikling')}::jsonb));
      -- The next full sync no longer lists them.
      select app.entra_finish_sync('${orgId}'::uuid, array['ext-zzz']::text[]);
      select status || '|' || coalesce(status_source,'-')
        from public.org_members where org_id='${orgId}' and external_id='ext-h';
      rollback;`)
    const line = r.out.split('\n').find((l) => l.includes('|'))!
    // 'directory', not 'entra': M:0117 restated the constraint over the SIDE
    // that wrote the status rather than the transport that carried it. Which
    // directory is `source`, which is a different question and a different
    // column.
    expect(line).toBe('inactive|directory')
  })

  it('THE SYNC TOUCHES NO INVITATION TABLE — the existing guard does that work', () => {
    // Not «I did not write it» but «the catalogue says so». A second mechanism
    // added later fails here.
    const r = psql(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname like 'entra_%'
         and (p.prosrc ilike '%survey_invitations%' or p.prosrc ilike '%pgmq%')
       order by 1`)
    expect(r.out.trim()).toBe('')
  })

  it('and the guard that DOES the work still answers for every producer', () => {
    /*
      M:0108's derivation, extended rather than restated: every function that
      sends to the mail queue must consult app.member_blocks_invitation (or the
      status directly). A SIXTH producer fails here in the commit that adds it —
      which is the instruction's own requirement.
    */
    const producers = psql(`
      select n.nspname || '.' || p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('app','public') and p.prosrc like '%pgmq.send%'
       order by 1`)
    const list = producers.out.trim().split('\n').filter(Boolean)
    expect(list.length).toBeGreaterThan(0)
    for (const fn of list) {
      const [schema, name] = fn.split('.')
      const body = psql(`
        select (prosrc ilike '%member_blocks_invitation%'
                or prosrc ilike '%status = ''active''%'
                or prosrc ilike '%status <> ''active''%')::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = '${schema}' and p.proname = '${name}'`)
      expect(body.out.trim(), `${fn} must answer for member status`).toContain('t')
    }
  })
})

describe('3. a deprovisioned member’s already-given answers are untouched', () => {
  /**
   * Deprovisioning is not erasure. The answers are anonymous and unlinked, and
   * a well-meant cascade would destroy a round's results — the shape
   * `report_shares.group_id` had. Asserted as COUNTS BEFORE AND AFTER, which is
   * the instruction's own wording and the only form that catches a cascade:
   * «no error was thrown» is true of a delete that succeeded.
   */
  it('response and answer counts are identical across a deprovisioning', () => {
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-i', 'Har Svart', 'harsvart@nordiskstudio.test', 'Utvikling')}::jsonb));
      select (select count(*) from public.responses)::text
             || '|' || (select count(*) from public.answers)::text
             || '|' || (select count(*) from public.survey_comments)::text;
      select app.entra_finish_sync('${orgId}'::uuid, array['ext-nobody']::text[]);
      select (select count(*) from public.responses)::text
             || '|' || (select count(*) from public.answers)::text
             || '|' || (select count(*) from public.survey_comments)::text;
      rollback;`)
    expect(r.ok).toBe(true)
    const counts = r.out.split('\n').map((l) => l.trim()).filter((l) => /^\d+\|\d+\|\d+$/.test(l))
    expect(counts).toHaveLength(2)
    // Non-vacuity: there must BE answers, or «unchanged» is a statement about
    // an empty table (D158).
    const [responses, answers] = counts[0]!.split('|').map(Number)
    expect(responses).toBeGreaterThan(0)
    expect(answers).toBeGreaterThan(0)
    expect(counts[1]).toBe(counts[0])
  })

  it('and the member row survives too — deprovisioning is a status, not a delete', () => {
    const r = psql(`
      begin;
      select app.entra_apply_page('${orgId}'::uuid, jsonb_build_array(
        ${user('ext-j', 'Blir Værende', 'vaerende@nordiskstudio.test', null)}::jsonb));
      select app.entra_finish_sync('${orgId}'::uuid, array['ext-nobody']::text[]);
      select count(*) from public.org_members where org_id='${orgId}' and external_id='ext-j';
      rollback;`)
    expect(r.out).toMatch(/(^|\n)1(\n|$)/)
  })

  it('a member the directory never claimed is NOT deprovisioned by a full sync', () => {
    // The control. `entra_finish_sync` must only touch rows it owns —
    // `source = 'entra'` — or one sync would deactivate every hand-invited
    // colleague in the organisation.
    const r = psql(`
      begin;
      select app.entra_finish_sync('${orgId}'::uuid, array['ext-nobody']::text[]);
      select count(*) from public.org_members
       where org_id='${orgId}' and coalesce(source,'local') <> 'entra' and status <> 'active';
      rollback;`)
    expect(r.out).toMatch(/(^|\n)0(\n|$)/)
  })
})
