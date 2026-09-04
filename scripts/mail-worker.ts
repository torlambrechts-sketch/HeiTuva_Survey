/**
 * Drains the `mail_outbox` queue and sends the invitations.
 *
 * Runs as a worker rather than inside the request that pressed "Send
 * undersøkelsen", because a send of 400 people cannot be the tail of an HTTP
 * response: the plan is explicit that every send goes through a queue and is
 * retried, since a recurring survey that silently fails to send is a compliance
 * product killing its own value proposition.
 *
 * Delivery semantics: pgmq `read` leases a message with a visibility timeout,
 * so a crash mid-send makes it visible again rather than losing it. That is
 * at-least-once, which is why every message carries an idempotency key derived
 * from the invitation rather than from the attempt.
 *
 *   npx tsx scripts/mail-worker.ts --local [--once]
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { invitationMessage, mailProvider } from '../lib/mail'
import { LOCAL_SUPABASE } from './verify/local-env'

const useLocal = process.argv.includes('--local')
const once = process.argv.includes('--once')
if (!useLocal) config({ path: '.env.local' })

const url = useLocal ? LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
const key = useLocal
  ? LOCAL_SUPABASE.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (useLocal ? 'http://127.0.0.1:3100' : '')

if (!url || !key) {
  console.error('Missing Supabase URL or service-role key.')
  process.exit(1)
}

/** How long a leased message stays invisible while we try to send it. */
const VISIBILITY_SECONDS = 60
const BATCH = 10
/** Give up after this many attempts and leave it for the dead-letter sweep. */
const MAX_ATTEMPTS = 5

type Job = {
  kind: 'invitation' | 'test' | 'reminder'
  round_id: string
  survey_id: string
  org_id: string
  email: string
  name?: string | null
  lang: string
  token: string
  survey_title: string
}

const svc = createClient(url, key, { auth: { persistSession: false } })
const provider = mailProvider()

async function drain(): Promise<number> {
  const { data, error } = await svc.rpc('mail_outbox_read', {
    p_batch: BATCH,
    p_visibility: VISIBILITY_SECONDS,
  })
  if (error) {
    console.error(`queue read failed: ${error.message}`)
    return 0
  }

  const messages = (data ?? []) as { msg_id: number; read_ct: number; message: Job }[]
  if (!messages.length) return 0

  // Org names are per-message but repeat across a whole send, so they are
  // fetched once rather than per recipient.
  const orgIds = [...new Set(messages.map((m) => m.message.org_id))]
  const { data: orgs } = await svc.from('organizations').select('id, name').in('id', orgIds)
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]))

  const anonIds = [...new Set(messages.map((m) => m.message.survey_id))]
  const { data: surveys } = await svc.from('surveys').select('id, anonymity').in('id', anonIds)
  const anonymity = new Map((surveys ?? []).map((s) => [s.id, s.anonymity]))

  let sent = 0
  for (const m of messages) {
    const job = m.message

    if (m.read_ct > MAX_ATTEMPTS) {
      // Archived, not deleted: a message that could never be delivered is
      // evidence, and pgmq's archive is where it stays readable.
      await svc.rpc('mail_outbox_archive', { p_msg_id: m.msg_id })
      console.error(`  dead-lettered msg ${m.msg_id} after ${m.read_ct} attempts`)
      continue
    }

    const { subject, text } = invitationMessage({
      orgName: orgName.get(job.org_id) ?? 'HeiTuva',
      surveyTitle: job.survey_title,
      name: job.name,
      lang: job.lang,
      url: `${appUrl}/s/${job.token}`,
      anonymous: anonymity.get(job.survey_id) !== 'named',
    })

    const result = await provider.send({
      to: { email: job.email, name: job.name },
      subject,
      text,
      // Derived from the invitation, not the attempt: a retry after a crash
      // must be the same message to the provider, not a second one.
      idempotencyKey: `${job.round_id}:${job.email}`,
    })

    if (result.ok) {
      await svc
        .from('survey_invitations')
        .update({ sent_at: new Date().toISOString() })
        .eq('round_id', job.round_id)
        .eq('email', job.email)
      await svc.rpc('mail_outbox_delete', { p_msg_id: m.msg_id })
      sent++
      // The address is logged, the token is not — the token is the credential.
      console.log(`  sent ${job.kind} -> ${job.email}`)
    } else if (result.retryable) {
      // Left on the queue: the visibility timeout returns it by itself.
      console.error(`  retrying msg ${m.msg_id}: ${result.error}`)
    } else {
      await svc.rpc('mail_outbox_archive', { p_msg_id: m.msg_id })
      console.error(`  permanent failure, archived msg ${m.msg_id}: ${result.error}`)
    }
  }
  return sent
}

async function main() {
  console.log(`mail worker: provider=${provider.name} target=${useLocal ? 'local' : 'prod'}`)
  if (once) {
    const n = await drain()
    console.log(`drained ${n} message(s)`)
    return
  }
  for (;;) {
    const n = await drain()
    if (n === 0) await new Promise((r) => setTimeout(r, 5000))
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
