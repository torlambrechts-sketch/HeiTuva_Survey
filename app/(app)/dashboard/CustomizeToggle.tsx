'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * The «Tilpass» button — HeiTuva.dc.html:936, 3657.
 *
 * The card's open state is a URL parameter rather than component state, for the
 * same reason the filters are: the dashboard is a server render, and a shared
 * link should reproduce what the sender was looking at — including the card
 * they had open. It also means the capture harness can reach the state without
 * a click path that depends on hydration.
 */
export function CustomizeToggle({ label, open }: { label: string; open: boolean }) {
  const router = useRouter()
  const params = useSearchParams()

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => {
        const next = new URLSearchParams(params.toString())
        if (open) next.delete('tilpass')
        else next.set('tilpass', 'data')
        const q = next.toString()
        router.push(q ? `/dashboard?${q}` : '/dashboard', { scroll: false })
      }}
      /* N6 · v8:2645 — `height:34px · padding:0 13px · 12.5px/600`. v7 drew the
         same control two pixels taller and one wider; v8 tightens the whole
         filter row. Height with `padding:0` rather than `py-`, as the bundle
         writes it — see FreezeButton for why the two are not interchangeable. */
      className="touch-44 flex h-[34px] cursor-pointer items-center gap-2 rounded-[10px] border border-line px-[13px] text-[12.5px] font-semibold text-ink"
      style={{ background: open ? 'var(--sbg)' : 'transparent' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h10M4 18h6" />
        <circle cx="17" cy="12" r="2" />
        <circle cx="13" cy="18" r="2" />
      </svg>
      {label}
    </button>
  )
}
