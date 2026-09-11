'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { PackQuestion, surveyQuestionFrom } from '@/lib/questions/pack'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'

export type LibraryResult = { ok: true } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }

/**
 * `addBankQuestion` returns the row it inserted.
 *
 * The Builder's picker needs it. `Builder` holds its questions in
 * `useState(initial)`, and **`useState` ignores a new initial value** — so
 * `revalidatePath` re-renders the server component, hands down a fresh
 * `initial`, and the list on screen does not move. The insert would have
 * succeeded silently, which is the failure this whole overlay was built to stop
 * happening on the Library route.
 */
export type AddBankResult =
  | { ok: true; question: { id: string; type: string; text: string; config: unknown } }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }

/** A pack's `questions` jsonb. Only `text` and `type` are guaranteed; the rest
 *  is per-type config the builder understands. */
// PackQuestion moved to lib/questions/pack.ts. It used to be declared here
// too, WITHOUT `statements` and `multi` — which is why «Bruk mal» silently
// dropped both while the wizard kept them. One definition, two callers.

async function requireEditor() {
  const viewer = await requireViewer()
  // 'leser' may read the library but never create a survey — surveys_ins is
  // administrator/redaktør only, and RLS filters rather than errors, so a
  // silent no-op would look like success.
  if (viewer.role === 'leser') return null
  return viewer
}

/**
 * "Bruk mal" — instantiate a template pack as a new draft survey.
 *
 * Copies the pack's questions rather than referencing it: a survey is a record
 * of what was actually asked, so a later edit to the pack must not rewrite a
 * round that has already gone out. `template_pack_key` keeps the provenance.
 */
export async function createSurveyFromPack(packId: string): Promise<LibraryResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(packId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: pack, error: packError } = await supabase
    .from('template_packs')
    .select('key, title, audience, questions')
    .eq('id', packId)
    .single()
  if (packError || !pack) return { ok: false, error: 'invalid' }

  const { data: survey, error: surveyError } = await supabase
    .from('surveys')
    .insert({
      org_id: viewer.orgId,
      title: pack.title,
      audience_label: pack.audience,
      template_pack_key: pack.key,
      created_by: viewer.memberId,
    })
    .select('id')
    .single()
  if (surveyError || !survey) {
    console.error(`createSurveyFromPack: survey insert failed: ${surveyError?.message}`)
    return { ok: false, error: 'failed' }
  }

  const parsed = z.array(PackQuestion).safeParse(pack.questions)
  if (parsed.success && parsed.data.length) {
    const { error: qError } = await supabase.from('survey_questions').insert(
      // The SAME builder the wizard uses (lib/questions/pack.ts). This path
      // built `config` by hand from three fields, so `statements` and `multi`
      // were lost here and kept there — same pack, two surveys.
      parsed.data.map((q, i) => surveyQuestionFrom(q, survey.id, i) as never),
    )
    if (qError) {
      // Leave no half-built survey behind for someone to find later.
      await supabase.from('surveys').delete().eq('id', survey.id)
      console.error(`createSurveyFromPack: questions insert failed: ${qError.message}`)
      return { ok: false, error: 'failed' }
    }
  }

  revalidatePath('/undersokelser')
  redirect(`/undersokelser/${survey.id}`)
}

/** Firmaets maler: flip a saved template between private and shared. */
export async function setTemplatePrivate(packId: string, isPrivate: boolean): Promise<LibraryResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(packId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('template_packs')
    .update({ private: isPrivate })
    .eq('id', packId)
    .eq('org_id', viewer.orgId)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/bibliotek')
  return { ok: true }
}

export async function deleteTemplate(packId: string): Promise<LibraryResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(packId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  // org_id is in the filter as well as the policy: a standard pack has
  // org_id null and must never be deletable from here.
  const { error } = await supabase
    .from('template_packs')
    .delete()
    .eq('id', packId)
    .eq('org_id', viewer.orgId)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/bibliotek')
  return { ok: true }
}

/**
 * "Legg til" — append a bank question to a draft.
 *
 * The design shows this adding "rett inn i {draftTitle}" against a single
 * implicit draft. There is no such thing here, so the target is the org's most
 * recently updated draft and the caller passes it explicitly — see
 * docs/DEVIATIONS.md D26.
 */
export async function addBankQuestion(questionId: string, surveyId: string): Promise<AddBankResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(questionId).success) return { ok: false, error: 'invalid' }
  if (!z.string().uuid().safeParse(surveyId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: q, error: qError } = await supabase
    .from('question_bank')
    .select('text, type, config, used_count')
    .eq('id', questionId)
    .single()
  if (qError || !q) return { ok: false, error: 'invalid' }

  const { data: last } = await supabase
    .from('survey_questions')
    .select('position')
    .eq('survey_id', surveyId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: inserted, error } = await supabase
    .from('survey_questions')
    .insert({
      survey_id: surveyId,
      position: (last?.position ?? -1) + 1,
      type: q.type,
      text: q.text,
      config: q.config,
    })
    .select('id, type, text, config')
    .single()
  if (error || !inserted) {
    console.error(`addBankQuestion failed: ${error?.message ?? 'no row returned'}`)
    return { ok: false, error: 'failed' }
  }

  await supabase
    .from('question_bank')
    .update({ used_count: (q.used_count ?? 0) + 1 })
    .eq('id', questionId)

  revalidatePath('/bibliotek')
  // B3: the Builder's picker calls this too, and its own route is where the new
  // question has to appear. Without this the overlay adds a row the page behind
  // it does not show until a manual reload — the insert succeeds and the screen
  // says nothing, which reads exactly like a failure.
  revalidatePath(`/undersokelser/${surveyId}/bygg`)
  return {
    ok: true,
    question: { id: inserted.id, type: inserted.type, text: inserted.text, config: inserted.config },
  }
}

export async function deleteBankQuestion(questionId: string): Promise<LibraryResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(questionId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  // Standard bank questions have org_id null and are not deletable.
  const { error } = await supabase
    .from('question_bank')
    .delete()
    .eq('id', questionId)
    .eq('org_id', viewer.orgId)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/bibliotek')
  return { ok: true }
}
