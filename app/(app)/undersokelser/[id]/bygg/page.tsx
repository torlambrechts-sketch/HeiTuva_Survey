import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import type { QualityRule } from '@/lib/questions/quality'
import { Builder } from './Builder'
import type { BuilderDraft, DraftQuestion, QuestionConfig } from './types'

/**
 * The Builder route (HeiTuva.dc.html:322-690).
 *
 * Everything that decides how a question renders comes from the registry in
 * lib/questions, and the quality rules come from the `quality_rules` table, so
 * this page only loads rows and hands them over.
 */
export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requireViewer()
  const supabase = await createClient()

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, audience_label, status, anonymity, org_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`builder survey read failed: ${error.message}`)
  // RLS already scopes this to the viewer's org; a miss is a 404 rather than a
  // forbidden page, so the response cannot confirm another org's survey exists.
  if (!survey) notFound()

  const { data: rows, error: qError } = await supabase
    .from('survey_questions')
    .select('id, type, text, help, required, comment_mode, follow_up_on_low, config')
    .eq('survey_id', id)
    .order('position')
  if (qError) throw new Error(`builder questions read failed: ${qError.message}`)

  const questions: DraftQuestion[] = (rows ?? []).map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    help: q.help ?? '',
    required: q.required,
    commentMode: q.comment_mode,
    followUpOnLow: q.follow_up_on_low,
    config: (q.config ?? {}) as QuestionConfig,
  }))

  const { data: ruleRows, error: ruleError } = await supabase
    .from('quality_rules')
    .select('key, pattern, rule, message')
    .eq('lang', viewer.locale)
  if (ruleError) throw new Error(`quality_rules read failed: ${ruleError.message}`)

  // The heuristics are Norwegian-specific and only seeded for `no`. An English
  // session gets no flags rather than Norwegian ones shown to an English
  // reader; adding a language is a seed, not a code change.
  const rules: QualityRule[] = (ruleRows ?? []).map((r) => ({
    key: r.key,
    pattern: r.pattern,
    rule: r.rule,
    message: r.message,
  }))

  const draft: BuilderDraft = {
    title: survey.title,
    audience: survey.audience_label ?? '',
    questions,
  }

  return (
    <Builder
      surveyId={survey.id}
      initial={draft}
      rules={rules}
      anonymous={survey.anonymity === 'anonymous'}
      canEdit={viewer.role !== 'leser'}
      // A sent survey's questions are frozen: rounds snapshot their question
      // set, so editing after sending would leave the live round and the
      // Builder disagreeing.
      locked={survey.status !== 'utkast'}
    />
  )
}
