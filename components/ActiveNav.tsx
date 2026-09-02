'use client'

import { usePathname } from 'next/navigation'

/** Maps the current path to a nav key so the header can render its active
 *  state. Kept client-side because the layout is a server component and
 *  usePathname is the only reliable source during client navigation. */
function keyFor(pathname: string): string {
  if (pathname.startsWith('/undersokelser')) return 'surveys'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/bibliotek')) return 'library'
  if (pathname.startsWith('/rapporter')) return 'reports'
  if (pathname === '/') return 'dash'
  return ''
}

export function ActiveNav({ children }: { children: (active: string) => React.ReactNode }) {
  return <>{children(keyFor(usePathname()))}</>
}
