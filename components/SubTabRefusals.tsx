import { getTranslations } from 'next-intl/server'
import type { SurveyTab } from '@/lib/surveys/tabs'
import { REFUSED } from '@/lib/surveys/subtabs'

/**
 * F5 — the sub-tabs v6 draws that this product does not offer, said ON THE
 * SCREEN rather than left out.
 *
 * ── WHY A REFUSAL IS RENDERED AT ALL ──────────────────────────────────────
 *
 * A view that is simply absent is indistinguishable from one somebody did not
 * finish, and the difference matters to the person looking at the rail and
 * counting. This project already does this in four places and it is the habit
 * the fidelity audit singled out as working: Live names four unavailable
 * panels with reasons, Hjelp says that status and chat are not set up, the
 * shell footer removed four claims and wrote down why, and Målgruppe writes
 * its refused half into the page.
 *
 * ── DERIVED, SO A NEW REFUSAL IS ONE ROW ──────────────────────────────────
 *
 * The list comes from `REFUSED` filtered by tab, not from a literal here. A
 * refusal added to the registry appears on its screen with no edit to this
 * file, and a refusal REVERSED — a sub-tab that becomes buildable — loses its
 * note automatically by leaving the registry. That is the same shape as
 * V5-3's «Sluttdato» exemption being derived rather than listed: widening a
 * hard-coded list buys a green screen and loses the guard.
 */
export async function SubTabRefusals({ tab }: { tab: SurveyTab }) {
  const rows = Object.entries(REFUSED).filter(([k]) => k.startsWith(`${tab}/`))
  if (rows.length === 0) return null

  const t = await getTranslations('surveys')

  return (
    <section
      aria-label={t('refuseHeading')}
      className="mt-4 rounded-2xl border border-line bg-bg px-[22px] py-[18px]"
    >
      <h3 className="text-[11px] uppercase tracking-[.09em] text-mut">{t('refuseHeading')}</h3>
      <ul className="mt-2.5 flex list-none flex-col gap-2.5 p-0">
        {rows.map(([key, msg]) => (
          <li key={key} className="text-[12.5px] leading-[1.55] text-mut">
            {t(msg as 'refuseLevering')}
          </li>
        ))}
      </ul>
    </section>
  )
}
