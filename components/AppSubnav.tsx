'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  resolveSubnav,
  type MsgRef,
  type SubnavDashboard,
  type SubnavPill,
} from '@/lib/shell/subnav'

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
 * **V7-2 ships the first exit** — the survey rail's «Bygger» — and it is the
 * DORMANT one: v7 draws it `weight:"500"` at `.7`, a member of the set's array
 * forced never to light by an explicit `&& k !== "bygger"` (`v7:8923`). The
 * three bold exits are `.concat`-ed after their sets and do not ship yet, so
 * both emphases exist here and only one is reached. The pill declares which;
 * see `emphasis` in the registry for why it is declared rather than derived.
 */
type Rendered = { pill: SubnavPill; on: boolean }

export function AppSubnav({ dashboards = [] }: { dashboards?: SubnavDashboard[] }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()

  /* Four namespaces, resolved here and chosen per pill by the registry's own
     `MsgRef`. A bare key resolved in the wrong namespace renders as a raw key
     on a shipped screen, which is the defect Tor found nine of behind seventeen
     green gates — so the namespace travels WITH the key. */
  const tNav = useTranslations('nav')
  const tReports = useTranslations('reports')
  const tSurveys = useTranslations('surveys')
  /* T5.1 — the builder rail's group labels. */
  const tBuilder = useTranslations('builder')
  /* `raw` is a title the person typed, not a message. Sending it through
     next-intl would miss and render it as a key — the defect Tor found nine of
     behind seventeen green gates, arriving from the other direction. */
  const say = (m: MsgRef) =>
    m.ns === 'raw'
      ? m.key
      : m.ns === 'reports'
      ? tReports(m.key as 'tabLov')
      : m.ns === 'surveys'
        ? tSurveys(m.key as 'filterAll')
        : m.ns === 'builder'
          ? tBuilder(m.key as 'tabAdd')
          : tNav(m.key as 'subnavInsight')

  const rail = resolveSubnav(pathname, new URLSearchParams(params.toString()), dashboards)
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

          /* N3 · v8:238-241 — THE «FLERE OPPSETT» ITEM IS A NATIVE `<select>`,
             not a pill. Every declaration below is that line's:

               box-sizing:border-box · flex:none · height:32px · padding:0 10px
               border:1px solid var(--line) · border-radius:9px
               background:transparent · color:var(--ink)
               font-size:13px · font-family:inherit · font-weight:600
               outline:none · cursor:pointer

             A `<select>` is a REPLACED element, so `touch-44` — whose hit area
             is an `::after` — renders nothing on it. `touch-44-field` exists in
             globals.css for exactly this, with the reason in its own comment,
             and taking the wrong one of the two is the mistake C4 made on
             `FeedbackList`'s select. 32px painted needs the field variant.

             `value=""` on every render, as v8's is: the placeholder is not a
             selection, and re-selecting a board you are already on must still
             navigate. */
          if (pill.kind === 'more') {
            return (
              <select
                key={pill.id}
                aria-label={say(pill.label)}
                value=""
                onChange={(e) => {
                  if (e.target.value) router.push(e.target.value)
                }}
                className="touch-44-field h-[32px] flex-none cursor-pointer rounded-[9px] border border-line bg-transparent px-[10px] text-[13px] font-semibold text-ink outline-none"
                style={{ fontFamily: 'inherit', boxSizing: 'border-box' }}
              >
                {/* v8's own placeholder is «Flere oppsett …», one character
                    different from the control's accessible name — and the
                    ellipsis is punctuation a language has an opinion about
                    («Flere oppsett …» spaced, «More layouts…» not), so it is
                    its own key rather than a concatenation. */}
                <option value="">{tNav('subnavMoreChoose')}</option>
                {(pill.options ?? []).map((o) => (
                  <option key={o.href} value={o.href}>
                    {say(o.label)}
                  </option>
                ))}
              </select>
            )
          }

          return (
            <Link
              key={pill.id}
              href={pill.href}
              aria-current={on ? 'page' : undefined}
              className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[9px] border-none px-[13px] py-[7px] text-[13.5px] text-ink no-underline hover:bg-sf"
              style={{
                // An exit is never pilled, and its emphasis does not depend on
                // state — which is the property the old `currentHref === href`
                // expression could not hold. `bold` is v7:8898, 8907 and 8934;
                // `dormant` is v7:8922-8928, where the drawing puts an exit
                // inside the set's own array and forces it never to light.
                background: on ? 'var(--sf)' : 'transparent',
                fontWeight: on || (exit && pill.emphasis !== 'dormant') ? 700 : 500,
                opacity: on || (exit && pill.emphasis !== 'dormant') ? 1 : 0.7,
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
