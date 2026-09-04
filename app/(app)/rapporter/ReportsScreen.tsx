import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { DutyCard } from './DutyCard'
import { DeleteReportButton, NewReportButton, ShareReportButton } from './ReportRowActions'
import type { DutyCardData, ReportTemplate, SavedReport } from './types'

/**
 * Status pill colours, verbatim from the design's map (HeiTuva.dc.html:3028).
 * `#E4F2E0` / `#2F5D2A` are the same literal green pair the survey status pills
 * use — the bundle quotes hexes there too, so they are quoted rather than
 * approximated with a token.
 */
const STATUS_PILL: Record<string, { bg: string; fg: string; key: string }> = {
  publisert: { bg: '#E4F2E0', fg: '#2F5D2A', key: 'statusPublisert' },
  klar: { bg: 'var(--sbg)', fg: 'var(--ink)', key: 'statusKlar' },
  utkast: { bg: 'var(--sf2)', fg: 'var(--ink)', key: 'statusUtkast' },
}

const TAB_KEYS = [
  ['lov', 'tabLov'],
  ['standard', 'tabStandard'],
  ['mine', 'tabMine'],
] as const

/** Rapporter — HeiTuva.dc.html:911-1330. */
export async function ReportsScreen({
  tab,
  canEdit,
  viewerMemberId,
  cards,
  templates,
  members,
  reports,
  counts,
  thresholdNote,
  sectionLabels,
}: {
  tab: 'lov' | 'standard' | 'mine'
  canEdit: boolean
  viewerMemberId: string
  cards: DutyCardData[]
  templates: ReportTemplate[]
  members: { id: string; name: string }[]
  reports: SavedReport[]
  counts: { lov: number; maler: number; mine: number }
  thresholdNote: string
  /**
   * Section names come from `report_section_types`, not from next-intl.
   *
   * They are seeded registry content in the same sense as the template pack
   * titles and the statutory duty texts: a row, editable without a deploy, and
   * translated by the Phase 6 translation editor rather than by a JSON file.
   * Duplicating them into `messages/*.json` would create a second set that
   * drifts from the one `reports.sections` actually references.
   */
  sectionLabels: Record<string, string>
}) {
  const t = await getTranslations('reports')

  return (
    <div className="max-w-[1080px] animate-enter pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-medium">{t('title')}</h1>
          <p className="mt-[3px] text-[13px] text-mut">{t('counts', counts)}</p>
        </div>
        {/* RESPONSIVE.md § Tab rails: wraps below md, chips keep their size. */}
        {/* The rail wraps below md (RESPONSIVE.md § Tab rails). Wrapping puts
            two ~31px chips on top of each other, so the row gap has to carry
            the 44px hit areas apart — 13px is the minimum that does it. The
            horizontal gap stays the bundle's 3px, and so does the row gap at
            xl, where the rail never wraps. */}
        {/* Named, because two of the three tabs now share their text with the
            top navigation ("Rapporter") and with a Bibliotek tab ("Maler").
            The rail is a navigation landmark either way; giving it a name is
            what lets a screen reader — and a test — say WHICH "Rapporter". */}
        <nav
          aria-label={t('tabsLabel')}
          className="flex flex-wrap gap-x-[3px] gap-y-[13px] rounded-full bg-sf2 p-1 xl:gap-y-[3px]"
        >
          {TAB_KEYS.map(([key, label]) => {
            const active = key === tab
            return (
              <Link
                key={key}
                href={key === 'lov' ? '/rapporter' : `/rapporter?fane=${key}`}
                aria-current={active ? 'page' : undefined}
                className="touch-44 cursor-pointer rounded-full px-5 py-[9px] text-[12.5px] font-semibold text-ink no-underline"
                style={{
                  background: active ? 'var(--sf)' : 'transparent',
                  boxShadow: active ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
                }}
              >
                {t(label)}
              </Link>
            )
          })}
        </nav>
      </div>

      {tab === 'lov' ? (
        <div className="mt-5">
          <p className="max-w-[620px] text-[13.5px] leading-[1.6] text-mut">{thresholdNote}</p>
          <div className="mt-[18px] grid grid-cols-1 gap-4 xl:grid-cols-2">
            {cards.map((card) => (
              <DutyCard
                key={card.definitionKey}
                card={card}
                members={members}
                canEdit={canEdit}
                viewerMemberId={viewerMemberId}
              />
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'standard' ? (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl, i) => (
            <div
              key={tpl.key}
              className="flex flex-col rounded-[18px] border border-line p-6"
              /*
                The design tints the cards POSITIONALLY, cycling five literal
                hexes (HeiTuva.dc.html:3066):

                  ["#FFFDF6","#FBEBBE","#CFE7E4","#FBD5C4","#F3E7DB"][i % 5]

                Two of the five have no theme token — #CFE7E4 is a lighter
                --ac2 and #F3E7DB a warmer --sf2 — so they are quoted verbatim
                here for the same reason the status pill colours are quoted in
                undersokelser/keys.ts: substituting the nearest token would be
                restyling, and the earlier alternation of two tokens rendered
                all five cards in the same cream.
              */
              style={{ background: ['#FFFDF6', '#FBEBBE', '#CFE7E4', '#FBD5C4', '#F3E7DB'][i % 5] }}
            >
              <div className="mb-[14px] flex flex-col gap-[5px] rounded-xl border border-line bg-sf p-3">
                <span className="block h-[6px] w-[46%] rounded-[3px] bg-ink opacity-80" />
                {/* Every section, as `r.thumb` maps them — the thumbnail is a
                    picture of the report's shape, so truncating it drew the
                    wrong shape. */}
                {tpl.sections.map((s) => (
                  <span key={s} className="mt-[3px] flex items-center gap-1">
                    <span className="block h-1 w-[22%] rounded-[2px] bg-mut opacity-45" />
                    <span
                      className="block flex-1 rounded-[3px]"
                      style={{
                        height: s === 'heatmap' ? '14px' : ['trend', 'drivers', 'teams'].includes(s) ? '8px' : '4px',
                        background: s === 'heatmap' ? 'var(--ac3)' : ['trend', 'drivers', 'teams'].includes(s) ? 'var(--ac)' : 'var(--sf2)',
                      }}
                    />
                  </span>
                ))}
              </div>
              <div className="text-[11px] uppercase tracking-[.1em] text-mut">{tpl.tag}</div>
              <h2 className="mt-2 font-display text-[21px] font-medium leading-[1.25]">{tpl.title}</h2>
              <p className="mt-[6px] flex-1 text-[13px] leading-[1.6] text-mut">{tpl.description}</p>
              <div className="mt-[14px] flex flex-wrap gap-[6px]">
                {tpl.sections.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-line bg-sf px-[10px] py-[5px] text-[11.5px] text-mut"
                  >
                    {sectionLabels[s] ?? s}
                  </span>
                ))}
              </div>
              {canEdit ? (
                <NewReportButton
                  label={t('useTemplate')}
                  title={`${tpl.title} — ${t('draft').toLowerCase()}`}
                  baseTemplate={tpl.key}
                  sections={tpl.sections}
                  className="touch-44 mt-[18px] cursor-pointer rounded-[10px] border-none bg-ac p-[11px] text-[13px] font-semibold text-acf"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'mine' ? (
        <div className="mt-5 rounded-[18px] border border-line bg-sf px-6 py-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-[14px]">
            <p className="text-[13px] text-mut">{t('reportRowCount', { count: reports.length })}</p>
            {canEdit ? (
              <NewReportButton
                label={t('newReport')}
                title={t('newReport')}
                baseTemplate={null}
                sections={['summary']}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-semibold text-acf"
              />
            ) : null}
          </div>
          {reports.length === 0 ? (
            <div className="mt-6 text-center">
              <p className="font-display text-[21px] font-bold">{t('noReports')}</p>
              <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-mut">
                {t('noReportsBody')}
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-[14px] border-b border-line py-[14px]"
                >
                  {/* Kind and status are PILLS, and their colours are the
                      design's own map (HeiTuva.dc.html:3027-3029): lovpålagt is
                      --ac3, egen --sf2; publisert is the same green pair the
                      survey status pills use, klar is --sbg, utkast --sf2.
                      Rendering the raw enum as muted text lost both the shape
                      and the meaning — "publisert" read like a footnote. */}
                  <span
                    className="flex-none whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-bold"
                    style={{ background: r.kind === 'lov' ? 'var(--ac3)' : 'var(--sf2)' }}
                  >
                    {r.kind === 'lov' ? t('kindLov') : t('kindEgen')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{r.title}</span>
                    <span className="mt-[2px] block text-[12.5px] text-mut">
                      {[r.base, new Date(r.createdAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    className="flex-none whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-bold"
                    style={{
                      background: STATUS_PILL[r.status]?.bg ?? 'var(--sf2)',
                      color: STATUS_PILL[r.status]?.fg ?? 'var(--ink)',
                    }}
                  >
                    {t(STATUS_PILL[r.status]?.key ?? 'statusUtkast')}
                  </span>
                  {/* RESPONSIVE.md § Row actions: the group wraps to its own
                      line below md rather than shrinking the 44px targets. */}
                  <span className="flex flex-wrap items-center gap-2">
                    {canEdit ? (
                      <ShareReportButton
                        reportId={r.id}
                        scope={r.shareScope}
                        label={t('share')}
                        sharedLabel={t('shared')}
                        failedLabel={t('shareFailed')}
                        className="touch-44 cursor-pointer whitespace-nowrap rounded-[9px] border border-line bg-transparent px-[14px] py-[9px] text-[12px] font-semibold text-ink"
                      />
                    ) : null}
                    <a
                      href={`/rapporter/${r.id}/pdf`}
                      className="touch-44 inline-flex cursor-pointer items-center whitespace-nowrap rounded-[9px] border border-line bg-transparent px-[14px] py-[9px] text-[12px] font-semibold text-ink no-underline"
                    >
                      {t('exportPdf')}
                    </a>
                    <Link
                      href={`/rapporter?rapport=${r.id}`}
                      className="touch-44 inline-flex cursor-pointer items-center whitespace-nowrap rounded-[9px] border-none bg-ac px-4 py-[9px] text-[12px] font-semibold text-acf no-underline"
                    >
                      {t('openReport')}
                    </Link>
                    {canEdit ? (
                      <DeleteReportButton
                        reportId={r.id}
                        label={t('deleteReport')}
                        className="touch-44 w-[34px] cursor-pointer rounded-[9px] border border-line bg-transparent text-[15px] leading-none text-mut"
                      />
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
