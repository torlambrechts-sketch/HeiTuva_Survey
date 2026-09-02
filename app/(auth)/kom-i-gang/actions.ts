'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type OnboardingResult = { ok: false; error: 'invalid' | 'already' | 'save_failed' }

const Input = z.object({
  company: z.string().trim().min(1).max(200),
  orgnr: z.string().trim().max(20).optional().or(z.literal('')),
  name: z.string().trim().min(1).max(120),
})

/**
 * Creates an organization for a signed-in user who belongs to none, and makes
 * them its administrator.
 *
 * This is the one place in Phase 1 that legitimately needs the service role:
 * `org_sel`/`members_ins` are both gated on already being a member of the org,
 * so the first row cannot be written by the user it is about. The scope is kept
 * as narrow as that implies — the caller must be authenticated, must not
 * already have a membership, and the only rows written are their own org, their
 * own membership, and their own profile.
 */
export async function createOrganization(
  _prev: OnboardingResult | null,
  formData: FormData,
): Promise<OnboardingResult> {
  const parsed = Input.safeParse({
    company: formData.get('company'),
    orgnr: formData.get('orgnr'),
    name: formData.get('name'),
  })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/logg-inn')

  const admin = createAdminClient()

  // Refuse if this user is already attached to an org. Without this the action
  // would be an unauthenticated-in-effect org factory for anyone with a session.
  const { data: existing } = await admin
    .from('org_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (existing) return { ok: false, error: 'already' }

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: parsed.data.company, orgnr: parsed.data.orgnr || null })
    .select('id')
    .single()
  if (orgError || !org) {
    console.error(`createOrganization: org insert failed: ${orgError?.message}`)
    return { ok: false, error: 'save_failed' }
  }

  const { error: memberError } = await admin.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    email: (user.email ?? '').toLowerCase(),
    name: parsed.data.name,
    role: 'administrator',
    status: 'active',
  })
  if (memberError) {
    // Roll the org back rather than leaving an orphan nobody can reach or see.
    await admin.from('organizations').delete().eq('id', org.id)
    console.error(`createOrganization: member insert failed: ${memberError.message}`)
    return { ok: false, error: 'save_failed' }
  }

  await admin
    .from('profiles')
    .upsert({ user_id: user.id, display_name: parsed.data.name }, { onConflict: 'user_id' })

  revalidatePath('/', 'layout')
  redirect('/')
}
