'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PolicyPanel, type PolicyPanelProps } from './PolicyPanel'
import { policyWarnings } from '@/lib/questions/policy-warnings'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  ADD_PANEL_TYPES,
  NEW_QUESTION_TEXT,
  TYPE_GROUP_ORDER,
  estimatedMinutes,
  specOf,
  type QuestionType,
} from '@/lib/questions/registry'
import { qualityFlags, type QualityRule } from '@/lib/questions/quality'
import type { Engagement } from '@/lib/engagement'
import { ModalLayer } from '@/components/ModalLayer'
import { QuestionCard, tintFor } from './QuestionCard'
import { PreviewPane } from './PreviewPane'
import { EngagementPanel } from './EngagementPanel'
import { RunModePanel } from './RunModePanel'
import { QuizPanel } from './QuizPanel'
import {
  ADD_DESC_KEY,
  ADD_LABEL_KEY,
  GROUP_KEY,
  LONG_SURVEY_THRESHOLD,
  NEW_ID_PREFIX,
  TYPE_OPTION_KEY,
  type BuilderDraft,
  type DraftQuestion,
} from './types'
import { saveDraft, saveQuestionToBank, saveSurveyAsTemplate } from './actions'

const TABS = ['add', 'settings', 'preview'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY: Record<Tab, string> = {
  add: 'tabAdd',
  settings: 'tabSettings',
  preview: 'tabPreview',
}

let seq = 0
const newId = () => `${NEW_ID_PREFIX}${++seq}`

/**
 * The Builder (HeiTuva.dc.html:322-690).
 *
 * The whole draft is one piece of client state saved as a whole, debounced.
 * Field-by-field saves were the alternative and are worse here: a reorder
 * touches every position at once, and a type change rewrites config, so the
 * server would have to reconstruct intent from a stream of patches.
 */
export function Builder({
  surveyId,
  initial,
  rules,
  anonymous,
  canEdit,
  locked,
  policy,
  runMode,
  quizTimeBonus,
  quizTeamBoard,
}: {
  surveyId: string
  initial: BuilderDraft
  rules: QualityRule[]
  anonymous: boolean
  canEdit: boolean
  locked: boolean
  policy: Omit<PolicyPanelProps, 'surveyId' | 'questions' | 'rules'>
  /** V2-9 — `surveys.run_mode`, the switch «Kjøremodus» writes. */
  runMode: string
  /** V2-10, Q84 — the two quiz toggles the narrowing kept. */
  quizTimeBonus: boolean
  quizTeamBoard: boolean
}) {
  const t = useTranslations('builder')
  const [draft, setDraft] = useState<BuilderDraft>(initial)
  const [advanced, setAdvanced] = useState(false)
  const [tab, setTab] = useState<Tab>('add')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)
  const [banked, setBanked] = useState<Record<string, boolean>>({})
  const [templateSaved, setTemplateSaved] = useState(false)
  const [, startTransition] = useTransition()

  const disabled = !canEdit || locked

  // The first render must not save: it would rewrite every position on a page
  // load and mark a survey as edited that nobody touched.
  const dirty = useRef(false)
  const latest = useRef(draft)
  latest.current = draft

  const persist = useCallback(() => {
    startTransition(async () => {
      const current = latest.current
      const result = await saveDraft({
        surveyId,
        title: current.title,
        audience: current.audience,
        engage: current.engage,
        questions: current.questions,
      })
      if (!result.ok) {
        setFailed(true)
        setSaved(false)
        return
      }
      setFailed(false)
      setSaved(true)
      // Swap the temporary ids for the real ones, or the next save inserts the
      // same questions again.
      if (Object.keys(result.ids).length) {
        setDraft((d) => ({
          ...d,
          questions: d.questions.map((q) => (result.ids[q.id] ? { ...q, id: result.ids[q.id]! } : q)),
        }))
      }
    })
  }, [surveyId])

  useEffect(() => {
    if (disabled) return
    if (!dirty.current) {
      dirty.current = true
      return
    }
    const id = setTimeout(persist, 700)
    return () => clearTimeout(id)
  }, [draft, disabled, persist])

  const patchEngagement = (patch: Partial<Engagement>) =>
    setDraft((d) => ({ ...d, engage: { ...d.engage, ...patch } }))

  const patchQuestion = (index: number, patch: Partial<DraftQuestion>) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    }))

  const addQuestion = (type: QuestionType) =>
    setDraft((d) => ({
      ...d,
      questions: [
        ...d.questions,
        {
          id: newId(),
          type,
          text: NEW_QUESTION_TEXT[type],
          help: '',
          required: false,
          commentMode: 'arv',
          followUpOnLow: false,
          // V2-10: a NEW question has no answer key. Null rather than 0 —
          // `actions.ts` says why at length: a default of 0 marks the first
          // option correct on every question anyone ever writes.
          answerIndex: null,
          points: 100,
          config: { ...specOf(type).defaultConfig },
        },
      ],
    }))

  const moveQuestion = (index: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.questions]
      const target = index + delta
      if (target < 0 || target >= next.length) return d
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row!)
      return { ...d, questions: next }
    })

  const duplicateQuestion = (index: number) =>
    setDraft((d) => {
      const source = d.questions[index]!
      const next = [...d.questions]
      next.splice(index + 1, 0, { ...source, id: newId(), config: { ...source.config } })
      return { ...d, questions: next }
    })

  const removeQuestion = (index: number) =>
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== index) }))

  const flagsFor = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof qualityFlags>>()
    return (text: string) => {
      let hit = cache.get(text)
      if (!hit) {
        hit = qualityFlags(text, rules)
        cache.set(text, hit)
      }
      return hit
    }
  }, [rules])

  const count = draft.questions.length
  const tooLong = count > LONG_SURVEY_THRESHOLD

  /**
   * The anonymity-breach warning is a property of the type and the survey's
   * anonymity mode, never a string match on the question's text: renaming the
   * field must not silence it, and a question that merely mentions "navn"
   * must not raise it.
   */
  const breachOn = (q: DraftQuestion) => anonymous && specOf(q.type).breaksAnonymity

  const readyChecks = [
    { messageKey: 'ready_title', done: draft.title.trim().length > 0 },
    { messageKey: 'ready_questions', done: count > 0 },
    { messageKey: 'ready_texts', done: draft.questions.every((q) => q.text.trim().length > 0) },
    { messageKey: 'ready_quality', done: draft.questions.every((q) => flagsFor(q.text).length === 0) },
    { messageKey: 'ready_anonymity', done: !draft.questions.some(breachOn) },
    // NEW:4645. The policy panel's own warnings are the test: if a threshold
    // and a target cannot both be satisfied, the survey is not ready however
    // good its questions are. Same function the panel renders from, so the
    // list and the card cannot disagree.
    {
      messageKey: 'ready_policy',
      done:
        policyWarnings(
          {
            respondentKind: policy.respondentKind,
            anonymity: policy.anonymity,
            kThreshold: policy.kThreshold,
            target: policy.target,
          },
          draft.questions.map((q) => ({ id: q.id, text: q.text })),
          rules,
          () => '',
        ).length === 0,
    },
  ]

  const rightPane = (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-[12.5px] text-mut">{t('mode')}</span>
        <div
          className="flex gap-[3px] rounded-full p-1"
          style={{ background: 'var(--sf2)' }}
          role="group"
          aria-label={t('mode')}
        >
          {([false, true] as const).map((mode) => (
            <button
              key={String(mode)}
              type="button"
              aria-pressed={advanced === mode}
              onClick={() => setAdvanced(mode)}
              className="touch-44 cursor-pointer rounded-full border-none px-4 py-[7px] text-[12.5px] font-semibold text-ink"
              style={{ background: advanced === mode ? 'var(--ac)' : 'transparent' }}
            >
              {mode ? t('advanced') : t('simple')}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex gap-[3px] rounded-[13px] p-1"
        style={{ background: 'var(--sf2)' }}
        role="tablist"
      >
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="touch-44 flex-1 cursor-pointer rounded-[10px] border-none px-3 py-[10px] text-[12.5px] font-semibold text-ink"
            style={{
              background: tab === k ? 'var(--sf)' : 'transparent',
              boxShadow: tab === k ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
            }}
          >
            {t(TAB_KEY[k])}
          </button>
        ))}
      </div>

      {tab === 'add' ? (
        <div className="rounded-2xl border border-line bg-sf p-5">
          <p className="text-[13px] leading-normal text-mut">{t('insertNote')}</p>
          <Link
            href="/bibliotek?fane=bank"
            className="touch-44 mt-3 block w-full cursor-pointer rounded-[10px] border-none bg-ac3 py-[11px] text-center text-[13px] font-semibold text-ink no-underline"
          >
            {t('fromBank')}
          </Link>
          {TYPE_GROUP_ORDER.map((group) => {
            const items = ADD_PANEL_TYPES.filter((type) => specOf(type).group === group)
            if (!items.length) return null
            return (
              <div key={group} className="mt-[18px]">
                <div className="text-[11px] uppercase tracking-[.1em] text-mut">
                  {t(GROUP_KEY[group])}
                </div>
                <div className="mt-[9px] flex flex-col gap-[7px]">
                  {items.map((type, i) => (
                    <button
                      key={type}
                      type="button"
                      disabled={disabled}
                      onClick={() => addQuestion(type)}
                      className="touch-44 flex cursor-pointer items-center gap-[11px] rounded-[11px] border border-line bg-bg px-[13px] py-[11px] text-left text-ink disabled:opacity-50"
                    >
                      <span
                        className="block h-[26px] w-[26px] flex-none rounded-lg"
                        style={{ background: tintFor(i) }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold">
                          {t(ADD_LABEL_KEY[type] ?? TYPE_OPTION_KEY[type])}
                        </span>
                        <span className="mt-px block text-[11.5px] leading-snug text-mut">
                          {t(ADD_DESC_KEY[type] ?? TYPE_OPTION_KEY[type])}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* V2-9 — «Kjøremodus» sits at the TOP of the Innstillinger pane
          (V2:565), above the policy: it decides what the rest of the pane is
          about. */}
      {tab === 'settings' ? (
        <RunModePanel
          surveyId={surveyId}
          runMode={runMode}
          anonymity={policy.anonymity}
          strings={{
            title: t('runModeTitle'),
            desc: t('runModeDesc'),
            standard: t('runModeStandard'),
            standardDesc: t('runModeStandardDesc'),
            live: t('runModeLive'),
            liveDesc: t('runModeLiveDesc'),
            quiz: t('runModeQuiz'),
            quizDesc: t('runModeQuizDesc'),
            quizNote: t('runModeQuizNote'),
            namedSurvey: t('runModeNamedSurvey'),
            failed: t('policyError_failed'),
          }}
        />
      ) : null}

      {/* V2-10 — «Quizmodus» (V2:6148) sits directly under «Kjøremodus» and
          only in quiz mode: it is settings FOR the mode, so showing it in
          standard mode would offer a control that governs nothing. */}
      {tab === 'settings' && runMode === 'quiz' ? (
        <QuizPanel
          surveyId={surveyId}
          timeBonus={quizTimeBonus}
          teamBoard={quizTeamBoard}
          strings={{
            title: t('quizTitle'),
            timeBonus: t('quizTimeBonus'),
            timeBonusDesc: t('quizTimeBonusDesc'),
            team: t('quizTeam'),
            teamDesc: t('quizTeamDesc'),
            instant: t('quizInstant'),
            instantUnavailable: t('quizInstantUnavailable'),
            certificate: t('quizCertificate'),
            certificateUnavailable: t('quizCertificateUnavailable'),
            guard: t('quizGuard'),
            failed: t('policyError_failed'),
          }}
        />
      ) : null}

      {/* The v1 bundle inserts this ABOVE "Klar til utsending?" (:577, :636) —
          the policy is what the readiness list is checked against, so it is
          read first. */}
      {tab === 'settings' ? (
        <PolicyPanel
          surveyId={surveyId}
          {...policy}
          questions={draft.questions.map((q) => ({ id: q.id, text: q.text }))}
          rules={rules}
        />
      ) : null}

      {tab === 'settings' ? (
        <div className="rounded-2xl border border-line bg-sf p-5">
          <h2 className="text-[13px] font-semibold">{t('readyTitle')}</h2>
          <ul className="mt-[10px] flex list-none flex-col gap-[7px] p-0">
            {readyChecks.map((c) => (
              <li key={c.messageKey} className="flex items-center gap-[10px]">
                <span
                  className="flex h-5 w-5 flex-none items-center justify-center rounded-md border-[1.5px] text-[11px] font-bold"
                  style={{
                    borderColor: c.done ? 'var(--ink)' : 'var(--line)',
                    background: c.done ? 'var(--ac2)' : 'transparent',
                  }}
                >
                  {c.done ? '✓' : ''}
                </span>
                <span className="flex-1 text-[13px]">{t(c.messageKey)}</span>
              </li>
            ))}
          </ul>
          <div className="my-4 h-px" style={{ background: 'var(--line)' }} />
          <h2 className="text-[13px] font-semibold">{t('logic')}</h2>
          <div className="mt-[10px] flex flex-col gap-[7px]">
            {draft.questions.filter((q) => q.followUpOnLow).length === 0 ? (
              <p className="text-[12.5px] leading-normal text-mut">{t('logicEmpty')}</p>
            ) : (
              draft.questions
                .filter((q) => q.followUpOnLow)
                .map((q) => (
                  <div
                    key={q.id}
                    className="flex items-start gap-[10px] rounded-[10px] border border-line bg-bg px-[11px] py-[9px]"
                  >
                    <span className="flex-none rounded-full bg-ac px-2 py-[3px] text-[10.5px] font-bold">
                      {t('logicIf')}
                    </span>
                    <span className="flex-1 text-[12.5px] leading-snug">
                      {t('logicRule', { question: q.text })}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      ) : null}

      {tab === 'settings' ? (
        <EngagementPanel
          value={draft.engage}
          questionCount={count}
          disabled={disabled}
          onChange={patchEngagement}
        />
      ) : null}

      {tab === 'preview' ? (
        <PreviewPane
          title={draft.title}
          questions={draft.questions}
          surveyId={surveyId}
          /* `locked` means the survey has been sent, which is exactly when a
             round exists to test against. A draft has none, and `mint_test_token`
             would answer `no_round`. */
          canTest={locked}
        />
      ) : null}
    </div>
  )

  return (
    <div className="animate-enter pt-[28px]">
      {locked ? (
        <p className="mb-3 rounded-[10px] bg-ac3 px-3 py-2 text-[12.5px]">{t('lockedNotice')}</p>
      ) : !canEdit ? (
        <p className="mb-3 text-[13px] text-mut">{t('readerNotice')}</p>
      ) : null}

      {/* Below xl the right pane becomes a sheet behind a button row pinned
          under the header; the question list is the base layer (RESPONSIVE.md,
          three-pane Builder). */}
      <div className="mb-3 flex gap-2 xl:hidden">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k)
              setSheetOpen(true)
            }}
            className="touch-44 flex-1 cursor-pointer rounded-[10px] border border-line bg-sf px-3 py-[10px] text-[12.5px] font-semibold text-ink"
          >
            {t(TAB_KEY[k])}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.35fr_.9fr]">
        <div className="flex flex-col gap-[14px]">
          <div className="rounded-2xl border border-line bg-sf p-5 shadow-card">
            {/* These two inputs are borderless and transparent by design, so
                they cannot take the touch-44-field treatment — its inset ring
                would paint a border the design does not have. Plain vertical
                padding below md raises the touch box to 44px and is invisible
                on a transparent control; md: restores the design's metrics. */}
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('title')}</div>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              disabled={disabled}
              placeholder={t('titlePlaceholder')}
              aria-label={t('title')}
              className="mt-[6px] w-full border-none bg-transparent py-[2px] font-display text-[27px] font-bold text-ink outline-none disabled:opacity-60 md:py-0"
            />
            <input
              value={draft.audience}
              onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value }))}
              disabled={disabled}
              placeholder={t('audiencePlaceholder')}
              aria-label={t('audience')}
              className="mt-1 w-full border-none bg-transparent py-3 text-[13.5px] text-mut outline-none disabled:opacity-60 md:py-0"
            />
            <div className="mt-3 flex flex-wrap items-center gap-[10px]">
              <span className="text-[13px] text-mut">
                {t('lengthNote', { count, mins: estimatedMinutes(count) })}
              </span>
              {tooLong ? (
                <span className="rounded-full bg-ac3 px-3 py-[6px] text-[12.5px]">
                  {t('lengthWarning')}
                </span>
              ) : null}
            </div>
          </div>

          {count === 0 ? (
            <p className="text-[13px] text-mut">{t('emptyQuestions')}</p>
          ) : (
            draft.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                quizMode={runMode === 'quiz'}
                question={q}
                index={i}
                total={count}
                advanced={advanced}
                flags={flagsFor(q.text)}
                anonymityBreach={breachOn(q)}
                disabled={disabled}
                savedToBank={Boolean(banked[q.id])}
                onChange={(patch) => patchQuestion(i, patch)}
                onMove={(delta) => moveQuestion(i, delta)}
                onDuplicate={() => duplicateQuestion(i)}
                onRemove={() => removeQuestion(i)}
                onSaveToBank={() =>
                  startTransition(async () => {
                    const result = await saveQuestionToBank({
                      text: q.text,
                      type: q.type,
                      category: 'Annet',
                      config: q.config,
                    })
                    if (result.ok) setBanked((b) => ({ ...b, [q.id]: true }))
                    else setFailed(true)
                  })
                }
              />
            ))
          )}

          <div className="mt-1 flex flex-wrap items-center gap-[10px]">
            <Link
              href={`/undersokelser/${surveyId}/send`}
              className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-6 py-[13px] text-sm font-bold text-ink no-underline"
            >
              {t('toSend')}
            </Link>
            {/* The design's three controls (HeiTuva.dc.html:483-489). "Lagre
                utkast" is a link to the list because the draft is already
                saved — the debounce owns persistence, so a second Save button
                that did nothing would be a lie about what it does. */}
            <Link
              href="/undersokelser"
              className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-[22px] py-[13px] text-sm font-semibold text-ink no-underline"
            >
              {t('saveDraft')}
            </Link>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setTemplateSaved(false)
                startTransition(async () => {
                  const result = await saveSurveyAsTemplate({ surveyId, category: 'Annet' })
                  if (result.ok) setTemplateSaved(true)
                  else setFailed(true)
                })
              }}
              className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-[22px] py-[13px] text-sm font-semibold text-ink disabled:opacity-60"
            >
              {templateSaved ? t('templateSaved') : t('saveTemplate')}
            </button>
            {saved && !failed ? (
              <span className="rounded-full bg-ac2 px-[15px] py-[9px] text-[12.5px] font-semibold">
                {t('saved')}
              </span>
            ) : null}
            {failed ? (
              <span role="alert" className="text-[12.5px] font-semibold text-ink">
                {t('saveFailed')}
              </span>
            ) : null}
          </div>
        </div>

        {/* At xl the right pane is sticky beside the list, as designed. */}
        <div className="sticky top-0 hidden xl:block">{rightPane}</div>
      </div>

      {sheetOpen ? (
        <ModalLayer>
        <div
          className="fixed inset-0 z-[70] overflow-auto bg-bg p-5"
          role="dialog"
          aria-modal="true"
          aria-label={t(TAB_KEY[tab])}
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label={t('closePanel')}
              className="touch-44 h-[34px] w-[34px] cursor-pointer rounded-[9px] border border-line bg-transparent text-base leading-none text-mut"
            >
              ×
            </button>
          </div>
          {rightPane}
        </div>
        </ModalLayer>
      ) : null}
    </div>
  )
}
