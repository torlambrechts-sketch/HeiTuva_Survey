import { changeBetween, changeLabel, hasValue } from '@/lib/results/compare'
import type { TrendPoint } from '@/lib/results/types'

const DASH = '—'

/**
 * G2.2 — «Sammenligning med tidligere runder» (v8:1723-1760).
 *
 * THE COLUMN v8 DRAWS AND THE RULE IT DOES NOT HAVE. Each round is gated on its
 * own by `get_trends`; the drawing then puts an ungated **Endring** beside
 * them, and a change spanning a suppressed round reconstructs it by
 * subtraction. Every change here goes through `changeBetween`, which returns a
 * tagged result rather than `number | null` — so there is no number to format
 * when an endpoint is withheld and no `?? 0` to reach for.
 *
 * THE WITHHELD CHANGE IS LABELLED, NOT BLANK. An empty cell beside a suppressed
 * round is itself a signal — it says «there was a comparison and you may not
 * have it», which is the same disclosure one step weaker. The title says the
 * rule instead, identically on every withheld cell, so the cell carries no
 * information about which round was short.
 *
 * `n` IS SHOWN ON A GATED ROUND AND THAT IS Q49, NOT A LEAK. `get_trends`
 * gates on the population behind the AVERAGE and emits `took_part` — people who
 * responded, with no join to `answers`. Its own body says the gate's subject
 * «is emitted nowhere». Participation is not derived from what anyone said.
 */
export function CompareRounds({
  points,
  labels,
}: {
  points: TrendPoint[]
  labels: {
    title: string
    lead: string
    rounds: string
    change: string
    none: string
    withheld: string
    round: (n: number) => string
    answers: (n: number) => string
  }
}) {
  const ordered = [...points].sort((a, b) => a.round_no - b.round_no)

  return (
    <section className="mt-4 rounded-[20px] border border-line bg-sf">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[22px] py-[18px]">
        <span className="min-w-0">
          <span className="block font-display text-[21px] font-medium">{labels.title}</span>
          <span className="mt-[3px] block text-[12.5px] text-mut">{labels.lead}</span>
        </span>
        <span className="whitespace-nowrap rounded-full bg-sbg px-3 py-[6px] text-[11.5px] font-bold">
          {labels.rounds}
        </span>
      </div>

      {ordered.length < 2 ? (
        <p className="px-[22px] py-5 text-[13px] leading-relaxed text-mut">{labels.none}</p>
      ) : (
        <div className="flex flex-col">
          {ordered.map((p, i) => {
            const before = i === 0 ? null : ordered[i - 1]!
            // The change is against the PREVIOUS round, so the first row has
            // none by definition rather than by suppression — and those two
            // must not render alike.
            const change = before === null ? null : changeBetween(before, p)
            const shown = hasValue(p)
            return (
              <div
                key={p.round_id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-line px-[22px] py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.6fr)_88px_108px]"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">
                    {labels.round(p.round_no)}
                  </span>
                  <span className="mt-px block text-[11.5px] text-mut">
                    {labels.answers(p.n)}
                  </span>
                </span>
                <span className="text-right font-display text-[19px] font-medium sm:text-center">
                  {shown ? p.avg!.toFixed(1).replace('.', ',') : DASH}
                </span>
                <span
                  className="col-span-2 text-[12.5px] text-mut sm:col-span-1 sm:text-right"
                  title={change !== null && change.kind === 'suppressed' ? labels.withheld : undefined}
                >
                  {change === null ? (
                    ''
                  ) : change.kind === 'value' ? (
                    <span className="font-semibold text-ink">
                      {changeLabel(change, DASH)}
                    </span>
                  ) : (
                    DASH
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className="rounded-b-[19px] bg-bg px-[22px] py-3.5 text-[12px] leading-relaxed text-mut">
        {labels.withheld}
      </p>
    </section>
  )
}
