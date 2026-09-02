'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { LOCALES } from '@/lib/i18n/locales'
import { NOTIFY_KEYS, type SaveResult } from './notify-keys'


const ProfileInput = z.object({
  display_name: z.string().trim().min(1).max(120),
  job_title: z.string().trim().max(120).optional().or(z.literal('')),
  // Deliberately permissive: Norwegian numbers get written +47 918 27 364,
  // 91827364, and every spacing in between. Rejecting formats here would only
  // block real people; nothing downstream parses this until SMS in Phase 6.
  phone: z.string().trim().max(40).optional().or(z.literal('')),
})

const NotifyInput = z.object({
  key: z.enum(NOTIFY_KEYS),
  value: z.boolean(),
})

const LocaleInput = z.enum(LOCALES)

/** Om meg. Writes only the caller's own row — profiles RLS is
 *  `user_id = auth.uid()`, so this cannot reach another user's profile even if
 *  the input were tampered with. */
export async function saveProfile(_prev: SaveResult | null, formData: FormData): Promise<SaveResult> {
  const parsed = ProfileInput.safeParse({
    display_name: formData.get('display_name'),
    job_title: formData.get('job_title'),
    phone: formData.get('phone'),
  })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  const supabase = await createClient()

  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: viewer.userId,
      display_name: parsed.data.display_name,
      job_title: parsed.data.job_title || null,
      phone: parsed.data.phone || null,
    },
    { onConflict: 'user_id' },
  )
  if (error) {
    console.error(`saveProfile failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/profil')
  revalidatePath('/', 'layout') // the header shows the display name
  return { ok: true }
}

/** One notification toggle. Read-modify-write on the jsonb so a concurrent
 *  toggle of a different key is not clobbered. */
export async function setNotify(key: string, value: boolean): Promise<SaveResult> {
  const parsed = NotifyInput.safeParse({ key, value })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('profiles')
    .select('notify')
    .eq('user_id', viewer.userId)
    .maybeSingle()

  const notify = { ...((current?.notify as Record<string, boolean> | null) ?? {}) }
  notify[parsed.data.key] = parsed.data.value

  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: viewer.userId, notify }, { onConflict: 'user_id' })
  if (error) {
    console.error(`setNotify(${parsed.data.key}) failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/profil')
  return { ok: true }
}

/** Språk chips. Same write as the header picker; kept here so the screen does
 *  not import another route's action. */
export async function setProfileLocale(next: string): Promise<SaveResult> {
  const parsed = LocaleInput.safeParse(next)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: viewer.userId, lang: parsed.data }, { onConflict: 'user_id' })
  if (error) {
    console.error(`setProfileLocale failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
