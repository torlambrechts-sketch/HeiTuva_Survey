/**
 * T5.1 — v8's dashboard meta strip (v8:2422-2432).
 *
 * ── WHAT THE DRAWING CARRIES, AND WHY THIS SHOWS TWO OF ITS FIVE CELLS ─────
 *
 * v8 draws FIVE cells, not the four the brief names — `Eier` is the fifth
 * (v8:2423). None of them is a link and none opens a panel: every one is a
 * `<span>` label over a `<span>` value, and two carry a sub-note. The controls
 * that DO act sit in the row above it (v8:2412-2418).
 *
 *     Eier        avatar + {{ dashOwner }}
 *     Utvalg      {{ docFilterLine }}
 *     Personvern  {{ dashThresholdLine }}  + «Gjelder alle paneler»
 *     Delt med    {{ dashSharedWith }}
 *     Rapporter   {{ dashRepCount }}       + «frosset herfra»
 *
 * THREE OF THE FIVE DESCRIBE A DASHBOARD MODEL WE DO NOT HAVE, and that is one
 * finding rather than three. v8's cells are all properties of `dashCur` — a
 * CURRENT dashboard chosen from several, with an owner, a share scope and a
 * version history. This product has one working layout per person
 * (`dashboard_layouts` where `user_id = viewer AND title = WORKING_TITLE`,
 * `page.tsx`) plus organisation presets you load INTO it. So:
 *
 *   - «Eier» would always be the viewer reading their own name.
 *   - «Delt med» would always be «Ikke delt» — the working layout is by
 *     definition the reader's own, so the cell can only ever say one thing,
 *     and a control that cannot vary is decoration (D208's first face).
 *   - «Rapporter · N · frosset herfra» has no derivation at all: `reports`
 *     records `base_template`, `duty_id` and `snapshot_id` and NOTHING that
 *     names the dashboard a freeze came from. v8 matches on the title string
 *     (`r.frozen.from === t`, v8:8970), which is not a relation.
 *
 * Rendering any of the three would be inventing a fact, so the strip carries
 * the two that describe real state. Adding them is a schema change and a
 * product decision about whether a person may keep several named dashboards —
 * raised, not settled here.
 *
 * ── THE TWO THAT ARE REAL ──────────────────────────────────────────────────
 *
 * «Utvalg» is `docFilterLine` (v8:9019): the period label and the group, both
 * already shipped — `periodLast/periodTwo/periodAll` are v8's own three
 * strings and `allGroups` is «alle grupper» verbatim. Nothing new was written.
 *
 * «Personvern» is `dashThresholdLine`, and the copy is REUSED rather than
 * rewritten: `lib/dashboard/threshold-line.ts` already decides it, and it
 * already refuses the drawing's formula in writing. v8 computes
 * `Math.max(...every PERSON survey in the ORGANISATION, 3)` (v8:8332) — org-wide
 * rather than over the selection, and floored at THREE, which has been the
 * wrong number since T1.9 made the floor two. Ours is the RPC's
 * `max(app.k_for(id))` over the SELECTION, which is the gate actually applied
 * to the panels on screen.
 *
 * The sentence appearing here AND in the customize card is the drawing's own
 * choice, not a duplication defect: v8 renders `dashThresholdLine` in the meta
 * strip (2429), inside the customize panel (2469) and in the share panel
 * (2582). F3's rule is about a RAIL duplicated between shell and page, which
 * can disagree about what is selected; a fact restated in the context that
 * needs it cannot disagree with itself.
 */
export function MetaBar({
  cells,
}: {
  cells: { key: string; label: string; value: string; note?: string }[]
}) {
  if (cells.length === 0) return null
  return (
    <div
      className="mt-4 grid gap-y-[18px] gap-x-[26px] rounded-[18px] border border-line bg-sf px-[22px] py-5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]"
    >
      {cells.map((c) => (
        <span key={c.key} className="min-w-0">
          <span className="block text-[11px] uppercase tracking-[.09em] text-mut">{c.label}</span>
          <span className="mt-[5px] block text-[14px] font-semibold">{c.value}</span>
          {c.note ? <span className="mt-0.5 block text-[12px] text-mut">{c.note}</span> : null}
        </span>
      ))}
    </div>
  )
}
