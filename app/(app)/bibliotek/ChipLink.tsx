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
  variant?: 'outline' | 'segment' | 'rail' | 'toggle'
}) {
  /*
    Q173 — the Arbeidsliste's two header controls, as LINKS.

    Tor, 2026-09-13, with the Arbeidsliste header in front of him: «this style
    for heading, filter and under bibliotek». So the library's filter is the
    dark-pill rail (v5:3179) and its view switch is the Liste/Tavle toggle
    (v5:3184) — the same paint, pixel for pixel, as `WorklistPanel` draws them.

    **THEY STAY LINKS, AND THAT IS NOT A DETAIL.** The Arbeidsliste's scope is
    component state and its chips are buttons; the library's filters live in the
    URL, so a filtered library is shareable and survives a reload. Turning these
    into buttons to match would substitute a control and lose that. Only the
    paint is copied.

    `py-[7px]` is 30px painted, so both rails carry `touch-cluster`: a 44px hit
    area overflows (44-30)/2 = 7px each side, adjacent chips need 14px between
    painted edges, and `globals.css` has done that arithmetic once. CLAUDE.md
    row 10 — the constant belongs to the CONTROL, and it fired on the
    Arbeidsliste's own rail in C4.
  */
  if (variant === 'rail') {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="touch-44 cursor-pointer whitespace-nowrap rounded-lg border-none px-3.5 py-[7px] text-xs font-semibold no-underline"
        style={{
          background: active ? 'var(--ink)' : 'transparent',
          color: active ? 'var(--sf)' : 'var(--ink)',
        }}
      >
        {children}
      </Link>
    )
  }

  if (variant === 'toggle') {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="touch-44 cursor-pointer whitespace-nowrap rounded-lg border-none px-[13px] py-[7px] text-xs font-semibold text-ink no-underline"
        style={{
          background: active ? 'var(--sf)' : 'transparent',
          boxShadow: active ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
        }}
      >
        {children}
      </Link>
    )
  }

  if (variant === 'segment') {
    // The pill-rail treatment: --sf and a shadow when on, transparent when off
    // (L:1562, :3718).
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
