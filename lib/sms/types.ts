/**
 * The SMS provider seam — the same shape as `lib/mail/types.ts`, for the same
 * reason: everything that sends a text talks to this interface, so the local
 * stack can capture to a file, the verifier can read what was "sent", and the
 * gateway can be swapped in one file.
 */
export type SmsMessage = {
  /** E.164, already normalised by `app.normalize_phone`. */
  to: string
  text: string
  /** Invitation-scoped, like mail: a retry must be the same message. */
  idempotencyKey: string
}

export type SmsResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean }

export interface SmsProvider {
  readonly name: string
  send(message: SmsMessage): Promise<SmsResult>
}
