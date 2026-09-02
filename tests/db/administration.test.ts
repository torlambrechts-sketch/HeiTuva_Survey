import { beforeAll, describe, expect, it } from 'vitest'
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
 * The Administrasjon surface, asserted through real persona sessions.
 *
 * Every write these screens make is administrator-only. The server actions
 * re-check the role, but that check is not what protects the data — RLS is. A
 * test that only exercised the action would pass with every policy dropped, so
 * each assertion here goes straight at the table with a persona's own JWT.
 *
 * Note the shape of a refusal: an UPDATE a policy filters out is not an error,
 * it changes zero rows. Asserting `error === null` would therefore pass for a
 * write that did nothing, so every negative case reads the row back.
 */
let admin: Client, redaktor: Client, leser: Client, outsider: Client
let orgId: string, otherOrgId: string

beforeAll(async () => {
  ;[admin, redaktor, leser, outsider] = await Promise.all([
    adminClient(),
    redaktorClient(),
    leserClient(),
    outsiderClient(),
  ])

  const svc = serviceClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id
})

async function readPrivacy(client: Client, id: string) {
  const { data } = await client.from('organizations').select('privacy').eq('id', id).maybeSingle()
  return (data?.privacy as Record<string, boolean> | null) ?? null
}

describe('company settings', () => {
  it('an administrator can change the org row', async () => {
    const marker = `Nordisk Studio ${Date.now()}`
    await admin.from('organizations').update({ contact_name: marker }).eq('id', orgId)
    const { data } = await admin
      .from('organizations')
      .select('contact_name')
      .eq('id', orgId)
      .single()
    expect(data?.contact_name).toBe(marker)
  })

  it('a redaktor cannot — and the row is unchanged afterwards', async () => {
    // Deliberately not `name`: org_upd covers every column equally, and a
    // mutation run that drops the policy would otherwise rename the fixture org
    // and break every later test's lookup.
    const before = (await admin.from('organizations').select('orgnr').eq('id', orgId).single()).data
    await redaktor.from('organizations').update({ orgnr: '000000000' }).eq('id', orgId)
    const after = (await admin.from('organizations').select('orgnr').eq('id', orgId).single()).data
    expect(after?.orgnr).toBe(before?.orgnr)
  })

  it('an outsider cannot reach the org at all', async () => {
    const { data } = await outsider.from('organizations').select('id').eq('id', orgId)
    expect(data ?? []).toEqual([])
  })
})

describe('privacy toggles', () => {
  it('an administrator can flip one and it persists', async () => {
    const before = await readPrivacy(admin, orgId)
    const next = { ...before, consent: !before?.consent }
    await admin.from('organizations').update({ privacy: next }).eq('id', orgId)
    const after = await readPrivacy(admin, orgId)
    expect(after?.consent).toBe(next.consent)

    await admin.from('organizations').update({ privacy: before }).eq('id', orgId)
  })

  it('a leser cannot flip one', async () => {
    const before = await readPrivacy(admin, orgId)
    await leser
      .from('organizations')
      .update({ privacy: { ...before, eu_only: false } })
      .eq('id', orgId)
    const after = await readPrivacy(admin, orgId)
    expect(after).toEqual(before)
  })

  it('an administrator of another org cannot flip this one', async () => {
    const before = await readPrivacy(admin, orgId)
    await outsider
      .from('organizations')
      .update({ privacy: { ...before, eu_only: false } })
      .eq('id', orgId)
    const after = await readPrivacy(admin, orgId)
    expect(after).toEqual(before)
  })
})

describe('retention', () => {
  it('only the four documented values are accepted', async () => {
    const { error } = await admin.from('organizations').update({ retention_months: 7 }).eq('id', orgId)
    // The CHECK constraint is what makes the select in the UI meaningful — a
    // tampered form post cannot store a retention the cron job never applies.
    expect(error?.code).toBe('23514')
  })

  it('an administrator can set a documented value', async () => {
    await admin.from('organizations').update({ retention_months: 24 }).eq('id', orgId)
    const { data } = await admin
      .from('organizations')
      .select('retention_months')
      .eq('id', orgId)
      .single()
    expect(data?.retention_months).toBe(24)
    await admin.from('organizations').update({ retention_months: 12 }).eq('id', orgId)
  })
})

