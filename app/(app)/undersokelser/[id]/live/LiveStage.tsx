'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { closeLiveSession, openLiveSession, setRevealed } from './actions'

export type CloudWord = { word: string; n: number }
export type LiveBar = { label: string; n: number }

/**
 * Every string this screen renders, named. A `Record<string, string>` would
 * type-check and hand `undefined` to JSX under `noUncheckedIndexedAccess`, so
 * the keys are written out — which also makes the message file's coverage a
 * compile error rather than an empty span.
 */
type Strings = {
  heading: string
  reveal: string
  hide: string
  settings: string
  open: string
  close: string
  noRound: string
  notLiveMode: string
  /** G2 — the ORGANISATION does not allow live mode. A different sentence
   *  from `notLiveMode`, with a next step the editor cannot take themselves. */
  modeNotAllowed: string
  noSession: string
  scanHint: string
  guard: string
  counterHidden: string
  counter: string
  barsGated: string
  cloudTitle: string
  cloudFloor: string
  cloudGated: string
  cloudEmpty: string
  cloudNoQuestion: string
  priorityTitle: string
  priorityUnavailable: string
  audienceTitle: string
  audienceUnavailable: string
  closingTitle: string
  closingUnavailable: string
  fullscreenTitle: string
  fullscreenUnavailable: string
}

/** The bars' colours, stated literally by the design (V2:6176). */
const BAR_COLORS = ['#A8D5D2', '#F5C64A', '#FBEBBE', '#FBD5C4', '#FBD5C4']

/**
 * The card shell every panel below the stage uses — V2:1875, one border, one
 * radius, one padding. Extracted so the four cards cannot drift apart.
 */
const CARD = 'rounded-[18px] border border-line bg-sf px-6 py-[22px]'

/**
 * A panel whose feature does not exist. **Not a placeholder for data** — it says
 * so in words, which is the difference between this and a fabricated value.
 * `admin.mgPopulationsUnavailable`, Q26's stream panel and Q74's forum are the
 * same treatment; `help_articles.requires_flag` states the rule: a reader must
 * be able to tell «not documented» from «not built».
 */
function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <div className={CARD}>
      <div className="text-base font-bold">{title}</div>
      <p className="mt-3.5 rounded-[10px] border border-dashed border-line bg-bg px-[15px] py-3 text-[13px] leading-[1.5] text-mut">
        {body}
      </p>
    </div>
  )
}

