import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { DutyCard } from './DutyCard'
import type { DutyCardData, ReportTemplate, SavedReport } from './types'

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
  counts: { lov: number; mine: number }
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
        <div className="flex flex-wrap gap-x-[3px] gap-y-[13px] rounded-full bg-sf2 p-1 xl:gap-y-[3px]">
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
        </div>
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
              // The design tints the five cards from the accent set, positionally.
              style={{ background: ['var(--sbg2)', 'var(--sf)', 'var(--sbg2)', 'var(--sf)', 'var(--sbg2)'][i % 5] }}
            >
              <div className="mb-[14px] flex flex-col gap-[5px] rounded-xl border border-line bg-sf p-3">
                <span className="block h-[6px] w-[46%] rounded-[3px] bg-ink opacity-80" />
                {tpl.sections.slice(0, 3).map((s) => (
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
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'mine' ? (
        <div className="mt-5 rounded-[18px] border border-line bg-sf px-6 py-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-[14px]">
            <p className="text-[13px] text-mut">{t('reportRowCount', { count: reports.length })}</p>
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
                  className="flex flex-wrap items-center gap-[11px] border-b border-line py-[11px]"
                >
                  <span className="whitespace-nowrap rounded-full bg-sf2 px-[11px] py-[5px] text-[11.5px] font-bold">
                    {r.kind === 'lov' ? t('kindLov') : t('kindEgen')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{r.title}</span>
                    <span className="mt-[1px] block text-[11.5px] text-mut">
                      {[r.base, new Date(r.createdAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-[12px] text-mut">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
