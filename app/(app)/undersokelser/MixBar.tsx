import { getTranslations } from 'next-intl/server'
import { participationChip, type Measured } from '@/lib/surveys/participation'

/**
 * F4 — the mix bar (v6:2226-2238): three status dots, a progress bar and
 * «{responses} av {invited} svar».
 *
 * ── THE FOURTH PLACE THE BUNDLE HANDS OVER THE INVENTED DENOMINATOR ────────
 *
 * `svBar` (v6:9022-9029) computes `inv = filtered.reduce((a,s) => a + (s.target || 30), 0)`
 * and then `pct = res / inv`. So a selection of ten surveys with no recipient
 * counts would print «300 inviterte» and a percentage over a number nobody
 * chose — and unlike the three before it this one is printed as a COUNT as well
 * as a rate, so the invention is visible as a figure a manager could quote.
 *
 * It is not taken. `rateOf` forms the ratio over the rows that HAVE a
 * denominator, `participationChip` picks the label that says which population,
 * and **the «N av M» line is the same `Measured`** — so the bar, its percentage
 * and its sentence are all about one population by construction rather than by
 * three careful readings.
 *
 * The dots are counts of rows and need no denominator at all, so they are the
 * whole filtered set. That asymmetry is the point: a count of surveys is a fact
 * about the list; a rate is a fact about a population inside it.
 */
export async function MixBar({
  counts,
  measured,
  total,
}: {
  /** Rows per status, over the FILTERED set — what the reader can see. */
  counts: { aktiv: number; utkast: number; lukket: number }
  /** `rateOf` over the same filtered set. Null when no row has a denominator. */
  measured: Measured | null
  /** How many rows were considered, so the label can say whether the rate
   *  covers all of them. */
  total: number
}) {
  const t = await getTranslations('surveys')

  const rate = participationChip({ measured, total }, (key, m) =>
    key === 'rateAll' ? t('barRateAll') : t('barRateSome', { m }),
  )

  return (
    /* v6:2226 — `padding:12px 22px`, rules top and bottom, `--bg`. */
    <div className="flex flex-wrap items-center gap-[18px] border-y border-line bg-bg px-[22px] py-3">
      <span className="flex flex-wrap items-center gap-[14px]">
        {(
          [
            ['aktiv', '#4C8A44', counts.aktiv],
            ['utkast', 'var(--line)', counts.utkast],
            ['lukket', 'var(--ac3)', counts.lukket],
          ] as const
        ).map(([key, dot, n]) => (
          <span key={key} className="flex items-center gap-[7px]">
            <span
              aria-hidden="true"
              className="block h-2 w-2 flex-none rounded-full"
              style={{ background: dot }}
            />
            <span className="text-[12.5px]">
              <span className="font-bold">{n}</span> {t(`barDot_${key}` as 'barDot_aktiv')}
            </span>
          </span>
        ))}
      </span>

      {/* The bar and its percentage are ABSENT, not zero, when nothing in the
          selection has a recipient count — the same rule the row cell follows.
          A full-width empty track with «0 %» beside it is a claim; no bar is
          the absence of one. */}
      {rate && measured ? (
        <span className="flex min-w-[180px] flex-1 items-center gap-[11px]">
          <span className="block h-2 flex-1 overflow-hidden rounded-full bg-sf2">
            <span
              className="block h-full rounded-full bg-ac"
              style={{ width: `${measured.pct}%` }}
            />
          </span>
          <span className="whitespace-nowrap text-[12.5px] font-bold">{rate.value}</span>
          <span className="whitespace-nowrap text-[12px] text-mut">{rate.label}</span>
        </span>
      ) : null}

      {/* «{n} av {m} svar» — the SAME `Measured`, so the sentence cannot be
          about a different set from the bar above it. Absent for the same
          reason when there is nothing measured. */}
      {measured ? (
        <span className="whitespace-nowrap text-[12px] text-mut">
          {t('barResponses', { n: measured.responses, m: measured.target })}
        </span>
      ) : (
        <span className="whitespace-nowrap text-[12px] text-mut">{t('barNoTargets')}</span>
      )}
    </div>
  )
}
