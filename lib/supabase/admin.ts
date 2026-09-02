import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * SERVICE ROLE — bypasses every RLS policy, including the k-anonymity gate.
 *
 * The `server-only` import above makes importing this from a client component a
 * build error. Do not remove it. Use this ONLY where a request legitimately has
 * no user context (org creation at signup, queue workers, cron routes), and
 * never to read `responses` or `answers` on behalf of a signed-in user — those
 * go through the SECURITY DEFINER RPCs so k>=5 is enforced in the database.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
