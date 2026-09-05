/** Pure locale constants — safe to import from client components.
 *  Message loading lives in ./messages.ts, which is server-only because it
 *  reaches the database. Keep this file free of any server import. */
/** Order matters: the Språk chips render in this order, and the design lists
 *  them no / sv / da / en (HeiTuva.dc.html:3331). */
export const LOCALES = ['no', 'sv', 'da', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** `no` is the source language: every key exists there, so it is the fallback. */
export const SOURCE_LOCALE: Locale = 'no'

/** Languages a customer can actually be served today. sv/da are seeded but
 *  rendered disabled with a "kommer" badge per the design. */
export const ACTIVE_LOCALES: readonly Locale[] = ['no', 'en']

/** Where a visitor's chosen language lives when there is no profile to hold it.
 *  Set by the middleware from `?lang=`, read by `resolveLocale`. */
export const LANG_COOKIE = 'heituva-lang'

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

/**
 * The cache tag for a locale, optionally narrowed to one organisation.
 *
 * A seed or a migration changes the shipped copy for everyone and invalidates
 * `i18n:<locale>`. The translation editor changes one tenant's wording and
 * invalidates `i18n:<locale>:<org>`, which is why an org's cache entry carries
 * both: either event must reach it, and neither should evict the other's.
 */
export function i18nCacheTag(locale: Locale, orgId?: string) {
  return orgId ? `i18n:${locale}:${orgId}` : `i18n:${locale}`
}
