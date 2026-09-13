import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { numberWord } from '@/lib/respondent/anonymity-promise'
import { ReportDocument } from './ReportDocument'
import { ReportSidePanel } from './ReportSidePanel'
import type { ComposedDocument, EditorOptions, EditorReport, QuotePick } from './editor-types'

/**
 * The report editor — HeiTuva.dc.html:1092-1288.
 *
 * A two-column layout: the document on the left, the Innhold/Filter/Del rail on
 * the right. It is a state of `/rapporter` in the design (`repEditing`), not a
 * screen of its own, so it lives at `/rapporter?rapport=<id>`.
 *
 * The document is composed by `compose_report` on the server and handed down
 * already gated. Nothing below re-derives a number from parts.
 */
export async function ReportEditor({
  report,
  doc,
  options,
  canEdit,
  sectionLabels,
  counts,
  pptxEnabled,
  quotePicks,
  quotesChosen,
}: {
  report: EditorReport
  doc: ComposedDocument
  options: EditorOptions
  canEdit: boolean
  sectionLabels: Record<string, string>
  counts: string
  pptxEnabled: boolean
  quotePicks: QuotePick[]
  quotesChosen: string[]
}) {
  const t = await getTranslations('reports')
  // The document's threshold in words for the section notes — the strictest
  // among its sources, as compose_report applied it (Q17).
  const kWord = numberWord(doc.k ?? 5, await getLocale())

  const chosen = options.surveys.filter((s) => report.filters.surveys.includes(s.id))
  const responses = chosen.reduce((sum, s) => sum + s.responses, 0)
  const groupName = report.filters.group
    ? (options.groups.find((g) => g.id === report.filters.group)?.name ?? t('docFilterAllGroups'))
    : t('docFilterAllGroups')

  // WALK 2026-09-12 (W-07): a <main>, not a <div>. Every control on this screen
  // sat outside any landmark, so a screen-reader user navigating by landmark
  // could not reach it — and the definition of done names keyboard and
  // focus-visible explicitly. Every other screen in the product has one. The
  // classes are unchanged, so nothing moves a pixel.
  return (
    <main className="animate-enter pt-[34px]">
      {/* The design keeps the screen's own header while editing and puts the
          back control top-right as a bordered button (HeiTuva.dc.html:1065). */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-medium">{t('title')}</h1>
          <p className="mt-[3px] text-[13px] text-mut">{counts}</p>
        </div>
        <Link
          href="/rapporter?fane=mine"
          className="touch-44 inline-flex items-center whitespace-nowrap rounded-[10px] border border-line bg-transparent px-5 py-3 text-[13px] font-semibold text-ink no-underline"
        >
          {t('backToReports')}
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1fr_340px]">
        <ReportDocument
          report={report}
          doc={doc}
          options={options}
          canEdit={canEdit}
          labels={{
            empty: t('docEmpty'),
            meta: t('docMeta', {
              period: t('periodAll'),
              date: new Date().toLocaleDateString('nb-NO', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            }),
            filterLine: t('docFilterLine', {
              surveys:
                chosen.length === 1
                  ? t('surveyCountOne')
                  : t('surveyCountOther', { count: chosen.length }),
              responses,
              group: groupName,
            }),
            sectionGroupLabel: t('sectionGroupLabel'),
            allGroups: t('sectionAllGroups'),
            up: t('moveUp'),
            down: t('moveDown'),
            remove: t('removeSection'),
            draft: t('draft'),
            suppressedRow: t('suppressedRow'),
            suppressedNote: t('suppressedNote', { count: doc.suppressed_groups?.length ?? 0 }),
            insufficient: t('insufficientCell'),
            noSurvey: t('noSurveySelected'),
            sourceSnapshot: t('sourceSnapshot', {
              date: new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' }),
            }),
            sourceLive: t('sourceLive'),
            pending: t('sectionPending'),
            pendingSub: t('sectionPendingSub'),
            methodK: t('methodK', { k: 0 }).replace('0', '{k}'),
            methodAttributed: t('methodAttributed'),
            sectionUnavailable: t('sectionUnavailable'),
            unavailablePersonSources: t('unavailablePersonSources'),
            perVirksomhetPending: t('perVirksomhetPending'),
            sourceLowerK: t('sourceLowerK', { title: '{title}', k: '{k}', docK: '{docK}' }),
            trendRound: t('trendRound', { n: 0 }).replace('0', '{n}'),
            driversHigh: t('driversHigh'),
            driversLow: t('driversLow'),
            invited: t('participationInvited'),
            responded: t('participationResponded'),
            themeMentions: t('themeMentions', { label: '{label}', count: '{count}' }),
            quotesFallback: t('quotesFallback'),
            summaryEmpty: t('summaryEmpty'),
            quotesPicked: t('quotesPicked'),
            quotesWithheld: t('quotesWithheld', { count: 0 }).replace('0', '{count}'),
            frozen: doc.frozen_at
              ? t('frozenAt', {
                  date: new Date(doc.frozen_at).toLocaleDateString('nb-NO', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                })
              : null,
            // The design puts a muted explanation under a section — it is where
            // "Ledelse har færre enn fem svar og vises ikke" lives.
            notes: {
              teams: t('noteTeams', { kWord }),
              heatmap: t('noteTeams', { kWord }),
              trend: t('noteTrend'),
              themes: t('noteThemes'),
            },
            sectionLabels,
          }}
        />

        <ReportSidePanel
          report={report}
          options={options}
          canEdit={canEdit}
          pptxEnabled={pptxEnabled}
          quotePicks={quotePicks}
          quotesChosen={quotesChosen}
          labels={{
            content: t('content'),
            filter: t('filter'),
            share: t('share'),
            builtFrom: t('builtFrom', { base: report.baseTemplate ?? report.title }),
            period: t('period'),
            periodLast: t('periodLast'),
            periodTwo: t('periodTwo'),
            periodAll: t('periodAll'),
            group: t('group'),
            allGroups: t('sectionAllGroups'),
            surveys: t('surveys'),
            groupThreshold: t('groupThreshold'),
            strictestK: t('strictestK', { k: 0 }).replace('0', '{k}'),
            strictestNone: t('strictestNone'),
            sourceLowerK: t('sourceLowerK', { title: '{title}', k: '{k}', docK: '{docK}' }),
            unavailablePersonSources: t('unavailablePersonSources'),
            whoSees: t('whoSees'),
            roles: [
              { key: 'ledelse', label: t('shareHr'), desc: t('shareHrDesc') },
              { key: 'ledere_eget_team', label: t('shareLeder'), desc: t('shareLederDesc') },
              { key: 'alle_ansatte', label: t('shareAlle'), desc: t('shareAlleDesc') },
            ],
            copyLink: t('copyLink'),
            exportPdf: t('exportPdf'),
            exportPptx: t('exportPptx'),
            leaderScopeNote: t('leaderScopeNote'),
            plannedSend: t('plannedSend'),
            scheduleOptions: [
              { key: 'none', label: t('scheduleNone') },
              { key: 'weekly', label: t('scheduleWeekly') },
              { key: 'monthly', label: t('scheduleMonthly') },
              { key: 'round', label: t('scheduleRound') },
            ],
            scheduleNotes: {
              none: t('scheduleNoteNone'),
              weekly: t('scheduleNoteWeekly'),
              monthly: t('scheduleNoteMonthly'),
              round: t('scheduleNoteRound'),
            },
            planSend: t('planSendCta'),
            closeSheet: t('closeSheet'),
            surveyChipMeta: t('surveyChipMeta', { status: '{status}', count: '{count}' }),
            pickQuotes: t('pickQuotes'),
            quotesEmpty: t('quotesEmpty'),
            summary: t('reportSummary', {
              sections: report.sections.length,
              period: t('periodShortAll'),
            }),
            saveReport: t('saveReport'),
          }}
        />
      </div>
    </main>
  )
}
