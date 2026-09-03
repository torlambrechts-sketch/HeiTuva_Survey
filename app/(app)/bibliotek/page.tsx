import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import {
  CARD_TINTS,
  CATEGORY_KEY,
  CATEGORY_NOTE_KEY,
  LIBRARY_TABS,
  PACK_CATEGORIES,
  PACK_VIEWS,
  estimateMinutes,
  type LibraryTab,
  type PackCategory,
  type PackView,
} from './chips'
import { ChipLink } from './ChipLink'
import { TemplateCard, type TemplatePack } from './TemplateCard'
import { UsePackButton } from './UsePackButton'
import { BankRow } from './BankRow'
import { BankSearch } from './BankSearch'

type Search = { fane?: string; visning?: string; kategori?: string; sok?: string }

/**
 * Bibliotek — built against HeiTuva.dc.html:1557-1683.
 *
 * Tabs, view and category live in the URL rather than component state: the
 * prototype keeps them local, which no link can express and a reload discards.
 * The rendering is identical.
 *
 * Everything on this screen comes from `template_packs` and `question_bank`,
 * per CLAUDE.md's data-not-code rule — adding a pack is a row, not a component.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const viewer = await requireViewer()
  const sp = await searchParams
  const t = await getTranslations('library')
  const tQ = await getTranslations('qtype')

  const tab: LibraryTab = LIBRARY_TABS.includes(sp.fane as LibraryTab)
    ? (sp.fane as LibraryTab)
    : 'maler'
  const view: PackView = PACK_VIEWS.includes(sp.visning as PackView)
    ? (sp.visning as PackView)
    : 'kort'
  const category: PackCategory = PACK_CATEGORIES.includes(sp.kategori as PackCategory)
    ? (sp.kategori as PackCategory)
    : 'Alle'
  const query = (sp.sok ?? '').trim()

  const canEdit = viewer.role !== 'leser'
  const supabase = await createClient()

  const href = (next: Partial<Search>) => {
    const params = new URLSearchParams()
    const merged = { fane: tab, visning: view, kategori: category, sok: query, ...next }
    if (merged.fane && merged.fane !== 'maler') params.set('fane', merged.fane)
    if (merged.visning && merged.visning !== 'kort') params.set('visning', merged.visning)
    if (merged.kategori && merged.kategori !== 'Alle') params.set('kategori', merged.kategori)
    if (merged.sok) params.set('sok', merged.sok)
    const qs = params.toString()
    return qs ? `/bibliotek?${qs}` : '/bibliotek'
  }

  return (
    <main className="animate-enter max-w-[1080px] pt-[26px]">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-[28px] font-medium">{t('title')}</h1>
        {/* Chip rail — RESPONSIVE.md § Tab rails: wraps below md, chips keep
            their design size, 8px row gap so 44px hit areas stay apart. */}
        <div className="flex flex-wrap gap-2 rounded-full bg-sf2 p-1 md:gap-[3px]">
          <ChipLink href={href({ fane: 'maler' })} active={tab === 'maler'} variant="segment">
            {t('tabTemplates')}
          </ChipLink>
          <ChipLink href={href({ fane: 'bank' })} active={tab === 'bank'} variant="segment">
            {t('tabBank')}
          </ChipLink>
        </div>
      </div>

      {tab === 'maler' ? (
        <TemplatesTab
          orgId={viewer.orgId}
          category={category}
          view={view}
          href={href}
          canEdit={canEdit}
          t={t}
          tQ={tQ}
          supabase={supabase}
        />
      ) : (
        <BankTab orgId={viewer.orgId} category={category} query={query} href={href} t={t} tQ={tQ} supabase={supabase} />
      )}
    </main>
  )
}

type Supa = Awaited<ReturnType<typeof createClient>>
type T = Awaited<ReturnType<typeof getTranslations<'library'>>>
type TQ = Awaited<ReturnType<typeof getTranslations<'qtype'>>>

