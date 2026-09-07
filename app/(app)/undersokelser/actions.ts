'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'
import { NEW_QUESTION_TEXT, specOf } from '@/lib/questions/registry'
import { PackQuestion, configFor } from '@/lib/questions/pack'
import { SHARE_SCOPES, WIZARD_CADENCES } from './keys'

export type SurveyResult = { ok: true } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }

const Uuid = z.string().uuid()

/**
 * A pack's `questions` jsonb. Only text and type are guaranteed; everything
 * else is per-type config the Builder understands.
 */
// PackQuestion and configFor moved to lib/questions/pack.ts — see the note
// there: two copies of this produced two different surveys from one pack.

/**
 * 'leser' may see the list but never change it. RLS enforces this too
 * (surveys_ins/upd are administrator/redaktør), but RLS *filters* rather than
 * errors, so without this check a reader would be told "saved" while nothing
 * changed.
 */
async function requireEditor() {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return null
  return viewer
}


/**
 * "Tom undersøkelse" — a draft with a single scale question, matching the
 * prototype's blank start (HeiTuva.dc.html:3487), which opens the Builder with
 * one question already expanded rather than on an empty list.
 */
export async function createBlankSurvey(): Promise<SurveyResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }

  const supabase = await createClient()
  const { data: survey, error } = await supabase
    .from('surveys')
    .insert({
      org_id: viewer.orgId,
      title: 'Ny undersøkelse',
      audience_label: 'Alle ansatte',
      created_by: viewer.memberId,
    })
    .select('id')
    .single()
  if (error || !survey) {
    console.error(`createBlankSurvey: insert failed: ${error?.message}`)
    return { ok: false, error: 'failed' }
  }

  const { error: qError } = await supabase.from('survey_questions').insert({
    survey_id: survey.id,
    position: 0,
    type: 'scale',
    text: NEW_QUESTION_TEXT.scale,
    config: specOf('scale').defaultConfig as never,
  })
  if (qError) {
    await supabase.from('surveys').delete().eq('id', survey.id)
    console.error(`createBlankSurvey: question insert failed: ${qError.message}`)
    return { ok: false, error: 'failed' }
  }

  revalidatePath('/undersokelser')
  redirect(`/undersokelser/${survey.id}/bygg`)
}

const WizardInput = z.object({
  packId: Uuid,
  count: z.coerce.number().int().min(2).max(7),
  groupIds: z.array(Uuid).max(50),
  // The wizard's six (NEW:4220), not the registry's eight: `keys.ts` explains
  // which and why. Validated against the same list the chips render from, so a
  // chip can never be offered that the action refuses.
  cadence: z.enum(WIZARD_CADENCES),
})

/**
 * The wizard's four steps, committed.
 *
 * `target` is counted from the chosen groups' real active membership rather
 * than the prototype's hard-coded head counts — it is the denominator of every
 * response percentage the product reports, so a made-up number would make the
 * whole figure wrong.
 */
