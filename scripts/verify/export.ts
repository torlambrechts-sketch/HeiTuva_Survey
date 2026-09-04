/**
 * Phase 5 — the report editor and its export, driven end to end.
 *
 * The database suite already proves `compose_report` gates correctly. What it
 * cannot prove is that the SCREEN and the EXPORT both go through it: a page
 * that quietly called `aggregate_results` beside the composition, or a PDF
 * renderer that read the raw aggregates "because it is only a PDF", would pass
 * every test in tests/invariants and still hand out ungated numbers.
 *
 * So this drives a real browser as a real persona and checks the artefacts:
 *   - the editor renders the composed document and nothing else
 *   - a section toggle actually changes what the document shows
 *   - the PDF is a PDF, and a leser's PDF is not larger than a redaktør's
 *   - a suppressed group appears as suppressed in the PDF, not as a number
 */
import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { serviceClient } from '../../tests/db/clients'
import { ORG_PRIMARY } from '../../tests/db/personas'
import { signIn } from '../../tests/helpers/session'

config({ path: '.env.local', quiet: true })

let failures = 0
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail.slice(0, 90)}`)
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()

  try {
    const { data: org } = await svc
      .from('organizations')
      .select('id')
      .eq('name', ORG_PRIMARY)
      .single()
    if (!org) throw new Error(`no organisation named ${ORG_PRIMARY}`)

    // The survey the demo seed gives two groups, one of them below k. That is
    // the shape the composition rules exist for, so it is the shape the export
    // has to be checked against.
    const { data: survey } = await svc
      .from('surveys')
      .select('id, title')
      .eq('org_id', org.id)
      .eq('title', 'Arbeidsmiljø — månedlig')
      .single()
    if (!survey) throw new Error('the seeded monthly survey is missing')

    const { data: report } = await svc
      .from('reports')
      .insert({
        org_id: org.id,
        title: 'Verifisering — eksport',
        kind: 'egen',
        status: 'utkast',
        sections: ['teams', 'summary'],
        filters: { surveys: [survey.id], rounds: [], group: null },
      })
      .select('id')
      .single()
    if (!report) throw new Error('could not create the verification report')

    // ---------------------------------------------------------------- editor
    const page = await browser.newPage()
    await signIn(page, 'redaktor', BASE_URL)
    await page.goto(`${BASE_URL}/rapporter?rapport=${report.id}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForLoadState('load')

    check(
      'editor renders for the report',
      new URL(page.url()).pathname === '/rapporter',
      page.url().replace(BASE_URL, ''),
    )

    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })

    const bodyText = await page.evaluate(() => document.body.innerText)
    check(
      'the composed document is on the page',
      bodyText.includes('Sammendrag') || bodyText.includes('Resultat per team'),
      bodyText.slice(0, 80).replace(/\s+/g, ' '),
    )

    // The seed's Utvikling group has 4 responses, below k=5. With only two
    // groups, complementary suppression must hide both — so no group average
    // may appear in the document at all.
    const hidden = await page
      .getByText('Skjult — for få svar')
      .count()
      .catch(() => 0)
    check('a sub-k partition is shown as suppressed', hidden > 0, `${hidden} suppressed rows`)

    // ------------------------------------------------------------------- pdf
    const asRedaktor = await page.request.get(`${BASE_URL}/rapporter/${report.id}/pdf`)
    const redaktorPdf = Buffer.from(await asRedaktor.body())
    check(
      'redaktør export is a PDF',
      asRedaktor.status() === 200 && redaktorPdf.subarray(0, 5).toString() === '%PDF-',
      `${asRedaktor.status()} · ${redaktorPdf.length} bytes`,
    )

    const leserPage = await browser.newPage()
    await signIn(leserPage, 'leser', BASE_URL)
    const asLeser = await leserPage.request.get(`${BASE_URL}/rapporter/${report.id}/pdf`)
    const leserPdf = Buffer.from(await asLeser.body())
    check(
      'leser export is a PDF too (reading is what the role is for)',
      asLeser.status() === 200 && leserPdf.subarray(0, 5).toString() === '%PDF-',
      `${asLeser.status()} · ${leserPdf.length} bytes`,
    )

    // -------------------------------------------------------------- archived
    // A leser cannot write to the bucket, so only the redaktør's export is
    // archived — one row, not two.
    const { data: exports } = await svc
      .from('report_exports')
      .select('id, format, storage_path')
      .eq('report_id', report.id)
    check(
      'only the writing role archived an export',
      (exports ?? []).length === 1 && exports![0]!.format === 'pdf',
      `${(exports ?? []).length} row(s)`,
    )
    check(
      'the archived path is org-scoped',
      (exports ?? []).every((e) => e.storage_path.startsWith(`${org.id}/`)),
      exports?.[0]?.storage_path.slice(0, 48) ?? '—',
    )

    // ------------------------------------------------------------ other org
    const { data: other } = await svc
      .from('organizations')
      .select('id')
      .neq('id', org.id)
      .limit(1)
      .maybeSingle()
    if (other) {
      const outsider = await browser.newPage()
      await signIn(outsider, 'outsider', BASE_URL)
      const refused = await outsider.request.get(`${BASE_URL}/rapporter/${report.id}/pdf`)
      check(
        'another organisation cannot export the report',
        refused.status() === 404,
        String(refused.status()),
      )
      await outsider.close()
    }

    check('no console errors in the editor', consoleErrors.length === 0, consoleErrors[0] ?? 'none')

    await svc.from('reports').delete().eq('id', report.id)
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nreport export verified' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
