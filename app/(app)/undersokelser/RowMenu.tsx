'use client'

import Link from 'next/link'
import { NewReportButton } from '../rapporter/ReportRowActions'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { DELETE_FG, type ShareScope, type SurveyStatus } from './keys'
import { closeSurvey, copyAsNewRound, deleteSurvey } from './actions'
import { setSchedulePaused, stopSchedule } from './[id]/send/actions'

/**
 * F4 — THE ROW MENU, EXTRACTED RATHER THAN DROPPED.
 *
 * This was the tail of `SurveyRow`, the single list row the app had before the
 * three views. The drawing's table gives a row five icon buttons and no menu
 * (v6:2339-2352), so building the three views to the drawing would have DELETED
 * six actions that only exist here: share, copy as a new round, close, delete,
 * pause the series and stop it.
 *
 * **A control removed from the one place it exists is a feature deleted**, which
 * is the rule V4-0 used the other way round when «Ny undersøkelse» left the
 * header — there it was checked that both destinations already existed. Here
 * they did not, so the menu moves into the two views the drawing gives actions
 * to (the table's «Handling» column and the detail panel) and the card grid,
 * which the drawing gives none, gets none.
 *
 * Nothing inside is new. The handlers, the click-away, the Escape key and the
 * failure alert are `SurveyRow`'s, moved unchanged.
 */
export type RowMenuSurvey = {
  id: string
  title: string
  status: SurveyStatus
  scope: ShareScope
  kThreshold: number
  respondentKind: 'person' | 'organisation'
  schedulePaused: boolean
}

export type RowMenuLabels = {
  moreOptions: string
  menuEdit: string; menuSend: string; menuResults: string; menuReport: string
  menuAnswer: string; menuShare: string; menuCopy: string; menuClose: string; menuDelete: string
  menuPause: string; menuStop: string; stopConfirm: string
  failed: string
  /**
   * The recurrence sentence, or EMPTY when the survey has no series.
   *
   * It is a label and a condition at once: the two pause/stop items are drawn
   * only when it is non-empty, «so it doubles as the condition rather than a
   * second flag that could disagree with the chip» — `SurveyRow`'s own
   * reasoning, carried over with the code. The chip that displays it lives on
   * the row; this component only asks whether there is one.
   */
  recurrence: string
}

// The rows are ~37px tall in a gap-[2px] stack, so their 44px touch areas
// overlapped by 505px² — a thumb aimed at "Resultater" could land on "Lag
// rapport". The row keeps its painted size; only the spacing grows, below md.
const menuItem =
  'touch-44 mb-[7px] cursor-pointer rounded-[9px] border-none bg-transparent px-3 py-[10px] text-left text-[13px] text-ink no-underline last:mb-0 md:mb-0'

