import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { numberWord } from '@/lib/respondent/anonymity-promise'
import { DASH, fmt, heatTone, no, panelTone, pctOf5 } from '@/lib/results/present'
import { isGated, type DashboardSummary, type Heatmap, type Theme } from '@/lib/results/types'
import { PinButton } from './PinButton'
import { OpenPinnedButton } from './OpenPinnedButton'
import { FreezeButton } from './FreezeButton'
import { CustomizeCard, type PickerItem, type PresetChip } from './CustomizeCard'
import { PanelControls } from './PanelControls'
import { PresetChooser } from './PresetChooser'
import { CustomizeToggle } from './CustomizeToggle'
import { thresholdLine as thresholdLineOf } from '@/lib/dashboard/threshold-line'
import { selectionLine } from '@/lib/dashboard/selection-line'
import { MetaBar } from './MetaBar'
import { PageHeader, PARTICIPATION } from '@/components/PageHeader'
import type { Measured } from '@/lib/surveys/participation'
import type { LayoutFilters, PanelEntry, Cols } from '@/lib/dashboard/layout'
import { PANEL_MIN_H, scopeFor, scopeKey, spanOf } from '@/lib/dashboard/layout'

/**
 * The figures for ONE panel scope — G1.
 *
 * A panel may narrow the dashboard's survey, period or group (M:0137), so the
 * page fetches one of these per DISTINCT scope and the panel looks its own up.
 * Every field in here came out of a SECURITY DEFINER RPC that called
 * `app.k_for` on the narrowed population, so `k` is that scope's threshold and
 * a suppressed cell is suppressed against the scope the reader is looking at.
 */
export type ScopeBundle = {
  summary: DashboardSummary | null
  heatmap: Heatmap | null
  trendBars: { key: string; label: string; avg: number | null }[]
  themes: Theme[]
  /** The gate's own number for this scope: the summary's, or the heatmap's
   *  when the summary is refused outright. Never the page's. */
  trendK: number | null
}
import type { DutyRow, RegisterStat } from '@/lib/dashboard/panels'

const CARD = 'rounded-2xl border border-line bg-sf p-[22px]'

