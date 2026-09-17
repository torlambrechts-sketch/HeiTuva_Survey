import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { typeOfPath } from '@/lib/surveys/media'

/**
 * V7-3c — the same picture, served to the EDITOR who uploaded it.
 *
 * An editor who cannot see what they uploaded cannot tell they uploaded the
 * wrong one, so the builder's preview is a requirement rather than decoration.
 * It goes through a route for the same reason the respondent's does — a
 * Supabase signed URL is not `'self'` and the CSP refuses it in an `<img>`.
 *
 * ── THE POLICY IS THE RULE; THIS HANDLER IS THE MESSAGE ────────────────────
 *
 * This reads through the VIEWER'S OWN SESSION. No service role anywhere: the
 * table read is admitted by `survey_blocks`' select policy and the object read
 * by `svmedia_obj_sel`, both resolving `app.can_edit_survey` (M:0127, M:0128).
 * A signed-in member of another organisation gets 404 because the row is not
 * visible to them, not because this file checked — which is the difference
 * between a rule and one caller's manners.
 *
 * Unlike the respondent's route this one reads `survey_blocks` LIVE rather than
 * a snapshot, and that is right: the editor is looking at the draft, which is
 * the thing they are editing. The frozen copy is what a past respondent sees.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ blockId: string }> },
) {
  const { blockId } = await params
  const supabase = await createClient()

  const { data: block } = await supabase
    .from('survey_blocks')
    .select('media_key, type')
    .eq('id', blockId)
    .maybeSingle()
  if (!block || block.type !== 'img' || !block.media_key) {
    return new Response(null, { status: 404 })
  }

  const { data: file, error } = await supabase
    .storage.from('survey-media')
    .download(block.media_key)
  if (error || !file) return new Response(null, { status: 404 })

  return new Response(await file.arrayBuffer(), {
    headers: {
      'Content-Type': typeOfPath(block.media_key),
      // No cache at all: the editor replaces the picture and must see the new
      // one. A stale preview here is the defect the preview exists to prevent.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
