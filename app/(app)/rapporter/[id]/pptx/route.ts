import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'
import { isFlagEnabled } from '@/lib/flags'
import { renderReportPptx } from '@/lib/reports/pptx'
import type { ComposedDocument } from '../../editor-types'

/**
 * PowerPoint export — DECISIONS Q10, Phase 6, behind `feature_flags.pptx_export`.
 *
 * The PDF route with a different renderer at the end and nothing else changed:
 * the composition runs FIRST, as the requesting viewer, through `compose_report`,
 * so the deck cannot show more than the person asking for it can see. The flag
 * is enforced here as well as on the button — a URL is a surface, and hiding a
 * button is not a permission.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return new Response('Not found', { status: 404 })
  }

  const viewer = await requireViewer()
  // 404, not 403: the same answer an org without the flag gets for a report id
  // that does not exist, so the flag's state is not readable from outside.
  if (!(await isFlagEnabled('pptx_export', viewer.orgId))) {
    return new Response('Not found', { status: 404 })
  }

  const supabase = await createClient()
  const t = await getTranslations('reports')

  const { data: composed } = await supabase.rpc('compose_report', { p_report: id })
  const doc = (composed ?? {}) as ComposedDocument
  if (!composed || doc.error) return new Response('Not found', { status: 404 })

  const { data: sectionTypes } = await supabase
    .from('report_section_types')
    .select('key, label')
    .order('sort_order')

  const labels = {
    org: viewer.orgName,
    generated: t('docMeta', {
      period: t('periodAll'),
      date: new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }),
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
  }

  let deck: Buffer
  try {
    deck = await renderReportPptx(doc, labels)
  } catch (e) {
    console.error(`report pptx render failed for ${id}: ${e instanceof Error ? e.message : 'unknown'}`)
    return new Response('Export failed', { status: 500 })
  }

  // Archived on the same terms as the PDF: a leser's deck is theirs to keep but
  // not the organisation's record, and a Storage failure never fails the download.
  if (viewer.role !== 'leser') {
    const path = `${viewer.orgId}/${id}/${crypto.randomUUID()}.pptx`
    const upload = await supabase.storage
      .from('report-exports')
      .upload(path, deck, { contentType: PPTX, upsert: false })

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
        format: 'pptx',
        storage_path: path,
        created_by: member?.id ?? null,
      })
      await audit(viewer.orgId, 'report.export', id, { format: 'pptx' })
    }
  }

  const filename = `${(doc.title ?? 'rapport').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}.pptx`
  return new Response(new Uint8Array(deck), {
    headers: {
      'Content-Type': PPTX,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
