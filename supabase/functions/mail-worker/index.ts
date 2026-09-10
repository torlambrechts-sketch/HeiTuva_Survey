// Supabase Edge Function — drains `mail_outbox` and sends the invitations.
//
// This is the PRODUCTION worker. `scripts/mail-worker.ts` is the same logic
// under Node, kept for local proving against Mailpit; both import the provider
// from `lib/mail/brevo.ts` and the words from `lib/mail/copy.ts`, so there is
// one definition of each and no second copy to drift.
//
// Invoked by pg_cron through pg_net (see the migration that schedules it).
//
// Delivery semantics are pgmq's: `read` leases with a visibility timeout, so a
// crash mid-send makes the message visible again rather than losing it. That is
// AT-LEAST-once — see the note on `sent_at` at the mark below.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { brevoAccountProbe, brevoProvider } from '../../../lib/mail/brevo.ts'
import { invitationMessage } from '../../../lib/mail/copy.ts'
import { readEnv } from '../../../lib/mail/env.ts'

const VISIBILITY_SECONDS = 60
const BATCH = 10
const MAX_ATTEMPTS = 5

type Job = {
  kind: 'invitation' | 'test' | 'reminder'
  channel?: 'email' | 'sms'
  round_id: string
  survey_id: string
  org_id: string
  email?: string | null
  phone?: string | null
  name?: string | null
  lang: string
  token: string
  survey_title: string
}