export function RowMenu({
  survey,
  canEdit,
  shareHref,
  labels,
}: {
  survey: RowMenuSurvey
  canEdit: boolean
  shareHref: string
  labels: RowMenuLabels
}) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const wrap = useRef<HTMLDivElement>(null)

  // A menu that only closes on its own trigger is a trap: click-away and Escape
  // are how people expect to leave one. Its links close it explicitly too —
  // they navigate client-side, so React reuses this component and `open` would
  // otherwise survive the navigation.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function run(action: () => Promise<{ ok: boolean }>) {
    setOpen(false)
    setFailed(false)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setFailed(true)
      else router.refresh()
    })
  }

  return (
    <div ref={wrap} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${labels.moreOptions}: ${survey.title}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="touch-44 flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[9px] border border-line bg-transparent text-base leading-none text-ink"
      >
        ···
      </button>

      {failed ? (
        <p role="alert" className="absolute right-0 top-[34px] z-[6] whitespace-nowrap rounded-lg border border-line bg-sf px-2 py-1 text-[12.5px] font-semibold text-ink">
          {labels.failed}
        </p>
      ) : null}

      {open ? (
        <div
          role="menu"
          /* N9 — RIGHT-ANCHORED AT EVERY WIDTH, AND THE OLD COMMENT STATED THE
             INTENT THIS NOW HAS.

             It read «below md the row is narrower than the menu's 220px, so it
             anchors to the row's left edge instead of overflowing the
             viewport» — and `left-4` is 16px from THIS SPAN, the trigger's
             wrapper, not from the row. Measured at 390px: the wrapper sits at
             x=271, so the menu ran 287 -> 507 and overflowed the viewport by
             **117px**. The reason was sound and the offset parent was not the
             one the sentence assumed.

             `verify:responsive` found it as two hit-area overlaps on
             `undersokelser/row-menu` — «Slett» against the icons of the rows
             BELOW, 204px² and 748px². The mechanism is the menu's left edge
             landing between the two icons (271-301 and 317-347): the left one's
             centre at x=286 falls one pixel outside the menu, so it is not
             occluded, stays in the count, and pairs with the menu item over it.
             A dropdown covering what is beneath it is normal and the gate's
             occlusion rule forgives it; a dropdown whose EDGE bisects a control
             is not.

             Right-anchored, the menu spans 81 -> 301 at 390px: inside the
             viewport, and the icons below are either fully covered (centre
             occluded, correctly skipped) or fully clear. One rule for both
             breakpoints instead of two, which is also why `md:left-auto` is
             gone — there is no left to undo. */
          className="absolute right-0 top-[64px] z-[5] flex min-w-[220px] flex-col gap-[2px] rounded-[14px] border border-line bg-sf p-2 md:right-[22px]"
          style={{ boxShadow: '0 14px 34px rgba(25,21,16,.14)' }}
        >
          <Link
            href={`/undersokelser/${survey.id}/bygg`}
            role="menuitem"
            className={menuItem}
            onClick={() => setOpen(false)}
          >
            {labels.menuEdit}
          </Link>
          <Link
            href={`/undersokelser/${survey.id}/send`}
            role="menuitem"
            className={menuItem}
            onClick={() => setOpen(false)}
          >
            {labels.menuSend}
          </Link>
          <Link
            href={`/undersokelser/${survey.id}/resultater`}
            role="menuitem"
            className={menuItem}
            onClick={() => setOpen(false)}
          >
            {labels.menuResults}
          </Link>
          {/* "Lag rapport" creates the report and opens the editor with this
              survey already in the filter. The design has no per-survey report
              route — the editor is a state of /rapporter — so a link here would
              be a link to a screen that does not exist (D62). */}
          <NewReportButton
            label={labels.menuReport}
            title={survey.title}
            baseTemplate={null}
            sections={['summary', 'teams']}
            surveys={[survey.id]}
            role="menuitem"
            className={menuItem}
          />
          <Link
            href={`/undersokelser/${survey.id}/test`}
            role="menuitem"
            className={menuItem}
            onClick={() => setOpen(false)}
          >
            {labels.menuAnswer}
          </Link>

          {canEdit ? (
            <>
              <div className="my-1 h-px" style={{ background: 'var(--line)' }} />
              <Link
                href={shareHref}
                role="menuitem"
                className={`${menuItem} font-semibold`}
                onClick={() => setOpen(false)}
              >
                {labels.menuShare}
              </Link>
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => run(() => copyAsNewRound(survey.id))}
                className={`${menuItem} font-semibold disabled:opacity-60`}
              >
                {labels.menuCopy}
              </button>
              {/* NEW:899-902 — «Pause gjentakelsen» / «Stopp gjentakelsen».
                  Drawn only when there IS a series: a menu item that does
                  nothing on most rows teaches people to stop reading the menu.
                  `labels.recurrence` is empty exactly when no schedule exists,
                  so it doubles as the condition rather than a second flag that
                  could disagree with the chip. */}
              {labels.recurrence && survey.status === 'aktiv' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => run(() => setSchedulePaused(survey.id, !survey.schedulePaused))}
                    className={`${menuItem} disabled:opacity-60`}
                  >
                    {labels.menuPause}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => {
                      // Stop is not reversible (Q22). Same confirmation as the
                      // Send screen's, from the same message — two wordings for
                      // one irreversible act is how one of them ends up softer.
                      if (!window.confirm(labels.stopConfirm)) return
                      run(() => stopSchedule(survey.id))
                    }}
                    className={`${menuItem} disabled:opacity-60`}
                  >
                    {labels.menuStop}
                  </button>
                </>
              ) : null}
              {survey.status === 'aktiv' ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={() => run(() => closeSurvey(survey.id))}
                  className={`${menuItem} disabled:opacity-60`}
                >
                  {labels.menuClose}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => run(() => deleteSurvey(survey.id))}
                className={`${menuItem} disabled:opacity-60`}
                style={{ color: DELETE_FG }}
              >
                {labels.menuDelete}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
