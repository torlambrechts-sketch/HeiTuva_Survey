'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { replyToComment, setCommentHandled } from './actions'

/**
 * C4 — «Tilbakemeldinger på undersøkelsene» (V3:2238-2300).
 *
 * ── WHAT THIS ROW DOES NOT SHOW, AND WHY ───────────────────────────────────
 *
 * The bundle's row carries a `tag` — one of «Ny», «Samtale», «Resultater»,
 * «Ros», «Spørsmålene», «Utsending». Q116: there is no `tag` column, because
 * only two of those six are facts about the row and the other four would need a
 * classifier this product does not have. A column read on a screen and written
 * by nothing is the standing question's fifth instance, and «derive, do not
 * duplicate» (Q61) applies at the schema and not only at the screen.
 *
 * So two are DERIVED and rendered — «Ubehandlet» is `handled_at is null`,
 * «Samtale» is having replies — and four are not rendered at all. A reviewer
 * comparing this to the drawing will count fewer chips; the reason is here and
 * in D160 rather than left to be asked about.
 *
 * ── AND ONE BUTTON THE BUNDLE DRAWS THAT IS DELIBERATELY DISABLED ──────────
 *
 * «Lag oppgave». Building it means deciding what a task may CONTAIN when its
 * source is a respondent's own words — Q72's question, on a register a `leser`
 * can read in full. That is a decision about disclosure, not a wiring job, so it
 * is not taken in a UI phase. The button says why rather than vanishing: a
 * control that disappears teaches nothing, and this one has a real reason.
 */
export type FeedbackRow = {
  id: string
  text: string
  /** The question this comment is about. NULL is the end-of-survey box — a real
   *  state, not a missing value, so it is rendered as one. */
  question: string | null
  surveyId: string | null
  survey: string
  dateLabel: string
  handled: boolean
  anonymous: boolean
  replies: { text: string; dateLabel: string }[]
  /** C5 — whether there is anybody to reply TO. A comment written through a
   *  share link has no invitation, so `get_comment_thread` can never hand the
   *  reply back: every holder of that link is the same principal. The row says
   *  so instead of offering a control that writes into nowhere. */
  hasThread: boolean
}

const FILTERS = ['alle', 'ubehandlet', 'samtale'] as const
const FILTER_KEY: Record<(typeof FILTERS)[number], string> = {
  alle: 'fbFilterAll',
  ubehandlet: 'fbFilterUnhandled',
  samtale: 'fbFilterConversation',
}

