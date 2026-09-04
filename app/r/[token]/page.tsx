import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { SharedReport } from './SharedReport'
import type { ComposedDocument } from '@/app/(app)/rapporter/editor-types'

/**
 * A shared report — Phase 5 scope item 4.
 *
 * The link IS the credential (DECISIONS: unguessable link only), so this route
 * is deliberately outside `(app)`: there is no session, no shell, no navigation
 * to the rest of the product. A reader who has the link can read one document
 * and nothing else.
 *
 * Every decision about WHAT they may read is made inside `compose_report`,
 * which hashes the token, honours the expiry, applies the share scope and
 * re-runs the k-gate for that scope. This file renders whatever comes back and
 * never asks a second question — the moment a page fetches "just one more
 * thing" beside the composition, the composition has stopped being the gate.
 */
export const dynamic = 'force-dynamic'

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // The share row is keyed by hash, so the report id is not in the URL. Ask the
  // database to resolve it, with the token as the only input.
  const supabase = await createClient()
  const { data: reportId } = await supabase.rpc('report_for_share_token', { p_token: token })
  if (!reportId) notFound()

  const { data: composed } = await supabase.rpc('compose_report', {
    p_report: reportId as string,
    p_token: token,
  })
  const doc = (composed ?? {}) as ComposedDocument
  if (doc.error) notFound()

  const { data: sectionTypes } = await supabase
    .from('report_section_types')
    .select('key, label')
    .order('sort_order')
  const t = await getTranslations('reports')

  return (
    <SharedReport
      doc={doc}
      sectionLabels={Object.fromEntries((sectionTypes ?? []).map((s) => [s.key, s.label]))}
      labels={{
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
        threshold: t('groupThreshold'),
        scopeNote:
          doc.share_scope === 'alle_ansatte'
            ? t('shareAlleDesc')
            : doc.share_scope === 'ledere_eget_team'
              ? t('shareLederDesc')
              : t('shareHrDesc'),
        pending: t('sectionPending'),
        trendRound: t('trendRound', { n: 0 }).replace('0', '{n}'),
        themeMentions: t('themeMentions', { label: '{label}', count: '{count}' }),
        invited: t('participationInvited'),
        responded: t('participationResponded'),
        completion: t('participationCompletion'),
        summaryEmpty: t('summaryEmpty'),
      }}
    />
  )
}
