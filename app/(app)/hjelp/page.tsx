import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { HelpScreen, type HelpArticle } from './HelpScreen'

/**
 * Hjelp og støtte — V2:1944–2146.
 *
 * **Three tabs are drawn and two ship.** Q74 DEFAULTED: the forum is not built,
 * and the tab is not drawn as «coming later» either — Q26's stream panel is the
 * precedent, where the absence is left visible rather than answered with
 * something else.
 *
 * **The articles are data, not components** (Q75 DEFAULTED). `help_articles`
 * carries the registry and `help_article_translations` the per-language
 * document; a thirteenth article is a row, and a third language is a row per
 * article. Nothing on this page knows the name of any particular article.
 */
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ artikkel?: string; kategori?: string; fane?: string }>
}) {
  await requireViewer()
  const sp = await searchParams
  const t = await getTranslations('help')
  const locale = await getLocale()
  const lang = locale === 'en' ? 'en' : 'no'
  const supabase = await createClient()

  const [{ data: reg }, { data: tr }, { data: flags }] = await Promise.all([
    supabase
      .from('help_articles')
      .select('slug, category_key, read_minutes, tint, sort_order, related_slugs, requires_flag')
      .order('sort_order'),
    supabase.from('help_article_translations').select('slug, title, lead, body').eq('lang', lang),
    supabase.from('feature_flags').select('key, enabled').is('org_id', null),
  ])

  const byLang = new Map((tr ?? []).map((r) => [r.slug, r]))
  const flagOn = new Map((flags ?? []).map((f) => [f.key, f.enabled]))

  /**
   * An article whose translation is missing is DROPPED rather than rendered with
   * its slug or with the other language's text. A half-translated help centre
   * that looks whole is the shape D110 keeps finding; a shorter list is legible.
   */
  const articles: HelpArticle[] = (reg ?? [])
    .flatMap((r) => {
      const doc = byLang.get(r.slug)
      if (!doc) return []
      const body = doc.body as HelpArticle['body']
      return [
        {
          slug: r.slug,
          categoryKey: r.category_key,
          readMinutes: r.read_minutes,
          tint: r.tint,
          relatedSlugs: r.related_slugs ?? [],
          // The article ships and SAYS SO when its subject is behind a disabled
          // flag: a reader must be able to tell undocumented from unbuilt.
          unavailable: r.requires_flag ? flagOn.get(r.requires_flag) !== true : false,
          title: doc.title,
          lead: doc.lead,
          body,
        },
      ]
    })

  return (
    <HelpScreen
      articles={articles}
      openSlug={sp.artikkel ?? null}
      category={sp.kategori ?? null}
      tab={sp.fane === 'kontakt' ? 'kontakt' : 'artikler'}
      labels={{
        title: t('title'),
        tabArticles: t('tabArticles'),
        tabContact: t('tabContact'),
        categories: t('categories'),
        all: t('all'),
        allDesc: t('allDesc'),
        search: t('search'),
        noHits: t('noHits'),
        reset: t('reset'),
        read: t('read'),
        back: t('back'),
        next: t('next'),
        notBuilt: t('notBuilt'),
        contactHeading: t('contactHeading'),
        contactLead: t('contactLead'),
        contactSubject: t('contactSubject'),
        contactBody: t('contactBody'),
        contactSend: t('contactSend'),
        contactSent: t('contactSent'),
        contactNeedsSubject: t('contactNeedsSubject'),
        contactFailed: t('contactFailed'),
        channelsHeading: t('channelsHeading'),
        channelsNone: t('channelsNone'),
        statusHeading: t('statusHeading'),
        statusNone: t('statusNone'),
      }}
      categoryLabels={Object.fromEntries(
        ['komigang', 'bygger', 'anonymitet', 'lovpalagt', 'rapporter', 'oppgaver', 'administrasjon', 'personvern'].map(
          (k) => [
            k,
            {
              label: t(`cat${k[0]!.toUpperCase()}${k.slice(1)}` as 'catBygger'),
              desc: t(`catDesc${k[0]!.toUpperCase()}${k.slice(1)}` as 'catDescBygger'),
            },
          ],
        ),
      )}
      /* TEMPLATES, not functions. A function cannot cross the server/client
         boundary — React refuses to serialise it and the route 500s, which is
         what `verify:browser` caught here. The client substitutes `{minutes}`. */
      minutesTemplate={t('readTime', { minutes: '{minutes}' })}
      minutesLongTemplate={t('readTimeLong', { minutes: '{minutes}' })}
    />
  )
}
