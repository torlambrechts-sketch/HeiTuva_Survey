import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { headlineKey, lowestKey, type Analyst } from '@/lib/tuva/analyst'

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
 * and starts describing replies, and it is not built.
 *
 * ── F1-1: THIS COMPONENT DOES NOT CHOOSE WHICH CLAIM TO MAKE ───────────────
 *
 * `headlineKey` and `lowestKey` live in the module, because «{pct} % har
 * svart» and «{pct} % har svart i de {m} med mottakertall» are claims about
 * different populations and the honest one is decided by the numbers. A
 * component free to pick the shorter sentence is free to overstate.
 *
 * When there is nothing to say it renders NOTHING. A helper that always has an
 * opinion is a helper nobody believes.
 */
/**
 * ── F4: `bare` — THE CONTENT WITHOUT ITS OWN CHROME ───────────────────────
 *
 * Tuva now sits in one of two places the DRAWING decides (the docked side
 * column or the floating bubble, v6:9014-9018), and each brings its own frame,
 * heading and switch button. This component kept its own `<aside>` and heading
 * because it used to be a full-width block of its own, and two frames nested
 * would be two headings saying «Tuva».
 *
 * So `bare` renders the SENTENCES AND TIPS ONLY, and `TuvaPlacementSwitch`
 * supplies the frame. Not a second component: the copy, the two headline keys
 * and Q185's tip rule are the same in both placements, and duplicating them is
 * how the two would come to disagree.
 */
export async function AnalystPanel({ analyst, bare }: { analyst: Analyst; bare?: boolean }) {
  const t = await getTranslations('analyst')
  if (analyst.activeCount === 0 && analyst.tips.length === 0) return null

  const body = (
    <>
      <p className={bare ? 'text-[13.5px] leading-[1.6]' : 'mt-2 text-[14px]'}>
        {t(headlineKey(analyst), {
          n: analyst.activeCount,
          m: analyst.measured?.ids.length ?? 0,
          pct: analyst.measured?.pct ?? 0,
        })}
      </p>
      {analyst.lowest ? (
        <p className="mt-1 text-[13px] text-mut">
          {t(lowestKey(analyst), {
            title: analyst.lowest.title,
            pct: analyst.lowest.pct,
            m: analyst.measured?.ids.length ?? 0,
          })}
        </p>
      ) : null}

      {analyst.tips.length ? (
        <ul className="mt-4 flex list-none flex-col gap-2 p-0">
          {analyst.tips.map((tip) => (
            <li key={`${tip.kind}-${tip.surveyId}`} className="text-[13px]">
              {tip.kind === 'low_response' ? (
                <>
                  {t('tipLowResponse', { title: tip.title, n: tip.missing })}{' '}
                  <Link href={`/undersokelser/${tip.surveyId}/send`} className="touch-44 underline">
                    {t('tipLowResponseAction')}
                  </Link>
                </>
              ) : tip.kind === 'draft' ? (
                <>
                  {t('tipDraft', { title: tip.title })}{' '}
                  <Link href={`/undersokelser/${tip.surveyId}/bygg`} className="touch-44 underline">
                    {t('tipDraftAction')}
                  </Link>
                </>
              ) : (
                /* Q72's copy, near enough verbatim: the duty, not the finding.
                   No group name, no question, no rating. */
                <>
                  {t('tipBelowThreshold')}{' '}
                  <Link
                    href={`/undersokelser/${tip.surveyId}/malgruppe`}
                    className="touch-44 underline"
                  >
                    {t('tipBelowThresholdAction')}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )

  if (bare) return body

  return (
    <aside
      aria-label={t('title')}
      className="mt-5 rounded-2xl border border-line bg-sf px-[22px] py-[18px]"
    >
      <h2 className="text-[13px] font-semibold uppercase tracking-[.09em] text-mut">
        {t('title')}
      </h2>
      {body}
    </aside>
  )
}
