'use client'

import { useState, useTransition } from 'react'
import { setRunMode } from './actions'

/**
 * «Kjøremodus» — V2:566-575, in the Builder's Innstillinger pane.
 *
 * Three cards are drawn and three are rendered. **Quiz is rendered in the
 * design's own locked treatment** — `opacity:.45`, `cursor:not-allowed`, and
 * the note chip below (V2:6119-6123) — because V2-10 builds it and nothing
 * behind it exists yet.
 *
 * **The note's TEXT is the deviation, not the treatment.** The bundle's reason
 * is «Quiz kan ikke brukes på lovpålagte maler», which is a rule about
 * statutory packs; ours is that quiz is not built at all. Shipping the drawn
 * sentence would be a claim-set failure of exactly the kind
 * `docs/v2/00-diff.md § 0.3` names — a true-sounding reason for a refusal that
 * has a different cause, which is worse than no reason because it sends the
 * editor to change the template.
 *
 * Live is refused on a non-anonymous survey by `app.guard_run_mode_anonymous`
 * (`M:0083`). The card is still pickable there: the refusal comes back named
 * and says WHY, which teaches the rule, where a disabled card teaches nothing.
 */
type Mode = 'standard' | 'live'

export function RunModePanel({
  surveyId,
  runMode,
  anonymity,
  strings: s,
}: {
  surveyId: string
  runMode: string
  anonymity: string
  strings: {
    title: string
    desc: string
    standard: string
    standardDesc: string
    live: string
    liveDesc: string
    quiz: string
    quizDesc: string
    quizNote: string
    namedSurvey: string
    failed: string
  }
}) {
  const [mode, setMode] = useState<Mode>(runMode === 'live' ? 'live' : 'standard')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function pick(next: Mode) {
    if (next === mode) return
    setNote(null)
    start(async () => {
      const r = await setRunMode({ surveyId, runMode: next })
      if (r.ok) setMode(next)
      else setNote(r.error === 'namedSurvey' ? s.namedSurvey : s.failed)
    })
  }

  const cards: { key: Mode | 'quiz'; label: string; desc: string; locked: boolean }[] = [
    { key: 'standard', label: s.standard, desc: s.standardDesc, locked: false },
    { key: 'live', label: s.live, desc: s.liveDesc, locked: false },
    { key: 'quiz', label: s.quiz, desc: s.quizDesc, locked: true },
  ]

  return (
    <div className="rounded-2xl border border-line bg-sf p-5">
      <div className="text-[11px] uppercase tracking-[.1em] text-mut">{s.title}</div>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-mut">{s.desc}</p>
      <div className="mt-3 flex flex-col gap-2">
        {cards.map((c) => {
          const active = c.key === mode
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              disabled={c.locked || pending}
              onClick={() => !c.locked && pick(c.key as Mode)}
              className="flex min-w-0 flex-col items-start gap-[3px] rounded-xl border-[1.5px] px-[15px] py-[13px] text-left text-ink disabled:cursor-not-allowed"
              style={{
                borderColor: active ? 'var(--ink)' : 'var(--line)',
                background: active ? 'var(--sbg)' : 'var(--sf)',
                opacity: c.locked ? 0.45 : 1,
                cursor: c.locked ? 'not-allowed' : 'pointer',
              }}
            >
              <span className="text-[13.5px] font-bold">{c.label}</span>
              <span className="text-[11.5px] leading-[1.4] text-mut">{c.desc}</span>
            </button>
          )
        })}
      </div>
      {/* The design's note chip (V2:577). Ours carries the real reason. */}
      <p
        className="mt-[11px] inline-block rounded-full px-[13px] py-2 text-[11.5px] font-semibold"
        style={{ background: 'var(--ac3)' }}
      >
        {note ?? s.quizNote}
      </p>
      {anonymity !== 'anonymous' && mode !== 'live' ? (
        <p className="mt-2.5 text-[12px] leading-[1.45] text-mut">{s.namedSurvey}</p>
      ) : null}
    </div>
  )
}
