import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Analyst } from '@/lib/tuva/analyst'

/**
 * V6-6 — svTuva on the Undersøkelser list.
 *
 * Participation only (Q184). Every number here is a count of people or a rate
 * derived from two of them, which Q28 permits and which each row of this list
 * already shows. **It adds no data path**: the response totals are the ones the
 * page already fetched from `survey_response_counts`.
 *
 * The third tip is Q72's trigger or it is absent (Q185) — «I can make tasks out
 * of the findings» is the seam where an analyst stops describing participation
 * and starts describing answers, and it is not built.
 *
 * When there is nothing to say it renders NOTHING. A helper that always has an
 * opinion is a helper nobody believes.
 */
export async function AnalystPanel({
  analyst,
}: {
  analyst: Analyst
}) {
  const t = await getTranslations('analyst')
  if (analyst.activeCount === 0 && analyst.tips.length === 0) return null

  return (
    <aside
      aria-label={t('title')}
      className="mt-5 rounded-2xl border border-line bg-sf px-[22px] py-[18px]"
    >
      <h2 className="text-[13px] font-semibold uppercase tracking-[.09em] text-mut">
        {t('title')}
      </h2>
      <p className="mt-2 text-[14px]">
        {/* No denominator means no percentage — never a 0 % from an unknown one. */}
        {analyst.pct === null
          ? t('headlineNoRate', { n: analyst.activeCount })
          : t('headline', { n: analyst.activeCount, pct: analyst.pct })}
      </p>
      {analyst.lowest ? (
        <p className="mt-1 text-[13px] text-mut">
          {t('lowest', { title: analyst.lowest.title, pct: analyst.lowest.pct })}
        </p>
      ) : null}

      {analyst.tips.length ? (
        <ul className="mt-4 flex list-none flex-col gap-2 p-0">
          {analyst.tips.map((tip) => (
            <li key={`${tip.kind}-${tip.surveyId}`} className="text-[13px]">
              {tip.kind === 'low_response' ? (
                <>
                  {t('tipLowResponse', { title: tip.title, n: tip.missing })}{' '}
                  <Link href={`/undersokelser/${tip.surveyId}/send`} className="underline">
                    {t('tipLowResponseAction')}
                  </Link>
                </>
              ) : tip.kind === 'draft' ? (
                <>
                  {t('tipDraft', { title: tip.title })}{' '}
                  <Link href={`/undersokelser/${tip.surveyId}/bygg`} className="underline">
                    {t('tipDraftAction')}
                  </Link>
                </>
              ) : (
                /* Q72's copy, near enough verbatim: the duty, not the finding.
                   No group name, no question, no score. */
                <>
                  {t('tipBelowThreshold')}{' '}
                  <Link
                    href={`/undersokelser/${tip.surveyId}/malgruppe`}
                    className="underline"
                  >
                    {t('tipBelowThresholdAction')}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}
