'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireViewer } from '@/lib/auth/session'
import { ENTRA_PROVIDER, entraAvailable } from '@/lib/auth/entra'
import { audit } from '@/lib/auth/audit'
import type { AdminResult } from './types'
import { privacyToStored, type PrivacyKey as PrivacyKeyName } from './keys'

/**
 * Every write here is administrator-only. That is enforced by RLS in the
 * database (0008: org_upd, members_*, groups_cud all require
 * app.has_role(..., administrator)), and re-checked here so a non-admin gets a
 * clear refusal instead of a silent zero-row update — RLS filters rather than
 * errors, so without this check a `redaktor` would see "saved" and nothing
 * would have changed.
 */
async function requireAdmin() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null
  // A server action is a POST endpoint: it does not go through the layout that
  return viewer
}

const CompanyInput = z.object({
  name: z.string().trim().min(1).max(200),
  orgnr: z.string().trim().max(20).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  contact_name: z.string().trim().max(200).optional().or(z.literal('')),
  contact_email: z.string().trim().email().max(200).optional().or(z.literal('')),
  dpo: z.string().trim().max(200).optional().or(z.literal('')),
})

export async function saveCompany(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = CompanyInput.safeParse({
    name: formData.get('name'),
    orgnr: formData.get('orgnr'),
    address: formData.get('address'),
    contact_name: formData.get('contact_name'),
    contact_email: formData.get('contact_email'),
    dpo: formData.get('dpo'),
  })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      name: parsed.data.name,
      orgnr: parsed.data.orgnr || null,
      address: parsed.data.address || null,
      contact_name: parsed.data.contact_name || null,
      contact_email: parsed.data.contact_email || null,
      dpo: parsed.data.dpo || null,
    })
    .eq('id', admin.orgId)
  if (error) {
    console.error(`saveCompany failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/administrasjon')
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Privacy toggles. `min_responses` is deliberately absent from the accepted
 *  keys: k=5 is enforced in the database and is not org-configurable
 *  (DECISIONS Q3), so the UI renders it as always-on and informational. */
const PrivacyKey = z.enum(['ip_logging', 'eu_only', 'auto_delete', 'consent'])

export async function setPrivacy(key: string, value: boolean): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = PrivacyKey.safeParse(key)
  if (!parsed.success || typeof value !== 'boolean') return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('privacy')
    .eq('id', admin.orgId)
    .single()

  const privacy = { ...((org?.privacy as Record<string, boolean> | null) ?? {}) }
  const previous = privacy[parsed.data]
  // `value` is the switch position, which is not always the stored value —
  // "Ikke lagre IP-adresse" is on when ip_logging is off. See keys.ts.
  const stored = privacyToStored(parsed.data as PrivacyKeyName, value)
  privacy[parsed.data] = stored

  const { error } = await supabase.from('organizations').update({ privacy }).eq('id', admin.orgId)
  if (error) {
    console.error(`setPrivacy(${parsed.data}) failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  await audit(admin.orgId, 'privacy.toggle', parsed.data, { from: previous, to: stored })
  revalidatePath('/administrasjon')
  return { ok: true }
}

const RetentionInput = z.coerce.number().int().refine((n) => [0, 6, 12, 24].includes(n))

export async function setRetention(months: number): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = RetentionInput.safeParse(months)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('retention_months')
    .eq('id', admin.orgId)
    .single()

  const { error } = await supabase
    .from('organizations')
    .update({ retention_months: parsed.data })
    .eq('id', admin.orgId)
  if (error) {
    console.error(`setRetention failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  await audit(admin.orgId, 'retention.change', String(parsed.data), {
    from: org?.retention_months,
    to: parsed.data,
  })
  revalidatePath('/administrasjon')
  return { ok: true }
}

const OptionKey = z.enum(['reminders', 'weekly_digest', 'allow_self_serve', 'brand_mail', 'sso'])

export async function setOption(key: string, value: boolean): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = OptionKey.safeParse(key)
  if (!parsed.success || typeof value !== 'boolean') return { ok: false, error: 'invalid' }

  /*
    "Pålogging med Entra ID (SSO) — deaktiverer passordpålogging" (Phase 6).
    Turning it ON has two preconditions, both about not stranding people:
    Auth must actually accept Entra sign-ins, or nobody could ever get in; and
    the administrator flipping it must themselves be signed in through Entra,
    or the next request would sign them out of the organisation they just
    locked. Turning it OFF is always allowed — whoever can reach this screen
    can undo it.
  */
  if (parsed.data === 'sso' && value) {
    if (!(await entraAvailable())) return { ok: false, error: 'sso_unavailable' }
    if (admin.provider !== ENTRA_PROVIDER) return { ok: false, error: 'sso_self_lockout' }
  }

  const supabase = await createClient()
  const { data: org } = await supabase.from('organizations').select('options').eq('id', admin.orgId).single()

  const options = { ...((org?.options as Record<string, boolean> | null) ?? {}) }
  const previous = options[parsed.data] === true
  options[parsed.data] = value

  const { error } = await supabase.from('organizations').update({ options }).eq('id', admin.orgId)
  if (error) {
    console.error(`setOption(${parsed.data}) failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  // Audited like the privacy toggles: `sso` changes who can get in at all, and
  // the others change what the organisation sends and to whom.
  await audit(admin.orgId, 'option.change', parsed.data, { from: previous, to: value })

  revalidatePath('/administrasjon')
  return { ok: true }
}

const DefaultLangInput = z.enum(['no', 'en'])

export async function setDefaultLang(lang: string): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = DefaultLangInput.safeParse(lang)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({ default_lang: parsed.data })
    .eq('id', admin.orgId)
  if (error) return { ok: false, error: 'save_failed' }

  revalidatePath('/administrasjon')
  revalidatePath('/', 'layout')
  return { ok: true }
}

const RoleInput = z.enum(['administrator', 'redaktor', 'leser'])

export async function setMemberRole(memberId: string, role: string): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = RoleInput.safeParse(role)
  if (!parsed.success || !z.string().uuid().safeParse(memberId).success) {
    return { ok: false, error: 'invalid' }
  }

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('org_members')
    .select('role, email, org_id')
    .eq('id', memberId)
    .single()

  // An administrator must not demote themselves out of the last admin seat —
  // that would leave the org with nobody who can manage users or privacy.
  if (before?.role === 'administrator' && parsed.data !== 'administrator') {
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', admin.orgId)
      .eq('role', 'administrator')
      .eq('status', 'active')
    if ((count ?? 0) <= 1) return { ok: false, error: 'last_admin' }
  }

  const { error } = await supabase.from('org_members').update({ role: parsed.data }).eq('id', memberId)
  if (error) {
    console.error(`setMemberRole failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  await audit(admin.orgId, 'role.change', before?.email ?? memberId, {
    from: before?.role,
    to: parsed.data,
  })
  revalidatePath('/administrasjon')
  return { ok: true }
}

export async function setMemberStatus(memberId: string, active: boolean): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(memberId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('org_members')
    .select('status, email, role')
    .eq('id', memberId)
    .single()

  if (before?.role === 'administrator' && !active) {
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', admin.orgId)
      .eq('role', 'administrator')
      .eq('status', 'active')
    if ((count ?? 0) <= 1) return { ok: false, error: 'last_admin' }
  }

  const status = active ? 'active' : 'inactive'
  const { error } = await supabase.from('org_members').update({ status }).eq('id', memberId)
  if (error) return { ok: false, error: 'save_failed' }

  await audit(admin.orgId, 'member.status', before?.email ?? memberId, {
    from: before?.status,
    to: status,
  })
  revalidatePath('/administrasjon')
  return { ok: true }
}

const InviteInput = z.object({ email: z.string().trim().email().max(200) })

/**
 * Creates the membership row in `invited` status and sends Supabase's own
 * invitation email.
 *
 * The email goes through the auth service, not the `lib/mail` adapter — that
 * one is still a console transport until SES lands in Phase 3 (DECISIONS Q6),
 * and an invitation nobody receives is worse than none. The membership row is
 * written first: if the mail fails the invite still exists and the colleague
 * can sign in by magic link, whereas an email pointing at a membership that was
 * never created would be a dead end.
 *
 * `claim_membership` (migration 0016) attaches the row to the auth user on
 * their first sign-in.
 */
export async function inviteMember(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = InviteInput.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const email = parsed.data.email.toLowerCase()
  const supabase = await createClient()
  const { error } = await supabase.from('org_members').insert({
    org_id: admin.orgId,
    email,
    role: 'leser',
    status: 'invited',
    invited_by: admin.memberId,
  })
  if (error) {
    // 23505 is the (org_id, email) unique constraint — already a member.
    console.error(`inviteMember failed: ${error.message}`)
    return { ok: false, error: error.code === '23505' ? 'duplicate' : 'save_failed' }
  }

  const origin = (await headers()).get('origin') ?? ''
  const { error: mailError } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  })
  // Already having an auth account is the common case for a colleague who was
  // invited to another org first; that is not a failure of this invitation.
  if (mailError && mailError.status !== 422) {
    console.error(`inviteMember: invitation email failed for a member of ${admin.orgId}`)
  }

  await audit(admin.orgId, 'member.invite', email, { role: 'leser' })
  revalidatePath('/administrasjon')
  return { ok: true }
}

const GroupInput = z.object({ name: z.string().trim().min(1).max(120) })

export async function createGroup(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = GroupInput.safeParse({ name: formData.get('name') })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.from('groups').insert({ org_id: admin.orgId, name: parsed.data.name })
  if (error) return { ok: false, error: error.code === '23505' ? 'duplicate' : 'save_failed' }

  revalidatePath('/administrasjon')
  return { ok: true }
}

export async function deleteGroup(groupId: string): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(groupId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.from('groups').delete().eq('id', groupId).eq('org_id', admin.orgId)
  if (error) return { ok: false, error: 'save_failed' }

  revalidatePath('/administrasjon')
  return { ok: true }
}

const DsrInput = z.object({
  type: z.enum(['innsyn', 'retting', 'sletting', 'portabilitet']),
  subject_email: z.string().trim().email().max(200),
})

export async function createDsr(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = DsrInput.safeParse({
    type: formData.get('type'),
    subject_email: formData.get('subject_email'),
  })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.from('dsr_requests').insert({
    org_id: admin.orgId,
    type: parsed.data.type,
    subject_email: parsed.data.subject_email,
    status: 'mottatt',
  })
  if (error) return { ok: false, error: 'save_failed' }

  await audit(admin.orgId, 'dsr.create', parsed.data.type, { subject: parsed.data.subject_email })
  revalidatePath('/administrasjon')
  return { ok: true }
}

const DsrStatusInput = z.enum(['mottatt', 'under_behandling', 'fullfort', 'avvist'])

export async function setDsrStatus(id: string, status: string): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = DsrStatusInput.safeParse(status)
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: before } = await supabase.from('dsr_requests').select('status, type').eq('id', id).single()

  const { error } = await supabase.from('dsr_requests').update({ status: parsed.data }).eq('id', id)
  if (error) return { ok: false, error: 'save_failed' }

  await audit(admin.orgId, 'dsr.status', before?.type ?? id, { from: before?.status, to: parsed.data })
  revalidatePath('/administrasjon')
  return { ok: true }
}
