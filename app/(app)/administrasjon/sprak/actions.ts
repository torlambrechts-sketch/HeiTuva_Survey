'use server'

import { z } from 'zod'
import { audit } from '@/lib/auth/audit'
import { requireViewer } from '@/lib/auth/session'
import { adminMfaSatisfied } from '@/lib/auth/mfa'
import { ACTIVE_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales'
import { createClient } from '@/lib/supabase/server'

export type LangState = {
  error?: 'invalid' | 'placeholders' | 'too_long' | 'failed'
  saved?: string
  /** Which placeholders were dropped or invented, so the message can name them. */
  detail?: string
}

const Save = z.object({
  namespace: z.string().trim().min(1).max(64),
  key: z.string().trim().min(1).max(200),
  // Refined to an ACTIVE locale, not merely a valid one: sv and da have rows in
  // the table but are not served, so an override for them would be work the
  // customer could never see.
  lang: z.custom<Locale>((v) => typeof v === 'string' && isLocale(v) && ACTIVE_LOCALES.includes(v)),
  // The longest shipped message is well under this; the cap exists so a paste
  // accident cannot put a novel into a button label.
  value: z.string().min(1).max(4000),
})

/**
 * ICU placeholders in a message, as a set.
 *
 * next-intl renders `{count}` and the richer `{n, plural, ...}` forms. Both
 * start with `{name` , so the name is what parity is measured on — an edit may
 * legitimately restructure a plural, but it may not silently drop the variable
 * the screen passes in. A dropped placeholder is the one edit that breaks a
 * screen without looking wrong in the editor (plan §6a, "validates ... 
 * placeholder parity against the default string before saving").
 */
function placeholders(value: string): Set<string> {
  const out = new Set<string>()
  for (const m of value.matchAll(/\{\s*([A-Za-z0-9_]+)/g)) out.add(m[1]!)
  return out
}

export async function saveMessage(_prev: LangState, formData: FormData): Promise<LangState> {
  const viewer = await requireViewer()
  // Administrator-only, and (DECISIONS Q14) only with the second factor cleared:
  // a server action never passes through the layout that redirects to /sikkerhet.
  if (viewer.role !== 'administrator' || !(await adminMfaSatisfied())) return { error: 'failed' }

  const parsed = Save.safeParse({
    namespace: formData.get('namespace'),
    key: formData.get('key'),
    lang: formData.get('lang'),
    value: formData.get('value'),
  })
  if (!parsed.success) {
    const long = parsed.error.issues.some((i) => i.path[0] === 'value' && i.code === 'too_big')
    return { error: long ? 'too_long' : 'invalid' }
  }
  const { namespace, key, lang, value } = parsed.data

  const supabase = await createClient()

  /*
    Parity is measured against the SHIPPED row, not against whatever this org
    saved last: two successive edits that each drop one placeholder would
    otherwise walk the message away from the code that renders it, one variable
    at a time, with every individual step passing.
  */
  const { data: shipped } = await supabase
    .from('ui_messages')
    .select('value')
    .eq('namespace', namespace)
    .eq('key', key)
    .eq('lang', lang)
    .is('org_id', null)
    .maybeSingle()

  if (shipped) {
    const want = placeholders(shipped.value)
    const got = placeholders(value)
    const missing = [...want].filter((p) => !got.has(p))
    const extra = [...got].filter((p) => !want.has(p))
    if (missing.length || extra.length) {
      return {
        error: 'placeholders',
        detail: [...missing.map((p) => `-{${p}}`), ...extra.map((p) => `+{${p}}`)].join(' '),
      }
    }
  }

  const { error } = await supabase
    .from('ui_messages')
    .upsert(
      {
        namespace,
        key,
        lang,
        value,
        org_id: viewer.orgId,
        updated_by: viewer.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'namespace,key,lang,org_key' },
    )
  if (error) {
    console.error(`saveMessage failed: ${error.message}`)
    return { error: 'failed' }
  }

  // The value itself is not audited — it is the org's own wording and the row
  // holds it anyway. What matters for the trail is who changed which message.
  await audit(viewer.orgId, 'i18n.override', `${namespace}.${key}.${lang}`, { lang, namespace })

  // No cache to invalidate: an organisation's overrides are read per request
  // (lib/i18n/messages.ts), so the next page already shows this.
  return { saved: `${namespace}.${key}` }
}

const Reset = Save.omit({ value: true })

/** Removes the org's override so the shipped copy applies again. */
export async function resetMessage(_prev: LangState, formData: FormData): Promise<LangState> {
  const viewer = await requireViewer()
  // Administrator-only, and (DECISIONS Q14) only with the second factor cleared:
  // a server action never passes through the layout that redirects to /sikkerhet.
  if (viewer.role !== 'administrator' || !(await adminMfaSatisfied())) return { error: 'failed' }

  const parsed = Reset.safeParse({
    namespace: formData.get('namespace'),
    key: formData.get('key'),
    lang: formData.get('lang'),
  })
  if (!parsed.success) return { error: 'invalid' }
  const { namespace, key, lang } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('ui_messages')
    .delete()
    .eq('namespace', namespace)
    .eq('key', key)
    .eq('lang', lang)
    // Belt as well as braces: the policy already refuses any row that is not
    // this org's, but a delete is worth spelling out at the call site too.
    .eq('org_id', viewer.orgId)
  if (error) {
    console.error(`resetMessage failed: ${error.message}`)
    return { error: 'failed' }
  }

  await audit(viewer.orgId, 'i18n.reset', `${namespace}.${key}.${lang}`, { lang, namespace })
  // No cache to invalidate: an organisation's overrides are read per request
  // (lib/i18n/messages.ts), so the next page already shows this.
  return { saved: `${namespace}.${key}` }
}
