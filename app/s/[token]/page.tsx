import { createClient } from '@supabase/supabase-js'
import { NextIntlClientProvider } from 'next-intl'
import { getMergedMessages } from '@/lib/i18n/messages'
import { ACTIVE_LOCALES, SOURCE_LOCALE, isLocale, type Locale } from '@/lib/i18n/locales'
import type { RespondentQuestion } from '@/lib/respondent/answers'
import { Respondent } from './Respondent'
import { Closed } from './Closed'

/**
 * The respondent flow — HeiTuva.dc.html:1936-2130.
 *
 * Mobile-first and pixel-perfect at 380-420px per CLAUDE.md; the desktop view
 * is the same column centred, which is what the design's own phone frame shows.
 *
 * Three things make this route different from every other one in the app:
 *
 *  - There is no session. The reader is a person holding a link, so the only
 *    client here is built with the ANON key and the only data access is the two
 *    SECURITY DEFINER RPCs. No service-role key touches this path.
 *  - It must never be cached. The page is a function of a secret in the URL,
 *    and a cached render is that secret's contents served to whoever asks next.
 *  - The token is not logged, not put in an error message, and not passed to
 *    anything that might serialise it.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

type TokenSurvey = {
  error?: string
  survey_id: string
  round_id: string
  title: string
  org_name: string | null
  org_default_lang: string | null
  invitation_lang: string | null
  anonymity: 'anonymous' | 'named' | 'optional'
  /** V2-10: `standard` | `live` | `quiz`. Chrome only — a quiz draws tiles. */
  run_mode?: string
  k_threshold?: number
  respondent_kind?: string
  engage: Record<string, unknown> | null
  langs: string[] | null
  already_responded: boolean
  questions: RespondentQuestion[]
}

/**
 * The implementation plan's chain for this surface: per-invitation `lang`, then
 * the link's own `?lang=`, then the org default, then `no`.
 *
 * A language is only offered if the SURVEY was built in it (`surveys.langs`)
 * and the product actually serves it (`ACTIVE_LOCALES` — sv and da are seeded
 * but not shipped). Without the first test a `?lang=` would render a survey in
 * a language none of its questions were written in, which reads as a broken
 * translation rather than a language choice.
 */
function resolveRespondentLocale(
  survey: Pick<TokenSurvey, 'invitation_lang' | 'org_default_lang' | 'langs'>,
  requested: string | undefined,
): { locale: Locale; offered: Locale[] } {
  const offered = (survey.langs ?? [SOURCE_LOCALE])
    .filter(isLocale)
    .filter((l) => ACTIVE_LOCALES.includes(l))
  const available = offered.length ? offered : [SOURCE_LOCALE]

  const candidates = [requested, survey.invitation_lang, survey.org_default_lang]
  for (const c of candidates) {
    if (isLocale(c) && available.includes(c)) return { locale: c, offered: available }
  }
  return { locale: available[0]!, offered: available }
}

export default async function RespondentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { token } = await params
  const { lang: requested } = await searchParams

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // First call resolves the language; the payload does not depend on it beyond
  // the echo, so one round trip is enough.
  const { data, error } = await supabase.rpc('get_survey_for_token', {
    p_token: token,
    p_lang: SOURCE_LOCALE,
  })

  // A bad token and a closed round are the same screen on purpose: a distinct
  // "no such token" would let someone probe which tokens exist.
  if (error || !data) {
    const messages = await getMergedMessages(SOURCE_LOCALE)
    return (
      <NextIntlClientProvider locale={SOURCE_LOCALE} messages={messages}>
        <Closed />
      </NextIntlClientProvider>
    )
  }

  const survey = data as unknown as TokenSurvey
  if (survey.error) {
    const messages = await getMergedMessages(SOURCE_LOCALE)
    return (
      <NextIntlClientProvider locale={SOURCE_LOCALE} messages={messages}>
        {/* `replaced` is the one case worth distinguishing: a reminder rotated
            this token and its 72-hour grace window has passed (D42). Everything
            else — unknown, closed, bounced, expired — stays one screen. */}
        <Closed reason={survey.error === 'replaced' ? 'replaced' : 'closed'} />
      </NextIntlClientProvider>
    )
  }

  const { locale, offered } = resolveRespondentLocale(survey, requested)
  const messages = await getMergedMessages(locale)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Respondent
        token={token}
        locale={locale}
        offeredLocales={offered}
        orgName={survey.org_name ?? ''}
        title={survey.title}
        anonymity={survey.anonymity}
        quizMode={survey.run_mode === 'quiz'}
        kThreshold={typeof survey.k_threshold === 'number' ? survey.k_threshold : 5}
        respondentKind={survey.respondent_kind === 'organisation' ? 'organisation' : 'person'}
        engage={survey.engage ?? {}}
        alreadyResponded={survey.already_responded}
        questions={Array.isArray(survey.questions) ? survey.questions : []}
      />
    </NextIntlClientProvider>
  )
}
