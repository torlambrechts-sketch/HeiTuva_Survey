import Link from 'next/link'

/**
 * A «Bruksområder» card — V1:1877-1891.
 *
 * DECISIONS Q24: the six use cases are a registry, so the label, description
 * and tint are DATA. What the card computes is what it knows about the
 * customer's own library: how many templates the use case has, how many of
 * those are statutory, and how many surveys this organisation is running under
 * it.
 *
 * Two buttons, and they go to different places: «Se maler» filters the
 * templates tab by this use case, «Dashboard» loads the shipped preset the
 * registry row points at.
 */
export function UseCaseCard({
  label,
  description,
  tint,
  examples,
  countLine,
  liveLine,
  templatesHref,
  dashboardHref,
  labels,
}: {
  label: string
  description: string
  tint: string | null
  /** The first three template titles, as the bundle shows (NEW:3702). */
  examples: string[]
  countLine: string
  liveLine: string
  templatesHref: string
  /** Null when the registry row points at no preset — the button is then not
   *  drawn, rather than drawn and inert. */
  dashboardHref: string | null
  labels: { templates: string; dashboard: string }
}) {
  return (
    <div
      className="flex flex-col rounded-[18px] border border-line p-[22px]"
      style={{ background: tint ?? 'var(--sf)' }}
    >
      <div className="font-display text-[21px] font-medium leading-[1.25]">{label}</div>
      <div className="mt-[6px] text-[13px] leading-[1.5] text-mut">{description}</div>
      <div className="mt-[14px] flex flex-1 flex-wrap content-start gap-[6px]">
        {examples.map((e) => (
          <span
            key={e}
            className="rounded-full border border-line bg-sf px-[10px] py-[5px] text-[12px] text-mut"
          >
            {e}
          </span>
        ))}
      </div>
      <div className="mt-[14px] text-[12.5px] text-mut">
        {countLine} · {liveLine}
      </div>
      <div className="touch-cluster mt-3 flex gap-2">
        <Link
          href={templatesHref}
          className="touch-44 flex-1 rounded-[10px] bg-ac p-[10px] text-center text-[13px] font-semibold text-acf no-underline"
        >
          {labels.templates}
        </Link>
        {dashboardHref ? (
          <Link
            href={dashboardHref}
            className="touch-44 flex-1 rounded-[10px] border border-line bg-sf p-[10px] text-center text-[13px] font-semibold text-ink no-underline"
          >
            {labels.dashboard}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