export async function DashboardScreen({
  surveys,
  selected,
  groups,
  summary,
  heatmap,
  bundles,
  cols,
  filterLine,
  pinned,
  panels,
  needsSetup,
  pinnable,
  picker,
  presetChips,
  chooserPresets,
  customizeOpen,
  canEdit,
  layoutFilters,
  meta,
  register,
  registerHref,
  duties,
  cross,
}: {
  surveys: { id: string; title: string; status: string }[]
  selected: string[]
  groups: { id: string; name: string }[]
  summary: DashboardSummary | null
  heatmap: Heatmap | null
  /* `trendBars` and `themes` are NOT props any more. Before G1 the page
     computed one set and every panel rendered it; now each panel reads its own
     scope's bundle, so a page-level copy would be a second source that the
     trend and theme panels could silently fall back to. Removing it is what
     makes «a panel shows its own scope» structural rather than careful. */
  /** G1 — one entry per DISTINCT panel scope, keyed by `scopeKey`. A panel
   *  with no overrides finds the dashboard's own bundle here under the same
   *  key, so there is one code path rather than a default and a special case. */
  bundles: Map<string, ScopeBundle>
  cols: Cols
  filterLine: string
  /** The member's own pins, from `dashboard_pins`. */
  pinned: string[]
  /** The member's working layout (Q25) — ordered keys with widths. */
  panels: PanelEntry[]
  /** No working row yet: the first-run preset chooser, not an empty board. */
  needsSetup: boolean
  /** Panels that may become a report section — the bundle's `arche === 'agg'`
   *  intersected with the registry's `in_report` (see page.tsx). */
  pinnable: Set<string>
  picker: PickerItem[]
  presetChips: PresetChip[]
  chooserPresets: {
    id: string
    title: string
    description: string
    panels: string[]
    tint: string | null
    panelLabels: string[]
  }[]
  customizeOpen: boolean
  canEdit: boolean
  /** The period, group and selection in one value — the same shape a stored
   *  layout holds. They used to arrive as separate props too; passing the same
   *  fact twice is the drift shape this phase kept meeting, so there is one. */
  layoutFilters: LayoutFilters
  /** F5 — the three meta cells that needed the entity. `hasDashboard` is false
   *  for a layout that predates M:0132's backfill; the strip then shows only
   *  the two cells that never depended on it. */
  meta: {
    ownerName: string | null
    shares: { scope: string; role: string | null }[]
    reportCount: number
    hasDashboard: boolean
  }
  /** Null when no organisation survey is in the selection — the panel then
   *  states that, rather than drawing three zeros (Q42's k=0 lesson one
   *  surface over: a real zero and an absent denominator look identical). */
  register: RegisterStat[] | null
  registerHref: string | null
  duties: DutyRow[]
  /** F3 — the «På tvers» card's figures. The RATE arrives as `rateOf`'s result
   *  and the number of rows it was formed over, never as a percentage: a screen
   *  free to pass a number is a screen free to pass the wrong one. */
  cross: { measured: Measured | null; surveyTotal: number; reports: number }
}) {
  const t = await getTranslations('dashboard')
  const tr = await getTranslations('results')
  const tNav = await getTranslations('nav')
  const tReports = await getTranslations('reports')
  const locale = await getLocale()
  // The strictest threshold across the selected surveys, as the RPCs applied
  // it (Q17). Null only when there is nothing to show — then no cell is gated.
  const heatK = heatmap?.k ?? null
  const trendK = summary?.k ?? heatK

  const isPinned = new Set(pinned)
  const pin = (key: string) => (
    <PinButton
      panelKey={key}
      pinned={isPinned.has(key)}
      labelOn={t('pinnedOn')}
      labelOff={t('pinnedOff')}
    />
  )

  // Same rule as Resultater: a failed read renders as the em dash, not as zero.
  // "0 svar i utvalget" is a claim about the organisation; "—" is a claim about
  // the request.
  const unavailable = summary === null
  const completion = summary?.completion ?? null
  const pct = completion === null ? null : Math.round(completion * 100)

  // "Høyest og lavest" — the three best and three worst, as the design draws
  // them. Every driver in the list already carries a real n past the gate; a
  // gated question is not in the payload at all, so there is nothing to filter.
  const drivers = summary?.drivers ?? []
  const highest = drivers.slice(0, 3)
  const lowest = drivers.slice(-3).reverse().filter((d) => !highest.includes(d))

  const stats = [
    {
      key: 'responses',
      label: t('statResponses'),
      value: summary ? String(summary.n) : DASH,
      note: summary ? t('statResponsesNote', { invited: summary.invited }) : DASH,
    },
    {
      key: 'rate',
      label: t('statRate'),
      value: pct === null ? DASH : `${pct} %`,
      /* V5-1 — «over målet på 70 %» IS GONE, AND IT WAS LIVE, NOT DRAWN.
         `dash.statRateAbove`/`statRateBelow` told every organisation it was
         above or below a 70 % response-rate target, with the 70 a literal here
         and a second copy of it inside the sentence. **There is no goal column
         anywhere in the schema**, so the target belonged to nobody: a manager
         read it as their own.

         Found from the v5 bundle's `c.hasGoal`, which draws a goal marker at
         `left:70%` titled «Mål: 70 %» — and checking whether that was buildable
         turned up the sentence already shipped. The bundle's marker is not
         built either.

         The note now says what the number IS — the denominator it is a
         percentage OF — which is the same treatment the card above it already
         gives («31 av 42 inviterte»). Setting response-rate targets is a
         feature, and it is one nobody has asked for. */
      note:
        unavailable || summary === null
          ? DASH
          : t('statRateNote', { invited: summary.invited, n: summary.n }),
    },
    {
      key: 'avg',
      label: t('statAvg'),
      value: fmt(summary?.avg ?? null),
      note: t('statAvgNote'),
    },
    {
      key: 'surveys',
      label: t('statSurveys'),
      value: String(selected.length),
      note: t('statSurveysNote', { total: surveys.length }),
    },
  ]

  // Q42: the threshold sentence, from the one definition that also decides
  // what to say when there is none. `k = 0` is an ORGANISATION-only selection
  // and gets its own sentence rather than the numeral, because «… terskel …: 0»
  // is true and reads as broken.
  const line = thresholdLineOf(trendK)
  const thresholdText = t(line.key, line.values as never)

  /* T5.1 — v8's meta strip, carrying the two of its five cells that describe
     real state. `MetaBar`'s own header records what the other three would need
     and why rendering them would be an invention. */
  const sel = selectionLine(layoutFilters, groups)
  /* F5 — all five of v8's cells (v8:2423-2431), each rendered only when it has
     something true to say. «Eier» and «Delt med» and «Rapporter» became
     answerable at M:0132/M:0134; before that T5 left them out rather than
     invent them, and the three still drop out for a layout with no parent. */
  const shareScope =
    meta.shares.length === 0 ? null
    : (meta.shares.find((sh) => sh.scope === 'role')?.role ?? 'link')
  const metaCells = [
    ...(meta.ownerName
      ? [{ key: 'owner', label: t('metaOwner'), value: meta.ownerName }]
      : []),
    {
      key: 'selection',
      label: t('metaSelection'),
      value: [t(sel.periodKey), sel.groupName ?? t('allGroups')].join(' · '),
    },
    {
      key: 'privacy',
      label: t('metaPrivacy'),
      value: thresholdText,
      note: t('thresholdScope'),
    },
    ...(meta.hasDashboard
      ? [
          {
            key: 'shared',
            label: t('metaShared'),
            // v8's three roles, verbatim from v8:8980-8982. `null` is «Ikke
            // delt» — a real state now that a dashboard CAN be shared, where
            // before the entity it was the only state the cell could ever hold.
            value:
              shareScope === null ? t('metaNotShared')
              : shareScope === 'link' ? t('metaSharedLink')
              : t(`metaRole_${shareScope}` as 'metaRole_leser'),
          },
          {
            key: 'reports',
            label: t('metaReports'),
            value:
              meta.reportCount === 0
                ? t('metaReportsNone')
                : t('metaReportsCount', { count: meta.reportCount }),
            note: meta.reportCount === 0 ? undefined : t('metaReportsNote'),
          },
        ]
      : []),
  ]

  /**
   * One arm per key the registry offers on the dashboard. Exhaustive by
   * construction: a layout may only hold a registry key, and a key with no arm
   * returns null rather than an empty card.
   *
   * Every body below is the one the fixed grid had, moved unchanged — the
   * panels themselves are not what this phase alters. What changed is that
   * their ORDER, WIDTH and PRESENCE come from the layout instead of from this
   * file, and their header action is the move/width/remove control set with
   * the pin beside it where a panel may become a report section.
   */
  /* G1 — a panel renders from ITS OWN scope's figures, not the page's. The
     bundle is a PARAMETER rather than a closure read, so a panel cannot show
     the dashboard's numbers while claiming its own scope: the narrowed values
     are the only ones reachable in here. */
  const renderPanel = (key: string, controls: React.ReactNode, b: ScopeBundle): React.ReactNode => {
    switch (key) {
      case 'trend':
        return (
<Panel title={t('panel_trend')} note={t('note_trend')} action={controls}>
        {b.trendBars.length ? (
          <div className="mt-[14px] flex flex-col gap-[9px]">
            {b.trendBars.map((bar) => (
              <BarRow
                key={bar.key}
                label={bar.label}
                value={bar.avg === null ? tr('gatedCell', { k: b.trendK ?? 0 }) : no(bar.avg)}
                pct={bar.avg === null ? 0 : pctOf5(bar.avg)}
                color={bar.avg === null ? 'var(--sf2)' : 'var(--ac)'}
              />
            ))}
          </div>
        ) : (
          <Empty text={t('noData')} />
        )}
      </Panel>
        )
      case 'heatmap':
        return (
<Panel
          title={t('panel_heatmap')}
          note={heatK === null ? t('heatNoteGeneric') : t('heatNote', { k: heatK, kWord: numberWord(heatK, locale) })}
          action={controls}
        >
          <HeatGrid heatmap={b.heatmap} gated={tr('gatedCell', { k: b.heatmap?.k ?? 0 })} gatedTitle={tr('gatedTitle', { k: b.heatmap?.k ?? 0 })} empty={t('noData')} />
        </Panel>
        )
      case 'drivers':
        return (
<Panel title={t('panel_drivers')} note={t('note_drivers')} action={controls}>
        {highest.length || lowest.length ? (
          <div className="mt-[14px] flex flex-col gap-[9px]">
            {highest.map((d) => (
              <BarRow key={`h-${d.question_id}`} label={d.text} value={no(d.avg)} pct={pctOf5(d.avg)} color="var(--ac2)" />
            ))}
            {lowest.map((d) => (
              <BarRow key={`l-${d.question_id}`} label={d.text} value={no(d.avg)} pct={pctOf5(d.avg)} color="var(--ac3)" />
            ))}
          </div>
        ) : (
          <Empty text={t('noData')} />
        )}
      </Panel>
        )
      case 'themes':
        return (
<Panel title={t('panel_themes')} note={t('note_themes')} action={controls}>
        {b.themes.length ? (
          <div className="mt-[14px] flex flex-wrap gap-2">
            {b.themes.map((theme) => (
              <span key={theme.key} className="rounded-full bg-sbg px-[14px] py-2 text-[13px]">
                {/* The dashboard's own wording, not Resultater's: the
                    design writes "tid · nevnt 19 ganger" on both screens
                    (HeiTuva.dc.html:1466), and the short form here read as a
                    count of something unnamed. */}
                {t('themeMentions', { label: theme.label, count: theme.mentions })}
              </span>
            ))}
          </div>
        ) : (
          <Empty text={tr('themesEmpty')} />
        )}
      </Panel>
        )
      case 'per_virksomhet':
        return (
          <Panel
            title={t('panel_per_virksomhet')}
            note={register ? t('registerNoteLive') : t('registerNoteNone')}
            action={controls}
          >
            {register ? (
              <>
                <div className="mt-[14px] grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                  {register.map((s) => (
                    <div
                      key={s.key}
                      className="rounded-xl border border-line bg-bg px-4 py-[14px]"
                    >
                      {/* D102: a null value is «there is no number», drawn the
                          same way a gated cell is. Never a 0 standing in for an
                          undefined numerator. */}
                      <div className="font-display text-[26px] font-bold leading-none">
                        {s.value ?? '—'}
                      </div>
                      <div className="mt-1 text-[12.5px] leading-[1.35] text-mut">{s.label}</div>
                    </div>
                  ))}
                </div>
                {registerHref ? (
                  <Link
                    href={registerHref}
                    className="mt-3 inline-block text-[13px] font-semibold text-ink underline"
                  >
                    {t('openRegister')}
                  </Link>
                ) : null}
              </>
            ) : (
              /* Not three zeros: a real zero and an absent denominator look
                 identical, and «0 av 0 virksomheter har svart» reads as a
                 finding rather than as the absence of a survey. */
              <Empty text={t('registerNone')} />
            )}
          </Panel>
        )
      case 'duties':
        return (
          <Panel title={t('panel_duties')} note={t('note_duties')} action={controls}>
            {duties.length ? (
              <div className="mt-[10px] flex flex-col">
                {duties.map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center gap-3 border-b border-line py-[11px]"
                  >
                    <span
                      aria-hidden="true"
                      className="block h-[9px] w-[9px] flex-none rounded-full"
                      style={{ background: d.tone }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">{d.title}</span>
                      <span className="mt-px block text-[12px] text-mut">
                        {[d.law, d.owner ?? t('dutyNoOwner')].join(' · ')}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-[12.5px]">
                      {d.due ?? t('dutyNoDue')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text={t('noData')} />
            )}
          </Panel>
        )
      default:
        return null
    }
  }


  return (
    <div className="animate-enter">
      {/* F3 — the two-column band, the fourth of the four screens v6 draws it
          on (v6:2476-2497). The breadcrumb above it is the shell's now, which
          is why the `pt-[34px]` this screen carried is gone: `Breadcrumb`
          holds v6:2467's `padding-top:26px` once, for every screen that has
          one. */}
      <PageHeader
        title={tNav('insight')}
        /* v6:8244 — `n ? n + " paneler på skjermen" : "Ingen paneler valgt ennå"`. */
        counts={panels.length ? t('bandPanels', { n: panels.length }) : t('bandNoPanels')}
        /* v6:8247 is «periode · gruppe». Ours is longer because this screen
           has more to say about its own scope than the mock did, and every
           clause of it already shipped: the selection, the group, and — Q42 —
           the threshold the RPCs ACTUALLY applied. The band moved the sentence;
           it did not shorten it. */
        scope={
          unavailable
            ? t('unavailable')
            : [t('liveNumbers'), filterLine, trendK === null ? null : thresholdText]
                .filter(Boolean)
                .join(' · ')
        }
        /* One key, read by both Innsikt screens, because v6 has one `insLead`
           (v6:8249) rendered at 2480 and again at 2804. Two copies of a
           sentence under one nav item is how the two drift. */
        lead={tReports('insightLead')}
        cross={{
          /* v6:2485 gates «Frys som rapport» on `dashReady`, which is
             `!!(layout && layout.length)` (v6:8254) — the same condition this
             button already had, so it moves into the card's action slot
             unchanged rather than gaining a second rule. */
          action: panels.length ? (
            <FreezeButton
              label={t('freeze')}
              title={t('frozenReportTitle', {
                date: new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
              })}
            />
          ) : undefined,
          /* v6:8238's order, minus its second chip. «snitt av 5,0» is NOT
             built here, and the reason is the population rather than the gate:
             the only average this screen has is `summary.avg`, which is over
             the SELECTED surveys and the chosen period, and it is already
             drawn four rows down as `statAvg`. Putting that number inside a
             card headed «På tvers» would state a selection's figure over the
             organisation — F1's defect exactly, in a card built to carry F1's
             rule. An org-wide average would need an aggregate nothing
             computes, and computing one here is what CLAUDE.md forbids. */
          chips: [
            PARTICIPATION,
            { value: String(cross.reports), label: t('chipReports') },
            { value: String(panels.length), label: t('chipPanels') },
          ],
          participation: { measured: cross.measured, total: cross.surveyTotal },
        }}
      />

      {/* v6:2500 draws a full control bar under the band — «Tilpass», the
          filter line as a button, the threshold as a pill and a transient
          note. Two of those are sentences this screen already shows in the
          band's scope line, so what is placed here is the two CONTROLS we
          have; the bar itself is the Innsikt screen's surface and not the
          shared band's, and it stays in the audit rather than being built
          inside a layout phase. */}
      <div className="mt-[18px] flex flex-wrap items-center justify-end gap-[10px]">
        {/* Q46: the period and group selects have LEFT the header — they are
            the first tab of the «Tilpass» card now (NEW:948-996). Q29's other
            control stays beside it: «Frys som rapport» reads the LAYOUT — the
            board as arranged — while «Åpne rapport (n)» reads the PINS. Two
            questions, two buttons, as the bundle draws (NEW:940). */}
        <CustomizeToggle label={t('customize')} open={customizeOpen} />
        <OpenPinnedButton
          count={pinned.length}
          label={t('openPinned')}
          title={t('pinnedReportTitle', {
            date: new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
          })}
        />
      </div>

      <CustomizeCard
        cols={cols}
        open={customizeOpen}
        panels={panels}
        filters={layoutFilters}
        surveys={surveys}
        groups={groups}
        picker={picker}
        presets={presetChips}
        canEdit={canEdit}
        thresholdLine={thresholdText}
        labels={{
          columns: t('columns'),
          columnsN: t('columnsN', { n: '{n}' }),
          title: t('customizeTitle'),
          tabData: t('tabData'),
          tabPanels: t('tabPanels'),
          tabLayout: t('tabLayout'),
          surveysLegend: t('surveysLegend'),
          thresholdScope: t('thresholdScope'),
          period: t('periodFilter'),
          group: t('groupFilter'),
          allGroups: t('allGroupsOption'),
          periodLast: t('periodLast'),
          periodTwo: t('periodTwo'),
          periodAll: t('periodAll'),
          pickerNote: t('pickerNote'),
          arche_agg: t('archeAgg'),
          archeQ_agg: t('archeAggQ'),
          arche_reg: t('archeReg'),
          archeQ_reg: t('archeRegQ'),
          arche_duty: t('archeDuty'),
          archeQ_duty: t('archeDutyQ'),
          add: t('panelAdd'),
          added: t('panelAdded'),
          unavailable: t('panelUnavailable'),
          saveLegend: t('saveLegend'),
          namePlaceholder: t('namePlaceholder'),
          save: t('savePreset'),
          saveNote: t('saveNote'),
          saveLeser: t('saveLeser'),
          saved: t('presetSaved'),
          duplicate: t('presetDuplicate'),
          saveFailed: t('presetFailed'),
          groupDropped: t('presetSavedGroupDropped'),
          groupWillNotTravel: t('groupWillNotTravel'),
          switchLegend: t('switchLegend'),
          deletePreset: t('deletePreset'),
          startOver: t('startOver'),
        }}
      />

      {/* T2 — v8's KPI row geometry (v8:2603-2612). What moved, and what did not:
          the track is `auto-fit` at 185px rather than three declared breakpoints,
          the gap 15 -> 14, the card 16px/20px padding -> 18px radius with 24/26
          padding, and the value 35px/700/1.05 -> 34px/600/1.1.

          `min-width:0` is on the card because an auto-fit track is `auto`, which
          resolves to max-content when nothing constrains it — F3's finding, and
          the reason its absence shows up as a page-wide overflow rather than as
          a wide card.

          THREE THINGS IN v8's CARD ARE DELIBERATELY NOT COPIED, because they are
          data and copy rather than geometry:
          - the label at 13px with `min-height:37px`. That height exists to align
            v8's two-line labels; ours are kickers («Svar», «Svarprosent»), so
            the constant would carry its context's assumption in and add dead
            space to every card. A constant is a property of the CONTROL, not of
            the pattern.
          - the `{{ c.chipLabel }}` / `{{ c.chipValue }}` chip that replaces the
            note. `stats` carries {key, label, value, note} and no chip exists in
            the schema; V5-1 already removed an invented figure from this exact
            card.
          - `{{ c.tint }}`, a per-card background the drawing supplies from its
            fixture and nothing here can derive. */}
      <MetaBar cells={metaCells} />

      <div className="mt-4 grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(185px,1fr))]">
        {stats.map((s) => (
          <div
            key={s.key}
            className="min-w-0 rounded-[18px] border border-line bg-sf px-[26px] py-6"
          >
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{s.label}</div>
            <div className="mt-2 font-display text-[34px] font-semibold leading-[1.1]">{s.value}</div>
            <div className="mt-[2px] text-[13px] text-mut">{s.note}</div>
          </div>
        ))}
      </div>

      {needsSetup ? (
        /* Q25: the one place the ORGANISATION is put in front of the member —
           "the organisation appears only in the first-run offer of presets".
           A member with no saved layout gets the shipped six, not an empty
           board (NEW:1042-1072). */
        <PresetChooser
          presets={chooserPresets}
          filters={layoutFilters}
          labels={{
            title: t('chooseSetup'),
            note: t('chooseSetupNote'),
            use: t('useSetup'),
          }}
        />
      ) : null}

      {/* Q51/Q25: the panels on screen are the member's LAYOUT, rendered in
          its order with its widths — not a fixed sequence. Each key is a
          registry row (M:0047), so `renderPanel` is exhaustive over what a
          layout can contain: the database refuses any other key on write, and
          `readPanels` drops one the registry has since retired. */}
      {/* Q51/Q25: the panels on screen are the member's LAYOUT, rendered in
          its order with its widths — not a fixed sequence. Each key is a
          registry row (M:0047), so `renderPanel` is exhaustive over what a
          layout can contain: the database refuses any other key on write, and
          `readPanels` drops one the registry has since retired.

          G1 — THE GEOMETRY IS v8's, each value from its own line:
            grid     `repeat(N,minmax(0,1fr))`     v8:8946
            gap      18px                          v8:2683
            span     `span N`, clamped Math.min(cols, n)   v8:7110 / 7237
            break    `1 / span N` when set         v8:7110's `brK` branch
            minH     lav 150px · normal 230px · hoy 340px  v8:7111
          `minmax(0,1fr)` rather than `1fr` is the bundle's own spelling and it
          is load-bearing: a bare `1fr` track resolves to max-content when a
          child cannot shrink, which is the grid overflow F3 spent a section on.

          Below `lg` the whole thing is ONE column regardless of span. There is
          no drawing under 1280px, and `docs/RESPONSIVE.md` governs: a six-wide
          panel at 390px would be six tracks of 65px. Span is a desktop
          statement, so it applies from `lg` up and collapses below. */}
      <div
        className="dash-grid mt-[18px] gap-[18px]"
        style={{ ['--dash-cols' as string]: `repeat(${cols},minmax(0,1fr))` }}
      >
        {panels.map((entry) => {
          const controls = (
            <span className="touch-cluster flex flex-wrap items-center justify-end gap-[6px]">
              <PanelControls
                panelKey={entry.key}
                panels={panels}
                filters={layoutFilters}
                cols={cols}
                surveys={surveys}
                groups={groups}
                labels={{
                  up: t('moveUp'),
                  down: t('moveDown'),
                  wide: t('makeWide'),
                  narrow: t('makeNarrow'),
                  remove: t('removePanel'),
                }}
                cfg={{
                  open: t('panelCfg'),
                  close: t('panelCfgClose'),
                  size: t('panelSize'),
                  height: t('panelHeight'),
                  lav: t('panelHeightLav'),
                  normal: t('panelHeightNormal'),
                  hoy: t('panelHeightHoy'),
                  brk: t('panelBreak'),
                  brkOn: t('panelBreakOn'),
                  scope: t('panelScope'),
                  srcAll: t('panelSrcAll'),
                  grpAll: t('panelGrpAll'),
                  perInherit: t('panelPeriodInherit'),
                  // The board's own period labels, reused rather than a second
                  // set: two vocabularies for one filter is how they diverge.
                  periods: { q: t('periodLast'), h: t('periodTwo'), y: t('periodAll') },
                }}
              />
              {pinnable.has(entry.key) ? pin(entry.key) : null}
            </span>
          )
          /* The panel's OWN bundle. `scopeFor` and `scopeKey` are the same two
             functions the page used to decide what to fetch, so the key a
             panel looks up here cannot drift from the key the page stored —
             one derivation, two callers, which is why neither is inlined. */
          const bundle = bundles.get(scopeKey(scopeFor(entry, layoutFilters)))
          if (!bundle) return null
          const inner = renderPanel(entry.key, controls, bundle)
          if (!inner) return null
          const n = spanOf(entry, cols)
          return (
            <div
              key={entry.key}
              className="dash-panel min-w-0"
              style={{
                ['--dash-span' as string]: entry.br ? `1 / span ${n}` : `span ${n}`,
                minHeight: PANEL_MIN_H[entry.h ?? 'normal'],
              }}
            >
              {inner}
            </div>
          )
        })}
      </div>

      {surveys.length === 0 ? (
        <div className={`${CARD} mt-[18px] text-center`}>
          <p className="font-display text-[21px] font-bold">{t('empty')}</p>
          <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-mut">
            {t('emptyBody')}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string
  note: string
  /** The design puts the pin on the panel's own header row, right-aligned. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[21px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
      <p className="mt-3 text-xs leading-[1.5] text-mut">{note}</p>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="mt-[14px] text-[13px] text-mut">{text}</p>
}

function BarRow({
  label,
  value,
  pct,
  color,
}: {
  label: string
  value: string
  pct: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[140px] flex-none truncate text-[12.5px] xl:w-[180px]" title={label}>
        {label}
      </span>
      <span className="block h-[14px] flex-1 overflow-hidden rounded-[7px] bg-sf2">
        <span className="block h-full rounded-[7px]" style={{ background: color, width: `${pct}%` }} />
      </span>
      <span className="w-[70px] flex-none text-right text-[12.5px] font-semibold">{value}</span>
    </div>
  )
}

/**
 * The heatmap grid, and below `md` the grouped list RESPONSIVE.md specifies:
 * one section per team, one row per question, the same colour scale and the
 * same gated treatment. Both are rendered from the same payload rather than
 * from two different reads, so they cannot disagree.
 */
function HeatGrid({
  heatmap,
  gated,
  gatedTitle,
  empty,
}: {
  heatmap: Heatmap | null
  gated: string
  gatedTitle: string
  empty: string
}) {
  if (!heatmap || heatmap.cols.length === 0 || heatmap.rows.length === 0) {
    return <Empty text={empty} />
  }
  const label = (text: string) => (text.length > 26 ? `${text.slice(0, 24)}…` : text)

  return (
    <>
      <div className="mt-[14px] hidden overflow-x-auto md:block">
        <div className="flex items-end gap-[6px] pl-[118px]">
          {heatmap.cols.map((c) => (
            <span key={c.question_id} className="min-w-[64px] flex-1 text-[10.5px] leading-[1.3] text-mut">
              {label(c.text)}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-[6px]">
          {heatmap.rows.map((row) => (
            <div key={row.group_id} className="flex items-center gap-[6px]">
              <span className="w-[112px] flex-none text-[12.5px] font-semibold">{row.label}</span>
              {row.cells.map((cell) => (
                <span
                  key={cell.question_id}
                  title={isGated(cell) ? gatedTitle : undefined}
                  className="flex h-[38px] min-w-[64px] flex-1 items-center justify-center rounded-lg text-[12.5px] font-semibold"
                  style={{ background: heatTone(cell) }}
                >
                  {isGated(cell) ? gated : no(cell.avg)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-[14px] flex flex-col gap-4 md:hidden">
        {heatmap.rows.map((row) => (
          <div key={row.group_id}>
            <div className="text-[12.5px] font-semibold">{row.label}</div>
            <div className="mt-2 flex flex-col gap-[6px]">
              {heatmap.cols.map((col) => {
                const cell = row.cells.find((c) => c.question_id === col.question_id)
                if (!cell) return null
                return (
                  <div key={col.question_id} className="flex items-center gap-[10px]">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-mut">{label(col.text)}</span>
                    <span
                      title={isGated(cell) ? gatedTitle : undefined}
                      className="flex h-11 w-[68px] flex-none items-center justify-center rounded-lg text-[12.5px] font-semibold"
                      style={{ background: heatTone(cell) }}
                    >
                      {isGated(cell) ? gated : no(cell.avg)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/** Kept beside the grid so the teams panel's ramp is defined once. */
export const teamBarTone = panelTone
