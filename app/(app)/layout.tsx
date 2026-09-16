import { requireViewer } from '@/lib/auth/session'
import { AppFooter } from '@/components/AppFooter'
import { AppHeader } from '@/components/AppHeader'
import { Breadcrumb } from '@/components/Breadcrumb'
import { TuvaHelper } from '@/components/TuvaHelper'
import { createClient } from '@/lib/supabase/server'
import { optionsOf } from '@/lib/org/options'

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

  /* G4 — the helper's switch, read ONCE for the whole shell.
     `options.tuva` is a real setting since G2: a column with a default, a
     backfill and `setOption` as its writer. That is half the reason this
     helper is back at all — Q190 removed it partly because the gate the
     drawing reads (`(st.options || {}).tuva !== false`, v6:8964) had nothing
     behind it. Off means the bubble is absent, not disabled. */
  const supabase = await createClient()
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('options')
    .eq('id', viewer.orgId)
    .maybeSingle()
  const tuvaOn = optionsOf(orgRow?.options).tuva

  return (
    <>
      <AppHeader viewer={viewer} />
      {/* F3 — THE BREADCRUMB IS SHELL, and that is the finding it comes from.
          v6 draws it on five screens; it had been built on two, as two
          hand-rolled copies, because a shared surface has no owner when phases
          are per-screen. It renders from `lib/shell/crumbs.ts` and returns null
          on a route with no entry, so a sixth screen inherits it by gaining a
          registry row rather than by somebody remembering. It carries its own
          `pt-[26px]` (v6:2120); the five pages below it start at the drawing's
          14px gap. */}
      <Breadcrumb />
      {/* One frame for every screen (v1 bundle, HeiTuva.dc.html:364). */}
      <div className="frame pb-16">
        {children}
        {/* G4 — TUVA IS SHELL, for F3's reason: v6 draws her wherever the map
            has an entry, so mounting her per-screen is how a shared surface
            ends up built in three places and propagated to none. She renders
            null where the registry is silent, which includes /undersokelser —
            svTuva stands there instead (v6:8965).

            Mounted INSIDE the frame rather than after the footer because below
            1280px she is in the flow rather than fixed; see the component. */}
        <TuvaHelper tuvaOn={tuvaOn} />
      </div>
      {/* V5-1 — the footer is SHELL: v5 draws it on every page, so it mounts
          here rather than per screen. That is also what makes its claims the
          most-read copy in the product, and why four of the drawing's five
          assertions do not ship (D164). */}
      <AppFooter />
    </>
  )
}
