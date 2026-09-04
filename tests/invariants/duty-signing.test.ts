import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anon, asUser, uniq } from '../helpers'

/**
 * Phase 5 — the duty engine's signature, which is the product's legal claim.
 *
 * `duty_signers.signed_at` says a named person signed a statutory document:
 * the styreleder signed the Åpenhetsloven redegjørelse (§ 5), the verneombud
 * reviewed the psykososial kartlegging (aml. § 4-3). That row is the evidence
 * an inspector would ask for, so it has to be worth something.
 *
 * As shipped in Phase 0 it was not. `dsign_cud` lets any administrator write
 * any row on the table, `signed_at` included — so one administrator could
 * record the board's signature without the board. That is the same forgery the
 * audit trail had before migration 0014, in the one place where the law is the
 * whole point of the feature.
 *
 * These tests are written before the fix exists. Every one of them is a way the
 * signature could be worthless.
 */

type Ctx = Awaited<ReturnType<typeof buildDuty>>
let ctx: Ctx

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}

async function buildDuty() {
  const a = admin()

  const org = await insert(a, 'organizations', { name: uniq('Plikt AS') })
  const other = await insert(a, 'organizations', { name: uniq('Annen Plikt AS') })

  const adminEmail = uniq('d-admin') + '@example.test'
  const styreEmail = uniq('d-styre') + '@example.test'
  const leserEmail = uniq('d-leser') + '@example.test'
  const outsiderEmail = uniq('d-out') + '@example.test'
  const orgAdmin = await asUser(adminEmail)
  const styre = await asUser(styreEmail)
  const leser = await asUser(leserEmail)
  const outsider = await asUser(outsiderEmail)

  const adminMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: orgAdmin.userId, email: adminEmail,
    role: 'administrator', status: 'active', name: 'Tuva Berg',
  })
  // The board chair is a redaktør, not an administrator: signing authority and
  // application authority are different things, and conflating them is how an
  // admin ends up able to sign for everyone.
  const styreMember = await insert(a, 'org_members', {
    org_id: org.id, user_id: styre.userId, email: styreEmail,
    role: 'redaktor', status: 'active', name: 'Styreleder Hansen',
  })
  await insert(a, 'org_members', {
    org_id: org.id, user_id: leser.userId, email: leserEmail, role: 'leser', status: 'active',
  })
  await insert(a, 'org_members', {
    org_id: other.id, user_id: outsider.userId, email: outsiderEmail,
    role: 'administrator', status: 'active',
  })

  const duty = await insert(a, 'duties', {
    org_id: org.id,
    definition_key: 'apenhet',
    owner_member_id: adminMember.id,
    interval_months: 12,
  })
  for (const key of ['k1', 'k2', 'k3', 'k4']) {
    await insert(a, 'duty_checks', { duty_id: duty.id, key, done: true })
  }

  const report = await insert(a, 'reports', {
    org_id: org.id,
    title: 'Aktsomhetsvurdering 2026',
    kind: 'lov',
    status: 'klar',
    duty_id: duty.id,
    sections: ['method', 'participation', 'summary'] as never,
  })

  const signer = await insert(a, 'duty_signers', {
    duty_id: duty.id, role_key: 'styre', label: 'Styreleder', member_id: styreMember.id,
  })
  const unassigned = await insert(a, 'duty_signers', {
    duty_id: duty.id, role_key: 'dl', label: 'Daglig leder',
  })

  return {
    org, other, duty, report, signer, unassigned,
    adminMember, styreMember,
    admin: orgAdmin.client, styre: styre.client, leser: leser.client,
    outsider: outsider.client, anon: anon(), svc: a,
  }
}

beforeAll(async () => {
  ctx = await buildDuty()
}, 120_000)

async function rpc<T = Record<string, unknown>>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

/** The stored row, read with the service role — what is actually recorded. */
async function signerRow(id: string) {
  const { data } = await ctx.svc
    .from('duty_signers')
    .select('member_id, signed_at, signed_content_hash')
    .eq('id', id)
    .single()
  return data as { member_id: string | null; signed_at: string | null; signed_content_hash: string | null }
}

