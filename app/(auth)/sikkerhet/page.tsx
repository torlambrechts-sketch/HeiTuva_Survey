import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Logo, Wordmark } from '@/components/Logo'
import { getViewer } from '@/lib/auth/session'
import { getMfaState } from '@/lib/auth/mfa'
import { signOut } from '@/app/(auth)/logg-inn/actions'
import { MfaForm } from './MfaForm'
import { EnrollPanel } from './EnrollPanel'

/**
 * TOTP gate for administrators (DECISIONS Q14, re-enabled in Phase 7).
 *
 * Two states: enrol, when the account has no verified factor, and challenge,
 * when it has one but this session is still aal1. The design bundle has no MFA
 * screen — it is built from the login card's primitives, docs/DEVIATIONS.md D22.
 */
export default async function SecurityPage() {
  const viewer = await getViewer()
  const mfa = await getMfaState()

  // Nothing to do here: either the session already carries aal2, or this user
  // is not an administrator and is not being asked for a factor.
  if (mfa.current === 'aal2' || (viewer && viewer.role !== 'administrator')) redirect('/')
  // Signed in but in no organization yet: onboarding, not the login screen —
  // sending them to /logg-inn would only bounce off the middleware.
  if (!viewer) redirect(mfa.current ? '/kom-i-gang' : '/logg-inn')

  const t = await getTranslations('mfa')
  const tCommon = await getTranslations('common')

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="animate-enter w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-[9px]">
          <Logo />
          <Wordmark />
        </div>

        <div className="rounded-[18px] border border-line bg-sf p-6">
          <h1 className="font-display text-[21px] font-medium">
            {mfa.enrolled ? t('verifyTitle') : t('enrollTitle')}
          </h1>
          <p className="mt-1 text-[13px] leading-[1.55] text-mut">
            {mfa.enrolled ? t('verifySub') : t('enrollSub')}
          </p>

          {mfa.enrolled && mfa.factorId ? (
            <MfaForm
              factorId={mfa.factorId}
              labels={{
                code: t('codeLabel'),
                verify: t('verify'),
                invalid: t('invalidCode'),
                failed: t('enrollFailed'),
              }}
            />
          ) : (
            <EnrollPanel
              labels={{
                start: t('enrollTitle'),
                secret: t('secretLabel'),
                code: t('codeLabel'),
                verify: t('verify'),
                invalid: t('invalidCode'),
                failed: t('enrollFailed'),
                unavailable: t('unavailable'),
              }}
            />
          )}

          <p className="mt-3.5 text-[12.5px] leading-[1.6] text-mut">{t('whyAdmin')}</p>

          <form action={signOut}>
            <button
              type="submit"
              className="touch-44 mt-4 w-full cursor-pointer rounded-[10px] border border-line bg-transparent p-3 text-[13px] font-semibold text-ink"
            >
              {tCommon('logout')}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
