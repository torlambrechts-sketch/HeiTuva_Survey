import { redirect } from 'next/navigation'
import { requireViewer } from '@/lib/auth/session'
import { adminMfaSatisfied } from '@/lib/auth/mfa'
import { AppHeader } from '@/components/AppHeader'

/** Every route in this group is signed-in-only. requireViewer redirects to the
 *  login screen, and middleware already blocks the request before this runs —
 *  belt and braces, because a missed gate here leaks org data. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer()

  // DECISIONS Q14: administrators must clear TOTP. This redirect protects the
  // screens; the same check is repeated in the Administrasjon actions, which
  // are reachable without ever rendering a layout.
  if (viewer.role === 'administrator' && !(await adminMfaSatisfied())) redirect('/sikkerhet')

  return (
    <>
      <AppHeader viewer={viewer} />
      <div className="mx-5 pb-16">{children}</div>
    </>
  )
}
