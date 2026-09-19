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
import { methodNotes, type MethodRule } from '@/lib/questions/method'
import { MethodPanel } from './MethodPanel'
import type { Engagement } from '@/lib/engagement'
import { ModalLayer } from '@/components/ModalLayer'
import { QuestionCard, tintFor } from './QuestionCard'
import { BlockCard } from './BlockCard'
import { BlockPalette } from './BlockPalette'
import { CompactFlowRow } from './CompactFlowRow'
import { flowDot } from '@/lib/surveys/flow-row'
import {
  buildFlow,
  flowToLists,
  moveInFlow,
  flowCounts,
  seededBlock,
  type BlockDraft,
  type BlockType,
} from '@/lib/surveys/blocks'
import { MAX_MEDIA_BYTES, isMediaType } from '@/lib/surveys/media'
import { PreviewPane } from './PreviewPane'
import { EngagementPanel } from './EngagementPanel'
import { RunModePanel } from './RunModePanel'
import { QuizPanel } from './QuizPanel'
import { BankPicker, type BankRow } from './BankPicker'
import {
  ADD_DESC_KEY,
  ADD_LABEL_KEY,
  GROUP_KEY,
  LONG_SURVEY_THRESHOLD,
  NEW_ID_PREFIX,
  TYPE_OPTION_KEY,
  type BuilderDraft,
  type DraftQuestion,
  type QuestionConfig,
  isNewQuestion,
} from './types'
import {
  saveDraft,
  saveQuestionToBank,
  saveSurveyAsTemplate,
  uploadBlockMedia,
} from './actions'

/* V2:6472 — four, in this order: Generelt · Legg til · Innstillinger · Vis.
   The app carried three and stacked RunModePanel, QuizPanel, PolicyPanel and
   EngagementPanel under `settings`, so «Innstillinger» meant four panels where
   the bundle means two. `general` is where a survey's MODE is decided; the rest
   of the pane is about the questions. */
