import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SOURCE_LOCALE, isLocale, type Locale } from '@/lib/i18n/locales'

export type MemberRole = 'administrator' | 'redaktor' | 'leser'

export type Viewer = {
  userId: string
  email: string
  orgId: string
  orgName: string
  memberId: string
  role: MemberRole
  displayName: string
  locale: Locale
  groupId: string | null
}

/**
 * The signed-in member, read through the anon client so RLS applies — a caller
 * can only ever resolve their own membership. `cache` dedupes it per request.
 * Returns null when signed out or not yet a member of any org.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('org_members')
    .select('id, org_id, role, name, group_id, organizations(name, default_lang)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!member) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, lang')
    .eq('user_id', user.id)
    .maybeSingle()

  const org = member.organizations as unknown as { name: string; default_lang: string } | null

  // Locale resolution per CLAUDE.md: profile lang, then the org default, then `no`.
  const locale: Locale = isLocale(profile?.lang)
    ? profile.lang
    : isLocale(org?.default_lang)
      ? org.default_lang
      : SOURCE_LOCALE

  return {
    userId: user.id,
    email: user.email ?? '',
    orgId: member.org_id,
    orgName: org?.name ?? '',
    memberId: member.id,
    role: member.role as MemberRole,
    displayName: profile?.display_name || member.name || user.email || '',
    locale,
    groupId: member.group_id,
  }
})

/**
 * Use in any page or action under (app). Redirects rather than throwing so a
 * signed-out visitor lands on the login screen.
 *
 * The two failure modes are different and must not be collapsed: signed out
 * goes to /logg-inn, but signed in with no membership goes to onboarding.
 * Sending the second case to /logg-inn produced a redirect loop — middleware
 * bounces an authenticated request off /logg-inn back to /, which lands here
 * again.
 */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (viewer) return viewer

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  redirect(user ? '/kom-i-gang' : '/logg-inn')
}


/** Initials for the avatar chip, matching the design's two-letter treatment. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
