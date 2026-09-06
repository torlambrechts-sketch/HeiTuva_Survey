import { requireViewer } from '@/lib/auth/session'
import { AppHeader } from '@/components/AppHeader'

/** Every route in this group is signed-in-only. requireViewer redirects to the
 *  login screen, and middleware already blocks the request before this runs —
 *  belt and braces, because a missed gate here leaks org data. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // DECISIONS Q14 is now a DEFERRAL: administrator MFA is not enforced, so
  // there is no assurance-level gate here. Supabase Auth still supports TOTP —
  // the capability is untouched — it is simply not required at login. The
  // re-enable trigger is recorded in DECISIONS.md: the first real organisation,
  // or any real respondent data in prod, whichever comes first.
  const viewer = await requireViewer()

  return (
    <>
      <AppHeader viewer={viewer} />
      {/* One frame for every screen (v1 bundle, HeiTuva.dc.html:364). */}
      <div className="frame pb-16">{children}</div>
    </>
  )
}
