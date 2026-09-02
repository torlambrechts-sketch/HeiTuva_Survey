import { requireViewer } from '@/lib/auth/session'
import { AppHeader } from '@/components/AppHeader'
import { ActiveNav } from '@/components/ActiveNav'

/** Every route in this group is signed-in-only. requireViewer redirects to the
 *  login screen, and middleware already blocks the request before this runs —
 *  belt and braces, because a missed gate here leaks org data. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer()

  return (
    <ActiveNav>
      {(active) => (
        <>
          <AppHeader viewer={viewer} active={active} />
          <div className="mx-5 pb-16">{children}</div>
        </>
      )}
    </ActiveNav>
  )
}
