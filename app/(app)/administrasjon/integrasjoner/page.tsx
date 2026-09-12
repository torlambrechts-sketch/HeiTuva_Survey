import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { IntegrationsPanel } from '../IntegrationsPanel'
import { CATALOGUE, connectorState } from '@/lib/scim/catalogue'

/**
 * Integrasjoner — HeiTuva.dc.html:2869-2926, the sixth admin tab.
 *
 * BUILT ONLY TO WHAT THE BUNDLE DRAWS, AND WITH THE REGISTER'S FINDING APPLIED.
 * The bundle's `intConnected` computes «4 aktive tilkoblinger» from a hard-coded
 * map — `{ entra:1, hr:1, teams:1, brreg:1 }` — and NONE OF THE FOUR EXISTS.
 * Every status chip on that screen is a literal in the mock's own fixture.
 *
 * Here the count and the Entra row are read from `scim_connection_status`, which
 * reads the credential. If nothing is connected the screen says so.
 */
export default async function IntegrationsTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const supabase = await createClient()
  const { data } = await supabase.rpc('scim_connection_status')
  const row = (data ?? [])[0] ?? null

  return (
    <IntegrationsPanel
      groups={CATALOGUE}
      entra={connectorState(row)}
      members={Number(row?.members_from_directory ?? 0)}
    />
  )
}
