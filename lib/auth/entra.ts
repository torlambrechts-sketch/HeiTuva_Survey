import 'server-only'

import { unstable_cache } from 'next/cache'

/**
 * Entra ID SSO (DECISIONS Q5, Phase 6) — the two facts the app needs.
 *
 * Whether the provider is configured at all is Supabase's to say, not an
 * environment variable's: `/auth/v1/settings` is the public, unauthenticated
 * description of what Auth will accept, and reading it means the login button
 * and the admin switch cannot disagree with the server about whether an Entra
 * sign-in can complete. Cached briefly — it changes when an operator enables
 * the provider, which is a deploy-scale event, not a per-request one.
 */
export const entraAvailable = unstable_cache(
  async (): Promise<boolean> => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      })
      if (!res.ok) return false
      const json = (await res.json()) as { external?: Record<string, boolean> }
      return json.external?.azure === true
    } catch {
      // Unknown is "no": a button that starts a flow the server will refuse is
      // worse than no button.
      return false
    }
  },
  ['auth-settings-azure'],
  { revalidate: 300 },
)

/** Supabase records the identity provider a session came from on the user. */
export function providerOf(user: { app_metadata?: Record<string, unknown> } | null): string {
  const p = user?.app_metadata?.provider
  return typeof p === 'string' ? p : 'email'
}

export const ENTRA_PROVIDER = 'azure'
