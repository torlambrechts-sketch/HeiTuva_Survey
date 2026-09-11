'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Locale } from '@/lib/i18n/locales'
import { anonymityPromise } from '@/lib/respondent/anonymity-promise'
import { QuestionComment } from './QuestionComment'

/**
 * The key a SURVEY-LEVEL comment is held under before it is sent — the
 * end-of-survey box, which belongs to no question. Not a uuid, so it can never
 * collide with a real question id, and mapped to `null` on the way out because
 * that is what `survey_comments.question_id` means.
 */
const SURVEY_LEVEL = 'survey'
import {
  isAnswered,
  isLowScore,
  type AnswerEntry,
  type AnswerValue,
  type RespondentQuestion,
} from '@/lib/respondent/answers'
import { Shell } from './Shell'
import { QuestionInput } from './QuestionInput'
import { submitResponse } from './actions'
import { PeerResults } from './PeerResults'

/** The design's promise: 90 seconds, counted down live (HeiTuva.dc.html:3298). */
const PROMISED_SECONDS = 90

type Engage = {
  one_question?: boolean
  show_progress?: boolean
  comments?: 'ingen' | 'lav' | 'alle'
  audience?: 'ansatte' | 'kunder'
  thank_you?: string
}

export function Respondent({
  quizMode,
  token,
  locale,
  offeredLocales,
  orgName,
  title,
  anonymity,
  feedbackMode,
  kThreshold,
  respondentKind,
  engage,
  alreadyResponded,
  questions,
  testMode = false,
  onExitTest,
}: {
  token: string
  locale: Locale
  offeredLocales: Locale[]
  orgName: string
  title: string
  anonymity: 'anonymous' | 'named' | 'optional'
  /** C2/C3 — `surveys.feedback_mode`. `off` renders no comment control at all. */
  feedbackMode: 'off' | 'anonymous' | 'named' | 'optional'
  /** V2-10: draw `choice` as quiz tiles. Chrome only — the value is the same index. */
  quizMode: boolean
  kThreshold: number
  respondentKind: 'person' | 'organisation'
  engage: Record<string, unknown>
  alreadyResponded: boolean
  questions: RespondentQuestion[]
  /**
   * Q76 — the same flow, previewed. V2:3323's banner promises «All logikk kjører
   * som for en ekte respondent», so this component is NOT forked: the flag is
   * carried to `submit_response` as `p_dry_run` and everything above the write
   * runs unchanged. A second copy of the respondent flow for previewing would be
   * a preview of the copy.
   */
  testMode?: boolean
  onExitTest?: () => void
}) {
  const t = useTranslations('respondent')
  const tLang = useTranslations('lang')
  const e = engage as Engage

  const [answers, setAnswers] = useState<Record<string, AnswerEntry>>({})
  const [step, setStep] = useState(0)
  const [missing, setMissing] = useState(false)
  const [done, setDone] = useState(alreadyResponded)
  const [failed, setFailed] = useState(false)
  const [anonChoice, setAnonChoice] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [pending, startTransition] = useTransition()

  // The countdown is decoration, not a deadline — nothing expires when it
  // reaches zero, it just stops promising. Keeping it client-side means the
  // page never has to be re-rendered by the server to tick.
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  /** One question per screen, or the whole list — the Builder's choice. */
  const oneAtATime = e.one_question !== false
  const total = questions.length
  const current = questions[step]
  // Memoised because V2-10's first-shown clock depends on it: recomputed every
  // render, the effect below would re-run every render and the eslint rule says
  // so. The value is the same either way; the identity is what matters.
  const shown = useMemo(
    () => (oneAtATime ? (current ? [current] : []) : questions),
    [oneAtATime, current, questions],
  )

  /**
   * V2-10, Q84 — when a question was FIRST SHOWN, per question.
   *
   * A ref rather than state: it must not re-render anything, and re-rendering
   * on every tick is what a `useState` clock would do. `Date.now()` at first
   * sight, differenced at answer time.
   *
   * **Only in quiz mode.** The timing is stored on `answers.elapsed_ms`, which
   * is safe because a quiz requires NAMED answers — recording how fast an
   * ANONYMOUS respondent answered would be a timing channel against the
   * anonymity this product's second invariant is about, and the way to be sure
   * it never happens is not to measure it.
   */
  const shownAt = useRef<Record<string, number>>({})
  useEffect(() => {
    if (!quizMode) return
    for (const q of shown) shownAt.current[q.id] ??= Date.now()
  }, [quizMode, shown])

  const setValue = (q: RespondentQuestion, value: AnswerValue) => {
    setMissing(false)
    setAnswers((a) => ({
      ...a,
      [q.id]: {
        ...a[q.id],
        value,
        ...(quizMode && shownAt.current[q.id] !== undefined
          ? { elapsed_ms: Math.min(3_600_000, Date.now() - shownAt.current[q.id]!) }
          : {}),
      },
    }))
  }
  const setExtra = (q: RespondentQuestion, key: 'comment' | 'follow_up', v: string) =>
    setAnswers((a) => ({ ...a, [q.id]: { ...a[q.id], value: a[q.id]?.value ?? '', [key]: v } }))

  /** A required question blocks the step it is on, not the whole survey. */
  const blocked = shown.some((q) => q.required && !isAnswered(answers[q.id]?.value))

  const submit = () => {
    if (blocked) {
      setMissing(true)
      return
    }
    setFailed(false)
    startTransition(async () => {
      // Only questions that were actually answered are sent. A skipped optional
      // question must be absent, not present-and-empty — the difference is
      // whether the aggregate counts it in its denominator.
      const payload = Object.fromEntries(
        Object.entries(answers).filter(([, a]) => isAnswered(a.value)),
      )
      const result = await submitResponse({
        token,
        lang: locale,
        answers: payload,
        anonChoice: choiceGoverns ? anonChoice : null,
        dryRun: testMode,
        comments: Object.entries(comments).map(([questionId, c]) => ({
          questionId: questionId === SURVEY_LEVEL ? null : questionId,
          text: c.text,
        })),
      })
      if (result.ok) setDone(true)
      else if (result.error === 'already') setDone(true)
      else setFailed(true)
    })
  }

  const next = () => {
    if (blocked) {
      setMissing(true)
      return
    }
    setMissing(false)
    setStep((s) => Math.min(total - 1, s + 1))
  }

  /*
    C3 — the comments, held until the submission carries them.

    They are NOT sent as they are written. A comment saved on question 2 by
    somebody who then closes the tab is a message nobody agreed to send; and
    more importantly, `submit_response` writes the comments in the SAME
    transaction as the response, which is the property Q113 rests on. A
    per-keystroke save would be a second write path, and invariant 2 says there
    is one.
  */
  const [comments, setComments] = useState<Record<string, { text: string; anon: boolean }>>({})

  /*
    ONE CHOICE (Q113). Where either the survey's anonymity OR its feedback mode
    is `optional`, `anonChoice` decides — the same variable, read twice, because
    `submit_response` derives both from one `p_anon_choice`. There is no second
    toggle to keep in step, because there is no second value.
  */
  const commentAnon =
    feedbackMode === 'named' ? false : feedbackMode === 'optional' ? anonChoice : true
  const choiceGoverns = anonymity === 'optional' || feedbackMode === 'optional'

  const secondsLeft = Math.max(0, PROMISED_SECONDS - elapsed)
  // The promise is generated from the survey's settings (Q17), never fixed
  // copy: the banner must change with the threshold, or it lies. That now
  // includes «valgfritt», whose banner used to be a bare invitation to choose —
  // it carries the number and the small-group caveat, because a respondent who
  // chooses anonymity is gated by the same threshold as anyone else. The
  // per-option consequence text below is still a design-brief refinement (D85).
  const anonBanner = useMemo(() => {
    const p = anonymityPromise({ anonymity, kThreshold, respondentKind }, locale)
    return t(p.key, { kWord: p.values?.kWord ?? '', virksomhet: orgName })
  }, [anonymity, kThreshold, respondentKind, locale, orgName, t])

  if (done)
    return (
      <ThankYou
        thankYou={e.thank_you}
        token={token}
        respondentKind={respondentKind}
        /* True only when a survey-level comment actually went with the
           submission. The bundle's `fbSent` state is a confirmation, and a
           confirmation of something that did not happen is a fabricated value
           (CLAUDE.md, never fabricate data in the UI). */
        commentSent={Boolean(comments[SURVEY_LEVEL])}
        testMode={testMode}
        onExitTest={onExitTest}
        onRestart={() => {
          setAnswers({})
          setStep(0)
          setMissing(false)
          setDone(false)
          setFailed(false)
        }}
      />
    )

  const isLast = !oneAtATime || step === total - 1
  const pct = total ? Math.round(((step + 1) / total) * 100) : 0

  return (
    <Shell>
      {testMode ? (
        // V2:3323. «Svarene lagres ikke. All logikk kjører som for en ekte
        // respondent» — both halves are true because the dry run returns AFTER
        // every validation and BEFORE the insert (Q76, `M:0075`).
        <div className="mx-auto mb-3.5 max-w-[520px] rounded-[14px] bg-ac px-[18px] py-4 text-ink">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-[150px] flex-1">
              <span className="block text-[13.5px] font-bold">{t('testModeTitle')}</span>
              <span className="mt-0.5 block text-[12.5px]">{t('testModeNote')}</span>
            </span>
            <button
              type="button"
              onClick={onExitTest}
              className="touch-44 cursor-pointer whitespace-nowrap rounded-[9px] border border-[rgba(25,21,16,.25)] bg-transparent px-3.5 py-[9px] text-[12px] font-semibold text-ink"
            >
              {t('testExit')}
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <div className="text-[13px] text-mut">
            {t('promise')}
            {orgName ? ` · ${orgName}` : ''}
          </div>
          <h1 className="mt-[3px] font-display text-2xl font-medium leading-[1.25]">{title}</h1>
        </div>
        {offeredLocales.length > 1 ? (
          // DECISIONS Q31: only ACTIVE locales are drawn (the count is
          // DECISIONS'), with the v1 bundle's chip chrome (NEW:2320-2322)
          // adopted verbatim — 2px gap, 3px padding, 6px/8px chips, 11px/700
          // text, and `--sf` for the active one rather than `--ac`.
          //
          // THE PART THAT MATTERS IS THE ACCESSIBLE NAME. The bundle carries
          // `title` AND `aria-label` with the language's own name; the app
          // carried neither. «NO» announced as "N O" is not a language to a
          // screen reader, and the visible label cannot be lengthened without
          // leaving the drawing — which is exactly why the bundle put the name
          // in an attribute instead. `lang.<code>` already holds those names in
          // both languages, so this adds no new copy.
          <div className="flex flex-none gap-[2px] rounded-full p-[3px]" style={{ background: 'var(--sf2)' }}>
            {offeredLocales.map((l) => (
              // A full navigation, not client state: the messages for a locale
              // are loaded on the server, so switching language is a request.
              <a
                key={l}
                href={`?lang=${l}`}
                title={tLang(l)}
                aria-label={tLang(l)}
                className="touch-44 cursor-pointer rounded-full px-2 py-[6px] text-[11px] font-bold text-ink no-underline"
                style={{ background: l === locale ? 'var(--sf)' : 'transparent' }}
                aria-current={l === locale ? 'true' : undefined}
              >
                {l.toUpperCase()}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {/* v1 chrome (NEW:2327-2330): the row aligns to the top rather than the
          centre, the text steps 12.5 -> 13px at 1.5, and `text-pretty` stops
          the promise ending on a one-word line. The banner grew because the
          promise did — «valgfritt» now carries the threshold too. */}
      <div className="mt-3.5 flex items-start gap-[11px] rounded-xl bg-sbg px-3.5 py-3">
        <span className="block h-[22px] w-[22px] flex-none rounded-full border-2 border-ink" />
        <span className="flex-1 text-pretty text-[13px] leading-[1.5]">{anonBanner}</span>
        <span className="flex-none whitespace-nowrap rounded-full bg-sf px-3 py-1.5 text-xs font-semibold">
          {secondsLeft ? t('secondsLeft', { n: secondsLeft }) : t('takeYourTime')}
        </span>
      </div>

      {/* The chips appear where a choice EXISTS — which is now either axis.
          Q113: there is one choice and it governs everything in the submission,
          so there is one control for it rather than two that could disagree. */}
      {choiceGoverns ? (
        <div className="mt-3 flex gap-2">
          {[
            { on: true, label: t('stayAnonymous') },
            { on: false, label: t('showMyName') },
          ].map((o) => (
            <button
              key={String(o.on)}
              type="button"
              aria-pressed={anonChoice === o.on}
              onClick={() => setAnonChoice(o.on)}
              className="touch-44 flex-1 cursor-pointer rounded-xl border-[1.5px] px-3 py-2.5 text-[13px] font-semibold text-ink"
              style={{
                borderColor: anonChoice === o.on ? 'var(--ink)' : 'var(--line)',
                background: anonChoice === o.on ? 'var(--ac)' : 'transparent',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {oneAtATime && e.show_progress !== false ? (
        <div className="mt-[18px] flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--sf2)' }}
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={Math.max(1, total)}
          >
            <div className="h-full bg-ac" style={{ width: `${pct}%` }} />
          </div>
          <div className="whitespace-nowrap text-[13px] text-mut">
            {t('stepLabel', { step: step + 1, total })}
          </div>
        </div>
      ) : null}

      {shown.map((q) => {
        const entry = answers[q.id]
        const low = isLowScore(q, entry?.value)
        // "arv" inherits the survey-level setting; a per-question 'pa'/'av'
        // overrides it. The design shows the box at low scores when the survey
        // is set to 'lav', and always when it is set to 'alle'.
        const commentMode = q.comment_mode ?? 'arv'
        const showComment =
          commentMode === 'pa' ||
          (commentMode === 'arv' && (e.comments === 'alle' || (e.comments === 'lav' && low)))
        return (
          <section
            key={q.id}
            className="mt-4 flex min-h-[330px] flex-col rounded-2xl border border-line bg-sf px-6 pb-6 pt-[26px]"
          >
            <h2 className="text-xl font-semibold leading-[1.35]">
              {q.text} {q.required ? <span style={{ color: 'var(--ac2)' }}>*</span> : null}
            </h2>
            {q.help ? (
              <p className="mt-[7px] text-[13.5px] leading-relaxed text-mut">{q.help}</p>
            ) : null}
            {q.type === 'choice' && (q.config as { multi?: boolean } | null)?.multi ? (
              <p className="mt-[7px] text-[13px] text-mut">{t('pickMany')}</p>
            ) : null}

            <QuestionInput
              question={q}
              value={entry?.value}
              onChange={(v) => setValue(q, v)}
              quizMode={quizMode}
            />

            {low ? (
              <div className="mt-[18px] rounded-[13px] bg-ac3 p-4">
                <div className="text-sm font-semibold">{t('followUpDefault')}</div>
                <textarea
                  rows={3}
                  value={entry?.follow_up ?? ''}
                  aria-label={t('followUpDefault')}
                  onChange={(ev) => setExtra(q, 'follow_up', ev.target.value)}
                  className="mt-2.5 w-full resize-y rounded-[11px] border bg-sf px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none"
                  style={{ borderColor: 'rgba(25,21,16,.15)' }}
                />
              </div>
            ) : null}

            {showComment ? (
              <div className="mt-4">
                <div className="text-[13px] text-mut">{low ? t('commentLow') : t('comment')}</div>
                <textarea
                  rows={2}
                  value={entry?.comment ?? ''}
                  aria-label={low ? t('commentLow') : t('comment')}
                  onChange={(ev) => setExtra(q, 'comment', ev.target.value)}
                  className="mt-2 w-full resize-y rounded-[11px] border border-line bg-bg px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none"
                />
              </div>
            ) : null}

            {/* The vault field's own line, so the two boxes on this card are
                not mistaken for each other (see QuestionComment's header). Only
                where both are actually on screen. */}
            {showComment && feedbackMode !== 'off' ? (
              <p className="mt-1.5 text-[12px] leading-[1.4] text-mut">{t('commentVaultNote')}</p>
            ) : null}

            {feedbackMode !== 'off' ? (
              <QuestionComment
                saved={comments[q.id] ?? null}
                anonymous={commentAnon}
                chooseNote={feedbackMode === 'optional' ? t('fbChooseNote') : null}
                onSave={(text) =>
                  setComments((c) => ({ ...c, [q.id]: { text, anon: commentAnon } }))
                }
                strings={{
                  promise: t('qcPromise'),
                  openLabel: t('qcOpenLabel'),
                  hint: t('qcHint'),
                  replyAnonymous: t('qcReplyAnonymous'),
                  replyNamed: t('qcReplyNamed'),
                  placeholder: t('qcPlaceholder'),
                  save: t('qcSave'),
                  cancel: t('qcCancel'),
                  edit: t('qcEdit'),
                  savedAnon: t('qcSavedAnon'),
                  savedNamed: t('qcSavedNamed'),
                }}
              />
            ) : null}

            {missing && q.required && !isAnswered(entry?.value) ? (
              <p role="alert" className="mt-3.5 inline-block rounded-full bg-ac3 px-3.5 py-2 text-[13px]">
                {t('required')}
              </p>
            ) : null}
          </section>
        )
      })}

      {/*
        C3 — «Hva synes du om undersøkelsen?» (V3:3675-3700).

        THE BUNDLE PUTS THIS ON THE THANK-YOU SCREEN. WE CANNOT, AND THE REASON
        IS INVARIANT 2 RATHER THAN TASTE. By the time the thank-you screen is on
        screen, `submit_response` has run and `responded_at` is set; a second
        call is refused with `already_responded`, which is Q111 property 2 and
        stays exactly as it is. Sending the comment would need a SECOND write
        path, and CLAUDE.md says there is one.

        So the box sits at the end of the last step, and rides along in the same
        transaction as the answers. A respondent who closes the tab on the
        thank-you page now loses nothing, which the bundle's placement cannot
        say. Logged as a deviation (D159).
      */}
      {isLast && feedbackMode !== 'off' ? (
        <div className="mt-4 rounded-2xl border border-line bg-sf px-6 py-5">
          <h2 className="text-[15px] font-semibold leading-[1.35]">{t('fbTitle')}</h2>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-mut">{t('fbHint')}</p>
          <textarea
            rows={3}
            value={comments[SURVEY_LEVEL]?.text ?? ''}
            placeholder={t('fbPlaceholder')}
            aria-label={t('fbTitle')}
            onChange={(ev) => {
              const text = ev.target.value
              setComments((c) => {
                const next = { ...c }
                if (text.trim()) next[SURVEY_LEVEL] = { text, anon: commentAnon }
                else delete next[SURVEY_LEVEL]
                return next
              })
            }}
            className="mt-2.5 w-full resize-y rounded-[10px] border border-line bg-bg px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none"
          />
          <p className="mt-2 text-[12px] leading-[1.4] text-mut">
            {feedbackMode === 'optional' ? t('fbChooseNote') : commentAnon ? t('fbAnonNote') : t('fbNamedNote')}
          </p>
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="mt-3 rounded-[11px] bg-ac3 px-3.5 py-3 text-[13px]">
          {t('failed')}
        </p>
      ) : null}

      <div className="mt-3.5 flex gap-2.5">
        {oneAtATime && step > 0 ? (
          <button
            type="button"
            onClick={() => {
              setMissing(false)
              setStep((s) => Math.max(0, s - 1))
            }}
            className="touch-44 min-h-[52px] cursor-pointer rounded-xl border border-line bg-transparent px-6 py-[15px] text-[15px] font-semibold text-ink"
          >
            {t('back')}
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={isLast ? submit : next}
          className="touch-44 min-h-[52px] flex-1 cursor-pointer rounded-xl border-none bg-ac px-4 py-[15px] text-base font-bold text-ink disabled:opacity-60"
        >
          {isLast ? t('submit') : t('next')}
        </button>
      </div>
    </Shell>
  )
}

/**
 * The thank-you (HeiTuva.dc.html:2117-2135), with the design's peer-results
 * panel below it.
 *
 * The panel renders only when the survey opted in AND the round is at or above
 * the k threshold — both decided by `get_peer_results` (migration 0011), not
 * here. A client that lies about either gets nothing back.
 *
 * `respondentKind` is passed through for the organisation note (Q47, v1 bundle
 * :3985): the RPC still refuses the distribution, and the panel says why rather
 * than vanishing.
 */
function ThankYou({
  testMode = false,
  onExitTest,
  onRestart,
  thankYou,
  token,
  respondentKind,
  commentSent = false,
}: {
  thankYou?: string
  token: string
  respondentKind: 'person' | 'organisation'
  commentSent?: boolean
  testMode?: boolean
  onExitTest?: () => void
  onRestart?: () => void
}) {
  const t = useTranslations('respondent')
  return (
    <Shell>
      <div className="rounded-2xl border border-line bg-sf px-8 py-[50px] text-center">
        <div className="font-display text-[40px] font-medium leading-none">{t('thanks')}</div>
        <p className="mt-2 text-sm text-mut">{thankYou?.trim() || t('thanksSub')}</p>
        {/* V3:3693-3697's `fbSent` state — rendered only when there was
            something to confirm. */}
        {commentSent ? (
          <p
            className="mx-auto mt-4 inline-block rounded-[11px] px-3.5 py-2.5 text-[12.5px] leading-[1.45]"
            style={{ background: 'var(--ac2)' }}
          >
            {t('fbThanks')}
          </p>
        ) : null}
        {testMode ? (
          // V2:3558. The sentence is the whole point of the state: the editor
          // has just been through the real flow and needs to know that nothing
          // of it survived. `p_dry_run` is what makes it true rather than a
          // reassurance.
          <>
            <div className="mt-5 rounded-[12px] bg-ac px-4 py-3.5 text-left text-[13px] leading-[1.5]">
              {t('testDoneNote')}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={onExitTest}
                className="touch-44 min-h-[48px] cursor-pointer rounded-[12px] border-none bg-ink px-[22px] py-[13px] text-[14px] font-bold text-sf"
              >
                {t('testBackToBuilder')}
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="touch-44 min-h-[48px] cursor-pointer rounded-[12px] border border-line bg-transparent px-[22px] py-[13px] text-[14px] font-semibold text-ink"
              >
                {t('testRestart')}
              </button>
            </div>
          </>
        ) : (
          <PeerResults token={token} respondentKind={respondentKind} />
        )}
      </div>
    </Shell>
  )
}
