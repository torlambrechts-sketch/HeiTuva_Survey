import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { PrivacyPanel } from '../PrivacyPanel'
import { DsrPanel } from '../DsrPanel'
import { PRIVACY_KEYS, privacyToDisplay, type DsrRequest, type PrivacyKey } from '../keys'

/** Personvern tab — HeiTuva.dc.html:1474-1541. Two columns: privacy + DSR on
 *  the left, documentation (on --sbg) and the anonymity explainer on the right. */
export default async function PrivacyTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const t = await getTranslations('admin')
  const supabase = await createClient()
  const [{ data: org }, { data: dsr }] = await Promise.all([
    supabase
      .from('organizations')
      .select('privacy, retention_months')
      .eq('id', viewer.orgId)
      .single(),
    supabase
      .from('dsr_requests')
      .select('id, type, subject_email, status, due_at')
      .eq('org_id', viewer.orgId)
      .order('due_at', { ascending: true }),
  ])

  const raw = (org?.privacy as Record<string, boolean> | null) ?? {}
  const privacy = Object.fromEntries(
    PRIVACY_KEYS.map((k) => [k, privacyToDisplay(k, raw[k] === true)]),
  ) as Record<PrivacyKey, boolean>

  // The design's four documentation rows have no upload path until the duty
  // engine and Storage land in Phase 5 — they render with a "not uploaded yet"
  // meta line rather than the prototype's fabricated signing dates.
  const docs = [
    [t('doc1'), t('doc1Meta')],
    [t('doc2'), t('doc2Meta')],
    [t('doc3'), t('doc3Meta')],
    [t('doc4'), t('doc4Meta')],
  ]

  return (
    <div className="mt-5 grid grid-cols-1 items-start gap-[18px] md:grid-cols-[1.1fr_.9fr]">
      <div className="flex flex-col gap-[18px]">
        <PrivacyPanel privacy={privacy} retention={org?.retention_months ?? 12} />
        <DsrPanel requests={(dsr ?? []) as DsrRequest[]} />
      </div>

      <div className="flex flex-col gap-[18px]">
        <section className="rounded-[18px] border border-line bg-sbg p-6">
          <h2 className="text-[16px] font-semibold">{t('docs')}</h2>
          {docs.map(([name, meta]) => (
            <div
              key={name}
              className="flex items-center gap-3 py-3"
              style={{ borderBottom: '1px solid rgba(25,21,16,.12)' }}
            >
              <span className="flex-1">
                <span className="block text-[13.5px] font-semibold">{name}</span>
                <span className="mt-0.5 block text-[13px] text-mut">{meta}</span>
              </span>
              <span className="text-[13px] text-mut">{t('download')}</span>
            </div>
          ))}
          <p className="mt-3.5 text-[12.5px] text-mut">{t('docsComing')}</p>
        </section>

        <section className="rounded-[18px] border border-line bg-sf p-6">
          <h2 className="text-[16px] font-semibold">{t('anonExplainerTitle')}</h2>
          <p className="mt-2.5 text-[13.5px] leading-[1.7] text-mut">{t('anonExplainer')}</p>
        </section>
      </div>
    </div>
  )
}
