import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { ACTIVE_LOCALES, SOURCE_LOCALE, isLocale, type Locale } from '@/lib/i18n/locales'
import bundledNo from '@/messages/no.json'
import { LanguagePanel, type MessageRow } from '../LanguagePanel'

/**
 * Administrasjon → Språk — the translation editor (DECISIONS Q12, plan §6a).
 *
 * The design has no such screen: its only language surface is the personal
 * picker on Profil (HeiTuva.dc.html:1341-1347). This tab is built from the
 * component classes the other Administrasjon tabs use, and is logged as
 * docs/DEVIATIONS.md D79.
 *
 * What it edits is an organisation's OVERRIDES. The shipped copy is a row with
 * `org_id` NULL, seeded from /messages/*.json and writable only by the service
 * role; saving here writes a row carrying this org's id, and "Tilbakestill"
 * deletes it. So an org can never damage another org's wording, and can never
 * lose the shipped default — the worst it can do to itself is undone by one
 * click.
 */
export const dynamic = 'force-dynamic'

/** Enough rows to work in, few enough to render. The count above the list says
 *  how many the filter actually matched, so a truncated view is never silent. */
const LIMIT = 25

export default async function LanguageTab({
  searchParams,
}: {
  searchParams: Promise<{ ns?: string; q?: string; lang?: string }>
}) {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const params = await searchParams
  const t = await getTranslations('admin')

  const bundle = bundledNo as Record<string, Record<string, string>>
  const namespaces = Object.keys(bundle).sort()
  const ns = params.ns && namespaces.includes(params.ns) ? params.ns : namespaces[0]!
  /*
    Defaults to the language the administrator is reading HeiTuva in, not to the
    source language. Someone working in English almost always wants to edit the
    English wording; landing them on Norwegian made the first action on the
    screen "change the other select".
  */
  const viewerLocale = await getLocale()
  const lang: Locale =
    isLocale(params.lang) && ACTIVE_LOCALES.includes(params.lang)
      ? params.lang
      : isLocale(viewerLocale) && ACTIVE_LOCALES.includes(viewerLocale)
        ? viewerLocale
        : SOURCE_LOCALE
  const query = (params.q ?? '').trim().toLowerCase()

  const supabase = await createClient()
  /*
    Both scopes, one read: the shipped default and this org's override of it.
    `defaults` comes from the table rather than the JSON bundle because the
    table is what the app actually serves — if a seed has not run, the editor
    should show the same gap the product shows, not paper over it.
  */
  const { data: rows } = await supabase
    .from('ui_messages')
    .select('key, value, org_id')
    .eq('namespace', ns)
    .eq('lang', lang)
    .or(`org_id.is.null,org_id.eq.${viewer.orgId}`)

  const shipped = new Map<string, string>()
  const overrides = new Map<string, string>()
  for (const r of rows ?? []) (r.org_id === null ? shipped : overrides).set(r.key, r.value)

  // The source-language value is shown beside every non-source row, because a
  // translator editing English needs the Norwegian in front of them.
  const source = bundle[ns] ?? {}

  const keys = Object.keys(source).sort()
  const matched = keys.filter((k) => {
    if (!query) return true
    const hay = `${k} ${shipped.get(k) ?? ''} ${overrides.get(k) ?? ''} ${source[k] ?? ''}`
    return hay.toLowerCase().includes(query)
  })

  const list: MessageRow[] = matched.slice(0, LIMIT).map((key) => ({
    key,
    source: source[key] ?? '',
    shipped: shipped.get(key) ?? '',
    override: overrides.get(key) ?? null,
  }))

  /*
    Namespaces are code identifiers — `builder`, `qtype`, `surveyNav`. They are
    the right key for the table and the wrong words for a screen, so each one
    carries a label like every other string in the product. A namespace with no
    label falls back to its own name, which is visible rather than blank and
    tells whoever added it that a key is missing.
  */
  const tLang = await getTranslations('lang')
  const areas = namespaces.map((n) => ({
    value: n,
    label: t.has(`langArea_${n}` as 'langArea_admin') ? t(`langArea_${n}` as 'langArea_admin') : n,
  }))

  return (
    <LanguagePanel
      namespaces={areas}
      namespace={ns}
      lang={lang}
      locales={ACTIVE_LOCALES.map((l) => ({ value: l, label: tLang(l) }))}
      query={params.q ?? ''}
      rows={list}
      matched={matched.length}
      total={keys.length}
      labels={{
        title: t('langTitle'),
        intro: t('langIntro'),
        namespace: t('langNamespace'),
        language: t('langLanguage'),
        search: t('langSearch'),
        searchCta: t('langSearchCta'),
        shipped: t('langShipped'),
        source: t('langSource'),
        yours: t('langYours'),
        save: t('langSave'),
        reset: t('langReset'),
        saved: t('langSaved'),
        placeholderMismatch: t('langPlaceholderMismatch'),
        tooLong: t('langTooLong'),
        failed: t('langFailed'),
        showing: t('langShowing', { shown: list.length, matched: matched.length }),
        overridden: t('langOverridden', { count: overrides.size }),
        empty: t('langEmpty'),
        overrideBadge: t('langOverrideBadge'),
        showSource: t('langShowSource'),
        filtered: t('langFiltered', { total: keys.length }),
      }}
    />
  )
}
