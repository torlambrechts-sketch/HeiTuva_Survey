import { requireViewer } from '@/lib/auth/session'

/** Oversikt is built in Phase 5 (it depends on the duty engine). This is a
 *  landing stub so the shell is reachable — not a designed screen. */
export default async function OverviewPage() {
  const viewer = await requireViewer()
  return (
    <main className="animate-enter pt-[34px]">
      <h1 className="font-display text-[28px] font-medium">{viewer.orgName}</h1>
      <p className="mt-1 text-[13px] text-mut">Oversikt bygges i fase 5.</p>
    </main>
  )
}
