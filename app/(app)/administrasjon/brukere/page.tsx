import { createClient } from '@/lib/supabase/server'
import { initialsOf, requireViewer, type MemberRole } from '@/lib/auth/session'
import { UsersPanel, type AdminUser } from '../UsersPanel'

/** Brukere tab — HeiTuva.dc.html:1408-1437. */
export default async function UsersTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('org_members')
    .select('id, name, email, role, status, groups(name)')
    .eq('org_id', viewer.orgId)
    .order('created_at', { ascending: true })

  const users: AdminUser[] = (data ?? []).map((m) => {
    const name = m.name || m.email
    return {
      id: m.id,
      name,
      email: m.email,
      group: (m.groups as unknown as { name: string } | null)?.name ?? null,
      role: m.role as MemberRole,
      status: m.status as AdminUser['status'],
      initials: initialsOf(name),
    }
  })

  return (
    <UsersPanel
      users={users}
      count={{ active: users.filter((u) => u.status === 'active').length, total: users.length }}
    />
  )
}
