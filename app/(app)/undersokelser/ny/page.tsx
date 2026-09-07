import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { Wizard, type WizardGroup, type WizardPack } from './Wizard'

/**
 * The new-survey wizard (HeiTuva.dc.html:30-135).
 *
 * A route rather than a piece of list state: it is four steps of input ending
 * in a write, so it deserves a URL you can land on, link to and reload. The
 * design renders it as an overlay over Undersøkelser, and it still looks like
 * one — a fixed backdrop over the shell.
 */
export default async function NewSurveyPage() {
  const viewer = await requireViewer()
  // 'leser' cannot create a survey. Sending them to the list rather than
  // rendering a wizard whose every write RLS would refuse.
  if (viewer.role === 'leser') redirect('/undersokelser')

  const tQ = await getTranslations('qtype')
  const supabase = await createClient()

  // DECISIONS Q44: the purposes come from the chosen USE CASE, not from a
  // fixed list of six keys. `undersokelser/keys.ts`'s WIZARD_PACK_KEYS is
  // retired — it was a hand-picked menu that could not follow a pack being
  // added, and the bundle's step 0 makes the use case the thing you pick first
  // (NEW:4195-4197).
  //
  // Every shipped pack is read and grouped by use case here rather than
  // re-queried per step: six use cases and twenty-two packs is one small read,
  // and a query per chip would make the wizard's first click a round trip.
  const [{ data: useRows, error: useError }, { data: packRows, error: packError }] =
    await Promise.all([
      supabase.from('use_cases').select('key, label, short, description').order('sort_order'),
      supabase
        .from('template_packs')
        .select('id, key, title, category, use_case, legal_ref, questions, sort_order')
        .is('org_id', null)
        .order('sort_order'),
    ])
  if (useError) throw new Error(`wizard use cases read failed: ${useError.message}`)
  if (packError) throw new Error(`wizard packs read failed: ${packError.message}`)

  type PackQuestion = { text: string; type: string }
  const packs: WizardPack[] = (packRows ?? []).map((p) => {
    const questions = (Array.isArray(p.questions) ? p.questions : []) as unknown as PackQuestion[]
    return {
      id: p.id,
      title: p.title,
      // The design's meta line prefers the legal reference, falling back to
      // the category (HeiTuva.dc.html:3505).
      tag: p.legal_ref || p.category,
      useCase: p.use_case,
      questions: questions.map((q) => ({
        text: q.text,
        typeLabel: tQ(q.type as never),
      })),
    }
  })

  const useCases = (useRows ?? []).map((u) => ({
    key: u.key,
    label: u.label,
    short: u.short,
    description: u.description,
  }))

  const { data: groupRows, error: groupError } = await supabase
    .from('groups')
    .select('id, name, org_members!org_members_group_id_fkey(count)')
    .eq('org_id', viewer.orgId)
    .order('name')
  if (groupError) throw new Error(`wizard groups read failed: ${groupError.message}`)

  const groups: WizardGroup[] = (groupRows ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g.org_members?.[0]?.count ?? 0,
  }))

  return (
    <Wizard packs={packs} groups={groups} useCases={useCases} />
  )
}
