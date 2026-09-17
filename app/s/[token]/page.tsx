import { createClient } from '@supabase/supabase-js'
import { NextIntlClientProvider } from 'next-intl'
import { getMergedMessages } from '@/lib/i18n/messages'
import { ACTIVE_LOCALES, SOURCE_LOCALE, isLocale, type Locale } from '@/lib/i18n/locales'
import type { RespondentQuestion } from '@/lib/respondent/answers'
import { respondentFlow } from '@/lib/respondent/flow'
import { retentionOf } from '@/lib/surveys/retention'
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
  /** C3 — carried by `get_survey_for_token` since M:0100. */
  feedback_mode?: 'off' | 'anonymous' | 'named' | 'optional' | null
  /** M:0119 — whether a reply can reach the holder of THIS token. False for a
   *  share link or QR voucher: no invitation exists to attach an answer to. */
  has_thread?: boolean | null
  /** V2-10: `standard` | `live` | `quiz`. Chrome only — a quiz draws tiles. */
  run_mode?: string
  k_threshold?: number
  respondent_kind?: string
  /** M:0121 — the organisation's own retention, for the anonymity sheet (Q187).
   *  Two scalars rather than `organizations.privacy`, because only the value a
   *  decision names may reach a respondent-facing surface. */
  retention_months?: number | null
  retention_auto_delete?: boolean | null
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
        /* A payload from a database that has not run M:0100 yet would omit it.
           `off` is the safe reading of a missing value: it renders no control,
           which is the state every existing survey was backfilled to anyway. */
        feedbackMode={survey.feedback_mode ?? 'off'}
        /* A payload from a database without M:0119 omits it, and `false` is the
           safe reading: the box then promises no reply, which is true of a share
           link and merely understated for an invitation. The opposite default
           would promise an answer that cannot arrive — the defect this closes. */
        hasThread={survey.has_thread === true}
        quizMode={survey.run_mode === 'quiz'}
        kThreshold={typeof survey.k_threshold === 'number' ? survey.k_threshold : 5}
        respondentKind={survey.respondent_kind === 'organisation' ? 'organisation' : 'person'}
        /* Q187. `retentionOf` is the SAME function the manager's Personvern tab
           calls, so the two accounts of how long answers are kept cannot drift.

           A payload from a database without M:0121 omits both fields, and the
           safe reading is «not deleted automatically»: it understates the
           protection rather than promising a deletion that does not happen,
           which is the direction the bundle's hard-coded «24 måneder» got
           wrong. */
        retention={retentionOf({
          retention_months: survey.retention_months ?? null,
          privacy:
            survey.retention_auto_delete === undefined || survey.retention_auto_delete === null
              ? {}
              : { auto_delete: survey.retention_auto_delete },
        })}
        engage={survey.engage ?? {}}
        alreadyResponded={survey.already_responded}
        /* V7-3c — parsed HERE, on the server, and handed over as a decision.
           `respondentFlow` is the only place that reads a snapshot entry's
           `kind`, so the page, the flow and the media route cannot form three
           answers to «is this a block». It is also where `media_key` stops:
           the client is told THAT there is a picture, never where it is. */
        flow={respondentFlow(survey.questions)}
      />
    </NextIntlClientProvider>
  )
}
