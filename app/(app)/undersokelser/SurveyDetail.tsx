import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { fmt } from '@/lib/results/present'
import { STATUS_BAR, type ListRow } from '@/lib/surveys/list-row'
import { STATUS_COLORS } from './keys'

/**
 * F4 — «Valgt undersøkelse», the right half of the «Liste og detalj» view
 * (v6:2261-2299).
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────
 *
 * Not one of F5's twenty-seven sub-tabs and not a smaller version of them: it
 * is a SUMMARY of one row of this list, drawn on this screen, with six links to
 * screens that already exist. Nothing here reads a question, a theme or a
 * quote. If it had needed one of those, the instruction was to stop and say so
 * rather than build a reduced sub-tab inside F4 — it did not.
 *
 * ── THE SNITTSCORE TILE IS THE ONE PLACE THIS PANEL READS RESULTS ──────────
 *
 * v6:9064 computes it in the mock from the response array. Ours is
 * `results_summary` for THIS survey — the same k-gated RPC the Resultater
 * screen calls, one call for the one selected survey — so invariant 1 holds:
 * the client selects nothing from `responses` or `answers`, and a survey under
 * the threshold comes back refused and renders the em dash rather than a
 * number.
 *
 * **It is one survey at a time, which is what makes it affordable and correct.**
 * The same number in the TABLE would be one RPC per visible row, and the same
 * number on F3's «På tvers» card would have been a selection's average printed
 * over the organisation — which is why that one was not built. Right population,
 * gated path, one call.
 *
 * ── AND THERE IS NO «versjon» ─────────────────────────────────────────────
 *
 * v6:2270 draws `{{ svDetail.version }}` beside the audience and the owner, and
 * `surveys` has no version column. A hard-coded `v1` is the worked example in
 * CLAUDE.md's never-fabricate rule, and a round COUNT relabelled «versjon»
 * would be the same invention with extra steps. The line carries the two facts
 * that exist. Logged as a deviation.
 */
export async function SurveyDetail({
  row,
  avg,
  canEdit,
  menu,
}: {
  row: ListRow
  /** The row menu — the six actions the drawing's panel has no room for and
   *  that exist nowhere else. Built by the page, mounted beside the links. */
  menu?: import('react').ReactNode
  /** `results_summary().avg` for this survey, or null when the RPC refused
   *  (below k) or there is nothing to average yet. Never computed here. */
  avg: number | null
  canEdit: boolean
}) {
  const t = await getTranslations('surveys')
  const pill = STATUS_COLORS[row.status as keyof typeof STATUS_COLORS]

  const actions: { href: string; label: string; primary?: boolean }[] = [
    { href: `/undersokelser/${row.id}/bygg`, label: t('detailOpen'), primary: true },
    {
      href:
        row.status === 'utkast'
          ? `/undersokelser/${row.id}/bygg`
          : `/undersokelser/${row.id}/resultater`,
      label: row.status === 'utkast' ? t('primaryDraft') : t('primaryActive'),
    },
    { href: `/undersokelser/${row.id}/send`, label: t('detailSend') },
    { href: `/undersokelser/${row.id}/kommentarer`, label: t('detailComments') },
    { href: `/undersokelser/${row.id}/malgruppe`, label: t('detailAudience') },
    { href: `/undersokelser/${row.id}/rapport`, label: t('detailReport') },
  ]

  return (
    /* v6:2262 — `padding:22px 24px`, radius 16, `--bg`. */
    <div className="min-w-0 flex-[1_1_300px] rounded-2xl border border-line bg-bg px-6 py-[22px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[.09em] text-mut">{t('detailEyebrow')}</span>
        <span
          className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: pill?.bg, color: pill?.fg }}
        >
          {t(`status_${row.status}` as 'status_aktiv')}
        </span>
      </div>

      <h2 className="mt-2 text-pretty font-display text-[23px] font-medium leading-[1.25]">
        {row.title}
      </h2>
      <p className="mt-[3px] text-[13px] text-mut">
        {[row.audience, row.ownerName ? t('detailOwner', { name: row.ownerName }) : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <div className="mt-[18px] grid grid-cols-2 gap-2.5">
        <div className="rounded-[13px] bg-sbg px-4 py-3.5">
          <div className="text-[11px] text-mut">{t('detailResponses')}</div>
          <div className="mt-1 font-display text-2xl font-semibold leading-none">
            {row.responses}
          </div>
          {/* «av N inviterte» only where N exists. A survey with no recipient
              count gets the sentence that says so, never «av 30». */}
          <div className="mt-[3px] text-[11.5px] text-mut">
            {row.target === null ? t('detailNoTarget') : t('detailOfTarget', { n: row.target })}
          </div>
        </div>
        <div className="rounded-[13px] bg-ac2 px-4 py-3.5">
          <div className="text-[11px] text-mut">{t('detailAvg')}</div>
          <div className="mt-1 font-display text-2xl font-semibold leading-none">{fmt(avg)}</div>
          <div className="mt-[3px] text-[11.5px] text-mut">{t('detailAvgOf')}</div>
        </div>
      </div>

      {row.pct === null ? null : (
        <div className="mt-4 flex items-center gap-2.5">
          <span className="block h-2 flex-1 overflow-hidden rounded-full bg-sf2">
            <span
              className="block h-full rounded-full"
              style={{ width: `${row.pct}%`, background: STATUS_BAR[row.status] }}
            />
          </span>
          <span className="whitespace-nowrap text-[12.5px] font-semibold">{row.pct} %</span>
        </div>
      )}

      <p className="mt-3.5 text-[12.5px] text-mut">
        {t('detailMeta', { q: row.questionCount })}
        {row.sentLabel ? ` · ${t('detailSent', { date: row.sentLabel })}` : ''}
      </p>

      {canEdit ? (
        <div className="mt-[18px] flex flex-wrap gap-2 border-t border-line pt-4">
          {actions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className={`touch-44 cursor-pointer whitespace-nowrap rounded-[10px] px-4 py-2.5 text-[12.5px] no-underline ${
                a.primary
                  ? 'border-none bg-ac font-bold text-acf'
                  : 'border border-line bg-transparent font-semibold text-ink'
              }`}
            >
              {a.label}
            </Link>
          ))}
          {menu}
        </div>
      ) : null}
    </div>
  )
}
