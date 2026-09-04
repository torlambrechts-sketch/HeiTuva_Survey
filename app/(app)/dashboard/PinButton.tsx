'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { togglePin } from './actions'

/**
 * "Legg i rapport" / "I rapporten ✓" — HeiTuva.dc.html:858, 3051.
 *
 * The pin persists (see `dashboard_pins`), so the label is the stored state
 * rather than local component state: a reload shows the same pins, which is the
 * whole reason the table exists.
 */
export function PinButton({
  panelKey,
  pinned,
  labelOn,
  labelOff,
}: {
  panelKey: string
  pinned: boolean
  labelOn: string
  labelOff: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={pinned}
      onClick={() =>
        startTransition(async () => {
          const r = await togglePin(panelKey)
          if (r.ok) router.refresh()
        })
      }
      className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-full border px-[13px] py-[7px] text-[12px] font-semibold text-ink"
      style={{
        borderColor: pinned ? 'var(--ink)' : 'var(--line)',
        background: pinned ? 'var(--sbg)' : 'transparent',
      }}
    >
      {pinned ? labelOn : labelOff}
    </button>
  )
}
