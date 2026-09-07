/**
 * DECISIONS Q42 — which threshold the «Tilpass» card's line reports, and what
 * it says when there is none.
 *
 * THE VALUE IS THE RPC'S, NOT THE BUNDLE'S. The bundle computes
 * `Math.max(...all PERSON surveys in the ORGANISATION, 3)` (NEW:3533); the
 * RPCs compute `max(app.k_for(s.id))` over the SELECTION (M:0032:973, 1043).
 * The line describes the gate that was applied to the panels on screen, so a
 * number the RPCs did not apply would be a fabricated claim — CLAUDE.md,
 * "Never fabricate data in the UI". The bundle wins on visuals, not on what a
 * number means; its copy is kept verbatim and only the value changes.
 *
 * THE k = 0 CASE, WHICH THE BUNDLE'S FORMULA STRUCTURALLY CANNOT REACH.
 * `app.k_for` returns 0 for an organisation survey (Q17/Q47: an organisation is
 * not a natural person and no threshold protects it), and the bundle's formula
 * filters to person surveys and floors at 3, so it can never show 0. The RPC's
 * can, whenever every selected survey is an organisation survey. Rendering
 * «strengeste terskel blant valgte undersøkelser: 0» would be TRUE and would
 * READ AS BROKEN — the same class as k=0 returning nulls and 500ing the
 * attributed page in V1-2. So that selection gets its own sentence.
 *
 * D98's rule applies to all three: THE COPY DOES NOT VARY WITH THE DATA. Only
 * the branch varies, and the branch is a property of the SELECTION (are these
 * organisations or people?), never of the answers. A sentence that changed with
 * how many people had replied would be an oracle for how many had replied.
 */
export type ThresholdLine =
  | { key: 'thresholdLine'; values: { k: number } }
  | { key: 'thresholdLineOrg'; values: Record<string, never> }
  | { key: 'thresholdLineNone'; values: Record<string, never> }

/**
 * @param k the `k` the RPC returned for this selection, or null when no RPC ran
 *          (nothing selected, or nothing to show).
 */
export function thresholdLine(k: number | null | undefined): ThresholdLine {
  if (k === null || k === undefined) return { key: 'thresholdLineNone', values: {} }

  // 0 is the magic value, and it is spelled out rather than treated as falsy:
  // `if (!k)` would fold null, undefined and 0 into one branch, and they are
  // three different states — no selection, no data, and a selection that has
  // no threshold BY DESIGN.
  if (k === 0) return { key: 'thresholdLineOrg', values: {} }

  return { key: 'thresholdLine', values: { k } }
}
