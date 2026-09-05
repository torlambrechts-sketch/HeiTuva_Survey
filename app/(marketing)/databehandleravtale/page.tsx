import { getTranslations } from 'next-intl/server'
import { LegalPage } from '../LegalPage'

export const dynamic = 'force-dynamic'

/** Databehandleravtale — the standing terms every customer signs, public. */
export default async function DpaPage() {
  const t = await getTranslations('legal')
  const n = Number(t('dpaSections'))
  const sections = Array.from({ length: n }, (_, i) => ({
    heading: t(`dpa${i + 1}H` as 'dpa1H'),
    paragraphs: t(`dpa${i + 1}P` as 'dpa1P').split('\n\n'),
  }))
  return <LegalPage title={t('dpaTitle')} updated={t('updated')} sections={sections} back={t('back')} draftNotice={t('draftNotice')} />
}
