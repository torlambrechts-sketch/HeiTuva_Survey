'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type AdminTab = { href: string; label: string }

/**
 * The design's tab strip (HeiTuva.dc.html:1377-1381): a 4px-padded --sf2 pill
 * rail, each tab 10px/18px with radius 11 and, when active, --sf plus the
 * standard card shadow.
 *
 * The prototype switches tabs with local state. Here each tab is a route, so
 * the header's "Personvern og GDPR" link can deep-link into one and a reload
 * keeps you where you were. Visually identical — see docs/DEVIATIONS.md D16.
 */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const pathname = usePathname()

  return (
    <div className="mt-4 flex flex-wrap gap-2 rounded-[14px] bg-sf2 p-1 md:w-fit md:gap-[3px]">
      {tabs.map((tab) => {
        const on = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className="touch-44 cursor-pointer rounded-[11px] border-none px-[18px] py-2.5 text-[13px] font-semibold text-ink no-underline"
            style={{
              background: on ? 'var(--sf)' : 'transparent',
              boxShadow: on ? '0 2px 10px rgba(25,21,16,.05)' : 'none',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
