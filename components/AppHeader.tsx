import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Logo, Wordmark } from '@/components/Logo'
import { AppNav } from '@/components/AppNav'
import { AppSubnav } from '@/components/AppSubnav'
/* V7-1 — `AppSubnav` takes NO props. It used to take a fifteen-field `labels`
   object built here out of four registries and three message namespaces, so a
   new screen's rail needed an edit in three files. The rails are
   `lib/shell/subnav.ts` now and resolve their own messages; the three imports
   and two `getTranslations` calls that fed this went with them. */
import { LangPicker } from '@/components/LangPicker'
import { UserMenu } from '@/components/UserMenu'
import { MobileNav } from '@/components/MobileNav'
import { WideToggle } from '@/components/WideToggle'
import { WorkspaceChip } from '@/components/WorkspaceChip'
import { readWorkspace } from '@/lib/workspace/current'
import { readDashboards } from '@/lib/shell/dashboards'
import { initialsOf, type Viewer } from '@/lib/auth/session'
import type { Locale } from '@/lib/i18n/locales'

/**
 * Nav order and labels come from the design's `screens` array — four items in
 * the v1 bundle (HeiTuva.dc.html:3513), where Dashboard and Rapporter are
 * merged into one "Innsikt" item and the choice between them moves to a rail
 * beside each screen's heading (components/InsightTabs.tsx).
 *
 * The item points at /dashboard, which is where the design's own `go('insight')`
 * lands when nothing was opened before (`insightLast || "dashboard"`, :3222).
 * Its active state covers both routes; AppNav owns that mapping.
 *
 * Below `md` the nav, the "Ny undersøkelse" CTA and the language switcher move
 * into MobileNav's slide-over (docs/RESPONSIVE.md § App shell). Together they
 * were 505px wider than a 390px viewport, which is D12. Desktop is untouched.
 */
/**
 * N1 — v8's THREE items, `v8:8310` verbatim:
 *
 *     const screens = [["insight","Innsikt"],["surveys","Undersøkelser"],["tasks","Oppgaver"]];
 *
 * The app carried FIVE (`dash, surveys, tasks, insight, library`, v2:4790).
 * v8 collapses them: `insight` covers dash/dashboard/reports and `surveys`
 * covers library/packdetail, both by v8's own `on` predicate at v8:8411. So
 * Oversikt, Dashboard, Rapporter and Bibliotek stop being top-level and are
 * reached through the SUBNAV, which v8 gives to every screen but `results`
 * (v8:9289). Tor chose this explicitly (alternativ A) after the measurement.
 *
 * ONE DEVIATION, AND IT IS COPY RATHER THAN STRUCTURE. v8's third label is
 * «Oppgaver»; ours stays «Handlinger». Q123 refused «Oppgaver» — it is untrue
 * of half that screen's content — and § 0.3 puts copy under DECISIONS.md
 * rather than under the bundle. Order, keys, geometry and active-state logic
 * are v8's unchanged.
 *
 * `insight` points at /dashboard, where the design's own `go('insight')` lands
 * when nothing was opened before (`insightLast || "dashboard"`, :3222).
 */
const NAV = [
  { href: '/dashboard', key: 'insight' },
  { href: '/undersokelser', key: 'surveys' },
  { href: '/oppgaver', key: 'tasks' },
] as const

