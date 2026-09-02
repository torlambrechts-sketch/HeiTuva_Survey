'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { LOCALES } from '@/lib/i18n/locales'

const LocaleSchema = z.enum(LOCALES)

/** Persists the viewer's UI language on their profile. RLS restricts profiles
 *  to `user_id = auth.uid()`, so this can only ever write the caller's own row. */
export async function setLocale(next: string) {
  const parsed = LocaleSchema.safeParse(next)
  if (!parsed.success) return

  const viewer = await requireViewer()
  const supabase = await createClient()
  await supabase
    .from('profiles')
    .upsert({ user_id: viewer.userId, lang: parsed.data }, { onConflict: 'user_id' })

  revalidatePath('/', 'layout')
}
