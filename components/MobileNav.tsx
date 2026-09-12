'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { NavItem } from './AppNav'

/**
 * The slide-over nav for viewports below `md`, per docs/RESPONSIVE.md § App
 * shell: logo + hamburger + avatar stay in the header, everything else moves in
 * here. "Ny undersøkelse" is the first item and the language switcher sits in
 * the panel footer, both as that section specifies.
 *
 * This is what fixes D12 — the header's nav, CTA and language control together
 * were 505px wider than a 390px viewport, so the page rendered at ~892px.
 * Nothing is removed (rule 4), it is relocated.
 */
export function MobileNav({
  items,
  newSurveyHref,
  newSurveyLabel,
  openLabel,
  closeLabel,
  langSlot,
}: {
  items: NavItem[]
  /**
   * THE SLIDE-OVER KEEPS «Ny undersøkelse» THOUGH W1 REMOVED IT FROM THE
   * HEADER, AND THAT IS DELIBERATE. Written here rather than only in a report,
   * because the inconsistency is the kind someone tidies away on sight.
   *
   * Three things hold it up:
   *  1. NO BUNDLE DRAWS THIS SURFACE AT ALL. The slide-over is
   *     docs/RESPONSIVE.md's answer for widths below 1280px, where CLAUDE.md
   *     says there is no design to match. v4 restructuring the HEADER
   *     therefore does not restructure this by implication — a bundle can only
   *     govern what it draws.
   *  2. RESPONSIVE.md's own sentence listing what this carries («the nav, the
   *     CTA and the language switcher») is an ENUMERATION OF WHAT THE HEADER
   *     HAD THE DAY IT WAS WRITTEN, not a rule about slide-overs. That is the
   *     shape CLAUDE.md's table records at row 5, where a specification's
   *     worked example became false the moment a phase moved the example.
   *  3. Nothing is broken either way: `/undersokelser/ny` is reachable at every
   *     width from Oversikt (V4:268) and Undersøkelser (V4:1082), both built.
   *
   * SETTLED (Q127, 2026-09-12): IT STAYS, and RESPONSIVE.md's sentence is now a
   * PROPERTY rather than the list that made this ambiguous — «the panel carries
   * every affordance the header drops at this width, including the primary
   * create action». The deciding fact is the one reason 1-3 above do not state:
   * below `md` the header has NO create affordance, so the panel is the only
   * place one can live. Removing it would leave the product's primary action
   * reachable at 390px only by first navigating to a page that offers it.
   */
  newSurveyHref: string
  newSurveyLabel: string
  openLabel: string
  closeLabel: string
  langSlot: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change, Escape, and lock the page behind the panel.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  // RESPONSIVE.md: 48px rows, --sf surface, --line border, existing nav item
  // styling at full width.
  const row =
    'flex h-12 items-center rounded-[10px] px-3 text-[13px] text-ink no-underline'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={openLabel}
        aria-expanded={open}
        className="touch-44 flex h-[38px] w-[38px] flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-transparent md:hidden"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <div
            className="absolute inset-0 bg-[rgba(25,21,16,.28)]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={openLabel}
            className="absolute right-0 top-0 flex h-full w-[min(320px,88vw)] flex-col border-l border-line bg-sf p-4"
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
                className="touch-44 flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full border border-line bg-transparent text-[16px] leading-none text-ink"
              >
                ×
              </button>
            </div>

            <nav className="mt-2 flex flex-col gap-0.5">
              <Link
                href={newSurveyHref}
                className={`${row} bg-ac font-semibold`}
                onClick={() => setOpen(false)}
              >
                {newSurveyLabel}
              </Link>
              {items.map((item) => {
                // Same mapping as AppNav: the "Innsikt" item covers /dashboard
                // and /rapporter both, so the slide-over agrees with the bar.
                const on =
                  item.key === 'insight'
                    ? pathname.startsWith('/dashboard') || pathname.startsWith('/rapporter')
                    : item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={on ? 'page' : undefined}
                    className={row}
                    style={{ fontWeight: on ? 600 : 400, opacity: on ? 1 : 0.62 }}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            <div className="mt-auto flex items-center border-t border-line pt-4">{langSlot}</div>
          </div>
        </div>
      ) : null}
    </>
  )
}
