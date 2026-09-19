/**
 * G2.2 — A DERIVED FIGURE IS GATED BY ITS INPUTS, NOT BY ITS OWN COUNT.
 *
 * ── THE DEFECT THIS EXISTS TO REFUSE ──────────────────────────────────────
 *
 * v8 draws «Sammenligning med tidligere runder» as round x question-area with
 * an **Endring** column (v8:1723-1760). The rounds are gated individually — a
 * round whose scale population is below `app.k_for` comes back with
 * `insufficient_data` and no `avg`. The change column is not gated at all, and
 * that is enough to undo the suppression:
 *
 *     Runde 1   4.2   shown          Runde 2   —   suppressed
 *     Endring  +0.3                  => runde 2 is 4.5
 *
 * The suppressed cell is reconstructed by the cell NEXT TO IT. Invariant 1
 * condition 4 in a form this project had not met: not «the cell reports its own
 * n» but «a neighbouring DERIVED cell reports the value». It is the same
 * subtraction that refuses Segmenter (Q92) — k does not compose — moved from
 * two overlapping populations to two rounds of one.
 *
 * ── WHAT IS *NOT* THE DEFECT, MEASURED (G2.0) ─────────────────────────────
 *
 * A gated trend point DOES carry `n`, and that is Q49's deliberate decision
 * rather than a leak. `get_trends` gates on `scale_n` — the population behind
 * the AVERAGE — and its own body says of it: «it is emitted nowhere, and if it
 * is ever emitted again it must not be called `n`». The `n` that ships is
 * `took_part`: how many people responded, with no join to `answers`. Q28's line
 * is people-versus-derived, not population size, and
 * `tests/invariants/k-surface.test.ts` enforces the gated payload as a CLOSED
 * KEY SET.
 *
 * So the source is sound and this module guards the DERIVATION only. What a
 * change column would reconstruct is the `avg`, never the count.
 *
 * ── THE SHAPE, AND WHY IT IS NOT A HELPER RETURNING `number | null` ───────
 *
 * `PageHeader` has no `pct` prop (F3) and `estimatedMinutes` takes a named
 * object (V7-4), both for the same reason: prefer the shape where the wrong
 * thing cannot be EXPRESSED over the shape where it is merely not done. A
 * function returning `number | null` invites `?? 0` at the call site, and a
 * zero change beside a suppressed cell is a claim that the value did not move.
 * So a change is a TAGGED RESULT: either a value, or a suppression carrying the
 * reason. There is no third case and no numeric fallback to reach for.
 */

/** Anything the result RPCs return that may or may not have survived the gate. */
export type MaybeGated = { avg?: number | null; insufficient_data?: boolean } | null | undefined

export type Change =
  | { kind: 'value'; delta: number }
  /** `from`/`to` name WHICH endpoint was withheld, so the screen can say so
   *  without re-deriving it — and so a reader can tell «no comparison yet»
   *  from «the comparison is withheld». */
  | { kind: 'suppressed'; from: boolean; to: boolean }

/** A cell has a usable average only when it is present AND not gated. Both
 *  halves: `insufficient_data` without a null `avg` has never shipped, and
 *  relying on that would be trusting a shape rather than testing it. */
export function hasValue(cell: MaybeGated): cell is { avg: number } {
  return !!cell && cell.insufficient_data !== true && typeof cell.avg === 'number'
}

/**
 * The ONLY way a change between two cells is formed in this product.
 *
 * Gated in, gated out. A sweep in `tests/unit/derived-gating.test.ts` asserts
 * that no screen subtracts two averages anywhere else, so this is not merely
 * the recommended route — it is the only one.
 */
export function changeBetween(from: MaybeGated, to: MaybeGated): Change {
  const a = hasValue(from)
  const b = hasValue(to)
  if (!a || !b) return { kind: 'suppressed', from: !a, to: !b }
  return { kind: 'value', delta: Math.round((to.avg! - from.avg!) * 100) / 100 }
}

/**
 * THE SECOND HALF, AND IT IS THE ONE THAT IS EASY TO MISS.
 *
 * Suppressing the change is not enough if the row still lets a reader recover
 * it. A row of four round cells where three are shown and one is withheld, plus
 * a TOTAL over all four, discloses the withheld one by subtraction — the same
 * defect one column further along.
 *
 * So a total across a set of cells is itself suppressed when ANY member of that
 * set is. «All of them or none» is the only rule that composes, because a total
 * over a subset is a different number wearing the same label.
 */
export function totalOf(cells: MaybeGated[]): Change {
  if (cells.length === 0) return { kind: 'suppressed', from: true, to: true }
  if (!cells.every(hasValue)) return { kind: 'suppressed', from: true, to: true }
  const sum = cells.reduce((acc, c) => acc + (c as { avg: number }).avg, 0)
  return { kind: 'value', delta: Math.round((sum / cells.length) * 100) / 100 }
}

/** The sign a change renders with. Separated from the value so a screen cannot
 *  format a suppressed change by accident — there is no number to format. */
export const changeLabel = (c: Change, dash: string): string =>
  c.kind === 'suppressed' ? dash : `${c.delta > 0 ? '+' : ''}${c.delta.toFixed(1).replace('.', ',')}`
