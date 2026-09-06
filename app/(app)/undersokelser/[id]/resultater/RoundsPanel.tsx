import { no } from '@/lib/results/present'
import { isGated, type Trends } from '@/lib/results/types'

/**
 * «Runde for runde» — HeiTuva.dc.html:2592-2610, new in the v1 bundle.
 *
 * One bar per round, so a recurring survey reads as a series rather than as
 * whatever the latest round happened to be. The bundle shows it only when
 * there is more than one round (`hasRounds: rounds.length > 1`), which is the
 * right rule: a single bar is a worse way of saying what the stat cards above
 * already say.
 *
 * Every round is gated on its own. That is not a rendering choice — `get_trends`
 * returns `{insufficient_data}` for a point below the survey's threshold and
 * carries no `n` and no `avg` with it, so a gated round has no number to draw
 * even if one wanted to. The bundle's own treatment is the same: a short grey
 * stub, an em dash where the average would be, and «under terskel» underneath.
 *
 * NOTE for the next phase's list, not acted on here: Q28 permits a count of
 * PEOPLE below the threshold — how many took part is not a svarutledet number —
 * but `get_trends` does not return `n` for a gated point, so this panel shows
 * less than Q28 allows. Widening it means a third entry in Q28's enumerated
 * exemption list, which is a deliberate act with its own test, not something to
 * slip into a UI phase.
 */
export function RoundsPanel({
  trends,
  labels,
}: {
  trends: Trends
  labels: {
    title: string
    status: string
    round: (n: number) => string
    answers: (n: number) => string
    belowThreshold: string
    note: string
  }
}) {
  const points = trends.points ?? []

  return (
    <section className="rounded-2xl border border-line bg-sf p-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
        <h2 className="text-[15.5px] font-semibold">{labels.title}</h2>
        <span className="text-[13px] text-mut">{labels.status}</span>
      </div>

      {/* RESPONSIVE.md § Charts: the bar row keeps its shape and scrolls
          horizontally rather than compressing bars below a readable width. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="mt-4 flex h-[120px] min-w-[280px] items-end gap-[14px]">
          {points.map((p, i) => {
            const gated = isGated(p)
            // The bundle's own scale: a 1–5 average as a share of 5, not of the
            // highest bar. A relative scale would make two nearly identical
            // rounds look like a collapse.
            const pct = gated ? 4 : Math.round((p.avg / 5) * 100)
            const last = i === points.length - 1
            return (
              <div key={p.round_id} className="flex h-full flex-1 flex-col items-center">
                <span className="flex-none text-[13px] font-semibold">
                  {gated ? '—' : no(p.avg)}
                </span>
                {/*
                  The bar's height is a percentage of THIS track, not of the
                  120px column. Sizing it against the column — which is what
                  the bundle's own markup does — makes it a flex item beside
                  three text rows, so the browser shrinks it to fit and a 3,0
                  and a 4,5 come out the same height. That was visible in the
                  first capture and is the whole point of the panel.
                */}
                <span className="mt-[5px] flex w-full max-w-16 flex-1 items-end">
                  <span
                    className="block min-h-[3px] w-full rounded-t-lg rounded-b-[3px]"
                    style={{
                      height: `${pct}%`,
                      background: gated ? 'var(--sf2)' : last ? 'var(--ac)' : 'var(--ac2)',
                    }}
                  />
                </span>
                <span className="mt-[7px] flex-none text-xs">{labels.round(p.round_no)}</span>
                <span className="flex-none text-[11.5px] text-mut">
                  {gated ? labels.belowThreshold : labels.answers(p.n)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-3 text-[12.5px] text-mut">{labels.note}</p>
    </section>
  )
}
