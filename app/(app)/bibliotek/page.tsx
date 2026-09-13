import { getTranslations } from 'next-intl/server'
import { localiseRegistryNames, readWorkspace } from '@/lib/workspace/current'
import { liftOrder } from '@/lib/workspace/modules'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import {
  CATEGORY_NOTE_KEY,
  FIXED_PACK_CHIPS,
  PACK_VIEWS,
  estimateMinutes,
  ownTint,
  packTint,
  type PackCategory,
  type PackView,
} from './chips'
import {
  DEFAULT_LIBRARY_TAB,
  TAB_HEADING_KEY,
  resolveLibraryTab,
  type LibraryTab,
} from '@/lib/library/tabs'
import { splitRail } from '@/lib/library/rail'
import { ChipLink } from './ChipLink'
import { CategorySelect } from './CategorySelect'
import { TemplateCard, type TemplatePack } from './TemplateCard'
import { UsePackButton } from './UsePackButton'
import { BankRow } from './BankRow'
import { BankSearch } from './BankSearch'
import { BankNotePill, BankNoteProvider } from './BankNote'
import { UseCaseCard } from './UseCaseCard'

type Search = { fane?: string; visning?: string; kategori?: string; sok?: string }

/**
 * Bibliotek — built against L:1557-1683.
 *
 * Tabs, view and category live in the URL rather than component state: the
 * prototype keeps them local, which no link can express and a reload discards.
 * The rendering is identical.
 *
 * Everything on this screen comes from `template_packs` and `question_bank`,
 * per CLAUDE.md's data-not-code rule — adding a pack is a row, not a component.
 *
 * ── Q172: THE ARBEIDSLISTE'S FRAME, AND THE TAB RAIL IN THE SHELL ──────────
 *
 * Tor, 2026-09-13: the library gets Handlinger's submenu and Handlinger's
 * layout. So «Bruksområder · Maler · Spørsmålsbank» moved from the in-page rail
 * the bundle draws (v5:4082) into `AppSubnav`, and Maler and Spørsmålsbank are
 * wrapped in the Arbeidsliste's card — the box, a heading, and the filter in
 * its header (v5:3174-3182).
 *
 * **THE RAIL IS NOT DUPLICATED, WHICH IS THE WHOLE CONDITION.** `AppSubnav`'s
 * own header refuses the subnav on `admin` precisely because that screen would
 * then carry two controls doing one job, one of them three tabs out of date. So
 * the in-page pill rail is GONE from this file rather than hidden, and the tab
 * set has exactly one definition, in `lib/library/tabs.ts`.
 *
 * The heading is «Bibliotek» in every tab and the CARD heading is the tab's own
 * name — the same split Handlinger has, where the h1 says «Handlinger» and the
 * card says «Arbeidsliste». The count line follows the filter, as that screen's
 * does: it counts what is SHOWN, not what exists.
 *
 * Bruksområder keeps its card grid and gets no wrapper box: it is already a
 * grid of cards, and a box around boxes is furniture rather than structure.
 * That is also the literal scope of the instruction — «wrap maler and
 * spørsmålsbank».
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const viewer = await requireViewer()
  /* W3 · V4:6684 — the workspace's use-case lift. Empty when the registry is
     unseeded or the workspace is Tilpasset, and an empty lift leaves the
     library in its own editorial order — which is what it did before W3. */
  const lifts = (await readWorkspace(viewer.orgId))?.lifts ?? []
  const sp = await searchParams
  const t = await getTranslations('library')
  const tQ = await getTranslations('qtype')

  /* Q172 — the same resolver `AppSubnav` uses, so the pill that looks selected
     is the one this screen is showing. */
  const tab: LibraryTab = resolveLibraryTab(sp.fane)
  const view: PackView = PACK_VIEWS.includes(sp.visning as PackView)
    ? (sp.visning as PackView)
    : 'kort'
  const query = (sp.sok ?? '').trim()

  const canEdit = viewer.role !== 'leser'
  const supabase = await createClient()

  // Q24: the six use cases are a REGISTRY, read at request time. The chip rail,
  // the tab's cards and the pack eyebrows all read this one list, so adding a
  // use case is a row and nothing here changes.
  const { data: useCases } = await supabase
    .from('use_cases')
    .select('key, label, short, description, tint, preset_key')
    .order('sort_order')
  const usesRaw = useCases ?? []
  /* Q129 — `use_cases` is the second untranslated shipped registry, and its
     `hr` row carries the SAME Norwegian string as the workspace's, which is how
     verify:i18n came to blame a workspace key for a library chip. Localised
     through the shared helper; the registry value stays the fallback. */
  const uses = await localiseRegistryNames(usesRaw, 'uc')
  const useLabel = new Map(uses.map((u) => [u.key, u.label]))

  // The admissible chips are the three fixed ones plus the registry's keys.
  // Validated rather than trusted: an unknown `?kategori=` would otherwise
  // filter every pack out and draw an empty grid that looks like a bug in the
  // library rather than a bad link.
  const admissible = new Set<string>([...FIXED_PACK_CHIPS, ...uses.map((u) => u.key)])
  const category: PackCategory = admissible.has(sp.kategori ?? '') ? sp.kategori! : 'Alle'

  // Chips: «Alle», the six, «Lovpålagt», «Annet» (NEW:4469). Order matters —
  // the fixed three bracket the registry rather than being mixed into it.
  const chips: { key: string; label: string }[] = [
    { key: 'Alle', label: t('catAll') },
    ...uses.map((u) => ({ key: u.key, label: u.label })),
    { key: 'Lovpålagt', label: t('catLovpalagt') },
    { key: 'annet', label: t('catAnnet') },
  ]

  const href = (next: Partial<Search>) => {
    const params = new URLSearchParams()
    const merged = { fane: tab, visning: view, kategori: category, sok: query, ...next }
    /* The default tab carries no parameter — the same asymmetry
       `libraryTabHref` encodes, read from the registry rather than spelled
       again here. Two spellings of «which tab is the default» is precisely how
       the subnav's `aria-current` and this screen's content come apart. */
    if (merged.fane && merged.fane !== DEFAULT_LIBRARY_TAB) params.set('fane', merged.fane)
    if (merged.visning && merged.visning !== 'kort') params.set('visning', merged.visning)
    if (merged.kategori && merged.kategori !== 'Alle') params.set('kategori', merged.kategori)
    if (merged.sok) params.set('sok', merged.sok)
    const qs = params.toString()
    return qs ? `/bibliotek?${qs}` : '/bibliotek'
  }

  return (
    <main className="animate-enter pt-[26px]">
      {/* The breadcrumb, as on the Arbeidsliste (v5:3130-3132). */}
      <div className="flex items-center gap-[9px] text-[12.5px] text-mut">
        <span>{t('crumbRoot')}</span>
        <span className="opacity-50">→</span>
        <span className="font-semibold text-ink">{t('crumbHere')}</span>
      </div>

      {tab === 'bruksomrader' ? (
        <UseCasesTab
          uses={uses}
          orgId={viewer.orgId}
          href={href}
          t={t}
          supabase={supabase}
        />
      ) : tab === 'maler' ? (
        <TemplatesTab
          lifts={lifts}
          orgId={viewer.orgId}
          useLabel={useLabel}
          chips={chips}
          useNote={uses.find((u) => u.key === category)?.description}
          category={category}
          view={view}
          href={href}
          canEdit={canEdit}
          readOnlyNote={canEdit ? undefined : t('readOnlyNote')}
          t={t}
          tQ={tQ}
          supabase={supabase}
        />
      ) : (
        <BankTab
          orgId={viewer.orgId}
          category={category}
          query={query}
          href={href}
          readOnlyNote={canEdit ? undefined : t('readOnlyNote')}
          t={t}
          tQ={tQ}
          supabase={supabase}
        />
      )}
    </main>
  )
}

