/**
 * The invitation's words — ONE definition, two runtimes.
 *
 * Split out of `index.ts` so the Deno Edge Function can import it without
 * importing `ses.ts` (which needs `node:crypto`) or `smtp.ts`. The alternative
 * was a second copy of this text inside `supabase/functions/`, and a second
 * copy of a CLAIM SET is how prose and product drift apart — this project has
 * twenty-one measured instances of that and no appetite for the twenty-second.
 *
 * This module must stay free of imports for that reason. If it ever needs one,
 * it needs to be one both runtimes have.
 */

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
    // THE ROUTE FOR A QUESTION, WHICH IS WHY THERE IS NO Reply-To.
    // HeiTuva does not run an inbox on the customer's behalf, and «do not reply»
    // is not an acceptable thing to say to someone who has just been promised
    // anonymity — it closes the only door at the moment they most want to check.
    // So the body points at the survey page, which explains how the answer is
    // handled and is part of the product rather than somebody's mailbox.
    no
      ? input.anonymous
        ? 'Lurer du på hvordan anonymiteten fungerer? Det står forklart på siden der du svarer.'
        : 'Lurer du på hvem som ser svaret ditt? Det står forklart på siden der du svarer.'
      : input.anonymous
        ? 'Wondering how the anonymity works? The page where you answer explains it.'
        : 'Wondering who sees your answer? The page where you answer explains it.',
    '',
    no
      ? 'Lenken er personlig — ikke del den videre.'
      : 'This link is personal — please do not forward it.',
  ].join('\n')

  return { subject, text }
}