async function TemplatesTab({
  orgId,
  category,
  view,
  href,
  canEdit,
  t,
  tQ,
  supabase,
}: {
  orgId: string
  category: PackCategory
  view: PackView
  href: (next: Partial<Search>) => string
  canEdit: boolean
  t: T
  tQ: TQ
  supabase: Supa
}) {
  const { data, error } = await supabase
    .from('template_packs')
    .select('id, key, org_id, category, legal_ref, title, audience, questions, private, org_members(name)')
    .order('category')
    .order('title')
  if (error) throw new Error(`template_packs read failed: ${error.message}`)

  const all: (TemplatePack & { questionCount: number })[] = (data ?? []).map((p) => {
    const questions = Array.isArray(p.questions) ? (p.questions as { type?: string }[]) : []
    return {
      id: p.id,
      key: p.key,
      category: p.category,
      legalRef: p.legal_ref,
      title: p.title,
      audience: p.audience,
      questionCount: questions.length,
      questionTypes: questions.map((q) => q.type ?? 'text'),
      isOwn: p.org_id === orgId,
      isPrivate: p.private,
      ownerName: (p.org_members as unknown as { name: string } | null)?.name ?? null,
    }
  })

  const mine = all.filter((p) => p.isOwn)
  const standard = all
    .filter((p) => !p.isOwn)
    .filter((p) => category === 'Alle' || p.category === category)

  const noteKey = CATEGORY_NOTE_KEY[category]
  const meta = (p: (typeof all)[number]) =>
    [
      t('questionCount', { count: p.questionCount }),
      t('minutes', { mins: estimateMinutes(p.questionCount) }),
      p.audience,
    ]
      .filter(Boolean)
      .join(' · ')

  const labelsFor = (p: (typeof all)[number]) => ({
    eyebrow: p.isOwn
      ? p.isPrivate
        ? t('privateTemplate')
        : t('companyTemplate', { owner: p.ownerName ?? '' })
      : p.category,
    meta: meta(p),
    use: t('usePack'),
    privateLabel: t('privateLabel'),
    sharedLabel: t('sharedLabel'),
    deleteLabel: t('deleteTemplate'),
    failed: t('failed'),
  })

  return (
    <>
      {mine.length ? (
        <section className="mt-[22px]">
          <h2 className="text-[11px] uppercase tracking-[.1em] text-mut">{t('ownTemplates')}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((p, i) => (
              <TemplateCard
                key={p.id}
                pack={p}
                tint={CARD_TINTS[i % CARD_TINTS.length]!}
                labels={labelsFor(p)}
                typeLabels={p.questionTypes.map((ty) => tQ(ty as 'scale'))}
                canEdit={canEdit}
              />
            ))}
          </div>
          <h2 className="mt-[26px] text-[11px] uppercase tracking-[.1em] text-mut">
            {t('standardTemplates')}
          </h2>
        </section>
      ) : null}

      <div className="mt-[18px] flex flex-wrap items-center gap-2">
        <span className="mr-1.5 flex flex-wrap gap-2 rounded-full bg-sf2 p-1 md:gap-[3px]">
          <ChipLink href={href({ visning: 'kort' })} active={view === 'kort'} variant="segment">
            {t('viewCards')}
          </ChipLink>
          <ChipLink href={href({ visning: 'liste' })} active={view === 'liste'} variant="segment">
            {t('viewList')}
          </ChipLink>
        </span>
        {PACK_CATEGORIES.map((c) => (
          <ChipLink key={c} href={href({ kategori: c })} active={category === c}>
            {t(CATEGORY_KEY[c] as 'catAll')}
          </ChipLink>
        ))}
      </div>

      {noteKey ? (
        <p className="mt-3 max-w-[820px] rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px] leading-[1.6]">
          {t(noteKey as 'noteLovpalagt')}
        </p>
      ) : null}

      {standard.length === 0 ? (
        <p className="mt-3.5 text-[13px] text-mut">{t('templatesEmpty')}</p>
      ) : view === 'kort' ? (
        <div className="mt-3.5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {standard.map((p, i) => (
            <TemplateCard
              key={p.id}
              pack={p}
              tint={CARD_TINTS[i % CARD_TINTS.length]!}
              labels={labelsFor(p)}
              typeLabels={p.questionTypes.map((ty) => tQ(ty as 'scale'))}
              canEdit={canEdit}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3.5 overflow-hidden rounded-[18px] border border-line bg-sf">
          {/* The header row is desktop-only: below md each row becomes a card
              (RESPONSIVE.md § Data tables, wide row — four fields), and a
              column header with no columns under it is noise. */}
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_118px] gap-4 bg-sf2 px-[22px] py-[13px] text-[11px] uppercase tracking-[.1em] text-mut md:grid">
            <span>{t('colTemplate')}</span>
            <span>{t('colCategory')}</span>
            <span>{t('colScope')}</span>
            <span />
          </div>
          {standard.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 border-t border-line px-[22px] py-[15px] md:grid md:grid-cols-[1.6fr_1fr_1fr_118px] md:items-center md:gap-4"
            >
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold">{p.title}</span>
                <span className="mt-0.5 block text-[13px] text-mut">{p.audience}</span>
              </span>
              <span>
                <span className="block text-[13px]">{p.category}</span>
                {p.legalRef ? (
                  <span className="mt-1 inline-block rounded-full bg-ac2 px-2.5 py-1 text-[11px] font-semibold">
                    {p.legalRef}
                  </span>
                ) : null}
              </span>
              <span className="text-[13px] text-mut">
                {t('questionCount', { count: p.questionCount })} ·{' '}
                {t('minutes', { mins: estimateMinutes(p.questionCount) })}
              </span>
              <UsePackButton
                packId={p.id}
                label={t('usePack')}
                failedLabel={t('failed')}
                className="p-2.5 text-[12.5px] md:w-full"
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

async function BankTab({
  orgId,
  category,
  query,
  href,
  t,
  tQ,
  supabase,
}: {
  orgId: string
  category: PackCategory | string
  query: string
  href: (next: Partial<Search>) => string
  t: T
  tQ: TQ
  supabase: Supa
}) {
  const [{ data: bank, error }, { data: draft }] = await Promise.all([
    supabase
      .from('question_bank')
      .select('id, org_id, text, type, category, used_count, org_members(name)')
      .order('category')
      .order('text'),
    // The design adds bank questions "rett inn i {draftTitle}" against one
    // implicit draft. Here that is the org's most recently touched draft —
    // docs/DEVIATIONS.md D26.
    supabase
      .from('surveys')
      .select('id, title')
      .eq('org_id', orgId)
      .eq('status', 'utkast')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (error) throw new Error(`question_bank read failed: ${error.message}`)

  const rows = (bank ?? []).map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type as string,
    category: q.category,
    isOwn: q.org_id === orgId,
    usedCount: q.used_count,
    author: (q.org_members as unknown as { name: string } | null)?.name ?? null,
  }))

  const categories = ['Alle', 'Egne', ...new Set(rows.map((r) => r.category))]
  const filtered = rows
    .filter((r) =>
      category === 'Alle' ? true : category === 'Egne' ? r.isOwn : r.category === category,
    )
    .filter((r) => (query ? r.text.toLowerCase().includes(query.toLowerCase()) : true))

  return (
    <section className="mt-[22px] rounded-[18px] border border-line bg-sf p-[22px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <BankSearch placeholder={t('bankSearch')} initial={query} />
        <span className="text-[13px] text-mut">
          {t('bankCounts', {
            own: rows.filter((r) => r.isOwn).length,
            validated: rows.filter((r) => !r.isOwn).length,
          })}
          {draft ? ` · ${t('bankTarget', { draft: draft.title })}` : ''}
        </span>
      </div>

      {!draft ? (
        <p className="mt-3 rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px] leading-[1.6]">
          {t('bankNoDraft')}
        </p>
      ) : null}

      <div className="mt-3.5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <ChipLink key={c} href={href({ kategori: c })} active={category === c}>
            {c === 'Alle' ? t('bankAll') : c === 'Egne' ? t('bankOwn') : c}
          </ChipLink>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-[13px] text-mut">{t('bankEmpty')}</p>
      ) : (
        filtered.map((r) => (
          <BankRow
            key={r.id}
            questionId={r.id}
            targetSurveyId={draft?.id ?? null}
            text={r.text}
            badge={r.isOwn ? t('badgeOwn') : t('badgeValidated')}
            isOwn={r.isOwn}
            meta={[
              r.category,
              tQ(r.type as 'scale'),
              r.isOwn
                ? `${t('bankBy', { author: r.author ?? '' })} · ${t('bankUsed', { count: r.usedCount })}`
                : `${t('bankUsed', { count: r.usedCount })} · ${t('bankBenchmark')}`,
            ].join(' · ')}
            labels={{
              add: t('bankAdd'),
              added: t('bankAdded'),
              remove: t('bankRemove'),
              noDraft: t('bankNoDraft'),
              failed: t('failed'),
            }}
          />
        ))
      )}
    </section>
  )
}