describe('a signature cannot be written by hand', () => {
  it('an administrator cannot set signed_at directly', async () => {
    // The whole defect in one line: if this succeeds, the board signature is
    // whatever an administrator says it is.
    const { error } = await ctx.admin
      .from('duty_signers')
      .update({ signed_at: new Date().toISOString() })
      .eq('id', ctx.signer.id)
      .select('id')

    expect(error?.message ?? '').toMatch(/signature|signering/i)
    expect((await signerRow(ctx.signer.id)).signed_at).toBeNull()
  })

  it('an administrator cannot insert an already-signed row', async () => {
    const { error } = await ctx.admin
      .from('duty_signers')
      .insert({
        duty_id: ctx.duty.id,
        role_key: 'hr',
        label: 'HR-ansvarlig',
        member_id: ctx.adminMember.id,
        signed_at: new Date().toISOString(),
        signed_content_hash: 'a'.repeat(64),
      })
      .select('id')
    expect(error?.message ?? '').toMatch(/signature|signering/i)
  })

  it('an administrator cannot forge a hash onto an unsigned slot', async () => {
    const { error } = await ctx.admin
      .from('duty_signers')
      .update({ signed_content_hash: 'b'.repeat(64) })
      .eq('id', ctx.unassigned.id)
      .select('id')
    expect(error?.message ?? '').toMatch(/signature|signering/i)
    expect((await signerRow(ctx.unassigned.id)).signed_content_hash).toBeNull()
  })

  it('but an administrator may still say WHO must sign', async () => {
    // The control being added must not take away the legitimate action: an
    // administrator assigns the signer slots, they just cannot sign them.
    const { error } = await ctx.admin
      .from('duty_signers')
      .update({ member_id: ctx.adminMember.id })
      .eq('id', ctx.unassigned.id)
      .select('id')
    expect(error).toBeNull()
    expect((await signerRow(ctx.unassigned.id)).member_id).toBe(ctx.adminMember.id)

    // put it back
    await ctx.svc.from('duty_signers').update({ member_id: null }).eq('id', ctx.unassigned.id)
  })
})

