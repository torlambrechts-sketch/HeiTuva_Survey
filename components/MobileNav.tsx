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
