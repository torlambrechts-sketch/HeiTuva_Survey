'use client'

import { useMemo, useState, useTransition } from 'react'
import { sendSupportMessage } from './actions'

export type HelpArticle = {
  slug: string
  categoryKey: string
  readMinutes: number
  tint: string
  relatedSlugs: string[]
  unavailable: boolean
  title: string
  lead: string
  body: {
    steps: { head: string; body: string }[]
    mock: { title: string; screen: string; rows: { label: string; meta: string; tint: string }[]; caption: string }
  }
}

type Labels = Record<string, string>

const CARD = 'rounded-[16px] border border-line bg-sf'

/**
 * Hjelp og støtte, V2:1944–2146.
 *
 * **Two things the bundle draws are NOT rendered as drawn, and both are
 * fabricated data rather than layout** (D116):
 *
 *  - `contactRows` (V2:5147) lists chat, a phone number, an email address and a
 *    named adviser, each with opening hours. None exists.
 *  - `statusRows` (V2:5161) shows «Normal drift» and «Planlagt vedlikehold
 *    12. sep». There is no status source, so that date is an invented value —
 *    CLAUDE.md's «a fake value is worse than a gap», on the panel a user checks
 *    when they think something is broken.
 *
 * Both keep their card and say what is true instead. The message form beside
 * them writes a real row.
 */
