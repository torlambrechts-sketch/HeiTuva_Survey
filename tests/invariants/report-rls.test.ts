import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { admin, anon, asUser, uniq } from '../helpers'

/** A 64-char hex hash, the shape `token_hash` stores. */
const hashHex = (raw: string) => createHash('sha256').update(raw).digest('hex')

/**
 * RLS on the tables Phase 5 added, and on the soft-delete rule.
 *
 * These exist because mutation M2 during the Phase 4/5 verification opened
 * `reports` to `using (true) with check (true)` — a leser could insert, another
 * organisation could read, anon could read every row — and the entire 165-test
 * suite still passed. Not one test touched the table. The k-gate and the leser
 * check held (compose_report does its own authorisation and is SECURITY
 * DEFINER, so no results or free text escaped), but report titles, the surveys
 * and group a report covers, its share scope and its schedule were readable by
 * anyone. A title like "Trakassering og ytringsklima 2026" beside a group id is
 * not metadata in any sense that matters.
 *
 * Every denial below is paired with a POSITIVE CONTROL — the role that should
 * have the access, proving the row is reachable at all. A denial test that
 * passes because the fixture is empty is not a test.
 */

type Fx = Awaited<ReturnType<typeof buildRlsFixture>>
let fx: Fx

beforeAll(async () => {
  fx = await buildRlsFixture()
}, 60_000)

async function buildRlsFixture() {
  const a = admin()

  const org = await insert(a, 'organizations', { name: uniq('RLS Org') })
  const other = await insert(a, 'organizations', { name: uniq('RLS Annen') })

  const administrator = await asUser(uniq('rls-admin') + '@example.test')
  const redaktor = await asUser(uniq('rls-red') + '@example.test')
  const leser = await asUser(uniq('rls-leser') + '@example.test')
  const outsider = await asUser(uniq('rls-ute') + '@example.test')

  const adminMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: administrator.userId, email: uniq('rls-admin') + '@example.test',
    role: 'administrator', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: org.id, user_id: redaktor.userId, email: uniq('rls-red') + '@example.test',
    role: 'redaktor', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: org.id, user_id: leser.userId, email: uniq('rls-leser') + '@example.test',
    role: 'leser', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: other.id, user_id: outsider.userId, email: uniq('rls-ute') + '@example.test',
    role: 'administrator', status: 'active',
  })

  const survey = await insert(a, 'surveys', {
    org_id: org.id, title: uniq('RLS survey'), status: 'aktiv', anonymity: 'anonymous',
  })

  const report = await insert(a, 'reports', {
    org_id: org.id, title: uniq('Synlig rapport'), kind: 'egen', status: 'utkast',
    sections: ['summary'], filters: { surveys: [survey.id], rounds: [], group: null },
    created_by: adminMember.id,
  })

  // Soft-deleted counterparts. "Deleted" must mean invisible in every normal
  // read path — administrators included — or it is really "hidden from some
  // roles", which is the half-state that later leaks into an export or a DSR
  // response.
  const deletedReport = await insert(a, 'reports', {
    org_id: org.id, title: uniq('Slettet rapport'), kind: 'egen', status: 'utkast',
    sections: [], filters: {}, deleted_at: new Date().toISOString(),
  })
  const deletedSurvey = await insert(a, 'surveys', {
    org_id: org.id, title: uniq('Slettet undersøkelse'), status: 'utkast',
    anonymity: 'anonymous', deleted_at: new Date().toISOString(),
  })

  // Unique per run. `token_hash` carries a UNIQUE constraint, so a constant
  // here collides the moment the file runs twice against the same database —
  // the fixture, not the policy, decides whether the suite is green.
  const share = await insert(a, 'report_shares', {
    report_id: report.id, token_hash: hashHex(uniq('share')), scope: 'ledelse',
  })
  const exportRow = await insert(a, 'report_exports', {
    report_id: report.id, format: 'pdf', storage_path: `${org.id}/${report.id}/x.pdf`,
  })

  const duty = await insert(a, 'duties', {
    org_id: org.id, definition_key: 'apenhet', interval_months: 12,
  })
  const version = await insert(a, 'duty_versions', {
    duty_id: duty.id, label: uniq('v'), content_hash: 'hash',
  })

  return {
    org, other, survey, report, deletedReport, deletedSurvey, share, exportRow, duty, version,
    administrator, redaktor, leser, outsider,
  }
}

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}

