import { createClient } from '@supabase/supabase-js'
import { getLocale, getTranslations } from 'next-intl/server'
import { UseCases, type UseCaseView } from './UseCases'

/**
 * Bruksområder — `HeiTuva Bruksomrader.dc.html`, `UC` :184, `ORDER` :290.
 *
 * ── EVERY QUESTION COUNT ON THIS PAGE IS DERIVED, AND THAT IS THE PHASE ────
 *
 * The bundle hard-codes a count and a reading time per use case, and **all nine
 * were wrong against the seeded packs** — `psykososial` claimed 38 questions
 * where the pack has 7, `aktsomhet` 27 where it has 6, `trakassering` 16 where
 * it has 5. This is a PUBLIC page, so those are D73's «claims a capability the
 * product does not have», and CLAUDE.md's «never fabricate data in the UI»
 * with nine hard-coded numbers that look exactly like data.
 *
 * So the count comes from `template_packs.questions` and the reading time from
 * the count. The page cannot state a number the product does not have, and a
 * pack that gains a question updates the page without anybody editing it.
 *
 * **`medarbeider` has no pack at all** — the plan's «all nine already seeded as
 * packs» was one short. It renders with no count and says the template is not
 * finished, rather than inheriting the bundle's 38.
 */
export const revalidate = 300

/**
 * Which pack backs each use case. A row is the CLAIM this page makes about the
 * product; `tests/db/use-cases-page.test.ts` checks every key resolves, so a
 * renamed pack fails rather than silently showing no count.
 */
const PACK: Record<string, string | null> = {
  puls: 'ukentlig-puls',
  medarbeider: null,
  psykososial: 'psykososial-kartlegging',
  trakassering: 'trakassering-ytringsklima',
  likestilling: 'likestilling-deltid',
  aktsomhet: 'leverandor-apenhetsloven',
  onboarding: 'oppstartssjekk',
  kunde: 'csat',
  exit: 'sluttsamtale',
}
const ORDER = Object.keys(PACK)
const TINT: Record<string, string> = {
  puls: '#FBEBBE', medarbeider: '#F3E7DB', psykososial: '#FBD5C4', trakassering: '#FBD5C4',
  likestilling: '#FBD5C4', aktsomhet: '#CFE7E4', onboarding: '#F3E7DB', kunde: '#CFE7E4',
  exit: '#FCF6E9',
}

export default async function BruksomraderPage({
  searchParams,
}: {
  searchParams: Promise<{ sak?: string }>
}) {
  const sp = await searchParams
  const t = await getTranslations('usecases')
  const locale = await getLocale()

  // The anon key and no session: this is a public page, and it reads only the
  // shipped packs, which carry no org id.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: packs } = await supabase
    .from('template_packs')
    .select('key, questions')
    .is('org_id', null)

  const countOf = new Map(
    (packs ?? []).map((p) => [p.key, Array.isArray(p.questions) ? p.questions.length : 0]),
  )

  const cases: UseCaseView[] = ORDER.map((k) => {
    const packKey = PACK[k]
    const n = packKey ? (countOf.get(packKey) ?? null) : null
    return {
      key: k,
      tag: t(`${k}Tag` as 'pulsTag'),
      title: t(`${k}Title` as 'pulsTitle'),
      cadence: t(`${k}Cadence` as 'pulsCadence'),
      tint: TINT[k]!,
      intro: t(`${k}Intro` as 'pulsIntro'),
      // Null rather than a number we do not have. A «0 spørsmål» would read as
      // an empty template rather than as a missing one.
      questions: n && n > 0 ? n : null,
      setup: [1, 2, 3, 4].map((i) => ({
        label: t(`${k}SetupK${i}` as 'pulsSetupK1'),
        value: t(`${k}SetupV${i}` as 'pulsSetupV1'),
      })),
      why: [1, 2, 3].map((i) => t(`${k}Why${i}` as 'pulsWhy1')),
      types: t(`${k}Types` as 'pulsTypes'),
      examples: [1, 2, 3].map((i) => t(`${k}Ex${i}` as 'pulsEx1')),
      report: [1, 2, 3, 4].map((i) => t(`${k}Report${i}` as 'pulsReport1')),
      anonNote: t(`${k}AnonNote` as 'pulsAnonNote'),
      tipTitle: t(`${k}TipTitle` as 'pulsTipTitle'),
      tipBody: t(`${k}TipBody` as 'pulsTipBody'),
    }
  })

  return (
    <UseCases
      cases={cases}
      openKey={sp.sak && ORDER.includes(sp.sak) ? sp.sak : null}
      locale={locale}
      labels={{
        title: t('title'), lead: t('lead'), back: t('back'), setup: t('setup'), why: t('why'),
        types: t('types'), examples: t('examples'), report: t('report'), anonymity: t('anonymity'),
        noPack: t('noPack'), open: t('open'), startCta: t('startCta'),
        questionsOne: t('questions', { n: 1 }),
        questionsTemplate: t('questions', { n: '{n}' }),
      }}
    />
  )
}
