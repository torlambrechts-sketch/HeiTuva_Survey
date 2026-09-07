'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireViewer } from '@/lib/auth/session'
import { ENTRA_PROVIDER, entraAvailable } from '@/lib/auth/entra'
import { audit } from '@/lib/auth/audit'
import type { AdminError, AdminResult } from './types'
import { privacyToStored, type PrivacyKey as PrivacyKeyName } from './keys'

/**
 * The break-glass rule (migration 0029) is a pair of triggers, and a trigger
 * refuses with a message rather than a status. Reading the message here is
 * what lets the screen say WHY rather than "Kunne ikke lagre": the rule is
 * enforced in the database, so the same refusal can surface from any of the
 * three writes it guards (the option, a role change, a deactivation).
 */
function dbError(error: { code?: string; message: string }): AdminError {
  if (error.message.includes('sso_last_break_glass')) return 'sso_last_break_glass'
  if (error.message.includes('sso_no_break_glass')) return 'sso_no_break_glass'
  if (error.code === '23505') return 'duplicate'
  return 'save_failed'
}

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

/**
 * DECISIONS Q57 — the organisation's default display threshold gets its first
 * writer. The column has existed since M:0034 and been shown on this tab since
 * Phase 9; D87 recorded that the action was left unwritten on purpose, because
 * an action with no caller is a lie in the codebase. v2 draws the picker
 * (HeiTuva.dc.html:2737-2747), so there is a caller now.
 *
 * ADMINISTRATOR, NOT REDAKTØR (Tor, with the Q57 confirmation): this is a
 * privacy setting and sits with the role that already owns this tab. That is
 * `requireAdmin` here AND `org_upd` in the database (M:0008:8), so removing the
 * check here does not open it — which is what tests/db/org-threshold.test.ts
 * proves by asserting the VALUE did not move rather than that an error came
 * back, since RLS filters an UPDATE instead of erroring.
 *
 * THE RANGE IS NOT THIS FUNCTION'S TO DECIDE. 2-10 is Q36's ceiling and Q91's
 * floor, CHECKed on the column (M:0055); the Zod bound mirrors it
 * so the form can say something useful, and the database refuses independently.
 * Both sides are tested from both ends: 11 refused, 10 accepted, 2 accepted,
 * 1 refused.
 */
// Q91 moved the floor to 2; the CHECK on the column is the real enforcement.
const DefaultKInput = z.coerce.number().int().min(2).max(10)

