'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CRUMBS, crumbFor } from '@/lib/shell/crumbs'

/**
 * F3 — the breadcrumb, rendered by the SHELL from `lib/shell/crumbs.ts`.
 *
 * It mounts once in `app/(app)/layout.tsx` and renders nothing on a route the
 * registry gives no entry. That is the whole point: the audit found this
 * surface drawn on five screens and built on two, because a shared surface has
 * no owner when phases are per-screen. A sixth screen now inherits it by
 * gaining a registry row.
 *
 * ── «Oversikt» IS A LINK, WHICH THE DRAWING'S IS NOT ───────────────────────
 *
 * v6 draws both segments as bare `<span>`s — a breadcrumb that cannot be
 * clicked. The root goes to `/oversikt` here, which is the one thing a reader
 * expects of the control and the only reason it is not purely decorative. The
 * leaf stays a `<span>`: it is the page you are on, and a link to here is
 * noise. Logged as a deviation.
 *
 * ── THE ICON IS A SWITCH, NOT A LOOKUP TABLE OF PATHS ──────────────────────
 *
 * Three icons, keyed by the registry's `icon`, quoted from the drawing's own
 * paths. Handlinger has none and gets `gap-[9px]` instead of `gap-[10px]`,
 * because that is what v6:3667 does.
 */
function CrumbIcon({ kind }: { kind: 'surveys' | 'insight' | 'library' }) {
  if (kind === 'surveys') {
    // v6:2122-2125
    return (
      <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="6" y="5" width="20" height="22" rx="3" stroke="var(--ink)" strokeWidth="2.6" />
        <path d="M11 12h10M11 17h10M11 22h6" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'insight') {
    // v6:2471
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M5 19V11M12 19V5M19 19v-6" />
      </svg>
    )
  }
  // v6:4614
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ink)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5h7v15H4zM13 5h7v15h-7z" />
      <path d="M6.5 9h2M15.5 9h2" />
    </svg>
  )
}

export function Breadcrumb() {
  const t = useTranslations('crumb')
  const key = crumbFor(usePathname())
  if (!key) return null
  const crumb = CRUMBS[key]

  return (
    /* v6:2120 — the crumb is the first thing inside the screen's own
       `padding-top:26px`, so the shell carries that padding and the five pages
       below start at zero. */
    <nav
      aria-label={t('label')}
      className={`frame animate-enter flex items-center pt-[26px] text-[12.5px] text-mut ${
        crumb.icon ? 'gap-[10px]' : 'gap-[9px]'
      }`}
    >
      {crumb.icon ? (
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px]"
          style={{ background: crumb.tint! }}
        >
          <CrumbIcon kind={crumb.icon} />
        </span>
      ) : null}
      <Link href="/oversikt" className="touch-44 text-mut no-underline hover:underline">
        {t('root')}
      </Link>
      <span className="opacity-50">→</span>
      <span className="font-semibold text-ink">{t(crumb.leaf)}</span>
    </nav>
  )
}
