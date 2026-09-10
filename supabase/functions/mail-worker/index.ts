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
import { brevoProvider } from '../../../lib/mail/brevo.ts'
import { invitationMessage } from '../../../lib/mail/copy.ts'

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
 * Only the service role may drain the queue.
 *
 * Supabase verifies the JWT's SIGNATURE before this function runs, which is not
 * the same question: the anon key is a valid signed JWT and it is public. So the
 * ROLE is checked here. The payload is read without verifying — the platform has
 * already done that, and re-doing it would need the JWT secret in a second place.
 */
function isServiceRole(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const payload = token.split('.')[1]
  if (!payload) return false
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')),
    ) as { role?: string }
    return json.role === 'service_role'
  } catch {
    return false
  }
}

async function drain(): Promise<{ sent: number; left: number; archived: number }> {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''
  const svc = createClient(url, key, { auth: { persistSession: false } })
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
  if (!isServiceRole(req)) {
    return new Response(JSON.stringify({ error: 'service role required' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }

  /*
    BEFORE THE QUEUE IS READ, NEVER PER MESSAGE.

    Every non-retryable failure above is archived, and an unconfigured provider
    used to report exactly that — so the first run of a worker whose provider had
    never been set up would dead-letter the entire queue, including the
    invitations it was meant to deliver. A deployment gap is a property of the
    DEPLOYMENT: nothing is read, nothing is leased, nothing is spent.
  */
  const gap = brevoProvider().configured()
  if (gap) {
    console.error(`refusing to drain: ${gap}`)
    return new Response(JSON.stringify({ error: gap, drained: false }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const result = await drain()
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
