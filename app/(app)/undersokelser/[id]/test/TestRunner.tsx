'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@/lib/i18n/locales'
import type { FlowStep } from '@/lib/respondent/flow'
import type { Retention } from '@/lib/surveys/retention'
import { Respondent } from '@/app/s/[token]/Respondent'
import { loadTestSurvey } from './actions'

/**
 * Q76 — the preview.
 *
 * **This renders the SAME `Respondent` component the real flow renders**, with
 * `testMode` set. It is not a copy: V2:3323 promises «All logikk kjører som for
 * en ekte respondent», and a second implementation would be a preview of the
 * second implementation. The only difference reaches the database as
 * `p_dry_run`, which returns after every validation and before the insert.
 */
export function TestRunner({
  surveyId,
  token,
  error,
}: {
  surveyId: string
  token: string | null
  error: string | null
}) {
  const t = useTranslations('respondent')
  const router = useRouter()
  const [survey, setSurvey] = useState<{
    title: string
    orgName: string
    anonymity: 'anonymous' | 'named' | 'optional'
    /**
     * V2-10. **The preview draws the quiz tiles too**, and that is Q76's whole
     * point restated: «all logikk kjører som for en ekte respondent» (V2:3323).
     * A dry run that showed the plain option list would be a preview of a
     * screen no respondent ever sees, which is exactly the class of thing test
     * mode exists to prevent.
     */
    run_mode: string | null
    kThreshold: number
    respondentKind: 'person' | 'organisation'
    retention: Retention
    engage: Record<string, unknown>
    flow: FlowStep[]
    feedback_mode?: 'off' | 'anonymous' | 'named' | 'optional' | null
    /** M:0119 — carried so the preview tells the tester exactly what a real
     *  respondent on this token would be told about a reply. */
    hasThread: boolean
    locale: Locale
    offeredLocales: Locale[]
  } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(error)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void loadTestSurvey(token).then((res) => {
      if (cancelled) return
      if (res.ok) setSurvey(res.survey)
      else setLoadError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const exit = () => router.push(`/undersokelser/${surveyId}/bygg`)

  if (loadError) {
    return (
      <main className="animate-enter pt-[34px]">
        <div className="mx-auto max-w-[520px] rounded-[16px] border border-line bg-sf p-6 text-center">
          <p className="text-[14px] leading-[1.55]">
            {loadError === 'no_round' ? t('testNoRound') : t('testUnavailable')}
          </p>
          <button
            type="button"
            onClick={exit}
            className="touch-44 mt-4 cursor-pointer rounded-[11px] border border-line bg-transparent px-5 py-3 text-[13px] font-semibold text-ink"
          >
            {t('testBackToBuilder')}
          </button>
        </div>
      </main>
    )
  }

  if (!survey || !token) {
    return (
      <main className="animate-enter pt-[34px]">
        <p className="text-center text-[13px] text-mut">{t('testLoading')}</p>
      </main>
    )
  }

  return (
    <Respondent
      token={token}
      locale={survey.locale}
      offeredLocales={survey.offeredLocales}
      orgName={survey.orgName}
      hasThread={survey.hasThread}
      title={survey.title}
      /* The preview renders the SAME component, so it renders the comment
         control too — and `submit_response`'s dry run returns before the write,
         so a previewed comment is stored exactly as a previewed answer is:
         not at all. */
      feedbackMode={survey.feedback_mode ?? 'off'}
      anonymity={survey.anonymity}
      quizMode={survey.run_mode === 'quiz'}
      kThreshold={survey.kThreshold}
      respondentKind={survey.respondentKind}
      retention={survey.retention}
      engage={survey.engage}
      alreadyResponded={false}
      flow={survey.flow}
      testMode
      onExitTest={exit}
    />
  )
}
