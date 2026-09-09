import type { SmsMessage, SmsProvider, SmsResult } from './types'

/**
 * LINK Mobility's SMS gateway (DECISIONS Q6), Nordic region.
 *
 * One JSON POST with HTTP basic auth — no SDK, for the reason `ses.ts` gives:
 * a single call is not worth a dependency to keep patched. Credentials are read
 * at call time from process.env and never at import, so a bundle that somehow
 * pulled this in would hold no keys.
 *
 * Unconfigured is reported as a gap through `configured()`, and the worker
 * refuses to run rather than draining. It used to be reported per message and
 * non-retryably, on the reasoning that "a queue that never drains" is worse —
 * right about retrying, wrong about the alternative: the worker archives every
 * non-retryable failure, so the first run of a never-configured worker
 * dead-lettered the whole queue. A deployment gap is a startup condition, and
 * `send()` now reports it retryably so a message can never be spent on one.
 */
export function linkMobilityProvider(): SmsProvider {
  const user = process.env.LINK_MOBILITY_USER
  const password = process.env.LINK_MOBILITY_PASSWORD
  const platformId = process.env.LINK_MOBILITY_PLATFORM_ID
  const partnerId = process.env.LINK_MOBILITY_PARTNER_ID
  const sender = process.env.SMS_SENDER ?? 'HeiTuva'
  const endpoint = process.env.LINK_MOBILITY_URL ?? 'https://n-eu.linkmobility.io/sms/send'

  // A plain function, not a method: see `lib/mail/ses.ts`.
  function gap(): string | null {
    const missing = [
      user ? null : 'LINK_MOBILITY_USER',
      password ? null : 'LINK_MOBILITY_PASSWORD',
      platformId ? null : 'LINK_MOBILITY_PLATFORM_ID',
      partnerId ? null : 'LINK_MOBILITY_PARTNER_ID',
    ].filter((v): v is string => v !== null)
    return missing.length ? `link mobility is not configured: ${missing.join(', ')} not set` : null
  }

  return {
    name: 'link-mobility',
    configured: gap,
    async send(message: SmsMessage): Promise<SmsResult> {
      if (!user || !password || !platformId || !partnerId) {
        return { ok: false, error: gap() ?? 'link mobility is not configured', retryable: true }
      }

      const body = JSON.stringify({
        source: sender,
        sourceTON: 'ALPHANUMERIC',
        destination: message.to,
        userData: message.text,
        platformId,
        platformPartnerId: partnerId,
        // The gateway de-duplicates on this within its window, which is what
        // makes a worker restart mid-batch safe.
        refId: message.idempotencyKey,
      })

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
          },
          body,
        })
        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as { messageId?: string }
          return { ok: true, id: json.messageId ?? message.idempotencyKey }
        }
        // Same split as mail: 4xx will fail identically next time, 5xx and
        // throttling are worth backing off for.
        return {
          ok: false,
          error: `link mobility ${res.status}`,
          retryable: res.status >= 500 || res.status === 429,
        }
      } catch (e) {
        // No message body in the error: it would quote the request, and the
        // request contains the respondent's link.
        return {
          ok: false,
          error: `link mobility request failed (${e instanceof Error ? e.name : 'unknown'})`,
          retryable: true,
        }
      }
    },
  }
}
