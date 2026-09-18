import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { PackQuestion, type PackQuestionInput } from '@/lib/questions/pack'
import { estimateMinutes } from '../chips'
import { UsePackButton } from '../UsePackButton'

/**
 * T4 — v8's `packdetail`, the template pack read view (v8:4688-4764).
 *
 * ── THE ROUTE, AND WHY THIS PATH ───────────────────────────────────────────
 *
 * `/bibliotek/[id]`.
 *
 * `packdetail` is not a screen of its own in v8's navigation: the shell
 * highlights the library for it (`v8:8413`) and holds the `templates` sub-tab
 * selected (`v8:9400`). So it belongs UNDER `bibliotek`, which is already the
 * library's Norwegian segment, and it is a path segment rather than a
 * `?fane=` value because the library's three tabs are query parameters
 * (`/bibliotek?fane=maler`, `lib/library/tabs.ts`) and a pack is not a fourth
 * tab.
 *
 * THE SEGMENT IS THE UUID AND NOT THE PACK'S `key`, which is the tempting
 * choice because keys are readable. `template_packs` is unique on
 * `(org_id, key) NULLS NOT DISTINCT`, so a key is unique WITHIN an
 * organisation and a global pack and an organisation's own pack may carry the
 * same one. A URL built on `key` would then name two rows. `UsePackButton`
 * already addresses packs by `packId` for the same reason, and
 * `/undersokelser/[id]` is the existing convention for an entity route.
 *
 * ── WHAT THE DRAWING ASKS FOR THAT THE DATA ACTUALLY HAS ───────────────────
 *
 * Measured before building, over all 30 seeded packs and their 100 questions:
 *
 *     text     100      type     100      options   20
 *     short      4      role       4      multi      3      statements  1
 *     required   0      help       0
 *
 * `required` and `help` are ZERO in the seed — and they are NOT missing from
 * the model. `lib/questions/pack.ts` declares both as optional keys and
 * `surveyQuestionFrom` resolves them (`required: q.required ?? false`,
 * `help: q.help ?? null`), so the writer exists and the default is defined in
 * one place. «Krav» therefore reads «Valgfritt» for every seeded pack, which
 * is TRUE of them rather than a placeholder, and it starts varying the day a
 * pack sets the key. This screen reads that value through the same expression
 * the builder uses, so the two cannot disagree about what a pack question is.
 *
 * ── AND ONE THING THE DRAWING INVENTS, WHICH IS NOT BUILT ──────────────────
 *
 * `pd.purpose` (v8:7943) is
 *
 *     src.purpose || ("Måler " + audience.split("·")[0] + " og gir tall du kan
 *                     følge fra runde til runde.")
 *
 * — a sentence MANUFACTURED from the audience when the fixture has no purpose,
 * and it asserts something («tall du kan følge fra runde til runde») that is
 * false of a pack nobody runs twice. There is no `purpose` column. So the
 * paragraph renders `audience`, which is the real descriptive field 24 of the
 * 30 packs carry, and nothing at all for the six that do not. Rendering the
 * generated sentence would be the fabrication rule's own example: a value that
 * is indistinguishable from a real one in review.
 */
