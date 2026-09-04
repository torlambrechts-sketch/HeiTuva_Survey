'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'

export type DutyResult =
  | { ok: true }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' | 'unsigned' | 'stale_signature' | 'no_report' }

const Uuid = z.string().uuid()
const DefinitionKey = z.string().min(1).max(64)

/**
 * A duty row exists only once someone touches the duty.
 *
 * The Lovpålagte tab renders every row of `duty_definitions` — the four laws
 * are the same for every Norwegian employer, so the screen is not a list of
 * what this organisation has chosen. What belongs to the organisation is its
 * OWN state on top: who owns it, its cadence, which checks are ticked. So the
 * `duties` row is created on first write rather than seeded, which also keeps
 * a new organisation's database honest about what it has actually done.
 *
 * Returns the duty id so every caller below can write against it.
 */
async function ensureDuty(definitionKey: string): Promise<{ id: string; orgId: string } | null> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return null

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('duties')
    .select('id')
    .eq('org_id', viewer.orgId)
    .eq('definition_key', definitionKey)
    .maybeSingle()
  if (existing) return { id: existing.id, orgId: viewer.orgId }

  const { data: definition } = await supabase
    .from('duty_definitions')
    .select('default_interval_months')
    .eq('key', definitionKey)
    .maybeSingle()
  if (!definition) return null

  const { data: created, error } = await supabase
    .from('duties')
    .insert({
      org_id: viewer.orgId,
      definition_key: definitionKey,
      interval_months: definition.default_interval_months,
    })
    .select('id')
    .single()
  if (error || !created) return null

  // The signer slots come from the registry, unassigned. Creating them here
  // rather than on demand is what makes "who still has to sign" a question the
  // card can answer before anybody has been picked.
  const { data: roles } = await supabase
    .from('duty_definitions')
    .select('signer_roles, checks')
    .eq('key', definitionKey)
    .single()

  const signerRoles = (roles?.signer_roles ?? []) as { key: string; label: string }[]
  if (signerRoles.length) {
    await supabase.from('duty_signers').insert(
      signerRoles.map((r) => ({ duty_id: created.id, role_key: r.key, label: r.label })),
    )
  }
  const checks = (roles?.checks ?? []) as { key: string }[]
  if (checks.length) {
    await supabase
      .from('duty_checks')
      .insert(checks.map((c) => ({ duty_id: created.id, key: c.key, done: false })))
  }

  return { id: created.id, orgId: viewer.orgId }
}

export async function toggleDutyCheck(
  definitionKey: string,
  checkKey: string,
  done: boolean,
): Promise<DutyResult> {
  const parsed = z
    .object({ definitionKey: DefinitionKey, checkKey: z.string().min(1).max(64), done: z.boolean() })
    .safeParse({ definitionKey, checkKey, done })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const duty = await ensureDuty(parsed.data.definitionKey)
  if (!duty) return { ok: false, error: 'forbidden' }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase
    .from('duty_checks')
    .upsert(
      {
        duty_id: duty.id,
        key: parsed.data.checkKey,
        done: parsed.data.done,
        done_by: parsed.data.done ? viewer.memberId : null,
        done_at: parsed.data.done ? new Date().toISOString() : null,
      },
      { onConflict: 'duty_id,key' },
    )
  if (error) return { ok: false, error: 'failed' }

  // A checklist item is documentation of a statutory duty, so who ticked it and
  // when is part of the evidence, not a UI detail.
  await audit(duty.orgId, 'duty.check', duty.id, { key: parsed.data.checkKey, done: parsed.data.done })
  revalidatePath('/rapporter')
  return { ok: true }
}

const Settings = z.object({
  definitionKey: DefinitionKey,
  ownerMemberId: Uuid.nullable().optional(),
  intervalMonths: z.union([z.literal(6), z.literal(12), z.literal(24)]).optional(),
  reminderWeeks: z.union([z.literal(2), z.literal(4), z.literal(8)]).optional(),
  publish: z.boolean().nullable().optional(),
})

export async function saveDutySettings(input: z.input<typeof Settings>): Promise<DutyResult> {
  const parsed = Settings.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const duty = await ensureDuty(parsed.data.definitionKey)
  if (!duty) return { ok: false, error: 'forbidden' }

  const patch: {
    owner_member_id?: string | null
    interval_months?: number
    reminder_weeks?: number
    publish?: boolean | null
  } = {}
  if (parsed.data.ownerMemberId !== undefined) patch.owner_member_id = parsed.data.ownerMemberId
  if (parsed.data.intervalMonths !== undefined) patch.interval_months = parsed.data.intervalMonths
  if (parsed.data.reminderWeeks !== undefined) patch.reminder_weeks = parsed.data.reminderWeeks
  if (parsed.data.publish !== undefined) patch.publish = parsed.data.publish
  if (Object.keys(patch).length === 0) return { ok: true }

  const supabase = await createClient()
  const { error } = await supabase.from('duties').update(patch).eq('id', duty.id)
  if (error) return { ok: false, error: 'failed' }

  await audit(duty.orgId, 'duty.settings', duty.id, patch as Record<string, unknown>)
  revalidatePath('/rapporter')
  return { ok: true }
}

/**
 * Signing goes through the RPC, never through a table write.
 *
 * `sign_duty` checks that the caller IS the assigned signer and stores the hash
 * of what they signed; a trigger refuses any other path to those columns
 * (migration 20260904000004). This action is a thin wrapper so the button has
 * something to call — it deliberately adds no authorisation logic of its own,
 * because a second copy of that rule is a second place for it to be wrong.
 */
export async function signDuty(definitionKey: string, roleKey: string): Promise<DutyResult> {
  const parsed = z
    .object({ definitionKey: DefinitionKey, roleKey: z.string().min(1).max(64) })
    .safeParse({ definitionKey, roleKey })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const { data: duty } = await supabase
    .from('duties')
    .select('id')
    .eq('org_id', viewer.orgId)
    .eq('definition_key', parsed.data.definitionKey)
    .maybeSingle()
  if (!duty) return { ok: false, error: 'forbidden' }

  const { data, error } = await supabase.rpc('sign_duty', {
    p_duty: duty.id,
    p_role_key: parsed.data.roleKey,
  })
  if (error) return { ok: false, error: 'failed' }
  const payload = (data ?? {}) as { ok?: boolean; error?: string }
  if (payload.error) return { ok: false, error: payload.error === 'forbidden' ? 'forbidden' : 'failed' }

  revalidatePath('/rapporter')
  return { ok: true }
}

export async function publishDuty(definitionKey: string): Promise<DutyResult> {
  const parsed = DefinitionKey.safeParse(definitionKey)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const supabase = await createClient()
  const { data: duty } = await supabase
    .from('duties')
    .select('id')
    .eq('org_id', viewer.orgId)
    .eq('definition_key', parsed.data)
    .maybeSingle()
  if (!duty) return { ok: false, error: 'forbidden' }

  const { data, error } = await supabase.rpc('publish_duty', { p_duty: duty.id })
  if (error) return { ok: false, error: 'failed' }
  const payload = (data ?? {}) as { ok?: boolean; error?: string }
  // These three are the states the card has copy for; anything else is a bug,
  // not a message to a user.
  if (payload.error === 'unsigned') return { ok: false, error: 'unsigned' }
  if (payload.error === 'stale_signature') return { ok: false, error: 'stale_signature' }
  if (payload.error === 'no_report') return { ok: false, error: 'no_report' }
  if (payload.error) return { ok: false, error: 'forbidden' }

  revalidatePath('/rapporter')
  return { ok: true }
}
