import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type AalLevel = 'aal1' | 'aal2'

export type MfaState = {
  /** Assurance level of the session as it stands. */
  current: AalLevel | null
  /** Highest level this user could reach — 'aal2' once a factor is verified. */
  next: AalLevel | null
  /** A TOTP factor the user has already confirmed. */
  enrolled: boolean
  /** Factor id to challenge against, when one is enrolled. */
  factorId: string | null
}

/**
 * TOTP state for the current session.
 *
 * DECISIONS Q14 makes MFA required for role=administrator, enforced at login.
 * `getAuthenticatorAssuranceLevel` reads the level out of the access token, so
 * a client cannot claim aal2 it was not granted — the level is minted by the
 * auth server when a challenge is verified.
 */
export const getMfaState = cache(async (): Promise<MfaState> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { current: null, next: null, enrolled: false, factorId: null }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = factors?.totp?.find((f) => f.status === 'verified') ?? null

  return {
    current: (aal?.currentLevel as AalLevel | null) ?? null,
    next: (aal?.nextLevel as AalLevel | null) ?? null,
    enrolled: Boolean(verified),
    factorId: verified?.id ?? null,
  }
})

/**
 * Whether an administrator's session clears the MFA bar.
 *
 * Only the assurance level is read, not the factor list: aal2 is minted by the
 * auth server when a challenge is verified, so a session that carries it has by
 * definition enrolled and completed a factor. Listing factors as well would put
 * a second auth round-trip on every request an administrator makes and answer
 * nothing this does not already know.
 *
 * Callers that gate a write must use this — a layout redirect only protects the
 * screen, and a server action is reachable without ever rendering it.
 */
export const adminMfaSatisfied = cache(async (): Promise<boolean> => {
  const supabase = await createClient()
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return aal?.currentLevel === 'aal2'
})
