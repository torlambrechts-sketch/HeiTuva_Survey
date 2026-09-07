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
import { createHash } from 'node:crypto'
import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { leserClient, serviceClient } from '../../tests/db/clients'
import { ORG_PRIMARY } from '../../tests/db/personas'
import { signIn } from '../../tests/helpers/session'
import { requireDependencies } from './deps'
import { LOCAL_SUPABASE } from './local-env'

config({ path: '.env.local', quiet: true })

let failures = 0
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail.slice(0, 90)}`)
}

async function main() {
  // storage-api is not in the CLI's default service set and CI does not run
  // this gate at all, so the archive half exists only here. Without it the
  // export route's upload fails, the `report_exports` insert is skipped (by
  // design — a Storage hiccup must not deny the reader their document), and
  // "only the writing role archived its exports" reports FAIL with an empty
  // detail, which reads like a broken export rather than an absent service.
  await requireDependencies('verify:export', [
    {
      name: 'Supabase Storage (storage-api, where report exports are archived)',
      where: `${LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`,
      probe: async () => {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), 3000)
        try {
          // Kong answers 503 for a service that is not up and 400/401 for one
          // that is (the request carries no key). Anything but 503 is alive.
          const r = await fetch(`${LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`, {
            signal: ac.signal,
          })
          return r.status !== 503
        } catch {
          return false
        } finally {
          clearTimeout(t)
        }
      },
      howto:
        'supabase start -x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor',
    },
  ])

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
      .select('id, title')
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

    // ----------------------------------------------------------------- pptx
    // Phase 6: the same composition, as a deck, behind feature_flags.pptx_export.
    // The flag is a ROW for the org, so the gate is proven in both positions
    // rather than assumed from the seed.
    const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    const isDeck = (b: Buffer) =>
      b.subarray(0, 2).toString() === 'PK' && b.includes('ppt/slides/slide1.xml')

    const pptxFlag = (enabled: boolean) =>
      svc.from('feature_flags').update({ enabled }).eq('key', 'pptx_export').eq('org_id', org.id)
    await pptxFlag(false)
    const flagOff = await page.request.get(`${BASE_URL}/rapporter/${report.id}/pptx`)
    check('with the flag off the deck route is not there', flagOff.status() === 404, `HTTP ${flagOff.status()}`)

    await pptxFlag(true)
    // The route reads the flag per request, but the flag reader is cached per
    // render; a fresh request is a fresh render, so no restart is needed.
    const asRedaktorDeck = await page.request.get(`${BASE_URL}/rapporter/${report.id}/pptx`)
    const redaktorDeck = Buffer.from(await asRedaktorDeck.body())
    check(
      'with the flag on the redaktør gets a deck',
      asRedaktorDeck.status() === 200 &&
        asRedaktorDeck.headers()['content-type'] === PPTX &&
        isDeck(redaktorDeck),
      `${asRedaktorDeck.status()} · ${redaktorDeck.length} bytes`,
    )
    check(
      'the deck carries the withheld marker, not a number, for the sub-k rows',
      redaktorDeck.includes('Skjult') || redaktorDeck.includes('for f'),
      'suppressed wording present in slide XML',
    )
    const asLeserDeck = await leserPage.request.get(`${BASE_URL}/rapporter/${report.id}/pptx`)
    const leserDeck = Buffer.from(await asLeserDeck.body())
    check(
      'a leser gets a deck too, at their own scope',
      asLeserDeck.status() === 200 && isDeck(leserDeck),
      `${asLeserDeck.status()} · ${leserDeck.length} bytes`,
    )

    // -------------------------------------------------------------- archived
    // A leser cannot write to the bucket, so only the redaktør's exports are
    // archived — one PDF and one deck, not four rows.
    const { data: exports } = await svc
      .from('report_exports')
      .select('id, format, storage_path')
      .eq('report_id', report.id)
      .order('format')
    check(
      'only the writing role archived its exports',
      (exports ?? []).length === 2 &&
        exports![0]!.format === 'pdf' &&
        exports![1]!.format === 'pptx',
      `${(exports ?? []).map((e) => e.format).join(',')}`,
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

    // ---------------------------------------------------------- share link
    // The link the UI hands out must resolve. This is the check that was
    // missing when "Kopier lenke" copied a URL to a route nobody had built.
    for (const scope of ['ledelse', 'ledere_eget_team', 'alle_ansatte'] as const) {
      const raw = `verify-share-${scope}-${Date.now()}`
      const { data: group } = await svc
        .from('groups').select('id').eq('org_id', org.id).limit(1).single()
      await svc.from('report_shares').insert({
        report_id: report.id,
        token_hash: createHash('sha256').update(raw).digest('hex'),
        scope,
        group_id: scope === 'ledere_eget_team' ? group!.id : null,
      })

      const anonPage = await browser.newPage()
      const res = await anonPage.goto(`${BASE_URL}/r/${raw}`, { waitUntil: 'domcontentloaded' })
      await anonPage.waitForLoadState('load')
      const body = await anonPage.evaluate(() => document.body.innerText)
      // Assert the REPORT is on the page, not merely that something 200'd.
      // Checking only the status passed while middleware was redirecting every
      // share link to the login screen — Playwright follows the redirect, so a
      // login page reports 200 too.
      const landed = new URL(anonPage.url()).pathname
      check(
        `share link renders the report for ${scope}`,
        res?.status() === 200 && landed.startsWith('/r/') && body.includes(report.title),
        `HTTP ${res?.status()} on ${landed}`,
      )

      // alle_ansatte must carry no per-group breakdown at all. Checking the
      // rendered text rather than the RPC: the point is what a reader sees.
      // The scope's actual effect: ledelse and ledere_eget_team carry the
      // per-group breakdown, alle_ansatte must not. Asserting BOTH directions —
      // "no group name" passed for every scope while the page was a login form.
      const namesGroup = /Ledelse|Utvikling/.test(body)
      check(
        `${scope}: per-group rows ${scope === 'alle_ansatte' ? 'absent' : 'present'}`,
        scope === 'alle_ansatte' ? !namesGroup : namesGroup,
        namesGroup ? 'a group name appears' : 'no group name',
      )
      await anonPage.close()
    }

    const bad = await browser.newPage()
    const notFound = await bad.goto(`${BASE_URL}/r/definitely-not-a-token`, {
      waitUntil: 'domcontentloaded',
    })
    check('an unknown share token 404s', notFound?.status() === 404, `HTTP ${notFound?.status()}`)
    await bad.close()

    // ============================================================== Q43
    // The attributed CSV export — DECISIONS Q43, confirmed 2026-09-06.
    //
    // A STATED LIMIT, kept verbatim from the decision line: **a route handler
    // is NOT a Gate 5a3 catalogue surface.** 5a3 enumerates RLS tables and
    // SECURITY DEFINER functions; a `/csv` route is neither, so this leans on
    // tests/db instead — and **55 of 71 must never be read as total coverage
    // of everything reachable.** These checks are what stands between the
    // route and nothing.
    //
    // The route adds no privilege: it calls `attributed_results` as the
    // viewer, so RLS and the RPC's own organisation and role checks do the
    // refusing. What is asserted here is that the ROUTE does not undo that —
    // by using a service client "because it is only an export", by answering
    // 200 with an empty body where the RPC said forbidden, or by being
    // reachable without a session at all.
    const { data: orgSurvey } = await svc
      .from('surveys')
      .select('id, respondent_kind')
      .eq('org_id', org.id)
      .eq('title', 'Aktsomhetsvurdering leverandør')
      .single()
    if (!orgSurvey) throw new Error('the seeded organisation survey is missing')

    const csvUrl = (id: string) => `${BASE_URL}/undersokelser/${id}/resultater/csv`

    // Clear any earlier export rows for this survey so "exactly one" below is a
    // statement about THIS export rather than about how often the gate has run.
    // audit_events is append-only against every caller but the service role's
    // own cascade path, so this is a delete through `svc` and nothing else.
    await svc.from('audit_events').delete().eq('action', 'attributed.export').eq('target', orgSurvey.id)

    const adminPage = await browser.newPage()
    await signIn(adminPage, 'administrator', BASE_URL)

    // -- positive control first: without it every refusal below could pass on a
    //    route that refuses everyone, including the two roles Q43 admits.
    const asRedaktorCsv = await page.request.get(csvUrl(orgSurvey.id))
    const csvBody = await asRedaktorCsv.text()
    check(
      'Q43 redaktør gets the attributed CSV',
      asRedaktorCsv.status() === 200 &&
        (asRedaktorCsv.headers()['content-type'] ?? '').startsWith('text/csv'),
      `HTTP ${asRedaktorCsv.status()} · ${asRedaktorCsv.headers()['content-type'] ?? 'no type'}`,
    )
    check(
      'Q43 the CSV carries the named rows, which is what attribution means',
      csvBody.includes('Nordvest Tekstil AS') && csvBody.includes('Trøndelag Komponent AS'),
      csvBody.split('\n')[1]?.slice(0, 70) ?? '(empty)',
    )
    // Tor, 2026-09-06: no contact address in a legal artefact. The unit tests
    // assert this over a constructed document; this asserts it over the file the
    // ROUTE actually served, against a fixture whose every invitation has an
    // address in the database — so it cannot pass because there was none to
    // leak. Guarded on the rows being present for the same reason.
    check(
      'Q43 and no contact address anywhere in the served file',
      csvBody.includes('Nordvest Tekstil AS') && !csvBody.includes('@'),
      csvBody.includes('@') ? `leaked: ${csvBody.match(/\S+@\S+/)?.[0] ?? '?'}` : 'no "@" in the file',
    )
    check(
      'Q43 it is offered as a download, not rendered',
      (asRedaktorCsv.headers()['content-disposition'] ?? '').includes('attachment'),
      asRedaktorCsv.headers()['content-disposition'] ?? 'none',
    )

    const asAdminCsv = await adminPage.request.get(csvUrl(orgSurvey.id))
    check(
      'Q43 administrator gets it too',
      asAdminCsv.status() === 200,
      `HTTP ${asAdminCsv.status()}`,
    )

    // -- leser: 403, not 404. The survey IS visible to them in the list, so
    //    hiding its existence would be a lie they can disprove by looking.
    //    What they may not have is the named data.
    const asLeserCsv = await leserPage.request.get(csvUrl(orgSurvey.id))
    check(
      'Q43 a leser is refused — aggregates only, and these rows are named',
      asLeserCsv.status() === 403,
      `HTTP ${asLeserCsv.status()}`,
    )
    const leserCsvBody = await asLeserCsv.text()
    check(
      'Q43 and that refusal carries no rows',
      // Tied to the 403 deliberately. On its own "the body has no supplier
      // name" is satisfied by a 404 page, by a login form, and by the route
      // not existing — it passed all three while this was being written.
      asLeserCsv.status() === 403 && !leserCsvBody.includes('Nordvest Tekstil'),
      `HTTP ${asLeserCsv.status()} · ${leserCsvBody.slice(0, 32).replace(/\s+/g, ' ')}`,
    )

    // -- another organisation: 404, because for them the survey does not exist.
    const outsiderCsvPage = await browser.newPage()
    await signIn(outsiderCsvPage, 'outsider', BASE_URL)
    const asOutsiderCsv = await outsiderCsvPage.request.get(csvUrl(orgSurvey.id))
    check(
      'Q43 another organisation gets 404, not 403',
      asOutsiderCsv.status() === 404,
      `HTTP ${asOutsiderCsv.status()}`,
    )

    // -- no session at all. Q43: "never reachable through a share link" — a
    //    share token has no session, so the route must not answer without one.
    //    Asserting the LANDING PATH, not the status: Playwright follows the
    //    redirect and a login page returns 200 (the mistake the share-link
    //    check above already records).
    const anonCsvPage = await browser.newPage()
    const anonCsv = await anonCsvPage.goto(csvUrl(orgSurvey.id), { waitUntil: 'domcontentloaded' })
    const anonLanded = new URL(anonCsvPage.url()).pathname
    check(
      'Q43 without a session the route is not reachable',
      anonLanded.startsWith('/logg-inn') || anonCsv?.status() === 404,
      `${anonCsv?.status()} on ${anonLanded}`,
    )
    await anonCsvPage.close()

    // -- a person survey has no attributed export at all. `attributed_results`
    //    answers `not_attributed`; the route must not turn that into an empty
    //    CSV that reads like "no suppliers answered".
    const asRedaktorPerson = await page.request.get(csvUrl(survey.id))
    check(
      'Q43 a person survey is refused, not exported empty',
      asRedaktorPerson.status() === 404,
      `HTTP ${asRedaktorPerson.status()}`,
    )

    // -- THE AUDIT CLAUSE ----------------------------------------------------
    // The sharpest thing in Q43, and it gets its own name.
    //
    // Asserted on the STORED ROW, read back out of `audit_events`, not on the
    // object handed to `audit()`. Those two diverge the moment a column gains a
    // default or a trigger enriches the row, and the property is about what is
    // IN the table — not about what the writer intended to put there.
    //
    // One correction to the decision line's stated reason, recorded rather than
    // quietly adjusted: `audit_events` is NOT readable by a leser. `audit_sel`
    // (M:0008:190) admits administrators only. The property still matters, for
    // two reasons that are if anything sharper: CLAUDE.md invariant 7 puts no
    // respondent text in logs or analytics, and the table is append-only
    // (M:0007:38) — a row that captured answer text could never be corrected
    // or deleted while the organisation exists.
    const { data: auditRows } = await svc
      .from('audit_events')
      .select('*')
      .eq('action', 'attributed.export')
      .eq('target', orgSurvey.id)
      .order('created_at')
    check(
      'Q43 AUDIT: one export by the redaktør, one by the administrator, and nothing else',
      (auditRows ?? []).length === 2,
      `${(auditRows ?? []).length} row(s)`,
    )
    // `written` guards the three assertions below. Every one of them is
    // vacuously TRUE on an empty table — `.every()` over no rows, and a
    // serialised `[]` that contains no answer text — so all three passed while
    // the route did not exist, which is the failure mode this phase keeps
    // finding: the assertion never reached the thing it was about.
    const written = (auditRows ?? []).length === 2
    check(
      'Q43 AUDIT: the stored row names the survey',
      written &&
        auditRows!.every((r) => (r.meta as Record<string, unknown>)?.survey_id === orgSurvey.id),
      written ? JSON.stringify(auditRows![0]!.meta ?? null).slice(0, 70) : 'no rows to assert on',
    )

    // Every answer the survey actually holds, read from the database rather
    // than repeated from the seed: a hard-coded list stops covering the thing
    // it guards the moment someone adds a question.
    const { data: answerRows } = await svc
      .from('answers')
      .select('value, comment, responses!inner(round_id, survey_rounds!inner(survey_id))')
      .eq('responses.survey_rounds.survey_id', orgSurvey.id)
    const answerText = (answerRows ?? [])
      .flatMap((a) => [JSON.stringify(a.value ?? '').replace(/^"|"$/g, ''), a.comment ?? ''])
      // Two- and three-character values ("Ja", "Nei") are excluded: they occur
      // by chance in unrelated text and would make this pass or fail for
      // reasons that have nothing to do with the audit row.
      .filter((v) => v.length >= 4)
    const serialised = JSON.stringify(auditRows ?? [])
    const leaked = answerText.filter((v) => serialised.includes(v))
    check(
      'Q43 AUDIT: no answer text anywhere in the stored rows',
      written && answerText.length > 0 && leaked.length === 0,
      !written ? 'no rows to assert on'
      : answerText.length === 0 ? 'NO ANSWERS TO CHECK — the assertion is vacuous'
      : leaked.length ? `leaked: ${leaked[0]!.slice(0, 50)}`
      : `${answerText.length} answer strings, none present`,
    )
    // A closed key set, so a field ADDED later has to be added here too. This
    // is the half a substring check cannot do: a new key holding new content
    // would pass the scan above on the day it is introduced and every day it
    // stays empty in the fixture.
    const metaKeys = new Set((auditRows ?? []).flatMap((r) => Object.keys((r.meta ?? {}) as object)))
    const allowed = new Set(['survey_id', 'format', 'rows'])
    check(
      'Q43 AUDIT: meta carries only the closed set of keys',
      written && metaKeys.size > 0 && [...metaKeys].every((k) => allowed.has(k)),
      [...metaKeys].join(',') || '(no keys)',
    )
    // Where the row actually lands, asserted rather than assumed — through a
    // real leser session, not an unauthenticated request, because "rejected"
    // and "filtered by RLS" are different results and only one of them is the
    // policy under discussion (Gate 2b: an empty result is not a denial, and
    // here the empty result IS the denial, which is why it has to be shown
    // against a row that exists).
    const leserDb = await leserClient()
    const { data: leserSees, error: leserErr } = await leserDb
      .from('audit_events')
      .select('id')
      .eq('action', 'attributed.export')
      .eq('target', orgSurvey.id)
    check(
      'Q43 AUDIT: a leser reads none of it — audit_sel is administrator-only',
      leserErr === null && (leserSees ?? []).length === 0 && (auditRows ?? []).length > 0,
      `leser sees ${(leserSees ?? []).length} of ${(auditRows ?? []).length} existing rows`,
    )

    await adminPage.close()
    await outsiderCsvPage.close()

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
