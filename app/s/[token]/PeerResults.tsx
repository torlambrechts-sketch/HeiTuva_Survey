'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { peerResults, type PeerResults as Peer } from './actions'

/**
 * "Slik svarte kollegene dine" — the thank-you screen's chart
 * (HeiTuva.dc.html:2117-2135).
 *
 * Fetched AFTER submitting rather than rendered with the page, for one reason
 * that matters: a respondent who has not answered yet must not be shown the
 * distribution first. Seeing how everyone else answered before you answer is
 * how you get a survey that measures conformity.
 *
 * Four states, all of them real: a chart, the k-anonymity floor, the
 * organisation note, or nothing at all when the survey did not opt in. There is
 * no loading skeleton pretending to be data.
 *
 * The organisation state is Q47 seen from the respondent's side. The RPC
 * returns `hidden` for a supplier — a supplier holding a live token could
 * otherwise retrieve the distribution of its competitors' answers — but the
 * bundle does not simply drop the panel: it keeps the heading and says why
 * («Svar fra virksomheter vises ikke samlet — de leses enkeltvis.», :3985).
 * That is the better treatment, and it costs nothing: the respondent is a
 * company answering under its own name and already knows which kind of survey
 * this is.
 *
 * `respondentKind` comes from the PAGE, not from the payload. The RPC returns
 * the same bare `hidden` for three different reasons — an organisation survey,
 * `reveal_results` off, and a survey with no scale question — and telling them
 * apart in the payload would hand a token holder a fact about the survey's
 * configuration for no gain. The page already rendered the questions, so it
 * knows.
 */
export function PeerResults({
  token,
  respondentKind,
}: {
  token: string
  respondentKind: 'person' | 'organisation'
}) {
  const t = useTranslations('respondent')
  const [data, setData] = useState<Peer | null>(null)

  useEffect(() => {
    let live = true
    peerResults(token).then((r) => {
      if (live) setData(r)
    })
    return () => {
      live = false
    }
  }, [token])

  if (!data) return null

  if ('hidden' in data) {
    if (respondentKind !== 'organisation') return null
    return (
      <div className="mt-6 rounded-[14px] bg-sbg p-5 text-left">
        <div className="text-[14.5px] font-semibold">{t('peerTitle')}</div>
        <p className="mt-3 text-[13px] text-mut">{t('peerOrganisation')}</p>
      </div>
    )
  }

  if ('insufficientData' in data) {
    return (
      <div className="mt-6 rounded-[14px] bg-sbg p-5 text-left">
        <div className="text-[14.5px] font-semibold">{t('peerTitle')}</div>
        <div className="mt-[3px] text-[13px] text-mut">{data.question}</div>
        <p className="mt-3 text-[13px] text-mut">{t('peerBelowK', { k: data.k })}</p>
      </div>
    )
  }

  const max = Math.max(...data.buckets.map((b) => b.count), 1)

  return (
    <div className="mt-6 rounded-[14px] bg-sbg p-5 text-left">
      <div className="text-[14.5px] font-semibold">{t('peerTitle')}</div>
      <div className="mt-[3px] text-[13px] text-mut">{data.question}</div>
      <div className="mt-3.5 flex flex-col gap-[7px]">
        {data.buckets.map((b) => (
          <div key={b.value} className="flex items-center gap-2.5">
            <span className="w-8 flex-none text-right text-[13px] text-mut">{b.value}</span>
            <span
              className="block h-4 flex-1 overflow-hidden rounded-md"
              style={{ background: 'rgba(255,255,255,.6)' }}
            >
              <span
                className="block h-full rounded-md bg-ac"
                style={{ width: `${Math.round((b.count / max) * 100)}%` }}
              />
            </span>
            <span className="w-8 flex-none text-xs">{b.count}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-mut">{t('peerNote', { n: data.n })}</p>
    </div>
  )
}
