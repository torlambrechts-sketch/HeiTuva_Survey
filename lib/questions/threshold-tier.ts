/**
 * DECISIONS Q91 — which warning a threshold value earns.
 *
 * ── WHY THIS IS A FUNCTION AND NOT THREE `k <= 2` CHECKS ────────────────────
 *
 * Three surfaces state a consequence of the chosen threshold, in three
 * different voices, to three different people:
 *
 *   1. `administrasjon/PrivacyPanel` — the organisation's default, to an
 *      administrator setting a floor for surveys that do not exist yet.
 *   2. `undersokelser/[id]/bygg/PolicyPanel` — one survey's threshold, to the
 *      editor building it.
 *   3. `lib/respondent/anonymity-promise` — the promise itself, to the person
 *      about to answer.
 *
 * They must not disagree about WHERE the tiers begin, and an inline `k <= 2` in
 * each is three chances to disagree. This project has now hit one-function-many-
 * callers five times (recorded in `docs/v2/03-plan.md`), and every instance was
 * cheap in exactly this way: the rule moves once.
 *
 * ── WHY THE TIERS ARE NOT DEGREES OF ONE WARNING ────────────────────────────
 *
 * `low` (3-4): answers from a small group are harder to keep apart. A caveat.
 * `two`: the other respondent knows their own answer, sees the aggregate, and
 * SUBTRACTS. Not a caveat — a derivation. Writing 2 as "even smaller" is the
 * class of error Q17 calls «den eneste virkelige feilen i hele denne
 * endringen»: copy promising more than the setting holds. So the tiers get
 * different words and a different ground colour, and the boundary between them
 * is stated once, here.
 *
 * The caller owns the copy; this owns only which tier applies.
 */

/** The lowest threshold the database accepts for a natural person (Q91,
 *  `surveys_k_threshold_floor`). At this value the aggregate discloses. */
export const THRESHOLD_FLOOR = 2

/** Below this, an anonymous answer carries a caveat (Q17). */
export const THRESHOLD_CAVEAT_BELOW = 5

export type ThresholdTier = 'two' | 'low' | 'none'

/**
 * `<=` rather than `===` on the floor deliberately: the CHECK refuses 1, but a
 * value that somehow arrives below the floor must land on the STRONGER warning,
 * not fall past it into `low`. A guard that fails open on an impossible input is
 * how an impossible input becomes a silent one.
 */
export function thresholdTier(k: number): ThresholdTier {
  if (k <= THRESHOLD_FLOOR) return 'two'
  return k < THRESHOLD_CAVEAT_BELOW ? 'low' : 'none'
}