export async function createSurveyFromWizard(formData: FormData): Promise<SurveyResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }

  const parsed = WizardInput.safeParse({
    packId: formData.get('packId'),
    count: formData.get('count'),
    groupIds: formData.getAll('groupIds').map(String),
    cadence: formData.get('cadence'),
  })
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { packId, count, groupIds, cadence } = parsed.data

  const supabase = await createClient()
  const { data: pack, error: packError } = await supabase
    .from('template_packs')
    .select('key, title, audience, questions')
    .eq('id', packId)
    .single()
  if (packError || !pack) return { ok: false, error: 'invalid' }

  let target: number | null = null
  if (groupIds.length) {
    const { count: members } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', viewer.orgId)
      .eq('status', 'active')
      .in('group_id', groupIds)
    target = members ?? null
  }

  const { data: survey, error: surveyError } = await supabase
    .from('surveys')
    .insert({
      org_id: viewer.orgId,
      title: pack.title,
      audience_label: pack.audience,
      template_pack_key: pack.key,
      target,
      created_by: viewer.memberId,
    })
    .select('id')
    .single()
  if (surveyError || !survey) {
    console.error(`createSurveyFromWizard: survey insert failed: ${surveyError?.message}`)
    return { ok: false, error: 'failed' }
  }

  const questions = z.array(PackQuestion).safeParse(pack.questions)
  if (questions.success && questions.data.length) {
    const chosen = questions.data.slice(0, count)
    const { error: qError } = await supabase.from('survey_questions').insert(
      chosen.map((q, i) => ({
        survey_id: survey.id,
        position: i,
        type: q.type as never,
        text: q.text,
        help: q.help ?? null,
        required: q.required ?? false,
        config: configFor(q) as never,
      })),
    )
    if (qError) {
      await supabase.from('surveys').delete().eq('id', survey.id)
      console.error(`createSurveyFromWizard: questions insert failed: ${qError.message}`)
      return { ok: false, error: 'failed' }
    }
  }

  // 'once' needs no schedule row; a recurring survey does, and Phase 3's pgmq
  // worker reads it. runs_total 0 means "until stopped" per the column comment.
  if (cadence !== 'once') {
    const { error: schedError } = await supabase.from('schedules').insert({
      survey_id: survey.id,
      cadence,
      runs_total: 0,
      // Q20: `custom` needs its three settings or `schedules_custom_shape`
      // refuses the row. The wizard has no editor for them — it is the
      // four-step path for someone who has not thought about frequency — so it
      // seeds the same defaults the Send screen opens with, and Send is where
      // they are changed. Without this the insert failed silently (the error is
      // logged, not surfaced) and a wizard survey chose «Tilpasset» and got no
      // schedule at all.
      ...(cadence === 'custom'
        ? { custom_every: 1, custom_unit: 'weeks', custom_weekday: 1 }
        : {}),
    })
    if (schedError) console.error(`createSurveyFromWizard: schedule failed: ${schedError.message}`)
  }

  revalidatePath('/undersokelser')
  redirect(`/undersokelser/${survey.id}/bygg`)
}

/**
 * "Kopier som ny runde" — a fresh draft carrying the same questions.
 *
 * Deliberately a copy, not a new `survey_rounds` row: the menu item sits on a
 * survey the user wants to run again with the freedom to edit first, and a
 * round's `question_snapshot` is immutable by design. Responses are never
 * copied, and the copy starts as a draft.
 */
export async function copyAsNewRound(surveyId: string): Promise<SurveyResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!Uuid.safeParse(surveyId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: source, error: readError } = await supabase
    .from('surveys')
    .select('title, audience_label, anonymity, source_lang, langs, template_pack_key, engage, target')
    .eq('id', surveyId)
    .single()
  if (readError || !source) return { ok: false, error: 'invalid' }

  const { data: copy, error: copyError } = await supabase
    .from('surveys')
    .insert({
      org_id: viewer.orgId,
      // The prototype strips an existing " (kopi)" before appending, so copying
      // a copy does not accumulate suffixes.
      title: `${source.title.replace(/ \(kopi\)$/, '')} (kopi)`,
      audience_label: source.audience_label,
      anonymity: source.anonymity,
      source_lang: source.source_lang,
      langs: source.langs,
      template_pack_key: source.template_pack_key,
      engage: source.engage,
      target: source.target,
      created_by: viewer.memberId,
    })
    .select('id')
    .single()
  if (copyError || !copy) {
    console.error(`copyAsNewRound: insert failed: ${copyError?.message}`)
    return { ok: false, error: 'failed' }
  }

  const { data: questions } = await supabase
    .from('survey_questions')
    .select('position, type, text, help, required, comment_mode, follow_up_on_low, config')
    .eq('survey_id', surveyId)
    .order('position')

  if (questions?.length) {
    const { error: qError } = await supabase
      .from('survey_questions')
      .insert(questions.map((q) => ({ ...q, survey_id: copy.id })))
    if (qError) {
      await supabase.from('surveys').delete().eq('id', copy.id)
      console.error(`copyAsNewRound: questions insert failed: ${qError.message}`)
      return { ok: false, error: 'failed' }
    }
  }

  revalidatePath('/undersokelser')
  redirect(`/undersokelser/${copy.id}/bygg`)
}