/**
 * The hero — Handlinger's, carried here by Q172 (v5:3134-3153).
 *
 * The heading is «Bibliotek» in every tab; what varies is the COUNT LINE, which
 * counts what the filter is showing rather than what exists, exactly as
 * `WorklistPanel`'s does.
 *
 * **THE ICON IS OURS AND IS LOGGED AS A DEVIATION.** v5 draws no hero icon on
 * the library at all — it draws a 28px heading and a rail — so bringing the
 * Handlinger frame across needs a mark the bundle never made. It is built from
 * the same primitive that screen's icon is (rounded rects, `rx=1.6`,
 * `fill: var(--ink)`, in the 62px `--ac` square), arranged as three spines so
 * it cannot be read as the rising bars that mean «tasks».
 */
function LibraryHero({
  title,
  countLine,
  scopeLine,
  lead,
}: {
  title: string
  countLine: string
  scopeLine: string
  lead: string
}) {
  return (
    <div className="mt-4 min-w-0">
      <div className="flex items-start gap-4">
        <span className="flex h-[62px] w-[62px] flex-none items-center justify-center rounded-[16px] bg-ac">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="6" y="6" width="4.4" height="20" rx="1.6" fill="var(--ink)" />
            <rect x="13.8" y="6" width="4.4" height="20" rx="1.6" fill="var(--ink)" />
            <rect x="21.6" y="9" width="4.4" height="17" rx="1.6" fill="var(--ink)" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          {/* `text-[23px] md:text-[30px]`, the same as the Arbeidsliste's — see
              the measurement in `WorklistPanel`. «Bibliotek» is nine characters
              and fits at 30px in the 202px available at 320px, so this is not
              load-bearing here; it is the same control at the same size, which
              is the point of copying the frame. */}
          <h1 className="font-display text-[23px] font-semibold leading-[1.1] md:text-[30px]">
            {title}
          </h1>
          <div className="mt-1 text-[13px] text-mut">
            {countLine} &nbsp;|&nbsp; {scopeLine}
          </div>
        </div>
      </div>
      <p className="mt-3.5 max-w-[460px] text-sm leading-[1.6] text-mut [text-wrap:pretty]">
        {lead}
      </p>
    </div>
  )
}

