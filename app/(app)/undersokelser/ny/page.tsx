import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { WIZARD_PACK_KEYS } from '../keys'
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

  const { data: packRows, error: packError } = await supabase
    .from('template_packs')
    .select('id, key, title, category, legal_ref, questions')
    .is('org_id', null)
    .in('key', WIZARD_PACK_KEYS as unknown as string[])
  if (packError) throw new Error(`wizard packs read failed: ${packError.message}`)

  type PackQuestion = { text: string; type: string }
  const byKey = new Map((packRows ?? []).map((p) => [p.key, p]))
  // Ordered by the design's list, not by whatever the database returns.
  const packs: WizardPack[] = WIZARD_PACK_KEYS.flatMap((key) => {
    const p = byKey.get(key)
    if (!p) return []
    const questions = (Array.isArray(p.questions) ? p.questions : []) as unknown as PackQuestion[]
    return [
      {
        id: p.id,
        title: p.title,
        // The design's meta line prefers the legal reference, falling back to
        // the category (HeiTuva.dc.html:3505).
        tag: p.legal_ref || p.category,
        questions: questions.map((q) => ({
          text: q.text,
          typeLabel: tQ(q.type as never),
        })),
      },
    ]
  })

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
    <Wizard packs={packs} groups={groups} />
  )
}
