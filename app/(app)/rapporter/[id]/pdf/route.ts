import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'
import { htmlToPdf } from '@/lib/reports/pdf'
import { renderReportHtml } from '@/lib/reports/print'
import type { ComposedDocument } from '../../editor-types'

/**
 * PDF export — DECISIONS Q10, rendered by Chromium rather than a PDF library.
 *
 * A GET, not an action: the browser can follow it, retry it and print it, and
 * nothing about producing a document is a mutation of the report.
 *
 * The composition runs FIRST, as the requesting viewer, through the same
 * `compose_report` the screen uses. So the export cannot show more than the
 * person asking for it can see — a `leser` gets their document, a redaktør
 * gets theirs, and neither gets the other's. Rendering from raw aggregates
 * "because it is only a PDF" is exactly how an export becomes the way around
 * the gate.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return new Response('Not found', { status: 404 })
  }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('reports')

  const { data: composed } = await supabase.rpc('compose_report', { p_report: id })
  const doc = (composed ?? {}) as ComposedDocument

  // A refused composition and a missing report answer the same way, for the
  // same reason the RPC does: the URL must not confirm that a report id exists.
  if (!composed || doc.error) return new Response('Not found', { status: 404 })

  const { data: sectionTypes } = await supabase
    .from('report_section_types')
    .select('key, label')
    .order('sort_order')

  const html = renderReportHtml(doc, {
    org: viewer.orgName,
    generated: t('docMeta', {
      period: t('periodAll'),
      date: new Date().toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    }),
    suppressedRow: t('suppressedRow'),
    suppressedNote: t('suppressedNote', { count: doc.suppressed_groups?.length ?? 0 }),
    insufficient: t('insufficientCell'),
    pending: t('sectionPending'),
    trendRound: t('trendRound', { n: 0 }).replace('0', '{n}'),
    themeMentions: t('themeMentions', { label: '{label}', count: '{count}' }),
    invited: t('participationInvited'),
    responded: t('participationResponded'),
    completion: t('participationCompletion'),
    summaryEmpty: t('summaryEmpty'),
    sectionLabels: Object.fromEntries((sectionTypes ?? []).map((s) => [s.key, s.label])),
  })

  let pdf: Buffer
  try {
    pdf = await htmlToPdf(html)
  } catch (e) {
    // Never leak the composed document into a log line: it is result data.
    console.error(`report pdf render failed for ${id}: ${e instanceof Error ? e.message : 'unknown'}`)
    return new Response('Export failed', { status: 500 })
  }

  // Archive it, but do not fail the download if archiving does not work. The
  // reader asked for a document; a Storage hiccup is not their problem, and a
  // missing `report_exports` row is visible in its own right. A `leser` cannot
  // write to the bucket at all (migration 0023), so their export is never
  // archived — which is correct: an archive records what the organisation
  // published, not what someone printed.
  if (viewer.role !== 'leser') {
    const path = `${viewer.orgId}/${id}/${crypto.randomUUID()}.pdf`
    const upload = await supabase.storage
      .from('report-exports')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: false })

    if (upload.error) {
      console.error(`report export upload failed for ${id}: ${upload.error.message}`)
    } else {
      const { data: member } = await supabase
        .from('org_members')
        .select('id')
        .eq('org_id', viewer.orgId)
        .eq('user_id', viewer.userId)
        .maybeSingle()

      await supabase.from('report_exports').insert({
        report_id: id,
        format: 'pdf',
        storage_path: path,
        created_by: member?.id ?? null,
      })
      await audit(viewer.orgId, 'report.export', id, { format: 'pdf' })
    }
  }

  const filename = `${(doc.title ?? 'rapport').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}.pdf`

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // A composed report is result data cut to one reader's scope. It must
      // never sit in a shared cache where the next reader's request could be
      // served from it.
      'Cache-Control': 'private, no-store',
    },
  })
}