/**
 * The card Maler and Spørsmålsbank sit in — the Arbeidsliste's box
 * (v5:3174-3184): a heading and the filter rail on the left of its header, the
 * view control on the right, and the content below a rule.
 *
 * The chips inside it are the library's OWN controls, unchanged. Q172 moved
 * where the filter sits; restyling it into the Arbeidsliste's segmented rail
 * would be substituting one control for another, which CLAUDE.md forbids
 * outright.
 */
function LibraryCard({
  heading,
  filter,
  tools,
  children,
}: {
  heading: string
  filter?: React.ReactNode
  tools?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mt-[18px] min-w-0 rounded-[20px] border border-line bg-sf">
      <div className="flex flex-wrap items-center justify-between gap-3.5 px-[22px] py-[18px]">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <span className="whitespace-nowrap font-display text-[22px] font-medium">{heading}</span>
          {filter}
        </div>
        {tools ? <div className="flex flex-wrap items-center gap-[9px]">{tools}</div> : null}
      </div>
      <div className="min-w-0 border-t border-line px-[22px] py-[18px]">{children}</div>
    </div>
  )
}

type Supa = Awaited<ReturnType<typeof createClient>>
type T = Awaited<ReturnType<typeof getTranslations<'library'>>>
type TQ = Awaited<ReturnType<typeof getTranslations<'qtype'>>>

