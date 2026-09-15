/**
 * WHERE THE SURVEY LIST'S VIEW MODE AND TUVA'S PLACEMENT LIVE.
 *
 * Q122's mechanism, as Q152 applied it to the Arbeidsliste: the person's choice
 * in a cookie, the organisation's default in a column (`M:0122`). The screen is
 * a server component, so `localStorage` cannot reach the render that needs it —
 * that is not a preference between mechanisms, it is one of them not working.
 *
 * ── TWO COOKIES, AND ONLY ONE COLUMN ───────────────────────────────────────
 *
 * The view mode gets a column because a house default is a real choice. Tuva's
 * placement does NOT, and `M:0122` carries the argument: there is no
 * organisation-level fact about where one person wants an assistant to sit.
 * They are separate cookies rather than one packed value because they are
 * independent — a person may want the table AND the bubble — and a combined
 * value would make every write to one a write to the other.
 */

/** Per-DEVICE, which is what makes «huskes på denne enheten» true of it and
 *  false of a column — Q122's own reason. */
export const SURVEY_VIEW_COOKIE = 'heituva.svview'
export const SURVEY_TUVA_COOKIE = 'heituva.svtuva'

/**
 * The three the drawing offers (`viewTabs`, v6:8947), keyed by ITS OWN names.
 *
 * **The mapping is the thing to get right, and it is not the obvious one.**
 * v6:8942 reads `rowsOn: (st.svView || "liste") === "liste"`, `listOn:
 * st.svView === "delt"`, `boxOn: st.svView === "kort"` — so «Liste» renders the
 * six-column TABLE and «Liste og detalj» renders the list-plus-panel. Reading
 * the labels instead of the keys gets these two backwards, which would ship the
 * detail panel under the table's name.
 */
export const SURVEY_VIEWS = ['liste', 'delt', 'kort'] as const
export type SurveyView = (typeof SURVEY_VIEWS)[number]

/** Where Tuva sits. `side` is v6's DEFAULT (`svTuvaSide: st.svTuvaDocked !==
 *  false`, v6:9014) and `bubble` is the alternate — the app had neither. */
export const TUVA_PLACEMENTS = ['side', 'bubble'] as const
export type TuvaPlacement = (typeof TUVA_PLACEMENTS)[number]

/**
 * Resolved AGAINST THE SET rather than trusted, because a cookie is
 * user-supplied: an unknown value falls back exactly as an absent one does.
 *
 * Three steps rather than `cookie ?? org ?? 'liste'` because each fallback is a
 * different fact, and collapsing them hides a bad cookie behind a
 * correct-looking render — `resolveWorklistView` and `readWorkspace` both spell
 * the same three out.
 */
export function resolveSurveyView(
  cookieValue: string | null | undefined,
  orgDefault: string | null | undefined,
): SurveyView {
  const known = (v: string | null | undefined): SurveyView | undefined =>
    SURVEY_VIEWS.find((k) => k === v)

  const fromCookie = known(cookieValue?.trim())
  const fromOrg = known(orgDefault?.trim())
  // 'liste' is the table's own default AND the column's default, so the two
  // cannot drift.
  return fromCookie ?? fromOrg ?? 'liste'
}

/** No column, so two steps rather than three — and the default is the
 *  DRAWING's: `svTuvaDocked !== false` means an unset value is the side
 *  column, not the bubble. */
export function resolveTuvaPlacement(cookieValue: string | null | undefined): TuvaPlacement {
  return TUVA_PLACEMENTS.find((k) => k === cookieValue?.trim()) ?? 'side'
}

/** Whether a value may be WRITTEN — the server-action boundary, kept beside the
 *  readers so a fourth view cannot be accepted by one and refused by the
 *  other. */
export function isSurveyView(v: unknown): v is SurveyView {
  return typeof v === 'string' && (SURVEY_VIEWS as readonly string[]).includes(v)
}
