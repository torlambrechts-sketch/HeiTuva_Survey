'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The "Innsikt" rail — HeiTuva.dc.html:923-926 (Dashboard) and 1209-1212
 * (Rapporter), fed by `insightTabs` at 3639-3641.
 *
 * The v1 bundle merges Dashboard and Rapporter into one navigation item and
 * puts the choice between them here, beside the heading. Both screens render
 * the same rail, so it is one component rather than two copies.
 *
 * A client component for the same reason AppNav is one: the active tab is a
 * function of the live pathname. Labels are resolved on the server and passed
 * in, so next-intl does not ship twice.
 */
export type InsightTab = { href: string; label: string }

export function InsightTabs({ tabs, label }: { tabs: InsightTab[]; label: string }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label={label}
      // RESPONSIVE.md § Tab rails: wraps below md, chips keep their design
      // size. The row gap carries the 44px hit areas apart when it wraps and
      // returns to the bundle's 3px at md, where it never does.
      className="flex flex-wrap gap-x-[3px] gap-y-[13px] rounded-full bg-sf2 p-1 md:gap-y-[3px]"
    >
      {tabs.map((tab) => {
        const on = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className="touch-44 cursor-pointer rounded-full border-none px-[18px] py-2 text-[12.5px] font-semibold text-ink no-underline"
            style={{
              background: on ? 'var(--sf)' : 'transparent',
              boxShadow: on ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
