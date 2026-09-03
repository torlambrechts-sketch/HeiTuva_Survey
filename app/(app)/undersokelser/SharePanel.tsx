'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { SHARE_SCOPES, type ShareScope } from './keys'
import { setResultsScope, toggleEditor } from './actions'

export type ShareCandidate = {
  id: string
  name: string
  role: string
  group: string | null
  selected: boolean
}

type Labels = {
  title: string
  sub: string
  editors: string
  scopeHeading: string
  submit: string
  close: string
  empty: string
  failed: string
  scopes: Record<ShareScope, { label: string; desc: string }>
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

/**
 * "Del med teamet" (HeiTuva.dc.html:700-740).
 *
 * Both halves write straight through — a co-editor toggle and a scope choice
 * are each a single change, so there is nothing for "Del og varsle" to commit.
 * That button closes the panel; the design's own handler does the same
 * (HeiTuva.dc.html:3427) plus an email notice, which Phase 3 owns along with
 * the rest of the mail adapter.
 */
export function SharePanel({
  surveyId,
  scope,
  candidates,
  closeHref,
  labels,
}: {
  surveyId: string
  title: string
  scope: ShareScope
  candidates: ShareCandidate[]
  closeHref: string
  labels: Labels
}) {
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)
  const router = useRouter()

  function run(action: () => Promise<{ ok: boolean }>) {
    setFailed(false)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setFailed(true)
      else router.refresh()
    })
  }

  return (
    <section
      className="mt-[22px] rounded-[18px] border-[1.5px] border-ink bg-sf px-6 py-[22px]"
      style={{ boxShadow: '0 14px 34px rgba(25,21,16,.10)' }}
      aria-label={labels.title}
    >
      <div className="flex items-start justify-between gap-[14px]">
        <div>
          <h2 className="font-display text-[22px] font-medium">{labels.title}</h2>
          <p className="mt-[3px] text-[13px] text-mut">{labels.sub}</p>
        </div>
        <Link
          href={closeHref}
          aria-label={labels.close}
          className="touch-44 flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border border-line bg-transparent text-base leading-none text-mut no-underline"
        >
          ×
        </Link>
      </div>

      {failed ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {labels.failed}
        </p>
      ) : null}

      {/* Two columns at the design's width, stacked below md — nothing hidden. */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] md:grid-cols-2">
        <div>
          <h3 className="text-[11px] uppercase tracking-[.1em] text-mut">{labels.editors}</h3>
          <div className="mt-[9px] flex flex-col gap-[7px]">
            {candidates.length === 0 ? (
              <p className="text-[12.5px] text-mut">{labels.empty}</p>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={pending}
                  aria-pressed={c.selected}
                  onClick={() => run(() => toggleEditor(surveyId, c.id))}
                  className="touch-44 flex cursor-pointer items-center gap-[11px] rounded-[11px] border px-3 py-[10px] text-left text-ink disabled:opacity-60"
                  style={{
                    borderColor: c.selected ? 'var(--ink)' : 'var(--line)',
                    background: c.selected ? 'var(--sbg)' : 'var(--bg)',
                  }}
                >
                  <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-sbg text-[11.5px] font-bold">
                    {initialsOf(c.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold">{c.name}</span>
                    <span className="block text-xs text-mut">
                      {[c.role, c.group].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span
                    className="flex h-5 w-5 flex-none items-center justify-center rounded-md border-[1.5px] text-[11px] font-bold"
                    style={{ borderColor: c.selected ? 'var(--ink)' : 'var(--line)' }}
                  >
                    {c.selected ? '✓' : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[11px] uppercase tracking-[.1em] text-mut">{labels.scopeHeading}</h3>
          <div className="mt-[9px] flex flex-col gap-[7px]">
            {SHARE_SCOPES.map((s) => {
              const on = scope === s
              return (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  aria-pressed={on}
                  onClick={() => run(() => setResultsScope(surveyId, s))}
                  className="touch-44 flex cursor-pointer items-start gap-[11px] rounded-[11px] border px-[13px] py-[11px] text-left text-ink disabled:opacity-60"
                  style={{
                    borderColor: on ? 'var(--ink)' : 'var(--line)',
                    background: on ? 'var(--sbg)' : 'var(--bg)',
                  }}
                >
                  <span
                    className="mt-[2px] flex h-4 w-4 flex-none items-center justify-center rounded-full border-[1.5px]"
                    style={{ borderColor: on ? 'var(--ink)' : 'var(--line)' }}
                  >
                    <span
                      className="block h-2 w-2 rounded-full"
                      style={{ background: on ? 'var(--ink)' : 'transparent' }}
                    />
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-semibold">
                      {labels.scopes[s].label}
                    </span>
                    <span className="mt-[2px] block text-xs leading-snug text-mut">
                      {labels.scopes[s].desc}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <Link
            href={closeHref}
            className="touch-44 mt-[14px] block w-full cursor-pointer rounded-[10px] border-none bg-ac py-3 text-center text-[13px] font-bold text-ink no-underline"
          >
            {labels.submit}
          </Link>
        </div>
      </div>
    </section>
  )
}
