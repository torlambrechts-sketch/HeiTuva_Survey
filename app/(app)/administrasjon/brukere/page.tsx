import { createClient } from '@/lib/supabase/server'
import { initialsOf, requireViewer, type MemberRole } from '@/lib/auth/session'
import { UsersPanel, type AdminUser } from '../UsersPanel'

/** Brukere tab — HeiTuva.dc.html:1408-1437. */
export default async function UsersTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const supabase = await createClient()
  // The FK must be named. There are two relationships between org_members and
  // groups — a member's group, and a group's lead member — so an unqualified
  // `groups(name)` is ambiguous and PostgREST refuses the whole query. It
  // returned an error, not rows, and the screen showed "Ingen brukere ennå" for
  // an org with three of them.
  const { data, error } = await supabase
    .from('org_members')
    .select('id, name, email, role, status, source, status_source, group_id, groups!org_members_group_id_fkey(name)')
    .eq('org_id', viewer.orgId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`org_members read failed: ${error.message}`)

  // S3/D129: the options for the group control. Read here rather than in the
  // panel so the row renders from data the server already has, and ordered by
  // name because the bundle's own group lists are.
  const { data: groupRows } = await supabase
    .from('groups')
    .select('id, name')
    .eq('org_id', viewer.orgId)
    .order('name', { ascending: true })
  const groups = (groupRows ?? []).map((g) => ({ id: g.id, name: g.name }))

  const users: AdminUser[] = (data ?? []).map((m) => {
    const name = m.name || m.email
    return {
      id: m.id,
      name,
      email: m.email,
      group: (m.groups as unknown as { name: string } | null)?.name ?? null,
      groupId: m.group_id,
      role: m.role as MemberRole,
      status: m.status as AdminUser['status'],
      // Q142 — `source` says the row is the directory's; `status_source` says
      // whether the status SHOWING is the directory's answer or a hand override
      // the next sync will undo.
      fromDirectory: m.source === 'scim',
      // M:0117: `source` names the DIRECTORY ('entra'), `status_source` names
      // the SIDE ('local' | 'directory'). The old form compared both against
      // the transport 'scim' and would have silently stopped firing the moment
      // pull replaced push — a sentence that quietly goes away is the defect
      // Q142 exists to prevent.
      statusOverridden: m.source !== null && m.source !== 'local' && m.status_source === 'local',
      initials: initialsOf(name),
    }
  })

  return (
    <UsersPanel
      users={users}
      groups={groups}
      count={{ active: users.filter((u) => u.status === 'active').length, total: users.length }}
    />
  )
}