describe('members and groups', () => {
  it('a redaktor cannot change anyone role', async () => {
    const { data: target } = await admin
      .from('org_members')
      .select('id, role')
      .eq('org_id', orgId)
      .eq('role', 'leser')
      .limit(1)
      .single()

    await redaktor.from('org_members').update({ role: 'administrator' }).eq('id', target!.id)
    const { data: after } = await admin
      .from('org_members')
      .select('role')
      .eq('id', target!.id)
      .single()
    expect(after?.role).toBe('leser')
  })

  it('a leser cannot create a group', async () => {
    await leser.from('groups').insert({ org_id: orgId, name: 'Snikgruppe' })
    const { data } = await admin.from('groups').select('id').eq('org_id', orgId).eq('name', 'Snikgruppe')
    expect(data ?? []).toEqual([])
  })

  it('an administrator can create and delete a group', async () => {
    const name = `Testgruppe ${Date.now()}`
    const { error } = await admin.from('groups').insert({ org_id: orgId, name })
    expect(error).toBeNull()
    await admin.from('groups').delete().eq('org_id', orgId).eq('name', name)
    const { data } = await admin.from('groups').select('id').eq('org_id', orgId).eq('name', name)
    expect(data ?? []).toEqual([])
  })

  it('an administrator cannot create a group in another org', async () => {
    await admin.from('groups').insert({ org_id: otherOrgId, name: 'Fremmed gruppe' })
    const { data } = await serviceClient()
      .from('groups')
      .select('id')
      .eq('org_id', otherOrgId)
      .eq('name', 'Fremmed gruppe')
    expect(data ?? []).toEqual([])
  })
})

describe('data-subject requests', () => {
  it('an administrator can file one and move its status', async () => {
    const email = `dsr-${Date.now()}@example.test`
    const { data: created, error } = await admin
      .from('dsr_requests')
      .insert({ org_id: orgId, type: 'innsyn', subject_email: email })
      .select('id, status, due_at')
      .single()
    expect(error).toBeNull()
    expect(created?.status).toBe('mottatt')
    // The card advertises a 30-day deadline; the column is what makes it true.
    expect(created?.due_at).toBeTruthy()

    await admin.from('dsr_requests').update({ status: 'under_behandling' }).eq('id', created!.id)
    const { data: after } = await admin
      .from('dsr_requests')
      .select('status')
      .eq('id', created!.id)
      .single()
    expect(after?.status).toBe('under_behandling')

    await admin.from('dsr_requests').delete().eq('id', created!.id)
  })

  it('a leser cannot see requests at all — they carry a respondent identity', async () => {
    const email = `dsr-hidden-${Date.now()}@example.test`
    const { data: created } = await serviceClient()
      .from('dsr_requests')
      .insert({ org_id: orgId, type: 'sletting', subject_email: email })
      .select('id')
      .single()

    for (const [name, client] of [
      ['redaktor', redaktor],
      ['leser', leser],
      ['outsider', outsider],
      ['anon', anonClient()],
    ] as const) {
      const { data } = await client.from('dsr_requests').select('id').eq('id', created!.id)
      expect(data ?? [], `${name} dsr_requests`).toEqual([])
    }

    await serviceClient().from('dsr_requests').delete().eq('id', created!.id)
  })
})

describe('audit trail', () => {
  it('an administrator writing an audit row is recorded as themselves', async () => {
    const { data: me } = await admin.auth.getUser()
    const target = `privacy-test-${Date.now()}`
    const { error } = await admin.from('audit_events').insert({
      org_id: orgId,
      actor_user_id: me.user!.id,
      action: 'privacy.toggle',
      target,
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('audit_events')
      .select('actor_user_id, action')
      .eq('target', target)
      .single()
    expect(data?.actor_user_id).toBe(me.user!.id)
    expect(data?.action).toBe('privacy.toggle')
  })

  it('nobody can attribute an audit row to someone else', async () => {
    const { data: victim } = await admin.auth.getUser()
    const { error } = await leser.from('audit_events').insert({
      org_id: orgId,
      actor_user_id: victim.user!.id,
      action: 'role.change',
      target: 'forged',
    })
    expect(error?.code).toBe('42501')
  })

  it('an administrator cannot rewrite or remove an audit row', async () => {
    const { data: row } = await admin
      .from('audit_events')
      .select('id, action')
      .eq('org_id', orgId)
      .limit(1)
      .single()

    // There is no update or delete policy, so RLS filters the row out and the
    // statement reports success having touched nothing. Reading it back is the
    // only assertion that distinguishes "refused" from "silently did nothing" —
    // and here both mean the trail is intact.
    await admin.from('audit_events').update({ action: 'nothing.happened' }).eq('id', row!.id)
    await admin.from('audit_events').delete().eq('id', row!.id)

    const { data: after } = await admin
      .from('audit_events')
      .select('action')
      .eq('id', row!.id)
      .maybeSingle()
    expect(after?.action).toBe(row!.action)
  })

  it('even the service role cannot rewrite an audit row — the trigger stops it', async () => {
    const svc = serviceClient()
    const { data: row } = await svc
      .from('audit_events')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)
      .single()

    // The service role bypasses RLS, so this is what actually proves the
    // append-only trigger exists rather than the absence of a policy.
    const upd = await svc.from('audit_events').update({ action: 'nothing.happened' }).eq('id', row!.id)
    const del = await svc.from('audit_events').delete().eq('id', row!.id)
    expect(upd.error?.message).toMatch(/append-only/)
    expect(del.error?.message).toMatch(/append-only/)
  })
})
