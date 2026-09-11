// Deliberately NOT `server-only`: the mail worker (scripts/mail-worker.ts) is a
// plain Node process, not a Next render, and `server-only` throws outside the
// bundler. Nothing here is safe-by-marker anyway — the guard that matters is
// that credentials are read from process.env at call time, so a client bundle
// that somehow imported this would hold no keys and send nothing.
import type { MailProvider } from './types'
import { brevoProvider } from './brevo'
import { sesProvider } from './ses'
import { smtpProvider } from './smtp'

export type { MailAddress, MailMessage, MailProvider, MailResult } from './types'
export { invitationMessage } from './copy'

/**
 * Which provider is in use, decided by configuration rather than by guessing
 * from NODE_ENV — a staging build is "production" to Node and must still be
 * able to point at a capture inbox.
 *
 * DEFAULTS TO BREVO, which supersedes DECISIONS Q6's Amazon SES. The SES
 * adapter is not deleted: the decision changed because of which account exists,
 * not because the implementation was wrong, and leaving it behind the seam
 * makes the choice reversible with one environment variable. Naming `ses`
 * explicitly is how you get it back.
 *
 * The default matters for the same reason it did before: a missing variable in
 * production must fail loudly with «brevo is not configured» rather than
 * silently posting invitations to a loopback port nobody is listening on.
 */
export function mailProvider(): MailProvider {
  const choice = process.env.MAIL_PROVIDER
  if (choice === 'smtp') return smtpProvider()
  if (choice === 'ses') return sesProvider()
  return brevoProvider()
}
