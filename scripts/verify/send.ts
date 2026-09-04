/**
 * Phase 3 — the send pipeline, driven end to end.
 *
 * Send screen -> send_round -> pgmq -> mail worker -> Mailpit -> the invitation
 * link actually opens the survey. Every hop is a place the token could be lost,
 * duplicated or leaked, so the assertions are about what each hop produced,
 * not about whether the button was clickable.
 */
import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import { execFileSync, spawnSync } from 'node:child_process'
import { BASE_URL, ensureServer } from './server'
import { LOCAL_SUPABASE } from './local-env'
import { signIn } from '../../tests/helpers/session'
import { serviceClient } from '../../tests/db/clients'

config({ path: '.env.local', quiet: true })

const MAILPIT = 'http://127.0.0.1:54324'
let failures = 0
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(54)} ${detail.slice(0, 88)}`)
}

async function main() {
  // Re-seed first. This gate SENDS the seeded draft, which flips it to `aktiv`
  // and consumes it — so a second run in a row has nothing to send, and a run
  // that follows any other verifier inherits whatever that one left behind.
  // Re-seeding is what makes "one round was opened" a statement about this run.
  if (process.argv.includes('--local')) {
    // Pin the child to the local stack explicitly. This script loads
    // `.env.local` unconditionally, so the child would otherwise inherit the
    // PRODUCTION url from this process's env and the seed's own guard would
    // refuse it — which it did, correctly.
    execFileSync('npx', ['tsx', 'scripts/seed-demo.ts', '--local'], {
      stdio: 'inherit',
      env: { ...process.env, ...LOCAL_SUPABASE },
    })
  }

  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()

  try {
    // The NEWEST matching draft, not the only one.
    //
    // `maybeSingle()` errors on more than one row, and this gate re-seeds when
    // it finds the fixture missing — so a second run created a second
    // "Utkast uten svar" and then reported "no seeded draft to send" while two
    // sat in the table. The failure said the fixture was absent when the
    // problem was that it was duplicated.
    const { data: drafts } = await svc
      .from('surveys')
      .select('id, title')
      .eq('status', 'utkast')
      .eq('title', 'Utkast uten svar')
      .order('created_at', { ascending: false })
      .limit(1)
    const draft = drafts?.[0]
    if (!draft) throw new Error('no seeded draft to send')

    const before = await svc.from('survey_rounds').select('id').eq('survey_id', draft.id)
    const roundsBefore = before.data?.length ?? 0

    // Mailpit keeps its inbox across runs, so "2 messages arrived" was really
    // "2 messages have ever arrived" and grew by two every time. Purge first:
    // the assertion is about what THIS run delivered.
    await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})

    // And the queue behind it, for the same reason and one step earlier: pgmq
    // survives a reseed, so anything an earlier run enqueued and never drained
    // gets delivered by THIS run's worker and counted as this run's mail. That
    // is what turned "2 invitations arrived" into six. Archive rather than
    // delete, so a stuck message is still inspectable afterwards.
    for (;;) {
      const { data: stale } = await svc.rpc('mail_outbox_read', { p_batch: 100, p_visibility: 0 })
      const rows = (stale ?? []) as { msg_id: number }[]
      if (!rows.length) break
      for (const r of rows) await svc.rpc('mail_outbox_archive', { p_msg_id: r.msg_id })
    }

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
    const page = await ctx.newPage()
    await signIn(page, 'administrator', BASE_URL)
    await page.goto(`${BASE_URL}/undersokelser/${draft.id}/send`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')

    check('the send screen renders', (await page.locator('h2').first().innerText()) === 'Slik når den fram', 'Slik når den fram')

    // --- import a pasted list through the real UI --------------------------
    await page.getByRole('button', { name: 'Importer mottakere' }).click()
    await page.getByRole('button', { name: /Lim inn liste/ }).click()
    await page
      .getByLabel('Lim inn liste', { exact: true })
      .fill('e-post,navn\nsend-a@example.test,Alfa\nsend-b@example.test,Beta\nikke-en-epost,Feil')
    const summary = await page.locator('text=/rad(er)? klar/').first().innerText()
    check('the import summary counts rows and rejects', /2 rader klare · 1 hoppet over/.test(summary), summary)

    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await page.waitForTimeout(200)
    const chips = await page.locator('text=send-a@example.test').count()
    check('imported recipients become chips', chips > 0, `${chips} chip(s)`)

    // --- add the shareable link channel and send ---------------------------
    await page.getByRole('button', { name: /Delbar lenke/ }).first().click()
    await page.getByRole('button', { name: 'Send undersøkelsen' }).click()
    await page.locator('h1', { hasText: /Sendt til/ }).waitFor({ timeout: 30_000 })
    const sentHeading = await page.locator('h1').first().innerText()
    check('the send confirmation reports a count', /Sendt til 2 personer/.test(sentHeading), sentHeading)

    // --- what the RPC wrote ------------------------------------------------
    const { data: rounds } = await svc
      .from('survey_rounds')
      .select('id, round_no, status, question_snapshot, closes_at')
      .eq('survey_id', draft.id)
      .order('round_no', { ascending: false })
    check('exactly one new round', (rounds?.length ?? 0) === roundsBefore + 1, `${rounds?.length} round(s)`)

    const round = rounds?.[0]
    check(
      'the round froze a question snapshot',
      Array.isArray(round?.question_snapshot) && round!.question_snapshot.length > 0,
      `${(round?.question_snapshot as unknown[])?.length ?? 0} question(s)`,
    )
    check('the round has a closing date', Boolean(round?.closes_at), round?.closes_at ?? 'null')

    const { data: invitations } = await svc
      .from('survey_invitations')
      .select('email, name, token_hash, sent_at')
      .eq('round_id', round!.id)
      .order('email')
    check('one invitation per recipient', (invitations?.length ?? 0) === 2, `${invitations?.length}`)
    check(
      'tokens are stored hashed, never in the clear',
      (invitations ?? []).length > 0 &&
        (invitations ?? []).every((i) => /^[0-9a-f]{64}$/.test(i.token_hash)),
      invitations?.[0]?.token_hash.slice(0, 16) + '…',
    )

    const { data: links } = await svc.from('share_links').select('token_hash, active').eq('round_id', round!.id)
    check('the shareable link exists and is active', (links?.length ?? 0) === 1 && links![0]!.active, `${links?.length} link(s)`)

    // --- the queue ---------------------------------------------------------
    const { data: queued } = await svc.rpc('mail_outbox_read', { p_batch: 50, p_visibility: 0 })
    const mine = ((queued ?? []) as unknown as { message: { round_id: string; token?: string } }[]).filter(
      (m) => m.message.round_id === round!.id,
    )
    check('every invitation is queued for sending', mine.length === 2, `${mine.length} queued`)
    check(
      'the queue carries the raw token the email needs',
      mine.length > 0 && mine.every((m) => /^[0-9a-f]{64}$/.test(m.message.token ?? '')),
      'token present, 32 bytes',
    )

    // --- the worker --------------------------------------------------------
    const worker = spawnSync('npx', ['tsx', 'scripts/mail-worker.ts', '--local', '--once'], {
      encoding: 'utf8',
      env: { ...process.env, MAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '54325' },
    })
    const workerOut = `${worker.stdout ?? ''}${worker.stderr ?? ''}`
    check('the worker drains the queue', /drained [1-9]/.test(workerOut), workerOut.trim().split('\n').pop() ?? '')
    check(
      'the worker never logs a token',
      !/[0-9a-f]{64}/.test(workerOut),
      'no 64-hex string in worker output',
    )

    const { data: afterSend } = await svc
      .from('survey_invitations')
      .select('email, sent_at')
      .eq('round_id', round!.id)
    check(
      'sent_at is recorded on each invitation',
      (afterSend ?? []).length > 0 && (afterSend ?? []).every((i) => i.sent_at !== null),
      `${(afterSend ?? []).filter((i) => i.sent_at).length}/${afterSend?.length} marked`,
    )

    // --- the mail that actually arrived, and its link ----------------------
    const inbox = (await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then((r) => r.json())) as {
      messages: { ID: string; To: { Address: string }[]; Subject: string }[]
    }
    const delivered = inbox.messages.filter((m) =>
      m.To.some((t) => t.Address.startsWith('send-')),
    )
    check('the invitations arrived', delivered.length === 2, `${delivered.length} message(s) in the inbox`)
    check(
      'the subject names the organisation and the survey',
      delivered.length > 0 &&
        delivered.every((m) => m.Subject.includes('Nordisk Studio') && m.Subject.includes(draft.title)),
      delivered[0]?.Subject ?? '',
    )

    const body = delivered.length
      ? ((await fetch(`${MAILPIT}/api/v1/message/${delivered[0]!.ID}`).then((r) =>
          r.json(),
        )) as { Text: string })
      : { Text: '' }
    const link = body.Text.match(/https?:\/\/\S+\/s\/[0-9a-f]{64}/)?.[0]
    check('the email contains a respondent link', Boolean(link), link?.replace(/\/s\/.*/, '/s/…') ?? 'none')

    if (link) {
      const res = await page.goto(link, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const heading = await page.locator('h1').first().innerText()
      check(
        'the emailed link opens the survey it was sent for',
        res?.status() === 200 && heading.trim() === draft.title,
        heading.trim(),
      )
    }

    // --- reminders and recurring rounds ------------------------------------
    // Time is moved rather than waited for: `sent_at` is backdated past the
    // reminder threshold and the sweep is invoked directly, which is what
    // pg_cron does on the hour.
    {
      await svc
        .from('survey_invitations')
        .update({ sent_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
        .eq('round_id', round!.id)

      // The seeded send was 'once', so give it a schedule with a reminder the
      // way a recurring send would have.
      await svc.from('schedules').insert({
        survey_id: draft.id,
        cadence: 'weekly',
        runs_total: 4,
        runs_done: 1,
        reminder_after_days: 2,
        next_run_at: new Date(Date.now() - 60_000).toISOString(),
        active: true,
      })

      // The sweeps are `app.*` and not exposed to PostgREST, so they are
      // invoked the way cron does: through SQL. Executed here via a one-shot
      // RPC would mean adding public surface for a test's convenience.
      const sweep = spawnSync(
        'psql',
        [
          'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
          '-tAc',
          'select app.enqueue_reminders() || \':\' || app.enqueue_reminders() || \':\' || app.run_due_schedules()',
        ],
        { encoding: 'utf8' },
      )
      const [firstRun, secondRun, schedules] = (sweep.stdout ?? '').trim().split(':')
      check('reminders go out once the wait has passed', Number(firstRun) > 0, `${firstRun} enqueued`)
      check('a second sweep sends nothing twice', Number(secondRun) === 0, `${secondRun} on re-run`)
      check('a due schedule opens the next round', Number(schedules) > 0, `${schedules} schedule(s) run`)

      const { data: reminded } = await svc
        .from('survey_invitations')
        .select('email, token_hash, reminded_at')
        .eq('round_id', round!.id)
      check(
        'the reminder rotated the token, as the design of hashing requires',
        (reminded ?? []).every((i) => (i.reminded_at?.length ?? 0) === 1),
        `${(reminded ?? []).filter((i) => i.reminded_at?.length).length} rotated`,
      )

      const { data: allRounds } = await svc
        .from('survey_rounds')
        .select('id, status')
        .eq('survey_id', draft.id)
      const open = (allRounds ?? []).filter((r) => r.status === 'open')
      check(
        'only one round is open at a time',
        open.length === 1,
        `${allRounds?.length} round(s), ${open.length} open`,
      )
    }

    await ctx.close()
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nsend pipeline verified' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
