'use server'

/**
 * Shell-level actions — things the signed-in chrome does, not any one screen.
 *
 * `setLocale` lived under Oversikt until `/` became the public splash and
 * Oversikt moved to `/oversikt`. The language picker is in the header on every
 * screen, so importing it from one screen's folder was always the wrong shape;
 * the move is what made that visible.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { LOCALES } from '@/lib/i18n/locales'

const LocaleSchema = z.enum(LOCALES)

/** Persists the viewer's UI language on their profile. RLS restricts profiles
 *  to `user_id = auth.uid()`, so this can only ever write the caller's own row. */
export type SetLocaleResult = { ok: true } | { ok: false; error: string }

export async function setLocale(next: string): Promise<SetLocaleResult> {
  const parsed = LocaleSchema.safeParse(next)
  if (!parsed.success) return { ok: false, error: 'invalid_locale' }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: viewer.userId, lang: parsed.data }, { onConflict: 'user_id' })

  // Previously discarded. A silent failure here looks to the user like the
  // language simply refused to change, with nothing to report.
  if (error) {
    console.error(`setLocale(${parsed.data}) failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Oversikt
// ---------------------------------------------------------------------------
