import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Logo, Wordmark } from '@/components/Logo'
import { AppNav } from '@/components/AppNav'
import { LangPicker } from '@/components/LangPicker'
import { UserMenu } from '@/components/UserMenu'
import { MobileNav } from '@/components/MobileNav'
import { WideToggle } from '@/components/WideToggle'
import { WorkspaceChip } from '@/components/WorkspaceChip'
import { readWorkspace } from '@/lib/workspace/current'
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
const NAV = [
  { href: '/oversikt', key: 'dash' },
  { href: '/undersokelser', key: 'surveys' },
  // V2-4: the fifth item, and it is THIRD rather than last — V2:4790 draws
  // `dash, surveys, tasks, insight, library`. Added here with the screen it
  // points to, per the plan: a nav item reaching a route that does not exist
  // is the same defect as a link to a page nobody drew (Q56, D73).
  { href: '/oppgaver', key: 'tasks' },
  { href: '/dashboard', key: 'insight' },
  { href: '/bibliotek', key: 'library' },
] as const

export async function AppHeader({ viewer }: { viewer: Viewer }) {
  const t = await getTranslations('nav')
  const ws = await readWorkspace(viewer.orgId)

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
    <header className="frame mt-4 flex flex-wrap items-center gap-x-3 gap-y-3 rounded-[16px] border border-line bg-sf py-3 pl-[18px] pr-[14px] shadow-[0_6px_20px_rgba(25,21,16,.05)] xl:flex-nowrap">
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

      {/* V4:175 — `gap:6px`, `flex:none`. */}
      <div className="relative flex flex-none items-center gap-1.5">
        <Link
          href="/undersokelser/ny"
          className="hidden cursor-pointer whitespace-nowrap rounded-[9px] border-none bg-ac px-[17px] py-[9px] text-[12.5px] font-semibold text-ink no-underline md:block"
        >
          {t('newSurvey')}
        </Link>

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

        {/* V4:181-190. Absent rather than faked when the registry has not been
            seeded — CLAUDE.md's never-fabricate rule: a chip showing an
            invented workspace is indistinguishable from a real one. */}
        {ws ? (
          <WorkspaceChip
            current={ws.current}
            options={ws.all}
            label={t('workspace')}
            title={t('workspaceTitle')}
          />
        ) : null}

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
        />
      </div>
    </header>
  )
}
