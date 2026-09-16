'use client'

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { closedLoop, setResultOptIn, type ClosedLoop as Loop } from './actions'

/**
 * G1 — «Du sa · vi gjorde» and the result opt-in, v6:5527-5546 and v6:5520-5525.
 *
 * ── WHAT IS DRAWN AND NOT BUILT, STATED RATHER THAN OMITTED ────────────────
 *
 * The bundle pairs every action with a QUOTE — «{{ s6.said }}» above the bold
 * «{{ s6.did }}». The quote half is refused, and it is Q72's own sentence that
 * refuses it: show what was DONE, never what was found. A quote IS the finding,
 * in one respondent's own words, rendered to another respondent on a page whose
 * reader has no role, no session and — for a share link — no relationship to
 * the organisation at all. So each row is the action alone (D199).
 *
 * The heading keeps its name because the SURFACE is still the closed loop: the
 * respondent said something last round and this is what came of it. What
 * changes is that the «you said» half is the survey she just answered rather
 * than a sentence quoted back at her.
 *
 * ── AND THE CARD DOES NOT EXIST UNTIL THERE IS SOMETHING IN IT ─────────────
 *
 * `tasks.shared_with_respondents` defaults FALSE, so a new organisation has an
 * empty loop, and an empty card under a heading promising closed loops is worse
 * than no card: it says the organisation did nothing. Same rule `CommentThread`
 * already follows one component over.
 */
export function ClosedLoop({
  token,
  orgName,
  nextSteps,
}: {
  token: string
  orgName: string
  nextSteps: string
}) {
  const t = useTranslations('respondent')
  const format = useFormatter()
  const [loop, setLoop] = useState<Loop | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    closedLoop(token).then((r) => {
      if (live) setLoop(r)
    })
    return () => {
      live = false
    }
  }, [token])

  const showNext = Boolean(nextSteps.trim()) || Boolean(loop?.canOptIn)
  const items = loop?.items ?? []

  async function toggle() {
    if (!loop || saving) return
    setSaving(true)
    const want = !loop.wantsResult
    const ok = await setResultOptIn(token, want)
    // Only the CONFIRMED state is rendered. An optimistic flip would show a
    // tick for a write that failed, which on this card reads as a promise.
    setLoop({ ...loop, wantsResult: ok ? want : loop.wantsResult })
    setSaving(false)
  }

  return (
    <>
      {showNext ? (
        <section className="mt-[22px] rounded-[14px] border border-line bg-sf px-5 py-5 text-left">
          <h2 className="text-[11px] uppercase tracking-[.09em] text-mut">{t('nextTitle')}</h2>
          {/* Rendered only when the editor wrote one. The bundle's own sentence
              names a committee and a date (v6:10078) and nothing backs it, so an
              unwritten field renders nothing rather than a plausible guess. */}
          {nextSteps.trim() ? (
            <p className="mt-[7px] text-[14px] leading-[1.6]">{nextSteps.trim()}</p>
          ) : null}

          {loop?.canOptIn ? (
            <>
              <button
                type="button"
                onClick={toggle}
                disabled={saving}
                aria-pressed={loop.wantsResult}
                className="touch-44 mt-3.5 flex min-h-[48px] w-full cursor-pointer items-center gap-[11px] rounded-[12px] border border-line px-3.5 py-3 text-left text-ink"
                style={{ background: loop.wantsResult ? 'var(--ac2)' : 'transparent' }}
              >
                <span
                  aria-hidden
                  className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] text-[12px] font-bold"
                  style={{ border: '1.5px solid var(--ink)' }}
                >
                  {loop.wantsResult ? '✓' : ''}
                </span>
                <span className="text-[13.5px] font-semibold">
                  {loop.wantsResult ? t('optInOn') : t('optInOff')}
                </span>
              </button>
              {/* SAYS WHAT IT DOES AND WHAT IT DOES NOT DO. The bundle's label
                  promises an email; the product records a preference and a
                  person sends the result. Promising the send would be a claim
                  nothing honours. */}
              <p className="mt-2 text-[12.5px] leading-[1.5] text-mut">
                {t('optInNote', { virksomhet: orgName })}
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {items.length ? (
        <section
          className="mt-4 rounded-[14px] px-5 py-5 text-left"
          style={{ background: 'var(--ac2)' }}
        >
          <h2 className="text-[11px] uppercase tracking-[.09em] text-mut">{t('loopTitle')}</h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-mut">{t('loopLead')}</p>
          <ul className="mt-3 flex flex-col">
            {items.map((i, n) => (
              <li
                key={`${i.title}-${n}`}
                className="flex items-start gap-3 py-[11px]"
                style={{ borderTop: '1px solid rgba(25,21,16,.14)' }}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-sf text-[11px] font-bold"
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold leading-[1.5]">{i.title}</span>
                  <span className="mt-[3px] block text-[13px] font-medium text-mut">
                    {i.when
                      ? format.dateTime(new Date(i.when), { day: 'numeric', month: 'long' })
                      : t('loopNoDate')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
