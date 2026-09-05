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

  return (
    <OptionsPanel
      options={options}
      defaultLang={org?.default_lang === 'en' ? 'en' : 'no'}
      entra={await entraAvailable()}
    />
  )
}
