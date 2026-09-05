import 'server-only'

/**
 * Cloudflare Turnstile, server side (DECISIONS Q5 amended — a launch blocker
 * for the public sign-up).
 *
 * Present only when both keys are configured. Without `TURNSTILE_SECRET_KEY`
 * the check passes — which is right for the local stack and CI, where there
 * is no widget to solve, and is why docs/OPERATIONS.md lists the keys' presence
 * on Vercel as part of the pre-launch gate rather than trusting this default.
 */
export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}

export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  if (!turnstileConfigured()) return true
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
