/**
 * T8 · v8:609, 746, 784 — THE GRAB HANDLE, drawn identically at all three
 * sites: the full question card, the block card and the compact row.
 *
 * Every declaration is the drawing's:
 *
 *   width:16px · flex:none · cursor:grab · color:var(--mut,#6F6759)
 *   font-size:14px · line-height:1 · letter-spacing:1px · user-select:none
 *
 * and the glyph is ⠿ (BRAILLE PATTERN DOTS-123456), not `⋮⋮`. `BlockCard`
 * carried the latter, which is two characters where the drawing has one and
 * renders visibly narrower.
 *
 * ── IT IS LABELLED, NOT `aria-hidden` ─────────────────────────────────────
 *
 * v8 gives it `aria-label` AND `title`, both `grabLabel` (v8:6920) — «Flytt
 * spørsmålet» / «Flytt blokken». `BlockCard`'s was `aria-hidden` under D235,
 * when the handle moved nothing and announcing it would have been a promise
 * the code could not keep. The drag exists now, so the label is true. The
 * ARROWS remain the keyboard path — a `draggable` element is not operable
 * from a keyboard in any browser, which is half of what D235 was right about.
 *
 * ── T8.3 · `touch-44`, AND WHY NOT `touch-44-field` ───────────────────────
 *
 * 16px painted is the smallest control on the screen. `touch-44` raises the
 * hit area with an `::after`, which works here because a `<span>` is not a
 * REPLACED element — the trap `globals.css` records for `<select>` and which
 * `FeedbackList` fell into. Measured at 320px and 390px: see the phase report.
 */
export function GrabHandle({ label }: { label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="touch-44 w-4 flex-none cursor-grab select-none text-[14px] leading-none tracking-[1px] text-mut"
    >
      ⠿
    </span>
  )
}
