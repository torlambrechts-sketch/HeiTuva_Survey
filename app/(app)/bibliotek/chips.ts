/**
 * Bibliotek's filter vocabulary.
 *
 * The categories are the values `template_packs.category` is CHECK-constrained
 * to, so this list cannot drift from the database without the constraint
 * catching it. Kept out of the client components so a server component can map
 * over it — every export of a `'use client'` module becomes a client reference.
 */
/**
 * DECISIONS Q24/Q45 — THE CHIP RAIL IS NO LONGER THE CATEGORY COLUMN.
 *
 * The bundle's rail is «Alle» + the six USE CASES + «Lovpålagt» + «Annet»
 * (NEW:4469), so a chip is one of three different things and the filter has to
 * know which:
 *
 *   'Alle'           no filter
 *   a use-case key   `template_packs.use_case = <key>` — the customer-facing axis
 *   'Lovpålagt'      `template_packs.category = 'Lovpålagt'` — the ONLY category
 *                    chip that survives, because a statutory pack is a kind
 *                    rather than a use case and cuts across all six
 *   'annet'          `use_case is null` — an organisation's own pack that chose
 *                    none. Every SHIPPED pack maps (asserted as a total
 *                    function in `tests/db/use-cases.test.ts`), so this bucket
 *                    holds exactly the customer's own untagged templates.
 *
 * The use-case keys are NOT listed here: they are registry rows, read at
 * request time. Listing them would be the drift Q45's column comment warns
 * about, one file over.
 */
export const FIXED_PACK_CHIPS = ['Alle', 'Lovpålagt', 'annet'] as const
export type PackCategory = string

export const PACK_VIEWS = ['kort', 'liste'] as const
export type PackView = (typeof PACK_VIEWS)[number]

/* Q24's «Bruksområder» leads the rail (NEW:4460), and the rail itself moved to
   the shell in Q172 — so the tab registry lives in `lib/library/tabs.ts`, which
   both the subnav and this screen read. It is not re-exported from here: two
   spellings of one list is the thing that file exists to prevent. */

/** Message keys for the category chips; the design's own labels. */
/** Only two categories carry a note in the design (L:3729). */
/**
 * `packCatNote` (NEW:4479). The bundle takes the note from the USE CASE's own
 * description where one is selected, and falls back to two hand-written notes
 * for «Lovpålagt» and «Kunder». Here the use-case note comes from the registry
 * row (data), and only the statutory one is copy — «Kunder» is a use case now,
 * so its note IS its description and the hand-written one is retired.
 */
export const CATEGORY_NOTE_KEY: Record<string, string> = {
  Lovpålagt: 'noteLovpalagt',
}

/**
 * Standard-pack tints (L:3737). The design indexes this array
 * with the card's position and NO modulo, so only the first five cards on the
 * grid are tinted and the sixth onwards sit untinted on the page ground. That
 * is deliberate — the tints lead the eye into the grid rather than colouring
 * all eighteen — so `packTint` returns undefined past the fifth instead of
 * cycling.
 */
const STANDARD_TINTS = ['#FFFDF6', '#FBD5C4', '#CFE7E4', '#FBEBBE', '#F3E7DB'] as const

/**
 * Firmaets maler use a different, four-colour palette and DO cycle
 * (L:3817) — an org can save many templates and the design keeps
 * every one of them tinted.
 */
const OWN_TINTS = ['#FBEBBE', '#CFE7E4', '#FBD5C4', '#F3E7DB'] as const

/** The background for the i-th standard pack card, or undefined for no tint. */
export function packTint(i: number): string | undefined {
  return STANDARD_TINTS[i]
}

/** The background for the i-th Firmaets maler card. */
export function ownTint(i: number): string {
  return OWN_TINTS[i % OWN_TINTS.length]!
}

/** The design shows "~N min" at 0.6 min per question (L:3737). */
export function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.round(questionCount * 0.6))
}
