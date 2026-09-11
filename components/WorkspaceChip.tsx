'use client'

import { useTransition } from 'react'
import { setWorkspace } from '@/lib/workspace/actions'

export type WorkspaceOption = { key: string; label: string; short: string; tint: string; dot: string }

/**
 * V4:181-190 — the Arbeidsflate chip. A 34px pill carrying a colour dot, the
 * workspace's short name and a caret, with a transparent `<select>` laid over
 * it. The select IS the control; the pill is its face.
 *
 * ── THE TOOLTIP HAS TWO CLAUSES, NOT THE BUNDLE'S THREE (DECISIONS Q119) ──
 *
 * The bundle writes: «Arbeidsflate — velger hvilke moduler Oversikt viser,
 * sorterer maler og setter standardvalg for nye undersøkelser.»
 *
 * The third clause is not built and no column exists for it. Q17 makes a
 * statutory pack's policy a LOCK (`M:0032:96`) and a workspace a PREFERENCE,
 * and a preference cannot override a lock — so two writers of the same columns
 * with no defined order is a race, and it fails in exactly the case the HR
 * workspace exists for, where every serious survey carries a statutory pack.
 *
 * Tor, taking the decision: «Promising less than you do is fine; promising
 * more is what we have spent fifteen phases removing.» Making it true instead
 * of smaller is a separate decision with a guard behind it, and it needs its
 * own line — it is not to be taken here.
 */
export function WorkspaceChip({
  current,
  options,
  label,
  title,
}: {
  current: WorkspaceOption
  options: WorkspaceOption[]
  label: string
  title: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <span
      title={title}
      className="relative inline-flex h-[34px] flex-none items-center gap-[7px] rounded-full border border-line pl-[10px] pr-[11px]"
      style={{ background: current.tint, opacity: pending ? 0.6 : 1 }}
    >
      <span
        aria-hidden
        className="block h-[10px] w-[10px] flex-none rounded-[3px]"
        style={{ background: current.dot, pointerEvents: 'none' }}
      />
      <span className="pointer-events-none whitespace-nowrap text-[12.5px] font-semibold text-ink">
        {current.short}
      </span>
      <span aria-hidden className="pointer-events-none text-[9px] text-mut">
        ▾
      </span>
      {/* `touch-44-field`, not `touch-44`: a <select> is a REPLACED element and
          renders no ::after at all, which is how C4's FeedbackList select
          measured 189×36. The utility named for this case is the one to take. */}
      <select
        aria-label={label}
        value={current.key}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          startTransition(async () => {
            await setWorkspace(next)
          })
        }}
        className="touch-44-field absolute inset-0 box-border h-full w-full cursor-pointer appearance-none border-none bg-transparent font-[inherit] opacity-0"
      >
        {options.map((w) => (
          <option key={w.key} value={w.key}>
            {w.label}
          </option>
        ))}
      </select>
      {/* V4:186 — the change is announced, because the visible consequence is
          on a different part of the page than the control. */}
      <span aria-live="polite" className="sr-only">
        {`${label}: ${current.label}`}
      </span>
    </span>
  )
}
