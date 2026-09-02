'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavItem = { href: string; key: string; label: string }

/**
 * Client component so the active item can be derived from the live pathname.
 * Labels are resolved on the server and passed in — this must not reach into
 * next-intl itself, or every nav label would ship to the browser twice.
 *
 * Active state per the design header: weight 600 / opacity 1 when on,
 * 400 / .62 otherwise.
 */
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  const activeKey = (() => {
    if (pathname.startsWith('/undersokelser')) return 'surveys'
    if (pathname.startsWith('/dashboard')) return 'dashboard'
    if (pathname.startsWith('/bibliotek')) return 'library'
    if (pathname.startsWith('/rapporter')) return 'reports'
    if (pathname === '/') return 'dash'
    return ''
  })()

  return (
    <nav className="flex gap-[30px]">
      {items.map((item) => {
        const on = activeKey === item.key
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className="border-none bg-transparent text-[13px] text-ink no-underline"
            style={{ fontWeight: on ? 600 : 400, opacity: on ? 1 : 0.62 }}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
