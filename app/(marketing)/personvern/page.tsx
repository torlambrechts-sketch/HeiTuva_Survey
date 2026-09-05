import { getTranslations } from 'next-intl/server'
import { LegalPage } from '../LegalPage'

export const dynamic = 'force-dynamic'

/** Personvernerklæring — the product's own notice, public. */
export default async function PrivacyPage() {
  const t = await getTranslations('legal')
  const n = Number(t('privacySections'))
  const sections = Array.from({ length: n }, (_, i) => ({
    heading: t(`privacy${i + 1}H` as 'privacy1H'),
    paragraphs: t(`privacy${i + 1}P` as 'privacy1P').split('\n\n'),
  }))
  return <LegalPage title={t('privacyTitle')} updated={t('updated')} sections={sections} back={t('back')} draftNotice={t('draftNotice')} />
}
