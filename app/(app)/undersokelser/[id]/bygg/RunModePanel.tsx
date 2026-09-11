'use client'

import { useState, useTransition } from 'react'
import { setFeedbackMode, setRunMode } from './actions'

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
type Feedback = 'off' | 'anonymous' | 'named' | 'optional'

export function RunModePanel({
  surveyId,
  runMode,
  anonymity,
  packLocks,
  feedbackMode,
  linkOnly,
  strings: s,
  advanced,
  onAdvancedChange,
}: {
  surveyId: string
  runMode: string
  anonymity: string
  /** C2 — `surveys.feedback_mode` (M:0099). Whether a respondent may comment,
   *  and under what name. Independent of `anonymity`: one governs whether
   *  ANSWERS are attributable, the other whether COMMENTS are. */
  feedbackMode: string
  /** Whether this round can reach anybody by name at all. A survey distributed
   *  only by share link or QR has no invitation behind a submission, so a
   *  comment written through it has no thread to read a reply back from —
   *  stated on the screen rather than discovered by a respondent who waits. */
  linkOnly: boolean
  /** A statutory pack whose policy is `locked` — the clause in
   *  `app.guard_quiz_policy` that is a real refusal rather than a consequence. */
  packLocks: boolean
  strings: {
    title: string
    desc: string
    standard: string
    standardDesc: string
    live: string
    liveDesc: string
    quiz: string
    quizDesc: string
    /** Forward-looking: what picking Quiz WILL do, on a survey where it applies. */
    quizWillName: string
    /** Past tense: what picking Quiz just did. */
    quizSwitchedToNamed: string
    /** The one refusal that survives, and it stays a refusal. */
    quizPackLocked: string
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
    feedbackTitle: string
    feedbackDesc: string
    feedbackOff: string
    feedbackOffDesc: string
    feedbackAnonymous: string
    feedbackAnonymousDesc: string
    feedbackNamed: string
    feedbackNamedDesc: string
    feedbackOptional: string
    feedbackOptionalDesc: string
    feedbackLinkOnly: string
    feedbackFailed: string
  }
  /** The Enkel/Avansert switch, lifted so the card owns the whole section. */
  advanced: boolean
  onAdvancedChange: (next: boolean) => void
}) {
  const [mode, setMode] = useState<Mode>(
    runMode === 'live' ? 'live' : runMode === 'quiz' ? 'quiz' : 'standard',
  )
  /* Tracked locally because picking Quiz CHANGES it, and the sentence under the
     cards has to stop predicting a switch that has already happened. */
  const [anon, setAnon] = useState(anonymity)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const [feedback, setFeedback] = useState<Feedback>(
    feedbackMode === 'off' || feedbackMode === 'named' || feedbackMode === 'optional'
      ? feedbackMode
      : 'anonymous',
  )
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null)

  function pickFeedback(next: Feedback) {
    if (next === feedback) return
    setFeedbackNote(null)
    const previous = feedback
    // Optimistic, then corrected on refusal. The four cards are a radio group and
    // a radio that does not move under the pointer reads as broken; what must not
    // happen is that it moves and STAYS moved after the server said no.
    setFeedback(next)
    start(async () => {
      const r = await setFeedbackMode({ surveyId, feedbackMode: next })
      if (!r.ok) {
        setFeedback(previous)
        setFeedbackNote(s.feedbackFailed)
      }
    })
  }

  function pick(next: Mode) {
    if (next === mode) return
    setNote(null)
    start(async () => {
      const r = await setRunMode({ surveyId, runMode: next })
      if (r.ok) {
        setMode(next)
        // The server reports whether it actually moved the anonymity, so this
        // says what HAPPENED rather than what the client assumed it would.
        if (r.switchedToNamed) {
          setAnon('named')
          setNote(s.quizSwitchedToNamed)
        }
        return
      }
      if (r.error === 'quizPackLocked') setNote(s.quizPackLocked)
      else if (r.error === 'namedSurvey') setNote(s.namedSurvey)
      else setNote(s.failed)
    })
  }

  /**
   * THE ONE SENTENCE UNDER THE CARDS, AND THE RULE FOR WHICH ONE IT IS.
   *
   * It used to be two restrictions at once, permanently, on a survey neither
   * applied to — the editor was told what the product would refuse before they
   * had asked it for anything. A screen that opens by listing prohibitions is
   * describing itself, not helping.
   *
   * Now: at most one, only where it bears, and the anonymous case is a
   * CONSEQUENCE rather than a prohibition — «this is what Quiz will do», not
   * «this is what you may not have».
   */
  const standing =
    mode === 'quiz'
      ? null // Nothing to say: both conditions provably hold, or we would not be here.
      : packLocks
        ? s.quizPackLocked
        : anon !== 'named'
          ? s.quizWillName
          : null

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
          role="status"
          className="mt-[11px] inline-block rounded-full px-[13px] py-2 text-[11.5px] font-semibold"
          style={{ background: 'var(--ac3)' }}
        >
          {note}
        </p>
      ) : standing ? (
        /* Quiet, not a chip: the chip is `--ac3` and reads as a warning. This
           sentence is information about the mode you are hovering over, and the
           two must not look the same. */
        <p className="mt-2.5 text-[12px] leading-[1.45] text-mut">{standing}</p>
      ) : null}

      {/* V3:580-594 — «Kommentar og samtale per spørsmål», between Kjøremodus and
          Byggemodus, in the same card and behind the same rule.

          NOT a chip rail. `02-plan.md` predicted RESPONSIVE.md's «Tab rails and
          chip groups» here; the bundle draws a COLUMN of full-width cards
          (`flex-direction:column`), identical in shape to the Kjøremodus cards
          directly above. There is nothing to wrap, so that section does not
          apply — recorded rather than force-fitted, because quoting a rule that
          does not govern the control is how RESPONSIVE.md's own worked example
          went wrong (D129). */}
      <div className="mt-[18px] border-t border-line pt-4">
        <div className="text-[11px] uppercase tracking-[.1em] text-mut">{s.feedbackTitle}</div>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-mut">{s.feedbackDesc}</p>
        <div className="mt-2.5 flex flex-col gap-[7px]" role="radiogroup" aria-label={s.feedbackTitle}>
          {(
            [
              { key: 'off', label: s.feedbackOff, desc: s.feedbackOffDesc },
              { key: 'anonymous', label: s.feedbackAnonymous, desc: s.feedbackAnonymousDesc },
              { key: 'named', label: s.feedbackNamed, desc: s.feedbackNamedDesc },
              { key: 'optional', label: s.feedbackOptional, desc: s.feedbackOptionalDesc },
            ] as { key: Feedback; label: string; desc: string }[]
          ).map((f) => {
            const on = f.key === feedback
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={pending}
                onClick={() => pickFeedback(f.key)}
                className="flex min-w-0 items-center gap-2.5 rounded-[11px] border-[1.5px] px-[13px] py-2.5 text-left text-ink"
                style={{
                  borderColor: on ? 'var(--ink)' : 'var(--line)',
                  background: on ? 'var(--sbg)' : 'var(--sf)',
                }}
              >
                <span
                  aria-hidden
                  className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border-[1.5px]"
                  style={{ borderColor: on ? 'var(--ink)' : 'var(--line)' }}
                >
                  <span
                    className="block h-[7px] w-[7px] rounded-full"
                    style={{ background: on ? 'var(--ink)' : 'transparent' }}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{f.label}</span>
                  <span className="mt-px block text-[11.5px] leading-[1.4] text-mut">{f.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
        {/* A thread needs somebody to reply TO. A share link resolves to no
            invitation, so `get_comment_thread` returns an empty thread by
            design — every holder of that link is the same principal. Saying so
            here is cheaper than a respondent waiting for an answer that has
            nowhere to arrive. */}
        {feedback !== 'off' && linkOnly ? (
          <p className="mt-2.5 text-[12px] leading-[1.45] text-mut">{s.feedbackLinkOnly}</p>
        ) : null}
        {feedbackNote ? (
          <p
            role="status"
            className="mt-[11px] inline-block rounded-full px-[13px] py-2 text-[11.5px] font-semibold"
            style={{ background: 'var(--ac3)' }}
          >
            {feedbackNote}
          </p>
        ) : null}
      </div>

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
