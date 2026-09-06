import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ComplianceChip } from './OverviewScreen'

/**
 * "Lovpålagte frister" — HeiTuva.dc.html:334-357.
 *
 * The v1 bundle replaces Oversikt's chip row with a dark card-button: a
 * headline count, a twelve-month timeline with a dot per duty, and the same
 * duties listed with a deadline chip. The whole card is the link — the bundle
 * makes it one `<button onClick="{{ goCompliance }}">` (:334) opening Rapporter's
 * lov tab (:4279) — `/rapporter?fane=lov` here (`rapporter/page.tsx:34-35`) — so
 * it is one `<Link>` rather than a card with a link inside it.
 *
 * Every value is derived from real duty rows in `oversikt/page.tsx`. The bundle
 * hard-codes both the summary ("2 av 4 plikter krever handling i år", :4278) and
 * a four-row timeline array (:4272-4277); rendering those numbers would put an
 * invented compliance claim on the first screen anyone opens, which is the one
 * place CLAUDE.md's never-fabricate rule matters most.
 */
export async function ComplianceCard({
  compliance,
  urgent,
}: {
  compliance: ComplianceChip[]
  urgent: number
}) {
  const t = await getTranslations('dash')

  // The bundle's chip foregrounds are literal hexes (:4273-4276), not theme
  // tokens: the palette has no "text on --ac3" colour, and these three exist so
  // the chip label stays legible on each tint. Carried verbatim rather than
  // substituted, per the fidelity rule.
  const fg: Record<string, string> = {
    'var(--ac3)': '#8A4B22',
    'var(--ac2)': '#2F5D2A',
    'var(--ac)': '#8A6A12',
  }

  return (
    <Link
      href="/rapporter?fane=lov"
      className="flex min-w-0 cursor-pointer flex-col self-stretch rounded-[18px] border-none px-[22px] py-5 text-sf no-underline"
      style={{ background: 'var(--ink)' }}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[.1em] opacity-70">
          {t('statutoryDeadlines')}
        </span>
        <span className="text-[12px] opacity-70">{t('seeAll')}</span>
      </span>

      <span className="mt-[10px] font-display text-[22px] font-medium leading-[1.2]">
        {/* No drawn state for an organisation with nothing due (D92): the
            bundle's own summary always names a number. "0 av 4 plikter krever
            handling i år" is true but reads as a warning that is not one, so the
            zero case gets its own sentence. */}
        {urgent === 0
          ? t('complianceNoneUrgent')
          : t('complianceSummary', { urgent, total: compliance.length })}
      </span>

      {/* The axis. `pos` is a percentage over twelve months, computed per render
          in page.tsx — see the note there on why it is not a column. */}
      <span
        className="relative mt-[22px] block h-[6px] rounded-full"
        style={{ background: 'rgba(255,253,246,.16)' }}
        aria-hidden="true"
      >
        {compliance.map((c) => (
          <span
            key={c.key}
            title={`${c.title} · ${c.law}`}
            className="absolute -top-[5px] -ml-2 block h-4 w-4 rounded-full"
            style={{ left: `${c.pos}%`, background: c.tone, border: '3px solid var(--ink)' }}
          />
        ))}
      </span>
      <span className="mt-2 flex justify-between text-[11px] opacity-60" aria-hidden="true">
        <span>{t('axisNow')}</span>
        <span>{t('axisTwelveMonths')}</span>
      </span>

      {/* The list carries the same duties as text, which is what a screen reader
          and a 390px viewport both get instead of the bar. */}
      <span className="mt-4 flex flex-1 flex-col gap-[9px]">
        {compliance.map((c) => (
          <span key={c.key} className="flex items-center gap-[10px]">
            <span
              className="block h-2 w-2 flex-none rounded-full"
              style={{ background: c.tone }}
            />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
              {c.title}
            </span>
            <span
              className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[12px] font-semibold"
              style={{ background: c.tone, color: fg[c.tone] ?? 'var(--ink)' }}
            >
              {c.when}
            </span>
          </span>
        ))}
      </span>
    </Link>
  )
}
