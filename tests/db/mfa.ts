import { readFile } from 'node:fs/promises'
import { TOTP, Secret } from 'otpauth'
import type { PersonaName } from './personas'

/**
 * TOTP secrets for the seeded personas, written by scripts/seed-mfa.ts.
 *
 * DECISIONS Q14 makes MFA mandatory for administrators, so without this the
 * browser harness cannot reach a single administrator screen. The file is
 * gitignored and only ever holds local-stack throwaway factors.
 */
export const MFA_SECRETS_FILE = '.mfa-secrets.json'

export type MfaSecrets = Partial<Record<PersonaName, string>>

export async function readMfaSecrets(): Promise<MfaSecrets> {
  const raw = await readFile(MFA_SECRETS_FILE, 'utf8').catch(() => null)
  if (!raw) return {}
  return JSON.parse(raw) as MfaSecrets
}

/** Current 6-digit code for a base32 secret, using the TOTP defaults Supabase
 *  enrols with (SHA-1, 6 digits, 30s). */
export function totpCode(secret: string): string {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate()
}

const lastIssued = new Map<string, string>()

/**
 * A TOTP code that has not been used yet for this secret.
 *
 * Supabase rejects a code it has already accepted, so two sign-ins inside the
 * same 30-second window would send the same digits and the second would be
 * refused — which is exactly what happened: one capture signed in fine and the
 * next sat on /sikkerhet until it timed out. Waiting for the window to roll is
 * the only way to get a code the server will take.
 */
export async function freshTotpCode(secret: string): Promise<string> {
  let code = totpCode(secret)
  while (lastIssued.get(secret) === code) {
    const secondsIntoWindow = Math.floor(Date.now() / 1000) % 30
    await new Promise((r) => setTimeout(r, (31 - secondsIntoWindow) * 1000))
    code = totpCode(secret)
  }
  lastIssued.set(secret, code)
  return code
}

/**
 * Turns DECISIONS Q14 on or off for the duration of a test.
 *
 * The requirement is a feature flag now (`admin_mfa`, docs/DEVIATIONS.md D27)
 * and its seeded default is OFF, so a suite that wants to prove the gate still
 * works has to switch it on for itself. Without this the gate would quietly
 * stop being tested the moment it was suspended — the failure mode of every
 * flagged-off invariant.
 *
 * Safe only because playwright.config.ts pins `workers: 1` and
 * `fullyParallel: false`: the row is global, so a parallel run would flip the
 * requirement underneath an unrelated test.
 */
export async function setAdminMfaRequired(enabled: boolean): Promise<void> {
  const { serviceClient } = await import('./clients')
  const { error } = await serviceClient()
    .from('feature_flags')
    .upsert({ key: 'admin_mfa', org_id: null, enabled }, { onConflict: 'key,org_id' })
  if (error) throw new Error(`could not set admin_mfa=${enabled}: ${error.message}`)
}

/**
 * Removes every TOTP factor the persona has, so a test that pins the
 * *not-enrolled* screen actually gets it.
 *
 * /sikkerhet renders `enrollTitle` when the user has no factor and
 * `verifyTitle` when they have one, so the screen the pixel baseline holds
 * depends on state that other runs create: signing in as an administrator with
 * `admin_mfa` on enrols a factor, and it outlives the test that made it. The
 * baseline then failed against a screen that was correct — the suite was
 * asserting against whatever the previous run had left behind.
 */
export async function clearMfaFactors(email: string): Promise<void> {
  const { serviceClient } = await import('./clients')
  const svc = serviceClient()
  const { data: users, error } = await svc.auth.admin.listUsers()
  if (error) throw new Error(`could not list users: ${error.message}`)
  const user = users.users.find((u) => u.email === email)
  if (!user) throw new Error(`no user ${email}`)
  const { data, error: listError } = await svc.auth.admin.mfa.listFactors({ userId: user.id })
  if (listError) throw new Error(`could not list factors: ${listError.message}`)
  for (const f of data?.factors ?? []) {
    const { error: delError } = await svc.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id })
    if (delError) throw new Error(`could not delete factor ${f.id}: ${delError.message}`)
  }
}
