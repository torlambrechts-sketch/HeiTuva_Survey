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