export async function AppHeader({ viewer }: { viewer: Viewer }) {
  const t = await getTranslations('nav')

  const ws = await readWorkspace(viewer.orgId)

  /* N2 — the Innsikt rail's dashboard pills need the organisation's boards, and
     the header is the only server component that renders on every screen the
     rail can appear on. Fetched unconditionally rather than per-route: the
     header cannot read the pathname (it is a server component, which is the
     same constraint that put the subnav's radius in CSS), so «only fetch on
     Innsikt screens» is not expressible here. One indexed select on
     `dashboards_org_idx`, and `AppSubnav` returns null on every other screen
     without ever reading the array. */
  const dashboards = await readDashboards(viewer.orgId, viewer.userId)

  return (
    // The frame, the wrap and the 14/26 padding are the v1 bundle's
    // (HeiTuva.dc.html:160). The header shares the column with every screen
    // below it instead of carrying its own margin.
    /* W1 · V4:160. `flex-wrap:nowrap`, `gap:12px`, padding `12px 14px 12px 18px`,
       and a shadow the flat frame did not have.

       `nowrap` IS AN xl RULE HERE, NOT AN UNCONDITIONAL ONE, and the reason is
       measured rather than assumed. v4's own header overflows its box at 320px
       with the SHORT nav label — 63px of header overflow and 26px of page
       overflow, before any label of ours — so `nowrap` is a property of the
       ≥1280px design, which is the only width v4 governs. Below it CLAUDE.md
       hands the question to docs/RESPONSIVE.md, and the answer there is the
       one this header already had: wrap. */
    /* V5-1 — THE SHELL IS NOW A CARD CONTAINING THE HEADER, not a header that
       IS the card. v5:160 moves `width`, `max-width`, `margin`, `border`,
       `border-radius:16px` and the shadow onto a WRAPPER, and leaves the
       `<header>` with a background and `border-radius:{{ headRadius }}` only —
       15px, or `15px 15px 0 0` where a subnav attaches.

       The 15px is not a drift from the theme's 16px: an inner fill inside a
       16px border needs one pixel less or the border shows through at the
       corner. v4 had no `headRadius` key at all because its header WAS the
       outer card. */
    <div className="shell-card frame relative z-30 mt-4 rounded-[16px] border border-line shadow-[0_6px_20px_rgba(25,21,16,.05)]">
    {/* The header's radius is decided in CSS by `.shell-card:has(> nav)`, not
        here. AppHeader is a SERVER component and cannot read the pathname, and
        `overflow:hidden` on the wrapper — the other way to get these corners —
        would clip the user menu and the mobile nav, which are absolutely
        positioned precisely to escape this box. `:has()` keys the radius on
        whether the subnav ACTUALLY RENDERED rather than on a second copy of the
        rule about which screens get one, so the two cannot disagree. */}
    <header className="flex flex-wrap items-center gap-x-3 gap-y-3 bg-sf py-3 pl-[18px] pr-[14px] xl:flex-nowrap">
      {/* The logo goes to Oversikt, not to `/` — `/` is the public splash now,
          and a signed-in user clicking their own product's wordmark should not
          land on the marketing page. */}
      {/* V4:161 — `gap:8px`, `flex:none`, `margin-right:10px`; the wordmark
          gains `white-space:nowrap` (V4:168) so the logo block cannot become
          the thing that wraps. */}
      <Link
        href="/oversikt"
        className="touch-44 flex flex-none items-center gap-2 whitespace-nowrap text-ink no-underline xl:mr-2.5"
      >
        <Logo />
        <Wordmark />
      </Link>

      <div className="hidden min-w-0 flex-1 md:block">
        <AppNav items={NAV.map((n) => ({ href: n.href, key: n.key, label: t(n.key) }))} />
      </div>

      {/* V4:175 — `gap:6px`, `flex:none`.

          N5 · `touch-cluster` — AND IT IS N3'S BILL, PAID WITH THE UTILITY
          BUILT FOR EXACTLY THIS. `verify:responsive` reported **50 blockers,
          every one of them the same pair**: «Hjelp og støtte» / «Åpne meny»
          overlapping by 88px², on 25 states at both 390px and 320px.

          The cause is N3 and nothing else: v7 drew `?` · Arbeidsflate-chip ·
          avatar (v7:182), and v8 moves the chip into the user menu (v8:192).
          The chip was what held the two round buttons apart. Removing it left
          the drawn `gap:6px` between a 34px `?` and the 38px menu button,
          whose 44px hit areas overflow (44-34)/2 = 5px and (44-38)/2 = 3px —
          8px of demand against 6px of gap, so 2px of collision over the 44px
          height. 2 x 44 = 88px², which is the number the gate printed.

          `touch-cluster` is `gap:14px !important` scoped to `max-width:767px`,
          so the BUNDLE'S 6px survives at every width v8 governs and only touch
          widths get clearance. That is globals.css's own rule, in its own
          comment: «spacing is layout and may change; the control is a token
          and may not», and «a finding count in the hundreds is one systemic
          fix, not hundreds of edits». Fifty findings, one class. */}
      <div className="touch-cluster relative flex flex-none items-center gap-1.5">
        {/* W1 — «Ny undersøkelse» IS NOT IN THIS HEADER ANY MORE, and it is the
            third control v4 displaced rather than a feature dropped.

            The FIRST bundle drew it here (D89 quotes `HeiTuva.dc.html:181-183`:
            a round icon button «between «Ny undersøkelse» and the language
            globe»), so it was fidelity when it was built. v4 clears the row of
            all three: the width toggle and the language picker move into the
            user menu (V4:196), and the CTA is drawn on the pages instead —
            V4:268 on Oversikt and V4:1082 on Undersøkelser.

            BOTH DESTINATIONS ARE ALREADY BUILT — `OverviewScreen.tsx:111` and
            `undersokelser/page.tsx:186` — checked before removing this, because
            a control removed from the one place it existed is a feature
            deleted, and a control removed from the third place it exists is
            fidelity.

            It also happens to be what over-filled the row: `verify:visual`
            photographed the nav wrapped to two lines at 1440px, with
            «Bibliotek» alone on the second. The measurement I took before
            building was on v4's OWN header, which never had this button. */}
        {/* V2:180 — the «?» that opens Hjelp og støtte. Added with the screen it
            points at: a header control reaching a route that does not exist is
            the same defect as a link to a page nobody drew. */}
        <Link
          href="/hjelp"
          aria-label={t('helpAndSupport')}
          title={t('helpAndSupport')}
          /* V4:180 — 38px -> 34px, with the rest of the cluster. */
          className="touch-44 inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-line bg-transparent p-0 text-[16px] font-bold text-ink no-underline"
        >
          ?
        </Link>

        {/* N3 — THE ARBEIDSFLATE CHIP IS NOT IN THIS ROW ANY MORE, and it is
            the fourth control v4/v8 displaced rather than a feature dropped.
            v7:182 drew it here between «?» and the avatar; v8:192 draws the
            identical chip inside the user menu, under its own label and over
            the registry's hint. It is passed to `UserMenu` as
            `workspaceSlot` below — same component, same props, same tint and
            dot, one level in.

            The row v8 leaves behind is two 34px circles, which is also why
            this header no longer needs the wrap arithmetic that the chip's
            width forced. */}

        <MobileNav
          items={NAV.map((n) => ({ href: n.href, key: n.key, label: t(n.key) }))}
          newSurveyHref="/undersokelser/ny"
          newSurveyLabel={t('newSurvey')}
          openLabel={t('openMenu')}
          closeLabel={t('closeMenu')}
          langSlot={<LangPicker current={viewer.locale as Locale} />}
        />

        <UserMenu
          name={viewer.displayName}
          initials={initialsOf(viewer.displayName)}
          role={viewer.role}
          labels={{
            menu: t('userMenu', { name: viewer.displayName }),
            profile: t('myProfile'),
            administration: t('administration'),
            privacy: t('privacyGdpr'),
          }}
          langSlot={<LangPicker current={viewer.locale as Locale} />}
          wideSlot={<WideToggle wideLabel={t('wide')} narrowLabel={t('narrow')} />}
          /* Absent rather than faked when the registry has not been seeded —
             CLAUDE.md's never-fabricate rule: a chip showing an invented
             workspace is indistinguishable from a real one, and a labelled
             section over nothing claims a choice that is not there. */
          workspaceSlot={
            ws ? (
              <WorkspaceChip
                current={ws.current}
                options={ws.selectable}
                label={t('workspace')}
                title={t('workspaceTitle')}
              />
            ) : null
          }
          workspaceLabel={t('workspace')}
          workspaceHint={ws?.current.hint}
        />
      </div>
    </header>
      <AppSubnav dashboards={dashboards} />
    </div>
  )
}
