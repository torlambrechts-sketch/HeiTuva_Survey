'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { clientKey, rateLimited } from '@/lib/ratelimit'
import { createClient } from '@/lib/supabase/server'
import { verifyTurnstile } from '@/lib/turnstile'

/**
 * The splash's two write paths: create an account, and ask for a walkthrough.
 *
 * Both are reachable without a session — this is the one public surface in the
 * product that creates rows — so both are narrower than their signed-in
 * equivalents and both answer identically whatever happened. See DECISIONS Q5
 * (amended): rate limiting and Turnstile on this endpoint are launch blockers,
 * not Phase 6 polish, precisely because it is public.
 */
export type SplashState = {
  error?: 'invalid' | 'weak' | 'freemail' | 'failed' | 'too_many' | 'robot'
  sent?: boolean
}

/** Sign-ups and demo requests per IP per hour. Generous for a person, tight for a script. */
const SIGNUPS_PER_HOUR = 5
const DEMOS_PER_HOUR = 5

/**
 * The two controls every public action runs first, in this order: the limiter
 * is free and answers before the network is touched; Turnstile is a round trip
 * to Cloudflare and only worth making for a caller still inside their budget.
 */
async function guard(formData: FormData, limit: number, scope: string): Promise<SplashState | null> {
  const h = await headers()
  const ip = clientKey(h.get('x-forwarded-for'))
  if (rateLimited(`${scope}:${ip}`, limit)) return { error: 'too_many' }
  if (!(await verifyTurnstile(formData.get('cf-turnstile-response'), ip))) return { error: 'robot' }
  return null
}

/**
 * A work e-mail is the product's unit of identity — an organisation's members
 * are its colleagues — so the free-mail domains are refused with their own
 * message rather than accepted into an org of one.
 */
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
])

const SignUp = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(254),
  // Supabase's own floor is 6. The design's placeholder says "Minst 10 tegn",
  // and the design is the promise the user was shown, so 10 it is.
  password: z.string().min(10).max(200),
})

export async function signUpFromSplash(
  _prev: SplashState,
  formData: FormData,
): Promise<SplashState> {
  const refused = await guard(formData, SIGNUPS_PER_HOUR, 'signup')
  if (refused) return refused

  const parsed = SignUp.safeParse({
    name: formData.get('name'),
    company: formData.get('company'),
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path[0] === 'password')
    return { error: weak ? 'weak' : 'invalid' }
  }

  const domain = parsed.data.email.split('@')[1] ?? ''
  if (FREEMAIL.has(domain)) return { error: 'freemail' }

  const origin = (await headers()).get('origin') ?? ''
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      /*
        Carried on the user, not written to a table: there is no organisation
        yet and no session to scope one to, so a row here would be an
        unauthenticated write to tenant data. `/kom-i-gang` reads these back
        after confirmation to prefill the org it creates — which is also why
        this action does NOT create the org itself: an unconfirmed e-mail must
        not be able to occupy a company name.
      */
      data: { full_name: parsed.data.name, company_name: parsed.data.company },
    },
  })
  if (error) {
    // Never distinguish "already registered" from anything else: on a public
    // endpoint that is an account-existence oracle for any work address.
    console.error(`splash signUp failed: ${error.message}`)
    return { sent: true }
  }

  // Supabase returns success for an existing address too, with no session, when
  // confirmations are on. Reporting `sent` for every outcome keeps that true.
  return { sent: true }
}

const Demo = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(254),
})

/**
 * "Få en gjennomgang på 20 minutter" and the two paid plans' CTAs.
 *
 * There is no billing engine (DECISIONS Q10), so every paid path is a
 * conversation. The request is stored as a `demo_requests` row through a
 * SECURITY DEFINER RPC — the table has no anon insert policy, because a public
 * INSERT policy on a tenant-adjacent table is a spam sink with an RLS blessing.
 */
export async function requestDemo(_prev: SplashState, formData: FormData): Promise<SplashState> {
  const refused = await guard(formData, DEMOS_PER_HOUR, 'demo')
  if (refused) return refused

  const parsed = Demo.safeParse({
    name: formData.get('name'),
    company: formData.get('company'),
    email: formData.get('email'),
  })
  if (!parsed.success) return { error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('request_demo', {
    p_name: parsed.data.name,
    p_company: parsed.data.company,
    p_email: parsed.data.email,
    p_plan: String(formData.get('plan') ?? '').slice(0, 40) || undefined,
  })
  if (error) {
    console.error(`demo request failed: ${error.message}`)
    return { error: 'failed' }
  }
  return { sent: true }
}
