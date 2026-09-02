import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { GroupsPanel, type AdminGroup } from '../GroupsPanel'

/** Grupper tab — HeiTuva.dc.html:1440-1471. */
export default async function GroupsTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const supabase = await createClient()
  const [{ data: groups }, { data: members }] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, lead_member_id')
      .eq('org_id', viewer.orgId)
      .order('name'),
    supabase
      .from('org_members')
      .select('id, name, email, group_id')
      .eq('org_id', viewer.orgId)
      .neq('status', 'inactive'),
  ])

  const byGroup = new Map<string, number>()
  const nameById = new Map<string, string>()
  for (const m of members ?? []) {
    nameById.set(m.id, m.name || m.email)
    if (m.group_id) byGroup.set(m.group_id, (byGroup.get(m.group_id) ?? 0) + 1)
  }

  const rows: AdminGroup[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    count: byGroup.get(g.id) ?? 0,
    lead: g.lead_member_id ? (nameById.get(g.lead_member_id) ?? null) : null,
  }))

  return <GroupsPanel groups={rows} />
}
