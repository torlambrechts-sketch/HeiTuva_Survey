import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Logo, Wordmark } from '@/components/Logo'
import { LangPicker } from '@/components/LangPicker'
import { UserMenu } from '@/components/UserMenu'
import { initialsOf, type Viewer } from '@/lib/auth/session'
import type { Locale } from '@/lib/i18n/locales'

/** Nav order and labels come from the design's `screens` array (~line 2942).
 *  Active state is weight 600 / opacity 1; inactive 400 / .62 — from the
 *  header markup, not invented. */
const NAV = [
  { href: '/', key: 'dash' },
  { href: '/undersokelser', key: 'surveys' },
  { href: '/dashboard', key: 'dashboard' },
  { href: '/bibliotek', key: 'library' },
  { href: '/rapporter', key: 'reports' },
] as const

export async function AppHeader({ viewer, active }: { viewer: Viewer; active: string }) {
  const t = await getTranslations('nav')

  return (
    <header className="mx-5 mt-4 flex items-center justify-between rounded-[16px] border border-line bg-sf px-[26px] py-4">
      <Link href="/" className="flex items-center gap-[9px] no-underline text-ink">
        <Logo />
        <Wordmark />
      </Link>

      <nav className="flex gap-[30px]">
        {NAV.map((item) => {
          const on = active === item.key
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={on ? 'page' : undefined}
              className="border-none bg-transparent text-[13px] text-ink no-underline"
              style={{ fontWeight: on ? 600 : 400, opacity: on ? 1 : 0.62 }}
            >
              {t(item.key)}
            </Link>
          )
        })}
      </nav>

      <div className="relative flex items-center gap-[9px]">
        <Link
          href="/undersokelser/ny"
          className="cursor-pointer whitespace-nowrap rounded-[9px] border-none bg-ac px-[17px] py-[9px] text-[12.5px] font-semibold text-ink no-underline"
        >
          {t('newSurvey')}
        </Link>

        <LangPicker current={viewer.locale as Locale} />

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
