import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'
import { attributedCsv, attributedCsvFilename } from '@/lib/results/attributed-csv'
import { isRefusal, type Attributed } from '@/lib/results/types'

/**
 * The attributed register as CSV — DECISIONS Q43, confirmed 2026-09-06.
 *
 * Administrator and redaktør; a leser is refused, because these rows carry the
 * respondent's name and a leser reads aggregates only (CLAUDE.md role 4).
 * Never reachable through a share link: a token carries no session, and
 * `requireViewer` sends anything without one to the sign-in screen.
 *
 * THE HANDLER ADDS NO PRIVILEGE. It reads the survey and calls
 * `attributed_results` through the cookie-bound anon client, so RLS and the
 * RPC's own organisation and role checks are what refuse. There is no service
 * client in this file, and that is not an oversight to be tidied up later: a
 * route that fetched the rows with the service key "because it is only an
 * export" would be the export becoming the way around the gate — the same
 * mistake the PDF route's comment names, and the same one Q47 found in the
 * peer-results panel.
 *
 * Two refusals, two different statuses, and the difference is deliberate:
 *
 *   · another organisation gets **404**, because for them this survey does not
 *     exist and the URL must not confirm that the id is real;
 *   · a leser in the SAME organisation gets **403**, because the survey is in
 *     their own list — hiding its existence would be a lie they can disprove
 *     by looking at the screen. What they may not have is the named data.
 *
 * The route can tell those apart honestly: step 1 reads `surveys` as the
 * viewer, so RLS has already answered the "does this exist for you" question
 * before the RPC is asked anything.
 *
 * A STATED LIMIT (Q43, kept verbatim): a route handler is NOT a Gate 5a3
 * catalogue surface. 5a3 enumerates RLS tables and SECURITY DEFINER functions;
 * a `/csv` route is neither, so this leans on `tests/db` and on the route
 * checks in `scripts/verify/export.ts` — and 55 of 71 must never be read as
 * total coverage of everything reachable.
 */
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return new Response('Not found', { status: 404 })
  }

  // `p_round` is optional on the RPC; an invalid one is dropped rather than
  // passed through, so a hand-edited query string cannot reach the function.
  const roundParam = new URL(request.url).searchParams.get('runde')
  const round = roundParam && z.string().uuid().safeParse(roundParam).success ? roundParam : null

  const viewer = await requireViewer()
  const supabase = await createClient()

  // 1. Does this survey exist FOR THIS VIEWER? RLS answers, not the handler.
  const { data: survey } = await supabase
    .from('surveys')
    .select('id, title, respondent_kind')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!survey) return new Response('Not found', { status: 404 })

  // 2. The rows, as the viewer. `forbidden` here means "a member of this
  //    organisation with the wrong role", because step 1 already excluded
  //    everyone else.
  const { data, error } = await supabase.rpc('attributed_results', {
    p_survey: id,
    p_round: round ?? undefined,
  })
  if (error) {
    console.error(`attributed csv: rpc failed for ${id} (${error.code ?? 'unknown'})`)
    return new Response('Export failed', { status: 500 })
  }
  if (isRefusal(data)) {
    if (data.error === 'forbidden') return new Response('Forbidden', { status: 403 })
    // `not_attributed` — a person survey has no attributed export at all. 404
    // rather than an empty file: a CSV with a header and no rows reads as "no
    // supplier answered", which is a fabricated answer to a question the
    // survey never asked.
    return new Response('Not found', { status: 404 })
  }

  const attributed = data as unknown as Attributed
  const t = await getTranslations('results')

  const csv = attributedCsv(attributed, {
    name: t('attribColOrg'),
    status: t('attribColStatus'),
    respondedAt: t('attribColDate'),
    statusLabels: {
      svart: t('attribStatusAnswered'),
      paaminnet: t('attribStatusReminded'),
      ikke_svart: t('attribStatusNot'),
    },
  })

  /*
    The audit row, and what is deliberately NOT in it.

    `meta` carries the survey id, the format and how many rows left the
    building. It carries no answer text, no supplier name and no email —
    CLAUDE.md invariant 7 keeps respondent content out of logs and analytics,
    and `audit_events` is append-only (M:0007:38), so a row that captured an
    answer could never be corrected or removed while the organisation exists.
    The closed key set is asserted in `scripts/verify/export.ts`, so a field
    added here has to be added there too.
  */
  await audit(viewer.orgId, 'attributed.export', id, {
    survey_id: id,
    format: 'csv',
    rows: (attributed.rows ?? []).length,
  })

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${attributedCsvFilename(survey.title)}"`,
      'cache-control': 'no-store',
    },
  })
}
