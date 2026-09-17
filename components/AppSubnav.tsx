'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { resolveSubnav, type MsgRef, type SubnavPill } from '@/lib/shell/subnav'

/**
 * The subnav — v5's shell addition (V5:227-234), REBUILT ON A REGISTRY in V7-1.
 *
 * A `--sbg` strip attached under the header INSIDE the shell card, carrying an
 * 11px uppercase label and a rail of pills. The header squares its bottom
 * corners where this is present, which is what v5's `headRadius` is for.
 *
 * ── THIS FILE NO LONGER KNOWS WHICH SCREENS HAVE A RAIL ───────────────────
 *
 * It had five `if (pathname === …)` branches and a fifteen-field `labels` prop
 * that `AppHeader` filled. Both are gone: `lib/shell/subnav.ts` answers «which
 * rail, which pills, which one is current», and this file renders it. **An
 * eighth screen is a row in the registry and no edit here** — which is the
 * whole point, and is F3's breadcrumb lesson applied to the surface F3 treated
 * as one case.
 *
 * The decisions about WHICH screens carry the rail have not changed and are
 * written where they belong, in the registry's own entries: `admin`'s rail stays
 * in the page (D164 — the bundle's six-item list is missing three tabs the app
 * has, and two controls doing one job with one of them out of date is worse
 * than one control), `bibliotek`'s is here by Tor's Q172, and the Innsikt
 * rail's fifth pill is refused in writing rather than left as a gap.
 *
 * ── TWO KINDS OF PILL, RENDERED DIFFERENTLY ───────────────────────────────
 *
 * A `filter` narrows or moves within the set the rail names, and lights when it
 * is current. An `exit` LEAVES the set — v7 draws four of them, «Undersøkelsen»
 * on send and build and «Bygger» on surveys and svdetail — and can never be
 * current, so a renderer that decides emphasis by `current === id` gives every
 * exit the inactive treatment. That is «a jump rendered as a filter is a pill
 * that never lights». Three of v7's four are `weight:700` at full opacity and
 * never pilled; that is the treatment below.
 *
 * **No exit ships yet** — the two rails that carry one are V7-2's — so this
 * branch is built and unreached. It is built anyway because the alternative is
 * that V7-2 adds the pill and inherits the filter treatment silently, which is
 * exactly the defect this type exists to make unrepresentable.
 */
type Rendered = { pill: SubnavPill; on: boolean }

export function AppSubnav() {
  const pathname = usePathname()
  const params = useSearchParams()

  /* Three namespaces, resolved here and chosen per pill by the registry's own
     `MsgRef`. A bare key resolved in the wrong namespace renders as a raw key
     on a shipped screen, which is the defect Tor found nine of behind seventeen
     green gates — so the namespace travels WITH the key. */
  const tNav = useTranslations('nav')
  const tReports = useTranslations('reports')
  const tSurveys = useTranslations('surveys')
  const say = (m: MsgRef) =>
    m.ns === 'reports'
      ? tReports(m.key as 'tabLov')
      : m.ns === 'surveys'
        ? tSurveys(m.key as 'filterAll')
        : tNav(m.key as 'subnavInsight')

  const rail = resolveSubnav(pathname, new URLSearchParams(params.toString()))
  if (!rail) return null

  const items: Rendered[] = rail.pills.map((pill) => ({
    pill,
    // An exit is never current — the registry's `railFaults` asserts it, and
    // this expression could not express it wrongly even if it were not.
    on: pill.kind === 'filter' && pill.id === rail.currentId,
  }))

  return (
    <nav
      aria-label={say(rail.label)}
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
          {say(rail.label)}
        </span>
        {items.map(({ pill, on }) => {
          const exit = pill.kind === 'exit'
          return (
            <Link
              key={pill.id}
              href={pill.href}
              aria-current={on ? 'page' : undefined}
              className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[9px] border-none px-[13px] py-[7px] text-[13.5px] text-ink no-underline hover:bg-sf"
              style={{
                // v7:8898, 8907, 8934 — an exit is never pilled, and it carries
                // the drawing's own `weight:"700"` and `textOpacity:"1"`
                // REGARDLESS of state, which is the property the old
                // `currentHref === href` expression could not hold.
                background: on ? 'var(--sf)' : 'transparent',
                fontWeight: on || exit ? 700 : 500,
                opacity: on || exit ? 1 : 0.7,
              }}
            >
              {say(pill.label)}
            </Link>
          )
        })}
      </span>
    </nav>
  )
}
