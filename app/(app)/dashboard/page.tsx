import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { readDashboard, readHeatmap, readThemes, readTrends } from '@/lib/results/read'
import type { Theme, TrendPoint } from '@/lib/results/types'
import { isGated } from '@/lib/results/types'
import { DashboardScreen } from './DashboardScreen'

/**
 * Dashboard — HeiTuva.dc.html:808-901.
 *
 * Cross-survey, and every panel is fed by the same k-gated RPCs the Resultater
 * screen uses. Two things the prototype does that this does not:
 *
 *  - Its period selector slices the SURVEY list while its own note says "snitt
 *    per runde". Rounds are real here, so the selector picks rounds and every
 *    RPC takes the resulting id set. Narrowing can only push a cell below the
 *    threshold, so the gate carries the filter unchanged.
 *  - Its panels carry "Legg i rapport" pins and an "Åpne rapport" button. Both
 *    are live now that the report editor exists: a pin is a row in
 *    `dashboard_pins`, keyed by (org, member, panel), and "Åpne rapport" opens
 *    the editor on `summary` plus whatever this member has pinned. (D46 is
 *    closed.)
 */
type Period = 'q' | 'h' | 'y'
const PERIODS: Period[] = ['q', 'h', 'y']
const isPeriod = (v: string | undefined): v is Period => !!v && PERIODS.includes(v as Period)

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; gruppe?: string; u?: string | string[] }>
}) {
  const { periode, gruppe, u } = await searchParams
  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('dashboard')

  const period: Period = isPeriod(periode) ? periode : 'y'

  const [{ data: allSurveys }, { data: groups }, { data: pins }] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, title, status')
      .eq('org_id', viewer.orgId)
      .is('deleted_at', null)
      .neq('status', 'utkast')
      .order('created_at', { ascending: false }),
    supabase.from('groups').select('id, name').eq('org_id', viewer.orgId).order('name'),
    // The member's own pins. RLS already restricts the table to `auth.uid()`;
    // the filter here is what makes the query use the (org, user) index.
    supabase
      .from('dashboard_pins')
      .select('panel_key')
      .eq('org_id', viewer.orgId)
      .eq('user_id', viewer.userId),
  ])

  const available = allSurveys ?? []
  const availableIds = new Set(available.map((s) => s.id))
  const requested = (Array.isArray(u) ? u : u ? [u] : []).filter((id) => availableIds.has(id))
  const selected = requested.length ? requested : available.map((s) => s.id)

  const group = gruppe && (groups ?? []).some((g) => g.id === gruppe) ? gruppe : null

  // The period is a set of rounds: the most recent one per survey, the most
  // recent two, or all of them.
  const { data: rounds } = await supabase
    .from('survey_rounds')
    .select('id, survey_id, round_no, opens_at')
    .in('survey_id', selected.length ? selected : ['00000000-0000-0000-0000-000000000000'])
    .order('round_no', { ascending: false })

  const perSurvey = new Map<string, { id: string; round_no: number }[]>()
  for (const r of rounds ?? []) {
    const bucket = perSurvey.get(r.survey_id) ?? []
    bucket.push({ id: r.id, round_no: r.round_no })
    perSurvey.set(r.survey_id, bucket)
  }
  const take = period === 'q' ? 1 : period === 'h' ? 2 : Number.POSITIVE_INFINITY
  const roundIds =
    period === 'y'
      ? null
      : [...perSurvey.values()].flatMap((list) => list.slice(0, take).map((r) => r.id))

  const [summary, heatmap] = await Promise.all([
    readDashboard(viewer.orgId, selected, group, roundIds),
    readHeatmap(viewer.orgId, selected, group, roundIds),
  ])

  // Trends and themes are per-survey RPCs, so the cross-survey panels are the
  // union of per-survey reads. That is deliberate rather than a shortcut: each
  // survey's gate is applied to its OWN data, and merging afterwards can only
  // combine cells that already survived. A theme gated in every survey never
  // appears in the merged list, which a single cross-survey query with one
  // contributor count could not guarantee.
  const perSurveyReads = await Promise.all(
    selected.map(async (id) => ({
      id,
      title: available.find((s) => s.id === id)?.title ?? '',
      trends: await readTrends(id, group),
      themes: await readThemes(id, roundIds, group),
    })),
  )

  const trendBars: { key: string; label: string; avg: number | null }[] = []
  for (const s of perSurveyReads) {
    const points: TrendPoint[] = s.trends?.points ?? []
    const inScope = roundIds ? points.filter((p) => roundIds.includes(p.round_id)) : points
    for (const p of [...inScope].sort((a, b) => a.round_no - b.round_no)) {
      trendBars.push({
        key: p.round_id,
        label: `${s.title} · ${p.round_no}`,
        avg: isGated(p) ? null : p.avg,
      })
    }
  }

  const merged = new Map<string, Theme>()
  for (const s of perSurveyReads) {
    for (const theme of s.themes?.themes ?? []) {
      const seen = merged.get(theme.key)
      merged.set(
        theme.key,
        seen
          ? {
              ...seen,
              mentions: seen.mentions + theme.mentions,
              contributors: seen.contributors + theme.contributors,
            }
          : theme,
      )
    }
  }
  const themes = [...merged.values()].sort((a, b) => b.mentions - a.mentions)

  return (
    <DashboardScreen
      surveys={available}
      selected={selected}
      groups={groups ?? []}
      group={group}
      period={period}
      summary={summary}
      heatmap={heatmap}
      trendBars={trendBars}
      themes={themes}
      filterLine={t('filterLine', {
        surveys: selected.length,
        responses: summary?.n ?? 0,
        group: group ? ((groups ?? []).find((g) => g.id === group)?.name ?? '') : t('allGroups'),
      })}
      pinned={(pins ?? []).map((p) => p.panel_key)}
    />
  )
}
