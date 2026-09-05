import { getLocale, getTranslations } from 'next-intl/server'
import { Splash } from './Splash'

/**
 * The splash — `HeiTuva Splash.dc.html`, the design bundle's second prototype.
 *
 * `/` is public (see lib/supabase/middleware.ts). A signed-in visitor is
 * redirected to /oversikt before this renders, so this page never has to think
 * about a session.
 *
 * Every string comes from the `splash` namespace, seeded into `ui_messages`
 * like the rest — marketing copy is the copy most likely to be rewritten
 * without a deploy, so it belongs in the runtime store rather than in JSX.
 */
export const dynamic = 'force-dynamic'

export default async function SplashPage() {
  const t = await getTranslations('splash')
  const locale = await getLocale()

  /** `t` is not serialisable across the client boundary, so the copy is read
   *  here and handed down as plain strings. */
  const list = <T,>(n: number, build: (i: number) => T): T[] =>
    Array.from({ length: n }, (_, i) => build(i + 1))

  return (
    <Splash
      copy={{
        langLabel: t('langLabel'),
        locale,
        nav: list(5, (i) => ({
          label: t(`navShort${i}` as 'navShort1'),
          // The design's fifth link points at the app prototype; here it is the
          // real product, which a visitor with no account cannot open — so it
          // goes to the login, the same place "Logg inn" does.
          href: ['#svar', '#bruksomrader', '#lovpalagt', '#priser', '/logg-inn'][i - 1]!,
        })),
        login: t('login'),
        tryFree: t('tryFree'),
        or: t('or'),
        heroBadge: t('heroBadge'),
        heroLine1: t('heroLine1'),
        heroLine2: t('heroLine2'),
        heroBody: t('heroBody'),
        ctaMain: t('ctaMain'),
        ctaSee: t('ctaSee'),
        ctaDemo: t('ctaDemo'),
        risk: list(3, (i) => t(`risk${i}Label` as 'risk1Label')),
        proof: list(3, (i) => ({
          value: t(`proof${i}Value` as 'proof1Value'),
          label: t(`proof${i}Label` as 'proof1Label'),
        })),
        showKicker: t('showKicker'),
        showTitle: t('showTitle'),
        showBody: t('showBody'),
        chips: list(8, (i) => t(`chips${i}Label` as 'chips1Label')),
        heatTitle: t('heatTitle'),
        heatMeta: t('heatMeta'),
        heatCta: t('heatCta'),
        heatCols: list(4, (i) => t(`heatCols${i}Label` as 'heatCols1Label')),
        heatTeams: list(4, (i) => t(`heatTeams${i}` as 'heatTeams1')),
        few: t('few'),
        navWhy: t('navWhy'),
        driverTitle: t('driverTitle'),
        drivers: list(3, (i) => ({
          stat: t(`drivers${i}Stat` as 'drivers1Stat'),
          title: t(`drivers${i}Title` as 'drivers1Title'),
          desc: t(`drivers${i}Desc` as 'drivers1Desc'),
        })),
        navUse: t('navUse'),
        useTitle: t('useTitle'),
        useBody: t('useBody'),
        useCases: list(6, (i) => ({
          tag: t(`useCases${i}Tag` as 'useCases1Tag'),
          cadence: t(`useCases${i}Cadence` as 'useCases1Cadence'),
          title: t(`useCases${i}Title` as 'useCases1Title'),
          desc: t(`useCases${i}Desc` as 'useCases1Desc'),
          chips: list(3, (j) => t(`useCases${i}Chips${j}` as 'useCases1Chips1')),
        })),
        legalKicker: t('legalKicker'),
        legalTitle: t('legalTitle'),
        legalBody: t('legalBody'),
        legalCta: t('legalCta'),
        duties: list(4, (i) => ({
          title: t(`duties${i}Title` as 'duties1Title'),
          law: t(`duties${i}Law` as 'duties1Law'),
          due: t(`duties${i}Due` as 'duties1Due'),
          tone: t(`duties${i}Tone` as 'duties1Tone'),
        })),
        stepKicker: t('stepKicker'),
        stepTitle: t('stepTitle'),
        steps: list(4, (i) => ({
          title: t(`steps${i}Title` as 'steps1Title'),
          desc: t(`steps${i}Desc` as 'steps1Desc'),
        })),
        navPrice: t('navPrice'),
        priceTitle: t('priceTitle'),
        popular: t('popular'),
        priceFine: t('priceFine'),
        billing: list(2, (i) => ({
          key: t(`billing${i}K` as 'billing1K'),
          label: t(`billing${i}Label` as 'billing1Label'),
        })),
        plans: list(3, (i) => ({
          name: t(`plans${i}Name` as 'plans1Name'),
          // The free plan has one price; the paid two have a monthly and a
          // yearly one, and the toggle chooses between them.
          price: i === 1 ? t('plans1Price') : null,
          priceM: i === 1 ? null : t(`plans${i}PriceM` as 'plans2PriceM'),
          priceY: i === 1 ? null : t(`plans${i}PriceY` as 'plans2PriceY'),
          unit: t(`plans${i}Unit` as 'plans1Unit'),
          desc: t(`plans${i}Desc` as 'plans1Desc'),
          cta: t(`plans${i}Cta` as 'plans1Cta'),
          features: list(i === 1 ? 5 : i === 2 ? 6 : 5, (j) =>
            t(`plans${i}Features${j}` as 'plans1Features1'),
          ),
        })),
        faqKicker: t('faqKicker'),
        faqTitle: t('faqTitle'),
        faq: list(5, (i) => ({
          q: t(`faq${i}Q` as 'faq1Q'),
          a: t(`faq${i}A` as 'faq1A'),
        })),
        endTitle: t('endTitle'),
        endBody: t('endBody'),
        authTabs: list(2, (i) => t(`authTabs${i}` as 'authTabs1')),
        authTitleUp: t('authTitleUp'),
        authTitleIn: t('authTitleIn'),
        authSubUp: t('authSubUp'),
        authSubIn: t('authSubIn'),
        authCtaUp: t('authCtaUp'),
        authCtaIn: t('authCtaIn'),
        fields: {
          name: t('fieldsName'),
          company: t('fieldsCompany'),
          email: t('fieldsEmail'),
          password: t('fieldsPassword'),
        },
        ph: {
          name: t('phName'),
          company: t('phCompany'),
          email: t('phEmail'),
          passUp: t('phPassUp'),
          passIn: t('phPassIn'),
        },
        noteMissing: t('noteMissing'),
        noteUp: t('noteUp'),
        noteIn: t('noteIn'),
        noteSso: t('noteSso'),
        noteDemo: t('noteDemo'),
        noteWeak: t('noteWeak'),
        noteFreemail: t('noteFreemail'),
        noteFailed: t('noteFailed'),
        fineUp: t('fineUp'),
        fineIn: t('fineIn'),
        footLegal: t('footLegal'),
        footNote: t('footNote'),
        footPrivacy: t('footPrivacy'),
        footDpa: t('footDpa'),
        navProduct: t('navProduct'),
        demoTitle: t('demoTitle'),
        demoSub: t('demoSub'),
        demoSubPlan: t('demoSubPlan'),
        demoCta: t('demoCta'),
        demoFine: t('demoFine'),
      }}
    />
  )
}
