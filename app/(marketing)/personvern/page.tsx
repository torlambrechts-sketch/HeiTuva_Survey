import { getLocale, getTranslations } from 'next-intl/server'
import { LegalPage } from '../LegalPage'
import { RETENTION_DEFAULT, RETENTION_MONTHS } from '@/lib/surveys/retention'

export const dynamic = 'force-dynamic'

/**
 * Personvernerklæring — the product's own notice, public.
 *
 * ── Q187, ON THE ONE SURFACE THAT CANNOT RESOLVE AN ORGANISATION ──────────
 *
 * `legal.privacy5P` said «standard 24 måneder». The column is
 * `retention_months int not null default 12` (M:0002) and production is 12, so
 * the figure was wrong for every reader, in a public GDPR document, in both
 * languages.
 *
 * Q187 fixed the same sentence in two other places by RESOLVING it — the
 * manager's Personvern tab and the respondent's anonymity sheet both call
 * `retentionOf(org)` and render what it returns. **This page cannot do that,
 * and the reason is structural rather than an omission:** `/personvern` is a
 * marketing route with no session, no token and no organisation parameter, and
 * it is ONE document read by every customer and by people with no account at
 * all. There is no organisation to resolve. Even given one, a single figure
 * would be false for every other reader of the same page.
 *
 * So the honest alternative is not a different constant — it is to stop
 * claiming a value the page cannot know. The notice states what is actually
 * true of the product: the period is the ORGANISATION's choice, these are the
 * choices, this is the default, and here is where your own organisation's
 * figure is stated. A privacy notice that names a figure it cannot know is the
 * defect, and naming 12 instead of 24 would have been the same defect with a
 * better number.
 *
 * ── THE NUMBERS STILL COME FROM ONE PLACE ─────────────────────────────────
 *
 * `RETENTION_MONTHS` and `RETENTION_DEFAULT` are the registry
 * `PrivacyPanel`'s control and `setRetention`'s Zod boundary now also read, and
 * `tests/db/retention-registry.test.ts` reads the column's own CHECK back out
 * of `pg_constraint` and requires them to agree. Before this there were THREE
 * spellings of the allowed set agreeing by luck; this page would have been a
 * fourth, and it is the one a data subject relies on.
 *
 * `Intl.ListFormat` joins them in the reader's own language — «6, 12 eller 24»
 * against «6, 12, or 24» — so a locale is not a second place to get the
 * conjunction wrong.
 */
export default async function PrivacyPage() {
  const t = await getTranslations('legal')
  const locale = await getLocale()
  const n = Number(t('privacySections'))

  /* Passed to EVERY section rather than to the fifth. The sections are built by
     INDEX and the values are keyed by NAME, so a section inserted above §5
     moves the retention paragraph without moving its placeholders — a
     positional hand-off would silently start feeding them to the wrong one.
     ICU ignores values a message does not use. */
  const values = {
    options: new Intl.ListFormat(locale, { style: 'long', type: 'disjunction' }).format(
      RETENTION_MONTHS.map(String),
    ),
    fallback: RETENTION_DEFAULT,
  }

  const sections = Array.from({ length: n }, (_, i) => ({
    heading: t(`privacy${i + 1}H` as 'privacy1H'),
    paragraphs: t(`privacy${i + 1}P` as 'privacy1P', values).split('\n\n'),
  }))
  return <LegalPage title={t('privacyTitle')} updated={t('updated')} sections={sections} back={t('back')} draftNotice={t('draftNotice')} />
}
