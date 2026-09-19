import type { Themes } from '@/lib/results/types'

const DASH = '—'

/**
 * G2.3 — «Resultatmatrise», Gruppe × tema (v8:1687-1701).
 *
 * NOT THE `matrix` QUESTION TYPE. `lib/questions/registry.ts:144` has one, and
 * it is a statements grid a respondent fills in. This tab is a cross-tabulation
 * of RESULTS, and having the question type says nothing about whether this
 * tab's data exists. The two were conflated in the brief and separating them is
 * what made the build possible.
 *
 * N GATED CALLS, ONE PER GROUP. `get_themes(org, surveys[], group, lang)`
 * already takes a single `p_group`, so the matrix is one call per row and each
 * cell is gated by the same call that would gate it alone. No new RPC and no
 * new disclosure path — the same per-scope union `/dashboard` uses for trends
 * and themes, which is deliberate: a single cross-tab query would need ONE
 * contributor count for a cell built from two breakdowns, and that is where k
 * stops composing.
 *
 * A FULLY SUPPRESSED ROW STILL RENDERS AS A ROW. Dropping it would make the
 * ROW SET itself a disclosure — «which groups are large enough» is a fact about
 * group sizes, recoverable by noting who is absent. So every group appears,
 * and a row with nothing above the threshold says so in words rather than
 * showing a count of how many cells were withheld: a count of suppressed cells
 * is a population figure wearing a different hat.
 */
export function ThemeMatrix({
  themeLabels,
  rows,
  labels,
}: {
  /** The theme axis, derived org-wide so every row has the same columns. A
   *  per-row axis would let the COLUMN SET vary by group, which is the same
   *  disclosure as a varying row set. */
  themeLabels: { key: string; label: string }[]
  rows: { groupId: string; name: string; themes: Themes | null }[]
  labels: {
    title: string
    lead: string
    group: string
    noThemes: string
    rowAllWithheld: string
  }
}) {
  if (themeLabels.length === 0) {
    return (
      <section className="mt-4 rounded-[20px] border border-line bg-sf px-[22px] py-5">
        <span className="block font-display text-[21px] font-medium">{labels.title}</span>
        <p className="mt-2 text-[13px] leading-relaxed text-mut">{labels.noThemes}</p>
      </section>
    )
  }

  return (
    <section className="mt-4 rounded-[20px] border border-line bg-sf">
      <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-[18px]">
        <span className="min-w-0">
          <span className="block font-display text-[21px] font-medium">{labels.title}</span>
          <span className="mt-[3px] block text-[12.5px] text-mut">{labels.lead}</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div
            className="grid gap-[10px] border-y border-line bg-bg px-[22px] py-[11px]"
            style={{ gridTemplateColumns: `minmax(160px,1.5fr) repeat(${themeLabels.length},minmax(72px,1fr))` }}
          >
            <span className="text-[11px] uppercase tracking-[.09em] text-mut">{labels.group}</span>
            {themeLabels.map((t) => (
              <span key={t.key} className="text-center text-[11px] uppercase tracking-[.09em] text-mut">
                {t.label}
              </span>
            ))}
          </div>

          {rows.map((row) => {
            const byKey = new Map(
              (row.themes?.themes ?? []).map((t) => [t.key, t] as const),
            )
            // A cell exists only where that group's own gated call returned the
            // theme. Absent = withheld or unmentioned, and the two are
            // deliberately indistinguishable: telling them apart would report
            // whether a below-threshold group mentioned a theme at all.
            const anyShown = themeLabels.some((t) => byKey.has(t.key))
            return (
              <div
                key={row.groupId}
                className="grid items-center gap-[10px] border-b border-line px-[22px] py-[9px] last:border-b-0"
                style={{ gridTemplateColumns: `minmax(160px,1.5fr) repeat(${themeLabels.length},minmax(72px,1fr))` }}
              >
                <span className="min-w-0 truncate text-[13.5px] font-semibold">{row.name}</span>
                {anyShown ? (
                  themeLabels.map((t) => {
                    const cell = byKey.get(t.key)
                    return (
                      <span
                        key={t.key}
                        className="flex h-9 items-center justify-center rounded-[9px] text-[13px] font-bold"
                        style={{ background: cell ? 'var(--sbg2)' : 'var(--sf2)' }}
                      >
                        {cell ? cell.mentions : DASH}
                      </span>
                    )
                  })
                ) : (
                  <span
                    className="text-[12px] text-mut"
                    style={{ gridColumn: `span ${themeLabels.length}` }}
                  >
                    {labels.rowAllWithheld}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
