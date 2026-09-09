'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { STEP_KEY, TASK_STEPS, isLate, nextStep, stepIndex, type TaskStatus } from '@/lib/tasks/lifecycle'
import { TASK_ERROR_KEY, advanceTask, assessTaskEffect } from './actions'

/**
 * Oppgaver — V2:2152–2214.
 *
 * ── WHAT DIVERGES, AND IT IS ALL Q71 ────────────────────────────────────────
 *
 * **The bundle promises Teams twice and the product has no Teams.**
 * `taskChannels` (V2:5198) reads «Oppgaver varsles i Teams og i det ukentlige
 * sammendraget», and the late banner (V2:2206) reads «Over frist — varsel er
 * sendt til eier i Teams». Neither is true: the integration is V2-11's and
 * nothing sends anything. **Q71 (defaulted): adjust the copy.** D73's rule,
 * applied for the third time in three phases.
 *
 * **AND MY FIRST REPLACEMENT WAS ALSO FALSE, which is worth leaving in the
 * record.** It read «Oppgaver vises her og i det ukentlige sammendraget» — I
 * dropped Teams and kept the weekly summary. `weekly_digest` is an option row
 * (`M:0002:20`), it is toggled in Administrasjon, and **nothing sends it**:
 * there is no digest path in `scripts/mail-worker.ts` and no cron job producing
 * one. A flag with no call site is a comment in a table — D110's instance 2 —
 * and I had just written a user-facing promise on top of one while fixing
 * exactly that class of defect. Caught by opening the capture and reading the
 * subtitle. The sentence now claims only what is true and names the rest as
 * later.
 *
 * ── AND ONE THING THE DRAWING GETS RIGHT THAT IS WORTH NOT LOSING ───────────
 *
 * `stepChips` renders all six steps on every card, filled to the current one.
 * That is the feature: a compliance record whose whole point is that a duty was
 * followed through shows the path, not just where it stopped.
 */
export type TaskRow = {
  id: string
  title: string
  kind: string
  kindLabel: string
  law: string | null
  source: string
  owner: string | null
  dueAt: string | null
  dueLabel: string | null
  status: TaskStatus
  mine: boolean
  assessed: boolean
}

const CARD = 'rounded-[16px] border border-line bg-sf px-[22px] py-5'
const FILTERS = ['alle', 'mine', 'frist', 'lov'] as const
const FILTER_KEY: Record<(typeof FILTERS)[number], string> = {
  alle: 'taskFilterAlle',
  mine: 'taskFilterMine',
  frist: 'taskFilterFrist',
  lov: 'taskFilterLov',
}

