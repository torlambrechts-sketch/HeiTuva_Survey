// Deliberately NOT `server-only`: the mail worker (scripts/mail-worker.ts) is a
// plain Node process, not a Next render, and `server-only` throws outside the
// bundler. Nothing here is safe-by-marker anyway — the guard that matters is
// that credentials are read from process.env at call time, so a client bundle
// that somehow imported this would hold no keys and send nothing.
import type { MailProvider } from './types'
import { sesProvider } from './ses'
import { smtpProvider } from './smtp'

export type { MailAddress, MailMessage, MailProvider, MailResult } from './types'

/**
 * Which provider is in use, decided by configuration rather than by guessing
 * from NODE_ENV — a staging build is "production" to Node and must still be
 * able to point at a capture inbox.
 *
 * Defaults to SES so that a missing variable in production fails loudly with
 * "ses is not configured" rather than silently posting invitations to a
 * loopback port nobody is listening on.
 */
export function mailProvider(): MailProvider {
  return process.env.MAIL_PROVIDER === 'smtp' ? smtpProvider() : sesProvider()
}

/**
 * The invitation itself.
 *
 * Copy lives here rather than in `ui_messages` because it is not UI: it is sent
 * once, from a worker, with no request and no locale context to read from. The
 * respondent's own language is on the invitation row and passed in.
 */
export function invitationMessage(input: {
  orgName: string
  surveyTitle: string
  name?: string | null
  lang: string
  url: string
  anonymous: boolean
}) {
  const no = input.lang !== 'en'
  const greeting = input.name ? (no ? `Hei ${input.name}!` : `Hi ${input.name}!`) : no ? 'Hei!' : 'Hi!'
  const promise = no
    ? input.anonymous
      ? 'Svaret ditt er anonymt — arbeidsgiver ser bare summerte tall.'
      : 'Svaret ditt vises med navnet ditt.'
    : input.anonymous
      ? 'Your answer is anonymous — your employer only sees totals.'
      : 'Your answer is shown with your name.'

  const subject = no
    ? `${input.orgName} spør: ${input.surveyTitle}`
    : `${input.orgName} asks: ${input.surveyTitle}`

  const text = [
    greeting,
    '',
    no
      ? `${input.orgName} vil gjerne høre fra deg. Det tar rundt 90 sekunder.`
      : `${input.orgName} would like to hear from you. It takes about 90 seconds.`,
    '',
    input.url,
    '',
    promise,
    '',
    no
      ? 'Lenken er personlig — ikke del den videre.'
      : 'This link is personal — please do not forward it.',
  ].join('\n')

  return { subject, text }
}
