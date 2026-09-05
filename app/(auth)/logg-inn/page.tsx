import { getTranslations } from 'next-intl/server'
import { Logo, Wordmark } from '@/components/Logo'
import { entraAvailable } from '@/lib/auth/entra'
import { SignInForm } from './SignInForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string }>
}) {
  const t = await getTranslations('auth')
  const { feil } = await searchParams
  // The callback and the SSO gate send people back here with a reason.
  const notice =
    feil === 'sso' ? t('ssoRequired') : feil === 'sso-start' ? t('ssoStartFailed') : null

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="animate-enter w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-[9px]">
          <Logo />
          <Wordmark />
        </div>

        <div className="rounded-[18px] border border-line bg-sf p-6">
          <h1 className="font-display text-[21px] font-medium">{t('signInTitle')}</h1>
          <p className="mt-1 text-[13px] leading-[1.55] text-mut">{t('signInSub')}</p>
          {notice ? (
            <p role="alert" className="mt-3 rounded-[11px] px-[14px] py-[11px] text-[13px]" style={{ background: 'var(--sbg)' }}>
              {notice}
            </p>
          ) : null}
          <SignInForm
            entra={await entraAvailable()}
            labels={{
              email: t('email'),
              password: t('password'),
              signIn: t('signIn'),
              sendLink: t('sendLink'),
              linkSent: t('linkSent'),
              invalid: t('invalid'),
              entra: t('signInEntra'),
            }}
          />
        </div>
      </div>
    </main>
  )
}
