import { notFound, redirect } from 'next/navigation'

/** Same guard as the Builder: a malformed id is a 404, not a 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A survey has no screen of its own — the design's survey context is a step
 * rail over Bygg / Send / Resultater (HeiTuva.dc.html:3397), and Bygg is the
 * first step. Existing links to /undersokelser/[id] (the library's "Bruk mal",
 * for one) land here and continue into the Builder.
 */
export default async function SurveyIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  redirect(`/undersokelser/${id}/bygg`)
}
