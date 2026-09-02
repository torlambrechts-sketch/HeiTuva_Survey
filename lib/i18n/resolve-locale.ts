import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { SOURCE_LOCALE, isLocale, type Locale } from './locales'

/**
 * Resolves the locale for a request: the signed-in user's profile `lang`, then
 * their org's `default_lang`, then `no`.
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
    if (!user) return SOURCE_LOCALE

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
