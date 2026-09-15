import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { STATUS_BAR, type ListRow } from '@/lib/surveys/list-row'
import { STATUS_COLORS } from './keys'

/**
 * F4 — the card grid (v6:2395-2410), which is `svView === 'kort'`.
 *
 * This is the view the app already had, and the audit's finding was not that it
 * was wrong but that it was the ONLY one: «tre visninger ble én, og det ble den
 * bundelen viser sist». So it is rebuilt to the drawing's card rather than kept
 * as the old row list, and it reads the same `ListRow` the table and the detail
 * panel read — one derivation, three renderings.
 *
 * The percentage and the bar are ABSENT where there is no denominator, which is
 * the same rule the other two follow. v6:2405 would print `{{ s.pct }} %` from
 * `target || 30`.
 *
 * The «Åpne» affordance is the whole card, as the drawing has it (a `<button>`
 * there, a `<Link>` here — the destination is a route, and a link is what a
 * route deserves: middle-click, copy-link and the keyboard all work).
 */
export async function SurveyCards({ rows }: { rows: ListRow[] }) {
  const t = await getTranslations('surveys')

  return (
    <div className="grid gap-3.5 px-[22px] pb-[22px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
      {rows.map((r) => {
        const pill = STATUS_COLORS[r.status as keyof typeof STATUS_COLORS]
        return (
          <Link
            key={r.id}
            href={`/undersokelser/${r.id}/bygg`}
            className="flex min-w-0 flex-col items-stretch rounded-2xl border-[1.5px] border-line bg-bg px-5 py-[18px] text-left text-ink no-underline"
          >
            <span className="flex items-center justify-between gap-2.5">
              <span
                className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: pill?.bg, color: pill?.fg }}
              >
                {t(`status_${r.status}` as 'status_aktiv')}
              </span>
              {/* v6:2400 draws `{{ s.version }}` here. There is no version
                  column; the sent date is the fact this survey actually has,
                  and «—» where it has never been sent. */}
              <span className="whitespace-nowrap text-[11.5px] text-mut">
                {r.sentLabel ?? t('colNoSent')}
              </span>
            </span>

            <span className="mt-3 block text-pretty font-display text-[19px] font-medium leading-[1.25]">
              {r.title}
            </span>
            <span className="mt-1 block text-[12.5px] text-mut">{r.audience}</span>

            {r.pct === null ? (
              /* No denominator: the count, and no bar. The drawing's card has
                 no such branch because its fixture always had a target. */
              <span className="mt-3.5 block text-[12px] text-mut">
                {t('colResponsesOnly', { n: r.responses })}
              </span>
            ) : (
              <span className="mt-3.5 flex items-center gap-2.5">
                <span className="block h-[7px] flex-1 overflow-hidden rounded-full bg-sf2">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${r.pct}%`, background: STATUS_BAR[r.status] }}
                  />
                </span>
                <span className="whitespace-nowrap text-xs font-semibold">{r.pct} %</span>
              </span>
            )}

            <span className="mt-2.5 block text-xs text-mut">
              {t('cardMeta', { q: r.questionCount })}
              {r.ownerName ? ` · ${r.ownerName}` : ''}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
