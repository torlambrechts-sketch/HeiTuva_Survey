/**
 * Q174 — which category chips are on the rail, and which are in the dropdown.
 *
 * Tor, 2026-09-13: «det blir veldig mange mal kategorier; slik at det blir for
 * mange på raden — kan vi vise de fire med flest maler og nedtrekksliste etter
 * det?»
 *
 * A pure function, deliberately, because the interesting parts are decisions
 * rather than markup and they are cheap to test only here:
 *
 * ── THE TIE-BREAK IS THE WHOLE CORRECTNESS PROBLEM ─────────────────────────
 * Ranking by count alone is not a total order, and the seeded data proves it:
 * «Medlem og frivillig» and «Offentlig sektor» both have 2. `Array.sort` is
 * stable in every engine we ship to, but relying on that is relying on the
 * INPUT order being meaningful, so the input order is used explicitly — the
 * editorial sequence the rail already had. Two categories with the same count
 * therefore resolve the same way on every render, in every organisation.
 *
 * ── THE ACTIVE CATEGORY IS NEVER HIDDEN ────────────────────────────────────
 * If a category picked from the dropdown fell outside the top four, the rail
 * would show «Alle» unselected and nothing else lit, while the grid below was
 * filtered — state visible only by reading the URL. So an active category
 * outside the top four is PROMOTED onto the rail. The four keep their places;
 * the rail grows by one rather than reshuffling.
 *
 * ── «FLEST MALER» MEANS WHAT THE CHIP WOULD SHOW ───────────────────────────
 * The count is over the standard packs the chip filters to — not over every row
 * carrying that use case. `annet` is `use_case is null`, every shipped pack
 * maps (asserted as a total function in `tests/db/use-cases.test.ts`), and an
 * organisation's own templates are listed in their own section rather than in
 * the filtered grid — so `annet` counts 0 and sorts last, which is true rather
 * than unfortunate.
 */
export type RailChip = { key: string; label: string }

/** Four, as asked. Named so the tests and the screen cannot disagree. */
export const RAIL_LIMIT = 4

export function splitRail({
  chips,
  count,
  active,
  resetKey = 'Alle',
  limit = RAIL_LIMIT,
}: {
  /** Every chip, in editorial order, including the reset chip. */
  chips: RailChip[]
  /** How many templates the chip's filter would show. */
  count: (key: string) => number
  /** The category currently filtering the grid. */
  active: string
  resetKey?: string
  limit?: number
}): { rail: RailChip[]; overflow: RailChip[] } {
  const reset = chips.filter((c) => c.key === resetKey)
  const rest = chips.filter((c) => c.key !== resetKey)

  const ranked = rest
    .map((c, order) => ({ c, order, n: count(c.key) }))
    // Count descending; the editorial position breaks every tie, so the order
    // is total and does not depend on the sort being stable.
    .sort((a, b) => b.n - a.n || a.order - b.order)

  const top = ranked.slice(0, limit).map((x) => x.c)
  const onRail = new Set(top.map((c) => c.key))

  // The promotion. `active` may be the reset key, or a value no chip carries
  // (the page validates `?kategori=` before this, so that is defence rather
  // than a case), and neither promotes anything.
  const promoted = rest.filter((c) => c.key === active && !onRail.has(c.key))
  for (const c of promoted) onRail.add(c.key)

  return {
    rail: [...reset, ...top, ...promoted],
    // Editorial order in the dropdown, not rank order: a list you scan for a
    // name reads better in the sequence it has everywhere else on the screen.
    overflow: rest.filter((c) => !onRail.has(c.key)),
  }
}
