import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { SOURCE_LOCALE, i18nCacheTag, type Locale } from './locales'
import { overlay, type Messages } from './overlay'
import { bundleFingerprint } from './fingerprint'
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
 * Read with the ANON key, not the service role. The i18n_sel policy is
 * `using (true)`, so the anon role can already read every row — using the
 * service role here bought nothing and put an RLS-bypassing client on the hot
 * path of every page render. A sessionless client is also correct because the
 * shipped layer is read inside unstable_cache, where request cookies are not
 * available.
 */
function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
}

type Row = { namespace: string; key: string; value: string }

function intoMessages(rows: Row[]): Messages {
  const out: Messages = {}
  for (const row of rows) (out[row.namespace] ??= {})[row.key] = row.value
  return out
}

/**
 * UI copy lives in the `ui_messages` table (data-not-code), seeded from
 * /messages/*.json. This is the SHIPPED layer: the rows with no org.
 *
 * A failed read must NOT throw.
 *
 * This ran during `next build`, which prerenders /_not-found, so a build with
 * no database reachable died with "ui_messages read failed: fetch failed" —
 * CI has been red since Phase 0 for exactly this reason, and the "CI green to
 * merge" gate was therefore never satisfiable. It is also the wrong runtime
 * behaviour: a Supabase blip should not take every page down when the
 * messages are compiled into the build already.
 *
 * So the table is an overlay. Unreachable, and the reader sees the shipped
 * copy rather than an error page.
 */
async function fetchShipped(locale: Locale): Promise<Messages> {
  const base = BUNDLED[locale] ?? {}
  try {
    const res = await anonClient()
      .from('ui_messages')
      .select('namespace, key, value')
      .eq('lang', locale)
      .is('org_id', null)
    if (res.error) throw new Error(res.error.message)
    // An empty table is not an instruction to render nothing: before the first
    // seed there are no rows at all, and the bundle is the whole answer.
    return overlay(base, intoMessages((res.data ?? []) as Row[]))
  } catch (e) {
    console.error(
      `ui_messages read failed for ${locale}; serving the bundled set: ` +
        (e instanceof Error ? e.message : String(e)),
    )
    return base
  }
}

/**
 * The shipped layer for one locale: every key in the build, and slow to change
 * (a seed, a migration). It sits in the data cache under the locale's tag.
 */
/**
 * A fingerprint of the COMPILED message set, per locale, part of the cache key.
 *
 * WHY, measured rather than supposed (2026-09-12). The cached value is
 * `overlay(BUNDLED, rows)` — it depends on BOTH halves — and the key named only
 * the locale. Next's Data Cache persists ACROSS DEPLOYMENTS on Vercel, so a
 * deploy that added keys to the bundle kept serving the PREVIOUS deployment's
 * merged set, and any key the old bundle lacked rendered as a raw
 * `namespace.key` until `revalidate` expired it. That is exactly what was seen
 * on /oppgaver after C4 shipped 116 new keys.
 *
 * THE ORIGINAL DIAGNOSIS WAS WRONG AND IS RECORDED AS WRONG. It was read as
 * «the gate checks messages/*.json while the product serves ui_messages», i.e.
 * missing ROWS. Measured: the live deployment carries C4's own copy, so the
 * bundle has the keys, and a missing row cannot render raw because the bundle
 * is the BASE. The stale half was the cache, not the table.
 *
 * A FINGERPRINT RATHER THAN A DEPLOYMENT ID. `VERCEL_DEPLOYMENT_ID` would fix
 * the case in front of us and nothing else: it is absent off Vercel, it changes
 * when the bundle has not, and it says nothing about the thing the cached value
 * actually depends on. The fingerprint IS that thing — change a message and the
 * key changes, on any host, including `next dev`. Prefer the fix that is robust
 * against the construct nobody has thought of.
 *
 * Computed once at module load. `JSON.stringify` over an imported JSON module
 * is deterministic within a build because key order is the file's order.
 */
const BUNDLE_FINGERPRINT: Record<string, string> = Object.fromEntries(
  Object.entries(BUNDLED).map(([locale, messages]) => [
    locale,
    bundleFingerprint(messages),
  ]),
)

function getShippedMessages(locale: Locale): Promise<Messages> {
  return unstable_cache(
    () => fetchShipped(locale),
    ['ui_messages', locale, BUNDLE_FINGERPRINT[locale] ?? 'no-bundle'],
    {
    tags: [i18nCacheTag(locale)],
    // Without an expiry this cache never lets go: after seeding new keys the
    // running server kept serving the old set and the UI rendered raw
    // `namespace.key` strings indefinitely. The tag still allows an immediate
    // revalidate from a seed; this is the safety net for every other path that
    // changes the shipped rows out of band (a migration, a direct edit in
    // Studio).
      revalidate: 300,
    },
  )()
}

/**
 * One organisation's overrides — the rows Administrasjon → Språk writes — read
 * on every request.
 *
 * Deliberately NOT in the data cache. `unstable_cache` answers the first read
 * after `revalidateTag` with the stale entry and refreshes it in the
 * background, so an administrator who pressed "Lagre" and then navigated could
 * see the old copy once; the round-trip in scripts/verify/roundtrip.ts caught
 * exactly that. The set is small (one row per edited message, indexed by
 * org and language) so a read per request costs less than being wrong once.
 * `cache` dedupes it within the request; an unreachable database yields no
 * overrides rather than an error.
 */
const fetchOrgOverrides = cache(async (locale: Locale, orgId: string): Promise<Messages> => {
  try {
    const res = await anonClient()
      .from('ui_messages')
      .select('namespace, key, value')
      .eq('lang', locale)
      .eq('org_id', orgId)
    if (res.error) throw new Error(res.error.message)
    return intoMessages((res.data ?? []) as Row[])
  } catch (e) {
    console.error(
      `ui_messages overrides read failed for ${locale}; serving the shipped copy: ` +
        (e instanceof Error ? e.message : String(e)),
    )
    return {}
  }
})

/**
 * The shipped copy, then the organisation's overrides on top of it.
 *
 * `org_id` NULL is the shipped default (seeded from the JSON above); a row
 * carrying an org id is that organisation's override of one message. Reading
 * only the two scopes that can apply — rather than every row and filtering —
 * keeps a large tenant's overrides out of another tenant's response.
 */
export async function getMessages(locale: Locale, orgId?: string): Promise<Messages> {
  const shipped = await getShippedMessages(locale)
  if (!orgId) return shipped
  return overlay(shipped, await fetchOrgOverrides(locale, orgId))
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
