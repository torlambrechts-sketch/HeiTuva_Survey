import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { getMergedMessages } from '@/lib/i18n/messages'
import { isLocale, SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { TestRunner } from './TestRunner'

/**
 * «Svar selv» — test mode. V2:6637 enters it, V2:6638 leaves it, and the banners
 * are V2:3323 and V2:3558. DECISIONS **Q76 DEFAULTED, not answered.**
 *
 * ── THE TOKEN IS MINTED HERE, AND THAT IS THE DESIGN ───────────────────────
 *
 * The respondent flow is reached with a token and nothing else — no session, no
 * org membership. Test mode does not change that: this route mints a **test
 * invitation** on the current round, addressed to the editor, and then renders
 * the ordinary respondent component with `testMode`. So the preview walks the
 * real path, including `app.resolve_token`, and the write is stopped by
 * `p_dry_run` in `submit_response` rather than by anything on this page.
 *
 * Two consequences worth stating, because both were choices:
 *
 *  - **The editor's own invitation is used, never a recipient's.** An earlier
 *    reading would have let an editor preview through any live token, and
 *    `submit_response` marks `responded_at` and clears the grace window — so a
 *    preview would have silently burned a real person's link. That is blocker 3
 *    in `tests/db/test-mode.test.ts`, and it is why the dry run returns before
 *    the invitation is touched at all.
 *  - **Only someone who may edit the survey may test it.** A preview renders the
 *    questions, so it is a read of the survey's content and takes the same
 *    authority as editing it.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TestModePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requireViewer()
  const supabase = await createClient()

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, org_id, title, anonymity, respondent_kind, k_threshold, engage, langs, status, run_mode')
    .eq('id', id)
    .maybeSingle()
  if (!survey || survey.org_id !== viewer.orgId) notFound()
  if (viewer.role === 'leser') notFound()

  const { data: token } = await supabase.rpc('mint_test_token', { p_survey: id })
  const minted = token as { error?: string; token?: string } | null
  const locale = await getLocale()
  const active: Locale = isLocale(locale) ? locale : SOURCE_LOCALE
  const messages = await getMergedMessages(active, viewer.orgId)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TestRunner
        surveyId={id}
        token={minted?.token ?? null}
        error={minted?.error ?? (minted?.token ? null : 'no_round')}
      />
    </NextIntlClientProvider>
  )
}
