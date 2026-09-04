import { isGated, type HeatCell, type QuestionResult } from './types'

/**
 * Presentation arithmetic for the results screens.
 *
 * Pure and free of React so the thresholds can be unit-tested: the design
 * states them as literal numbers in three different places with three slightly
 * different cut-offs, and a transcription slip here would recolour a heatmap
 * without failing anything.
 */

/** Norwegian decimals use a comma. The design writes `String(v).replace(".",",")`
 *  rather than a locale formatter, and matching it exactly keeps "4,2" from
 *  drifting to "4,20" or to a non-breaking thousands space. */
export function no(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',')
}

/** An em dash is the design's "no value" (`avgScore === "—"`). */
export const DASH = '—'

export const fmt = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined ? DASH : no(value, digits)

/**
 * The heatmap's colour scale — HeiTuva.dc.html:2801.
 *
 * Stated as hex in the bundle rather than as theme tokens: `#CFE7E4` is not
 * `--ac2` (`#A8D5D2`) and `#FBEBBE`/`#FBD5C4` are `--sbg`/`--ac3` by value.
 * They are copied verbatim, because the heat scale is its own ramp.
 */
export function heatTone(cell: HeatCell): string {
  if (isGated(cell)) return 'var(--sf2)'
  if (cell.avg >= 4.2) return '#CFE7E4'
  if (cell.avg >= 3.6) return '#FBEBBE'
  return '#FBD5C4'
}

/** The teams bar on Resultater — HeiTuva.dc.html:3703. Note the cut-offs are
 *  4,3 and 4,0 here and 4,2 and 3,6 in the heatmap: the bundle uses two
 *  different ramps and this is not a transcription error. */
export function teamTone(avg: number): string {
  if (avg >= 4.3) return 'var(--ac2)'
  if (avg >= 4) return 'var(--ac)'
  return 'var(--ac3)'
}

/** The report/dashboard teams panel — HeiTuva.dc.html:2828. */
export function panelTone(avg: number): string {
  if (avg >= 4.2) return 'var(--ac2)'
  if (avg >= 3.6) return 'var(--ac)'
  return 'var(--ac3)'
}

/** Per-question distribution bars cycle the three accents — HeiTuva.dc.html:2745. */
export const BAR_COLORS = ['var(--ac)', 'var(--ac2)', 'var(--ac3)'] as const
export const barColor = (index: number): string => BAR_COLORS[index % 3]!

/** A 0–5 mean as a percentage of the bar's width. */
export const pctOf5 = (avg: number): number => Math.round((avg / 5) * 100)

/** eNPS runs −100…100, so the midpoint is 50 % of the track. */
export const pctOfEnps = (score: number): number =>
  Math.round(((Math.max(-100, Math.min(100, score)) + 100) / 200) * 100)

export type Bar = { key: string; label: string; value: string; pct: number; color: string }

/**
 * The bars for one question — HeiTuva.dc.html:2744.
 *
 * `keys` is the question's full option set, so an option nobody chose renders
 * as a real zero rather than disappearing. That is not invented data: with n
 * past the threshold, "nobody picked this" is a finding. The percentage
 * denominator is the response count; the bar WIDTH is relative to the largest
 * bar, exactly as the bundle draws it.
 */
export function questionBars(
  result: QuestionResult,
  keys: { key: string; label: string }[],
): Bar[] {
  if (isGated(result)) return []
  const counts = new Map(result.distribution.map((d) => [String(d.value), d.count]))
  const values = keys.map((k) => counts.get(k.key) ?? 0)
  const max = Math.max(1, ...values)
  const total = result.n || 1
  return keys.map((k, i) => {
    const count = values[i]!
    return {
      key: k.key,
      label: k.label,
      value: `${count} (${Math.round((count / total) * 100)}%)`,
      pct: Math.round((count / max) * 100),
      color: barColor(i),
    }
  })
}

/**
 * A scale question's option keys and labels — HeiTuva.dc.html:2739.
 *
 * `points` defaults to 5 because that is the design's default scale; the end
 * labels come from the question's own config and fall back to the bundle's
 * wording, which is seeded as UI copy rather than hard-coded here.
 */
export function scaleKeys(
  points: number,
  lowLabel: string,
  highLabel: string,
): { key: string; label: string }[] {
  const n = Math.max(2, Math.min(10, Math.round(points)))
  return Array.from({ length: n }, (_, i) => {
    const value = String(i + 1)
    if (i === 0) return { key: value, label: `1 — ${lowLabel}` }
    if (i === n - 1) return { key: value, label: `${n} — ${highLabel}` }
    return { key: value, label: value }
  })
}
