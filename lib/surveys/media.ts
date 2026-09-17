/**
 * V7-3c — WHAT MAY BE UPLOADED FOR AN IMAGE BLOCK, AND WHAT MAY BE LINKED FOR
 * A VIDEO ONE.
 *
 * Both halves are refusals, and both are stated here once so the editor, the
 * save path and the two route handlers cannot disagree about them.
 *
 * ── THE IMAGE: RASTER ONLY, AND THAT IS NOT INHERITED ──────────────────────
 *
 * `org-logos` permits `image/svg+xml`. An SVG is a document that can carry
 * script; a logo is chosen by an administrator and rendered to managers. These
 * objects are rendered to RESPONDENTS, from a file a redaktør picked, on the
 * one surface this product has kept free of anything that could observe the
 * person reading it. So the allowlist is raster and the bucket enforces the
 * same three types from the other side (M:0128).
 *
 * ── THE VIDEO: A LINK THE RESPONDENT CHOOSES, NEVER AN EMBED ───────────────
 *
 * `docs/v7/02-blocks-measurement.md § 4` flagged this as a stop-and-ask: an
 * `<iframe>` or `<video>` on `/s/[token]` pointed at a URL an editor typed is a
 * THIRD-PARTY REQUEST MADE FROM THE RESPONDENT'S BROWSER, and it would be made
 * whether or not she wants to watch.
 *
 * **The drawing does not embed.** v7:5406-5412 renders the video block as a
 * card with a play triangle and «Spill av videoen» — a control, not a player.
 * So the fidelity-correct build is a card, and the only question is what
 * pressing it does. It opens the link in a new tab: the request is then the
 * respondent's own navigation, made after she has seen where it goes, and
 * `rel="noopener noreferrer"` keeps the token out of the `Referer` header.
 * `frame-src` in the CSP admits nothing but Turnstile, so an embed could not
 * have rendered anyway without widening a global header for one block type.
 *
 * `https:` only. `http:` would downgrade a page served over HSTS, and every
 * other scheme — `javascript:`, `data:`, `blob:` — is a way to make a link do
 * something other than navigate. Parsed rather than pattern-matched, because a
 * regex over a URL is a second implementation of a parser that ships with the
 * platform.
 */
export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type MediaType = (typeof MEDIA_TYPES)[number]

/** Same ceiling as `org-logos` (M:0056), and the bucket enforces it too. */
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024

const EXT: Record<MediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function isMediaType(v: unknown): v is MediaType {
  return typeof v === 'string' && (MEDIA_TYPES as readonly string[]).includes(v)
}

/**
 * The object path, derived SERVER-SIDE and never accepted from the client.
 *
 * The survey id leads, so all four of M:0128's policies scope by prefix with no
 * join — a path is an authorisation claim, and taking one from a browser would
 * mean validating a string that has no business crossing the boundary. The
 * second segment is random rather than the block's id so that replacing a
 * picture cannot be mistaken for a cache of the old one, and because a block
 * that is duplicated must not share an object with its copy.
 */
export function mediaPath(surveyId: string, type: MediaType, random: string): string {
  return `${surveyId}/${random}.${EXT[type]}`
}

/** The content type a stored path implies — the route sets it explicitly. */
export function typeOfPath(path: string): MediaType {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

/**
 * The respondent's own URL for a block's picture. Same origin, so `img-src
 * 'self'` admits it; the token is already in the path the page was served
 * from, so this adds no secret the reader does not hold.
 */
export function respondentMediaHref(token: string, blockId: string): string {
  return `/s/${encodeURIComponent(token)}/media/${encodeURIComponent(blockId)}`
}

/** The editor's own URL for the same object, authorised by their session. */
export function editorMediaHref(blockId: string): string {
  return `/api/block-media/${encodeURIComponent(blockId)}`
}

/**
 * `https:` and nothing else, or null.
 *
 * Null is a REFUSAL the caller has to render, not a fallback: a video block
 * whose url does not parse shows its title and says the link is missing, which
 * is the design's own empty treatment rather than a dead control.
 */
export function safeVideoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  // `https://` alone parses, with an empty host. A link to nowhere is not a link.
  if (!u.hostname) return null
  return u.toString()
}
