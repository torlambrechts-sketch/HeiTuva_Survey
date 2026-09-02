/**
 * Enrols TOTP for the seeded personas that hold role=administrator, and writes
 * their secrets to .mfa-secrets.json for the browser harness.
 *
 * DECISIONS Q14 requires MFA for administrators, so after `npm run seed:demo`
 * every administrator screen is unreachable until this has run. Local stack
 * only — the secrets are throwaway and the file is gitignored.
 */
import { writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { ANON_KEY, SUPABASE_URL } from '../tests/db/clients'
import { DEMO_PASSWORD, PERSONAS, type PersonaName } from '../tests/db/personas'
import { MFA_SECRETS_FILE, totpCode, type MfaSecrets } from '../tests/db/mfa'

if (!process.argv.includes('--local')) config({ path: '.env.local' })

const ADMINS = (Object.keys(PERSONAS) as PersonaName[]).filter(
  (p) => PERSONAS[p].role === 'administrator',
)

/** A TOTP code is only valid inside its 30s window. Enrolment right at a
 *  boundary would verify a code the server has already rolled past, so wait for
 *  a fresh window when we are close to the edge. */
async function waitForFreshWindow() {
  const secondsIntoWindow = Math.floor(Date.now() / 1000) % 30
  if (secondsIntoWindow < 27) return
  await new Promise((r) => setTimeout(r, (31 - secondsIntoWindow) * 1000))
}

async function main() {
  const secrets: MfaSecrets = {}

  for (const persona of ADMINS) {
    const { email } = PERSONAS[persona]
    const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    })
    if (signInError) throw new Error(`${persona}: sign-in failed: ${signInError.message}`)

    // Start from a clean slate: an existing factor's secret is not retrievable,
    // so a factor we cannot generate codes for is worse than none.
    const { data: existing } = await supabase.auth.mfa.listFactors()
    for (const factor of existing?.all ?? []) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }

    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `harness-${Date.now()}`,
    })
    if (enrollError || !enrolled) {
      throw new Error(
        `${persona}: enrol failed: ${enrollError?.message}. ` +
          'Is [auth.mfa.totp] enroll_enabled/verify_enabled true in supabase/config.toml, ' +
          'and has the stack been restarted since?',
      )
    }

    await waitForFreshWindow()
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrolled.id,
    })
    if (challengeError || !challenge) {
      throw new Error(`${persona}: challenge failed: ${challengeError?.message}`)
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrolled.id,
      challengeId: challenge.id,
      code: totpCode(enrolled.totp.secret),
    })
    if (verifyError) throw new Error(`${persona}: verify failed: ${verifyError.message}`)

    secrets[persona] = enrolled.totp.secret
    console.log(`  ${persona}: TOTP enrolled`)
  }

  await writeFile(MFA_SECRETS_FILE, `${JSON.stringify(secrets, null, 2)}\n`)
  console.log(`wrote ${MFA_SECRETS_FILE} for ${ADMINS.length} administrator persona(s)`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
