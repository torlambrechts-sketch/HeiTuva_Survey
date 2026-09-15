'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SURVEY_VIEWS, type SurveyView } from '@/lib/surveys/view'
import { setSurveyView } from './actions'

/**
 * F4 — «Liste · Liste og detalj · Kort» (v6:2211-2216).
 *
 * A server action because the choice is a COOKIE and Q122 keeps it there: the
 * list is a server component, so `localStorage` cannot reach the render that
 * needs it. Same control shape as the Arbeidsliste's Liste/Tavle toggle, which
 * is the precedent this follows rather than a second pattern.
 *
 * The labels are props: this file may not know which key is which label,
 * because the mapping is the thing that is easy to get backwards («Liste» is
 * the TABLE) and it is asserted in one place, over the registry.
 */
export function ViewSwitcher({
  view,
  labels,
}: {
  view: SurveyView
  labels: Record<SurveyView, string>
}) {
  const router = useRouter()
  const [busy, start] = useTransition()

  return (
    /* v6:2212 — `gap:2px;padding:3px`, radius 10. `touch-cluster` because the
       pills are `py-[7px]` (30px painted) and a 44px hit area on a 30px control
       needs 14px between painted edges below 767px — globals.css has done this
       arithmetic and CLAUDE.md's row 10 is the record of getting it wrong. */
    <span className="touch-cluster flex flex-wrap gap-0.5 rounded-[10px] bg-sf2 p-[3px]">
      {SURVEY_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              await setSurveyView({ view: v })
              router.refresh()
            })
          }
          aria-pressed={view === v}
          className="touch-44 cursor-pointer whitespace-nowrap rounded-lg border-none px-[13px] py-[7px] text-xs font-semibold text-ink"
          style={{ background: view === v ? 'var(--ac)' : 'transparent' }}
        >
          {labels[v]}
        </button>
      ))}
    </span>
  )
}
