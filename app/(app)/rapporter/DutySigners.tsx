'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signDuty } from './actions'

type Signer = {
  role_key: string
  label: string
  member_id: string | null
  signed: boolean
  signed_at: string | null
  stale: boolean
}

/**
 * The signing panel — HeiTuva.dc.html:1001-1013.
 *
 * The prototype makes each row a toggle anybody can flip. Here the button only
 * appears for the person the slot is assigned to, and pressing it calls
 * `sign_duty`; the database refuses anyone else regardless (migration
 * 20260904000004). The client-side check is convenience, not the control.
 *
 * Three states, not two. "Signert" and "Venter" are the design's; the third is
 * `stale` — signed, but the report or the checklist changed afterwards, so the
 * signature no longer covers what the document says. Rendering that as a plain
 * green "Signert" is the failure the whole content hash exists to prevent, so
 * it gets its own chip in the warning tint.
 */
export function DutySigners({
  definitionKey,
  roles,
  signers,
  viewerMemberId,
  labels,
}: {
  definitionKey: string
  roles: { key: string; label: string; role: string }[]
  signers: Signer[]
  viewerMemberId: string
  labels: { heading: string; signed: string; stale: string; waiting: string; sign: string }
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const byRole = new Map(signers.map((s) => [s.role_key, s]))

  function sign(roleKey: string) {
    setBusy(roleKey)
    startTransition(async () => {
      const result = await signDuty(definitionKey, roleKey)
      setBusy(null)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-[.1em] text-mut">{labels.heading}</div>
      {roles.map((r) => {
        const s = byRole.get(r.key)
        const mine = s?.member_id === viewerMemberId && !!s?.member_id
        const chip = s?.stale
          ? { text: labels.stale, background: 'var(--ac3)', color: 'var(--ink)' }
          : s?.signed
            ? { text: labels.signed, background: '#E4F2E0', color: '#2F5D2A' }
            : { text: labels.waiting, background: 'var(--sf2)', color: 'var(--mut)' }

        return (
          <div
            key={r.key}
            className="flex flex-wrap items-center gap-[11px] rounded-[11px] border border-line bg-bg px-3 py-[9px]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{r.label}</span>
              <span className="mt-[1px] block text-[11.5px] text-mut">{r.role}</span>
            </span>
            {/* The button is only offered to the assigned signer. Everyone else
                sees the state and no way to change it, which is what the
                database enforces anyway. */}
            {mine && (!s?.signed || s?.stale) ? (
              <button
                type="button"
                onClick={() => sign(r.key)}
                disabled={busy === r.key}
                className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[9px] bg-ac px-[13px] py-[7px] text-[11.5px] font-bold text-ink disabled:opacity-60"
              >
                {labels.sign}
              </button>
            ) : null}
            <span
              className="flex-none whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-bold"
              style={{ background: chip.background, color: chip.color }}
            >
              {chip.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}
