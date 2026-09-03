import Link from 'next/link'

/**
 * A filter chip. Chips are links, not buttons, so a filtered view is
 * shareable and survives a reload — the prototype keeps this in local state,
 * which no URL can express.
 *
 * `touch-44` per RESPONSIVE.md rule 2: the painted chip keeps its design size
 * at every breakpoint and only the hit area grows, below md.
 */
export function ChipLink({
  href,
  active,
  children,
  variant = 'outline',
}: {
  href: string
  active: boolean
  children: React.ReactNode
  variant?: 'outline' | 'segment'
}) {
  if (variant === 'segment') {
    // The pill-rail treatment: --sf and a shadow when on, transparent when off
    // (HeiTuva.dc.html:1562, :3718).
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="touch-44 cursor-pointer rounded-full border-none px-4 py-[7px] text-[12.5px] font-semibold text-ink no-underline"
        style={{
          background: active ? 'var(--sf)' : 'transparent',
          boxShadow: active ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
        }}
      >
        {children}
      </Link>
    )
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="touch-44 cursor-pointer rounded-full border border-line px-4 py-2 text-[12.5px] font-semibold text-ink no-underline"
      style={{ background: active ? 'var(--ac)' : 'transparent' }}
    >
      {children}
    </Link>
  )
}
