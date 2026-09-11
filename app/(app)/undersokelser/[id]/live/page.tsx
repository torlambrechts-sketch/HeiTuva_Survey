import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { SurveyContextBar } from '../SurveyContextBar'
import { LiveStage, type CloudWord, type LiveBar } from './LiveStage'

/**
 * Live — V2:1829–1927, the presenter's screen.
 *
 * ── WHAT IS BUILT HERE AND WHAT DELIBERATELY IS NOT ────────────────────────
 *
 * `docs/v2/07-v2-9-opening.md` measured the drawing before this was written,
 * and the measurement decided the scope. **The only Live surface any bundle
 * draws is this one — inside the app shell, wrapping by construction.** The
 * `fullscreen` toggle («Presentasjonsvisning», V2:6134) names a projected
 * surface that is drawn NOWHERE, so Q81 and Q82 do not arise and nothing here
 * invents one: the absence is left visible, as `helpForum` (Q74), Q26's stream
 * panel and `admin.mgPopulationsUnavailable` already are.
 *
 * Of the four cards the design draws below the stage, **one has real data**:
 *
 * | Card | State | Why |
 * |---|---|---|
 * | Ordsky | **BUILT** | `public.live_cloud` — Q79, a pure aggregate |
 * | Prioriteringsøvelse | not built | «Deltakerne fordelte 100 poeng» needs a points-allocation question type. The registry has thirteen and `ranking` orders rather than distributes, so there is no schema behind the card and 38/27/21/14 would be four invented numbers |
 * | Deltakerspørsmål | not built | **Q80**, confirmed defaulted: `audienceQuestions` is off in the bundle already and ships unimplemented |
 * | Kunngjøringsskjerm | not built | `closingLines` are announcements a presenter writes («torsdager blir møtefrie fra oktober»). Nothing in the schema holds them |
 *
 * Each renders the unavailable treatment rather than being dropped, so a reader
 * can tell *not built* from *not there* — `help_articles.requires_flag`'s rule.
 */
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requireViewer()
  const t = await getTranslations('live')
  const supabase = await createClient()

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, org_id, title, audience_label, status, anonymity, run_mode, k_threshold')
    .eq('id', id)
    .maybeSingle()
  if (!survey || survey.org_id !== viewer.orgId) notFound()

  const { data: round } = await supabase
    .from('survey_rounds')
    .select('id, round_no, status')
    .eq('survey_id', id)
    .order('round_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('id, code, status, revealed, expires_at')
    .eq('survey_id', id)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const open = session && session.status === 'open' && new Date(session.expires_at) > new Date()

  // The first free-text question is the cloud's subject. The design draws one
  // cloud, not one per question, so the choice is made here rather than offered.
  const { data: textQuestion } = await supabase
    .from('survey_questions')
    .select('id, text')
    .eq('survey_id', id)
    .eq('type', 'text')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  let cloud: { words: CloudWord[]; floor: number; gated: boolean } | null = null
  if (textQuestion && round) {
    const { data } = await supabase.rpc('live_cloud', {
      p_survey: id,
      p_question: textQuestion.id,
      p_round: round.id,
      p_lang: 'no',
    })
    const payload = data as
      | { words?: { word: string; n: number }[]; floor?: number; insufficient_data?: boolean }
      | null
    if (payload) {
      cloud = {
        words: payload.words ?? [],
        floor: payload.floor ?? 0,
        gated: payload.insufficient_data === true,
      }
    }
  }

  // The reveal's bars. `aggregate_results` is the existing k-gated path — this
  // screen adds no second answer to «what may be shown», it asks the same one.
  const { data: firstScale } = await supabase
    .from('survey_questions')
    .select('id, text')
    .eq('survey_id', id)
    .in('type', ['scale', 'likert', 'smiley'])
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  let bars: LiveBar[] = []
  let barsGated = false
  let answered = 0
  if (firstScale && round) {
    // The real return shape, read from `app.aggregate_rows` rather than assumed:
    // `{ k, questions: [{ question_id, n, distribution: [{value, count}],
    // insufficient_data }] }`. The first draft of this file called it with a
    // `p_question` argument it does not take and destructured a `distribution`
    // of `{label, n}` — it type-checked, because `rpc` returns `Json`, and would
    // have rendered an empty chart for ever. Corrected against the catalogue.
    const { data } = await supabase.rpc('aggregate_results', { p_survey: id, p_round: round.id })
    const agg = data as { questions?: Record<string, unknown>[] } | null
    const row = (agg?.questions ?? []).find((qq) => qq.question_id === firstScale.id)
    if (row?.insufficient_data === true) barsGated = true
    answered = typeof row?.n === 'number' ? row.n : 0
    const dist = (row?.distribution ?? []) as { value: unknown; count: number }[]
    bars = dist.map((d) => ({ label: String(d.value), n: d.count }))
  }

  const k = survey.k_threshold ?? 5

  // The QR is generated from the join URL, not drawn. A hand-made cell grid
  // that merely LOOKS like a QR is the never-fabricate rule applied to a
  // control: it would photograph correctly and scan to nothing.
  //
  // THE ORIGIN COMES FROM THE REQUEST, not from an env var. The first draft
  // wrote `process.env.NEXT_PUBLIC_SITE_URL ?? ''`, and **that variable does not
  // exist in this project** — measured, `.env.local` defines only the two
  // Supabase ones. The QR would have encoded `/l/ABC123` with an empty origin:
  // a code that renders, photographs correctly, survives a screenshot diff, and
  // scans to nothing. The never-fabricate rule applied to a control rather than
  // to a number. `SendScreen.tsx:268` uses `window.location.origin` for the
  // same reason; this is the server-side form of it.
  const h = await headers()
  const host = h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  const joinUrl = open && host ? `${proto}://${host}/l/${session!.code}` : null
  const qrSvg = joinUrl
    ? await QRCode.toString(joinUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 })
    : null

  return (
    <>
      <SurveyContextBar
        surveyId={id}
        title={survey.title}
        audience={survey.audience_label}
        status={(survey.status ?? 'utkast') as 'utkast' | 'aktiv' | 'lukket'}
        current="resultater"
      />
      <LiveStage
        surveyId={id}
        orgId={survey.org_id}
        roundId={round?.id ?? null}
        title={survey.title}
        isLiveMode={survey.run_mode === 'live'}
        session={
          session && open
            ? { id: session.id, code: session.code, revealed: session.revealed }
            : null
        }
        qrSvg={qrSvg}
        joinUrl={joinUrl}
        k={k}
        answered={answered}
        bars={bars}
        barsGated={barsGated}
        barsQuestion={firstScale?.text ?? null}
        cloud={cloud}
        cloudQuestion={textQuestion?.text ?? null}
        strings={{
          heading: t('heading'),
          reveal: t('reveal'),
          hide: t('hide'),
          settings: t('settings'),
          open: t('open'),
          close: t('close'),
          noRound: t('noRound'),
          notLiveMode: t('notLiveMode'),
          noSession: t('noSession'),
          scanHint: t('scanHint'),
          guard: t('guard'),
          counterHidden: t('counterHidden', { k }),
          counter: t('counter', { n: answered }),
          barsGated: t('barsGated', { k }),
          cloudTitle: t('cloudTitle'),
          cloudFloor: t('cloudFloor', { floor: cloud?.floor ?? 0 }),
          cloudGated: t('cloudGated', { k }),
          cloudEmpty: t('cloudEmpty', { floor: cloud?.floor ?? 0 }),
          cloudNoQuestion: t('cloudNoQuestion'),
          priorityTitle: t('priorityTitle'),
          priorityUnavailable: t('priorityUnavailable'),
          audienceTitle: t('audienceTitle'),
          audienceUnavailable: t('audienceUnavailable'),
          closingTitle: t('closingTitle'),
          closingUnavailable: t('closingUnavailable'),
          fullscreenTitle: t('fullscreenTitle'),
          fullscreenUnavailable: t('fullscreenUnavailable'),
        }}
      />
    </>
  )
}
