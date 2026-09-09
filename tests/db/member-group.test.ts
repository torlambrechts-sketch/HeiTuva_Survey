import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * S3 item 2 — `org_members.group_id` has a writer.
 *
 * The audit's lead finding (`A7a-1` / `A7b-1`), found independently by two
 * probes on deliberately different methods. A group could be created and nobody
 * could ever be put in one: every group count rendered 0, the Send screen's
 * group picker targeted an empty set, every per-group result was permanently
 * `insufficient_data`, and the blind-spot generator saw only empty groups —
 * with every gate green and the demo working, because
 * `scripts/seed-demo.ts` was the column's only writer.
 *
 * ── WHY THIS TEST READS THE SOURCE, WHICH IS NORMALLY THE WRONG THING ──────
 *
 * CLAUDE.md is explicit that a pattern match over source text is a SYMPTOM and
 * never the property, and this file does exactly that — so the reason has to
 * be written down rather than assumed.
 *
 * The property is «a person can be put in a group through the product». The
 * behaviour that would prove it runs inside a Next server action behind
 * `requireAdmin()` and a session cookie; the db suite has a Postgres connection
 * and PostgREST clients, and neither can invoke it. `verify:interaction` drives
 * the browser and is where the behaviour is exercised end to end.
 *
 * What CAN be stated here is the thing whose ABSENCE was the defect: the set of
 * writes to `org_members` in application code. The audit derived that set —
 * five statements, none naming `group_id` — and this test asserts the set now
 * contains one that does. It is a guard against the writer being deleted, not a
 * proof that it works. CLAUDE.md's rule for the standing question asks exactly
 * this much: «the phase that adds the column adds the action, and a test
 * asserts it exists».
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
function grepRepo(pattern: string, path: string): string {
  try {
    return execFileSync('grep', ['-rn', '--include=*.ts', '--include=*.tsx', pattern, path], {
      encoding: 'utf8',
    })
  } catch {
    return ''
  }
}

describe('org_members.group_id has a writer in the product', () => {
  it('a server action updates it', () => {
    const hits = grepRepo('group_id', 'app/(app)/administrasjon/actions.ts')
    expect(
      hits,
      'setMemberGroup is the only thing standing between a group and being permanently empty',
    ).toContain('group_id')
    expect(hits).toMatch(/update\(\{ group_id|group_id: parsed\.data/)
  })

  it('the action is exported under a name the panel imports', () => {
    expect(grepRepo('export async function setMemberGroup', 'app/(app)/administrasjon/actions.ts'))
      .not.toBe('')
    expect(grepRepo('setMemberGroup', 'app/(app)/administrasjon/UsersPanel.tsx')).not.toBe('')
  })

  it('the control offers the organisation’s groups and a way to clear the value', () => {
    const panel = grepRepo('userNoGroup', 'app/(app)/administrasjon/UsersPanel.tsx')
    expect(panel, 'without an empty option a member can be put in a group but never taken out')
      .toContain('userNoGroup')
  })

  it('the page reads the groups the control needs', () => {
    // The defect one level up: a control whose option list is never fetched
    // renders as a select with one item and looks like a product with no groups.
    const page = grepRepo("from('groups')", 'app/(app)/administrasjon/brukere/page.tsx')
    expect(page).not.toBe('')
  })
})

describe('the column the writer writes', () => {
  it('is still scalar, which is what makes k mean anything', () => {
    // DECISIONS Q92: k does not compose. One member contributes to exactly one
    // breakdown, so this must never become an array or a join table — the
    // writer added above would be the natural place to get that wrong.
    const row = psql(`
      select data_type, coalesce(cardinality(string_to_array(udt_name, ',')), 1)
        from information_schema.columns
       where table_schema = 'public' and table_name = 'org_members' and column_name = 'group_id'`)[0]
    expect(row?.[0]).toBe('uuid')
    expect(Number(row?.[1])).toBe(1)
  })

  it('is nullable, because «no group» is a real state', () => {
    const nullable = psql(`
      select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'org_members' and column_name = 'group_id'`)[0]?.[0]
    expect(nullable).toBe('YES')
  })

  it('cannot point at another organisation’s group — in the DATABASE', () => {
    // The audit filed the tenancy of this column as a LIMITATION (A7a-10): the
    // reasoning was correct about a case that could not arise, because nothing
    // wrote the column. The writer added in this change makes it reachable, so
    // the composite key is asserted rather than the plain one.
    //
    // The application check in setMemberGroup is not the rule. An application
    // check is a rule about one code path; this is a rule about the state.
    const def = psql(`
      select pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relname = 'org_members'
         and c.conname = 'org_members_group_id_fkey'`)[0]?.[0]
    expect(def, 'a plain (group_id) -> groups(id) key lets a member join another tenant’s group')
      .toContain('FOREIGN KEY (group_id, org_id) REFERENCES groups(id, org_id)')
  })

  it('nulls the reference and keeps the tenant when a group is deleted', () => {
    // M:0065's lesson, in the form that migration settled: `on delete set null`
    // without a column list would null org_id too, and a member with no
    // organisation is not a member. Deleting a group must empty it, not refuse.
    const def = psql(`
      select pg_get_constraintdef(c.oid) from pg_constraint c
        join pg_class t on t.oid = c.conrelid
       where t.relname = 'org_members' and c.conname = 'org_members_group_id_fkey'`)[0]?.[0]
    expect(def).toContain('ON DELETE SET NULL (group_id)')
  })

  it('deleting a group really does empty it rather than being refused', async () => {
    // The behaviour, not the constraint text — because the two have disagreed
    // in this project before (V2-3b's RESTRICT made a whole organisation
    // undeletable, and it surfaced miles away in dropOrg).
    const one = (q: string, col = 0) => {
      const rows = psql(q)
      if (!rows.length || rows[0]?.[col] === undefined) throw new Error(`no row for: ${q}`)
      return rows[0][col] as string
    }
    const orgId = one(`select id from public.organizations order by created_at limit 1`)
    const groupId = one(`
      insert into public.groups (org_id, name) values ('${orgId}', 'S3 tenancy probe')
      returning id`)
    const memberId = one(`
      insert into public.org_members (org_id, email, role, status, group_id)
      values ('${orgId}', 's3-tenancy-probe@example.test', 'leser', 'invited', '${groupId}')
      returning id`)
    psql(`delete from public.groups where id = '${groupId}'`)
    const q = `select coalesce(group_id::text, 'NULL'), org_id from public.org_members where id = '${memberId}'`
    const gid = one(q, 0)
    const oid = one(q, 1)
    expect(gid, 'the reference is nulled').toBe('NULL')
    expect(oid, 'the tenant survives').toBe(orgId)
    psql(`delete from public.org_members where id = '${memberId}'`)
  })
})