export function TasksPanel({ tasks, canEdit }: { tasks: TaskRow[]; canEdit: boolean }) {
  const t = useTranslations('tasks')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('alle')
  const [busy, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const late = (r: TaskRow) => isLate(r.dueAt, r.status)

  // The four tiles, from the same rows the list draws — V2:5168-5177 computes
  // them the same way. Derived rather than passed in, so a filtered list and its
  // tiles cannot disagree about what «open» means.
  const stats = [
    { v: tasks.filter((r) => r.status !== 'lukket').length, k: 'taskStatOpen', bg: 'var(--sbg)' },
    { v: tasks.filter(late).length, k: 'taskStatLate', bg: 'var(--ac3)' },
    { v: tasks.filter((r) => r.status === 'gjennomfort').length, k: 'taskStatAwait', bg: 'var(--ac2)' },
    { v: tasks.filter((r) => r.law !== null).length, k: 'taskStatLaw', bg: 'var(--sf2)' },
  ]

  const shown = tasks.filter((r) =>
    filter === 'alle' ? true : filter === 'mine' ? r.mine : filter === 'frist' ? late(r) : r.law !== null,
  )

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okKey: string) =>
    startTransition(async () => {
      const res = (await fn()) as { ok: boolean; error?: keyof typeof TASK_ERROR_KEY }
      if (res.ok) {
        setError(null)
        setNote(t(okKey))
      } else {
        setNote(null)
        setError(t(TASK_ERROR_KEY[res.error ?? 'save_failed']))
      }
    })

  return (
    <main className="animate-enter pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-medium">{t('title')}</h1>
          {/* Q71: not «varsles i Teams». */}
          <p className="mt-[3px] text-[13px] text-mut">{t('taskChannels')}</p>
        </div>
        <div className="flex flex-wrap gap-[3px] rounded-[999px] bg-sf2 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className="touch-44 cursor-pointer rounded-[999px] border-none px-[18px] py-2 text-[12.5px] font-semibold text-ink"
              style={{
                background: filter === f ? 'var(--sf)' : 'transparent',
                boxShadow: filter === f ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
              }}
            >
              {t(FILTER_KEY[f])}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
        {stats.map((s) => (
          <div
            key={s.k}
            className="rounded-[16px] border border-line px-5 py-[18px]"
            style={{ background: s.bg }}
          >
            <div className="font-display text-[30px] font-medium leading-none">{s.v}</div>
            <div className="mt-1 text-[12.5px] text-mut">{t(s.k)}</div>
          </div>
        ))}
      </div>

      {/* V2:5197 — the sentence the close guard enforces. */}
      <p className="mt-4 rounded-[14px] bg-sbg px-[18px] py-3.5 text-[13px] leading-[1.55]">
        {t('taskEffectNote')}
      </p>

      {note || error ? (
        <p
          role={error ? 'alert' : 'status'}
          className="mt-3 rounded-[11px] px-[14px] py-3 text-[12.5px] font-semibold"
          style={{ background: error ? 'var(--ac3)' : 'var(--ac2)' }}
        >
          {error ?? note}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        {tasks.length === 0 ? (
          <p className="text-[13px] text-mut">{t('taskNoTasks')}</p>
        ) : shown.length === 0 ? (
          <p className="text-[13px] text-mut">{t('taskNoMatch')}</p>
        ) : (
          shown.map((r) => {
            const next = nextStep(r.status)
            const idx = stepIndex(r.status)
            return (
              <article key={r.id} className={CARD}>
                <div className="flex flex-wrap items-start gap-3.5">
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="flex flex-wrap items-center gap-[9px]">
                      <span className="text-[15px] font-semibold">{r.title}</span>
                      <span className="rounded-full bg-sf2 px-2.5 py-[3px] text-[10.5px] font-bold md:whitespace-nowrap">
                        {r.kindLabel}
                      </span>
                      {r.law ? (
                        <span className="rounded-full bg-ac3 px-2.5 py-[3px] text-[10.5px] font-bold">
                          {r.law}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[12.5px] text-mut">{r.source}</div>
                    <div className="mt-[3px] text-[12.5px] text-mut">
                      {r.owner ?? t('taskOwnerNone')} ·{' '}
                      {r.dueLabel ? t('taskDue', { when: r.dueLabel }) : t('taskDueNone')}
                    </div>
                  </div>
                  <span
                    className="rounded-full px-[13px] py-1.5 text-[11.5px] font-bold md:whitespace-nowrap"
                    style={{
                      background:
                        r.status === 'lukket'
                          ? '#E4F2E0'
                          : late(r)
                            ? 'var(--ac3)'
                            : 'var(--sbg)',
                    }}
                  >
                    {t(STEP_KEY[r.status])}
                  </span>
                  {canEdit && next ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(() => advanceTask({ id: r.id, to: next }), 'taskAssessed')
                      }
                      className="touch-44 flex-none cursor-pointer rounded-[10px] border border-line bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-ink"
                    >
                      {t('taskAdvance', { step: t(STEP_KEY[next]) })}
                    </button>
                  ) : null}
                </div>

                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {TASK_STEPS.map((s, i) => (
                    <span
                      key={s}
                      className="rounded-full px-[11px] py-[5px] text-[11px] font-semibold text-ink"
                      style={{ background: i <= idx ? 'var(--ac)' : 'var(--sf2)' }}
                    >
                      {t(STEP_KEY[s])}
                    </span>
                  ))}
                </div>

                {r.status === 'gjennomfort' ? (
                  <div className="mt-3 rounded-[11px] bg-ac2 px-3.5 py-[11px] text-[12.5px] leading-[1.5]">
                    {t('taskNeedsEffect')}
                    {canEdit && !r.assessed ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => assessTaskEffect({ id: r.id }), 'taskAssessed')}
                        className="touch-44 ml-3 cursor-pointer rounded-[9px] border border-line bg-sf px-3 py-2 text-[11.5px] font-semibold text-ink"
                      >
                        {t('taskAssess')}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {late(r) ? (
                  /* Q71: the bundle says «varsel er sendt til eier i Teams». Nothing
                     is sent, so the banner states the fact and stops there. */
                  <div className="mt-3 rounded-[11px] bg-ac3 px-3.5 py-[11px] text-[12.5px] leading-[1.5]">
                    {t('taskLate')}
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </div>
    </main>
  )
}
