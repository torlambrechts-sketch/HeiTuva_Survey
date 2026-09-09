'use client'

import { useState, useTransition } from 'react'
import { setQuizSettings } from './actions'

/**
 * «Quizmodus» — V2:6148-6165, in the Builder's Innstillinger pane, below
 * «Kjøremodus» and shown only when the survey is in quiz mode.
 *
 * ── WHAT IS HERE AND WHAT DELIBERATELY IS NOT (Q84, ANSWERED BY TOR) ───────
 *
 * Tor's narrowing: **«no quizPass, no quizTries, no certificate — points and
 * time bonus and the team leaderboard only.»** Read against the bundle, that is
 * not a cut so much as a confirmation: `DEFAULT_QUIZ` (V2:4339) is
 * `{ timeBonus:true, team:true, instant:false, certificate:false }`, so the two
 * that ship ON are exactly the two Tor kept.
 *
 * `instant` and `certificate` therefore render the absence-visible treatment
 * rather than being dropped — `helpForum` (Q74), Q26's stream panel and V2-9's
 * `fullscreen`, for the reason `help_articles.requires_flag` states: a reader
 * must be able to tell «not built» from «not there». The pass mark and the
 * attempt count are not rendered at all, because unlike the toggles they are
 * not switches over an absent feature: they are *inputs for a decision that was
 * made not to exist.* A greyed-out «70 %» field would invite the question «how
 * do I enable this», which has no answer.
 */
export function QuizPanel({
  surveyId,
  timeBonus,
  teamBoard,
  strings: s,
}: {
  surveyId: string
  timeBonus: boolean
  teamBoard: boolean
  strings: {
    title: string
    timeBonus: string
    timeBonusDesc: string
    team: string
    teamDesc: string
    instant: string
    instantUnavailable: string
    certificate: string
    certificateUnavailable: string
    guard: string
    failed: string
  }
}) {
  const [bonus, setBonus] = useState(timeBonus)
  const [board, setBoard] = useState(teamBoard)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle(which: 'timeBonus' | 'teamBoard') {
    const next = which === 'timeBonus' ? !bonus : !board
    setError(null)
    if (which === 'timeBonus') setBonus(next)
    else setBoard(next)
    start(async () => {
      const r = await setQuizSettings({
        surveyId,
        timeBonus: which === 'timeBonus' ? next : bonus,
        teamBoard: which === 'teamBoard' ? next : board,
      })
      if (!r.ok) {
        setError(s.failed)
        // Put the switch back. A toggle that stays where the user left it after
        // the write failed is a control lying about the stored state.
        if (which === 'timeBonus') setBonus(!next)
        else setBoard(!next)
      }
    })
  }

  const Row = ({ on, label, desc, onPress }: {
    on: boolean; label: string; desc: string; onPress: () => void
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={onPress}
      className="touch-44 flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-sf px-[15px] py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold">{label}</span>
        <span className="mt-[2px] block text-[11.5px] leading-[1.4] text-mut">{desc}</span>
      </span>
      <span
        className="flex h-[22px] w-[38px] flex-none items-center rounded-full px-[3px]"
        style={{ background: on ? 'var(--ac)' : 'var(--sf2)', justifyContent: on ? 'flex-end' : 'flex-start' }}
      >
        <span className="block h-4 w-4 rounded-full bg-sf" />
      </span>
    </button>
  )

  return (
    <div className="rounded-2xl border border-line bg-sf p-5">
      <div className="text-[11px] uppercase tracking-[.1em] text-mut">{s.title}</div>
      <div className="mt-3 flex flex-col gap-2">
        <Row on={bonus} label={s.timeBonus} desc={s.timeBonusDesc} onPress={() => toggle('timeBonus')} />
        <Row on={board} label={s.team} desc={s.teamDesc} onPress={() => toggle('teamBoard')} />
        {/* Q84: not built, and said so rather than shown as an off switch. */}
        {[
          [s.instant, s.instantUnavailable],
          [s.certificate, s.certificateUnavailable],
        ].map(([label, why]) => (
          <div key={label} className="rounded-xl border border-dashed border-line bg-bg px-[15px] py-3">
            <span className="block text-[13.5px] font-bold text-mut">{label}</span>
            <span className="mt-[2px] block text-[11.5px] leading-[1.4] text-mut">{why}</span>
          </div>
        ))}
      </div>
      <p className="mt-[11px] text-[12px] leading-[1.45] text-mut">{s.guard}</p>
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-mut">
          {error}
        </p>
      ) : null}
    </div>
  )
}
