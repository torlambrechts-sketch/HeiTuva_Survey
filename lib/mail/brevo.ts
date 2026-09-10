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
  /*
    TRIMMED, because a pasted secret carries whitespace far more often than
    anyone expects — a trailing newline from a copy, a leading space from a
    double-click selection. Brevo answers such a key with a bare 401, which is
    indistinguishable from a key that was never valid, and an operator then goes
    looking for the wrong problem. Trimming costs nothing and removes the
    commonest cause of the least informative error.
  */
  const apiKey = readEnv('BREVO_API_KEY')?.trim()
  const from = readEnv('MAIL_FROM')?.trim()
  const fromName = readEnv('MAIL_FROM_NAME')?.trim() || 'HeiTuva'

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
          ══ THE FIRST QUESTION IS NOT «WILL A RETRY HELP» ══════════════════

          It is: IS THIS FAILURE ABOUT THIS MESSAGE, OR ABOUT THE DEPLOYMENT?

          `retryable: false` does not mean «retrying is pointless». It means
          «archive this invitation permanently» — the worker acts on it by
          destroying a real message. So the classification is a statement about
          WHOSE FAULT the failure is, and the retry question is downstream of it
          and misleading on its own.

          A rejected API key is the case that proves the difference. Retrying it
          will not help, which makes «permanent» the obvious reading and the
          obvious reading catastrophic: the fault is in the DEPLOYMENT, the
          message is blameless, and archiving it destroys someone's invitation
          for a reason that has nothing to do with them. Fix the key and the
          same message would have sent perfectly.

          THE SHAPE TO WATCH FOR IS A PER-MESSAGE STATUS CODE CARRYING A
          DEPLOYMENT FAULT. HTTP gives one number per request, so a provider
          reports «your credential is wrong» through the same channel it uses
          for «that address does not exist». The transport flattens two
          different kinds of fault into one integer, and reading it as a
          property of the message is how a whole queue gets dead-lettered by a
          rotated key.

          `configured()` cannot catch this: the variable IS set, it is merely
          wrong — which is why the check that runs before the queue is read is
          necessary and not sufficient.

          So, by fault rather than by hope:

            401, 403  — OURS. The credential is rejected. Retryable, and the
                        message waits for a deploy that fixes it.
            429, 5xx  — OURS or the provider's, never the message's. Retryable.
            400       — THE MESSAGE'S. Brevo names an address it cannot use, and
                        no deploy changes that. The only class archived.

          This is not hypothetical: prod returned 401 on both queued invitations
          on the first run that got past the origin check, and `left: 2` rather
          than `archived: 2` is the whole of the difference. DECISIONS Q6b.

          ── AND THE STATUS ALONE IS NOT ACTIONABLE ─────────────────────────

          `brevo 401` cannot distinguish «not a transactional API key» from
          «revoked» from «trailing newline on the paste» — three different fixes
          behind one number. Brevo says which in the response body
          (`{code, message}`), so the body is read and included. The KEY is
          never included, and the request body is never echoed: it carries a
          respondent's invitation token.
        */
        const detail = await res
          .json()
          .then((j: unknown) => {
            const o = (j ?? {}) as { code?: string; message?: string }
            return [o.code, o.message].filter(Boolean).join(': ').slice(0, 200)
          })
          .catch(() => '')

        const retryable =
          res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403
        return {
          ok: false,
          error: detail ? `brevo ${res.status} — ${detail}` : `brevo ${res.status}`,
          retryable,
        }
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

/**
 * Is the API key accepted, asked WITHOUT spending an invitation.
 *
 * `configured()` answers «is a key present», which is a different question from
 * «is the key any good» — and prod proved the gap between them: all three
 * secrets were set, the worker drained, and Brevo returned 401 twice. Finding
 * that out by attempting a real send costs a `read_ct` on a real message, and
 * `MAX_ATTEMPTS` is five, so five diagnostic attempts DEAD-LETTER the very
 * invitations being debugged.
 *
 * `GET /v3/account` validates the credential and sends nothing. It is not part
 * of the `MailProvider` interface deliberately: it is Brevo's endpoint, not a
 * property every provider has, and widening the seam so one implementation can
 * be diagnosed would oblige the other three to invent an answer.
 */
export async function brevoAccountProbe(): Promise<{
  ok: boolean
  status: number
  detail: string
}> {
  const apiKey = readEnv('BREVO_API_KEY')?.trim()
  if (!apiKey) return { ok: false, status: 0, detail: 'BREVO_API_KEY not set' }
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    })
    const body = (await res.json().catch(() => ({}))) as {
      code?: string
      message?: string
      email?: string
    }
    const detail = res.ok
      ? `account ${body.email ?? 'ok'}`
      : [body.code, body.message].filter(Boolean).join(': ').slice(0, 200)
    return { ok: res.ok, status: res.status, detail }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      detail: `request failed (${e instanceof Error ? e.name : 'unknown'})`,
    }
  }
}