export async function setDefaultThreshold(k: number): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = DefaultKInput.safeParse(k)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('default_k_threshold')
    .eq('id', admin.orgId)
    .single()

  const { error } = await supabase
    .from('organizations')
    .update({ default_k_threshold: parsed.data })
    .eq('id', admin.orgId)
  if (error) {
    console.error(`setDefaultThreshold failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  // Q17: changing the threshold is an administrator action, audited.
  await audit(admin.orgId, 'threshold.default_change', String(parsed.data), {
    from: org?.default_k_threshold,
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

  const supabase = await createClient()

  /*
    "Pålogging med Entra ID (SSO) — deaktiverer passordpålogging" (Phase 6).
    Turning it ON has three preconditions, all about not stranding people:
    Auth must actually accept Entra sign-ins, or nobody could ever get in; the
    organisation must keep at least one active administrator who can sign in
    WITHOUT Entra (the break-glass rule, decision 2 of the Phase 6 acceptance —
    migration 0029 refuses the update otherwise, this check is what lets the
    screen say so before the attempt); and the administrator flipping it must
    either be signed in through Entra or be that exempt administrator, or the
    next request would sign them out of the organisation they just locked.
    Turning it OFF is always allowed — whoever can reach this screen can undo
    it.
  */
  if (parsed.data === 'sso' && value) {
    if (!(await entraAvailable())) return { ok: false, error: 'sso_unavailable' }
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', admin.orgId)
      .eq('role', 'administrator')
      .eq('status', 'active')
      .eq('sso_exempt', true)
    if ((count ?? 0) === 0) return { ok: false, error: 'sso_no_break_glass' }
    if (admin.provider !== ENTRA_PROVIDER && !admin.ssoExempt) {
      return { ok: false, error: 'sso_self_lockout' }
    }
  }

  const { data: org } = await supabase.from('organizations').select('options').eq('id', admin.orgId).single()

  const options = { ...((org?.options as Record<string, boolean> | null) ?? {}) }
  const previous = options[parsed.data] === true
  options[parsed.data] = value

  const { error } = await supabase.from('organizations').update({ options }).eq('id', admin.orgId)
  if (error) {
    console.error(`setOption(${parsed.data}) failed: ${error.message}`)
    return { ok: false, error: dbError(error) }
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
    return { ok: false, error: dbError(error) }
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
  if (error) return { ok: false, error: dbError(error) }

  await audit(admin.orgId, 'member.status', before?.email ?? memberId, {
    from: before?.status,
    to: status,
  })
  revalidatePath('/administrasjon')
  return { ok: true }
}

/**
 * "Kan logge inn uten Entra ID" — the break-glass mark (D82, decision 2).
 *
 * Only an administrator's row may carry it; the exemption is how the
 * organisation keeps a way back into its own settings, not a per-person way
 * around the policy. Taking it off the last exempt administrator while SSO is
 * on is refused by the database (migration 0029) and reported as such.
 */
export async function setSsoExempt(memberId: string, value: boolean): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(memberId).success || typeof value !== 'boolean') {
    return { ok: false, error: 'invalid' }
  }

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('org_members')
    .select('sso_exempt, email, role, org_id')
    .eq('id', memberId)
    .single()
  if (!before || before.org_id !== admin.orgId) return { ok: false, error: 'invalid' }
  if (before.role !== 'administrator') return { ok: false, error: 'invalid' }

  const { error } = await supabase.from('org_members').update({ sso_exempt: value }).eq('id', memberId)
  if (error) {
    console.error(`setSsoExempt failed: ${error.message}`)
    return { ok: false, error: dbError(error) }
  }

  await audit(admin.orgId, 'member.sso_exempt', before.email, { from: before.sso_exempt, to: value })
  revalidatePath('/administrasjon')
  revalidatePath('/', 'layout')
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

/* ── V2-2 · «Profil og avsender», the unblocked half ────────────────────────
   The accent is validated against the REGISTRY rather than against a list in
   this file. A Zod enum here would be a second place the five live, and the
   moment design adds a sixth one of the two would be quietly wrong — the same
   reasoning that made the column a foreign key rather than a CHECK. The type
   pair IS an enum here, because its constraint is a CHECK for the reason the
   migration gives: a third pair needs a font the shell loads.                */

const BRAND_TYPES = ['playfair', 'bricolage'] as const
const BrandInput = z.object({
  accent: z.string().trim().min(1).max(40).nullable(),
  type: z.enum(BRAND_TYPES).nullable(),
})

export async function setBranding(input: {
  accent: string | null
  type: 'playfair' | 'bricolage' | null
}): Promise<AdminResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const parsed = BrandInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()

  // NULL is a real choice — "back to the product default" — and is deliberately
  // not the same as picking the accent whose hex happens to equal it.
  const { error } = await supabase
    .from('organizations')
    .update({ brand_accent: parsed.data.accent, brand_type: parsed.data.type })
    .eq('id', admin.orgId)
  if (error) {
    // A foreign-key violation here means the client sent an accent key the
    // registry does not have. That is invalid input, not a failure to save, and
    // saying so is what lets the screen distinguish "try again" from "that is
    // not a colour we offer".
    if (error.code === '23503' || /foreign key/i.test(error.message)) {
      return { ok: false, error: 'invalid' }
    }
    console.error(`setBranding failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  // The audit row is written by `app.audit_branding_change` (M:0056), not here.
  // A trigger sees every writer; an action sees only its own callers, and this
  // setting can also move through the logo upload path below.
  revalidatePath('/administrasjon/profil')
  return { ok: true }
}

/** The three slots the design draws (V2:4909), as the column each writes. */
const LOGO_SLOTS = { light: 'logo_light', dark: 'logo_dark', icon: 'logo_icon' } as const
export type LogoSlot = keyof typeof LOGO_SLOTS

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'] as const
const EXT: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

const LogoInput = z.object({
  slot: z.enum(['light', 'dark', 'icon']),
  size: z.number().int().positive().max(MAX_LOGO_BYTES),
  type: z.enum(LOGO_TYPES),
})

export type LogoResult = AdminResult & { url?: string }

/**
 * Uploads a logo and records it, in one call.
 *
 * THE UPLOAD GOES THROUGH THE VIEWER'S OWN SESSION, not the service role, so
 * the bucket's policies are what admit it — `orglogo_obj_ins` is
 * administrator-only, and a write that only this function's `requireAdmin`
 * refused would be a rule about one caller. The check here is what lets the
 * screen say why; the policy is what makes it true.
 *
 * THE PATH IS DERIVED SERVER-SIDE AND NEVER ACCEPTED FROM THE CLIENT. The
 * bucket is org-scoped by prefix, so a path is an authorisation claim: taking
 * one from the browser would mean validating a string that has no business
 * crossing the boundary at all. The client sends a slot and a file; the
 * organisation comes from the session.
 *
 * The bucket ALSO enforces the size and MIME limits (M:0056), so these checks
 * are the message rather than the rule.
 */
export async function uploadLogo(formData: FormData): Promise<LogoResult> {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'forbidden' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'invalid' }

  const parsed = LogoInput.safeParse({
    slot: formData.get('slot'),
    size: file.size,
    type: file.type,
  })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const path = `${admin.orgId}/logo_${parsed.data.slot}.${EXT[parsed.data.type]}`

  const { error: upErr } = await supabase.storage
    .from('org-logos')
    .upload(path, file, { upsert: true, contentType: parsed.data.type })
  if (upErr) {
    console.error(`uploadLogo failed: ${upErr.message}`)
    return { ok: false, error: 'save_failed' }
  }

  // Written as an explicit column rather than a computed key: a computed key
  // types as `string` and defeats the generated row type, which is the one
  // thing standing between a typo and a silent no-op update.
  const column = LOGO_SLOTS[parsed.data.slot]
  const patch =
    column === 'logo_light' ? { logo_light: path }
    : column === 'logo_dark' ? { logo_dark: path }
    : { logo_icon: path }

  const { error } = await supabase.from('organizations').update(patch).eq('id', admin.orgId)
  if (error) {
    console.error(`uploadLogo could not record ${column}: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  const { data: signed } = await supabase.storage.from('org-logos').createSignedUrl(path, 3600)
  revalidatePath('/administrasjon/profil')
  return { ok: true, url: signed?.signedUrl }
}
