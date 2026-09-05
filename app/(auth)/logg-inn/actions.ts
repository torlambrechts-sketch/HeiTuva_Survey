'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const EmailOnly = z.object({ email: z.string().email() })

export type AuthState = { error?: string; sent?: boolean }

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = Credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  // Deliberately one generic message: distinguishing "no such user" from "wrong
  // password" tells an attacker which work emails exist.
  if (error) return { error: 'invalid' }

  redirect('/oversikt')
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = EmailOnly.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: 'invalid' }

  const origin = (await headers()).get('origin') ?? ''
  const supabase = await createClient()
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })
  // Always report success — a differing response would confirm which addresses
  // are registered.
  return { sent: true }
}

/**
 * "Logg inn med Entra ID". Supabase builds the authorisation URL; the browser is
 * sent there and comes back through /auth/callback with a PKCE code, the same
 * path an invite or a magic link takes. Only rendered when Auth reports the
 * provider as configured (lib/auth/entra.ts), so this cannot start a flow the
 * server will refuse.
 */
export async function signInWithEntra() {
  const origin = (await headers()).get('origin') ?? ''
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'openid profile email',
      redirectTo: `${origin}/auth/callback?neste=/oversikt`,
    },
  })
  if (error || !data.url) redirect('/logg-inn?feil=sso-start')
  redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/logg-inn')
}