const TABS = ['general', 'add', 'settings', 'preview'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY: Record<Tab, string> = {
  general: 'tabGeneral',
  add: 'tabAdd',
  settings: 'tabSettings',
  preview: 'tabPreview',
}

let seq = 0
const newId = () => `${NEW_ID_PREFIX}${++seq}`

/**
 * The Builder (L:322-690).
 *
 * The whole draft is one piece of client state saved as a whole, debounced.
 * Field-by-field saves were the alternative and are worse here: a reorder
 * touches every position at once, and a type change rewrites config, so the
 * server would have to reconstruct intent from a stream of patches.
 */
export function Builder({
  personDef,
  surveyId,
  initial,
  rules,
  methodRules,
  policyLocked,
  anonymous,
  canEdit,
  locked,
  policy,
  runMode,
  feedbackMode,
  linkOnly,
  packLocks,
  allowedModes,
  bank,
  quizTimeBonus,
  quizTeamBoard,
}: {
  /* W3 · Q122 — threaded through rather than read: Builder is a client
     component and the workspace resolves at server render. */
  personDef: string
  surveyId: string
  initial: BuilderDraft
  rules: QualityRule[]
  methodRules: MethodRule[]
  policyLocked: boolean
  anonymous: boolean
  canEdit: boolean
  locked: boolean
  policy: Omit<PolicyPanelProps, 'surveyId' | 'questions' | 'rules'>
  /** V2-9 — `surveys.run_mode`, the switch «Kjøremodus» writes. */
  runMode: string
  /** `surveys.feedback_mode` (M:0099, C2's writer is `setFeedbackMode`). */
  feedbackMode: string
  /** True when every round of this survey went out by share link or QR alone,
   *  so no submission carries an invitation and no comment can have a thread. */
  linkOnly: boolean
  /** A statutory pack whose own policy is `locked`. NOT `policy.locked`, which
   *  means «already sent» — the two are different locks and only this one is
   *  the clause `app.guard_quiz_policy` refuses on. */
  packLocks: boolean
  /** G2 — the run modes Administrasjon → Valg allows. Read on the server. */
  allowedModes: readonly string[]
  /** B3 — the rows the picker overlay offers, read on the server. */
  bank: BankRow[]
  /** V2-10, Q84 — the two quiz toggles the narrowing kept. */
  quizTimeBonus: boolean
  quizTeamBoard: boolean
}) {
  const t = useTranslations('builder')
  const tm = useTranslations('method')
  const [draft, setDraft] = useState<BuilderDraft>(initial)
  const [advanced, setAdvanced] = useState(false)
  /**
   * V7-5 — the flow's density (`st.flowCompact`, v7:10185).
   *
   * Component state and nothing else, deliberately. It is a VIEW preference
   * with an immediate reader — the render below — so it satisfies both faces of
   * D208's rule without a column: something writes it, something reads it, and
   * the effect is the thing you are looking at. Persisting it would make it a
   * setting, which would need a writer, a reader and a decision about whose
   * preference it is; none of that is what «give me an overview of this long
   * survey for a minute» asks for.
   */
  const [compact, setCompact] = useState(false)
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
        /* THE FLOW'S POSITIONS, NOT THE ARRAY INDICES. Both arrays are cut
           from one derived order, so the question at flow slot 3 sends 3 and
           the block at slot 4 sends 4 — and `app.guard_flow_position` has
           nothing to refuse. Sending array indices instead is the defect that
           makes the guard fire on a perfectly ordinary save. */
        questions: buildFlow(current.questions, current.blocks).flatMap((e, position) =>
          e.kind === 'question' ? [{ ...e.item, position }] : [],
        ),
        blocks: buildFlow(current.questions, current.blocks).flatMap((e, position) =>
          e.kind === 'block' ? [{ ...e.item, position }] : [],
        ),
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

  /**
   * ── V7-3: THE FLOW IS DERIVED, AND EVERY BLOCK OPERATION GOES THROUGH IT ──
   *
   * Questions keep their own array — every operation above indexes it — and the
   * mixed list is rebuilt from the two whenever the editor reorders. That keeps
   * one answer to «what position is this», which is the property
   * `app.guard_flow_position` enforces from the database's side.
   */
  const flow = buildFlow(draft.questions, draft.blocks)
  /** V7-4 — one derivation for «what is in this flow», read by the chips and by
   *  the length estimate so the two cannot disagree about the block count. */
  const counts = flowCounts(flow)

  const writeFlow = (next: typeof flow) => {
    const lists = flowToLists(next)
    setDraft((d) => ({ ...d, questions: lists.questions, blocks: lists.blocks }))
  }

  const addBlock = (type: BlockType) => {
    /* V7-3c — SEEDED, which is v7's own behaviour (`blockSeed`, v7:6869) and a
       real feature rather than placeholder text: the palette promises «egen
       tittel og innledning», so an editor gets a draft to edit. One seed is
       refused — see D233 and `BLOCK_SEEDS` — because the `info` block's second
       sentence promises anonymity the block cannot keep. */
    const block = seededBlock(
      type,
      `${NEW_ID_PREFIX}b${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      (key) => t(key as 'seedInfoTitle'),
    )
    // v7's own behaviour: «Blokken legges nederst i flyten» (v7:6882, and the
    // pane says so), so it lands at the end and the arrows move it.
    setDraft((d) => ({ ...d, blocks: [...d.blocks, { ...block, position: d.questions.length + d.blocks.length }] }))
  }

  const patchBlock = (id: string, patch: Partial<BlockDraft>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))

  const moveFlowItem = (from: number, delta: number) => writeFlow(moveInFlow(flow, from, from + delta))
  /* V7-5 — «Flytt til plass». `moveInFlow` has always taken an ABSOLUTE target,
     so the arrows are the special case of this and not the other way round: no
     second reorder path is introduced by offering it, and the deferred
     `app.guard_flow_position` still checks the stored result either way. */
  const moveFlowTo = (from: number, to: number) => writeFlow(moveInFlow(flow, from, to))

  const duplicateBlock = (id: string) =>
    setDraft((d) => {
      const src = d.blocks.find((b) => b.id === id)
      if (!src) return d
      const copy = {
        ...src,
        id: `${NEW_ID_PREFIX}b${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        position: d.questions.length + d.blocks.length,
      }
      return { ...d, blocks: [...d.blocks, copy] }
    })

  const removeBlock = (id: string) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }))

  /**
   * V7-3c — the picture.
   *
   * The upload needs the block's ROW to exist, because `uploadBlockMedia` reads
   * the survey id off it (a path is an authorisation claim and is never taken
   * from the client). A block the editor has just added has a `new:` id and no
   * row, so the card says «save first» rather than offering a control that
   * would fail — the refusal is on the screen, in words, which is what this
   * project does instead of a dead button.
   */
  const [mediaError, setMediaError] = useState<Record<string, string>>({})

  const uploadMedia = async (id: string, file: File) => {
    setMediaError((m) => ({ ...m, [id]: '' }))
    if (!isMediaType(file.type)) {
      setMediaError((m) => ({ ...m, [id]: t('blkMediaWrongType') }))
      return
    }
    if (file.size > MAX_MEDIA_BYTES || file.size === 0) {
      setMediaError((m) => ({ ...m, [id]: t('blkMediaTooBig') }))
      return
    }
    const body = new FormData()
    body.set('blockId', id)
    body.set('file', file)
    const result = await uploadBlockMedia(body)
    if (result.ok) patchBlock(id, { mediaKey: result.mediaKey })
    else setMediaError((m) => ({ ...m, [id]: t('blkMediaFailed') }))
  }

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

  /* `moveQuestion` IS GONE, and that is V7-3's doing rather than a tidy-up.
     It moved a question within `questions`, which was the whole order while one
     table owned it. With a block in the flow, moving a question one place in
     its own array hops it OVER the block — the two rows swap slots and the
     block does not move, which is a reorder nobody asked for. Both kinds go
     through `moveFlowItem` now, so there is one way to move anything. */

  const duplicateQuestion = (index: number) =>
    setDraft((d) => {
      const source = d.questions[index]!
      const next = [...d.questions]
      next.splice(index + 1, 0, { ...source, id: newId(), config: { ...source.config } })
      return { ...d, questions: next }
    })

  const removeQuestion = (index: number) =>
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== index) }))

  /* Recomputed on every edit, which is what makes it advice rather than a
     verdict: the author sees the note appear and disappear as they write. */
  const methodNotesForDraft = useMemo(
    () =>
      methodNotes(
        draft.questions.map((q, i) => ({
          type: q.type,
          text: q.text,
          position: i,
          config: q.config,
          followUpOnLow: q.followUpOnLow,
        })),
        methodRules,
        { policyLocked },
      ),
    [draft.questions, methodRules, policyLocked],
  )

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
      {/* RESPONSIVE.md § Tab rails and chip groups, applied because B2 made this
          rail FOUR tabs and CI run 110 found all six `bygg` states at
          scrollWidth 329 against a 320px viewport — 390px was clean. Three
          `flex-1` tabs shrank to fit; four cannot, because `flex-1` leaves
          `min-width: auto` and each button's min-content is its label plus
          24px of padding.

          The section says exactly what to do and it is not a judgement call:
          wrap to multiple rows, chips keep their dimensions, nothing hidden, no
          new interaction, left-aligned. The row gap is the design's 6px step,
          which clears the 4px minimum the section sets for 44px hit areas on
          vertically adjacent chips.

          NOTE FOR THE NEXT READER: § Three-pane Builder says the pinned row is
          «three buttons using the existing tab chip styling». It is four now.
          That sentence is a COUNT of the tabs that existed when it was written —
          D129's failure, third instance, same document. */}
      <div
        className="flex flex-wrap gap-x-[3px] gap-y-1.5 rounded-[13px] p-1 md:flex-nowrap md:gap-y-0"
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
          {runMode === 'quiz' ? (
            /* V2:646-648. Says what quiz mode changes about the types below,
               where the editor is choosing one — the four-option limit is
               `QUIZ_TILES.length` in QuestionInput, so this sentence and the
               tiles cannot drift apart without the test noticing. */
            <p className="mt-2.5 rounded-[11px] bg-sbg px-[13px] py-[11px] text-[12.5px] leading-[1.5]">
              {t('quizAddNote')}
            </p>
          ) : null}
          {/* V2:648-693. This was a <Link> to /bibliotek — the bundle's own label
              and colour on a control that left the Builder. The overlay is what
              the bundle draws, and it keeps the survey it was opened from. */}
          <BankPicker
            surveyId={surveyId}
            surveyTitle={draft.title}
            rows={bank}
            canEdit={!disabled}
            onAdded={(q) =>
              setDraft((d) => ({
                ...d,
                questions: [
                  ...d.questions,
                  {
                    id: q.id,
                    type: q.type as QuestionType,
                    text: q.text,
                    help: '',
                    required: false,
                    commentMode: 'arv',
                    followUpOnLow: false,
                    /* A bank question carries no key — the bank has no notion of
                       one — so this is null for the reason `answer_index`'s
                       column comment gives, not as a placeholder. */
                    answerIndex: null,
                    points: 100,
                    config: (q.config ?? {}) as QuestionConfig,
                  },
                ],
              }))
            }
          />
          {TYPE_GROUP_ORDER.map((group) => {
            const items = ADD_PANEL_TYPES.filter((type) => specOf(type).group === group)
            if (!items.length) return null
            return (
              /* V2:694-702 REDREW THIS PANEL, and the app was byte-faithful to
                 the bundle before it: L:513-525 is `flex-col gap-7`, a 26px
                 radius-8 tint, a 13.5px/600 label and a VISIBLE 11.5px
                 description — every property the app carried. v2 makes it two
                 columns, a 20px radius-6 tint, a 12.5px/600 label at
                 line-height 1.25, and moves the description to `title`.
                 So the description is not something we added and are removing;
                 it is one property of a panel the third handoff redrew, and
                 Q52 hands a v2 phase the whole redraw rather than the parts of
                 it that are convenient. */
              <div key={group} className="mt-[14px]">
                <div className="text-[11px] uppercase tracking-[.1em] text-mut">
                  {t(GROUP_KEY[group])}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-[7px]">
                  {items.map((type, i) => (
                    <button
                      key={type}
                      type="button"
                      disabled={disabled}
                      onClick={() => addQuestion(type)}
                      title={t(ADD_DESC_KEY[type] ?? TYPE_OPTION_KEY[type])}
                      className="touch-44 flex min-w-0 cursor-pointer items-center gap-[9px] rounded-[10px] border border-line bg-bg px-[11px] py-[10px] text-left text-ink disabled:opacity-50"
                    >
                      <span
                        className="block h-5 w-5 flex-none rounded-md"
                        style={{ background: tintFor(i) }}
                      />
                      <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.25]">
                        {t(ADD_LABEL_KEY[type] ?? TYPE_OPTION_KEY[type])}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {/* V7-3 — the content palette sits beside the question palette rather
              than in v7's fifth builder tab, because that tab arrives with the
              two-level rail restructure (V7-4's list) and inventing it here
              would be a sub-tab nobody drew in that position. */}
          <BlockPalette count={draft.blocks.length} disabled={disabled} onAdd={addBlock} />
        </div>
      ) : null}

      {/* «Kjøremodus» opens the GENERELT pane (V2:564-577) — B2 moved it there
          from Innstillinger, which is what the bundle has always drawn. It
          decides what the rest of the pane is about, so it comes first and
          Byggemodus follows it inside the same card. */}
      {tab === 'general' ? (
        <RunModePanel
          surveyId={surveyId}
          runMode={runMode}
          anonymity={policy.anonymity}
          packLocks={packLocks}
          allowedModes={allowedModes}
          feedbackMode={feedbackMode}
          linkOnly={linkOnly}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          strings={{
            title: t('runModeTitle'),
            desc: t('runModeDesc'),
            standard: t('runModeStandard'),
            standardDesc: t('runModeStandardDesc'),
            live: t('runModeLive'),
            liveDesc: t('runModeLiveDesc'),
            quiz: t('runModeQuiz'),
            quizDesc: t('runModeQuizDesc'),
            quizWillName: t('quizWillName'),
            quizSwitchedToNamed: t('quizSwitchedToNamed'),
            quizPackLocked: t('quizPackLocked'),
            namedSurvey: t('runModeNamedSurvey'),
            modeNotAllowed: t('runModeNotAllowed'),
            modeOffHere: t('runModeOffHere'),
            buildMode: t('buildMode'),
            buildModeDescSimple: t('buildModeDescSimple'),
            buildModeDescAdvanced: t('buildModeDescAdvanced'),
            simple: t('simple'),
            advanced: t('advanced'),
            failed: t('policyError_failed'),
            feedbackTitle: t('feedbackTitle'),
            feedbackDesc: t('feedbackDesc'),
            feedbackOff: t('feedbackOff'),
            feedbackOffDesc: t('feedbackOffDesc'),
            feedbackAnonymous: t('feedbackAnonymous'),
            feedbackAnonymousDesc: t('feedbackAnonymousDesc'),
            feedbackNamed: t('feedbackNamed'),
            feedbackNamedDesc: t('feedbackNamedDesc'),
            feedbackOptional: t('feedbackOptional'),
            feedbackOptionalDesc: t('feedbackOptionalDesc'),
            feedbackLinkOnly: t('feedbackLinkOnly'),
            feedbackFailed: t('feedbackFailed'),
          }}
        />
      ) : null}

      {/* V2-10 — «Quizmodus» (V2:6148) sits directly under «Kjøremodus» and
          only in quiz mode: it is settings FOR the mode, so showing it in
          standard mode would offer a control that governs nothing. */}
      {tab === 'general' && runMode === 'quiz' ? (
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

      {/* V6-3 — Metodikk. It sits BESIDE the readiness list rather than inside
          it, and that placement is the decision: the readiness list says what
          stops a send, and nothing here does (Q178). Folding advice into it
          would make a methodological opinion look like a precondition, which is
          exactly what «lint advises, lint does not block» refuses. */}
      {tab === 'settings' ? (
        <MethodPanel
          notes={methodNotesForDraft}
          questionTexts={draft.questions.map((q) => q.text)}
          labels={{
            title: tm('title'),
            lead: tm('lead'),
            empty: tm('empty'),
            warning: tm('warning'),
            suggestion: tm('suggestion'),
            question: tm('question'),
          }}
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
          disabled={disabled}
          onChange={patchEngagement}
        />
      ) : null}

      {tab === 'preview' ? (
        <PreviewPane
          personDef={personDef}
          title={draft.title}
          questions={draft.questions}
          blockCount={draft.blocks.length}
          surveyId={surveyId}
          /* `locked` means the survey has been sent, which is exactly when a
             round exists to test against. A draft has none, and `mint_test_token`
             would answer `no_round`. */
          canTest={locked}
          /* Gated on the SAME `runMode` prop QuizPanel is, so the two appear and
             disappear together. Reading a second source here would let the
             preview claim quiz while the settings pane says standard. */
          quizMode={runMode === 'quiz'}
          timeBonus={quizTimeBonus}
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
          three-pane Builder).

          THIS IS THE RAIL THAT OVERFLOWED, and finding it took two CI rounds
          because THERE ARE TWO. `rightPane` has its own `role="tablist"` and it
          is the one a reader finds first; it renders inside the SHEET, so it is
          on screen only when the sheet is open. This row renders on every
          `bygg` state at 320px, which is why all six reported an identical
          scrollWidth 329 — and why wrapping the other rail changed the number
          by nothing at all.

          Both wrap now. The property is «every rail that renders this tab set»,
          not «the rail I found». */}
      <div className="mb-3 flex flex-wrap gap-2 xl:hidden">
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

      {/* V7-5 — `flowGrid` (v7:10186) re-proportions the split in compact view:
          the flow list takes 2.4fr against the editor's .85fr, where full is
          1.35fr / .9fr. Both values are the drawing's, and `full`'s is what this
          screen already shipped. */}
      <div
        className={`grid grid-cols-1 items-start gap-5 ${
          compact ? 'xl:grid-cols-[2.4fr_.85fr]' : 'xl:grid-cols-[1.35fr_.9fr]'
        }`}
      >
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
              /* T6 — v8:548. The title input steps down 27px/700 -> 22px/500 and
                 gains the dashed underline that shows it is editable. Each
                 value from its own diff entry: `font-size` 27px is build's one
                 departed size and `padding: 2px 0` its arrival. `md:py-0` is
                 ours and stays — it is the touch-height accommodation the
                 comment above records, and v8 has no mobile to state one.

                 AND THE SMALLER TYPE COST THE TOUCH TARGET, which the gate
                 caught: at 27px the padded input measured 44px, at 22px it
                 measures 38 and `verify:responsive` flagged it at both widths.
                 `min-h-[44px]` below `md` is a REAL height rather than
                 `touch-44`'s pseudo-element, because an <input> is a REPLACED
                 element on which `::after` renders nothing — CLAUDE.md's
                 recorded trap. `touch-44-field` is the utility named for form
                 fields and is wrong here too: it forces `border-color:
                 transparent` and an inset ring, which would erase the dashed
                 underline this change just added. */
              className="mt-[6px] min-h-[44px] w-full border-0 border-b border-dashed border-line bg-transparent py-[2px] font-display text-[22px] font-medium text-ink outline-none disabled:opacity-60 md:min-h-0 md:py-0"
            />
            <input
              value={draft.audience}
              onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value }))}
              disabled={disabled}
              placeholder={t('audiencePlaceholder')}
              aria-label={t('audience')}
              className="mt-1 w-full border-none bg-transparent py-3 text-[13.5px] text-mut outline-none disabled:opacity-60 md:py-0"
            />
            {/* V7-4 — WHAT THE FLOW IS MADE OF (v7:10217's `bFlowChips`).

                The drawing puts three counted chips above the flow, which is it
                answering a question the builder only acquired when the flow
                gained a second kind of member. They go here, in the row that
                already states the survey's length, rather than in v7's new
                header card: the card's other contents are the two-level rail
                and the density switch, and both are blocked (see the phase
                report). A card built around one row would be a frame with
                nothing new in it.

                «Seksjoner» states its REAL count including zero — v7's own
                expression is `String(secs || 1)`, which draws «1 Seksjoner» for
                a survey that has none. See `flowCounts`. */}
            <div className="mt-3 flex flex-wrap items-center gap-[10px]">
              <span className="flex flex-wrap gap-[6px]">
                {[
                  { key: 'flowChipQuestions', value: counts.questions, bg: 'var(--ac)' },
                  { key: 'flowChipBlocks', value: counts.blocks, bg: 'var(--ac2)' },
                  { key: 'flowChipSections', value: counts.sections, bg: 'var(--sbg)' },
                ].map((c) => (
                  <span
                    key={c.key}
                    className="flex items-center gap-[7px] rounded-full px-3 py-[6px]"
                    style={{ background: c.bg }}
                  >
                    <span className="text-[12.5px] font-bold">{c.value}</span>
                    <span className="whitespace-nowrap text-[11.5px]">
                      {t(c.key as 'flowChipQuestions')}
                    </span>
                  </span>
                ))}
              </span>
              <span className="text-[13px] text-mut">
                {t('lengthNote', {
                  count,
                  mins: estimatedMinutes({ questions: count, blocks: counts.blocks }),
                })}
              </span>
              {tooLong ? (
                <span className="rounded-full bg-ac3 px-3 py-[6px] text-[12.5px]">
                  {t('lengthWarning')}
                </span>
              ) : null}
            </div>
            {/* V7-5 — THE DENSITY SWITCH (`flowViewChips`, v7:10187).

                Placed here rather than in v7's new header card for the same
                reason the three chips are: the card's only other content was
                the two-level rail, which Q243 refused. v7 puts the switch in
                the chip row, so the chip row is where it goes — and ours is
                this one.

                Only the true half of `flowDragHint` ships. See
                `CompactFlowRow`: the sentence about dragging a handle would be
                a claim about a control D235 refused. */}
            {flow.length > 1 ? (
              <div className="mt-3 flex flex-wrap items-center gap-[10px]">
                <div
                  role="group"
                  aria-label={t('viewLabel')}
                  className="flex flex-none gap-[3px] rounded-[11px] bg-sf2 p-[3px]"
                >
                  {([
                    ['full', 'viewFull'],
                    ['compact', 'viewCompact'],
                  ] as const).map(([key, label]) => {
                    const on = (compact ? 'compact' : 'full') === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCompact(key === 'compact')}
                        aria-pressed={on}
                        className="touch-44 cursor-pointer rounded-[9px] border-none px-[13px] py-[7px] text-[12.5px] font-semibold text-ink"
                        style={{
                          background: on ? 'var(--sf)' : 'transparent',
                          boxShadow: on ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
                        }}
                      >
                        {t(label)}
                      </button>
                    )
                  })}
                </div>
                {compact ? (
                  <span className="text-[12.5px] text-mut">{t('flowCompactHint')}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          {flow.length === 0 ? (
            <p className="text-[13px] text-mut">{t('emptyQuestions')}</p>
          ) : (
            /* ONE LIST, TWO KINDS. `qIndex` is the question's index in its own
               array — which every question operation still takes — while
               `slot` is its place in the flow, which is what `position` means
               and what the editor sees. Conflating them is how a reorder moves
               the wrong row. */
            flow.map((entry, slot) => {
              if (compact) {
                /* V7-5 — ONE ROW COMPONENT FOR BOTH KINDS, which is the
                   correction V7-4 § 3 needed: `badgeIsNum`/`badgeIsIcon` are
                   real for us HERE, because compacted the two kinds are one
                   shape. The dot is derived in `lib/surveys/flow-row.ts` rather
                   than assembled inline, so the next row cannot pick its own
                   colours (F3's four-implementation shape). */
                const qIndex =
                  entry.kind === 'question' ? draft.questions.indexOf(entry.item) : -1
                const dot = flowDot({
                  kind: entry.kind,
                  breach: entry.kind === 'question' ? breachOn(entry.item) : false,
                  notes: methodNotesForDraft,
                  position: qIndex,
                })
                const mine = methodNotesForDraft.filter((n) => n.position === qIndex)
                const dotTitle =
                  dot === 'block'
                    ? tm('blockNoCheck')
                    : dot === 'blocked'
                      ? t('anonBreach')
                      : mine.length
                        ? mine
                            .map(
                              (n) =>
                                `${n.severity === 'advarsel' ? tm('warning') : tm('suggestion')}: ${n.title}`,
                            )
                            .join(' · ')
                        : tm('noneForQuestion')
                return (
                  <CompactFlowRow
                    key={entry.item.id}
                    item={
                      entry.kind === 'block'
                        ? { kind: 'block', block: entry.item }
                        : { kind: 'question', question: entry.item, num: qIndex + 1 }
                    }
                    dot={dot}
                    dotTitle={dotTitle}
                    slot={slot}
                    total={flow.length}
                    disabled={disabled}
                    onMove={(delta) => moveFlowItem(slot, delta)}
                    onMoveTo={(to) => moveFlowTo(slot, to)}
                    onRemove={() =>
                      entry.kind === 'block' ? removeBlock(entry.item.id) : removeQuestion(qIndex)
                    }
                  />
                )
              }
              if (entry.kind === 'block') {
                const b = entry.item
                return (
                  <BlockCard
                    key={b.id}
                    block={b}
                    slot={slot + 1}
                    total={flow.length}
                    disabled={disabled}
                    onPatch={(patch) => patchBlock(b.id, patch)}
                    onMove={(delta) => moveFlowItem(slot, delta)}
                    onDuplicate={() => duplicateBlock(b.id)}
                    onRemove={() => removeBlock(b.id)}
                    /* A `new:` id has no row yet, so there is nothing for the
                       upload to read the survey id off. */
                    saved={!isNewQuestion(b.id)}
                    mediaError={mediaError[b.id] ?? ''}
                    onUpload={(file) => void uploadMedia(b.id, file)}
                  />
                )
              }
              const q = entry.item
              const i = draft.questions.indexOf(q)
              return (
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
                onMove={(delta) => moveFlowItem(slot, delta)}
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
              )
            })
          )}

          <div className="mt-1 flex flex-wrap items-center gap-[10px]">
            <Link
              href={`/undersokelser/${surveyId}/send`}
              className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-6 py-[13px] text-sm font-bold text-ink no-underline"
            >
              {t('toSend')}
            </Link>
            {/* The design's three controls (L:483-489). "Lagre
                utkast" is a link to the list because the draft is already
                saved — the debounce owns persistence, so a second Save button
                that did nothing would be a lie about what it does. */}
            <Link
              href="/undersokelser"
              /* N6 · v8:529 — `height:38px · padding:0 15px · 13px`. v7 drew
                 `13px 22px` at 14px; v8 fixes the height and narrows the
                 padding, so the two builder header actions match the
                 38px rail rather than sizing themselves off their text. */
              className="touch-44 flex h-[38px] cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-[15px] text-[13px] font-semibold text-ink no-underline"
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
              /* N6 · v8:530 — the same 38px/0 15px/13px as its neighbour. */
              className="touch-44 flex h-[38px] cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-[15px] text-[13px] font-semibold text-ink disabled:opacity-60"
            >
              {templateSaved ? t('templateSaved') : t('saveTemplate')}
            </button>
            {saved && !failed ? (
              <span
                /* N6 · v8:532 — `padding:8px 14px`, down from v7's `9px 15px`. */
                className="rounded-full bg-ac2 px-[14px] py-2 text-[12.5px] font-semibold"
              >
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
