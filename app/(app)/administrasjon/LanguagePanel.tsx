'use client'

import { useActionState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resetMessage, saveMessage, type LangState } from './sprak/actions'

/** A `<select>` entry: the stored identifier, and the words shown for it. */
export type Choice = { value: string; label: string }

export type MessageRow = {
  key: string
  /** The Norwegian source, shown beside a non-Norwegian row so a translator can
   *  see what they are translating. */
  source: string
  /** What the product ships for this key and language. */
  shipped: string
  /** This organisation's override, or null if it has none. */
  override: string | null
}

type Labels = {
  title: string
  intro: string
  namespace: string
  language: string
  search: string
  searchCta: string
  shipped: string
  source: string
  yours: string
  save: string
  reset: string
  saved: string
  placeholderMismatch: string
  tooLong: string
  failed: string
  showing: string
  overridden: string
  empty: string
  overrideBadge: string
  filtered: string
  showSource: string
}

const CARD = 'rounded-[18px] border border-line bg-sf p-6'
const FIELD =
  'touch-44-field mt-[6px] w-full rounded-[11px] border border-line bg-bg px-[13px] py-[10px] text-[13.5px] text-ink outline-none'
const LEGEND = 'block text-[11px] font-semibold uppercase tracking-[.09em] text-mut'

export function LanguagePanel({
  namespaces,
  namespace,
  lang,
  locales,
  query,
  rows,
  matched,
  total,
  labels,
}: {
  namespaces: Choice[]
  namespace: string
  lang: string
  locales: Choice[]
  query: string
  rows: MessageRow[]
  matched: number
  total: number
  labels: Labels
}) {
  const router = useRouter()
  const params = useSearchParams()

  /** The filters are a URL, not component state: a link to one namespace is
   *  shareable, and a reload keeps the editor where it was. */
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    router.push(`/administrasjon/sprak?${next.toString()}`)
  }

  return (
    <div className="mt-5 flex flex-col gap-[18px]">
      <section className={CARD}>
        <h2 className="text-[16px] font-semibold">{labels.title}</h2>
        <p className="mt-1 max-w-[640px] text-[13px] leading-[1.55] text-mut">{labels.intro}</p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block min-w-[180px] flex-1">
            <span className={LEGEND}>{labels.namespace}</span>
            <select
              className={FIELD}
              value={namespace}
              onChange={(e) => go({ ns: e.target.value, q: query })}
            >
              {namespaces.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-[140px]">
            <span className={LEGEND}>{labels.language}</span>
            <select
              className={FIELD}
              value={lang}
              onChange={(e) => go({ ns: namespace, q: query, lang: e.target.value })}
            >
              {locales.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <form
            className="flex min-w-[220px] flex-[2] items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const value = new FormData(e.currentTarget).get('q')
              go({ ns: namespace, lang, q: String(value ?? '') })
            }}
          >
            <label className="block flex-1">
              <span className={LEGEND}>{labels.search}</span>
              <input name="q" defaultValue={query} className={FIELD} />
            </label>
            <button
              type="submit"
              className="touch-44 h-[42px] cursor-pointer rounded-[11px] border-none bg-ink px-4 text-[13px] font-semibold text-sf"
            >
              {labels.searchCta}
            </button>
          </form>
        </div>

        <p className="mt-3 text-[12.5px] text-mut">
          {labels.showing} · {labels.overridden}
          {matched < total ? ` · ${labels.filtered}` : ''}
        </p>
      </section>

      {rows.length === 0 ? (
        <p className="text-[13.5px] text-mut">{labels.empty}</p>
      ) : (
        // One card holding bordered rows, the same shape the Grupper and
        // Pålogging lists use. A card per message turned the page into a
        // 34,000px scroll for a single namespace.
        <section className="rounded-[18px] border border-line bg-sf px-6 py-2">
          {rows.map((row) => (
            <MessageEditor
              key={row.key}
              row={row}
              namespace={namespace}
              lang={lang}
              labels={labels}
              showSource={lang !== 'no'}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function MessageEditor({
  row,
  namespace,
  lang,
  labels,
  showSource,
}: {
  row: MessageRow
  namespace: string
  lang: string
  labels: Labels
  showSource: boolean
}) {
  const [saveState, save, saving] = useActionState<LangState, FormData>(saveMessage, {})
  const [resetState, reset, resetting] = useActionState<LangState, FormData>(resetMessage, {})
  const state = resetState.saved || resetState.error ? resetState : saveState

  const note = state.saved
    ? labels.saved
    : state.error === 'placeholders'
      ? `${labels.placeholderMismatch} ${state.detail ?? ''}`
      : state.error === 'too_long'
        ? labels.tooLong
        : state.error
          ? labels.failed
          : ''

  const overridden = row.override !== null
  const shipped = row.shipped || row.source

  return (
    <div className="border-b border-line py-[14px] last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/*
          The key segment alone, not `namespace.key`. The namespace is already
          the picker's value, so repeating it on every row was redundant — and
          a screen that prints dotted message keys is indistinguishable, to the
          capture gate and to a reader, from a screen whose translations have
          failed to load.
        */}
        <code className="text-[12px] font-semibold text-ink">{row.key}</code>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-mut">{shipped}</span>
        {overridden ? (
          <span
            className="flex-none rounded-full px-[10px] py-[3px] text-[11px] font-semibold"
            style={{ background: 'var(--ac2)' }}
          >
            {labels.overrideBadge}
          </span>
        ) : null}
      </div>

      {/*
        The Norwegian source, behind a disclosure rather than always on.

        Most edits are a refinement of text the editor can already read, and a
        second full-width paragraph under every row cost more scanning than it
        bought — this list is meant to be run down, not read. It opens when the
        source is actually needed, which is when translating rather than
        rewording.
      */}
      {showSource ? (
        <details className="mt-1">
          <summary className="touch-44 cursor-pointer text-[12px] text-mut">
            {labels.showSource}
          </summary>
          <p className="mt-1 text-[12px] leading-[1.45] text-mut">{row.source}</p>
        </details>
      ) : null}

      <div className="mt-2 flex flex-wrap items-start gap-2">
        <form action={save} className="flex min-w-[260px] flex-1 items-start gap-2">
          <input type="hidden" name="namespace" value={namespace} />
          <input type="hidden" name="key" value={row.key} />
          <input type="hidden" name="lang" value={lang} />
          <label className="block min-w-0 flex-1">
            <span className="sr-only">{labels.yours}</span>
            <textarea
              name="value"
              rows={1}
              defaultValue={row.override ?? shipped}
              className={`${FIELD} mt-0 resize-y font-body`}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="touch-44 flex-none cursor-pointer rounded-[11px] border-none bg-ac px-4 py-[10px] text-[13px] font-semibold text-acf disabled:opacity-60"
          >
            {labels.save}
          </button>
        </form>

        {overridden ? (
          <form action={reset}>
            <input type="hidden" name="namespace" value={namespace} />
            <input type="hidden" name="key" value={row.key} />
            <input type="hidden" name="lang" value={lang} />
            <button
              type="submit"
              disabled={resetting}
              className="touch-44 cursor-pointer whitespace-nowrap rounded-[11px] border border-line bg-transparent px-4 py-[10px] text-[13px] font-semibold text-ink disabled:opacity-60"
            >
              {labels.reset}
            </button>
          </form>
        ) : null}
      </div>

      {note ? (
        <p role={state.error ? 'alert' : 'status'} className="mt-[6px] text-[12.5px] text-mut">
          {note}
        </p>
      ) : null}
    </div>
  )
}
