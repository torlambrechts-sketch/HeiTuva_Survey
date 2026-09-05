import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Logo, Wordmark } from '@/components/Logo'
import { AppNav } from '@/components/AppNav'
import { LangPicker } from '@/components/LangPicker'
import { UserMenu } from '@/components/UserMenu'
import { MobileNav } from '@/components/MobileNav'
import { initialsOf, type Viewer } from '@/lib/auth/session'
import type { Locale } from '@/lib/i18n/locales'

/**
 * Nav order and labels come from the design's `screens` array (~line 2942).
 * The active-state treatment lives in AppNav, which knows the pathname.
 *
 * Below `md` the nav, the "Ny undersøkelse" CTA and the language switcher move
 * into MobileNav's slide-over (docs/RESPONSIVE.md § App shell). Together they
 * were 505px wider than a 390px viewport, which is D12. Desktop is untouched.
 */
const NAV = [
  { href: '/oversikt', key: 'dash' },
  { href: '/undersokelser', key: 'surveys' },
  { href: '/dashboard', key: 'dashboard' },
  { href: '/bibliotek', key: 'library' },
  { href: '/rapporter', key: 'reports' },
] as const

export async function AppHeader({ viewer }: { viewer: Viewer }) {
  const t = await getTranslations('nav')

  return (
    <header className="mx-5 mt-4 flex items-center justify-between gap-4 rounded-[16px] border border-line bg-sf px-[26px] py-4 md:gap-0">
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
            menu: t('userMenu'),
            profile: t('myProfile'),
            administration: t('administration'),
            privacy: t('privacyGdpr'),
          }}
        />
      </div>
    </header>
  )
}
