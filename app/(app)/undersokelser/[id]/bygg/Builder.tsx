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
import { LivePanel } from './LivePanel'
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
import {
  BUILD_TAB_KEY,
  BUILD_TAB_PARAM,
  buildTabGroup,
  lintTabLabel,
  resolveBuildTab,
  type BuildTab,
} from '@/lib/surveys/build-tabs'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IDLE,
  dragOpacity,
  dropIndex,
  dropTop,
  endZoneStyle,
  type DragOver,
  type FlowDragState,

} from '@/lib/surveys/flow-drag'
import type { FlowDragProps } from './drag-props'
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

/* T5 — v8's SIX tabs in contextual groups, `lib/surveys/build-tabs.ts`.
   This was a flat four sourced from `V2:6472`, five handoffs back, and the
   note it replaced complained that `settings` meant four panels where the
   bundle means two — which was true, and the fix was a tab rather than a
   re-stack: `content` and `lint` now have their own. */
type Tab = BuildTab
const TAB_KEY = BUILD_TAB_KEY

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
  /* T7 — the live card reuses `live.guard`, the sentence the stage ships,
     rather than a second copy of it under `builder`. */
  const tLive = useTranslations('live')
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
  /* T7 · v8:578-600 — THE META CARD COLLAPSES. `metaOpen` defaults to true
     (v8's own `st.metaOpen !== false`) and is component state, not a stored
     setting, for the same reason `compact` is: it is a reading posture, and
     persisting it would need a writer, a reader and a decision about whose
     preference it is.

     WHAT COLLAPSES IS NOT THE WHOLE CARD, and that boundary had to be derived
     rather than copied. v8's collapsible region is the «Målgruppe» label, the
     audience field and the length line; its title input, its flow chips and
     its density switch live in a HEADER CARD we do not have (see the chips'
     own comment below — both were placed here deliberately when v7 arrived).
     So the collapse takes the two inputs and the length line, and the chips
     and the density switch stay in both states — collapsing them would hide
     something v8's collapse does not hide. */
  const [metaOpen, setMetaOpen] = useState(true)
  /* T5.1 — THE TAB IS THE URL, not state. The shell rail selects the group
     (v8:9366-9371) and a server-rendered pill can only carry an href, so
     `?fane=` is the source of truth and there is no second copy to disagree
     with it. Level two writes it back with `replace` rather than `push`: the
     pills inside a group are not history, and a back button that walked
     «Spørsmål → Innhold → Spørsmål» would be answering a question nobody
     asked. Same reasoning as `TAB_SEGMENT`'s «the segment is the SOURCE OF
     TRUTH … there is no parameter to disagree with it», one level down. */
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = resolveBuildTab(searchParams.get(BUILD_TAB_PARAM))
  const setTab = (next: Tab) => {
    const q = new URLSearchParams(searchParams.toString())
    q.set(BUILD_TAB_PARAM, next)
    router.replace(`?${q.toString()}`, { scroll: false })
  }
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

  /** T8 — the block seed, shared by the palette's click and its drag. */
  const seedBlockFor = (type: BlockType, id: string) =>
    seededBlock(type, id, (key) => t(key as 'seedInfoTitle'))

  const addBlock = (type: BlockType) => {
    /* V7-3c — SEEDED, which is v7's own behaviour (`blockSeed`, v7:6869) and a
       real feature rather than placeholder text: the palette promises «egen
       tittel og innledning», so an editor gets a draft to edit. One seed is
       refused — see D233 and `BLOCK_SEEDS` — because the `info` block's second
       sentence promises anonymity the block cannot keep. */
    const block = seedBlockFor(type, `${NEW_ID_PREFIX}b${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    // v7's own behaviour: «Blokken legges nederst i flyten» (v7:6882, and the
    // pane says so), so it lands at the end and the arrows move it.
    setDraft((d) => ({ ...d, blocks: [...d.blocks, { ...block, position: d.questions.length + d.blocks.length }] }))
  }

  const patchBlock = (id: string, patch: Partial<BlockDraft>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))

  /* ── T8 — THE DRAG, D235 OVERTURNED BY TOR ────────────────────────────
     The arrows and «Flytt til» above are untouched: they are the keyboard
     equivalent D235 said was missing, so the drag is ADDITIVE. Both paths end
     in `moveInFlow`, so a drop and an arrow cannot disagree about what a move
     means — and the deferred `app.guard_flow_position` still checks the same
     stored result either way.

     `dragOver` is deliberately NOT derived from the drop target's index: v8
     keys it on the row's ID (`st.dragOver === q.id`), because an index shifts
     under the very drag that is reading it. */
  const [dragState, setDragState] = useState<FlowDragState>(IDLE)
  /* v8:6899 — `savedNote`, the confirmation an insert leaves: «{label} satt
     inn på plass {n}». It is a SENTENCE, not a toast queue: v8 overwrites it,
     so a second insert replaces the first rather than stacking. */
  const [insertNote, setInsertNote] = useState('')
  /* FlowItem carries no id of its own — it wraps the item — so the ids the
     drag keys on come from the items themselves, which is also what the
     DOM rows use as their React key. One source, so a drop target cannot
     name a row the list does not have. */
  const flowIds = flow.map((f) => f.item.id)

  /** v8:6925-6930 — a palette drop CREATES, a row drop MOVES, and the palette
   *  is asked about first. One function, because both drop targets share it. */
  const dropOnto = (targetId: DragOver) => {
    const nd = dragState.newDrag
    if (nd) {
      const at = dropIndex(flowIds, targetId)
      /* A palette drag CREATES at the drop position. The click path appends
         («Klikk for å legge nederst», v8:821) and this one positions — same
         seeds, one extra splice, so the two cannot produce different items. */
      const fresh = `${NEW_ID_PREFIX}d${Date.now()}${Math.random().toString(36).slice(2, 6)}`
      const seeded =
        nd.kind === 'block'
          ? { kind: 'block' as const, item: seedBlockFor(nd.type as BlockType, fresh) }
          : { kind: 'question' as const, item: seedQuestionFor(nd.type as QuestionType, fresh) }
      const next = flow.slice()
      next.splice(Math.max(0, Math.min(next.length, at)), 0, seeded as (typeof flow)[number])
      writeFlow(next)
      setInsertNote(t('insertedAt', { label: nd.label, n: at + 1 }))
      setDragState(IDLE)
      return
    }
    const from = flowIds.indexOf(dragState.dragId)
    const to = targetId === '__end' ? flowIds.length - 1 : flowIds.indexOf(targetId)
    if (from >= 0 && to >= 0 && from !== to) moveFlowTo(from, to)
    setDragState(IDLE)
  }

  /** The prop bag a row gets. `undefined` while the survey is read-only, which
   *  is how a row stops being draggable without a second code path. */
  const dragFor = (id: string): FlowDragProps | undefined =>
    disabled
      ? undefined
      : {
          draggable: true,
          onDragStart: (e) => {
            try {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', id)
            } catch {
              /* jsdom and some browsers throw on a synthetic dataTransfer; the
                 state below is what the UI actually reads, so a throw here must
                 not stop the drag. v8 wraps the same two lines (6921). */
            }
            setDragState({ dragId: id, dragOver: '', newDrag: null })
          },
          onDragOver: (e) => {
            e.preventDefault()
            setDragState((d) => (d.dragOver === id ? d : { ...d, dragOver: id }))
          },
          onDrop: (e) => {
            e.preventDefault()
            dropOnto(id)
          },
          onDragEnd: () => setDragState(IDLE),
          dragOpacity: dragOpacity(dragState, id),
          dropTop: dropTop(dragState, id),
        }

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

  /* T8 — ONE SEED, TWO ENTRY POINTS. The palette's click appends and its drag
     inserts at a position; if each built its own object the two would drift,
     which is the shape `PageHeader` has no `pct` prop for. */
  const seedQuestionFor = (type: QuestionType, id: string): DraftQuestion => ({
    id,
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
  })

  const addQuestion = (type: QuestionType) =>
    setDraft((d) => ({ ...d, questions: [...d.questions, seedQuestionFor(type, newId())] }))

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
  /* T5 — the lint pill's label. v8 counts the UNDISMISSED rows, and says
     «Ingen merknader» when there are no rows AT ALL rather than when the
     count is zero — two different states, and the drawing separates them.
     We have no dismiss control, so every row is undismissed and the two
     numbers are equal; they are kept apart so a dismiss control does not
     have to rediscover the distinction. */
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
  /* One expression, read in both meta-card states (v8:584 open, v8:595
     closed). Two call sites forming the same sentence is how a figure and its
     restatement drift apart. */
  const lengthNote = t('lengthNote', {
    count,
    mins: estimatedMinutes({ questions: count, blocks: counts.blocks }),
  })

  /**
   * The anonymity-breach warning is a property of the type and the survey's
   * anonymity mode, never a string match on the question's text: renaming the
   * field must not silence it, and a question that merely mentions "navn"
   * must not raise it.
   */
  const breachOn = (q: DraftQuestion) => anonymous && specOf(q.type).breaksAnonymity

  const lintRows = methodNotesForDraft.length
  const lintOpen = lintRows

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
      {/* T5.1 — LEVEL ONE IS THE SHELL RAIL NOW, as v8:9366-9371 draws it:
          «Bygg · Metodikk · Innstillinger · Forhåndsvis» plus «Undersøkelsen».
          It lived here for one commit because the pane was the only place a
          client component could set the tab; `?fane=` moved the tab into the
          URL, which is what let a server-rendered pill reach it. Level two —
          the group's own ≤2 pills — stays here, which is v8's split. */}
      <div
        className="flex flex-wrap gap-x-[3px] gap-y-1.5 rounded-[13px] p-1 md:flex-nowrap md:gap-y-0"
        style={{ background: 'var(--sf2)' }}
        role="tablist"
      >
        {buildTabGroup(tab).map((k) => (
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
            {k === 'lint' ? lintTabLabel(lintRows, lintOpen, t) : t(TAB_KEY[k])}
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
                      /* T8 · v8:989 — DUAL MODE. The same button appends on a
                         click and inserts at a position on a drag, and v8's
                         `title` says both. `effectAllowed = "copy"` because a
                         palette item CREATES; a row's drag is "move". */
                      draggable={!disabled}
                      onDragStart={(e) => {
                        try {
                          e.dataTransfer.effectAllowed = 'copy'
                          e.dataTransfer.setData('text/plain', `question:${type}`)
                        } catch {
                          /* see dragFor — the state below is what the UI reads */
                        }
                        setDragState({
                          dragId: '',
                          dragOver: '',
                          newDrag: {
                            kind: 'question',
                            type,
                            label: t(ADD_LABEL_KEY[type] ?? TYPE_OPTION_KEY[type]),
                          },
                        })
                      }}
                      onDragEnd={() => setDragState(IDLE)}
                      title={t('paletteDragHintQ', {
                        desc: t(ADD_DESC_KEY[type] ?? TYPE_OPTION_KEY[type]),
                      })}
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
        </div>
      ) : null}

      {/* T5 — «Innhold» is its own tab now. V7-3 put this palette beside the
          question palette and said why: v7's fifth builder tab «arrives with
          the two-level rail restructure … and inventing it here would be a
          sub-tab nobody drew in that position». T5 IS that restructure, so the
          deferral is cashed rather than repeated. */}
      {tab === 'content' ? (
        <div className="rounded-2xl border border-line bg-sf p-5">
          <BlockPalette
            count={draft.blocks.length}
            disabled={disabled}
            onAdd={addBlock}
            /* T8 — an empty label is the dragEnd signal, so the palette needs
               no second callback to say «the drag is over». */
            onDragType={(type, label) =>
              setDragState(label ? { dragId: '', dragOver: '', newDrag: { kind: 'block', type, label } } : IDLE)
            }
          />
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

      {/* T7 · v8:881-897 — «Live-innstillinger», directly under «Kjøremodus»
          and only in live mode, on the same argument QuizPanel's comment makes
          for quiz: it is settings FOR the mode, so showing it in standard mode
          would offer a control that governs nothing.

          It carries no switches. See `lib/surveys/live-features.ts` for the
          measurement — none of v8's ten has a value the product writes — and
          `LivePanel` for why the labels ship anyway. */}
      {tab === 'general' && runMode === 'live' ? (
        <LivePanel
          strings={{
            title: t('liveTitle'),
            alwaysOn: t('liveAlwaysOn'),
            notBuilt: t('liveNotBuilt'),
            /* The guard sentence is `live.guard`, which the stage already
               ships — one string, one truth. A second copy in this namespace
               is two sentences that can drift. */
            guard: tLive('guard'),
            say: (k) => t(k as 'liveQr'),
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
      {/* T5 — «Merknader» is its own tab now (v8:10683). It was stacked under
          `settings` beside PolicyPanel, which is the «four panels where the
          bundle means two» the old tab comment named — the fix was a tab. */}
      {tab === 'lint' ? (
        <MethodPanel
          notes={methodNotesForDraft}
          questionTexts={draft.questions.map((q) => q.text)}
          labels={{
            title: tm('title'),
            lead: tm('lead'),
            empty: tm('empty'),
            emptyBody: tm('emptyBody'),
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
        {buildTabGroup(tab).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k)
              setSheetOpen(true)
            }}
            className="touch-44 flex-1 cursor-pointer rounded-[10px] border border-line bg-sf px-3 py-[10px] text-[12.5px] font-semibold text-ink"
          >
            {k === 'lint' ? lintTabLabel(lintRows, lintOpen, t) : t(TAB_KEY[k])}
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
          {/* v8:10911 — `metaPad` is 20px open, 14px 18px closed. `p-5` IS
              20px, so the open state keeps the metric this card already had. */}
          <div
            className="rounded-2xl border border-line bg-sf shadow-card"
            style={{ padding: metaOpen ? '20px' : '14px 18px' }}
          >
            {/* v8:591-599 — THE CLOSED SUMMARY. The title in display type with
                the length line under it, and «Rediger ▾» to come back. v8
                draws `{{ draftTitle }}` unconditionally, so an untitled survey
                shows an empty line here rather than an invented placeholder —
                and the card opens by default, so it is only ever reached by
                someone who collapsed it deliberately. */}
            {!metaOpen ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[18px] font-bold leading-[1.2]">
                    {draft.title}
                  </span>
                  <span className="mt-[2px] block text-[12.5px] text-mut">{lengthNote}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMetaOpen(true)}
                  className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[9px] border border-line bg-transparent px-[14px] py-2 text-[12.5px] font-semibold text-ink"
                >
                  {t('metaEdit')}
                </button>
              </div>
            ) : null}
            {metaOpen ? (
            <>
            {/* These two inputs are borderless and transparent by design, so
                they cannot take the touch-44-field treatment — its inset ring
                would paint a border the design does not have. Plain vertical
                padding below md raises the touch box to 44px and is invisible
                on a transparent control; md: restores the design's metrics. */}
            <div className="flex items-center justify-between gap-[14px]">
              <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('title')}</div>
              <button
                type="button"
                onClick={() => setMetaOpen(false)}
                className="touch-44 cursor-pointer whitespace-nowrap border-none bg-transparent p-0 text-[12.5px] font-semibold text-mut"
              >
                {t('metaHide')}
              </button>
            </div>
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
            {/* v8:584-589 — the length line and its warning are INSIDE the
                collapsible region; the closed summary restates the length on
                its own second line, so rendering it here as well would say the
                same thing twice. */}
            <div className="mt-3 flex flex-wrap items-center gap-[10px]">
              <span className="text-[13px] text-mut">{lengthNote}</span>
              {tooLong ? (
                <span className="rounded-full bg-ac3 px-3 py-[6px] text-[12.5px]">
                  {t('lengthWarning')}
                </span>
              ) : null}
            </div>
            </>
            ) : null}
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
                    drag={dragFor(entry.item.id)}
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
                    drag={dragFor(b.id)}
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
                drag={dragFor(q.id)}
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

          {/* T8 · v8:807 — THE END DROP ZONE. `min-height:54px`, dashed, and it
              is the only drop target that is not a row: everything else inserts
              BEFORE something, this appends. Its label has two states and v8
              names the element being dragged in the active one (v8:10718). */}
          {!disabled ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragState((d) => (d.dragOver === '__end' ? d : { ...d, dragOver: '__end' }))
              }}
              onDragLeave={() =>
                setDragState((d) => (d.dragOver === '__end' ? { ...d, dragOver: '' } : d))
              }
              onDrop={(e) => {
                e.preventDefault()
                dropOnto('__end')
              }}
              className="mt-2 flex min-h-[54px] items-center justify-center gap-[9px] rounded-[13px] px-4 py-3 text-[12.5px] text-mut"
              style={endZoneStyle(dragState)}
            >
              <span className="text-[13px] tracking-[1px]">⠿</span>
              {dragState.newDrag
                ? t('dropEndActive', { label: dragState.newDrag.label })
                : t('dropEndIdle')}
            </div>
          ) : null}

          {/* v8:531 — the insert confirmation, a pill that names where it went. */}
          {insertNote ? (
            <p
              role="status"
              className="mt-2 self-center rounded-full bg-ac2 px-[14px] py-2 text-[12.5px] font-semibold"
            >
              {insertNote}
            </p>
          ) : null}

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
                 38px rail rather than sizing themselves off their text.

                 T7 · v8:534 — the LABEL is «Lagre og lukk», not «Lagre
                 utkast». The control was already v8's: the debounce owns
                 persistence and this link leaves the builder, so «og lukk» is
                 what it actually does. R0's copy axis reported the string
                 absent and could not tell «no control» from «this control,
                 named something else» — it is the second. */
              className="touch-44 flex h-[38px] cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-[15px] text-[13px] font-semibold text-ink no-underline"
            >
              {t('saveClose')}
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
