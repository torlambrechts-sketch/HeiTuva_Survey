/**
 * Bibliotek's filter vocabulary.
 *
 * The categories are the values `template_packs.category` is CHECK-constrained
 * to, so this list cannot drift from the database without the constraint
 * catching it. Kept out of the client components so a server component can map
 * over it — every export of a `'use client'` module becomes a client reference.
 */
export const PACK_CATEGORIES = ['Alle', 'Ansatte', 'Lovpålagt', 'Kunder', 'Annet'] as const
export type PackCategory = (typeof PACK_CATEGORIES)[number]

export const PACK_VIEWS = ['kort', 'liste'] as const
export type PackView = (typeof PACK_VIEWS)[number]

export const LIBRARY_TABS = ['maler', 'bank'] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

/** Message keys for the category chips; the design's own labels. */
export const CATEGORY_KEY: Record<PackCategory, string> = {
  Alle: 'catAll',
  Ansatte: 'catAnsatte',
  Lovpålagt: 'catLovpalagt',
  Kunder: 'catKunder',
  Annet: 'catAnnet',
}

/** Only two categories carry a note in the design (HeiTuva.dc.html:3729). */
export const CATEGORY_NOTE_KEY: Partial<Record<PackCategory, string>> = {
  Lovpålagt: 'noteLovpalagt',
  Kunder: 'noteKunder',
}

/**
 * Standard-pack tints (HeiTuva.dc.html:3737). The design indexes this array
 * with the card's position and NO modulo, so only the first five cards on the
 * grid are tinted and the sixth onwards sit untinted on the page ground. That
 * is deliberate — the tints lead the eye into the grid rather than colouring
 * all eighteen — so `packTint` returns undefined past the fifth instead of
 * cycling.
 */
const STANDARD_TINTS = ['#FFFDF6', '#FBD5C4', '#CFE7E4', '#FBEBBE', '#F3E7DB'] as const

/**
 * Firmaets maler use a different, four-colour palette and DO cycle
 * (HeiTuva.dc.html:3817) — an org can save many templates and the design keeps
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

/** The design shows "~N min" at 0.6 min per question (HeiTuva.dc.html:3737). */
export function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.round(questionCount * 0.6))
}
