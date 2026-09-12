import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { IntegrationsPanel } from '../IntegrationsPanel'
import { CATALOGUE, connectorState } from '@/lib/directory/catalogue'

/**
 * Integrasjoner — HeiTuva.dc.html:2869-2926, the sixth admin tab.
 *
 * BUILT ONLY TO WHAT THE BUNDLE DRAWS, AND WITH THE REGISTER'S FINDING APPLIED.
 * The bundle's `intConnected` computes «4 aktive tilkoblinger» from a hard-coded
 * map — `{ entra:1, hr:1, teams:1, brreg:1 }` — and NONE OF THE FOUR EXISTS.
 * Every status chip on that screen is a literal in the mock's own fixture.
 *
 * Here the count and the Entra row are read from `entra_connection_status`,
 * which reads the connection. If nothing is connected the screen says so. I2
 * replaced the SCIM credential behind this with the pull connection; the
 * property — a status read from a connection or no status at all — is
 * unchanged, which is the point of having stated it as a property.
 */
export default async function IntegrationsTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const supabase = await createClient()
  const { data } = await supabase.rpc('entra_connection_status')
  const row = (data ?? [])[0] ?? null

  return (
    <IntegrationsPanel
      groups={CATALOGUE}
      entra={connectorState(row)}
      /* The count the row renders: how many members the LAST SYNC saw, not how
         many exist today. Recomputing from `org_members` would answer a
         different question — «how many members are there» — and would keep
         answering it after the connection was removed. */
      members={Number(row?.members_seen ?? 0)}
    />
  )
}