export function HelpScreen({
  articles,
  openSlug,
  category,
  tab,
  labels,
  categoryLabels,
  minutesTemplate,
  minutesLongTemplate,
}: {
  articles: HelpArticle[]
  openSlug: string | null
  category: string | null
  tab: 'artikler' | 'kontakt'
  labels: Labels
  categoryLabels: Record<string, { label: string; desc: string }>
  minutesTemplate: string
  minutesLongTemplate: string
}) {
  // See the page's note: a formatter function cannot cross the server/client
  // boundary, so the template arrives as a string with `{minutes}` in it.
  const minutesLabel = (m: number) => minutesTemplate.replace('{minutes}', String(m))
  const minutesLongLabel = (m: number) => minutesLongTemplate.replace('{minutes}', String(m))
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string | null>(category)
  const [open, setOpen] = useState<string | null>(openSlug)
  const [which, setWhich] = useState<'artikler' | 'kontakt'>(tab)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [note, setNote] = useState('')
  const [busy, start] = useTransition()

  const bySlug = useMemo(() => new Map(articles.map((a) => [a.slug, a])), [articles])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of articles) m.set(a.categoryKey, (m.get(a.categoryKey) ?? 0) + 1)
    return m
  }, [articles])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return articles.filter((a) => {
      if (cat && a.categoryKey !== cat) return false
      if (!q) return true
      // Search the whole document, not just the title: a user searching for a
      // phrase they half-remember is searching for a step body.
      return (
        a.title.toLowerCase().includes(q) ||
        a.lead.toLowerCase().includes(q) ||
        a.body.steps.some((s) => `${s.head} ${s.body}`.toLowerCase().includes(q))
      )
    })
  }, [articles, cat, query])

  const art = open ? bySlug.get(open) : undefined

  const send = () => {
    if (!subject.trim()) {
      setNote(labels.contactNeedsSubject!)
      return
    }
    start(async () => {
      const res = await sendSupportMessage({ subject, body })
      if (res.ok) {
        setNote(labels.contactSent!)
        setSubject('')
        setBody('')
      } else {
        setNote(labels.contactFailed!)
      }
    })
  }

  return (
    <main className="animate-enter pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[28px] font-medium">{labels.title}</h1>
        {/* Q74: two tabs, not three. The forum is not built and is not drawn as
            «coming later» either — the absence is left visible. */}
        <div className="flex flex-wrap gap-x-[3px] gap-y-[13px] rounded-[999px] bg-sf2 p-1 xl:gap-y-[3px]">
          {(['artikler', 'kontakt'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setWhich(k)
                setOpen(null)
              }}
              aria-pressed={which === k}
              className="touch-44 cursor-pointer rounded-[999px] border-none px-[18px] py-2 text-[12.5px] font-semibold text-ink"
              style={{
                background: which === k ? 'var(--sf)' : 'transparent',
                boxShadow: which === k ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
              }}
            >
              {k === 'artikler' ? labels.tabArticles : labels.tabContact}
            </button>
          ))}
        </div>
      </div>

      {which === 'artikler' && !art ? (
        <div className="mt-5 grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(210px,240px)_minmax(0,1fr)]">
          <nav className={`${CARD} p-3.5`} aria-label={labels.categories}>
            <div className="px-2.5 pb-2.5 pt-1 text-[11px] uppercase tracking-[.09em] text-mut">
              {labels.categories}
            </div>
            <div className="flex flex-col gap-[3px]">
              {[null, ...Object.keys(categoryLabels)].map((k) => {
                const on = cat === k
                const label = k ? categoryLabels[k]!.label : labels.all!
                const n = k ? (counts.get(k) ?? 0) : articles.length
                return (
                  <button
                    key={k ?? 'all'}
                    type="button"
                    onClick={() => setCat(k)}
                    aria-pressed={on}
                    className="touch-44 flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border-none px-3 py-2.5 text-left text-ink"
                    style={{ background: on ? 'var(--sbg)' : 'transparent', fontWeight: on ? 700 : 500 }}
                  >
                    <span className="min-w-0 truncate text-[13px]">{label}</span>
                    <span className="flex-none text-[11px] text-mut">{n}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="min-w-0">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.search}
              aria-label={labels.search}
              className="touch-44-field box-border w-full rounded-[12px] border border-line bg-sf px-[17px] py-3.5 text-[14px] text-ink outline-none"
            />
            <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-3">
              <div className="text-[12px] uppercase tracking-[.09em] text-mut">
                {cat ? categoryLabels[cat]!.label : labels.all}
              </div>
              <div className="text-[12.5px] text-mut">{cat ? categoryLabels[cat]!.desc : labels.allDesc}</div>
            </div>

            {shown.length === 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-3.5 rounded-[14px] border border-dashed border-line bg-sf px-5 py-[18px]">
                <span className="min-w-[220px] flex-1 text-[13.5px] leading-[1.5]">{labels.noHits}</span>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setCat(null)
                  }}
                  className="touch-44 flex-none cursor-pointer rounded-[10px] border border-line bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-ink"
                >
                  {labels.reset}
                </button>
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))]">
              {shown.map((a) => (
                <button
                  key={a.slug}
                  type="button"
                  onClick={() => setOpen(a.slug)}
                  className="touch-44 flex min-w-0 cursor-pointer flex-col rounded-[16px] border border-line p-[18px] text-left text-ink"
                  style={{ background: a.tint }}
                >
                  <span className="flex items-center justify-between gap-2.5">
                    <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[.09em] text-mut">
                      {categoryLabels[a.categoryKey]?.label ?? a.categoryKey}
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-mut">{minutesLabel(a.readMinutes)}</span>
                  </span>
                  <span className="mt-[9px] text-[14.5px] font-semibold leading-[1.3] text-pretty">{a.title}</span>
                  <span className="mt-[5px] flex-1 text-[12.5px] leading-[1.55] text-mut">{a.lead}</span>
                  {a.unavailable ? (
                    <span className="mt-2.5 rounded-[9px] bg-sf px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-mut">
                      {labels.notBuilt}
                    </span>
                  ) : null}
                  <span className="mt-3 text-[12px] font-semibold">{labels.read}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {which === 'artikler' && art ? (
        <div className="mt-5 grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
          <article className="rounded-[18px] border border-line bg-sf p-[26px]">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="touch-44 cursor-pointer rounded-[9px] border border-line bg-transparent px-3.5 py-2 text-[12px] font-semibold text-ink"
            >
              {labels.back}
            </button>
            <div className="mt-4 flex flex-wrap items-center gap-[9px]">
              <span
                className="whitespace-nowrap rounded-[999px] px-3 py-[5px] text-[11px] font-bold"
                style={{ background: art.tint }}
              >
                {categoryLabels[art.categoryKey]?.label ?? art.categoryKey}
              </span>
              <span className="text-[12px] text-mut">{minutesLongLabel(art.readMinutes)}</span>
            </div>
            <h2 className="mt-3 font-display text-[28px] font-medium leading-[1.15] text-pretty">{art.title}</h2>
            <p className="mt-2.5 text-[14.5px] leading-[1.65] text-mut text-pretty">{art.lead}</p>

            {art.unavailable ? (
              <p className="mt-3.5 rounded-[11px] bg-sbg px-3.5 py-[11px] text-[12.5px] leading-[1.5]">
                {labels.notBuilt}
              </p>
            ) : null}

            <ol className="mt-[22px] flex list-none flex-col gap-3.5 p-0">
              {art.body.steps.map((s, i) => (
                <li key={s.head} className="flex items-start gap-[13px]">
                  <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-ac text-[12px] font-bold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{s.head}</span>
                    <span className="mt-1 block text-[13.5px] leading-[1.6] text-mut">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>

            {art.relatedSlugs.length ? (
              <div className="mt-6 border-t border-line pt-[18px]">
                <div className="text-[11px] uppercase tracking-[.09em] text-mut">{labels.next}</div>
                <div className="mt-2.5 flex flex-col gap-[3px]">
                  {art.relatedSlugs.flatMap((r) => {
                    const rel = bySlug.get(r)
                    if (!rel) return []
                    return [
                      <button
                        key={r}
                        type="button"
                        onClick={() => setOpen(r)}
                        className="touch-44 flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-line bg-transparent px-3.5 py-[11px] text-left text-ink"
                      >
                        <span className="truncate text-[13.5px] font-semibold">{rel.title}</span>
                        <span className="flex-none text-[11.5px] text-mut">
                          {categoryLabels[rel.categoryKey]?.label} · {minutesLabel(rel.readMinutes)}
                        </span>
                      </button>,
                    ]
                  })}
                </div>
              </div>
            ) : null}
          </article>

          <aside className="rounded-[18px] border border-line bg-bg p-3.5">
            <div className="flex items-center gap-2 px-1.5 pb-3 pt-1">
              <span className="block h-[9px] w-[9px] rounded-full bg-ac3" />
              <span className="block h-[9px] w-[9px] rounded-full bg-sbg" />
              <span className="block h-[9px] w-[9px] rounded-full" style={{ background: '#CFE7E4' }} />
              <span className="flex-1 truncate text-center text-[11px] text-mut">{art.body.mock.title}</span>
            </div>
            <div className="rounded-[14px] border border-line bg-sf p-4 shadow-[0_12px_30px_rgba(25,21,16,.07)]">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[12.5px] font-bold">{art.body.mock.screen}</span>
                <span className="rounded-[999px] bg-sf2 px-2.5 py-[3px] text-[10px] font-bold">HeiTuva</span>
              </div>
              <div className="mt-3 flex flex-col gap-[7px]">
                {art.body.mock.rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-[10px] border border-line px-3.5 py-[11px]"
                    style={{ background: r.tint }}
                  >
                    <span className="truncate text-[12.5px] font-semibold">{r.label}</span>
                    <span className="flex-none text-[11px] text-mut">{r.meta}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-[11px] px-1.5 text-[11.5px] leading-[1.5] text-mut">{art.body.mock.caption}</p>
          </aside>
        </div>
      ) : null}

      {which === 'kontakt' ? (
        <div className="mt-5 grid grid-cols-1 items-start gap-[18px] md:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
          <div className="rounded-[18px] border border-line bg-sf p-6">
            <h2 className="font-display text-[21px] font-medium">{labels.contactHeading}</h2>
            <p className="mt-1 text-[13px] leading-[1.55] text-mut">{labels.contactLead}</p>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={labels.contactSubject}
              aria-label={labels.contactSubject}
              className="touch-44-field mt-4 box-border w-full rounded-[11px] border border-line bg-bg px-[15px] py-[13px] text-[14px] text-ink outline-none"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={labels.contactBody}
              aria-label={labels.contactBody}
              className="mt-2.5 box-border w-full resize-y rounded-[11px] border border-line bg-bg px-[15px] py-[13px] text-[14px] leading-[1.55] text-ink outline-none"
            />
            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={send}
                className="touch-44 cursor-pointer rounded-[11px] border-none bg-ac px-[22px] py-[13px] text-[13.5px] font-bold text-ink"
              >
                {labels.contactSend}
              </button>
              {note ? (
                <span className="rounded-[999px] bg-ac2 px-[15px] py-[9px] text-[12.5px] font-semibold" role="status">
                  {note}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* D116 — the four channels and the status panel keep their cards and
                say what is true. An invented maintenance window on the panel a
                user checks when they think something is broken is the worst
                place in the product for a fake value. */}
            <div className={`${CARD} p-[18px]`}>
              <div className="text-[13px] font-bold">{labels.channelsHeading}</div>
              <p className="mt-2 text-[12.5px] leading-[1.55] text-mut">{labels.channelsNone}</p>
            </div>
            <div className={`${CARD} p-[18px]`}>
              <div className="text-[13px] font-bold">{labels.statusHeading}</div>
              <p className="mt-2 text-[12.5px] leading-[1.55] text-mut">{labels.statusNone}</p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
