'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavItem = { href: string; key: string; label: string }

/**
 * Client component so the active item can be derived from the live pathname.
 * Labels are resolved on the server and passed in — this must not reach into
 * next-intl itself, or every nav label would ship to the browser twice.
 *
 * W1 · V4:172 — THE ITEMS ARE PILLS NOW. v4 restructures the header and the
 * nav with it: 13px -> 15.5px, `padding:9px 13px`, `border-radius:10px`, the
 * active item on `--sbg` rather than distinguished by weight and opacity
 * alone, and a `--sf2` hover the flat labels never had.
 *
 * `white-space:nowrap` per item is the bundle's, and it is load-bearing rather
 * than decorative: a label broken across two lines inside a pill is a different
 * control from the one v4 draws. The item that made this acute was «Oppgaver og
 * tilbakemeldinger», three words in a pill; Tor renamed it «Handlinger» on
 * 2026-09-13 and the longest item is now «Undersøkelser». The rule stays because
 * it is the bundle's and because the next long label would wrap the same way —
 * but it is no longer carrying the weight it was written for, and saying so is
 * cheaper than leaving a comment that argues from a string nobody will find.
 *
 * Weight and opacity are KEPT alongside the pill (`700/1` on, `500/.64` off,
 * V4:172) — the background is added to them, not substituted for them, so the
 * active item is still legible to someone who cannot distinguish the tint.
 */
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  // "Innsikt" is one item over two routes (v1 bundle, HeiTuva.dc.html:3598:
  // the item is active for `dashboard` OR `reports`), so both mark it.
  const activeKey = (() => {
    if (pathname.startsWith('/undersokelser')) return 'surveys'
    if (pathname.startsWith('/oppgaver')) return 'tasks'
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/rapporter')) return 'insight'
    if (pathname.startsWith('/bibliotek')) return 'library'
    if (pathname === '/') return 'dash'
    return ''
  })()

  return (
    /* V4:170 — `gap:4px 6px`, `flex:1 1 auto`, `min-width:0`. The row wraps
       below 1280px, where no bundle draws this header at all and
       docs/RESPONSIVE.md governs; `gap-y` is what the wrapped row needs, and
       the arithmetic for it is in the touch-area comment on the item below. */
    <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[6px] gap-y-[10px] xl:gap-y-[4px]">
      {items.map((item) => {
        const on = activeKey === item.key
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            /* THE HIT AREA AND THE GAP ARE ONE CALCULATION, and the number
               belongs to THIS control rather than to the pattern — C4's
               `gap-y-[13px]` was right for a 40px chip and one pixel short for
               a 30px one, which is enumeration row 10.
               Measured here: `py-[9px]` on 15.5px text paints ~38px, so a 44px
               area overflows (44 - 38) / 2 = 3px each side and two stacked rows
               need at least 6px between painted edges. `gap-y-[10px]` clears it
               with margin; at xl the row does not wrap and the gap returns to
               the bundle's 4px. */
            className="touch-44 whitespace-nowrap rounded-[10px] border-none px-[13px] py-[9px] text-[15.5px] text-ink no-underline hover:bg-sf2"
            style={{
              background: on ? 'var(--sbg)' : 'transparent',
              fontWeight: on ? 700 : 500,
              opacity: on ? 1 : 0.64,
            }}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
