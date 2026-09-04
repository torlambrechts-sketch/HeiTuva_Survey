'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Locale } from '@/lib/i18n/locales'
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
  token,
  locale,
  offeredLocales,
  orgName,
  title,
  anonymity,
  engage,
  alreadyResponded,
  questions,
}: {
  token: string
  locale: Locale
  offeredLocales: Locale[]
  orgName: string
  title: string
  anonymity: 'anonymous' | 'named' | 'optional'
  engage: Record<string, unknown>
  alreadyResponded: boolean
  questions: RespondentQuestion[]
}) {
  const t = useTranslations('respondent')
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
  const shown = oneAtATime ? (current ? [current] : []) : questions

  const setValue = (q: RespondentQuestion, value: AnswerValue) => {
    setMissing(false)
    setAnswers((a) => ({ ...a, [q.id]: { ...a[q.id], value } }))
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
        anonChoice: anonymity === 'optional' ? anonChoice : null,
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

  const secondsLeft = Math.max(0, PROMISED_SECONDS - elapsed)
  const anonBanner = useMemo(() => {
    if (anonymity === 'named') return t('named')
    if (anonymity === 'optional') return t('choose')
    return e.audience === 'kunder' ? t('anonCustomer') : t('anon')
  }, [anonymity, e.audience, t])

  if (done) return <ThankYou thankYou={e.thank_you} />

  const isLast = !oneAtATime || step === total - 1
  const pct = total ? Math.round(((step + 1) / total) * 100) : 0

  return (
    <Shell>
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <div className="text-[13px] text-mut">
            {t('promise')}
            {orgName ? ` · ${orgName}` : ''}
          </div>
          <h1 className="mt-[3px] font-display text-2xl font-medium leading-[1.25]">{title}</h1>
        </div>
        {offeredLocales.length > 1 ? (
          <div className="flex flex-none gap-[3px] rounded-full p-1" style={{ background: 'var(--sf2)' }}>
            {offeredLocales.map((l) => (
              // A full navigation, not client state: the messages for a locale
              // are loaded on the server, so switching language is a request.
              // `replace` keeps the token out of the back-button history twice.
              <a
                key={l}
                href={`?lang=${l}`}
                className="touch-44 cursor-pointer rounded-full px-[13px] py-[7px] text-xs font-semibold text-ink no-underline"
                style={{ background: l === locale ? 'var(--ac)' : 'transparent' }}
                aria-current={l === locale ? 'true' : undefined}
              >
                {l.toUpperCase()}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3.5 flex items-center gap-[11px] rounded-xl bg-sbg px-3.5 py-[11px]">
        <span className="block h-[22px] w-[22px] flex-none rounded-full border-2 border-ink" />
        <span className="flex-1 text-[12.5px] leading-[1.45]">{anonBanner}</span>
        <span className="flex-none whitespace-nowrap rounded-full bg-sf px-3 py-1.5 text-xs font-semibold">
          {secondsLeft ? t('secondsLeft', { n: secondsLeft }) : t('takeYourTime')}
        </span>
      </div>

      {anonymity === 'optional' ? (
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

            <QuestionInput question={q} value={entry?.value} onChange={(v) => setValue(q, v)} />

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

            {missing && q.required && !isAnswered(entry?.value) ? (
              <p role="alert" className="mt-3.5 inline-block rounded-full bg-ac3 px-3.5 py-2 text-[13px]">
                {t('required')}
              </p>
            ) : null}
          </section>
        )
      })}

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
 * The thank-you (HeiTuva.dc.html:2117-2135).
 *
 * The design's peer-results panel is not here: it needs an aggregate a
 * respondent can read, and every aggregate RPC is `authenticated`-only by
 * design. Exposing one to token holders is a k-anonymity surface that wants its
 * own decision, not a side effect of building this screen.
 * docs/DEVIATIONS.md D40.
 */
function ThankYou({ thankYou }: { thankYou?: string }) {
  const t = useTranslations('respondent')
  return (
    <Shell>
      <div className="rounded-2xl border border-line bg-sf px-8 py-[50px] text-center">
        <div className="font-display text-[40px] font-medium leading-none">{t('thanks')}</div>
        <p className="mt-2 text-sm text-mut">{thankYou?.trim() || t('thanksSub')}</p>
      </div>
    </Shell>
  )
}
