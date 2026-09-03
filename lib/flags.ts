import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Feature flags are data (CLAUDE.md, data-not-code): rows in `feature_flags`,
 * not constants. A row with `org_id` NULL is the global default; a row for an
 * org overrides it.
 */
export type FlagKey =
  | 'sms_channel'
  | 'entra_sync'
  | 'google_sync'
  | 'hr_sync'
  | 'ai_insights'
  | 'ai_translate'
  | 'pptx_export'
  | 'stripe_billing'
  | 'admin_mfa'

/**
 * Read through the anon client so RLS applies: `flags_sel` exposes the global
 * rows to everyone and an org's rows only to its members, so a caller can never
 * see another tenant's overrides.
 *
 * `fallback` is what an unreadable flag resolves to, and it is not always
 * `false`. For flags that gate optional capability, OFF is the safe answer. For
 * `admin_mfa` it is the opposite: OFF means "MFA not required", so a failed read
 * must resolve to ON or a database hiccup would silently drop a security gate.
 * Callers state the safe direction rather than inheriting a default that is only
 * right most of the time.
 */
export const isFlagEnabled = cache(
  async (key: FlagKey, orgId?: string, fallback = false): Promise<boolean> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('feature_flags')
      .select('org_id, enabled')
      .eq('key', key)
      .or(orgId ? `org_id.is.null,org_id.eq.${orgId}` : 'org_id.is.null')

    if (error) {
      console.error(`feature_flags read failed for ${key}: ${error.message}`)
      return fallback
    }

    // The org row wins over the global default when both are present.
    const rows = data ?? []
    const scoped = orgId ? rows.find((r) => r.org_id === orgId) : undefined
    const row = scoped ?? rows.find((r) => r.org_id === null)

    // A key with no row at all is not the same as a row set to false: it means
    // the flag was never seeded, which is a deployment gap, so answer with the
    // caller's safe direction rather than assuming OFF.
    return row ? row.enabled : fallback
  },
)
