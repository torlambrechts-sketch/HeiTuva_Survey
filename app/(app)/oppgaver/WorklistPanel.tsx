'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { STEP_KEY, TASK_STEPS, isLate, nextStep, stepIndex, type TaskStatus } from '@/lib/tasks/lifecycle'
import {
  BUCKET_KEY,
  BUCKET_TINT,
  COLUMN_KEY,
  COLUMN_TINT,
  SCOPE_KEY,
  WORKLIST_COLUMNS,
  WORKLIST_SCOPES,
  bucketOf,
  bucketOrder,
  columnOf,
  matchesScope,
  matchesType,
  progressPercent,
  progressTint,
  type WorklistScope,
  type WorklistType,
} from '@/lib/worklist/rows'
import { type WorklistView } from '@/lib/worklist/view'
import {
  TASK_ERROR_KEY,
  addWorklistNote,
  advanceTask,
  advanceTasks,
  assessTaskEffect,
  assignTasks,
  createWorklistTask,
  replyToComment,
  setCommentHandled,
  setTaskDue,
  setWorklistView,
} from './actions'

/**
 * Arbeidsliste — v5:3128-3374, one list over two tables.
 *
 * ── THE OWNER PANEL DOES NOT BECOME «AVSENDERE», AND THAT IS Q155 ──────────
 *
 * v5:6933 flips the chip panel's title to «Avsendere» when the list is
 * feedback-only, and `ivOwners` (v5:6924) then counts rows per `f.who` — a
 * respondent. **Declined.** A count per respondent is a statistic about a
 * person, and this product does not produce those: k-anonymity exists so that
 * no aggregate describes an individual, and «Kari — 4» on a manager's screen is
 * exactly such an aggregate, assembled from the one place named free text is
 * legitimately readable. The individual named comment stays readable because an
 * administrator was told who wrote it; that is not the same as a ranking of who
 * complains most, and most of our comments are anonymous anyway (Q115), so the
 * panel would have counted the named minority and misrepresented the volume.
 *
 * So the panel is «Eiere», it counts task owners, and it says so in every view.
 *
 * ── THE BULK BAR HAS THREE ACTIONS, NOT FOUR ───────────────────────────────
 *
 * Tor's decision on «Lukk valgte» (v5:3232): Q69 says a task cannot close
 * before its effect is assessed, under aml. § 3-1 and ldl. § 26 fjerde ledd,
 * and a bulk button closing a selection is that rule bypassed for n rows at
 * once — worse than bypassing it once, because it makes the bypass the fast
 * path. Multi-select stays for what can honestly be done in bulk: assign, set a
 * deadline, advance one step. Closing stays per task with its assessment.
 *
 * `advanceTasks` carries the same reasoning one step further down and reports
 * it — see its comment. The bar loses one action; the selection model is
 * unchanged.
 */
export type WorklistNote = {
  id: string
  text: string
  who: string | null
  dateLabel: string
}

export type WorklistItem = {
  key: string
  id: string
  kind: 'task' | 'comment'
  title: string
  typeLabel: string
  law: string | null
  source: string
  owner: string | null
  ownerMemberId: string | null
  dueAt: string | null
  dueLabel: string | null
  status: TaskStatus | null
  mine: boolean
  assessed: boolean
  handled: boolean
  anonymous: boolean
  hasThread: boolean
  question: string | null
  replies: { text: string; dateLabel: string }[]
  notes: WorklistNote[]
  corrects: string | null
}

/**
 * «Effektvurdert» is named after a record, so the database refuses the step
 * until that record exists (`task_effect_state_needs_assessment`, M:0067). The
 * button is hidden rather than left to fail: a UI must not offer an action it
 * knows the database will refuse.
 */
const blockedOnAssessment = (r: WorklistItem): boolean =>
  r.status === 'gjennomfort' && !r.assessed

/**
 * v5:3243-3250 — the list's column widths, verbatim, AND SCOPED TO `md`.
 *
 * The widths are a fact about the DESKTOP table. Below `md` they are what broke
 * the row: 18 + 118 + 96 + 108 fixed pixels plus four 16px gaps do not fit 346,
 * so the flex line packed what it could and the title — `flex-[2.4_1_0]` with
 * `min-w-0` — absorbed the whole shortfall and painted about 24px wide. Its
 * `touch-44` overlay then grew to 44 and collided with the checkbox's, which
 * is what `verify:responsive` reported 28 times at 390px.
 *
 * RESPONSIVE.md § Data tables says that row becomes a CARD, and the comment on
 * the column header below has claimed since this screen was written that it
 * does. **It did not** — the header was hidden and the row left as a squeezed
 * flex line. This is the layout the comment describes: below `md` the checkbox
 * and the title own the first line, and the four meta fields wrap under it in
 * a cluster, each sized to its content. `md:contents` puts them back as direct
 * children of the row above `md`, so the desktop table is byte-identical.
 *
 * Only at 390px, not at 320px: at 320 the line packed differently and the title
 * came out wide enough that nothing collided. **A layout defect that appears at
 * ONE of two measured widths is why the gate measures both.**
 */
