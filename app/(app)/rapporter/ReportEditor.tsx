import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ReportDocument } from './ReportDocument'
import { ReportSidePanel } from './ReportSidePanel'
import type { ComposedDocument, EditorOptions, EditorReport } from './editor-types'

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
}: {
  report: EditorReport
  doc: ComposedDocument
  options: EditorOptions
  canEdit: boolean
  sectionLabels: Record<string, string>
}) {
  const t = await getTranslations('reports')

  const chosen = options.surveys.filter((s) => report.filters.surveys.includes(s.id))
  const responses = chosen.reduce((sum, s) => sum + s.responses, 0)
  const groupName = report.filters.group
    ? (options.groups.find((g) => g.id === report.filters.group)?.name ?? t('docFilterAllGroups'))
    : t('docFilterAllGroups')

  return (
    <div className="max-w-[1080px] animate-enter pt-[34px]">
      <Link
        href="/rapporter?fane=mine"
        className="touch-44 inline-flex items-center text-[13px] text-mut no-underline"
      >
        {t('backToReports')}
      </Link>

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
            sectionLabels,
          }}
        />

        <ReportSidePanel
          report={report}
          options={options}
          canEdit={canEdit}
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
            planSend: t('planSend'),
            summary: t('reportSummary', {
              sections: report.sections.length,
              period: t('periodShortAll'),
            }),
            saveReport: t('saveReport'),
          }}
        />
      </div>
    </div>
  )
}
