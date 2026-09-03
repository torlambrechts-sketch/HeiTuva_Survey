'use client'

import { useTranslations } from 'next-intl'
import { estimatedMinutes } from '@/lib/questions/registry'
import type { DraftQuestion } from './types'

/** The faces the design renders for a smiley scale (HeiTuva.dc.html:3983). */
const SMILEYS = ['☹', '🙁', '😐', '🙂', '😀']

/**
 * The chips one question shows in the phone preview.
 *
 * Keyed off the type, but returning data rather than markup — the respondent
 * renderer in Phase 3 needs the same answer, and this is the shape it will
 * read. Anything without a fixed set of choices previews as a single chip
 * standing in for the input.
 */
function previewChips(
  q: DraftQuestion,
  answerPlaceholder: string,
  yes: string,
  no: string,
): string[] {
  const c = q.config
  switch (q.type) {
    case 'scale':
      return Array.from({ length: c.points ?? 5 }, (_, i) => String(i + 1))
    case 'likert':
      return c.labels ?? []
    case 'smiley':
      return (c.labels ?? []).map((label, i) => SMILEYS[i] ?? label)
    case 'enps':
      return Array.from({ length: 11 }, (_, i) => String(i))
    case 'yesno':
      return [yes, no]
    case 'choice':
    case 'dropdown':
    case 'image':
    case 'ranking':
      return c.options ?? []
    case 'matrix':
      return (c.statements ?? []).slice(0, 3)
    case 'slider':
      return [`${c.low_label || '0'} ⟵ ● ⟶ ${c.high_label || '100'}`]
    case 'field':
      return (c.fields ?? []).map(([label]) => label)
    case 'text':
    default:
      return [answerPlaceholder]
  }
}

/**
 * "Slik ser respondenten det" (HeiTuva.dc.html:650-680).
 *
 * A static rendering, not a working respondent flow — that is Phase 3 at
 * /s/[token], where the real one is mobile-first and pixel-perfect against the
 * design's respondent screens.
 */
export function PreviewPane({
  title,
  questions,
}: {
  title: string
  questions: DraftQuestion[]
}) {
  const t = useTranslations('builder')

  return (
    <div
      className="sticky top-0 rounded-2xl border border-line p-5"
      style={{ background: 'var(--sf2)' }}
    >
      <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('previewTitle')}</div>
      <div
        className="mx-auto mt-3 w-full max-w-[300px] rounded-[34px] px-3 pb-[18px] pt-[14px]"
        style={{ background: 'var(--ink)', boxShadow: '0 18px 40px rgba(25,21,16,.18)' }}
      >
        <div
          className="mx-auto mb-3 h-[6px] w-24 rounded-[3px]"
          style={{ background: 'rgba(255,255,255,.25)' }}
        />
        <div className="min-h-[420px] rounded-[22px] bg-bg px-4 py-[18px]">
          <div className="font-display text-[19px] font-bold leading-tight">{title}</div>
          <div className="mt-[2px] text-[13px] text-mut">
            {t('previewMeta', {
              count: questions.length,
              mins: estimatedMinutes(questions.length),
            })}
          </div>
          {questions.map((q, i) => {
            const chips = previewChips(q, t('previewAnswer'), t('previewYes'), t('previewNo'))
            return (
              <div key={q.id} className="mt-[17px]">
                <div className="text-[13.5px] font-medium">
                  {i + 1}. {q.text}{' '}
                  {q.required ? <span style={{ color: 'var(--ac2)' }}>*</span> : null}
                </div>
                {q.help ? <div className="mt-[3px] text-[13px] text-mut">{q.help}</div> : null}
                <div className="mt-[9px] flex flex-wrap gap-[7px]">
                  {chips.map((label, ci) => (
                    <span
                      key={`${label}-${ci}`}
                      className="rounded-[9px] border border-line px-3 py-[7px] text-[13px] text-mut"
                      style={{ background: 'var(--sf)' }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                {q.type === 'scale' || q.type === 'slider' ? (
                  <div className="mt-[6px] flex justify-between text-[11px] text-mut">
                    <span>{q.config.low_label ?? ''}</span>
                    <span>{q.config.high_label ?? ''}</span>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
