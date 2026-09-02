'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type MfaResult = { ok: false; error: 'invalid_code' | 'failed' }

const Code = z.string().trim().regex(/^\d{6}$/)
const FactorId = z.string().uuid()

/**
 * Completes a TOTP challenge and raises the session to aal2.
 *
 * The code is never compared here — it goes to the auth server, which mints a
 * new access token carrying `aal2`. That is what makes the gate real: an
 * attacker cannot hand themselves the level by editing a cookie, because the
 * level is a signed claim.
 */
export async function verifyTotp(_prev: MfaResult | null, formData: FormData): Promise<MfaResult> {
  const code = Code.safeParse(formData.get('code'))
  const factorId = FactorId.safeParse(formData.get('factorId'))
  if (!code.success || !factorId.success) return { ok: false, error: 'invalid_code' }

  const supabase = await createClient()
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factorId.data,
  })
  if (challengeError || !challenge) {
    console.error(`mfa.challenge failed: ${challengeError?.message}`)
    return { ok: false, error: 'failed' }
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: factorId.data,
    challengeId: challenge.id,
    code: code.data,
  })
  // A wrong code and an expired challenge are the same thing to the user: try
  // again. Nothing here distinguishes them in the response.
  if (error) return { ok: false, error: 'invalid_code' }

  revalidatePath('/', 'layout')
  redirect('/')
}

export type EnrollState =
  | { ok: true; factorId: string; qr: string; secret: string }
  | { ok: false; error: 'failed' | 'unavailable' }

/**
 * Starts TOTP enrolment and returns the QR plus the shared secret.
 *
 * Any earlier unverified factor is removed first. Supabase never hands the
 * secret back a second time, so a half-finished enrolment is unrecoverable and
 * would otherwise sit there consuming one of the account's factor slots until
 * enrolment stopped working entirely.
 */
export async function beginEnrollment(): Promise<EnrollState> {
  const supabase = await createClient()

  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const factor of factors?.all ?? []) {
    if (factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `heituva-${Date.now()}`,
  })
  if (error || !data) {
    console.error(`mfa.enroll failed: ${error?.message}`)
    // GoTrue answers 422 when TOTP enrolment is switched off for the project.
    // That is a deployment problem, not something the user can retry past.
    const unavailable = error?.status === 422
    return { ok: false, error: unavailable ? 'unavailable' : 'failed' }
  }

  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}
