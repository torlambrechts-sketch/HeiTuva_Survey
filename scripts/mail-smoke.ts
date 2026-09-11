/**
 * Proves the mail provider can deliver — WITHOUT SPENDING THE QUEUE.
 *
 *   npx tsx scripts/mail-smoke.ts --to you@example.com [--local]
 *
 * Why this exists as a separate instrument. The obvious way to test a new
 * provider is to run the worker and see what arrives, and that would deliver
 * the invitations already sitting on `mail_outbox` — real messages to real
 * people, spent on a test. This sends ONE message of its own, reads the queue
 * depth before and after through the read-only RPC, and prints both so the
 * claim «the test did not consume anything» is a measurement rather than an
 * assurance.
 *
 * WHAT IT DOES NOT PROVE. The token in the link is a placeholder, so the link
 * will not open a survey — this proves the provider, the sender identity, the
 * address and the rendered copy. The end-to-end proof with a working link is
 * the queue's own messages arriving, which is a separate step and is the point
 * of not spending them here.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { invitationMessage, mailProvider } from '../lib/mail'
import { LOCAL_SUPABASE } from './verify/local-env'

const args = process.argv.slice(2)
const useLocal = args.includes('--local')
const toArg = args[args.indexOf('--to') + 1]
if (!args.includes('--to') || !toArg || toArg.startsWith('--')) {
  console.error('usage: tsx scripts/mail-smoke.ts --to <address> [--local]')
  process.exit(2)
}
// Narrowed after the guard: `process.exit` is not a return as far as the
// checker is concerned, so the guard alone leaves `toArg` possibly undefined.
const to: string = toArg
if (!useLocal) config({ path: '.env.local' })

const url = useLocal ? LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
const key = useLocal
  ? LOCAL_SUPABASE.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (useLocal ? 'http://127.0.0.1:3100' : '')

type Depth = { queued: number; archived: number; invisible: number; max_read_ct: number }

async function depth(): Promise<Depth | null> {
  if (!url || !key) return null
  const svc = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await svc.rpc('mail_outbox_depth')
  if (error) {
    console.error(`  (queue depth unavailable: ${error.message})`)
    return null
  }
  return data as Depth
}

const show = (label: string, d: Depth | null) =>
  console.log(
    d
      ? `  ${label.padEnd(6)} queued=${d.queued} archived=${d.archived} ` +
        `invisible=${d.invisible} max_read_ct=${d.max_read_ct}`
      : `  ${label.padEnd(6)} (not read)`,
  )

async function main() {
  const provider = mailProvider()
  console.log(`mail smoke: provider=${provider.name} target=${useLocal ? 'local' : 'prod'}`)

  // Same order as the worker, for the same reason: a deployment gap is a
  // property of the deployment, so it is found before anything is touched.
  const gap = provider.configured()
  if (gap) {
    console.error(`refusing to send: ${gap}`)
    process.exit(1)
  }

  const before = await depth()
  show('before', before)

  const { subject, text } = invitationMessage({
    orgName: 'HeiTuva',
    surveyTitle: 'Leveransetest',
    name: null,
    lang: 'no',
    // A PLACEHOLDER, deliberately. Minting a real token would create a real
    // invitation, which is a row in someone's round and a credential in an
    // inbox — for a test that only needs to prove the provider.
    url: `${appUrl}/s/ugyldig-token-leveransetest`,
    anonymous: true,
  })

  const result = await provider.send({
    to: { email: to },
    subject,
    text,
    idempotencyKey: `smoke:${new Date().toISOString()}`,
  })

  if (!result.ok) {
    console.error(`FAILED: ${result.error} (retryable=${result.retryable})`)
    const afterFail = await depth()
    show('after', afterFail)
    process.exit(1)
  }
  console.log(`  sent to ${to} — provider id ${result.id}`)

  const after = await depth()
  show('after', after)

  if (before && after) {
    const untouched =
      before.queued === after.queued &&
      before.archived === after.archived &&
      before.max_read_ct === after.max_read_ct
    console.log(
      untouched
        ? '  QUEUE UNTOUCHED: nothing was leased, delivered or archived by this test.'
        : '  WARNING: the queue moved during this test — investigate before draining.',
    )
    if (!untouched) process.exit(1)
  }
  console.log('  NOTE: the link in this message is a placeholder and will not open a survey.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
