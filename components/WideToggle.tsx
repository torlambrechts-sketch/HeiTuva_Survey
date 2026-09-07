'use client'

import { useEffect, useState } from 'react'

/**
 * "Full bredde" / "Smal visning" — HeiTuva.dc.html:181-183, 4007-4011.
 *
 * The frame is capped at 1120px; this releases the cap to the viewport width.
 * It is a per-viewer preference, not tenant state, so it lives in
 * `localStorage` exactly as the design does — nothing about it belongs in the
 * database.
 *
 * DECISIONS Q32: rendered at `xl` and above only. The cap does not bind until
 * 1192px, so below that the button would be a control that visibly does
 * nothing, which D26 settled is worse than one that is absent. RESPONSIVE.md
 * rule 4's own escape clause covers it and the deviation is logged (D89).
 *
 * The attribute is set before paint by the inline script in app/layout.tsx;
 * this component only reads it back so the label and the pressed state match
 * what the page is already showing.
 */
export function WideToggle({ wideLabel, narrowLabel }: { wideLabel: string; narrowLabel: string }) {
  const [wide, setWide] = useState(false)

  // Mount-time sync, not initial state: the server cannot know the preference,
  // so rendering it into the first HTML would be a hydration mismatch. The
  // pre-paint script has already applied the visual state by the time this
  // runs — this catches up the label.
  useEffect(() => {
    setWide(document.documentElement.dataset.wide === '1')
  }, [])

  const toggle = () => {
    const next = !wide
    setWide(next)
    if (next) document.documentElement.dataset.wide = '1'
    else delete document.documentElement.dataset.wide
    try {
      localStorage.setItem('heituva.wide', next ? '1' : '0')
    } catch {
      // A browser with site data blocked still gets the toggle for this page
      // view; only the memory of it is lost.
    }
  }

  const label = wide ? narrowLabel : wideLabel

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={wide}
      title={label}
      className="hidden h-[38px] w-[38px] flex-none cursor-pointer items-center justify-center rounded-full border border-line p-0 text-mut xl:inline-flex"
      style={{ background: wide ? 'var(--sbg)' : 'transparent' }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* The design's two paths: arrows inward when wide (collapse back to
            the column), outward when narrow (release the cap). */}
        <path d={wide ? 'M9 4H4v5M4 4l5 5M15 20h5v-5M20 20l-5-5' : 'M4 9V4h5M4 4l6 6M20 15v5h-5M20 20l-6-6'} />
      </svg>
    </button>
  )
}