async function TemplatesTab({
  lifts,
  orgId,
  useLabel,
  chips,
  useNote,
  category,
  view,
  href,
  canEdit,
  readOnlyNote,
  t,
  tQ,
  supabase,
}: {
  orgId: string
  /** Registry key → label, for the card eyebrow (NEW:4484). */
  useLabel: Map<string, string>
  chips: { key: string; label: string }[]
  /** Q24: a use-case chip's note IS its registry description (NEW:4479). */
  useNote: string | undefined
  category: PackCategory
  view: PackView
  href: (next: Partial<Search>) => string
  canEdit: boolean
  readOnlyNote?: string
  t: T
  tQ: TQ
  supabase: Supa
  /* W3 · V4:6684 — the workspace's use-case lift, in rank order. Empty means
     no lift, which is Tilpasset and is also what an unseeded registry gives:
     the library keeps its own editorial sequence, which is what it did
     before W3. */
  lifts: string[]
}) {
  const { data, error } = await supabase
    .from('template_packs')
    .select(
      'id, key, org_id, category, use_case, legal_ref, title, audience, questions, private, created_at, sort_order, policy, org_members(name)',
    )
    // The grid tints by POSITION, so the order decides which cards are
    // coloured. `sort_order` carries the design bundle's own editorial
    // sequence (migration 0005); `title` only breaks ties between org
    // templates, which all sit at the default.
    .order('sort_order')
    .order('created_at', { ascending: false })
    .order('title')
  if (error) throw new Error(`template_packs read failed: ${error.message}`)

  const all: (TemplatePack & { questionCount: number })[] = (data ?? []).map((p) => {
    const questions = Array.isArray(p.questions) ? (p.questions as { type?: string }[]) : []
    return {
      id: p.id,
      key: p.key,
      category: p.category,
      useCase: p.use_case,
      legalRef: p.legal_ref,
      policy: (p.policy as TemplatePack['policy']) ?? null,
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
  // Q45: the chip means one of three things, and the filter says which.
  // «Lovpålagt» is the only CATEGORY chip left, because a statutory pack is a
  // kind that cuts across all six use cases; «annet» is `use_case is null`,
  // which after the total-mapping assertion holds only an organisation's own
  // untagged templates.
  /* The lift is applied to the STANDARD packs only. An organisation's own
     templates are not use-case tagged by the wizard, so lifting them would
     order a group by a key most of them do not carry — and `liftOrder` would
     put every one of them last, which is a reshuffle rather than a lift. */
  const standard = liftOrder(all, lifts)
    .filter((p) => !p.isOwn)
    .filter((p) =>
      category === 'Alle'
        ? true
        : category === 'Lovpålagt'
          ? p.category === 'Lovpålagt'
          : category === 'annet'
            ? !p.useCase
            : p.useCase === category,
    )

  /*
    Q174 — «det blir for mange på raden». Ten chips became four plus a
    dropdown, ranked by how many templates each one would actually show.

    Counted over the STANDARD packs, because that is the grid the chip filters:
    an organisation's own templates are listed in their own section above and
    are not affected by the category at all. `annet` is therefore 0 — every
    shipped pack maps to a use case (a total function, asserted in
    tests/db/use-cases.test.ts) — and sorts last, which is true rather than
    unfortunate.
  */
  const nonOwn = all.filter((p) => !p.isOwn)
  const countFor = (key: string) =>
    key === 'Lovpålagt'
      ? nonOwn.filter((p) => p.category === 'Lovpålagt').length
      : key === 'annet'
        ? nonOwn.filter((p) => !p.useCase).length
        : nonOwn.filter((p) => p.useCase === key).length
  const { rail, overflow } = splitRail({ chips, count: countFor, active: category })

  const noteKey = CATEGORY_NOTE_KEY[category]
  const meta = (p: (typeof all)[number]) =>
    [
      t('questionCount', { count: p.questionCount }),
      t('minutes', { mins: estimateMinutes(p.questionCount) }),
      p.audience,
    ]
      .filter(Boolean)
      .join(' · ')

  // «Anonym · terskel 5 · låst» / «Navngitt · organisasjon · attribuert» —
  // the policy a statutory pack brings with it, visible BEFORE the choice
  // (design brief §7). Ordinary packs carry none and show nothing.
  const policyLineFor = (p: (typeof all)[number]) => {
    if (!p.policy?.locked) return null
    return p.policy.respondent_kind === 'organisation'
      ? t('policyOrganisation')
      : t('policyPerson', { k: p.policy.k_threshold ?? 5 })
  }
  const labelsFor = (p: (typeof all)[number]) => ({
    eyebrow: p.isOwn
      ? p.isPrivate
        ? t('privateTemplate')
        : t('companyTemplate', { owner: p.ownerName ?? '' })
      : // Q24 (NEW:4484): a standard pack's eyebrow is its USE-CASE label, not
        // its category. The category is internal after Q45 and the customer
        // never sees it; falling back to it here would put the internal axis on
        // screen for exactly the packs the mapping missed — which the totality
        // assertion says is none, so the fallback is unreachable and honest.
        (useLabel.get(p.useCase ?? '') ?? p.category),
    meta: meta(p),
    use: t('usePack'),
    privateLabel: t('privateLabel'),
    sharedLabel: t('sharedLabel'),
    deleteLabel: t('deleteTemplate'),
    failed: t('failed'),
  })

  return (
    <>
      <LibraryHero
        title={t('title')}
        /* What the filter is SHOWING: the organisation's own templates are
           always listed, the standard ones only when the category admits them.
           Handlinger counts `shown.length` for the same reason — a count beside
           a filter that ignores the filter is a number nobody can check. */
        countLine={t('countTemplates', { count: mine.length + standard.length })}
        scopeLine={t('scopeLineTemplates')}
        lead={t('lead')}
      />
      <LibraryCard
        heading={t(TAB_HEADING_KEY.maler as 'tabTemplates')}
        /* Q173 — the Arbeidsliste's scope rail (v5:3179), same paint.
           Q174 — carrying four categories plus «Alle», with the rest in the
           dropdown beside it. The active one is promoted onto the rail rather
           than hidden inside the dropdown, so no filter is ever in force with
           nothing on screen lit. */
        filter={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="touch-cluster flex flex-wrap gap-[3px] rounded-[11px] bg-sf2 p-1">
              {rail.map((c) => (
                <ChipLink
                  key={c.key}
                  href={href({ kategori: c.key })}
                  active={category === c.key}
                  variant="rail"
                >
                  {c.label}
                </ChipLink>
              ))}
            </span>
            <CategorySelect
              label={t('moreCategories')}
              options={overflow.map((c) => ({
                key: c.key,
                label: c.label,
                href: href({ kategori: c.key }),
              }))}
            />
          </span>
        }
        /* Q173 — Liste/Tavle's shape (v5:3184), in Kort/Liste's position. */
        tools={
          <span className="touch-cluster flex flex-wrap gap-0.5 rounded-[10px] bg-sf2 p-[3px]">
            <ChipLink href={href({ visning: 'kort' })} active={view === 'kort'} variant="toggle">
              {t('viewCards')}
            </ChipLink>
            <ChipLink href={href({ visning: 'liste' })} active={view === 'liste'} variant="toggle">
              {t('viewList')}
            </ChipLink>
          </span>
        }
      >
      {readOnlyNote ? (
        <p className="mb-4 rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px] leading-[1.6]">
          {readOnlyNote}
        </p>
      ) : null}
      {mine.length ? (
        <section>
          <h2 className="text-[11px] uppercase tracking-[.1em] text-mut">{t('ownTemplates')}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((p, i) => (
              <TemplateCard
                key={p.id}
                pack={p}
                tint={ownTint(i)}
                labels={labelsFor(p)}
                policyLine={policyLineFor(p)}
                typeLabels={p.questionTypes.map((ty) => tQ(ty as 'scale'))}
                canEdit={canEdit}
                disabledReason={readOnlyNote}
              />
            ))}
          </div>
          <h2 className="mt-[26px] text-[11px] uppercase tracking-[.1em] text-mut">
            {t('standardTemplates')}
          </h2>
        </section>
      ) : null}

      {/* Q24: a use-case chip's note is its registry DESCRIPTION — data, not
          copy. «Lovpålagt» keeps its hand-written one, because a statutory
          warning is not a description of a use case. */}
      {useNote ?? (noteKey ? t(noteKey as 'noteLovpalagt') : null) ? (
        <p className="mt-3 max-w-[820px] rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px] leading-[1.6]">
          {useNote ?? t(noteKey as 'noteLovpalagt')}
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
              tint={packTint(i)}
              labels={labelsFor(p)}
              policyLine={policyLineFor(p)}
              typeLabels={p.questionTypes.map((ty) => tQ(ty as 'scale'))}
              canEdit={canEdit}
              disabledReason={readOnlyNote}
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
                {/* v1 adds the policy to the LIST too (NEW:1976-1978), not only
                    the cards: the same statutory pack has to read the same way
                    whichever view someone happens to be in. */}
                {policyLineFor(p) ? (
                  <span className="mt-1 block text-[11.5px] text-mut">{policyLineFor(p)}</span>
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
                disabledReason={readOnlyNote}
                className="p-2.5 text-[12.5px] md:w-full"
              />
            </div>
          ))}
        </div>
      )}
      </LibraryCard>
    </>
  )
}

/**
 * «Bruksområder» — V1:1873-1893. DECISIONS Q24.
 *
 * Six cards from the registry. Everything a card SAYS about the customer is
 * counted here rather than stored: how many templates the use case has, how
 * many are statutory, and how many surveys this organisation is running under
 * it. A count that lived in the registry would be wrong the moment a pack was
 * added.
 */
async function UseCasesTab({
  uses,
  orgId,
  href,
  t,
  supabase,
}: {
  uses: {
    key: string
    label: string
    short: string
    description: string
    tint: string | null
    preset_key: string | null
  }[]
  orgId: string
  href: (next: Partial<Search>) => string
  t: T
  supabase: Supa
}) {
  const [{ data: packs }, { data: surveys }] = await Promise.all([
    supabase
      .from('template_packs')
      .select('key, title, category, use_case, org_id')
      .order('sort_order'),
    // «N undersøkelser hos dere» — the organisation's own, joined back to a use
    // case through the pack it was created from. RLS scopes it already; the
    // filter is what makes the query use the org index.
    supabase
      .from('surveys')
      .select('id, template_pack_key')
      .eq('org_id', orgId)
      .is('deleted_at', null),
  ])

  const shipped = (packs ?? []).filter((p) => p.org_id === null)
  const useOfPack = new Map(shipped.map((p) => [p.key, p.use_case]))

  return (
    <>
      <LibraryHero
        title={t('title')}
        countLine={t('countUseCases', { count: uses.length })}
        scopeLine={t('scopeLineUseCases')}
        lead={t('lead')}
      />
      {/* No wrapper card: this tab IS a grid of cards, and Q172's instruction
          names Maler and Spørsmålsbank. A box around boxes is furniture. */}
      <p className="mt-[18px] max-w-[680px] text-[13.5px] leading-[1.6] text-mut">
        {t('useCasesNote')}
      </p>
      <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {uses.map((u) => {
          const mine = shipped.filter((p) => p.use_case === u.key)
          const legal = mine.filter((p) => p.category === 'Lovpålagt').length
          const live = (surveys ?? []).filter(
            (sv) => sv.template_pack_key && useOfPack.get(sv.template_pack_key) === u.key,
          ).length

          return (
            <UseCaseCard
              key={u.key}
              label={u.label}
              description={u.description}
              tint={u.tint}
              examples={mine.slice(0, 3).map((p) => p.title)}
              countLine={
                legal
                  ? t('useCaseCountLegal', { count: mine.length, legal })
                  : t('useCaseCount', { count: mine.length })
              }
              liveLine={live ? t('useCaseLive', { count: live }) : t('useCaseNone')}
              templatesHref={href({ fane: 'maler', kategori: u.key })}
              // The registry row's preset, loaded on the Dashboard. Null when
              // the row points at none — the button is then not drawn at all,
              // rather than drawn and inert.
              dashboardHref={u.preset_key ? `/dashboard?oppsett=${u.preset_key}` : null}
              labels={{ templates: t('useCaseTemplates'), dashboard: t('useCaseDashboard') }}
            />
          )
        })}
      </div>
    </>
  )
}

async function BankTab({
  orgId,
  category,
  query,
  href,
  readOnlyNote,
  t,
  tQ,
  supabase,
}: {
  orgId: string
  category: PackCategory | string
  query: string
  href: (next: Partial<Search>) => string
  readOnlyNote?: string
  t: T
  tQ: TQ
  supabase: Supa
}) {
  const [{ data: bank, error }, { data: draft }] = await Promise.all([
    supabase
      .from('question_bank')
      .select('id, org_id, text, type, category, used_count, sort_order, created_at, org_members(name)')
      // The design renders the bank in its own array order and derives the
      // category chips from where each category first appears in it
      // (L:3832-3834), so the order is stored (migration 0006)
      // rather than alphabetical. Org questions all sit at the default and
      // sort newest first, above the standard ones — `myBank` concatenated
      // ahead of `BANK` in the design.
      .order('sort_order')
      .order('created_at', { ascending: false }),
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

  // Own questions first, then the standard bank in its stored order.
  const ordered = [...rows.filter((r) => r.isOwn), ...rows.filter((r) => !r.isOwn)]
  const categories = ['Alle', 'Egne', ...new Set(ordered.map((r) => r.category))]
  const filtered = ordered
    .filter((r) =>
      category === 'Alle' ? true : category === 'Egne' ? r.isOwn : r.category === category,
    )
    .filter((r) => (query ? r.text.toLowerCase().includes(query.toLowerCase()) : true))

  return (
    <BankNoteProvider>
      <LibraryHero
        title={t('title')}
        countLine={t('countBank', { count: filtered.length })}
        scopeLine={t('scopeLineBank')}
        lead={t('lead')}
      />
      <LibraryCard
        heading={t(TAB_HEADING_KEY.bank as 'tabBank')}
        /* Q173 — the same rail as Maler's and as the Arbeidsliste's. */
        filter={
          <span className="touch-cluster flex flex-wrap gap-[3px] rounded-[11px] bg-sf2 p-1">
            {categories.map((c) => (
              <ChipLink
                key={c}
                href={href({ kategori: c })}
                active={category === c}
                variant="rail"
              >
                {c === 'Alle' ? t('bankAll') : c === 'Egne' ? t('bankOwn') : c}
              </ChipLink>
            ))}
          </span>
        }
        /* The search is this card's right-hand control — the position the
           Arbeidsliste gives Liste/Tavle. `min-w` rather than `w-full`, because
           `BankSearch` is `flex-1` and an unconstrained flex child in a wrapping
           header collapses to its placeholder at narrow widths. */
        tools={
          <span className="flex min-w-[190px] flex-1 items-center">
            <BankSearch placeholder={t('bankSearch')} initial={query} />
          </span>
        }
      >
      {readOnlyNote ? (
        <p className="mb-4 rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px] leading-[1.6]">
          {readOnlyNote}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <span className="text-[13px] text-mut">
          {t('bankCounts', {
            own: rows.filter((r) => r.isOwn).length,
            validated: rows.filter((r) => !r.isOwn).length,
          })}
          {draft ? ` · ${t('bankTarget', { draft: draft.title })}` : ''}
        </span>
        {/* V2:2960-2962 — the confirmation is a pill in this row, not a state on
            a button twenty rows down. */}
        <BankNotePill />
      </div>

      {!draft ? (
        <p className="mt-3 rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px] leading-[1.6]">
          {t('bankNoDraft')}
        </p>
      ) : null}

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
            disabledReason={readOnlyNote}
            meta={[
              r.category,
              tQ(r.type as 'scale'),
              r.isOwn
                ? `${t('bankBy', { author: r.author ?? '' })} · ${t('bankUsed', { count: r.usedCount })}`
                : `${t('bankUsed', { count: r.usedCount })} · ${t('bankBenchmark')}`,
            ].join(' · ')}
            labels={{
              add: t('bankAdd'),
              addedInto: t('bankAddedInto', { title: draft?.title ?? '' }),
              remove: t('bankRemove'),
              noDraft: t('bankNoDraft'),
              failed: t('failed'),
            }}
          />
        ))
      )}
      </LibraryCard>
    </BankNoteProvider>
  )
}
