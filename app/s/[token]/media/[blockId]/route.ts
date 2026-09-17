import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { respondentFlow } from '@/lib/respondent/flow'
import { typeOfPath } from '@/lib/surveys/media'

/**
 * V7-3c — the picture on an image block, served to a respondent.
 *
 * ── WHY THIS ROUTE EXISTS AT ALL ───────────────────────────────────────────
 *
 * `next.config.ts` sets `img-src 'self' data: blob:`. A Supabase signed URL is
 * on the Supabase origin, so an `<img>` pointed at one is refused by the
 * browser — with a correct URL and no picture, which is the one failure shape
 * this project has hit eight times. Serving the bytes from our own origin
 * needs no CSP change, and it has a second and better property:
 *
 * **NO STORAGE PATH EVER REACHES A CLIENT.** `docs/v7/02-blocks-measurement.md
 * § 4` measured that an image block would be the first storage URL on a
 * respondent surface, and that the logo's path shape would have put the
 * organisation's primary key in front of somebody promised anonymity. Under
 * this route the browser holds `/s/<token>/media/<block_id>` and nothing else.
 *
 * ── THE AUTHORISATION IS THE TOKEN, AND IT IS CHECKED AGAINST THE SNAPSHOT ──
 *
 * Three things have to be true before a byte is read:
 *
 *  1. `get_survey_for_token` resolves, with the ANON key — the same RPC the
 *     page uses, so a closed, replaced or unknown token is refused by the same
 *     rule rather than by a copy of it.
 *  2. The requested block id is in THAT ROUND'S SNAPSHOT. The snapshot is the
 *     frozen truth, so this route never reads `survey_blocks`: editing a
 *     survey cannot change what a past respondent's link serves, and a block
 *     id from a different survey is simply not there.
 *  3. The entry is an `img` block that has a `media_key`.
 *
 * Only then is the service role used, and it is used for ONE thing: reading
 * one object out of one private bucket. There is no session on this path — a
 * respondent holds a link, which is exactly the case `createAdminClient`'s own
 * comment admits it for. It never touches a table here.
 *
 * ── AND NOTHING ABOUT THE READER IS RECORDED ───────────────────────────────
 *
 * Invariant 2 is a property of what can be observed, not only of what is
 * stored. No token in a log line, no address, no user agent, and one 404 for
 * every way of being wrong — a distinct «no such block» would tell a holder of
 * one survey's link which block ids belong to another's.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'survey-media'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; blockId: string }> },
) {
  const { token, blockId } = await params

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await anon.rpc('get_survey_for_token', { p_token: token })
  if (error || !data) return notFound()
  const payload = data as { error?: string; questions?: unknown }
  if (payload.error) return notFound()

  // The snapshot decides, and it is read through the same parser the flow uses
  // — so «is this a block» has one answer in this codebase, not two.
  const step = respondentFlow(payload.questions).find(
    (s) => s.kind === 'block' && s.block.id === blockId,
  )
  if (!step || step.kind !== 'block' || step.block.type !== 'img' || !step.block.hasMedia) {
    return notFound()
  }

  // `media_key` is deliberately absent from `RespondentBlock`, so it is read
  // from the raw snapshot here and nowhere else — the one place it is needed.
  const raw = (Array.isArray(payload.questions) ? payload.questions : []).find(
    (e) => e && typeof e === 'object' && (e as { id?: unknown }).id === blockId,
  ) as { media_key?: unknown } | undefined
  const key = typeof raw?.media_key === 'string' ? raw.media_key : null
  if (!key) return notFound()

  const { data: file, error: dlError } = await createAdminClient()
    .storage.from(BUCKET)
    .download(key)
  if (dlError || !file) return notFound()

  return new Response(await file.arrayBuffer(), {
    headers: {
      'Content-Type': typeOfPath(key),
      // The respondent's own browser may keep it; nothing shared may. The
      // object behind a sent round is immutable, so a short private cache
      // costs nothing and saves a re-download on every step change.
      'Cache-Control': 'private, max-age=600, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** One answer for every way of being wrong. */
function notFound() {
  return new Response(null, { status: 404 })
}
