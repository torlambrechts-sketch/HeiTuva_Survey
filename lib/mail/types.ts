/**
 * The mail provider seam.
 *
 * CLAUDE.md fixes the provider (Amazon SES, eu-north-1, DECISIONS Q6) but not
 * the coupling: everything that sends mail talks to this interface, so the
 * local stack can use Mailpit, CI can assert on a captured outbox, and swapping
 * SES for anything else is one file rather than a search across the app.
 */
export type MailAddress = { email: string; name?: string | null }

export type MailMessage = {
  to: MailAddress
  subject: string
  /** Plain text is required; HTML is optional and must degrade to it. */
  text: string
  html?: string
  /**
   * Deduplication key. Sends are retried on failure, so a provider or a worker
   * restart must not mean two invitations to the same person — the plan calls
   * for invitation-scoped idempotency and this is where it is carried.
   */
  idempotencyKey: string
}

export type MailResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean }

export interface MailProvider {
  readonly name: string
  send(message: MailMessage): Promise<MailResult>
}
