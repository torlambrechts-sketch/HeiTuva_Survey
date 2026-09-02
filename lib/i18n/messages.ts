import 'server-only'

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SOURCE_LOCALE, i18nCacheTag, type Locale } from './locales'

export { LOCALES, SOURCE_LOCALE, ACTIVE_LOCALES, isLocale, i18nCacheTag } from './locales'
export type { Locale } from './locales'

type Messages = Record<string, Record<string, string>>

/**
 * UI copy lives in the `ui_messages` table (data-not-code), seeded from
 * /messages/*.json. Read with the service role because the table is global
 * reference data and the respondent surface is unauthenticated — there is no
 * per-user data here, so no RLS decision is being bypassed.
 */
async function fetchMessages(locale: Locale): Promise<Messages> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ui_messages')
    .select('namespace, key, value')
    .eq('lang', locale)
  if (error) throw new Error(`ui_messages read failed for ${locale}: ${error.message}`)

  const out: Messages = {}
  for (const row of (data ?? []) as { namespace: string; key: string; value: string }[]) {
    ;(out[row.namespace] ??= {})[row.key] = row.value
  }
  return out
}

export function getMessages(locale: Locale) {
  return unstable_cache(() => fetchMessages(locale), ['ui_messages', locale], {
    tags: [i18nCacheTag(locale)],
  })()
}

/** Requested locale over `no`; a key missing from both renders visibly as
 *  `namespace.key` rather than silently blank, so gaps show up in review. */
export async function getMergedMessages(locale: Locale): Promise<Messages> {
  if (locale === SOURCE_LOCALE) return getMessages(SOURCE_LOCALE)
  const [source, requested] = await Promise.all([getMessages(SOURCE_LOCALE), getMessages(locale)])
  const merged: Messages = {}
  for (const ns of new Set([...Object.keys(source), ...Object.keys(requested)])) {
    merged[ns] = { ...(source[ns] ?? {}), ...(requested[ns] ?? {}) }
  }
  return merged
}
