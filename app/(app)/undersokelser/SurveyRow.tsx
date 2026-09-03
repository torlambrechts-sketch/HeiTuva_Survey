'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { DELETE_FG, PRIMARY_ACTION, STATUS_COLORS, type ShareScope, type SurveyStatus } from './keys'
import { closeSurvey, copyAsNewRound, deleteSurvey } from './actions'

export type SurveyListItem = {
  id: string
  title: string
  audience: string | null
  status: SurveyStatus
  scope: ShareScope
  target: number | null
  questionCount: number
  responseCount: number
  editorCount: number
  createdAt: string
  updatedAt: string
}

type Labels = {
  primaryDraft: string; primaryActive: string; primaryClosed: string
  moreOptions: string
  menuEdit: string; menuSend: string; menuResults: string; menuReport: string
  menuAnswer: string; menuShare: string; menuCopy: string; menuClose: string; menuDelete: string
  statusDraft: string; statusActive: string; statusClosed: string
  responses: string; sharedWith: string; failed: string
}

const menuItem =
  'touch-44 cursor-pointer rounded-[9px] border-none bg-transparent px-3 py-[10px] text-left text-[13px] text-ink no-underline'

/**
 * One survey row (HeiTuva.dc.html:766-801).
 *
 * A client component only because of the ··· menu and the three destructive
 * actions. Everything that is navigation is a `Link`, so the row works before
 * hydration and middle-click opens a new tab.
 */
export function SurveyRow({
  survey,
  canEdit,
  shareHref,
  labels,
}: {
  survey: SurveyListItem
  canEdit: boolean
  shareHref: string
  labels: Labels
}) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const wrap = useRef<HTMLDivElement>(null)

  // A menu that only closes on its own trigger is a trap: click-away and Escape
  // are how people expect to leave one.
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

  const status = STATUS_COLORS[survey.status]
  const statusLine =
    survey.status === 'utkast'
      ? labels.statusDraft
      : survey.status === 'aktiv'
        ? labels.statusActive
        : labels.statusClosed
  const primary = PRIMARY_ACTION[survey.status]
  const primaryLabel =
    survey.status === 'utkast'
      ? labels.primaryDraft
      : survey.status === 'aktiv'
        ? labels.primaryActive
        : labels.primaryClosed

  const pct =
    survey.target && survey.target > 0
      ? Math.min(100, Math.round((survey.responseCount / survey.target) * 100))
      : 0

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
    <div
      ref={wrap}
      className="relative rounded-2xl border-[1.5px] border-line bg-sf px-[22px] py-[18px]"
    >
      <div className="flex flex-wrap items-center gap-[14px]">
        <span
          className="whitespace-nowrap rounded-full px-[13px] py-[6px] text-xs font-bold"
          style={{ background: status.bg, color: status.fg }}
        >
          {statusLine}
        </span>
        <span className="min-w-full flex-1 md:min-w-[200px]">
          <span className="block font-display text-[20px] font-medium">{survey.title}</span>
          <span className="mt-[2px] block text-[13px] text-mut">
            {[survey.audience, `v1`].filter(Boolean).join(' · ')}
          </span>
          {labels.sharedWith ? (
            <span className="mt-[6px] inline-block rounded-full bg-ac2 px-[10px] py-1 text-[11.5px] font-semibold">
              {labels.sharedWith}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/undersokelser/${survey.id}/${primary.path}`}
            className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-[18px] py-[10px] text-[12.5px] font-semibold text-ink no-underline"
          >
            {primaryLabel}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={labels.moreOptions}
            aria-expanded={open}
            aria-haspopup="menu"
            className="touch-44 h-[38px] w-[38px] cursor-pointer rounded-[10px] border border-line bg-transparent text-base leading-none text-ink"
          >
            ···
          </button>
        </span>
      </div>

      <div className="mt-[14px] flex items-center gap-[14px]">
        <span
          className="block h-[9px] flex-1 overflow-hidden rounded-full"
          style={{ background: 'var(--sf2)' }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={labels.responses}
        >
          <span className="block h-full rounded-full bg-ac" style={{ width: `${pct}%` }} />
        </span>
        <span className="whitespace-nowrap text-[13px] text-mut">{labels.responses}</span>
      </div>

      {failed ? (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-ink">
          {labels.failed}
        </p>
      ) : null}

      {open ? (
        <div
          role="menu"
          // Below md the row is narrower than the menu's 220px, so it anchors to
          // the row's left edge instead of overflowing the viewport.
          className="absolute left-4 top-[64px] z-[5] flex min-w-[220px] flex-col gap-[2px] rounded-[14px] border border-line bg-sf p-2 md:left-auto md:right-[22px]"
          style={{ boxShadow: '0 14px 34px rgba(25,21,16,.14)' }}
        >
          <Link href={`/undersokelser/${survey.id}/bygg`} role="menuitem" className={menuItem}>
            {labels.menuEdit}
          </Link>
          <Link href={`/undersokelser/${survey.id}/send`} role="menuitem" className={menuItem}>
            {labels.menuSend}
          </Link>
          <Link href={`/undersokelser/${survey.id}/resultater`} role="menuitem" className={menuItem}>
            {labels.menuResults}
          </Link>
          <Link href={`/undersokelser/${survey.id}/rapport`} role="menuitem" className={menuItem}>
            {labels.menuReport}
          </Link>
          <Link href={`/undersokelser/${survey.id}/test`} role="menuitem" className={menuItem}>
            {labels.menuAnswer}
          </Link>

          {canEdit ? (
            <>
              <div className="my-1 h-px" style={{ background: 'var(--line)' }} />
              <Link href={shareHref} role="menuitem" className={`${menuItem} font-semibold`}>
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
