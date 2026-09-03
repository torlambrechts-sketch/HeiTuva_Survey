import { redirect } from 'next/navigation'

/**
 * A survey has no screen of its own — the design's survey context is a step
 * rail over Bygg / Send / Resultater (HeiTuva.dc.html:3397), and Bygg is the
 * first step. Existing links to /undersokelser/[id] (the library's "Bruk mal",
 * for one) land here and continue into the Builder.
 */
export default async function SurveyIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/undersokelser/${id}/bygg`)
}