/** "Lukk for svar". Only an active survey can close; the menu hides it otherwise. */
export async function closeSurvey(surveyId: string): Promise<SurveyResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!Uuid.safeParse(surveyId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('surveys')
    .update({ status: 'lukket' })
    .eq('id', surveyId)
    .eq('status', 'aktiv')
    .select('id')
  if (error) {
    console.error(`closeSurvey: update failed: ${error.message}`)
    return { ok: false, error: 'failed' }
  }
  // Zero rows means RLS filtered it or the status moved under us. Either way
  // nothing changed, so do not report success.
  if (!data?.length) return { ok: false, error: 'forbidden' }

  await audit(viewer.orgId, 'survey.closed', surveyId)
  revalidatePath('/undersokelser')
  return { ok: true }
}

/**
 * "Slett". A soft delete: `deleted_at` is set and every list read filters on
 * it. Responses are never touched, because deleting a survey must not be a way
 * to make the anonymised answers disappear from retention accounting.
 */
export async function deleteSurvey(surveyId: string): Promise<SurveyResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!Uuid.safeParse(surveyId).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('surveys')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', surveyId)
    .is('deleted_at', null)
    .select('id')
  if (error) {
    console.error(`deleteSurvey: update failed: ${error.message}`)
    return { ok: false, error: 'failed' }
  }
  if (!data?.length) return { ok: false, error: 'forbidden' }

  await audit(viewer.orgId, 'survey.deleted', surveyId)
  revalidatePath('/undersokelser')
  return { ok: true }
}

/** Add or remove a co-editor. Idempotent per the design's toggle rows. */
export async function toggleEditor(surveyId: string, memberId: string): Promise<SurveyResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!Uuid.safeParse(surveyId).success || !Uuid.safeParse(memberId).success) {
    return { ok: false, error: 'invalid' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('survey_editors')
    .select('member_id')
    .eq('survey_id', surveyId)
    .eq('member_id', memberId)
    .maybeSingle()

  const { error } = existing
    ? await supabase
        .from('survey_editors')
        .delete()
        .eq('survey_id', surveyId)
        .eq('member_id', memberId)
    : await supabase
        .from('survey_editors')
        .insert({ survey_id: surveyId, member_id: memberId, granted_by: viewer.memberId })
  if (error) {
    console.error(`toggleEditor: write failed: ${error.message}`)
    return { ok: false, error: 'failed' }
  }

  // Co-editing grants edit rights on someone else's survey, so it is an
  // access change and belongs in the trail.
  await audit(viewer.orgId, existing ? 'survey.editor_removed' : 'survey.editor_added', surveyId, {
    member_id: memberId,
  })
  revalidatePath('/undersokelser')
  return { ok: true }
}

/** "Hvem ser resultatene". */
export async function setResultsScope(surveyId: string, scope: string): Promise<SurveyResult> {
  const viewer = await requireEditor()
  if (!viewer) return { ok: false, error: 'forbidden' }
  if (!Uuid.safeParse(surveyId).success) return { ok: false, error: 'invalid' }
  const parsed = z.enum(SHARE_SCOPES as [string, ...string[]]).safeParse(scope)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('surveys')
    .update({ results_scope: parsed.data as never })
    .eq('id', surveyId)
    .select('id')
  if (error) {
    console.error(`setResultsScope: update failed: ${error.message}`)
    return { ok: false, error: 'failed' }
  }
  if (!data?.length) return { ok: false, error: 'forbidden' }

  await audit(viewer.orgId, 'survey.results_scope', surveyId, { scope: parsed.data })
  revalidatePath('/undersokelser')
  return { ok: true }
}
