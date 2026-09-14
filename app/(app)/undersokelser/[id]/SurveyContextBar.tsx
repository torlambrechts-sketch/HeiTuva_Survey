import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

type Status = 'utkast' | 'aktiv' | 'lukket'

/** The pill's own colours, which the design states literally rather than as
 *  theme tokens (HeiTuva.dc.html:3402-3403) — they are the only greens and
 *  browns in the app. */
const STATUS_STYLE: Record<Status, { background: string; color: string }> = {
  aktiv: { background: '#E4F2E0', color: '#2F5D2A' },
  lukket: { background: '#F3E7DE', color: '#8A4B22' },
  utkast: { background: 'var(--sf2)', color: 'var(--mut)' },
}

const STATUS_KEY: Record<Status, string> = {
  utkast: 'statusUtkast',
  aktiv: 'statusAktiv',
  lukket: 'statusLukket',
}

/**
 * The survey context bar — HeiTuva.dc.html:194-211, IDENTITY ONLY since V6-2.
 *
 * It says WHICH survey you are looking at: back link, title, audience, status,
 * the ↻ series chip and «Kjør live». It no longer says which STEP you are on.
 *
 * ── THE THREE-STEP RAIL MOVED TO `AppSubnav` (V6-2) ────────────────────────
 *
 * v6 stops treating Bygg / Send / Resultater as three numbered steps and makes
 * them tabs on one survey (`sd.tab*`, v6:1255-2096), built by the same script
 * function as the shell's other rails (v6:8629). The rail is therefore in the
 * subnav strip, reading `lib/surveys/tabs.ts`.
 *
 * **It is removed from here rather than left in place, and that is the
 * condition the move rests on** — `AppSubnav`'s own header sets it for `admin`:
 * two controls doing one job, one of them able to go out of date, is worse than
 * one control. The library obeyed it at Q172 and so does this.
 *
 * The PATHS are unchanged (Tor): a survey has three phases with distinct state,
 * and a URL saying which one you are in is a property rather than an
 * implementation choice. So this is a re-parenting of the rail, not of the
 * routes.
 */
export async function SurveyContextBar({
  surveyId,
  title,
  audience,
  status,
  recurrence,
  liveMode,
}: {
  surveyId: string
  title: string
  audience: string | null
  status: Status
  /**
   * The ↻ chip (NEW:228-230). Empty when the survey has no series. Formatted
   * by the caller from `lib/schedules/status.ts` — the same sentence the list
   * row, the Send screen and the rounds panel show.
   */
  recurrence?: string
  /**
   * V2:231 — «Kjør live», rendered only when the survey is in live mode
   * (`isLiveMode`). `surveys.run_mode` is the switch, and `M:0083` refuses
   * `live` on a named survey, so a button that appears here is a button that
   * will work rather than one that refuses at the last possible moment.
   */
  liveMode?: boolean
}) {
  const t = await getTranslations('surveyNav')

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-sf px-[22px] py-4">
      <div className="flex min-w-0 items-center gap-[14px]">
        <Link
          href="/undersokelser"
          aria-label={t('back')}
          className="touch-44 flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[14px] py-[9px] text-[12.5px] font-semibold text-ink no-underline"
        >
          ←
        </Link>
        <span className="min-w-0">
          <span className="block font-display text-xl font-medium leading-[1.2]">
            {title}
          </span>
          {audience ? (
            <span className="mt-[2px] block text-[13px] text-mut">
              {audience}
            </span>
          ) : null}
        </span>
        <span
          className="whitespace-nowrap rounded-full px-3 py-[5px] text-xs font-bold"
          style={STATUS_STYLE[status]}
        >
          {t(STATUS_KEY[status] as 'statusUtkast')}
        </span>
        {recurrence ? (
          <span
            className="inline-block rounded-full px-[10px] py-1 text-[11.5px] font-semibold"
            style={{ background: 'var(--sbg)' }}
          >
            ↻ {recurrence}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-[9px]">
        {liveMode ? (
          <Link
            href={`/undersokelser/${surveyId}/live`}
            className="touch-44 flex cursor-pointer items-center whitespace-nowrap rounded-full border-none bg-ink px-[17px] py-[9px] text-[12.5px] font-bold text-sf no-underline"
          >
            {t('runLive')}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
