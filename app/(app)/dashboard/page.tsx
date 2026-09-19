import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { readDashboard, readHeatmap, readThemes, readTrends } from '@/lib/results/read'
import type { Theme, TrendPoint } from '@/lib/results/types'
import type { PanelScope } from '@/lib/dashboard/layout'
import type { ScopeBundle } from './DashboardScreen'
import { isGated } from '@/lib/results/types'
import { DashboardScreen } from './DashboardScreen'
import {
  WORKING_TITLE,
  archetypeOf,
  readPanels,
  distinctScopes,
  scopeKey,
  readCols,
  type PanelEntry,
} from '@/lib/dashboard/layout'
import { readAttributed } from '@/lib/results/read'
import { registerStats, dutyRows } from '@/lib/dashboard/panels'
import { rateOf } from '@/lib/surveys/participation'

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
  searchParams: Promise<{
    periode?: string
    gruppe?: string
    u?: string | string[]
    tilpass?: string
    flate?: string
  }>
}) {
  const { periode, gruppe, u, tilpass, flate } = await searchParams
  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('dashboard')
  const locale = await getLocale()

  const period: Period = isPeriod(periode) ? periode : 'y'

  const [
    { data: allSurveys },
    { data: groups },
    { data: pins },
    { data: panelTypes },
    { data: shipped },
    { data: savedLayouts },
    { data: flags },
  ] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, title, status, respondent_kind')
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
    // Q51: the vocabulary a layout may name. The DASHBOARD subset of the
    // registry — read once here and threaded through, so the picker, the
    // renderer and `readPanels` all work from the same list rather than three
    // hard-coded ones.
    supabase
      .from('report_section_types')
      .select('key, label, description, in_report')
      .eq('on_dashboard', true)
      .order('sort_order'),
    supabase
      .from('dashboard_presets')
      .select('key, title, description, panels, tint')
      .order('sort_order'),
    // RLS returns exactly two kinds of row: this member's own, and the
    // organisation's presets (`user_id null`). Nobody else's personal layout
    // is readable, which is what `dashboard_layouts_sel`'s second clause is
    // for and what `tests/db/dashboard-layouts.test.ts` proves.
    supabase
      .from('dashboard_layouts')
      .select('id, user_id, title, panels, filters, dashboard_id, cols')
      .eq('org_id', viewer.orgId)
      .order('title'),
    // Org row wins over the global default; both are readable, so the "some
    // row says enabled" test below is scoped to this organisation by RLS.
    supabase.from('feature_flags').select('key, enabled').eq('key', 'event_stream_panel'),
  ])

  const available = allSurveys ?? []
  const availableIds = new Set(available.map((s) => s.id))
  const requested = (Array.isArray(u) ? u : u ? [u] : []).filter((id) => availableIds.has(id))
  const selected = requested.length ? requested : available.map((s) => s.id)

  const group = gruppe && (groups ?? []).some((g) => g.id === gruppe) ? gruppe : null

  // ── The layout (Q25/Q51) ──────────────────────────────────────────────────
  const offered = (panelTypes ?? []).map((t) => t.key)
  const own = (savedLayouts ?? []).find(
    (l) => l.user_id === viewer.userId && l.title === WORKING_TITLE,
  )

  /* N2 — `?flate=<dashboards.id>` SELECTS WHICH BOARD IS ON SCREEN, and this is
     the reader for the link the Innsikt rail emits.
     `lib/shell/subnav.ts` lists the organisation's dashboards as pills; without
     this block that parameter would reach the page and change nothing, which is
     D208's second face — the worse one — arriving in a link rather than in a
     column. A pill that appears to select a board and silently shows another is
     exactly the control this file's own rules refuse.

     IT IS A READ AND ONLY A READ. The selection resolves against
     `savedLayouts`, which RLS has already narrowed to what this member may see
     — their own rows and the organisation's presets — so an id naming a board
     whose layout is not readable, or no board at all, falls through to `own`
     rather than erroring. That is the same "resolve against the registry
     instead of trusting the value" treatment `readWorkspace` gives its cookie.

     AND THE CUSTOMIZE PANEL IS FORCED SHUT ON A BOARD THAT IS NOT YOURS.
     Every write in `actions.ts` — `saveLayout`, `setColumns`, `resetLayout` —
     targets `(org, me, WORKING_TITLE)`. Left open while another board renders,
     «Lagre» would say it saved this board and write a different one: a control
     whose copy asserts a write it does not perform (D221). Switching boards for
     real is a product decision about whether a person may keep several named
     dashboards — raised in `MetaBar.tsx` when the entity landed, still not
     settled, and not settled here either. */
  const chosen = flate ? (savedLayouts ?? []).find((l) => l.dashboard_id === flate) : undefined
  const working = chosen ?? own
  const viewingOther = !!chosen && chosen.id !== own?.id

  // A member with no working row has not chosen yet: the design answers that
  // with the shipped presets, not an empty board (NEW:1042).
  const panels: PanelEntry[] = working ? readPanels(working.panels, offered) : []
  const cols = readCols(working?.cols)

  /* F5 — the three meta-bar cells that needed the entity (M:0132/M:0134).
     Each is a real read or it is absent: nothing here falls back to a name or
     a count that would be true of something else. */
  const dashboardId = working?.dashboard_id ?? null
  const [{ data: dashRow }, { data: shareRows }, { count: frozenCount }] = await Promise.all([
    dashboardId
      ? supabase.from('dashboards').select('title, owner_id').eq('id', dashboardId).maybeSingle()
      : Promise.resolve({ data: null }),
    dashboardId
      ? supabase.from('dashboard_shares').select('scope, role').eq('dashboard_id', dashboardId)
      : Promise.resolve({ data: [] as { scope: string; role: string | null }[] }),
    dashboardId
      ? supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('dashboard_id', dashboardId)
          .is('deleted_at', null)
      : Promise.resolve({ count: 0 }),
  ])

  /* «Eier», resolved from org_members and NEVER invented. v8 falls back to the
     literal «Tuva Berg» (v8:8969) — a name belonging to somebody else is worse
     than no name, so an owner this viewer cannot resolve yields null and the
     cell does not render. RLS decides what resolves, which is also why the
     lookup is a query rather than a join off `dashboards`. */
  const { data: ownerRow } = dashRow?.owner_id
    ? await supabase
        .from('org_members')
        .select('name, email')
        .eq('org_id', viewer.orgId)
        .eq('user_id', dashRow.owner_id)
        .maybeSingle()
    : { data: null }
  const dashOwnerName = ownerRow?.name ?? ownerRow?.email ?? null
  const dashShares = (shareRows ?? []) as { scope: string; role: string | null }[]
  const dashReportCount = frozenCount ?? 0
  const needsSetup = !working

  // An organisation survey has no threshold (`app.k_for` returns 0), so the
  // register panel is only meaningful when the selection contains one. The
  // bundle states that as a `req` chip rather than hiding the panel
  // (NEW:3534), which is the same "draw the absence" treatment Q26 uses.
  const hasOrgSurvey = available.some(
    (s) => selected.includes(s.id) && s.respondent_kind === 'organisation',
  )

  // The `req` chip is a PRECONDITION stated in the picker, not an error: the
  // bundle prints it whether or not the condition is met (NEW:3668), so a
  // reader learns what a panel needs before they wonder why it is empty.
  // Availability is the separate question of whether it is met right now.
  const REQ: Record<string, string> = {
    per_virksomhet: t('reqOrgRespondents'),
    trend: t('reqRounds'),
  }

  // WHY THE LABEL IS NOT THE REGISTRY'S. `report_section_types.label` is
  // Norwegian-only — it has no `lang` column and nothing translates it, which
  // is exactly what Q48(b) is for and has not landed. Reading it here would
  // make every panel title Norwegian in English, a regression. So the registry
  // stays the VOCABULARY (which keys may be composed) and next-intl stays the
  // NAME, keyed by the registry key so the two cannot be renamed apart.
  //
  // Today the two sets of strings are identical, which is the drift risk
  // rather than the reassurance: two sources agreeing by coincidence is how
  // one of them gets translated and the other does not.
  // `tests/unit/dashboard-panels.test.ts` asserts a name exists for every
  // offered key, in both languages.
  //
  // And a dashboard panel is not data-only in any case: it needs a
  // `renderPanel` arm to draw anything. The registry constrains what may be
  // NAMED; drawing one is still code.
  const picker = (panelTypes ?? []).map((pt) => ({
    key: pt.key,
    label: t(`panel_${pt.key}` as never),
    desc: t(`desc_${pt.key}` as never),
    req: REQ[pt.key] ?? '',
    // Only the register panel has a condition the data can fail. The others
    // render their own empty state, which is a truer answer than removing them
    // from the picker.
    available: pt.key === 'per_virksomhet' ? hasOrgSurvey : true,
  }))

  // Q26: THE ABSENCE IS DRAWN, NOT HIDDEN.
  //
  // The stream panel has no registry row on purpose, and that is what stops a
  // layout naming it (M:0047). But the DECISION says more than "defer": «the
  // panel appears in the picker as the bundle's own unavailable state, with its
  // `req` chip. The bundle sanctions drawing its absence, so this is not hiding
  // a feature.» Building only the refusal built the hiding.
  //
  // So the picker carries an entry the registry does not: drawn, greyed,
  // «Ikke tilgjengelig», with the precondition stated. It is added here rather
  // than seeded as an unavailable row, because a row is what a layout may name
  // and this must remain unnamable — the two mechanisms stay separate and say
  // the same thing.
  //
  // Lifting Q26 is a migration (the registry row) AND this flag, in that order.
  // The flag alone changes nothing, which the test asserts.
  const streamEnabled = (flags ?? []).some(
    (f) => f.key === 'event_stream_panel' && f.enabled,
  )
  const streamOffered = offered.includes('stream')
  if (!streamOffered) {
    picker.push({
      key: 'stream',
      label: t('panel_stream'),
      desc: t('desc_stream'),
      req: t('reqStream'),
      available: false,
    })
  }
  void streamEnabled

  const labelOf = new Map(picker.map((i) => [i.key, i.label]))
  const presetChips = [
    ...(shipped ?? []).map((p) => ({
      id: `shipped:${p.key}`,
      title: p.title,
      panels: (p.panels as string[]).filter((k) => offered.includes(k)),
      own: false,
    })),
    ...(savedLayouts ?? [])
      .filter((l) => l.user_id === null)
      .map((l) => ({
        id: l.id,
        title: l.title,
        panels: readPanels(l.panels, offered).map((e) => e.key),
        own: true,
      })),
  ]

  const chooserPresets = (shipped ?? []).map((p) => ({
    id: p.key,
    title: p.title,
    description: p.description,
    panels: (p.panels as string[]).filter((k) => offered.includes(k)),
    tint: p.tint,
    panelLabels: (p.panels as string[])
      .filter((k) => offered.includes(k))
      .map((k) => labelOf.get(k) ?? k),
  }))

  // Which panels may be pinned into a report. The bundle's rule is
  // `arche === "agg"` (NEW:3681); `in_report` is the schema's. Both are
  // required and they are not the same set: `per_virksomhet` IS a report
  // section but the bundle does not offer it as a pin, and `duties` is neither.
  // Intersecting them keeps the drawing and keeps the button's count equal to
  // the sections the report will actually contain.
  const pinnable = new Set(
    (panelTypes ?? [])
      .filter((t) => t.in_report && archetypeOf(t.key) === 'agg')
      .map((t) => t.key),
  )

  /* ── G1: ONE FETCH PER DISTINCT SCOPE, NOT ONE PER PANEL ──────────────────
   *
   * A panel may override the dashboard's survey, period and group (M:0137), so
   * the figures are no longer one dataset — they are one dataset PER SCOPE.
   *
   * `distinctScopes` collapses panels that share a scope, and on a dashboard
   * where nothing is overridden it returns exactly one, so this does the same
   * work it did before G1. The cost is proportional to the number of DIFFERENT
   * questions asked, not to the number of panels.
   *
   * THE GATE IS UNTOUCHED AND THAT IS THE POINT. Narrowing happens by passing
   * a smaller `surveys`/`group` to the SAME SECURITY DEFINER RPCs — every one
   * of which calls `app.k_for` on its own data. A per-panel filter therefore
   * makes the gate MATTER MORE, not less, and there is nothing here that could
   * weaken it: this file has no threshold in it and cannot acquire one.
   */
  const dashFilters = { period, group_id: group, survey_ids: selected }
  const scopes = distinctScopes(panels, dashFilters)
  /* THE DASHBOARD'S OWN SCOPE IS ALWAYS FETCHED, even when every panel
     overrides it and even when there are no panels at all. The filter line,
     the meta bar and the empty state all describe the dashboard rather than
     any panel, so `base` below must exist — deriving it with `!` from a list
     that legitimately might not contain it would be a fabricated value of
     exactly the kind this project refuses. */
  if (!scopes.some((sc) => scopeKey(sc) === scopeKey(dashFilters))) scopes.unshift({ ...dashFilters })

  // Rounds for the UNION of every scope, in one query, then sliced per scope in
  // memory. Per-scope round queries would be the obvious shape and would issue
  // one round-trip per distinct scope for data that overlaps almost entirely.
  const unionSurveys = [...new Set(scopes.flatMap((sc) => sc.survey_ids))]
  const { data: rounds } = await supabase
    .from('survey_rounds')
    .select('id, survey_id, round_no, opens_at')
    .in('survey_id', unionSurveys.length ? unionSurveys : ['00000000-0000-0000-0000-000000000000'])
    .order('round_no', { ascending: false })

  const perSurvey = new Map<string, { id: string; round_no: number }[]>()
  for (const r of rounds ?? []) {
    const bucket = perSurvey.get(r.survey_id) ?? []
    bucket.push({ id: r.id, round_no: r.round_no })
    perSurvey.set(r.survey_id, bucket)
  }
  /** The period as a set of rounds: the latest per survey, the latest two, or
   *  all of them. Unchanged from before G1 — only its input is now a scope. */
  const roundsFor = (sc: PanelScope): string[] | null => {
    if (sc.period === 'y') return null
    const take = sc.period === 'q' ? 1 : 2
    return sc.survey_ids.flatMap((id) => (perSurvey.get(id) ?? []).slice(0, take).map((r) => r.id))
  }

  const bundles = new Map<string, ScopeBundle>()
  await Promise.all(
    scopes.map(async (sc) => {
      const roundIds = roundsFor(sc)
      const [summary, heatmap] = await Promise.all([
        readDashboard(viewer.orgId, sc.survey_ids, sc.group_id, roundIds),
        readHeatmap(viewer.orgId, sc.survey_ids, sc.group_id, roundIds),
      ])

      // Trends and themes are per-survey RPCs, so the cross-survey panels are
      // the union of per-survey reads. That is deliberate rather than a
      // shortcut: each survey's gate is applied to its OWN data, and merging
      // afterwards can only combine cells that already survived. A theme gated
      // in every survey never appears in the merged list, which a single
      // cross-survey query with one contributor count could not guarantee.
      const perSurveyReads = await Promise.all(
        sc.survey_ids.map(async (id) => ({
          id,
          title: available.find((x) => x.id === id)?.title ?? '',
          trends: await readTrends(id, sc.group_id),
          themes: await readThemes(id, roundIds, sc.group_id),
        })),
      )

      const trendBars: { key: string; label: string; avg: number | null }[] = []
      for (const sv of perSurveyReads) {
        const points: TrendPoint[] = sv.trends?.points ?? []
        const inScope = roundIds ? points.filter((pt) => roundIds.includes(pt.round_id)) : points
        for (const pt of [...inScope].sort((a, b) => a.round_no - b.round_no)) {
          trendBars.push({
            key: pt.round_id,
            label: `${sv.title} · ${pt.round_no}`,
            avg: isGated(pt) ? null : pt.avg,
          })
        }
      }

      const merged = new Map<string, Theme>()
      for (const sv of perSurveyReads) {
        for (const theme of sv.themes?.themes ?? []) {
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

      bundles.set(scopeKey(sc), {
        summary,
        heatmap,
        trendBars,
        themes: [...merged.values()].sort((a, b) => b.mentions - a.mentions),
        // The scope's OWN threshold, derived exactly as the screen derived the
        // page-level one before G1: the summary's k, or the heatmap's when the
        // summary itself was refused.
        trendK: summary?.k ?? heatmap?.k ?? null,
      })
    }),
  )

  /* The dashboard's OWN bundle — what the filter line and the meta bar
     describe, and what a panel with no override renders. */
  const base = bundles.get(scopeKey(dashFilters))!
  /* Only the two the PAGE itself still needs: the filter line's response count
     and the heatmap's k. The trend bars and themes are read per panel from
     `bundles`, so there is no page-level copy to drift from them. */
  const { summary, heatmap } = base

  // ── The two non-aggregate panels (NEW:1138-1163) ──────────────────────────
  // Read only when the LAYOUT contains them: a panel nobody has added is a
  // query nobody asked for, and the register RPC is not free.
  const wants = new Set(panels.map((p) => p.key))

  const orgSurvey = available.find(
    (s) => selected.includes(s.id) && s.respondent_kind === 'organisation',
  )
  const register =
    wants.has('per_virksomhet') && orgSurvey
      ? registerStats(await readAttributed(orgSurvey.id), {
          answered: t('regAnswered'),
          breaches: t('regBreaches'),
          overdue: t('regOverdue'),
          noBreachQuestion: t('regNoBreachQuestion'),
        })
      : null

  /* F3 — the «På tvers» card's rate. ORG-WIDE, which is what the words mean,
     and deliberately NOT `available` above: that set excludes drafts and is
     narrowed by the period, so reusing it would give Innsikt a different «på
     tvers» percentage from Undersøkelser's and Rapporter's for the same
     organisation. Two cards with the same title showing two numbers is the
     population defect F1 closed, wearing a layout's clothes.

     `rateOf` forms the ratio, so the drawing's own `sum(target || 30)`
     (v6:8238) — an invented denominator of thirty per survey with no recipient
     count — is not reproduced. */
  const [{ data: crossRows }, { data: crossCounts }, { count: reportCount }] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, target')
      .eq('org_id', viewer.orgId)
      .is('deleted_at', null),
    supabase.rpc('survey_response_counts', { p_org: viewer.orgId }),
    supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', viewer.orgId)
      .is('deleted_at', null),
  ])
  const crossResponses = new Map((crossCounts ?? []).map((c) => [c.survey_id, Number(c.responses)]))
  const crossRate = rateOf(
    (crossRows ?? []).map((r) => ({
      id: r.id,
      target: r.target,
      responses: crossResponses.get(r.id) ?? 0,
    })),
  )

  const duties = wants.has('duties')
    ? await (async () => {
        const [{ data: defs }, { data: rows }] = await Promise.all([
          supabase
            .from('duty_definitions')
            .select('key, title, law')
            .order('key'),
          supabase
            .from('duties')
            .select('definition_key, next_due_at, owner_member_id, org_members(name)')
            .eq('org_id', viewer.orgId),
        ])
        return dutyRows(defs ?? [], rows ?? [], locale)
      })()
    : []

  return (
    <DashboardScreen
      surveys={available}
      selected={selected}
      groups={groups ?? []}
      summary={summary}
      heatmap={heatmap}
      filterLine={t('filterLine', {
        surveys: selected.length,
        responses: summary?.n ?? 0,
        group: group ? ((groups ?? []).find((g) => g.id === group)?.name ?? '') : t('allGroups'),
      })}
      pinned={(pins ?? []).map((p) => p.panel_key)}
      panels={panels}
      needsSetup={needsSetup}
      pinnable={pinnable}
      picker={picker}
      presetChips={presetChips}
      chooserPresets={chooserPresets}
      customizeOpen={tilpass !== undefined && !viewingOther}
      canEdit={viewer.role === 'administrator' || viewer.role === 'redaktor'}
      layoutFilters={dashFilters}
      bundles={bundles}
      cols={cols}
      meta={{
        ownerName: dashOwnerName,
        shares: dashShares,
        reportCount: dashReportCount,
        hasDashboard: dashboardId !== null,
      }}
      register={register}
      registerHref={orgSurvey ? `/undersokelser/${orgSurvey.id}/resultater` : null}
      duties={duties}
      cross={{ measured: crossRate, surveyTotal: (crossRows ?? []).length, reports: reportCount ?? 0 }}
    />
  )
}
