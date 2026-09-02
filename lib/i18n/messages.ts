import 'server-only'

import { unstable_cache } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { SOURCE_LOCALE, i18nCacheTag, type Locale } from './locales'

export { LOCALES, SOURCE_LOCALE, ACTIVE_LOCALES, isLocale, i18nCacheTag } from './locales'
export type { Locale } from './locales'

type Messages = Record<string, Record<string, string>>

/**
 * UI copy lives in the `ui_messages` table (data-not-code), seeded from
 * /messages/*.json.
 *
 * Read with the ANON key, not the service role. The i18n_sel policy is
 * `using (true)`, so the anon role can already read every row — using the
 * service role here bought nothing and put an RLS-bypassing client on the hot
 * path of every page render. A sessionless client is also correct because this
 * runs inside unstable_cache, where request cookies are not available.
 */
async function fetchMessages(locale: Locale): Promise<Messages> {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
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
    // Without an expiry this cache never lets go: after seeding new keys the
    // running server kept serving the old set and the UI rendered raw
    // `namespace.key` strings indefinitely. The tag still allows an immediate
    // revalidate from the Phase 6 translation editor; this is the safety net
    // for every other path that changes ui_messages out of band (seeds,
    // migrations, a direct edit in Studio).
    revalidate: 300,
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