/** Rows visible to this client for one id. RLS filters rather than errors on
 *  select, so the count is the answer, not the error. */
async function visible(client: SupabaseClient, table: string, id: string) {
  const { data } = await client.from(table).select('id').eq('id', id)
  return (data ?? []).length
}

describe('reports — the table mutation M2 proved was untested', () => {
  test('POSITIVE CONTROL: a redaktør in the org can read it', async () => {
    expect(await visible(fx.redaktor.client, 'reports', fx.report.id)).toBe(1)
  })

  test('POSITIVE CONTROL: a leser in the org can read it', async () => {
    // A leser is often the audience of a report. Reading is exactly their role.
    expect(await visible(fx.leser.client, 'reports', fx.report.id)).toBe(1)
  })

  test('a member of another organisation cannot read it', async () => {
    expect(await visible(fx.outsider.client, 'reports', fx.report.id)).toBe(0)
  })

  test('an anonymous caller cannot read it', async () => {
    expect(await visible(anon(), 'reports', fx.report.id)).toBe(0)
  })

  test('a leser cannot create a report', async () => {
    const { error } = await fx.leser.client
      .from('reports')
      .insert({ org_id: fx.org.id, title: 'leser', sections: [], filters: {} })
      .select()
    expect(error, 'a leser inserted a report').not.toBeNull()
  })

  test('a leser cannot edit a report', async () => {
    await fx.leser.client.from('reports').update({ title: 'omdøpt av leser' }).eq('id', fx.report.id)
    const { data } = await admin().from('reports').select('title').eq('id', fx.report.id).single()
    expect(data?.title).not.toBe('omdøpt av leser')
  })

  test('a member of another organisation cannot create a report in this org', async () => {
    const { error } = await fx.outsider.client
      .from('reports')
      .insert({ org_id: fx.org.id, title: 'fremmed', sections: [], filters: {} })
      .select()
    expect(error).not.toBeNull()
  })
})

describe('a deleted report or survey is gone, for everyone', () => {
  /**
   * Named for the guarantee, not for the clause that implements it.
   *
   * "INSERT has no USING" is true and reads like an oversight to whoever sees
   * it next — USING does not apply to INSERT, WITH CHECK does. A test named
   * after the behaviour survives that misreading, and survives the policy being
   * reimplemented some other way.
   */
  for (const role of ['administrator', 'redaktor', 'leser'] as const) {
    test(`a ${role} cannot see a deleted report anywhere`, async () => {
      expect(await visible(fx[role].client, 'reports', fx.deletedReport.id)).toBe(0)
    })

    test(`a ${role} cannot see a deleted survey anywhere`, async () => {
      expect(await visible(fx[role].client, 'surveys', fx.deletedSurvey.id)).toBe(0)
    })
  }

  test('a deleted report cannot be restored by an ordinary update', async () => {
    // The reason UPDATE carries the same filter as SELECT. Without it, clearing
    // deleted_at through the normal edit path would undelete a report silently
    // — restoration by accident rather than by decision.
    await fx.administrator.client
      .from('reports').update({ deleted_at: null }).eq('id', fx.deletedReport.id)
    const { data } = await admin()
      .from('reports').select('deleted_at').eq('id', fx.deletedReport.id).single()
    expect(data?.deleted_at, 'an ordinary update undeleted the report').not.toBeNull()
  })

  test('a deleted report cannot be edited at all', async () => {
    await fx.administrator.client
      .from('reports').update({ title: 'redigert etter sletting' }).eq('id', fx.deletedReport.id)
    const { data } = await admin()
      .from('reports').select('title').eq('id', fx.deletedReport.id).single()
    expect(data?.title).not.toBe('redigert etter sletting')
  })

  test('a deleted report cannot be hard-deleted through the normal path', async () => {
    // Not a security property so much as an evidence one: duty_versions points
    // at reports, and a statutory archive must not lose the document it
    // archived because someone cleaned up a list.
    await fx.administrator.client.from('reports').delete().eq('id', fx.deletedReport.id)
    const { count } = await admin()
      .from('reports').select('*', { count: 'exact', head: true }).eq('id', fx.deletedReport.id)
    expect(count).toBe(1)
  })

  test('a live report and survey are still fully visible', async () => {
    expect(await visible(fx.administrator.client, 'reports', fx.report.id)).toBe(1)
    expect(await visible(fx.administrator.client, 'surveys', fx.survey.id)).toBe(1)
  })

  test('a live report can still be edited and deleted by a redaktør', async () => {
    // The counterweight: the filter must not have frozen live reports too.
    const { error } = await fx.redaktor.client
      .from('reports').update({ title: 'fortsatt redigerbar' }).eq('id', fx.report.id)
    expect(error).toBeNull()
    const { data } = await admin().from('reports').select('title').eq('id', fx.report.id).single()
    expect(data?.title).toBe('fortsatt redigerbar')
  })
})

