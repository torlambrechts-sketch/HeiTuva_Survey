import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEMO_PASSWORD, PERSONAS, type PersonaName } from './personas'

/**
 * ── THE STANDING QUESTION FOR EVERY DENIAL TEST ─────────────────────────────
 *
 *   What ELSE could refuse this before the check I am testing gets a chance?
 *
 * Twice in two phases the answer was "something", and both times the test
 * believed it was exercising the last control when an earlier one had already
 * ended the request:
 *
 *   V1-1  A guard test for `threshold_admin_only` ran as a redaktør on a survey
 *         RLS would not show them. `surveys_upd` filtered the row, the update
 *         matched nothing, PostgREST returned NO error — and the assertion was
 *         simply wrong about which control had acted. Written the other way
 *         round it would have passed with the guard deleted.
 *
 *   V1-2  A Q30 test used a `ledere_eget_team` share with no group. Such a
 *         share is refused outright at `M:0034:255`, so the payload was
 *         `{error:forbidden}` and the assertion ran against a document with no
 *         sections at all.
 *
 * Two of two says the answer is rarely nothing. The layers in this schema
 * stack: auth → RLS → a guard trigger → a CHECK → the function's own rule, and
 * a fixture that trips an early one never reaches the late one. So arrange the
 * fixture so ONLY the rule under test can produce the result, and where both
 * layers matter, write two tests — one proving the outer control acts (and
 * that zero rows is not a denial, Gate 2b), one removing it so the inner one
 * has to.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export type Client = SupabaseClient<Database>

/**
 * No session at all — the respondent surface and any unauthenticated probe.
 * A fresh instance per call so one test cannot leak a session into another.
 */
export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
}

/**
 * SERVICE ROLE — bypasses every RLS policy and the k-anonymity gate.
 *
 * Use this ONLY to arrange fixtures. Asserting an access rule with this client
 * proves nothing: it would pass whether or not the policy exists. Every
 * assertion about who can see what must go through a persona client below.
 */
export function serviceClient(): Client {
  return createClient<Database>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

/**
 * A real signed-in session for a seeded persona — a genuine JWT, so RLS and
 * auth.uid() behave exactly as they do for a real user in the browser.
 */
export async function personaClient(persona: PersonaName): Promise<Client> {
  const { email } = PERSONAS[persona]
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) {
    throw new Error(
      `personaClient(${persona}) could not sign in as ${email}: ${error.message}. ` +
        `Run "npm run seed:demo" against the local stack first.`,
    )
  }
  return client
}

export const adminClient = () => personaClient('administrator')
export const redaktorClient = () => personaClient('redaktor')
export const leserClient = () => personaClient('leser')
export const outsiderClient = () => personaClient('outsider')
