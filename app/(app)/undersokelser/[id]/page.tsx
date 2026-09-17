import { notFound, redirect } from 'next/navigation'
import { SURVEY_TABS, TAB_SEGMENT } from '@/lib/surveys/tabs'

/** Same guard as the Builder: a malformed id is a 404, not a 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * V7-4 — WHAT `/undersokelser/[id]` MEANS, decided rather than inherited.
 *
 * ── THE COMMENT THAT USED TO BE HERE DESCRIBED A WORLD THAT ENDED AT F5-2 ──
 *
 * It said «the design's survey context is a step rail over Bygg / Send /
 * Resultater, and Bygg is the first step», and it redirected to `/bygg`. Both
 * halves stopped being true: the rail is eight tabs (`SURVEY_TABS`), and F5-2
 * moved «Spørsmål» to the READ view with the builder one click further on
 * (`v6:1377` puts «Åpne byggeren» beside the question table). So the survey's
 * own index landed somewhere the tab registry no longer treats as its front
 * door — **a correct line made wrong by its surroundings**, which is the shape
 * this tranche has now met four times.
 *
 * ── THE TARGET IS DERIVED, AND THAT IS THE WHOLE POINT ────────────────────
 *
 * `TAB_SEGMENT[SURVEY_TABS[0]]` rather than a literal. The registry already
 * decides which tab is first and which segment it owns, so reordering it moves
 * this redirect with it. A hard-coded `'bygg'` is a second answer to a question
 * the registry answers, and it is the second answer that goes stale.
 *
 * ── AND THE ONE CALLER NOW STATES ITS OWN INTENT ──────────────────────────
 *
 * Measured before deciding: exactly ONE place linked here, the library's «Bruk
 * mal» (`bibliotek/actions.ts`), and it wants the EDITOR — you have just made a
 * survey from a template and there is nothing to read yet. It redirects to
 * `/bygg` itself now, so this route no longer has to mean two things at once,
 * and nothing depends on what the index resolves to.
 */
export default async function SurveyIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  redirect(`/undersokelser/${id}/${TAB_SEGMENT[SURVEY_TABS[0]]}`)
}