/**
 * WHO MAY DRAIN THE QUEUE.
 *
 * The first version of this required a `service_role` JWT. That is simple and
 * it is wrong, because it means the SERVICE-ROLE KEY has to be stored in the
 * database for pg_cron to present it — a credential whose leak is total
 * database compromise, spent on authorising «run the mail worker». Least
 * privilege says the cron→function credential should authorise exactly that
 * and nothing else.
 *
 * So: a dedicated secret, compared against `vault.decrypted_secrets`. Three
 * properties worth stating, because they are why this shape was chosen:
 *
 *  - IT IS GENERATED INSIDE POSTGRES (`gen_random_bytes`) and read from Vault
 *    by both ends. It is never in git, never in an environment variable, never
 *    in a chat message, and no human or agent has ever seen its value.
 *  - Losing it costs a queue drain, not the database.
 *  - The comparison is constant-time. CLAUDE.md invariant 5 requires that of
 *    tokens, and this is one; a length-then-XOR compare is four lines and
 *    removes the timing signal that `===` on strings would leak.
 *
 * `verify_jwt` is therefore FALSE on this function: the platform's check
 * verifies that a JWT is signed, and the anon key is both a validly signed JWT
 * and public, so it authenticates nothing here. The function does its own.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  // Length is not secret — a wrong length is a wrong secret — but the loop must
  // not exit early on the first differing byte.
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!
  return diff === 0
}

async function callerIsAuthorised(
  req: Request,
  svc: { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> },
): Promise<boolean> {
  const presented = req.headers.get('x-worker-secret')
  if (!presented) return false
  const { data, error } = await svc.rpc('mail_worker_secret')
  if (error || typeof data !== 'string' || data.length === 0) {
    // NAMED, not swallowed: «the secret row is missing» must not read the same
    // as «the caller is wrong». One is a setup step nobody did; the other is an
    // intrusion attempt, and they need different reactions from whoever reads
    // these logs.
    console.error('cannot authorise: mail_worker_secret is unreadable or unset')
    return false
  }
  return constantTimeEqual(presented, data)
}

/**
 * The Supabase client, untyped on purpose.
 *
 * Generated database types are not available inside the Edge Runtime bundle,
 * and hand-writing the chained builder types this function uses would be ten
 * lines of fiction. One named alias with one pragma, rather than a pragma
 * floating above a signature — which is where it was, until the signature
 * became multi-line and the disable silently attached to the wrong line.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any

async function drain(
  svc: ServiceClient,
  appUrl: string,
): Promise<{ sent: number; left: number; archived: number }> {
  const provider = brevoProvider()

  const { data, error } = await svc.rpc('mail_outbox_read', {
    p_batch: BATCH,
    p_visibility: VISIBILITY_SECONDS,
  })
  if (error) throw new Error(`queue read failed: ${error.message}`)

  const messages = (data ?? []) as { msg_id: number; read_ct: number; message: Job }[]
  if (!messages.length) return { sent: 0, left: 0, archived: 0 }

  const orgIds = [...new Set(messages.map((m) => m.message.org_id))]
  const { data: orgs } = await svc.from('organizations').select('id, name').in('id', orgIds)
  const orgName = new Map(
    ((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name] as const),
  )

  const surveyIds = [...new Set(messages.map((m) => m.message.survey_id))]
  const { data: surveys } = await svc.from('surveys').select('id, anonymity').in('id', surveyIds)
  const anonymity = new Map(
    ((surveys ?? []) as { id: string; anonymity: string }[]).map((s) => [s.id, s.anonymity] as const),
  )

  let sent = 0
  let left = 0
  let archived = 0

  for (const m of messages) {
    const job = m.message

    if (m.read_ct > MAX_ATTEMPTS) {
      await svc.rpc('mail_outbox_archive', { p_msg_id: m.msg_id })
      archived++
      console.error(`dead-lettered msg ${m.msg_id} after ${m.read_ct} attempts`)
      continue
    }

    // Absent means email — jobs queued before M:0027 carry no channel. Anything
    // ELSE is malformed and is archived rather than guessed at; a two-branch
    // ternary here is what once delivered an unknown channel AS EMAIL.
    const channel = job.channel ?? 'email'

    if (channel === 'sms') {
      // NO SMS GATEWAY IN THIS FUNCTION, and the message is left on the queue
      // rather than archived. An unavailable channel is a deployment gap, not a
      // property of this message — archiving it would destroy a real invitation
      // for a reason that has nothing to do with it. MAX_ATTEMPTS still bounds
      // it, so it cannot spin forever, and email in the same batch is
      // unaffected: one channel's gap must not stop the other.
      left++
      console.error(`leaving msg ${m.msg_id} queued: no sms gateway in the edge worker`)
      continue
    }
    if (channel !== 'email') {
      await svc.rpc('mail_outbox_archive', { p_msg_id: m.msg_id })
      archived++
      console.error(`archived msg ${m.msg_id}: unknown channel «${String(channel)}»`)
      continue
    }
    if (!job.email) {
      await svc.rpc('mail_outbox_archive', { p_msg_id: m.msg_id })
      archived++
      console.error(`archived msg ${m.msg_id}: email job without an address`)
      continue
    }

    const link = `${appUrl}/s/${job.token}`
    const anonymous = anonymity.get(job.survey_id) !== 'named'
    const org = orgName.get(job.org_id) ?? 'HeiTuva'
    const { subject, text } = invitationMessage({
      orgName: org,
      surveyTitle: job.survey_title,
      name: job.name,
      lang: job.lang,
      url: link,
      anonymous,
    })

    const result = await provider.send({
      to: { email: job.email, name: job.name },
      subject,
      text,
      // Derived from the invitation, not the attempt: a retry after a crash must
      // be the same message to the provider, not a second one.
      idempotencyKey: `${job.round_id}:${job.email}`,
    })

    if (result.ok) {
      /*
        `sent_at` MEANS «ACCEPTED BY BREVO», NOT «DELIVERED».

        Written from our own successful API call because this account has no
        Transactional → Webhooks section, so there is no delivered event to
        write it from. The difference is real and is not assumed away: Brevo
        accepting a message says the request was well-formed and queued at the
        provider. It does not say the recipient's server took it, and a message
        can still bounce afterwards — with nothing here to hear about it.

        The column's comment says the same thing, in the database, where the next
        reader of the column will be.
      */
      await svc
        .from('survey_invitations')
        .update({ sent_at: new Date().toISOString() })
        .eq('round_id', job.round_id)
        .eq('email', job.email)
      await svc.rpc('mail_outbox_delete', { p_msg_id: m.msg_id })
      sent++
      // The address is logged, the token is not — the token is the credential.
      console.log(`sent ${job.kind} -> ${job.email}`)
    } else if (result.retryable) {
      left++
      console.error(`retrying msg ${m.msg_id}: ${result.error}`)
    } else {
      await svc.rpc('mail_outbox_archive', { p_msg_id: m.msg_id })
      archived++
      console.error(`permanent failure, archived msg ${m.msg_id}: ${result.error}`)
    }
  }

  return { sent, left, archived }
}

