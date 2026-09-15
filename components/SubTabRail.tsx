import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { TAB_SEGMENT, type SurveyTab } from '@/lib/surveys/tabs'
import { subLabelKey, subTabHref, subTabsFor } from '@/lib/surveys/subtabs'

/**
 * F5 — the sub-tab rail (v6:1243-1252).
 *
 * ── IN THE PAGE, NOT IN THE SHELL, AND THAT IS DELIBERATE ─────────────────
 *
 * v6 draws this at the bottom of the survey-detail head, inside the card — not
 * in the subnav strip where the TAB rail lives. Keeping it there is what keeps
 * the standing rule intact: «a shell rail may absorb an in-page one only when
 * its list is COMPLETE», and the failure that rule prevents is one navigation
 * control in two places disagreeing about what is selected. The shell carries
 * the tabs, the page carries the sub-tabs, and neither holds a copy of the
 * other.
 *
 * ── LINKS, NOT BUTTONS ────────────────────────────────────────────────────
 *
 * The bundle uses `<button onClick>` because it has no URLs. Ours is `?vis=`,
 * so these are links: middle-click, copy-link, the back button and a shared URL
 * all work, and `aria-current` is a fact about the URL rather than about a
 * component's state.
 *
 * ── `touch-cluster`, BEFORE THE GATE ASKS FOR IT ──────────────────────────
 *
 * The drawn pill is `padding:7px 15px` at 12.5px — ~30px painted — in a rail
 * with `gap:3px`. `globals.css` has already done this arithmetic on
 * `.touch-cluster`: a 30px control with a 44px hit area overflows
 * (44 − 30) / 2 = 7px each side, so adjacent ones need **14px** between their
 * painted edges. Three is not fourteen.
 *
 * This is the fifth rail in this project to need it, and the first to carry it
 * from the first commit rather than after `verify:responsive` named it. The
 * number belongs to the CONTROL — a 30px pill — not to the pattern, which is
 * the whole of CLAUDE.md's row 10.
 */
export async function SubTabRail({
  surveyId,
  tab,
  current,
}: {
  surveyId: string
  tab: SurveyTab
  /** The resolved sub-tab. The page resolves it, so the rail and the content
   *  cannot disagree about which pill is live. */
  current: string
}) {
  const subs = subTabsFor(tab)
  // A tab with no rail renders nothing at all — not an empty strip, which reads
  // as a rail that failed to load.
  if (subs.length === 0) return null

  const t = await getTranslations('surveys')
  const segment = TAB_SEGMENT[tab]

  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-b-[19px] border-t border-line bg-bg px-[22px] py-3.5">
      <span className="whitespace-nowrap text-[11px] uppercase tracking-[.09em] text-mut">
        {t(`subRail_${tab}` as 'subRail_kommentarer')}
      </span>
      <span
        className="touch-cluster flex flex-wrap gap-[3px] rounded-[11px] bg-sf2 p-1"
        role="group"
        aria-label={t(`subRail_${tab}` as 'subRail_kommentarer')}
      >
        {subs.map((s) => {
          const live = s === current
          return (
            <Link
              key={s}
              href={subTabHref(surveyId, tab, s, segment)}
              aria-current={live ? 'page' : undefined}
              className="touch-44 cursor-pointer whitespace-nowrap rounded-lg border-none px-[15px] py-[7px] text-[12.5px] font-semibold text-ink no-underline"
              style={{
                background: live ? 'var(--sf)' : 'transparent',
                boxShadow: live ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
              }}
            >
              {t(subLabelKey(tab, s) as 'sub_kommentarer_alle')}
            </Link>
          )
        })}
      </span>
    </div>
  )
}
