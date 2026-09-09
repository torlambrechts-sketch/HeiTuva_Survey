import { appendFile } from 'node:fs/promises'
import type { SmsMessage, SmsProvider, SmsResult } from './types'

/**
 * The local stack's "gateway": one JSON line per message, appended to a file.
 *
 * Mail has Mailpit to catch what the worker sends; SMS has no equivalent
 * container, and inventing one for a verifier would be infrastructure for a
 * test's convenience. A file the verifier reads back is the smallest thing that
 * proves the same chain — queue → worker → provider → the text a phone would
 * show, with the link in it.
 *
 * Refuses to run without an explicit path. Defaulting to a location would let a
 * misconfigured production worker "send" every invitation into a file nobody
 * reads and report success.
 */
export function captureProvider(): SmsProvider {
  const path = process.env.SMS_CAPTURE_FILE

  // A plain function, not a method: see `lib/mail/ses.ts`.
  function gap(): string | null {
    return path ? null : 'SMS_CAPTURE_FILE is not set'
  }

  return {
    name: 'capture',
    configured: gap,
    async send(message: SmsMessage): Promise<SmsResult> {
      if (!path) {
        return { ok: false, error: gap() ?? 'SMS_CAPTURE_FILE is not set', retryable: true }
      }
      await appendFile(
        path,
        JSON.stringify({ to: message.to, text: message.text, key: message.idempotencyKey }) + '\n',
      )
      return { ok: true, id: message.idempotencyKey }
    },
  }
}