describe('report_shares — a share token row is a credential store', () => {
  test('POSITIVE CONTROL: a redaktør can read the share row', async () => {
    expect(await visible(fx.redaktor.client, 'report_shares', fx.share.id)).toBe(1)
  })

  test('a leser cannot read share rows', async () => {
    // The row holds the token hash and the scope. A leser has no reason to
    // enumerate who a report was shared with.
    expect(await visible(fx.leser.client, 'report_shares', fx.share.id)).toBe(0)
  })

  test('another organisation cannot read share rows', async () => {
    expect(await visible(fx.outsider.client, 'report_shares', fx.share.id)).toBe(0)
  })

  test('an anonymous caller cannot read share rows', async () => {
    expect(await visible(anon(), 'report_shares', fx.share.id)).toBe(0)
  })

  test('a leser cannot mint a share link', async () => {
    const { error } = await fx.leser.client
      .from('report_shares')
      .insert({ report_id: fx.report.id, token_hash: hashHex(uniq('leser-share')), scope: 'ledelse' })
      .select()
    expect(error).not.toBeNull()
  })
})

describe('report_exports — a rendered report is the most concentrated result data', () => {
  test('POSITIVE CONTROL: a member can read the export row', async () => {
    expect(await visible(fx.leser.client, 'report_exports', fx.exportRow.id)).toBe(1)
  })

  test('another organisation cannot read export rows', async () => {
    expect(await visible(fx.outsider.client, 'report_exports', fx.exportRow.id)).toBe(0)
  })

  test('an anonymous caller cannot read export rows', async () => {
    expect(await visible(anon(), 'report_exports', fx.exportRow.id)).toBe(0)
  })

  test('a leser cannot record an export', async () => {
    const { error } = await fx.leser.client
      .from('report_exports')
      .insert({ report_id: fx.report.id, format: 'pdf', storage_path: 'x/y.pdf' })
      .select()
    expect(error).not.toBeNull()
  })
})

describe('duty_versions — the statutory archive', () => {
  test('POSITIVE CONTROL: a member can read the archive', async () => {
    expect(await visible(fx.leser.client, 'duty_versions', fx.version.id)).toBe(1)
  })

  test('another organisation cannot read the archive', async () => {
    expect(await visible(fx.outsider.client, 'duty_versions', fx.version.id)).toBe(0)
  })

  test('an anonymous caller cannot read the archive', async () => {
    expect(await visible(anon(), 'duty_versions', fx.version.id)).toBe(0)
  })

  test('a leser cannot write an archive entry', async () => {
    const { error } = await fx.leser.client
      .from('duty_versions')
      .insert({ duty_id: fx.duty.id, label: 'leser', content_hash: 'x' })
      .select()
    expect(error).not.toBeNull()
  })
})
