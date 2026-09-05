import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'

import { createClient } from '@/lib/supabase/server'
import { LANG_COOKIE, SOURCE_LOCALE, isLocale, type Locale } from './locales'

/**
 * Resolves the locale for a request: the signed-in user's profile `lang`, then
 * their org's `default_lang`, then `no` — and for a visitor with no session,
 * the language cookie the splash's picker sets.
 *
 * This project has no locale routing (no /no/... prefix), so next-intl's
 * `requestLocale` is always undefined — nothing would ever set a locale unless
 * we resolve it here ourselves. Reads go through the cookie-bound anon client,
 * so RLS applies and a caller only ever sees their own profile.
 *
 * The respondent surface at /s/[token] does not use this: a respondent has no
 * session, so that route passes its locale explicitly.
 */
export async function resolveLocale(): Promise<Locale> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      // A visitor has no profile, so the language they picked on the splash is
      // the only preference there is (set from `?lang=` by the middleware).
      const chosen = (await cookies()).get(LANG_COOKIE)?.value
      return isLocale(chosen) ? chosen : SOURCE_LOCALE
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('lang')
      .eq('user_id', user.id)
      .maybeSingle()
    if (isLocale(profile?.lang)) return profile.lang

    const { data: member } = await supabase
      .from('org_members')
      .select('organizations(default_lang)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    const org = member?.organizations as unknown as { default_lang: string } | null
    if (isLocale(org?.default_lang)) return org.default_lang

    return SOURCE_LOCALE
  } catch {
    // A locale lookup must never take down the page — fall back to the source
    // language, which always has every key.
    return SOURCE_LOCALE
  }
}

/**
 * The organisation whose message overrides apply to this request.
 *
 * Separate from `resolveLocale` rather than folded into it because the two have
 * different fallbacks — a visitor still has a language, but has no org — and
 * because most requests need only one of them. `cache` makes the pair cost one
 * round trip each per render, not one per call site.
 *
 * A respondent at /s/[token] has no session and therefore no org here: they
 * read the shipped copy. Wiring the survey's own org through the token context
 * is the next step for that surface (docs/DEVIATIONS.md D78).
 */
export const resolveOrgId = cache(async (): Promise<string | undefined> => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return undefined

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    return member?.org_id ?? undefined
  } catch {
    // Same rule as the locale: a lookup must never take down the page. Without
    // an org the reader serves the shipped copy, which is always correct — just
    // not customised.
    return undefined
  }
})
