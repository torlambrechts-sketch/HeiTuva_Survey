import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { entraAvailable } from '@/lib/auth/entra'
import { OptionsPanel } from '../OptionsPanel'
import { OPTION_KEYS, type OptionKey } from '../keys'

/** Valg tab — HeiTuva.dc.html:1543-1557. */
export default async function OptionsTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('options, default_lang')
    .eq('id', viewer.orgId)
    .single()

  const raw = (org?.options as Record<string, boolean> | null) ?? {}
  const options = Object.fromEntries(OPTION_KEYS.map((k) => [k, raw[k] === true])) as Record<
    OptionKey,
    boolean
  >

  // The break-glass list (D82): only active administrators can carry the
  // mark, so only they are listed. Read through RLS like everything else.
  const { data: admins } = await supabase
    .from('org_members')
    .select('id, name, email, sso_exempt')
    .eq('org_id', viewer.orgId)
    .eq('role', 'administrator')
    .eq('status', 'active')
    .order('created_at')

  return (
    <OptionsPanel
      options={options}
      defaultLang={org?.default_lang === 'en' ? 'en' : 'no'}
      entra={await entraAvailable()}
      admins={(admins ?? []).map((a) => ({
        id: a.id,
        name: a.name || a.email,
        exempt: a.sso_exempt === true,
      }))}
    />
  )
}
