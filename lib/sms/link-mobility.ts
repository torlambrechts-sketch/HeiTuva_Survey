import type { SmsMessage, SmsProvider, SmsResult } from './types'

/**
 * LINK Mobility's SMS gateway (DECISIONS Q6), Nordic region.
 *
 * One JSON POST with HTTP basic auth — no SDK, for the reason `ses.ts` gives:
 * a single call is not worth a dependency to keep patched. Credentials are read
 * at call time from process.env and never at import, so a bundle that somehow
 * pulled this in would hold no keys.
 *
 * Unconfigured means "not configured", loudly and non-retryably: an SMS the
 * queue keeps retrying against a gateway that was never set up is a queue that
 * never drains, and the failure is a deployment gap, not a transient.
 */
export function linkMobilityProvider(): SmsProvider {
  const user = process.env.LINK_MOBILITY_USER
  const password = process.env.LINK_MOBILITY_PASSWORD
  const platformId = process.env.LINK_MOBILITY_PLATFORM_ID
  const partnerId = process.env.LINK_MOBILITY_PARTNER_ID
  const sender = process.env.SMS_SENDER ?? 'HeiTuva'
  const endpoint = process.env.LINK_MOBILITY_URL ?? 'https://n-eu.linkmobility.io/sms/send'

  return {
    name: 'link-mobility',
    async send(message: SmsMessage): Promise<SmsResult> {
      if (!user || !password || !platformId || !partnerId) {
        return { ok: false, error: 'link mobility is not configured', retryable: false }
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
