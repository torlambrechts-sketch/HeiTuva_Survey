/**
 * Gate 2a probe — Phase 5 round-trips through the real application path.
 *
 * `scripts/verify/roundtrip.ts` stops at Phase 4: no Phase 5 table has ever been
 * written through a server action or an RPC and read back in verification. This
 * drives the browser for the UI writes and persona-scoped RPC calls for the
 * rest, then reads every row back with the service client and prints it.
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { serviceClient, personaClient } from '../../tests/db/clients'
import { ORG_PRIMARY } from '../../tests/db/personas'
import { signIn } from '../../tests/helpers/session'

config({ path: '.env.local', quiet: true })

let failures = 0
function ok(label: string, pass: boolean, detail: unknown) {
  if (!pass) failures++
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${text.slice(0, 130)}`)
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()
  const redaktor = await personaClient('redaktor')
  const admin = await personaClient('administrator')

  try {
    const { data: org } = await svc
      .from('organizations')
      .select('id')
      .eq('name', ORG_PRIMARY)
      .single()
    if (!org) throw new Error(`no organisation ${ORG_PRIMARY}`)

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
    const page: Page = await ctx.newPage()
    await signIn(page, 'administrator', BASE_URL)

    console.log('\n== Phase 5 ==')

    // ---------------------------------------------------------------- duties
    // A duty row is created on first write. Toggling a checklist item is that
    // first write, so this proves ensureDuty + duty_checks + the audit row.
    await page.goto(`${BASE_URL}/rapporter`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    const firstCheck = page.getByRole('checkbox').first()
    // Record the direction rather than assuming one. Another probe may have
    // left this box in either state, and an assertion that presumes "untick"
    // passes or fails on what ran before it, not on what this run observed.
    const checkedBefore = await firstCheck.isChecked()
    await firstCheck.click()
    await page.waitForTimeout(1500)

    const { data: duties } = await svc
      .from('duties')
      .select('id, definition_key, interval_months, reminder_weeks, publish, next_due_at')
      .eq('org_id', org.id)
    ok('duties (created on first write)', (duties ?? []).length > 0, duties?.[0] ?? null)

    const { data: checks } = await svc
      .from('duty_checks')
      .select('duty_id, key, done, done_by, done_at')
      .in('duty_id', (duties ?? []).map((d) => d.id))
    ok('duty_checks (write persisted)', (checks ?? []).length > 0, checks?.[0] ?? null)

    // Attribution must agree with the state: a ticked check records who ticked
    // it and when; an unticked one records neither. A check showing unticked
    // while still naming someone is evidence of the wrong thing.
    const k1 = (checks ?? []).find((c) => c.key === 'k1')
    const flipped = !!k1 && k1.done === !checkedBefore
    const attributionAgrees = !k1 || (k1.done
      ? k1.done_by !== null && k1.done_at !== null
      : k1.done_by === null && k1.done_at === null)
    ok('duty_checks (toggle flips the stored value)', flipped,
      `${checkedBefore} -> ${k1?.done}`)
    ok('duty_checks (attribution agrees with the state)', attributionAgrees,
      `done=${k1?.done} by=${k1?.done_by ? 'set' : 'null'} at=${k1?.done_at ? 'set' : 'null'}`)

    const { data: dutyAudit } = await svc
      .from('audit_events')
      .select('action, target')
      .eq('org_id', org.id)
      .eq('action', 'duty.check')
      .order('created_at', { ascending: false })
      .limit(1)
    ok('audit_events duty.check', (dutyAudit ?? []).length === 1, dutyAudit?.[0] ?? null)

    // duty_signers rows are seeded with the duty; signing is an RPC.
    const dutyId = duties?.[0]?.id
    const { data: signers } = await svc
      .from('duty_signers')
      .select('id, role_key, member_id, signed_at, signed_content_hash')
      .eq('duty_id', dutyId!)
    ok('duty_signers (seeded unsigned)', (signers ?? []).length > 0, signers?.[0] ?? null)

    // ------------------------------------------------------------ loop_actions
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    const loopText = `Gate2a tiltak ${Date.now()}`
    await page.getByRole('button', { name: 'Legg til tiltak' }).click()
    await page.getByLabel('Legg til tiltak').fill(loopText)
    await page.getByRole('button', { name: 'Legg til tiltak' }).last().click()
    await page.waitForTimeout(1500)

    const { data: loops } = await svc
      .from('loop_actions')
      .select('id, text, org_id, owner_member_id, done')
      .eq('org_id', org.id)
      .eq('text', loopText)
    ok('loop_actions', (loops ?? []).length === 1, loops?.[0] ?? null)

    // ---------------------------------------------------------------- reports
    await page.goto(`${BASE_URL}/rapporter?fane=mine`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await page.getByRole('button', { name: 'Ny rapport' }).click()
    await page.waitForURL((u) => !!u.searchParams.get('rapport'), { timeout: 20_000 })
    const reportId = new URL(page.url()).searchParams.get('rapport')!
    await page.waitForLoadState('load')

    const { data: report } = await svc
      .from('reports')
      .select('id, org_id, title, kind, status, sections, filters, share_scope, created_by')
      .eq('id', reportId)
      .single()
    ok('reports (created)', report?.org_id === org.id && report?.status === 'utkast', {
      title: report?.title, kind: report?.kind, status: report?.status,
      sections: report?.sections, share_scope: report?.share_scope,
    })

    // A section toggle must persist, because the document is composed server-side.
    await page.getByRole('button', { name: /Utvikling over tid/ }).click()
    await page.waitForTimeout(1200)
    const { data: afterToggle } = await svc
      .from('reports').select('sections').eq('id', reportId).single()
    ok('reports.sections (toggle persisted)',
      Array.isArray(afterToggle?.sections) && (afterToggle!.sections as string[]).includes('trend'),
      afterToggle?.sections)

    // ---------------------------------------------------------- report_shares
    await page.getByRole('button', { name: 'Del', exact: true }).click()
    await page.getByText('Hvem skal se den').waitFor()
    await page.getByRole('button', { name: 'Kopier lenke' }).click()
    await page.waitForTimeout(1500)
    const { data: shares } = await svc
      .from('report_shares')
      .select('id, report_id, token_hash, scope, group_id, expires_at')
      .eq('report_id', reportId)
    ok('report_shares (hashed token)',
      (shares ?? []).length === 1 && /^[0-9a-f]{64}$/.test(shares?.[0]?.token_hash ?? ''),
      { scope: shares?.[0]?.scope, hash_len: shares?.[0]?.token_hash?.length })

    const { data: shareAudit } = await svc
      .from('audit_events').select('action').eq('org_id', org.id).eq('action', 'report.share')
    ok('audit_events report.share', (shareAudit ?? []).length >= 1, shareAudit?.[0] ?? null)

    // --------------------------------------------------------- report_exports
    const pdf = await page.request.get(`${BASE_URL}/rapporter/${reportId}/pdf`)
    const body = Buffer.from(await pdf.body())
    ok('pdf route returns a PDF', pdf.status() === 200 && body.subarray(0, 5).toString() === '%PDF-',
      `${pdf.status()} ${body.length}B`)

    const { data: exports } = await svc
      .from('report_exports').select('id, format, storage_path').eq('report_id', reportId)
    ok('report_exports', (exports ?? []).length === 1 && exports?.[0]?.format === 'pdf',
      exports?.[0] ?? null)

    const { data: objects } = await svc.storage.from('report-exports').list(`${org.id}/${reportId}`)
    ok('storage object written', (objects ?? []).length === 1, (objects ?? []).map((o) => o.name))

    // -------------------------------------------------------- result_snapshots
    const { data: survey } = await svc
      .from('surveys').select('id').eq('org_id', org.id).eq('title', 'Arbeidsmiljø — månedlig').single()
    if (!survey) throw new Error('fixture: the seeded monthly survey is missing')
    // p_round / p_group are omitted rather than passed as null: the generated
    // types make them optional, not nullable, and an explicit null does not
    // typecheck even though the RPC defaults both to NULL.
    const { data: snap } = await admin.rpc('snapshot_results', { p_survey: survey.id })
    const snapshotId = (snap as { snapshot_id?: string })?.snapshot_id
    ok('snapshot_results -> result_snapshots', !!snapshotId, snap)

    const { data: snapRow } = await svc
      .from('result_snapshots').select('id, org_id, survey_id, scope, content_hash').eq('id', snapshotId!).single()
    ok('result_snapshots row', snapRow?.org_id === org.id,
      { scope: snapRow?.scope, hash: snapRow?.content_hash?.slice(0, 12) })

    // ---------------------------------------------------------- compose_report
    const { data: composed } = await redaktor.rpc('compose_report', { p_report: reportId })
    const doc = composed as { sections?: unknown[]; k?: number; error?: string }
    ok('compose_report (member path)', !doc.error && doc.k === 5,
      { k: doc.k, sections: doc.sections?.length, error: doc.error })

    // ------------------------------------------------------ duty_versions path
    // publish_duty is the only writer. It must refuse an unsigned duty, which is
    // the round trip that matters: the refusal is the behaviour.
    // The seed signs this duty through sign_duty. The checklist toggle above
    // CHANGED the duty's content, so the signature no longer covers it and
    // publish must refuse — content-hash binding, proven through the UI rather
    // than by calling the hash function directly.
    const { count: versionsBefore } = await svc
      .from('duty_versions').select('id', { count: 'exact', head: true }).eq('duty_id', dutyId ?? '')

    const { data: pub } = await admin.rpc('publish_duty', { p_duty: dutyId!, p_label: 'Gate2a' })
    const pubError = (pub as { error?: string })?.error

    // The assertion is CONSISTENCY, not a fixed verdict. Whether this duty is
    // publishable depends on what the checklist toggle above did to its content
    // hash, and that depends on the state the box was in — so the probe asks
    // duty_status what it believes and requires publish_duty to agree. A
    // hard-coded expected error would only be testing which probe ran first.
    const { data: status } = await admin.rpc('duty_status', { p_duty: dutyId! })
    const statusSigners =
      (status as { signers?: { signed: boolean; stale: boolean }[] } | null)?.signers ?? []
    const publishable = statusSigners.length > 0 && statusSigners.every((x) => x.signed && !x.stale)

    ok('publish_duty agrees with duty_status on publishability',
      publishable ? !pubError : !!pubError,
      `duty_status: ${statusSigners.length} signer(s), publishable=${publishable} · publish ${pubError ?? 'ok'}`)

    // Content-hash binding, stated as the rule rather than as one outcome:
    // publish may never succeed while any signature is stale.
    const anyStale = statusSigners.some((x) => x.stale)
    ok('publish never succeeds over a stale signature', !(anyStale && !pubError),
      `stale=${anyStale} publish=${pubError ?? 'ok'}`)

    const { count: versionsAfter } = await svc
      .from('duty_versions').select('id', { count: 'exact', head: true }).eq('duty_id', dutyId ?? '')
    // A refused publish adds nothing; an accepted one adds exactly one version.
    const expected = (versionsBefore ?? 0) + (pubError ? 0 : 1)
    ok('duty_versions moves only when publish succeeded', versionsAfter === expected,
      `${versionsBefore} -> ${versionsAfter} (publish ${pubError ?? 'ok'})`)

    // Whatever this run did, put the duty back so the next run starts where
    // this one did. A probe that leaves the fixture changed is the defect it
    // was written to catch.
    if (!pubError) await svc.from('duty_versions').delete().eq('id',
      (pub as { version_id?: string })?.version_id ?? '')

    await svc.from('reports').delete().eq('id', reportId)
    await svc.from('loop_actions').delete().eq('text', loopText)
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nall Phase 5 round-trips persisted' : `\n${failures} round-trip(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
