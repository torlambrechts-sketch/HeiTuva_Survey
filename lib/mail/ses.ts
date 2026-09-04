import { createHash, createHmac } from 'node:crypto'
import type { MailMessage, MailProvider, MailResult } from './types'

/**
 * Amazon SES v2, eu-north-1 (DECISIONS Q6), signed by hand.
 *
 * No AWS SDK: this makes exactly one API call, and SigV4 for a single POST is
 * ~40 lines against ~15MB of dependency and a much larger surface to keep
 * patched. The signing below is the standard four-step derivation; if it ever
 * needs a second call, that is the moment to reconsider, not before.
 */
const REGION = process.env.AWS_SES_REGION ?? 'eu-north-1'
const SERVICE = 'ses'

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}
const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex')

function signingKey(secret: string, date: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), REGION), SERVICE), 'aws4_request')
}

export function sesProvider(): MailProvider {
  const accessKey = process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY
  const from = process.env.MAIL_FROM
  const host = `email.${REGION}.amazonaws.com`
  const path = '/v2/email/outbound-emails'

  return {
    name: 'ses',
    async send(message: MailMessage): Promise<MailResult> {
      if (!accessKey || !secretKey || !from) {
        return { ok: false, error: 'ses is not configured', retryable: false }
      }

      const body = JSON.stringify({
        FromEmailAddress: from,
        Destination: { ToAddresses: [message.to.email] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: message.text, Charset: 'UTF-8' },
              ...(message.html
                ? { Html: { Data: message.html, Charset: 'UTF-8' } }
                : {}),
            },
          },
        },
      })

      const now = new Date()
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
      const date = amzDate.slice(0, 8)

      const canonicalHeaders =
        `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`
      const signedHeaders = 'content-type;host;x-amz-date'
      const canonicalRequest = [
        'POST',
        path,
        '',
        canonicalHeaders,
        signedHeaders,
        sha256(body),
      ].join('\n')

      const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
      const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')
      const signature = createHmac('sha256', signingKey(secretKey, date))
        .update(toSign, 'utf8')
        .digest('hex')

      try {
        const res = await fetch(`https://${host}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-amz-date': amzDate,
            authorization:
              `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
              `SignedHeaders=${signedHeaders}, Signature=${signature}`,
          },
          body,
        })

        if (res.ok) {
          const json = (await res.json()) as { MessageId?: string }
          return { ok: true, id: json.MessageId ?? message.idempotencyKey }
        }

        // 4xx is our fault and will fail identically on every retry; 5xx and
        // throttling are worth backing off for. Getting this wrong in the
        // permissive direction means a queue that spins forever on a malformed
        // address.
        const retryable = res.status >= 500 || res.status === 429
        return { ok: false, error: `ses ${res.status}`, retryable }
      } catch (e) {
        // Network-level failures are always worth another attempt. The message
        // is not included: it can quote the request, and the request contains
        // a respondent's invitation token.
        return {
          ok: false,
          error: `ses request failed (${e instanceof Error ? e.name : 'unknown'})`,
          retryable: true,
        }
      }
    },
  }
}
