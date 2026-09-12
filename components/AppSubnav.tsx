'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The subnav — v5's shell addition (V5:227-234).
 *
 * A `--sbg` strip attached under the header INSIDE the shell card, carrying an
 * 11px uppercase label and a rail of pills. The header squares its bottom
 * corners where this is present, which is what v5's `headRadius` is for.
 *
 * ── WHICH SCREENS, AND WHY NOT FIVE ────────────────────────────────────────
 *
 * The bundle puts it on five: `uitest`, `admin`, `tasks`, `dashboard`,
 * `reports`. It ships on THREE, and each exclusion is a measurement rather than
 * a preference (D164):
 *
 *   * `uitest` is «Tabellvarianter», a table-variant playground. It is 23 of
 *     v5's 45 new states and no phase builds it, so there is no screen for a
 *     subnav to sit on.
 *   * `admin` ALREADY HAS THIS NAVIGATION IN-PAGE. `AdminTabs` renders nine
 *     tabs; the bundle's subnav list for admin has SIX — it is missing Profil
 *     og avsender, Målgrupper and Språk. The bundle draws BOTH rails on that
 *     one screen, two lines apart, and its own in-page `adminTabs` has eight.
 *     So the six-item list is not a decision to remove three tabs; it is an
 *     enumeration of the tabs that existed when it was drawn — the fifth row of
 *     CLAUDE.md's table, one screen over. **Two controls doing one job, one of
 *     them three tabs out of date, is worse than one control.** If a later
 *     phase wants the subnav here, what it replaces is `AdminTabs` — it does
 *     not supplement it.
 *
 * `dashboard` and `reports` are where it earns its place: the pills are
 * CROSS-SCREEN navigation between two routes that today are only reachable from
 * the header. That is new, and it is the reason to build the thing at all.
 *
 * ── `subnavLabel` HAS FOUR BRANCHES FOR FIVE SCREENS ───────────────────────
 * `uitest` -> «Tabellvarianter», `tasks` -> «Arbeidsliste», `admin` ->
 * «Administrasjon», and everything ELSE -> «Innsikt», so `dashboard` and
 * `reports` share a label. Built as drawn; noted because «a label per screen»
 * is true of three of the five.
 */
type Item = { label: string; href: string }

export function AppSubnav({
  labels,
}: {
  labels: { insight: string; dashboard: string; reports: string; tasks: string }
}) {
  const pathname = usePathname()

  let label: string | null = null
  let items: Item[] = []

  if (pathname === '/dashboard' || pathname === '/rapporter') {
    label = labels.insight
    items = [
      { label: labels.dashboard, href: '/dashboard' },
      { label: labels.reports, href: '/rapporter' },
    ]
  }

  // The Arbeidsliste's own Alt/Oppgaver/Tilbakemeldinger rail belongs to that
  // screen's filter state, not to the shell, so V5-2 renders it inside the
  // screen where the filter lives. The label is declared here so the shell owns
  // the vocabulary in one place.
  if (label === null) return null

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-b-[15px] border-t border-line bg-sbg py-2 pl-[18px] pr-3.5"
    >
      {/* `touch-cluster`, not a hand-picked gap. The pills are `py-[7px]` — 30px
          painted — and globals.css has already done this arithmetic for exactly
          that control: a 44px hit area overflows (44-30)/2 = 7px each side, so
          adjacent pills need 14px between painted edges, where the drawing has
          2px. The utility is scoped to `max-width:767px`, so desktop keeps the
          drawn 2px and only touch widths get the spacing.
          `verify:responsive` blocked on this at 320px — «Dashboard»/«Rapporter»
          overlapping by 225px² — which is CLAUDE.md's row 10 arriving a third
          time: the constant belongs to the control, not to the pattern. */}
      <span className="touch-cluster flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
        <span className="mr-3 flex-none whitespace-nowrap text-[11px] uppercase tracking-[.09em] text-mut">
          {label}
        </span>
        {items.map((it) => {
          const on = pathname === it.href
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={on ? 'page' : undefined}
              className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[9px] border-none px-[13px] py-[7px] text-[13.5px] text-ink no-underline hover:bg-sf"
              style={{
                background: on ? 'var(--sf)' : 'transparent',
                fontWeight: on ? 700 : 500,
                opacity: on ? 1 : 0.7,
              }}
            >
              {it.label}
            </Link>
          )
        })}
      </span>
    </nav>
  )
}