export default async function PackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('library')
  const tQ = await getTranslations('qtype')

  // No org filter: RLS already decides which packs this viewer may read — the
  // global ones and their own organisation's. Adding a predicate here would be
  // a second, weaker copy of that rule.
  const { data: pack } = await supabase
    .from('template_packs')
    .select('id, key, title, category, audience, legal_ref, questions, policy, org_id')
    .eq('id', id)
    .maybeSingle()

  if (!pack) notFound()

  // The pack's questions through the SAME parser the builder uses, so a pack
  // this screen can render is a pack `createSurveyFromPack` can materialise. A
  // row that fails the schema shows as nothing rather than as a half-question.
  const parsed = PackQuestion.array().safeParse(pack.questions)
  const questions: PackQuestionInput[] = parsed.success ? parsed.data : []

  const count = questions.length
  const mins = estimateMinutes(count)
  const isOwn = pack.org_id !== null
  const types = [...new Set(questions.map((q) => q.type))]

  const use = (
    <UsePackButton
      packId={pack.id}
      label={t('usePack')}
      failedLabel={t('failed')}
      disabledReason={viewer.role === 'leser' ? t('readOnlyNote') : undefined}
    />
  )

  return (
    <main className="animate-enter">
      {/* `touch-44`: painted at 13px the back link measured 96x17, which
          `verify:responsive` blocked at 390px. The utility is a pseudo-element
          hit area, so the type stays as drawn. */}
      <Link
        href="/bibliotek?fane=maler"
        className="touch-44 inline-block text-[13px] text-mut no-underline"
      >
        {t('packBack')}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[.1em] text-mut">
            {isOwn ? t('badgeOwn') : pack.category}
          </div>
          <h1 className="mt-[6px] text-pretty font-display text-[26px] font-medium leading-[1.2]">
            {pack.title}
          </h1>
          <p className="mt-[5px] text-[13px] text-mut">
            {[t('questionCount', { count }), t('minutes', { mins })].join(' · ')}
          </p>
        </div>
        {use}
      </div>

      {pack.legal_ref ? (
        <p className="mt-4 rounded-[10px] px-[14px] py-3 text-[12.5px] leading-[1.55]" style={{ background: 'var(--sbg)' }}>
          {t('packLegal', { ref: pack.legal_ref })}
        </p>
      ) : null}

      {/* `audience`, not v8's manufactured purpose sentence — see the header. */}
      {pack.audience ? (
        <p className="mt-4 max-w-[560px] text-pretty text-[14px] leading-[1.6] text-mut">
          {pack.audience}
        </p>
      ) : null}

      {types.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {types.map((ty) => (
            <span key={ty} className="rounded-full bg-sbg px-[13px] py-[6px] text-[12px]">
              {tQ(ty as 'scale')}
            </span>
          ))}
        </div>
      ) : null}

      <section className="mt-[22px] rounded-[18px] border border-line bg-sf">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-[22px] py-[18px]">
          <h2 className="font-display text-[19px] font-medium">{t('packQuestionsHeading')}</h2>
          {/* The refusal the drawing states out loud, and it is true here: this
              route reads and never writes. Nothing is created until the button. */}
          <p className="text-[12px] text-mut">{t('packReadOnly')}</p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={`${QCOLS} border-y border-line bg-bg px-[22px] py-[11px] text-[11px] uppercase tracking-[.09em] text-mut`}>
              <span>{t('packColQuestion')}</span>
              <span>{t('packColType')}</span>
              <span>{t('packColRequired')}</span>
              <span>{t('packColOptions')}</span>
            </div>

            {questions.map((q, i) => (
              <div key={`${i}-${q.text}`} className={`${QCOLS} border-b border-line px-[22px] py-[13px] last:border-b-0`}>
                <span className="min-w-0">
                  <span className="block text-[13.5px]">
                    <span className="mr-2 text-mut">{i + 1}</span>
                    {q.text}
                  </span>
                  {q.help ? (
                    <span className="mt-0.5 block text-[12px] text-mut">{q.help}</span>
                  ) : null}
                </span>
                <span className="min-w-0 text-[12.5px] text-mut">{tQ(q.type as 'scale')}</span>
                {/* `q.required ?? false` is surveyQuestionFrom's own expression.
                    Every seeded pack leaves the key unset, so this reads
                    «Valgfritt» throughout — which is what those packs ARE. */}
                <span className="min-w-0 text-[12.5px] text-mut">
                  {q.required ?? false ? t('packRequired') : t('packOptional')}
                </span>
                <span className="min-w-0 text-[12.5px] text-mut">
                  {q.options?.length ? q.options.join(' · ') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-[22px] py-4">
          <span className="text-[12.5px] text-mut">
            {[t('questionCount', { count }), t('minutes', { mins })].join(' · ')}
          </span>
          {use}
        </div>
      </section>
    </main>
  )
}

/** v8's four-column question table (v8:4733ff). */
const QCOLS =
  'grid items-start gap-3 [grid-template-columns:minmax(220px,2.4fr)_minmax(90px,.8fr)_88px_minmax(120px,1fr)]'
