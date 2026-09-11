'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { commentThread, type Thread } from './actions'

/**
 * C5/Q111 — the respondent reads the reply to her own comment, through the same
 * link she answered from.
 *
 * ── THIS IS THE HALF THAT MADE Q111 NECESSARY ──────────────────────────────
 *
 * The bundle says «respondenten ser svaret ved neste innlogging». **A respondent
 * does not log in.** She holds a link, and giving respondents accounts would
 * undo the thing that makes them answer. So either the token stays valid for
 * READING after submission, or manager replies are write-only and the feature is
 * a suggestion box with extra steps.
 *
 * The capability is one verb wide: it reads her own thread and nothing else. It
 * does not re-open submission (`already_responded` is untouched), cannot reach
 * another respondent's thread, cannot read results, and expires with the round.
 *
 * Fetched AFTER submitting, like `PeerResults` and for a related reason: before
 * she has answered there is nothing of hers to show, and a panel that renders
 * empty teaches her to ignore it.
 *
 * **No loading skeleton and no empty box.** Until there is something to read,
 * this renders nothing at all — a heading over «Ingen svar ennå» on a screen
 * she will probably never revisit is furniture, not information.
 */
export function CommentThread({ token }: { token: string }) {
  const t = useTranslations('respondent')
  const [thread, setThread] = useState<Thread | null>(null)

  useEffect(() => {
    let live = true
    commentThread(token).then((r) => {
      if (live) setThread(r)
    })
    return () => {
      live = false
    }
  }, [token])

  const withReplies = (thread?.comments ?? []).filter((c) => c.replies.length > 0)
  if (!withReplies.length) return null

  return (
    <section className="mt-5 rounded-2xl border border-line bg-sf px-6 py-5 text-left">
      <h2 className="text-[15px] font-semibold leading-[1.35]">{t('threadTitle')}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {withReplies.map((c) => (
          <div key={c.id}>
            <p className="text-[11.5px] text-mut">{t('threadYourComment')}</p>
            <p className="mt-0.5 text-[13.5px] leading-[1.5]">«{c.text}»</p>
            <div
              className="mt-2 flex flex-col gap-2 pl-4"
              style={{ borderLeft: '2px solid var(--ac2)' }}
            >
              {c.replies.map((r, i) => (
                <p key={i} className="rounded-[11px] bg-bg px-3.5 py-[11px] text-[13.5px] leading-[1.5]">
                  {r.text}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
