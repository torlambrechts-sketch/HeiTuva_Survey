'use client'

import { useState, useTransition } from 'react'
import { setRunMode } from './actions'

/**
 * «Kjøremodus» — V2:566-575, in the Builder's Innstillinger pane.
 *
 * Three cards are drawn and three are rendered. **Quiz is rendered in the
 * design's own locked treatment** — and that is what this panel did until
 * 2026-09-10, with the note «Quiz er ikke bygget ennå» beneath it.
 *
 * **BOTH WERE TRUE WHEN WRITTEN AND FALSE FROM THE MOMENT V2-10 LANDED.** That
 * phase built the whole feature — `M:0085`–`M:0088`, the answer key,
 * `quiz_leaderboard` k-gated by `M:0086`, `app.guard_quiz_policy` refusing a
 * non-named survey and a statutory pack, quiz tiles on `/s/[token]`, the
 * Lagtavle on Resultater, `QuizPanel` for its two settings, 26 green tests —
 * and the `surveys_run_mode_check` CHECK has allowed `'quiz'` ever since.
 * Nothing bound this card to that, so for a whole phase it went on telling
 * customers the product could not do a thing the product did.
 *
 * **DEVIATIONS D135, in shipped user-facing copy rather than in a README**, and
 * the cost is larger there: a reader cannot re-derive it, and a locked card
 * carrying a reason is the most convincing thing a screen can say. The bundle's
 * own reason («Quiz kan ikke brukes på lovpålagte maler») is a real rule and is
 * now enforced where it belongs — in the database, surfaced as a named refusal
 * when someone actually tries it, which teaches the rule where a disabled card
 * teaches nothing.
 *
 * Live is refused on a non-anonymous survey by `app.guard_run_mode_anonymous`
 * (`M:0083`). The card is still pickable there: the refusal comes back named
 * and says WHY, which teaches the rule, where a disabled card teaches nothing.
 */
type Mode = 'standard' | 'live' | 'quiz'

export function RunModePanel({
  surveyId,
  runMode,
  anonymity,
  strings: s,
  advanced,
  onAdvancedChange,
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
    quizGuard: string
    quizDesc: string
    namedSurvey: string
    failed: string
    /* B2 — «Byggemodus» moves inside this card, where V2:580-587 draws it:
       one card, Kjøremodus above a rule, Byggemodus below it. It used to sit
       above the tab rail, reachable from every tab, which is not where the
       bundle puts it. */
    buildMode: string
    buildModeDescSimple: string
    buildModeDescAdvanced: string
    simple: string
    advanced: string
  }
  /** The Enkel/Avansert switch, lifted so the card owns the whole section. */
  advanced: boolean
  onAdvancedChange: (next: boolean) => void
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
      // Both quiz guards are DATABASE refusals (app.guard_quiz_policy), so the
      // card is pickable and the reason arrives named — the same choice live
      // already made. `quizGuard` states both halves; it is the string the
      // builder already shipped for exactly this.
      else if (r.error === 'quizGuard') setNote(s.quizGuard)
      else setNote(r.error === 'namedSurvey' ? s.namedSurvey : s.failed)
    })
  }

  const cards: { key: Mode; label: string; desc: string; locked: boolean }[] = [
    { key: 'standard', label: s.standard, desc: s.standardDesc, locked: false },
    { key: 'live', label: s.live, desc: s.liveDesc, locked: false },
    { key: 'quiz', label: s.quiz, desc: s.quizDesc, locked: false },
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
      {/* The design's note chip (V2:577), rendered ONLY when something was
          actually refused. It used to be `{note ?? s.quizNote}` — a chip that
          always has text is a claim about the product, and this one's claim
          outlived its truth by a phase. A chip that appears only after a
          refusal is a message about what just happened. */}
      {note ? (
        <p
          className="mt-[11px] inline-block rounded-full px-[13px] py-2 text-[11.5px] font-semibold"
          style={{ background: 'var(--ac3)' }}
        >
          {note}
        </p>
      ) : null}
      {anonymity !== 'anonymous' && mode !== 'live' ? (
        <p className="mt-2.5 text-[12px] leading-[1.45] text-mut">{s.namedSurvey}</p>
      ) : null}

      {/* V2:580-587 — the rule, then Byggemodus. The description is the mode's
          own, not a fixed sentence: the bundle swaps it (V2:6111-6113) so the
          text always describes what the CURRENT setting gives you. */}
      <div className="mt-[18px] border-t border-line pt-4">
        <div className="text-[11px] uppercase tracking-[.1em] text-mut">{s.buildMode}</div>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-mut">
          {advanced ? s.buildModeDescAdvanced : s.buildModeDescSimple}
        </p>
        <div
          className="mt-2.5 flex gap-[3px] rounded-xl p-1"
          style={{ background: 'var(--sf2)' }}
          role="group"
          aria-label={s.buildMode}
        >
          {([false, true] as const).map((m) => (
            <button
              key={String(m)}
              type="button"
              aria-pressed={advanced === m}
              onClick={() => onAdvancedChange(m)}
              className="touch-44 flex-1 cursor-pointer rounded-[9px] border-none px-3 py-[9px] text-[12.5px] font-semibold text-ink"
              style={{ background: advanced === m ? 'var(--ac)' : 'transparent' }}
            >
              {m ? s.advanced : s.simple}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
