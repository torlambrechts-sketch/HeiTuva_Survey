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