describe('sign_duty — only the assigned person, and only for themselves', () => {
  it('refuses a member who is not the assigned signer', async () => {
    const out = await rpc<{ error?: string }>(ctx.admin, 'sign_duty', {
      p_duty: ctx.duty.id,
      p_role_key: 'styre',
    })
    expect(out.error).toBe('not_the_signer')
    expect((await signerRow(ctx.signer.id)).signed_at).toBeNull()
  })

  it('refuses a slot nobody has been assigned to', async () => {
    const out = await rpc<{ error?: string }>(ctx.admin, 'sign_duty', {
      p_duty: ctx.duty.id,
      p_role_key: 'dl',
    })
    expect(out.error).toBe('not_the_signer')
  })

  it('refuses anyone the slot is not assigned to, whatever their role', async () => {
    // Deliberately not a role check. A verneombud signs the psykososial
    // kartlegging and may well be a `leser`; an administrator has every
    // application privilege and still has no business signing for the board.
    // Signing authority comes from the assignment, not from the role.
    const out = await rpc<{ error?: string }>(ctx.leser, 'sign_duty', {
      p_duty: ctx.duty.id,
      p_role_key: 'styre',
    })
    expect(out.error).toBe('not_the_signer')
    expect((await signerRow(ctx.signer.id)).signed_at).toBeNull()
  })

  it('refuses a caller from another organisation', async () => {
    const out = await rpc<{ error?: string }>(ctx.outsider, 'sign_duty', {
      p_duty: ctx.duty.id,
      p_role_key: 'styre',
    })
    expect(out.error).toBe('forbidden')
  })

  it('is not reachable without a session', async () => {
    const { error } = await ctx.anon.rpc('sign_duty', {
      p_duty: ctx.duty.id,
      p_role_key: 'styre',
    })
    expect(error).not.toBeNull()
  })

  it('the assigned signer can sign, and the row records them and the content', async () => {
    const out = await rpc<{ ok?: boolean; content_hash?: string }>(ctx.styre, 'sign_duty', {
      p_duty: ctx.duty.id,
      p_role_key: 'styre',
    })
    expect(out.ok).toBe(true)
    const row = await signerRow(ctx.signer.id)
    expect(row.signed_at).not.toBeNull()
    expect(row.member_id).toBe(ctx.styreMember.id)
    // The hash is what makes the signature about a specific document rather
    // than about the duty in general.
    expect(row.signed_content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.signed_content_hash).toBe(out.content_hash)
  })

  it('writes an audit row naming the real signer', async () => {
    const { data } = await ctx.svc
      .from('audit_events')
      .select('action, target, actor_user_id')
      .eq('action', 'duty.sign')
      .eq('target', ctx.duty.id)
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})

describe('a signature is over the content that existed when it was made', () => {
  it('goes stale when the report it signed is edited', async () => {
    const before = await signerRow(ctx.signer.id)
    expect(before.signed_content_hash).not.toBeNull()

    await ctx.svc
      .from('reports')
      .update({ sections: ['method', 'participation', 'summary', 'heatmap'] as never })
      .eq('id', ctx.report.id)

    const status = await rpc<{ signers: { role_key: string; signed: boolean; stale: boolean }[] }>(
      ctx.admin,
      'duty_status',
      { p_duty: ctx.duty.id },
    )
    const styre = status.signers.find((s) => s.role_key === 'styre')
    expect(styre?.signed).toBe(true)
    // Signed, but no longer over what the document now says. Reporting this as
    // a valid signature would be the forgery arriving by the back door.
    expect(styre?.stale).toBe(true)
  })

  it('goes stale when a checklist item is untick­ed', async () => {
    // Re-sign against the edited content first, so this test measures the
    // checklist and not the leftover staleness from the previous one.
    await rpc(ctx.styre, 'sign_duty', { p_duty: ctx.duty.id, p_role_key: 'styre' })
    let status = await rpc<{ signers: { role_key: string; stale: boolean }[] }>(
      ctx.admin, 'duty_status', { p_duty: ctx.duty.id },
    )
    expect(status.signers.find((s) => s.role_key === 'styre')?.stale).toBe(false)

    await ctx.svc.from('duty_checks').update({ done: false }).eq('duty_id', ctx.duty.id).eq('key', 'k2')

    status = await rpc<{ signers: { role_key: string; stale: boolean }[] }>(
      ctx.admin, 'duty_status', { p_duty: ctx.duty.id },
    )
    expect(status.signers.find((s) => s.role_key === 'styre')?.stale).toBe(true)

    await ctx.svc.from('duty_checks').update({ done: true }).eq('duty_id', ctx.duty.id).eq('key', 'k2')
  })
})

describe('publish_duty — the archive entry is the legal artefact', () => {
  it('refuses while any signer is unsigned', async () => {
    const out = await rpc<{ error?: string }>(ctx.admin, 'publish_duty', { p_duty: ctx.duty.id })
    expect(out.error).toBe('unsigned')
    const { data } = await ctx.svc.from('duty_versions').select('id').eq('duty_id', ctx.duty.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('refuses while a signature is stale', async () => {
    // Assign and sign the second slot so "unsigned" is no longer the reason,
    // then move the content underneath both.
    await ctx.svc
      .from('duty_signers')
      .update({ member_id: ctx.adminMember.id })
      .eq('id', ctx.unassigned.id)
    await rpc(ctx.admin, 'sign_duty', { p_duty: ctx.duty.id, p_role_key: 'dl' })
    await rpc(ctx.styre, 'sign_duty', { p_duty: ctx.duty.id, p_role_key: 'styre' })

    await ctx.svc.from('reports').update({ title: 'Aktsomhetsvurdering 2026 (rev B)' }).eq('id', ctx.report.id)

    const out = await rpc<{ error?: string }>(ctx.admin, 'publish_duty', { p_duty: ctx.duty.id })
    expect(out.error).toBe('stale_signature')
  })

  it('publishes once every signature covers the current content', async () => {
    await rpc(ctx.styre, 'sign_duty', { p_duty: ctx.duty.id, p_role_key: 'styre' })
    await rpc(ctx.admin, 'sign_duty', { p_duty: ctx.duty.id, p_role_key: 'dl' })

    const out = await rpc<{ ok?: boolean; version_id?: string; content_hash?: string }>(
      ctx.admin, 'publish_duty', { p_duty: ctx.duty.id },
    )
    expect(out.ok).toBe(true)
    expect(out.version_id).toMatch(/^[0-9a-f-]{36}$/)

    const { data: version } = await ctx.svc
      .from('duty_versions')
      .select('id, duty_id, report_id, content_hash, label')
      .eq('id', out.version_id!)
      .single()
    expect(version!.report_id).toBe(ctx.report.id)
    // The archived hash is the one both signatures covered.
    expect(version!.content_hash).toBe(out.content_hash)
    const styre = await signerRow(ctx.signer.id)
    expect(styre.signed_content_hash).toBe(version!.content_hash)
  })

  it('refuses a leser', async () => {
    const out = await rpc<{ error?: string }>(ctx.leser, 'publish_duty', { p_duty: ctx.duty.id })
    expect(out.error).toBeDefined()
  })

  it('refuses another organisation', async () => {
    const out = await rpc<{ error?: string }>(ctx.outsider, 'publish_duty', { p_duty: ctx.duty.id })
    expect(out.error).toBe('forbidden')
  })
})

describe('the archive is append-only', () => {
  it('a published version cannot be edited or deleted', async () => {
    const { data: version } = await ctx.svc
      .from('duty_versions')
      .select('id')
      .eq('duty_id', ctx.duty.id)
      .limit(1)
      .single()

    const upd = await ctx.admin
      .from('duty_versions')
      .update({ label: 'Omskrevet' })
      .eq('id', version!.id)
      .select('id')
    expect(upd.data ?? []).toHaveLength(0)

    const del = await ctx.admin.from('duty_versions').delete().eq('id', version!.id).select('id')
    expect(del.data ?? []).toHaveLength(0)

    const { data: after } = await ctx.svc
      .from('duty_versions')
      .select('label')
      .eq('id', version!.id)
      .single()
    expect(after!.label).not.toBe('Omskrevet')
  })
})
