import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { participationChip, type Measured } from '@/lib/surveys/participation'

/**
 * F3 — the two-column page-header band, and the «På tvers» card in its right
 * column (v6:2130-2152, v6:2476-2497, v6:2800-2818, v6:4619-4640).
 *
 * ── ONE SURFACE, FOUR SCREENS, BUILT ON NONE ───────────────────────────────
 *
 * The audit measured it: v6 draws
 * `grid-template-columns: minmax(0,1.1fr) minmax(330px,.9fr)` on Undersøkelser,
 * Innsikt, Rapporter and Bibliotek, with title/counts/lead on the left and this
 * card on the right. `grep -rn 'På tvers\|crossStats\|insStats' app/ messages/`
 * returned **zero**. All four screens had collapsed to one column with the
 * buttons pushed to the right margin — which is not a missing card, it is half
 * a grid.
 *
 * Handlinger already had the same grid with its «Eiere» panel in the right
 * column (V5-2), which is the evidence the shape is the shell's and not this
 * card's: the band is a layout and what sits in the right column is the
 * screen's.
 *
 * ── THE PARTICIPATION CHIP IS NOT THE SCREEN'S TO COMPUTE ──────────────────
 *
 * **The bundle has F1's defect, written down twice.** `crossStats` (v6:9131)
 * and `insStats` (v6:8238) both compute `sum(responses) / sum(target || 30)` —
 * a survey with no recipient count is given an INVENTED denominator of thirty,
 * which is the never-fabricate rule broken inside the arithmetic. Reproducing
 * the drawing here would have re-opened the defect F1 had just closed, on three
 * more screens.
 *
 * So a screen does not hand this component a percentage. It hands over
 * `{ measured, total }` from `rateOf`, and the component picks the LABEL with
 * `participationLabelKey` — «svarprosent» when every row counted, «svarprosent
 * i N med mottakertall» when they did not, **and no chip at all** when nothing
 * could be measured. A screen free to pass a number is a screen free to pass
 * the wrong one.
 *
 * ── AND «På tvers» IS A DIFFERENT POPULATION FROM svTuva'S ─────────────────
 *
 * On Undersøkelser both render a participation figure and they are NOT the same
 * number: svTuva follows the filter the reader can see (F1), and «På tvers» is
 * the organisation's whole set — that is what the words mean. Two percentages
 * on one screen that disagree read as a bug unless each says what it is over,
 * which is exactly why the label carries the population rather than the card
 * carrying a caption.
 */
export type HeaderChip = { value: string; label: string }

/**
 * A screen places the participation chip by putting this token in its chip
 * list, and the component fills it in. The token exists because the drawing
 * puts the rate SECOND on Undersøkelser (v6:9131) and FIRST on Innsikt
 * (v6:8238) — so the position is the screen's, while the NUMBER and the LABEL
 * stay the component's. There is no `pct` for a caller to pass.
 */
export const PARTICIPATION = 'participation' as const

export async function PageHeader({
  title,
  icon,
  counts,
  scope,
  lead,
  cross,
}: {
  title: string
  /** A 62px hero mark to the left of the title. v6 draws one on Handlinger
   *  (v6:3675) and none on the other three; Bibliotek's is OURS and logged
   *  (D170), carried here so Q172's «the same frame as Handlinger» survives the
   *  band arriving under it. */
  icon?: ReactNode
  /** Left of the `|`. v6:2133 — «{counts} &nbsp;|&nbsp; {scope}». */
  counts: string
  scope: string
  lead: string
  cross?: {
    /** v6:2141 — a bare count beside the heading. Undersøkelser only; the
     *  other three draw the heading alone. */
    total?: string
    /** The card's one button. Given by the screen because its destination is. */
    action?: ReactNode
    chips: (HeaderChip | typeof PARTICIPATION)[]
    /** `rateOf`'s result and how many rows were considered. The component
     *  decides what may be claimed about them. */
    participation?: { measured: Measured | null; total: number }
  }
}) {
  const t = await getTranslations('pageHeader')

  /* The token is resolved to a chip or dropped. `rateNone` is the ABSENCE of a
     chip, not a chip saying nothing: a «0 %» or a «—» there would be a
     fabricated value in the never-fabricate sense, indistinguishable from a
     real zero in a screenshot. */
  const rate = participationChip(cross?.participation, (key, m) =>
    key === 'rateAll' ? t('rateAll') : t('rateSome', { m }),
  )
  const chips: HeaderChip[] = (cross?.chips ?? []).flatMap((c) =>
    c === PARTICIPATION ? (rate ? [rate] : []) : [c],
  )

  return (
    /* v6:2130. One column until `lg`: below 1024 the 330px right column and a
       460px lead cannot both hold, and RESPONSIVE.md stacks rather than
       squeezes. Handlinger's band already does exactly this. */
    <div className="mt-[14px] grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(330px,.9fr)]">
      <div className="min-w-0">
        <div className="flex items-start gap-4">
          {icon ?? null}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[23px] font-semibold leading-[1.1] md:text-[32px]">
              {title}
            </h1>
            <p className="mt-[5px] text-[13px] text-mut">
              {counts}
              <span className="px-2">|</span>
              {scope}
            </p>
          </div>
        </div>
        <p className="mt-3 max-w-[460px] text-pretty text-[14px] leading-[1.6] text-mut">{lead}</p>
      </div>

      {cross ? (
        <section
          aria-label={t('crossLabel')}
          className="rounded-[20px] border border-line bg-sf px-6 py-5"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-baseline gap-2.5">
              <h2 className="whitespace-nowrap font-display text-[21px] font-medium">
                {t('cross')}
              </h2>
              {cross.total ? (
                <span className="whitespace-nowrap text-[15px] font-bold">{cross.total}</span>
              ) : null}
            </span>
            {cross.action}
          </div>
          {chips.length ? (
            <div className="mt-3.5 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className="flex items-baseline gap-[7px] rounded-full border border-line bg-bg px-3 py-[7px]"
                >
                  <span className="text-[13px] font-bold">{c.value}</span>
                  <span className="whitespace-nowrap text-[12px] text-mut">{c.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
