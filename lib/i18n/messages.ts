import 'server-only'

import { unstable_cache } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { SOURCE_LOCALE, i18nCacheTag, type Locale } from './locales'
import { overlay, type Messages } from './overlay'
import bundledNo from '@/messages/no.json'
import bundledEn from '@/messages/en.json'

export { LOCALES, SOURCE_LOCALE, ACTIVE_LOCALES, isLocale, i18nCacheTag } from './locales'
export type { Locale } from './locales'

/**
 * The message set compiled into the build.
 *
 * `ui_messages` is SEEDED FROM these files, so they are the source and the
 * table is an editable overlay on top of them (the Phase 6 translation editor
 * writes rows; nobody writes JSON at runtime). Treating the bundle as the base
 * rather than the table as the whole truth is what lets a page render when the
 * database is unreachable.
 */
const BUNDLED: Record<string, Messages> = {
  no: bundledNo as Messages,
  en: bundledEn as Messages,
}

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
async function fetchMessages(locale: Locale, orgId?: string): Promise<Messages> {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const base = BUNDLED[locale] ?? {}

  // A failed read must NOT throw.
  //
  // This ran during `next build`, which prerenders /_not-found, so a build with
  // no database reachable died with "ui_messages read failed: fetch failed" —
  // CI has been red since Phase 0 for exactly this reason, and the "CI green to
  // merge" gate was therefore never satisfiable. It is also the wrong runtime
  // behaviour: a Supabase blip should not take every page down when the
  // messages are compiled into the build already.
  //
  // So the table is an overlay. Unreachable, and the reader sees the shipped
  // copy rather than an error page.
  type Row = { namespace: string; key: string; value: string; org_id: string | null }
  let data: Row[] = []
  try {
    /*
      Both scopes in one read, ordered so the org's rows are applied last.

      `org_id` NULL is the shipped default (seeded from the JSON above); a row
      carrying an org id is that organisation's override of one message, written
      through Administrasjon → Språk. Selecting only the two scopes that can
      apply — rather than every row and filtering here — keeps a large tenant's
      overrides out of another tenant's response.
    */
    const scope = orgId ? `org_id.is.null,org_id.eq.${orgId}` : 'org_id.is.null'
    const res = await supabase
      .from('ui_messages')
      .select('namespace, key, value, org_id')
      .eq('lang', locale)
      .or(scope)
    if (res.error) throw new Error(res.error.message)
    data = (res.data ?? []) as Row[]
  } catch (e) {
    console.error(
      `ui_messages read failed for ${locale}; serving the bundled set: ` +
        (e instanceof Error ? e.message : String(e)),
    )
    return base
  }

  const global: Messages = {}
  const org: Messages = {}
  for (const row of data) {
    const into = row.org_id === null ? global : org
    ;(into[row.namespace] ??= {})[row.key] = row.value
  }
  // An empty table is not an instruction to render nothing: before the first
  // seed there are no rows at all, and the bundle is the whole answer.
  return overlay(overlay(base, global), org)
}

export function getMessages(locale: Locale, orgId?: string) {
  return unstable_cache(
    () => fetchMessages(locale, orgId),
    ['ui_messages', locale, orgId ?? 'global'],
    {
      // Two tags: the locale's, which a seed or a migration invalidates for
      // everyone, and the org's, which the editor invalidates for one tenant
      // without evicting every other tenant's cache entry.
      tags: orgId ? [i18nCacheTag(locale), i18nCacheTag(locale, orgId)] : [i18nCacheTag(locale)],
      // Without an expiry this cache never lets go: after seeding new keys the
      // running server kept serving the old set and the UI rendered raw
      // `namespace.key` strings indefinitely. The tags still allow an immediate
      // revalidate from the translation editor; this is the safety net for
      // every other path that changes ui_messages out of band (seeds,
      // migrations, a direct edit in Studio).
      revalidate: 300,
    },
  )()
}

/**
 * Requested locale over `no`; a key missing from both renders visibly as
 * `namespace.key` rather than silently blank, so gaps show up in review.
 *
 * `orgId` adds that organisation's own overrides on top of the shipped copy,
 * within each locale — so an org that has rewritten one Norwegian string still
 * falls back to the shipped English for a key it has not touched.
 */
export async function getMergedMessages(locale: Locale, orgId?: string): Promise<Messages> {
  if (locale === SOURCE_LOCALE) return getMessages(SOURCE_LOCALE, orgId)
  const [source, requested] = await Promise.all([
    getMessages(SOURCE_LOCALE, orgId),
    getMessages(locale, orgId),
  ])
  return overlay(source, requested)
}
