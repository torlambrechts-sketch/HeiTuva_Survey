'use client'

import { useTranslations } from 'next-intl'
import { Shell } from './Shell'

/**
 * The dead-end screen: a token that does not resolve, and a round that is no
 * longer open, land here alike.
 *
 * Saying which of the two it was would turn this page into an oracle for
 * guessing tokens, so it says neither. The design has no screen for this state
 * — the prototype's link always works — so this is the minimal consistent one
 * (docs/DEVIATIONS.md D38).
 */
export function Closed() {
  const t = useTranslations('respondent')
  return (
    <Shell>
      <div className="rounded-2xl border border-line bg-sf px-8 py-12 text-center">
        <h1 className="font-display text-[28px] font-medium leading-tight">{t('closedTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mut">{t('closedBody')}</p>
      </div>
    </Shell>
  )
}
