import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { initialsOf, requireViewer } from '@/lib/auth/session'
import { ACTIVE_LOCALES, LOCALES, type Locale } from '@/lib/i18n/locales'
import { AboutMeCard } from './AboutMeCard'
import { NotifyCard } from './NotifyCard'
import { LanguageCard } from './LanguageCard'
import { NOTIFY_KEYS, type NotifyKey } from './notify-keys'

/**
 * Profil — built against HeiTuva.dc.html:1294-1370.
 *
 * Layout from the design: a 1.15fr/.85fr grid under an avatar header, left
 * column "Om meg" then "Varsler", right column "Språk" (on --sbg) then
 * "Pålogging og enheter".
 */
export default async function ProfilePage() {
  const viewer = await requireViewer()
  const t = await getTranslations('profile')
  const tRole = await getTranslations('role')
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, job_title, phone, lang, notify')
    .eq('user_id', viewer.userId)
    .maybeSingle()

  // Named FK: org_members and groups are related twice (member's group, and
  // group's lead), so an unqualified embed is ambiguous and returns an error.
  const { data: member } = await supabase
    .from('org_members')
    .select('email, groups!org_members_group_id_fkey(name)')
    .eq('user_id', viewer.userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  const group = (member?.groups as unknown as { name: string } | null)?.name ?? null
  const notifyRaw = (profile?.notify as Record<string, boolean> | null) ?? {}
  const notify = Object.fromEntries(
    NOTIFY_KEYS.map((k) => [k, notifyRaw[k] !== false]),
  ) as Record<NotifyKey, boolean>

  return (
    <main className="animate-enter max-w-[900px] pt-[34px]">
      <div className="flex items-center gap-[18px]">
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-ac3 text-[22px] font-bold">
          {initialsOf(viewer.displayName)}
        </span>
        <div className="flex-1">
          <h1 className="font-display text-[28px] font-medium">{viewer.displayName}</h1>
          {/* Design renders "Rolle · Gruppe · Firma"; the group segment is
              dropped when the member is in no group rather than showing an
              empty separator. */}
          <p className="mt-[3px] text-[13px] text-mut">
            {[tRole(viewer.role), group, viewer.orgName].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[1.15fr_.85fr] items-start gap-[18px]">
        <div className="flex flex-col gap-[18px]">
          <AboutMeCard
            defaults={{
              display_name: profile?.display_name ?? viewer.displayName,
              job_title: profile?.job_title ?? '',
              phone: profile?.phone ?? '',
              email: member?.email ?? viewer.email,
            }}
            labels={{
              heading: t('aboutMe'),
              name: t('fName'),
              email: t('fEmail'),
              jobTitle: t('fTitleField'),
              phone: t('fPhone'),
              roleNote: t('roleNote'),
              emailReadOnly: t('emailReadOnly'),
              save: t('saveChanges'),
              saved: t('saved'),
              failed: t('saveFailed'),
            }}
          />

          <NotifyCard
            heading={t('notifications')}
            initial={notify}
            items={NOTIFY_KEYS.map((key) => ({
              key,
              label: t(labelKeyFor(key)),
              desc: t(descKeyFor(key)),
            }))}
            failedLabel={t('saveFailed')}
          />
        </div>

        <div className="flex flex-col gap-[18px]">
          <LanguageCard
            heading={t('language')}
            note={t('langNote')}
            current={(profile?.lang as Locale) ?? viewer.locale}
            locales={LOCALES.map((l) => ({
              value: l,
              active: ACTIVE_LOCALES.includes(l),
            }))}
            comingLabel={t('comingSoonBadge')}
            failedLabel={t('saveFailed')}
          />

          <section className="rounded-[18px] border border-line bg-sf p-6">
            <h2 className="text-[16px] font-semibold">{t('sessions')}</h2>
            <div className="mt-3 flex flex-col gap-0.5">
              {/* Supabase does not expose a per-user device list to the client;
                  only the current session is knowable here. The design's
                  three-device list is therefore not reproducible — see
                  docs/DEVIATIONS.md D13. */}
              <div className="flex items-center gap-3 border-b border-line py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{viewer.email}</span>
                  <span className="mt-0.5 block text-[12px] text-mut">{t('thisSession')}</span>
                </span>
                <span className="whitespace-nowrap text-[12px] text-mut">{t('thisDevice')}</span>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-[1.55] text-mut">{t('sessionsNote')}</p>
            <form action={signOutEverywhere}>
              <button
                type="submit"
                className="mt-4 w-full cursor-pointer rounded-[10px] border border-line bg-transparent p-3 text-[13px] font-semibold text-ink"
              >
                {t('signOutEverywhere')}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}

function labelKeyFor(k: NotifyKey) {
  return ({ digest: 'nDigest', low_response: 'nLowResp', new_text: 'nNewText', shared: 'nShared' } as const)[k]
}
function descKeyFor(k: NotifyKey) {
  return ({ digest: 'nDigestDesc', low_response: 'nLowRespDesc', new_text: 'nNewTextDesc', shared: 'nSharedDesc' } as const)[k]
}

async function signOutEverywhere() {
  'use server'
  const { signOut } = await import('@/app/(auth)/logg-inn/actions')
  await signOut()
}