Deno.serve(async (req: Request) => {
  const svcUrl = Deno.env.get('SUPABASE_URL')!
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const svc = createClient(svcUrl, svcKey, { auth: { persistSession: false } })

  if (!(await callerIsAuthorised(req, svc))) {
    return new Response(JSON.stringify({ error: 'unauthorised' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }

  /*
    ?probe=1 — IS THE CREDENTIAL ANY GOOD, ASKED WITHOUT SPENDING A MESSAGE.

    Added because prod taught the difference between «a key is set» and «a key
    works»: all three secrets were present, the worker drained, and Brevo
    answered 401 on both queued invitations. Diagnosing that by attempting real
    sends costs a `read_ct` each time and MAX_ATTEMPTS is five — so five
    diagnostic runs would dead-letter the two messages being diagnosed. This
    path validates the key against Brevo's own account endpoint and touches
    neither the queue nor an invitation.

    Behind the same authentication as the drain: the response distinguishes
    failure modes of our credential, which is not something to answer for an
    unauthenticated caller.
  */
  if (new URL(req.url).searchParams.get('probe')) {
    const probe = await brevoAccountProbe()
    return new Response(JSON.stringify({ probe }), {
      status: probe.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    })
  }

  /*
    BEFORE THE QUEUE IS READ, NEVER PER MESSAGE.

    Every non-retryable failure in `drain` is archived, and an unconfigured
    provider used to report exactly that — so the first run of a worker whose
    provider had never been set up would dead-letter the entire queue, including
    the invitations it was meant to deliver. A deployment gap is a property of
    the DEPLOYMENT: nothing is read, nothing is leased, nothing is spent.

    `BREVO_API_KEY`, `MAIL_FROM` and `MAIL_FROM_NAME` come from this function's
    own environment, which is where Supabase injects Edge Function secrets.

    NEXT_PUBLIC_APP_URL IS PART OF THE SAME QUESTION, and it was not, which was
    a defect. It defaulted to `''`, so a deployment that had the mail
    credentials but not the origin would send a real invitation whose only link
    is a relative `/s/<token>` — dead in every mail client. That is a message
    SPENT: deleted from the queue, `sent_at` written, the recipient holding
    something useless and no record that anything was wrong. A provider gap
    stops the run; an origin gap has to stop it for exactly the same reason, and
    «the link is the entire purpose of the message» is the reason.

    Enumerated as the three things a delivered invitation needs — a provider, a
    sender, an origin — rather than as «the provider is configured».
  */
  const appUrl = readEnv('NEXT_PUBLIC_APP_URL')
  const gap =
    brevoProvider().configured() ??
    (appUrl && /^https?:\/\//.test(appUrl)
      ? null
      : `NEXT_PUBLIC_APP_URL is ${appUrl ? 'not an absolute URL' : 'not set'}; ` +
        `an invitation whose link is relative is a spent message with a dead link`)
  if (gap) {
    console.error(`refusing to drain: ${gap}`)
    return new Response(JSON.stringify({ error: gap, drained: false }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const result = await drain(svc, appUrl!)
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    // Named, not swallowed: a queue read that fails must be visible in the
    // function's logs and in the cron row, not reported as a quiet success.
    const name = e instanceof Error ? e.message : 'unknown'
    console.error(`drain failed: ${name}`)
    return new Response(JSON.stringify({ ok: false, error: name }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
})
