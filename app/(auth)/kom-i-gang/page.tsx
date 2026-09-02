import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Logo, Wordmark } from '@/components/Logo'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/auth/session'
import { OnboardingForm } from './OnboardingForm'

/**
 * First-run org creation. A signed-in user with no membership had nowhere to go
 * before this existed: middleware bounces them off /logg-inn to /, and the app
 * layout bounced them back to /logg-inn — a redirect loop with no way out.
 *
 * The design bundle has no signup screen (it opens on a populated org), so this
 * is built from the same primitives as the login card — docs/DEVIATIONS.md D21.
 */
export default async function OnboardingPage() {
  const viewer = await getViewer()
  if (viewer) redirect('/')

  const t = await getTranslations('onboarding')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/logg-inn')

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="animate-enter w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-[9px]">
          <Logo />
          <Wordmark />
        </div>

        <div className="rounded-[18px] border border-line bg-sf p-6">
          <h1 className="font-display text-[21px] font-medium">{t('title')}</h1>
          <p className="mt-1 text-[13px] leading-[1.55] text-mut">{t('sub')}</p>

          <OnboardingForm
            defaultName={user.email?.split('@')[0] ?? ''}
            labels={{
              company: t('fCompany'),
              orgnr: t('fOrgnr'),
              optional: t('optional'),
              name: t('fYourName'),
              create: t('create'),
              failed: t('failed'),
              already: t('already'),
              invalid: t('failed'),
            }}
          />

          <p className="mt-3.5 text-[12.5px] leading-[1.6] text-mut">{t('note')}</p>
        </div>
      </div>
    </main>
  )
}
