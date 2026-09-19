import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Local `supabase start` defaults. These are the published demo keys — they
 *  are not secrets and only ever reach a throwaway container. */
export const LOCAL_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export function admin(): SupabaseClient {
  return createClient(LOCAL_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

export function anon(): SupabaseClient {
  return createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } })
}

/** A client carrying a real user JWT, so RLS and auth.uid() behave exactly as
 *  they will in the app. Nothing here uses the service role. */
export async function asUser(email: string, password = 'test-password-123!'): Promise<{
  client: SupabaseClient
  userId: string
}> {
  const a = admin()
  const created = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (created.error) throw new Error(`createUser(${email}): ${created.error.message}`)
  const userId = created.data.user!.id

  const client = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } })
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw new Error(`signIn(${email}): ${signedIn.error.message}`)
  return { client, userId }
}

export const uniq = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * N10.2 — THE TEARDOWN EVERY INVARIANT FIXTURE WAS MISSING.
 *
 * Eight of the ten files under `tests/invariants/` created organisations and
 * dropped none of them (D262). One full suite run left 18 behind; the table
 * stood at 218 rows where a bare reset plus `seed:demo` gives 200.
 *
 * **It READS its own error and throws.** A teardown whose rejection nobody
 * reads is a leak that reports success, which is how twelve `Redaktør-utkast`
 * drafts accumulated in the demo organisation unseen — and `dropOrg`'s own
 * comment records the same lesson from the other side: «the error was swallowed
 * here, and that is how the seed spent weeks claiming to be idempotent».
 *
 * Deleting the organisation cascades to everything org-scoped under it. What it
 * does NOT remove is the `auth.users` row and its `profiles` row, which are
 * global — that is D241's writer, and it is why `tests/db/factories.ts` only
 * ever sets `display_name` on CREATION.
 */
export async function dropOrgsById(...ids: (string | null | undefined)[]): Promise<void> {
  const wanted = ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (wanted.length === 0) return
  const { error } = await admin().from('organizations').delete().in('id', wanted)
  if (error) throw new Error(`dropOrgsById(${wanted.join(', ')}): ${error.message}`)
}
