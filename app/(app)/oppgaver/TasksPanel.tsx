'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { STEP_KEY, TASK_STEPS, isLate, nextStep, stepIndex, type TaskStatus } from '@/lib/tasks/lifecycle'
import { TASK_ERROR_KEY, advanceTask, assessTaskEffect, createCorrectingTask } from './actions'
import { FeedbackList, type FeedbackRow } from './FeedbackList'

export type { FeedbackRow }

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
  /** Q97: the task this one was created to correct, if any. */
  corrects: string | null
}

const CARD = 'rounded-[16px] border border-line bg-sf px-[22px] py-5'
/** V3:2176-2190 — the rail that makes this ONE surface with one filter. Three
 *  values, and «Alt» is the default because a manager arriving from the nav has
 *  not yet said which half they came for. */
const VIEWS = ['alle', 'oppgaver', 'tilbakemeldinger'] as const
const VIEW_KEY: Record<(typeof VIEWS)[number], string> = {
  alle: 'tfAll',
  oppgaver: 'tfTasks',
  tilbakemeldinger: 'tfFeedback',
}

const FILTERS = ['alle', 'mine', 'frist', 'lov'] as const
const FILTER_KEY: Record<(typeof FILTERS)[number], string> = {
  alle: 'taskFilterAlle',
  mine: 'taskFilterMine',
  frist: 'taskFilterFrist',
  lov: 'taskFilterLov',
}

/**
 * «Effektvurdert» is named after a record, so the database refuses the step until
 * that record exists (`task_effect_state_needs_assessment`, `M:0067`). The button
 * is hidden rather than left to fail: **a UI must not offer an action it knows
 * the database will refuse** — the same principle that stops it offering a skip.
 * The teal prompt below the card is what the user does instead, and it is already
 * there.
 */
function blockedOnAssessment(r: { status: TaskStatus; assessed: boolean }): boolean {
  return r.status === 'gjennomfort' && !r.assessed
}

