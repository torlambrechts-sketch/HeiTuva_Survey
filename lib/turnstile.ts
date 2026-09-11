import 'server-only'

/**
 * Cloudflare Turnstile, server side (DECISIONS Q5 amended — a launch blocker
 * for the public sign-up, and the abuse control on `request_demo`, which is
 * `anon`-callable and WRITES).
 */

/**
 * THREE STATES, NOT TWO, AND THE THIRD IS THE ONE THAT BITES.
 *
 * This used to be `turnstileConfigured(): boolean` — an AND over the two
 * variables — and `verifyTurnstile` passed everything through whenever it was
 * false. That is right for two of the three cases and catastrophic for the
 * third:
 *
 *   absent      neither key set. Local and CI: there is no widget to solve, so
 *               the check passes. Deliberate.
 *   configured  both set. Enforced.
 *   partial     EXACTLY ONE set. Under the old boolean this collapsed into
 *               `absent` and every request was waved through — while
 *               `NEXT_PUBLIC_TURNSTILE_SITE_KEY` alone is enough to RENDER
 *               Cloudflare's widget on the splash. A visible control that
 *               enforces nothing: the reviewer's eye confirms exactly the thing
 *               the code is not doing, which is the shape D115 names — a revoke
 *               that grants nothing, an allowlist reason true of one clause.
 *
 * **A partial configuration is a misconfiguration, never an absent one**, so it
 * refuses. That is loud in both directions — secret-only means no widget and no
 * token, site-key-only means a solved widget rejected — and loud is the point:
 * the failure mode this replaces was silent on a live origin.
 *
 * Stated as the property rather than as the two variable names, because the
 * enumeration is what went wrong here: `Boolean(A && B)` is a correct sentence
 * about A and B and says nothing about A-without-B.
 */
export type TurnstileState = 'absent' | 'partial' | 'configured'

export function turnstileState(): TurnstileState {
  const secret = Boolean(process.env.TURNSTILE_SECRET_KEY)
  const site = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  if (secret && site) return 'configured'
  return secret || site ? 'partial' : 'absent'
}

/** Kept for callers that only need the yes/no; `turnstileState()` is the truth. */
export function turnstileConfigured(): boolean {
  return turnstileState() === 'configured'
}

export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const state = turnstileState()
  if (state === 'absent') return true
  if (state === 'partial') {
    // Named, not swallowed. Which half is missing is the whole of the fix, and
    // the value of neither variable is logged.
    console.error(
      'turnstile is half-configured: ' +
        `${process.env.TURNSTILE_SECRET_KEY ? 'NEXT_PUBLIC_TURNSTILE_SITE_KEY' : 'TURNSTILE_SECRET_KEY'}` +
        ' is missing. Refusing rather than passing through.',
    )
    return false
  }
  if (typeof token !== 'string' || !token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    })
    const json = (await res.json()) as { success?: boolean }
    return json.success === true
  } catch {
    // Cloudflare unreachable is "not verified": failing open here would make
    // the control disappear exactly when someone is hammering the endpoint.
    return false
  }
}
