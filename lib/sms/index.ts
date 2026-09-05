// Not `server-only`, for the same reason `lib/mail/index.ts` is not: the worker
// is a plain Node process outside the bundler. Credentials are read from
// process.env at call time, never held in module scope.
import { captureProvider } from './capture'
import { linkMobilityProvider } from './link-mobility'
import type { SmsProvider } from './types'

export type { SmsMessage, SmsProvider, SmsResult } from './types'

/** Decided by configuration, not by NODE_ENV — see `mailProvider`. Defaults to
 *  the real gateway so a missing variable in production fails loudly. */
export function smsProvider(): SmsProvider {
  return process.env.SMS_PROVIDER === 'capture' ? captureProvider() : linkMobilityProvider()
}

/**
 * The text itself — the design's own template (HeiTuva.dc.html:1814):
 *
 *   Hei! {orgName} spør: «{title}» — 2 minutter, {anonymt|med navn}. {link}
 *
 * One segment where it can be. A 64-hex token makes the link ~90 characters,
 * so the whole message is trimmed to fit 160 GSM-7 characters with the link
 * intact: the title is what gives, never the link and never the anonymity
 * promise, because a respondent must be able to open it and must know what
 * they are opening.
 */
export function invitationSms(input: {
  orgName: string
  surveyTitle: string
  lang: string
  url: string
  anonymous: boolean
}) {
  const no = input.lang !== 'en'
  const promise = no
    ? input.anonymous ? 'anonymt' : 'med navn'
    : input.anonymous ? 'anonymous' : 'with your name'
  const build = (title: string) =>
    no
      ? `Hei! ${input.orgName} spør: «${title}» — 2 minutter, ${promise}. ${input.url}`
      : `Hi! ${input.orgName} asks: “${title}” — 2 minutes, ${promise}. ${input.url}`

  let title = input.surveyTitle
  let text = build(title)
  // Trim the title until it fits; a title cut to three characters plus an
  // ellipsis is still an invitation, a link cut to nothing is not.
  while (text.length > 160 && title.length > 4) {
    title = title.slice(0, -2).trimEnd() + '…'
    text = build(title)
  }
  return text
}