export function LiveStage({
  surveyId,
  orgId,
  roundId,
  title,
  isLiveMode,
  modeAllowed,
  session,
  qrSvg,
  joinUrl,
  k,
  answered,
  bars,
  barsGated,
  barsQuestion,
  cloud,
  cloudQuestion,
  strings: s,
}: {
  surveyId: string
  orgId: string
  roundId: string | null
  title: string
  isLiveMode: boolean
  /** G2 — whether the ORGANISATION allows live mode at all.
   *  Distinct from `isLiveMode`, which is about THIS survey: «this survey is
   *  not live» and «this organisation does not do live» are different
   *  sentences with different next steps, and one of them is not the editor's
   *  to take. */
  modeAllowed: boolean
  session: { id: string; code: string; revealed: boolean } | null
  qrSvg: string | null
  joinUrl: string | null
  k: number
  answered: number
  bars: LiveBar[]
  barsGated: boolean
  barsQuestion: string | null
  cloud: { words: CloudWord[]; floor: number; gated: boolean } | null
  cloudQuestion: string | null
  strings: Strings
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // ── Q78 IS OPEN, AND THIS IS THE CONSERVATIVE SIDE OF IT ─────────────────
  //
  // Tor holds Q78: whether the live counter may run below the threshold. The
  // bundle shows `liveStage.counter` climbing continuously (V2:6177) and the
  // bars appearing at the moment it crosses (V2:1863) — in a room that already
  // knows who is present, which makes the INCREMENT a correlation channel even
  // where Q28 licenses the number.
  //
  // Until he answers, the counter is HIDDEN below k and the reveal is refused
  // below k. This is the reversible direction: if he answers «as drawn», a guard
  // is removed. The other way round would mean a correlation channel had already
  // shipped. The phase report names it as pending, not as decided.
  const belowThreshold = answered < k
  const revealed = session?.revealed ?? false

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null)
    start(async () => {
      const r = await fn()
      if (r.error) setError(r.error === 'namedSurvey' ? s.notLiveMode : r.error)
    })
  }

  // WALK 2026-09-12 (W-07): a <main>, not a <div>. Every control on this screen
  // sat outside any landmark, so a screen-reader user navigating by landmark
  // could not reach it — and the definition of done names keyboard and
  // focus-visible explicitly. Every other screen in the product has one. The
  // classes are unchanged, so nothing moves a pixel.
  return (
    <main className="animate-enter pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-medium">{s.heading}</h1>
          <p className="mt-[3px] text-[13px] text-mut">
            {title}
          </p>
        </div>
        <div className="flex flex-wrap gap-[9px]">
          {session ? (
            <>
              <button
                type="button"
                disabled={pending || (belowThreshold && !revealed)}
                onClick={() => act(() => setRevealed(session.id, surveyId, !revealed))}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-bold text-acf disabled:cursor-not-allowed disabled:opacity-50"
              >
                {revealed ? s.hide : s.reveal}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => closeLiveSession(session.id, surveyId))}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[18px] py-[11px] text-[13px] font-semibold text-ink"
              >
                {s.close}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending || !roundId || !isLiveMode || !modeAllowed}
              onClick={() => act(() => openLiveSession(surveyId, roundId!, orgId))}
              className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-bold text-acf disabled:cursor-not-allowed disabled:opacity-50"
            >
              {s.open}
            </button>
          )}
          {/* V2:1838's second header button. It was in `Strings` and rendered
              nowhere in the first draft of this file — a translated string with
              no control, which is the quiet half of a missing feature. */}
          <Link
            href={`/undersokelser/${surveyId}/bygg`}
            className="touch-44 flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[18px] py-[11px] text-[13px] font-semibold text-ink no-underline"
          >
            {s.settings}
          </Link>
        </div>
      </div>

      {/* G2 — THE URL TEST, AND IT FAILED BEFORE THIS BRANCH EXISTED.

          Tor: «a feature that is OFF but still reachable by URL is a switch
          that describes rather than controls.» Driven with live disallowed,
          this route returned HTTP 200 with a «Start live» button on it — the
          click would have been refused by `app.guard_run_mode_allowed`, which
          is a control that works and a screen that lies about it.

          The organisation's refusal comes FIRST because it is the one the
          editor cannot act on: «set this survey to live» is useless advice when
          the organisation does not allow live at all. */}
      {!modeAllowed ? (
        <p className="mt-[18px] rounded-[10px] border border-dashed border-line bg-bg px-[15px] py-3 text-[13px] text-mut">
          {s.modeNotAllowed}
        </p>
      ) : !isLiveMode ? (
        <p className="mt-[18px] rounded-[10px] border border-dashed border-line bg-bg px-[15px] py-3 text-[13px] text-mut">
          {s.notLiveMode}
        </p>
      ) : null}
      {!roundId ? (
        <p className="mt-[18px] rounded-[10px] border border-dashed border-line bg-bg px-[15px] py-3 text-[13px] text-mut">
          {s.noRound}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-[18px] text-[13px] text-mut">
          {error}
        </p>
      ) : null}

      {/* The stage — V2:1841. `--ink` on `--sf`, from the theme tokens: the
          plan's «dark surface with no dark tokens» was measured false before
          this was written (docs/v2/07-v2-9-opening.md § 1.1). */}
      <div className="mt-[18px] rounded-[22px] bg-ink px-[34px] py-[34px] text-sf">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-[260px] flex-1">
            <div className="text-[11px] uppercase tracking-[.1em] opacity-65">
              {s.heading}
            </div>
            <div className="mt-2.5 font-display text-[38px] font-medium leading-[1.15]">
              {barsQuestion ?? title}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3.5">
              <span className="whitespace-nowrap rounded-full bg-[rgba(255,253,246,.14)] px-4 py-[9px] text-[13px] font-bold">
                {belowThreshold ? s.counterHidden : s.counter}
              </span>
              <span className="text-[13px] opacity-75">{s.guard}</span>
            </div>
          </div>

          {qrSvg && joinUrl ? (
            <div className="flex-none rounded-[18px] bg-sf p-[18px] text-center">
              <div
                className="h-[132px] w-[132px] [&>svg]:h-full [&>svg]:w-full"
                aria-label={s.scanHint}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div className="mt-2.5 font-mono text-[11.5px] text-mut">{session?.code}</div>
            </div>
          ) : (
            <div className="flex-none rounded-[18px] bg-sf p-[18px] text-center">
              <p className="max-w-[132px] text-[12px] leading-[1.45] text-mut">{s.noSession}</p>
            </div>
          )}
        </div>

        {revealed ? (
          <div className="mt-[26px] flex flex-col gap-[11px] border-t border-[rgba(255,253,246,.16)] pt-6">
            {barsGated || bars.length === 0 ? (
              <p className="text-[13px] opacity-75">{s.barsGated}</p>
            ) : (
              bars.map((b, i) => {
                const total = bars.reduce((a, x) => a + x.n, 0) || 1
                return (
                  <div key={b.label}>
                    <div className="flex justify-between text-sm">
                      <span>{b.label}</span>
                      <span className="font-bold">{b.n}</span>
                    </div>
                    <div className="mt-1.5 h-3.5 overflow-hidden rounded-full bg-[rgba(255,253,246,.14)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((b.n / total) * 100)}%`,
                          background: BAR_COLORS[i % BAR_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-[18px] grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {/* Ordsky — the one card with real data (Q79). */}
        <div className={CARD}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base font-bold">{s.cloudTitle}</span>
            {/* THE CORRECTED CAPTION. The bundle writes «3 frisvar venter på
                moderering før de vises» (V2:6180) — Q79 decided there is no
                moderation, so that sentence would be a promise the product does
                not keep. It states the floor instead, which is what actually
                decides whether a word appears. */}
            {/* WALK 2026-09-12: only when the floor is KNOWN. `live_cloud` returns
                `{insufficient_data, n, k}` below the threshold — with no `floor`
                key at all — and the page's `?? 0` turned that absence into «Ord
                minst 0 personer har skrevet», projected on a wall, one line under
                the promise that the threshold is respected. A floor of 0 says the
                cloud may show a word nobody wrote, which is the opposite of what
                gating does. The number is unknown here, so the sentence goes. */}
            {cloud?.gated ? null : <span className="text-[11.5px] text-mut">{s.cloudFloor}</span>}
          </div>
          {!cloudQuestion ? (
            <p className="mt-3.5 text-[13px] text-mut">{s.cloudNoQuestion}</p>
          ) : cloud?.gated ? (
            <p className="mt-3.5 text-[13px] text-mut">{s.cloudGated}</p>
          ) : (cloud?.words.length ?? 0) === 0 ? (
            <p className="mt-3.5 text-[13px] text-mut">{s.cloudEmpty}</p>
          ) : (
            <div className="mt-3.5 flex flex-wrap items-baseline gap-3">
              {cloud!.words.map((w) => {
                // Size from rank, not from an absolute count: the design's
                // 28px…13px range (V2:6178) over however many words there are.
                const top = cloud!.words[0]!.n
                const size = 13 + Math.round((w.n / top) * 15)
                return (
                  <span
                    key={w.word}
                    className="font-display font-medium leading-[1.1]"
                    style={{ fontSize: `${size}px` }}
                    title={`${w.n}`}
                  >
                    {w.word}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <Unavailable title={s.priorityTitle} body={s.priorityUnavailable} />
        <Unavailable title={s.audienceTitle} body={s.audienceUnavailable} />
        <Unavailable title={s.closingTitle} body={s.closingUnavailable} />
        <Unavailable title={s.fullscreenTitle} body={s.fullscreenUnavailable} />
      </div>
    </main>
  )
}