export function TasksPanel({
  persons,
  tasks,
  feedback,
  surveyOptions,
  canEdit,
}: {
  /* W3 · Q122 — the workspace's word for the person who answers. A plain
     string prop rather than a read here: this is a client component and the
     workspace resolves at SERVER render, because the choice is a cookie. One
     form, not the whole vocabulary, so the call site states which the screen
     needs rather than leaving a reader to guess. */
  persons: string
  tasks: TaskRow[]
  feedback: FeedbackRow[]
  surveyOptions: { id: string; title: string }[]
  canEdit: boolean
}) {
  const t = useTranslations('tasks')
  const [view, setView] = useState<(typeof VIEWS)[number]>('alle')
  const showTasks = view !== 'tilbakemeldinger'
  const showFeedback = view !== 'oppgaver'
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('alle')
  const [busy, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Q97: `lukket` is terminal, so the last step asks first. A terminal state
   *  should announce itself — the drawing has no such step, and this is the one
   *  thing V2-4 adds that the bundle does not draw. */
  const [closing, setClosing] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState<string | null>(null)
  const [correction, setCorrection] = useState('')

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
          <p className="mt-[3px] text-[13px] text-mut">{t('taskChannels', { persons })}</p>
        </div>
        {/* RESPONSIVE.md §"Chip rows" — the row gap must keep the 44px hit areas of
            vertically adjacent chips apart when the pill wraps. `gap-[3px]` is the
            design's inner gap and it is 1px under the rule's own floor; the fix is
            the SPACING, which is layout and may change, never the chip, which is a
            token. Same values as `ReportsScreen.tsx:94` and `ReportSidePanel.tsx:121`,
            which are this exact control — a third variant would be a third thing to
            keep in step. */}
        {/* THREE, counted. RESPONSIVE.md's chip-rail rule and the same gaps the
            task filters below use — the two rails are the same control and a
            third variant would be a third thing to keep in step. */}
        <div className="flex flex-wrap gap-x-[3px] gap-y-[13px] rounded-[999px] bg-sf2 p-1 xl:gap-y-[3px]">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className="touch-44 cursor-pointer rounded-[999px] border-none px-[18px] py-2 text-[12.5px] font-semibold"
              style={{
                background: view === v ? 'var(--ink)' : 'transparent',
                color: view === v ? 'var(--sf)' : 'var(--ink)',
              }}
            >
              {t(VIEW_KEY[v])}
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

      {/* V3:2192-2198 — the task filters move DOWN here, under a heading of
          their own, because the rail at the top of the page is now the Alt /
          Oppgaver / Tilbakemeldinger switch. Two rails, two jobs. */}
      {showTasks ? (
        <div className="mt-[22px] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('tasksHeading')}</h2>
          {/* gap-y-14: these are the `py-[7px]` chips V3:2196 draws, 30px
              painted, so the 44px areas overflow 7px each side and need 14px
              between rows. The rail ABOVE keeps 13px because its chips are
              `py-2` (40px) and overflow only 2px. Same class list, two
              different correct answers — the number belongs to the chip, not
              to the pattern. This is what overlapped at 320px: «Alle»/«Lovpålagt»
              by 52px² and «Mine»/«Lovpålagt» by 34px². */}
          <div className="flex flex-wrap gap-x-[3px] gap-y-[14px] rounded-[999px] bg-sf2 p-1 xl:gap-y-[3px]">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className="touch-44 cursor-pointer rounded-[999px] border-none px-[15px] py-[7px] text-xs font-semibold text-ink"
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
      ) : null}

      {/* V2:5197 — the sentence the close guard enforces. Inside the task half:
          it is about closing a task and says nothing about a comment. */}
      {showTasks ? (
        <p className="mt-3 rounded-[14px] bg-sbg px-[18px] py-3.5 text-[13px] leading-[1.55]">
          {t('taskEffectNote')}
        </p>
      ) : null}

      {note || error ? (
        <p
          role={error ? 'alert' : 'status'}
          className="mt-3 rounded-[11px] px-[14px] py-3 text-[12.5px] font-semibold"
          style={{ background: error ? 'var(--ac3)' : 'var(--ac2)' }}
        >
          {error ?? note}
        </p>
      ) : null}

      {/* CONDITIONAL, not `hidden`. The HTML attribute sets display:none from
          the UA stylesheet, and `flex` here sets display:flex from a class —
          the class wins, so `hidden` would have been silently inert and the
          task list would have rendered under the Tilbakemeldinger tab. Caught by
          re-reading the diff, not by a gate: nothing in CI opens this screen. */}
      <div className="mt-4 flex flex-col gap-3" style={{ display: showTasks ? undefined : 'none' }}>
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
                  {canEdit && next && !blockedOnAssessment(r) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        // The last step asks first; every other step does not.
                        next === 'lukket'
                          ? setClosing(r.id)
                          : run(() => advanceTask({ id: r.id, to: next }), 'taskAssessed')
                      }
                      className="touch-44 flex-none cursor-pointer rounded-[10px] border border-line bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-ink"
                    >
                      {t('taskAdvance', { step: t(STEP_KEY[next]) })}
                    </button>
                  ) : null}
                </div>

                {r.corrects ? (
                  <div className="mt-2 text-[12px] text-mut">
                    {t('taskCorrects', { title: r.corrects })}
                  </div>
                ) : null}

                {closing === r.id ? (
                  /* Q97, and it is the whole of the decision in one paragraph:
                     closing is final, and an error is corrected by a new task
                     referencing this one. The remedy is real — `corrects_task_id`
                     with a composite key behind it — because a screen promising
                     one the schema cannot express is the defect this phase has
                     already hit twice. */
                  <div className="mt-3 rounded-[12px] border border-line bg-sbg px-4 py-3.5">
                    <div className="text-[13px] font-bold">{t('taskCloseTitle')}</div>
                    <p className="mt-1.5 max-w-[560px] text-[12.5px] leading-[1.55]">
                      {t('taskCloseBody')}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setClosing(null)
                          run(() => advanceTask({ id: r.id, to: 'lukket' }), 'taskAssessed')
                        }}
                        className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-[18px] py-2.5 text-[12.5px] font-bold text-ink"
                      >
                        {t('taskCloseConfirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setClosing(null)}
                        className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-[18px] py-2.5 text-[12.5px] font-semibold text-ink"
                      >
                        {t('taskCloseCancel')}
                      </button>
                    </div>
                  </div>
                ) : null}

                {canEdit && r.status === 'lukket' ? (
                  correcting === r.id ? (
                    <div className="mt-3 rounded-[12px] border border-dashed border-line bg-bg px-4 py-3.5">
                      <div className="text-[12.5px] font-bold">{t('taskCorrectTitle')}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input
                          value={correction}
                          onChange={(e) => setCorrection(e.target.value)}
                          placeholder={t('taskCorrectPlaceholder')}
                          aria-label={t('taskCorrectTitle')}
                          className="touch-44-field [--field-pad-y:11px] box-border min-w-0 flex-1 basis-[220px] rounded-[10px] border border-line bg-sf px-3.5 py-3 text-[13px] text-ink outline-none"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!correction.trim()) return setError(t('taskCorrectNeedTitle'))
                            setCorrecting(null)
                            const title = correction.trim()
                            setCorrection('')
                            run(
                              () => createCorrectingTask({ correctsTaskId: r.id, title }),
                              'taskCorrectDone',
                            )
                          }}
                          className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-[18px] py-2.5 text-[12.5px] font-bold text-ink"
                        >
                          {t('taskCorrectSave')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCorrecting(r.id)}
                      className="touch-44 mt-3 cursor-pointer rounded-[9px] border border-line bg-transparent px-3.5 py-2 text-[11.5px] font-semibold text-mut"
                    >
                      {t('taskCorrectStart')}
                    </button>
                  )
                ) : null}

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
      {showFeedback ? (
        <FeedbackList rows={feedback} surveyOptions={surveyOptions} canEdit={canEdit} />
      ) : null}
    </main>
  )
}
