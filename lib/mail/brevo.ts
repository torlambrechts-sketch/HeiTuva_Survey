import { readEnv } from './env'
import type { MailMessage, MailProvider, MailResult } from './types'

/**
 * Brevo transactional email — the provider HeiTuva actually sends through.
 *
 * DECISIONS Q6 named Amazon SES and `lib/mail/ses.ts` implements it; that
 * decision is superseded rather than deleted, and the SES adapter stays working
 * behind the same seam so the choice is reversible with one environment
 * variable. What changed is not the architecture — it is which account exists.
 *
 * One POST, no SDK, for the reason ses.ts gives: a single API call does not earn
 * a dependency tree that has to be kept patched.
 *
 * ── NO Reply-To, DELIBERATELY (level 1) ───────────────────────────────────
 *
 * `replyTo` is not set and must not be added here. HeiTuva does not operate an
 * email address on the customer's behalf, and an invitation that invites a
 * reply is a promise that somebody reads it. The alternative usually reached
 * for — «do not reply to this message» — is NOT acceptable on an anonymous
 * survey: a respondent who has just been told their answer is anonymous and
 * then told not to ask questions has been given a dead end at exactly the
 * moment they most need a way to check. So the BODY carries the route instead:
 * it points at the survey page, which explains anonymity and belongs to the
 * product. Anything that does arrive at the sending address gets a standard
 * reply pointing back into the product; that is an inbox rule, not a feature,
 * and nothing here should imply a conversation.
 */
const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export function brevoProvider(): MailProvider {
  const apiKey = readEnv('BREVO_API_KEY')
  const from = readEnv('MAIL_FROM')
  const fromName = readEnv('MAIL_FROM_NAME') ?? 'HeiTuva'

  /**
   * Every variable that is missing, so one deploy fixes all of them.
   *
   * A plain function rather than a method: `send` is routinely read off the
   * provider value, and a `this.configured()` breaks exactly there — the test
   * that found that does precisely this.
   */
  function gap(): string | null {
    const missing = [
      apiKey ? null : 'BREVO_API_KEY',
      from ? null : 'MAIL_FROM',
    ].filter((v): v is string => v !== null)
    return missing.length ? `brevo is not configured: ${missing.join(', ')} not set` : null
  }

  return {
    name: 'brevo',
    configured: gap,
    async send(message: MailMessage): Promise<MailResult> {
      if (!apiKey || !from) {
        // Retryable, for S1's reason: the worker refuses to drain while
        // `configured()` is non-null, so reaching here at all means that guard
        // was bypassed — and a permanent failure would archive a real
        // invitation, which is the one outcome a deployment gap must never
        // produce.
        return { ok: false, error: gap() ?? 'brevo is not configured', retryable: true }
      }

      const body = JSON.stringify({
        sender: { email: from, name: fromName },
        to: [{ email: message.to.email, ...(message.to.name ? { name: message.to.name } : {}) }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
        // Carried for traceability in Brevo's log, NOT as a deduplication
        // guarantee — see the note on retries below.
        headers: { 'X-HeiTuva-Key': message.idempotencyKey },
      })

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body,
        })

        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as { messageId?: string }
          return { ok: true, id: json.messageId ?? message.idempotencyKey }
        }

        /*
          WHICH FAILURES ARE THE MESSAGE'S FAULT, AND WHICH ARE OURS.

          `retryable: false` means «archive this invitation permanently», so the
          question is not «will a retry work» but «is this message the problem».

          401 and 403 ARE RETRYABLE HERE, and that is the whole S1 lesson
          arriving in a new construct. A rejected or revoked API key is a
          DEPLOYMENT GAP wearing a per-message status code: classify it as
          permanent and a rotated key silently dead-letters every invitation in
          the queue, which is exactly the failure `configured()` was added to
          prevent — except `configured()` cannot see it, because the variable IS
          set, it is merely wrong. 429 and 5xx are the ordinary backoff cases.

          What is left — a 400 naming an unusable address — is the only class
          that is genuinely about this message, and the only one archived.
        */
        const retryable =
          res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403
        return { ok: false, error: `brevo ${res.status}`, retryable }
      } catch (e) {
        // Network failures are always worth another attempt. The thrown value is
        // not included: it can quote the request, and the request body carries a
        // respondent's invitation token.
        return {
          ok: false,
          error: `brevo request failed (${e instanceof Error ? e.name : 'unknown'})`,
          retryable: true,
        }
      }
    },
  }
}
