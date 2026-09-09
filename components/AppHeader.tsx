import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Logo, Wordmark } from '@/components/Logo'
import { AppNav } from '@/components/AppNav'
import { LangPicker } from '@/components/LangPicker'
import { UserMenu } from '@/components/UserMenu'
import { MobileNav } from '@/components/MobileNav'
import { WideToggle } from '@/components/WideToggle'
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

  return (
    // The frame, the wrap and the 14/26 padding are the v1 bundle's
    // (HeiTuva.dc.html:160). The header shares the column with every screen
    // below it instead of carrying its own margin.
    <header className="frame mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[16px] border border-line bg-sf px-[26px] py-[14px]">
      {/* The logo goes to Oversikt, not to `/` — `/` is the public splash now,
          and a signed-in user clicking their own product's wordmark should not
          land on the marketing page. */}
      <Link href="/oversikt" className="touch-44 flex items-center gap-[9px] text-ink no-underline">
        <Logo />
        <Wordmark />
      </Link>

      <div className="hidden md:block">
        <AppNav items={NAV.map((n) => ({ href: n.href, key: n.key, label: t(n.key) }))} />
      </div>

      <div className="relative flex items-center gap-[9px]">
        <Link
          href="/undersokelser/ny"
          className="hidden cursor-pointer whitespace-nowrap rounded-[9px] border-none bg-ac px-[17px] py-[9px] text-[12.5px] font-semibold text-ink no-underline md:block"
        >
          {t('newSurvey')}
        </Link>

        <WideToggle wideLabel={t('wide')} narrowLabel={t('narrow')} />

        {/* V2:180 — the «?» that opens Hjelp og støtte. Added with the screen it
            points at: a header control reaching a route that does not exist is
            the same defect as a link to a page nobody drew. */}
        <Link
          href="/hjelp"
          aria-label={t('helpAndSupport')}
          title={t('helpAndSupport')}
          className="touch-44 inline-flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-line bg-transparent p-0 text-[16px] font-bold text-ink no-underline"
        >
          ?
        </Link>

        <span className="hidden md:inline-flex">
          <LangPicker current={viewer.locale as Locale} />
        </span>

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
        />
      </div>
    </header>
  )
}
