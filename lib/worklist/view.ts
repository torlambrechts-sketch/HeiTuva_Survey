/**
 * WHERE THE ARBEIDSLISTE'S VIEW MODE LIVES — and why there is no column set.
 *
 * Tor's decision: «cookie plus column, as Q122, NOT dashboard_layouts». Q122's
 * shape is the person's choice in a cookie and the organisation's default in a
 * column, and both halves are here.
 *
 * ── THE QUESTION HAD A SMALLER ANSWER THAN IT ASSUMED ──────────────────────
 *
 * It was put as «the column toggles AND the view mode are per-person state».
 * Measured, **there are no column toggles on this screen.** `colOwner`,
 * `colStatus`, `colDate`, `colResponses` and `colScore` render at v5:2959-2971,
 * which is inside `isUitest` (2913-3127) — they are the table-variant
 * playground's «Vis kolonner» control, fed by `uiColumns`, and read from
 * `st.uiCols`. Inside `isTasks` (3128 onward) there are **zero** references to
 * any of them.
 *
 * So this module carries one thing. That is the whole of the per-person state
 * the Arbeidsliste actually has, and building five column toggles because an
 * instruction listed them would have been inventing controls the bundle does
 * not draw on that screen.
 *
 * The same measurement moves the uitest count from 23 of 45 to **28 of 45** —
 * and it is the second time a v5 state was assigned by its NAME rather than by
 * the screen it renders on. `hasSubtools` was the first. A prefix is not a
 * location.
 */

/** The cookie is per-DEVICE, which is what makes «huskes på denne enheten»
 *  true of it and false of a column — Q122's own reason. The Arbeidsliste is a
 *  server component, so localStorage cannot reach it either way. */
export const WORKLIST_COOKIE = 'heituva.worklist'

export const WORKLIST_VIEWS = ['list', 'board'] as const
export type WorklistView = (typeof WORKLIST_VIEWS)[number]

/**
 * Resolved AGAINST THE SET rather than trusted, because a cookie is
 * user-supplied: an unknown value falls back exactly as an absent one does.
 * Three steps rather than `cookie ?? org ?? 'list'` because each fallback is a
 * different fact, and collapsing them hides a bad cookie behind a
 * correct-looking render — the same shape `readWorkspace` spells out.
 */
export function resolveWorklistView(
  cookieValue: string | null | undefined,
  orgDefault: string | null | undefined,
): WorklistView {
  const known = (v: string | null | undefined): WorklistView | undefined =>
    WORKLIST_VIEWS.find((k) => k === v)

  const fromCookie = known(cookieValue?.trim())
  const fromOrg = known(orgDefault?.trim())
  // 'list' is the table's own default, and it is also the column's default, so
  // the two cannot drift.
  return fromCookie ?? fromOrg ?? 'list'
}

/** Whether a value may be WRITTEN — the server-action boundary, kept beside the
 *  reader so a new view mode cannot be accepted by one and refused by the
 *  other. */
export function isWorklistView(v: unknown): v is WorklistView {
  return typeof v === 'string' && (WORKLIST_VIEWS as readonly string[]).includes(v)
}