const COL = {
  task: 'min-w-0 flex-1 md:flex-[2.4_1_0]',
  type: 'flex-none md:w-[118px]',
  due: 'flex-none md:w-24',
  status: 'flex-none md:w-[108px]',
  owner: 'min-w-0 flex-none md:flex-[1.3_1_0]',
  chev: 'w-[34px] flex-none',
} as const

const HEAD = 'text-[11px] uppercase tracking-[.09em] text-mut'

export function WorklistPanel({
  persons,
  type,
  view,
  items,
  kindOptions,
  surveyOptions,
  memberOptions,
  canEdit,
}: {
  persons: string
  type: WorklistType
  view: WorklistView
  items: WorklistItem[]
  kindOptions: { key: string; label: string }[]
  surveyOptions: { id: string; title: string }[]
  memberOptions: { id: string; name: string }[]
  canEdit: boolean
}) {
  const t = useTranslations('tasks')
  const [scope, setScope] = useState<WorklistScope>('alle')
  const [open, setOpen] = useState<string | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [newOpen, setNewOpen] = useState(false)
  const [busy, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Q97: `lukket` is terminal, so the last step asks first. */
  const [closing, setClosing] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [dueDraft, setDueDraft] = useState<Record<string, string>>({})
  const [ntTitle, setNtTitle] = useState('')
  const [ntKind, setNtKind] = useState(kindOptions[0]?.key ?? 'tiltak')
  const [ntOwner, setNtOwner] = useState('')
  const [ntDue, setNtDue] = useState('')
  const [ntSurvey, setNtSurvey] = useState('')
  const [bulkDue, setBulkDue] = useState('')

  /* Local echoes of what has happened since the last server render, so the
     operator sees their own action. Server state is the truth on the next
     render; these are only the difference. */
  const [handledNow, setHandledNow] = useState<Record<string, boolean>>({})
  const [sentReplies, setSentReplies] = useState<Record<string, { text: string; dateLabel: string }[]>>({})
  const [addedNotes, setAddedNotes] = useState<Record<string, WorklistNote[]>>({})

  const isHandled = (r: WorklistItem) => handledNow[r.key] ?? r.handled
  const facts = (r: WorklistItem) => ({
    kind: r.kind,
    status: r.status,
    dueAt: r.dueAt,
    hasLaw: r.law !== null,
    mine: r.mine,
    handled: isHandled(r),
  })

  const shown = useMemo(
    () =>
      items.filter((r) => matchesType(facts(r), type) && matchesScope(facts(r), scope)),
    // `handledNow` participates: marking a comment handled must move it out of
    // «Ubehandlet» immediately, or the filter and the row disagree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, type, scope, handledNow],
  )

  /* v5:3252 sorts by bucket and prints the bucket name on the first row of each
     run. Sorted here and grouped in the render, from the same derivation the
     board uses, so the two views cannot disagree about where a row belongs. */
  const sorted = useMemo(() => {
    const withBucket = shown.map((r) => ({ row: r, bucket: bucketOf(facts(r)) }))
    return withBucket.sort((a, b) => bucketOrder(a.bucket) - bucketOrder(b.bucket))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  const owners = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of shown) if (r.owner) count.set(r.owner, (count.get(r.owner) ?? 0) + 1)
    const tints = ['var(--ac)', 'var(--ac2)', 'var(--ac3)', 'var(--sbg)', 'var(--sf2)']
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, n], i) => ({
        name,
        n,
        ini: name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
        bg: tints[i % tints.length]!,
      }))
  }, [shown])

  const selected = Object.keys(checked).filter((k) => checked[k])
  const selectedTaskIds = items
    .filter((r) => r.kind === 'task' && checked[r.key])
    .map((r) => r.id)
  const allChecked = sorted.length > 0 && sorted.every(({ row }) => checked[row.key])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okKey: string) =>
    start(async () => {
      const res = (await fn()) as { ok: boolean; error?: keyof typeof TASK_ERROR_KEY }
      if (res.ok) {
        setError(null)
        setNote(t(okKey))
      } else {
        setNote(null)
        setError(t(TASK_ERROR_KEY[res.error ?? 'save_failed']))
      }
    })

  const scopeLineKey =
    type === 'oppgaver' ? 'wlScopeLineTasks' : type === 'tilbakemeldinger' ? 'wlScopeLineFeedback' : 'wlScopeLineAll'

  return (
    <main className="animate-enter pt-[26px]">
      {/* v5:3130-3132 — the breadcrumb. */}
      <div className="flex items-center gap-[9px] text-[12.5px] text-mut">
        <span>{t('wlCrumbRoot')}</span>
        <span className="opacity-50">→</span>
        <span className="font-semibold text-ink">{t('wlCrumbHere')}</span>
      </div>

      <div className="mt-4 grid items-start gap-[18px] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(330px,.9fr)]">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <span className="flex h-[62px] w-[62px] flex-none items-center justify-center rounded-[16px] bg-ac">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect x="6" y="17" width="4.4" height="8" rx="1.6" fill="var(--ink)" />
                <rect x="13.8" y="12" width="4.4" height="13" rx="1.6" fill="var(--ink)" />
                <rect x="21.6" y="7" width="4.4" height="18" rx="1.6" fill="var(--ink)" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[30px] font-semibold leading-[1.1]">{t('wlTitle')}</h1>
              <div className="mt-1 text-[13px] text-mut">
                {t('wlCount', { n: shown.length })} &nbsp;|&nbsp; {t(scopeLineKey)}
              </div>
            </div>
          </div>
          {/* Q72 — NOT «Hvert funn under terskel blir et tiltak». */}
          <p className="mt-3.5 max-w-[460px] text-sm leading-[1.6] text-mut [text-wrap:pretty]">
            {t('wlLead', { persons })}
          </p>
        </div>

        {/* v5:3157-3170 — the owner panel. Q155: «Eiere» in every view. */}
        <div className="rounded-[20px] border border-line bg-sf px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-baseline gap-2.5">
              <span className="font-display text-[21px] font-medium">{t('wlOwners')}</span>
              <span className="text-[15px] font-bold">{owners.length}</span>
            </span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setNewOpen((v) => !v)}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[15px] py-2 text-[12.5px] font-semibold text-ink"
              >
                ＋ {t('wlNewTask')}
              </button>
            ) : null}
          </div>
          {owners.length === 0 ? (
            <p className="mt-3.5 text-[12.5px] text-mut">{t('wlOwnersNone')}</p>
          ) : (
            <div className="touch-cluster mt-3.5 flex flex-wrap gap-2">
              {owners.map((o) => (
                <span
                  key={o.name}
                  title={o.name}
                  className="flex items-center gap-2 rounded-full border border-line bg-bg py-1.5 pl-1.5 pr-[11px]"
                >
                  <span
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: o.bg }}
                  >
                    {o.ini}
                  </span>
                  <span className="whitespace-nowrap text-[12.5px]">{o.name}</span>
                  <span className="text-[11.5px] font-bold text-mut">{o.n}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── The Arbeidsliste card (v5:3174) ─────────────────────────────── */}
      <div className="mt-[18px] min-w-0 rounded-[20px] border border-line bg-sf">
        <div className="flex flex-wrap items-center justify-between gap-3.5 px-[22px] py-[18px]">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <span className="whitespace-nowrap font-display text-[22px] font-medium">
              {t('wlHeading')}
            </span>
            {/* v5:3179 — the scope rail. `touch-cluster`, because these are the
                `py-[7px]` chips (30px painted) whose 44px hit areas overflow 7px
                each side: globals.css has done this arithmetic once and the
                number belongs to the control, not to the pattern (CLAUDE.md
                row 10, which fired on this very screen in C4). */}
            <span className="touch-cluster flex flex-wrap gap-[3px] rounded-[11px] bg-sf2 p-1">
              {WORKLIST_SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  aria-pressed={scope === s}
                  className="touch-44 cursor-pointer whitespace-nowrap rounded-lg border-none px-3.5 py-[7px] text-xs font-semibold"
                  style={{
                    background: scope === s ? 'var(--ink)' : 'transparent',
                    color: scope === s ? 'var(--sf)' : 'var(--ink)',
                  }}
                >
                  {t(SCOPE_KEY[s])}
                </button>
              ))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-[9px]">
            {/* v5:3184 — Liste / Tavle. A server action, because the choice is a
                cookie and Q152 keeps it there. */}
            <span className="touch-cluster flex flex-wrap gap-0.5 rounded-[10px] bg-sf2 p-[3px]">
              {(['list', 'board'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={busy}
                  onClick={() => start(async () => void (await setWorklistView({ view: v })))}
                  aria-pressed={view === v}
                  className="touch-44 cursor-pointer whitespace-nowrap rounded-lg border-none px-[13px] py-[7px] text-xs font-semibold text-ink"
                  style={{
                    background: view === v ? 'var(--sf)' : 'transparent',
                    boxShadow: view === v ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
                  }}
                >
                  {t(v === 'list' ? 'wlViewList' : 'wlViewBoard')}
                </button>
              ))}
            </span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setNewOpen((v) => !v)}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-[15px] py-2 text-[12.5px] font-bold text-ink"
              >
                {t('wlNewTask')}
              </button>
            ) : null}
          </div>
        </div>

        {/* v5:3195-3216 — «Ny oppgave». */}
        {newOpen && canEdit ? (
          <div className="border-t border-line bg-bg px-[22px] py-[18px]">
            <div className="text-sm font-bold">{t('wlNewTaskTitle')}</div>
            <div className="mt-3 grid gap-2.5 md:[grid-template-columns:minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <input
                value={ntTitle}
                onChange={(e) => setNtTitle(e.target.value)}
                placeholder={t('wlNtTitle')}
                aria-label={t('wlNtTitle')}
                className="touch-44-field [--field-pad-y:11px] box-border w-full max-w-full rounded-[10px] border border-line bg-sf px-3.5 py-[11px] text-sm text-ink outline-none"
              />
              <select
                value={ntOwner}
                onChange={(e) => setNtOwner(e.target.value)}
                aria-label={t('wlNtOwner')}
                className="touch-44-field [--field-pad-y:11px] box-border w-full max-w-full rounded-[10px] border border-line bg-sf px-3 py-[11px] text-[13px] text-ink outline-none"
              >
                <option value="">{t('wlNtOwnerNone')}</option>
                {memberOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {/* A DATE input, not the bundle's free-text «Frist». v5:3202 takes
                  «om 14 dager» as a string because the prototype has no dates;
                  `tasks.due_at` is a `date`, so the control is the one that can
                  express the column (CLAUDE.md, control substitution — the
                  single allowed exception, logged as D165). */}
              <input
                type="date"
                value={ntDue}
                onChange={(e) => setNtDue(e.target.value)}
                aria-label={t('wlNtDue')}
                className="touch-44-field [--field-pad-y:11px] box-border w-full max-w-full rounded-[10px] border border-line bg-sf px-3.5 py-[11px] text-[13px] text-ink outline-none"
              />
              <select
                value={ntKind}
                onChange={(e) => setNtKind(e.target.value)}
                aria-label={t('wlNtKind')}
                className="touch-44-field [--field-pad-y:11px] box-border w-full max-w-full rounded-[10px] border border-line bg-sf px-3 py-[11px] text-[13px] text-ink outline-none"
              >
                {kindOptions.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <select
                value={ntSurvey}
                onChange={(e) => setNtSurvey(e.target.value)}
                aria-label={t('wlNtSource')}
                className="touch-44-field [--field-pad-y:11px] box-border w-full max-w-full rounded-[10px] border border-line bg-sf px-3 py-[11px] text-[13px] text-ink outline-none md:[grid-column:span_2]"
              >
                {/* The VALUE is the survey's id. v5:6876 maps the option value
                    to the survey's TITLE, and a title is not a key —
                    `tasks.source_ref` is a real FK, which is what stops a task
                    referencing another organisation's row. */}
                <option value="">{t('wlNtSourceNone')}</option>
                {surveyOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-ink"
              >
                {t('wlNtCancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!ntTitle.trim()) return setError(t('wlNtNeedTitle'))
                  const payload = {
                    title: ntTitle.trim(),
                    kind: ntKind,
                    ownerMemberId: ntOwner || null,
                    dueAt: ntDue || null,
                    surveyId: ntSurvey || null,
                  }
                  setNtTitle('')
                  setNewOpen(false)
                  run(() => createWorklistTask(payload), 'wlNtCreated')
                }}
                className="touch-44 cursor-pointer rounded-[10px] border-none bg-ink px-[18px] py-2.5 text-[12.5px] font-bold text-sf"
              >
                {t('wlNtSave')}
              </button>
            </div>
          </div>
        ) : null}

        {note || error ? (
          <p
            role={error ? 'alert' : 'status'}
            className="mx-[22px] my-3 rounded-[11px] px-3.5 py-3 text-[12.5px] font-semibold"
            style={{ background: error ? 'var(--ac3)' : 'var(--ac2)' }}
          >
            {error ?? note}
          </p>
        ) : null}

        {view === 'list' ? (
          <>
            {/* v5:3224-3235 — the bulk bar. THREE actions; «Lukk valgte» is not
                built (Tor's decision, and `advanceTasks` carries the same
                reasoning into «Flytt ett steg»). */}
            {selected.length > 0 && canEdit ? (
              <div className="touch-cluster flex flex-wrap items-center gap-2.5 border-t border-line bg-sbg px-[22px] py-3">
                <span className="whitespace-nowrap text-[12.5px] font-bold">
                  {t('wlSelected', { n: selected.length })}
                </span>
                <select
                  value=""
                  disabled={busy || selectedTaskIds.length === 0}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    run(
                      () => assignTasks({ ids: selectedTaskIds, ownerMemberId: v === '-' ? null : v }),
                      'wlSaved',
                    )
                  }}
                  aria-label={t('wlBulkAssign')}
                  className="touch-44-field [--field-pad-y:8px] box-border max-w-full rounded-[9px] border border-line bg-sf px-3 py-2 text-[12.5px] text-ink outline-none"
                >
                  <option value="">{t('wlBulkAssignPlaceholder')}</option>
                  <option value="-">{t('wlNtOwnerNone')}</option>
                  {memberOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={bulkDue}
                  disabled={busy || selectedTaskIds.length === 0}
                  onChange={(e) => {
                    const v = e.target.value
                    setBulkDue(v)
                    if (v) run(() => setTaskDue({ ids: selectedTaskIds, dueAt: v }), 'wlSaved')
                  }}
                  aria-label={t('wlBulkDue')}
                  className="touch-44-field [--field-pad-y:8px] box-border max-w-full rounded-[9px] border border-line bg-sf px-3 py-2 text-[12.5px] text-ink outline-none"
                />
                <button
                  type="button"
                  disabled={busy || selectedTaskIds.length === 0}
                  onClick={() =>
                    start(async () => {
                      const res = await advanceTasks({ ids: selectedTaskIds })
                      if (!res.ok) {
                        setNote(null)
                        setError(t(TASK_ERROR_KEY[res.error]))
                        return
                      }
                      /* Partial failure REPORTED rather than counted as done.
                         The rows in a selection sit at different steps, and the
                         close guard refuses `gjennomfort -> effektvurdert`
                         without an assessment row — so the sentence names each
                         class it left alone. */
                      const parts = [
                        res.moved > 0 ? t('wlBulkMoved', { n: res.moved }) : null,
                        res.needsAssessment > 0
                          ? t('wlBulkNeedsEffect', { n: res.needsAssessment })
                          : null,
                        res.atClose > 0 ? t('wlBulkAtClose', { n: res.atClose }) : null,
                        res.failed > 0 ? t('wlBulkFailed', { n: res.failed }) : null,
                      ].filter(Boolean)
                      setError(null)
                      setNote(parts.join(' '))
                      setChecked({})
                    })
                  }
                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[9px] border border-line bg-sf px-3.5 py-2 text-[12.5px] font-semibold text-ink"
                >
                  {t('wlBulkAdvance')}
                </button>
                <button
                  type="button"
                  onClick={() => setChecked({})}
                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[9px] border-none bg-transparent px-3 py-2 text-[12.5px] font-semibold text-mut"
                >
                  {t('wlBulkClear')}
                </button>
              </div>
            ) : null}

            {/* v5:3236-3242 — the column header. Hidden below md: five labelled
                columns do not fit a 390px row, and RESPONSIVE.md § Data tables
                says the row becomes a card there. The row below is that card —
                see the comment on `COL`, which carries the arithmetic and the
                reason this comment was false for one commit. */}
            <div className="hidden items-center gap-4 border-y border-line bg-bg px-[22px] py-[11px] md:flex">
              <button
                type="button"
                onClick={() =>
                  setChecked(
                    allChecked ? {} : Object.fromEntries(sorted.map(({ row }) => [row.key, true])),
                  )
                }
                aria-label={t('wlSelectAll')}
                aria-pressed={allChecked}
                className="flex h-[18px] w-[18px] flex-none cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] border-line p-0 text-[11px] font-bold"
                style={{
                  background: allChecked ? 'var(--ink)' : 'transparent',
                  color: allChecked ? 'var(--sf)' : 'transparent',
                }}
              >
                ✓
              </button>
              <span className={`${COL.task} ${HEAD}`}>{t('wlColTask')}</span>
              <span className={`${COL.type} ${HEAD}`}>{t('wlColType')}</span>
              <span className={`${COL.due} ${HEAD}`}>{t('wlColDue')}</span>
              <span className={`${COL.status} ${HEAD}`}>{t('wlColStatus')}</span>
              <span className={`${COL.owner} ${HEAD}`}>{t('wlColOwner')}</span>
              <span className={COL.chev} />
            </div>

            {sorted.length === 0 ? (
              <div className="px-[22px] py-[30px] text-center">
                <div className="text-sm font-semibold">{t('wlEmpty')}</div>
                <div className="mt-1 text-[12.5px] text-mut">{t('wlEmptyHint')}</div>
              </div>
            ) : null}

            {sorted.map(({ row: r, bucket }, i) => {
              const first = i === 0 || sorted[i - 1]!.bucket !== bucket
              const isOpen = open === r.key
              const pct = progressPercent(facts(r))
              const notes = [...r.notes, ...(addedNotes[r.key] ?? [])]
              const replies = [...r.replies, ...(sentReplies[r.key] ?? [])]
              return (
                <div
                  key={r.key}
                  className="border-b border-line"
                  style={{ background: isOpen ? 'var(--bg)' : 'transparent' }}
                >
                  {first ? (
                    <div className="px-[22px] pb-1 pt-2.5">
                      <span
                        className="rounded-full px-[11px] py-1 text-[10.5px] font-bold uppercase tracking-[.04em]"
                        style={{ background: BUCKET_TINT[bucket] }}
                      >
                        {t(BUCKET_KEY[bucket])}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex min-w-0 flex-col gap-2.5 px-[22px] py-3.5 md:flex-row md:flex-nowrap md:items-center md:gap-4">
                    {/* THE FIRST LINE BELOW `md`, and a pair of ordinary flex
                        children above it. `md:contents` dissolves this box at
                        desktop so the checkbox and the title are direct children
                        of the row again and the drawn table is unchanged; below
                        `md` it is what gives the title the full width instead of
                        whatever four fixed columns leave over. */}
                    <div className="flex w-full min-w-0 items-center gap-4 md:contents">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() =>
                          setChecked((c) => {
                            const next = { ...c }
                            if (next[r.key]) delete next[r.key]
                            else next[r.key] = true
                            return next
                          })
                        }
                        aria-label={t('wlSelectRow')}
                        aria-pressed={!!checked[r.key]}
                        className="touch-44 flex h-[18px] w-[18px] flex-none cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] p-0 text-[11px] font-bold"
                        style={{
                          borderColor: checked[r.key] ? 'var(--ink)' : 'var(--line)',
                          background: checked[r.key] ? 'var(--ink)' : 'transparent',
                          color: checked[r.key] ? 'var(--sf)' : 'transparent',
                        }}
                      >
                        ✓
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : r.key)}
                      aria-expanded={isOpen}
                      /* `touch-44`, and the measurement is why: a COMMENT row
                         has a title and a source and no progress bar, so this
                         button paints 38px tall and `verify:responsive` reported
                         it five times at 320px. The overlay grows the hit area
                         to 44 without touching the painted box — RESPONSIVE.md
                         rule 2, and rule 3 is why the padding is not raised
                         instead. */
                      className={`${COL.task} touch-44 cursor-pointer border-none bg-transparent p-0 text-left`}
                    >
                      <span className="block truncate text-sm font-semibold">{r.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-mut">{r.source}</span>
                      {/* The bar renders for a task and NOT for a comment: v5
                          draws `handled ? 100 : 20` on a comment row, and 20 is
                          an invented denominator over an unknown numerator. */}
                      {pct !== null ? (
                        <span className="mt-[7px] block h-[5px] max-w-[230px] overflow-hidden rounded-full bg-[var(--sf2)]">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${pct}%`, background: progressTint(facts(r)) }}
                          />
                        </span>
                      ) : null}
                    </button>
                    </div>

                    {/* THE META CLUSTER. Below `md` it wraps under the title and
                        each field sizes to its content; `md:contents` makes it
                        vanish at desktop so these four are direct children of
                        the row with their drawn widths. `touch-cluster` keeps
                        the 44px areas of the chips apart when they wrap —
                        globals.css has that arithmetic and it is the same
                        control class as every other chip rail on this screen. */}
                    <div className="touch-cluster flex flex-wrap items-center gap-x-3 gap-y-2 md:contents">
                    <span className={COL.type}>
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-bold md:whitespace-nowrap"
                        style={{ background: r.kind === 'task' ? 'var(--sf2)' : 'var(--ac2)' }}
                      >
                        {r.typeLabel}
                      </span>
                      {r.law ? (
                        <span className="mt-1 block truncate text-[10.5px] text-mut">{r.law}</span>
                      ) : null}
                    </span>
                    <span className={`${COL.due} text-[12.5px] text-mut md:whitespace-nowrap`}>
                      {/* The label travels with the value below `md`. Out of a
                          labelled column, «12. sep» or «—» on its own says
                          nothing — which is the half of RESPONSIVE.md's card
                          pattern that is about meaning rather than geometry. */}
                      <span className="uppercase tracking-[.09em] md:hidden">
                        {t('wlColDue')}{' '}
                      </span>
                      {r.dueLabel ?? t('wlNoDue')}
                    </span>
                    <span className={COL.status}>
                      <span
                        className="rounded-full px-[11px] py-[5px] text-[11.5px] font-bold md:whitespace-nowrap"
                        style={{
                          background:
                            r.kind === 'comment'
                              ? isHandled(r)
                                ? '#E4F2E0'
                                : 'var(--ac3)'
                              : r.status === 'lukket'
                                ? '#E4F2E0'
                                : isLate(r.dueAt, r.status ?? 'foreslatt')
                                  ? 'var(--ac3)'
                                  : 'var(--sbg)',
                        }}
                      >
                        {r.kind === 'comment'
                          ? t(isHandled(r) ? 'fbStatusHandled' : 'fbStatusUnhandled')
                          : t(STEP_KEY[r.status!])}
                      </span>
                    </span>
                    <span className={`${COL.owner} flex items-center gap-[9px]`}>
                      {r.owner ? (
                        <>
                          <span
                            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                            style={{ background: 'var(--sbg)' }}
                          >
                            {r.owner.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                          </span>
                          <span className="truncate text-[13px]">{r.owner}</span>
                        </>
                      ) : (
                        <span className="truncate text-[13px] text-mut">
                          {r.kind === 'comment'
                            ? t(r.anonymous ? 'fbWhoAnon' : 'fbWhoNamed')
                            : t('taskOwnerNone')}
                        </span>
                      )}
                    </span>
                    </div>
                    <span className={`${COL.chev} hidden justify-end text-mut md:flex`}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        style={{ transform: `rotate(${isOpen ? 180 : 0}deg)` }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </div>

                  {isOpen ? (
                    <div className="px-[22px] pb-5 pt-1">
                      {r.kind === 'task' ? (
                        <>
                          {/* v5:3278-3282 — all six steps, filled to the current
                              one. That is the feature: a compliance record whose
                              point is that a duty was followed through shows the
                              path, not just where it stopped. */}
                          <div className="flex flex-wrap gap-1.5">
                            {TASK_STEPS.map((s, k) => (
                              <span
                                key={s}
                                className="rounded-full px-[11px] py-[5px] text-[11px] text-ink"
                                style={{
                                  background:
                                    k <= stepIndex(r.status!) ? 'var(--ac)' : 'var(--sf2)',
                                  fontWeight: k === stepIndex(r.status!) ? 700 : 500,
                                }}
                              >
                                {t(STEP_KEY[s])}
                              </span>
                            ))}
                          </div>

                          {r.corrects ? (
                            <div className="mt-2 text-xs text-mut">
                              {t('taskCorrects', { title: r.corrects })}
                            </div>
                          ) : null}

                          {canEdit ? (
                            <div className="mt-3.5 flex flex-wrap items-end gap-2.5">
                              <label className="block min-w-[170px] flex-[1_1_170px]">
                                <span className={`block ${HEAD}`}>{t('wlAssigned')}</span>
                                <select
                                  value={r.ownerMemberId ?? ''}
                                  disabled={busy}
                                  onChange={(e) =>
                                    run(
                                      () =>
                                        assignTasks({
                                          ids: [r.id],
                                          ownerMemberId: e.target.value || null,
                                        }),
                                      'wlSaved',
                                    )
                                  }
                                  className="touch-44-field [--field-pad-y:10px] mt-[5px] box-border w-full max-w-full rounded-[10px] border border-line bg-sf px-3 py-2.5 text-[13px] text-ink outline-none"
                                >
                                  <option value="">{t('wlNtOwnerNone')}</option>
                                  {memberOptions.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block min-w-[150px] flex-[1_1_150px]">
                                <span className={`block ${HEAD}`}>{t('wlDueLabel')}</span>
                                <input
                                  type="date"
                                  value={dueDraft[r.key] ?? r.dueAt ?? ''}
                                  disabled={busy}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setDueDraft((d) => ({ ...d, [r.key]: v }))
                                    run(() => setTaskDue({ ids: [r.id], dueAt: v || null }), 'wlSaved')
                                  }}
                                  className="touch-44-field [--field-pad-y:10px] mt-[5px] box-border w-full max-w-full rounded-[10px] border border-line bg-sf px-3 py-2.5 text-[13px] text-ink outline-none"
                                />
                              </label>
                              {nextStep(r.status!) && !blockedOnAssessment(r) ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const to = nextStep(r.status!)!
                                    // The last step asks first; every other step does not.
                                    if (to === 'lukket') return setClosing(r.key)
                                    run(() => advanceTask({ id: r.id, to }), 'wlSaved')
                                  }}
                                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-[17px] py-[11px] text-[12.5px] font-bold text-ink"
                                >
                                  {t('taskAdvance', { step: t(STEP_KEY[nextStep(r.status!)!]) })}
                                </button>
                              ) : null}
                              {r.status !== 'lukket' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setClosing(r.key)}
                                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[17px] py-[11px] text-[12.5px] font-semibold text-ink"
                                >
                                  {t('wlCloseTask')}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

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

                          {closing === r.key ? (
                            /* Q97 — closing is final, and an error is corrected
                               by a NEW task referencing this one. The remedy is
                               real (`corrects_task_id`), because a screen
                               promising one the schema cannot express is the
                               defect this surface has already hit twice. */
                            <div className="mt-3 rounded-xl border border-line bg-sbg px-4 py-3.5">
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
                                    run(() => advanceTask({ id: r.id, to: 'lukket' }), 'wlSaved')
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
                        </>
                      ) : (
                        <>
                          {r.question ? (
                            <div className="text-[12.5px] leading-[1.5] text-mut">
                              {t('fbToQuestion')} {r.question}
                            </div>
                          ) : (
                            <div className="text-[12.5px] leading-[1.5] text-mut">
                              {t('fbAboutSurvey')}
                            </div>
                          )}
                          <div className="mt-1.5 text-[12.5px] leading-[1.5] text-mut">
                            {t(
                              !r.hasThread
                                ? 'fbReplyNoThread'
                                : r.anonymous
                                  ? 'fbReplyNoteAnon'
                                  : 'fbReplyNoteNamed',
                            )}
                          </div>
                          {replies.length > 0 ? (
                            <div className="mt-3 flex flex-col gap-2">
                              {replies.map((rp, k) => (
                                <div key={k} className="rounded-xl bg-sbg px-3.5 py-[11px]">
                                  <div className="text-[12.5px] leading-[1.5]">{rp.text}</div>
                                  <div className="mt-1 text-[11px] text-mut">{rp.dateLabel}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {canEdit && r.hasThread ? (
                            <>
                              <textarea
                                rows={2}
                                value={replyDraft[r.key] ?? ''}
                                onChange={(e) =>
                                  setReplyDraft((d) => ({ ...d, [r.key]: e.target.value }))
                                }
                                placeholder={t('fbReplyPlaceholder')}
                                aria-label={t('fbReplyPlaceholder')}
                                className="box-border mt-3 w-full max-w-full resize-y rounded-[11px] border border-line bg-sf px-3.5 py-[11px] text-[13px] leading-[1.5] text-ink outline-none"
                              />
                              <div className="mt-2.5 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const body = (replyDraft[r.key] ?? '').trim()
                                    if (!body) return
                                    start(async () => {
                                      const res = await replyToComment({ commentId: r.id, body })
                                      if (!res.ok) {
                                        setNote(null)
                                        setError(t('fbReplyFailed'))
                                        return
                                      }
                                      setSentReplies((m) => ({
                                        ...m,
                                        [r.key]: [...(m[r.key] ?? []), { text: body, dateLabel: '' }],
                                      }))
                                      // Replying marks it handled (M:0102), so
                                      // the row must say so too.
                                      setHandledNow((h) => ({ ...h, [r.key]: true }))
                                      setReplyDraft((d) => ({ ...d, [r.key]: '' }))
                                      setError(null)
                                      setNote(t('wlSaved'))
                                    })
                                  }}
                                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-[17px] py-2.5 text-[12.5px] font-bold text-ink"
                                >
                                  {t('fbReplySend')}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const next = !isHandled(r)
                                    setHandledNow((h) => ({ ...h, [r.key]: next }))
                                    start(async () => {
                                      const res = await setCommentHandled({
                                        commentId: r.id,
                                        handled: next,
                                      })
                                      if (!res.ok) {
                                        // Put it back. A queue showing a row as
                                        // handled when the database says
                                        // otherwise is worse than one that
                                        // fails loudly.
                                        setHandledNow((h) => ({ ...h, [r.key]: !next }))
                                        setNote(null)
                                        setError(t('fbHandledFailed'))
                                      }
                                    })
                                  }}
                                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-ink"
                                >
                                  {t(isHandled(r) ? 'fbMarkUnhandled' : 'fbMarkHandled')}
                                </button>
                              </div>
                            </>
                          ) : null}
                          {/* v5:3316 draws «Lag tiltak» here. Not built, and the
                              reason is unchanged from C4: what a task may
                              CONTAIN when its source is a respondent's own words
                              is Q72's question on a register a `leser` reads in
                              full. That is a decision about disclosure, not a
                              wiring job. The sentence says so rather than the
                              control vanishing. */}
                          <p className="mt-2.5 text-[11.5px] leading-[1.5] text-mut">
                            {t('fbNoTaskYet')}
                          </p>
                        </>
                      )}

                      {/* v5:3324-3348 — «Interne notater», on both halves. */}
                      <div className="mt-4 border-t border-line pt-3.5">
                        <div className={HEAD}>{t('wlNotes')}</div>
                        {notes.length > 0 ? (
                          <div className="mt-2 flex flex-col gap-2">
                            {notes.map((n) => (
                              <div key={n.id} className="rounded-[11px] bg-sf2 px-3.5 py-2.5">
                                <div className="text-[12.5px] leading-[1.5]">{n.text}</div>
                                <div className="mt-1 text-[11px] text-mut">
                                  {t('wlNoteBy', {
                                    who: n.who ?? t('wlNoteByUnknown'),
                                    when: n.dateLabel,
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {canEdit ? (
                          <div className="mt-2.5 flex flex-wrap gap-[9px]">
                            <input
                              value={noteDraft[r.key] ?? ''}
                              onChange={(e) =>
                                setNoteDraft((d) => ({ ...d, [r.key]: e.target.value }))
                              }
                              placeholder={t('wlNotePlaceholder')}
                              aria-label={t('wlNotes')}
                              className="touch-44-field [--field-pad-y:10px] box-border min-w-0 max-w-full flex-[1_1_220px] rounded-[10px] border border-line bg-sf px-3.5 py-2.5 text-[13px] text-ink outline-none"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                const body = (noteDraft[r.key] ?? '').trim()
                                if (!body) return setError(t('wlNoteNeedBody'))
                                start(async () => {
                                  const res = await addWorklistNote(
                                    r.kind === 'task'
                                      ? { taskId: r.id, body }
                                      : { commentId: r.id, body },
                                  )
                                  if (!res.ok) {
                                    setNote(null)
                                    setError(t(TASK_ERROR_KEY[res.error]))
                                    return
                                  }
                                  setAddedNotes((m) => ({
                                    ...m,
                                    [r.key]: [
                                      ...(m[r.key] ?? []),
                                      { id: `local-${Date.now()}`, text: body, who: null, dateLabel: '' },
                                    ],
                                  }))
                                  setNoteDraft((d) => ({ ...d, [r.key]: '' }))
                                  setError(null)
                                  setNote(t('wlNoteSaved'))
                                })
                              }}
                              className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-ink"
                            >
                              {t('wlNoteSave')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </>
        ) : (
          /* v5:3356-3372 — the board. FIVE columns rather than four: the
             bundle's `i === 3 ? 2 : 3` puts `effektvurdert` under «Lukket», and
             that is the one distinction Q69 exists to protect. The grid is
             `auto-fit,minmax(210px,1fr)`, which renders five as readily as
             four. */
          <div className="grid gap-3 border-t border-line px-[22px] pb-[22px] pt-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))]">
            {WORKLIST_COLUMNS.map((col) => {
              const cards = shown.filter((r) => columnOf(facts(r)) === col)
              return (
                <div key={col} className="min-w-0">
                  <div
                    className="flex items-center justify-between gap-2 rounded-[11px] px-3 py-2"
                    style={{ background: COLUMN_TINT[col] }}
                  >
                    <span className="truncate text-xs font-bold">{t(COLUMN_KEY[col])}</span>
                    <span className="text-[11.5px] font-bold">{cards.length}</span>
                  </div>
                  <div className="mt-2.5 flex flex-col gap-[9px]">
                    {cards.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setOpen(open === r.key ? null : r.key)}
                        className="touch-44 block w-full min-w-0 cursor-pointer rounded-xl border-[1.5px] bg-sf px-3.5 py-3 text-left text-ink"
                        style={{ borderColor: open === r.key ? 'var(--ink)' : 'var(--line)' }}
                      >
                        <span className="block text-[12.5px] font-semibold leading-[1.35]">
                          {r.title}
                        </span>
                        <span className="mt-[5px] block truncate text-[11px] text-mut">
                          {r.kind === 'task'
                            ? `${r.owner ?? t('taskOwnerNone')} · ${r.dueLabel ?? t('wlNoDue')}`
                            : r.source}
                        </span>
                        {r.law ? (
                          <span className="mt-[7px] inline-block rounded-full bg-ac3 px-2.5 py-[3px] text-[10px] font-bold leading-[1.3]">
                            {r.law}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </main>
  )
}