export function FeedbackList({
  rows,
  surveyOptions,
  canEdit,
}: {
  rows: FeedbackRow[]
  surveyOptions: { id: string; title: string }[]
  canEdit: boolean
}) {
  const t = useTranslations('tasks')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('alle')
  const [survey, setSurvey] = useState<string>('')
  const [handled, setHandled] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const [replyOpen, setReplyOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  /** Replies added in this session, shown under the row without a reload so the
   *  manager sees what they just sent. Server state is the truth on the next
   *  render; this is only what has happened since. */
  const [sent, setSent] = useState<Record<string, { text: string; dateLabel: string }[]>>({})

  const isHandled = (r: FeedbackRow) => handled[r.id] ?? r.handled

  const shown = rows.filter((r) => {
    if (survey && r.surveyId !== survey) return false
    if (filter === 'ubehandlet') return !isHandled(r)
    if (filter === 'samtale') return r.replies.length > 0
    return true
  })

  const unhandled = rows.filter((r) => !isHandled(r)).length

  function send(r: FeedbackRow) {
    const body = draft.trim()
    if (!body) return
    setNote(null)
    start(async () => {
      const res = await replyToComment({ commentId: r.id, body })
      if (!res.ok) {
        setNote(t('fbReplyFailed'))
        return
      }
      setSent((m) => ({ ...m, [r.id]: [...(m[r.id] ?? []), { text: body, dateLabel: '' }] }))
      // Replying marks it handled in the database (M:0102), so the row must say
      // so too — otherwise the screen disagrees with the table it is showing.
      setHandled((h) => ({ ...h, [r.id]: true }))
      setDraft('')
      setReplyOpen(null)
    })
  }

  function toggle(r: FeedbackRow) {
    const next = !isHandled(r)
    setNote(null)
    setHandled((h) => ({ ...h, [r.id]: next }))
    start(async () => {
      const res = await setCommentHandled({ commentId: r.id, handled: next })
      if (!res.ok) {
        // Put it back. A queue that shows a row as handled when the database
        // says otherwise is worse than one that fails loudly.
        setHandled((h) => ({ ...h, [r.id]: !next }))
        setNote(t('fbHandledFailed'))
      }
    })
  }

  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-base font-semibold">{t('fbHeading')}</h2>
          {unhandled > 0 ? (
            <span
              className="rounded-full px-2.5 py-[3px] text-[11px] font-bold"
              style={{ background: 'var(--ac3)' }}
            >
              {t('fbUnhandled', { n: unhandled })}
            </span>
          ) : null}
        </div>
        {/* RESPONSIVE.md § Data tables, narrow row: the controls in THIS row are
            counted rather than trusted to a sentence — a select and three chips,
            four in total, so they wrap rather than becoming a card. The chip
            rail's own row gap keeps the 44px hit areas apart when it wraps,
            which is the same treatment the task filters above use. */}
        <div className="flex flex-wrap items-center gap-2">
          {surveyOptions.length > 1 ? (
            <select
              value={survey}
              onChange={(e) => setSurvey(e.target.value)}
              aria-label={t('fbAllSurveys')}
              /* `touch-44-field`, NOT `touch-44`. A <select> is a REPLACED
                 element and `::after` does not render on it, so the overlay
                 utility paints nothing — the control measured 189x36 and the
                 gate reported it. globals.css says exactly this, two utilities
                 apart, and I reached for the wrong one. `--field-pad-y` keeps
                 the painted height identical while the hit box grows. */
              className="touch-44-field [--field-pad-y:8px] box-border rounded-[10px] border border-line bg-sf px-[11px] py-2 text-[12.5px] text-ink outline-none"
            >
              <option value="">{t('fbAllSurveys')}</option>
              {surveyOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          ) : null}
          {/* gap-y-14, not 13. globals.css writes the arithmetic out: a 30px
              painted control with a 44px hit area overflows (44-30)/2 = 7px
              each side, so two stacked ones need 14px between painted edges.
              These chips are `py-[7px]` (30px); the 13px I copied was computed
              for the `py-2` (40px) rail above, where 2px of overflow makes it
              ample. A spacing value is an enumeration of the control it was
              measured against. */}
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
      </div>

      <p className="mt-1.5 text-[12.5px] leading-[1.5] text-mut">{t('fbLead')}</p>

      {note ? (
        <p role="alert" className="mt-3 rounded-[11px] bg-ac3 px-3.5 py-2.5 text-[13px]">
          {note}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-3.5 text-[13px] text-mut">{t('fbNone')}</p>
      ) : shown.length === 0 ? (
        <p className="mt-3.5 text-[13px] text-mut">{t('fbNoMatch')}</p>
      ) : null}

      <div className="mt-3.5 flex flex-col gap-2.5">
        {shown.map((r) => (
          <article key={r.id} className="rounded-[16px] border border-line bg-sf px-5 py-4">
            <div className="flex flex-wrap items-start gap-3.5">
              <div className="min-w-[240px] flex-1">
                <div className="mb-[5px] text-[11.5px] text-mut">
                  {r.question ? (
                    <>
                      {t('fbToQuestion')} <span className="font-semibold text-ink">{r.question}</span>
                    </>
                  ) : (
                    t('fbAboutSurvey')
                  )}
                </div>
                <p className="text-[14.5px] leading-[1.55]">«{r.text}»</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-[3px] text-[11px] font-bold"
                    style={{ background: r.anonymous ? 'var(--sf2)' : 'var(--ac2)' }}
                  >
                    {r.anonymous ? t('fbWhoAnon') : t('fbWhoNamed')}
                  </span>
                  <span className="text-xs text-mut">
                    {r.survey} · {r.dateLabel}
                  </span>
                </div>
              </div>
              <span
                className="whitespace-nowrap rounded-full px-3 py-[5px] text-[11.5px] font-bold"
                style={{ background: isHandled(r) ? 'var(--ac2)' : 'var(--ac3)' }}
              >
                {isHandled(r) ? t('fbStatusHandled') : t('fbStatusUnhandled')}
              </span>
              {canEdit ? (
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled
                    title={t('fbNoTaskYet')}
                    className="cursor-not-allowed whitespace-nowrap rounded-[10px] border-none bg-ac px-3.5 py-[9px] text-[12.5px] font-semibold text-ink opacity-45"
                  >
                    {t('fbMakeTask')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(r)}
                    disabled={busy}
                    className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-3.5 py-[9px] text-[12.5px] font-semibold text-ink"
                  >
                    {isHandled(r) ? t('fbMarkUnhandled') : t('fbMarkHandled')}
                  </button>
                  {r.hasThread ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft('')
                        setReplyOpen(replyOpen === r.id ? null : r.id)
                      }}
                      className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-ink bg-transparent px-3.5 py-[9px] text-[12.5px] font-semibold text-ink"
                    >
                      {t('fbReply')}
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>

            {[...r.replies, ...(sent[r.id] ?? [])].length ? (
              <div
                className="mt-3.5 flex flex-col gap-2 pl-4"
                style={{ borderLeft: '2px solid var(--ac2)' }}
              >
                {[...r.replies, ...(sent[r.id] ?? [])].map((rep, i) => (
                  <div key={i} className="rounded-[11px] bg-bg px-3.5 py-[11px]">
                    <p className="text-[13.5px] leading-[1.5]">{rep.text}</p>
                    <p className="mt-1 text-[11.5px] text-mut">{rep.dateLabel}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {/* V3:3295-3305 — the composer. Shown only where a thread exists;
                where one does not, the row SAYS why rather than hiding the
                reason with the button. */}
            {!r.hasThread && canEdit ? (
              <p className="mt-3 text-[12px] leading-[1.45] text-mut">{t('fbReplyNoThread')}</p>
            ) : null}

            {replyOpen === r.id ? (
              <div className="mt-3 rounded-xl border border-line bg-bg p-3.5">
                <p className="text-[12.5px] leading-[1.5] text-mut">
                  {r.anonymous ? t('fbReplyNoteAnon') : t('fbReplyNoteNamed')}
                </p>
                <textarea
                  rows={3}
                  value={draft}
                  placeholder={t('fbReplyPlaceholder')}
                  aria-label={t('fbReply')}
                  onChange={(e) => setDraft(e.target.value)}
                  className="mt-2.5 box-border w-full resize-y rounded-[10px] border border-line bg-sf px-3.5 py-[11px] text-[13.5px] leading-[1.5] text-ink outline-none"
                />
                <div className="mt-2.5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReplyOpen(null)}
                    className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-3.5 py-[9px] text-[12.5px] font-semibold text-ink"
                  >
                    {t('fbReplyCancel')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    onClick={() => send(r)}
                    className="touch-44 cursor-pointer rounded-[10px] border-none bg-ink px-[18px] py-2.5 text-[12.5px] font-bold text-sf disabled:opacity-50"
                  >
                    {t('fbReplySend')}
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
