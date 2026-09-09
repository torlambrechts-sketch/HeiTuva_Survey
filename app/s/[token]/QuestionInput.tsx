'use client'

import { useTranslations } from 'next-intl'
import { LIKERT_LABELS, MOOD_LABELS } from '@/lib/questions/registry'
import type { AnswerValue, RespondentQuestion } from '@/lib/respondent/answers'

/** The faces a smiley scale renders (HeiTuva.dc.html:3983). */
const SMILEYS = ['☹', '🙁', '😐', '🙂', '😀']

type Cfg = Record<string, unknown>
const str = (c: Cfg, k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '')
const num = (c: Cfg, k: string, d: number) => (typeof c[k] === 'number' ? (c[k] as number) : d)
const list = (c: Cfg, k: string): string[] =>
  Array.isArray(c[k]) ? (c[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []

const CHOICE =
  'touch-44 min-h-[56px] cursor-pointer rounded-xl border-[1.5px] px-4 py-[15px] text-base font-semibold'

/** Selected vs not, the design's one rule for every pickable control. */
function pick(on: boolean) {
  return {
    borderColor: on ? 'var(--ink)' : 'var(--line)',
    background: on ? 'var(--ac)' : 'var(--sf)',
    color: 'var(--ink)',
  }
}

/**
 * One renderer per question type, keyed off the type rather than branching on
 * it ad hoc — CLAUDE.md's data-not-code rule. Everything a type needs comes out
 * of `config`, which is the same shape the Builder writes and the round
 * snapshot froze.
 *
 * Every control is a real button, input, select or textarea: the respondent
 * surface is the one screen in this product used by people who did not choose
 * to be here, on their own phones, and it has to work with a keyboard, a screen
 * reader and a thumb.
 */
/**
 * V2-10, Q83/D125 — the four quiz option tiles (V2:4084-4089, rendered at
 * V2:3401-3405). `--qz1` is the ONE token in this project that is not the drawn
 * hex: `#F26B21` put the label on the tile at 2.99:1 and Tor's decision was to
 * darken it. `tests/unit/quiz-tiles.test.ts` recomputes every ratio from
 * `globals.css`, so this list cannot drift below AA without failing.
 */
const QUIZ_TILES = ['var(--qz1)', 'var(--qz2)', 'var(--qz3)', 'var(--qz4)'] as const

/**
 * The four shape markers, V2:4084-4089. They repeat every four options, exactly
 * as the bundle's `QUIZ_TILES[li % 4]` does — the shape is a SECOND channel
 * beside the colour, which is what lets somebody who cannot separate the four
 * hues still tell the tiles apart.
 */
const QUIZ_ICONS = [
  'M12 3l9 16H3z',
  'M12 2l10 10-10 10L2 12z',
  'M12 2a10 10 0 100 20 10 10 0 000-20z',
  'M3 3h18v18H3z',
] as const

export function QuestionInput({
  question,
  value,
  onChange,
  quizMode = false,
}: {
  question: RespondentQuestion
  value: AnswerValue | undefined
  onChange: (v: AnswerValue) => void
  /**
   * V2-10. Quiz mode renders `choice` as coloured tiles rather than as the
   * standard list. It changes the CHROME only: the value written is the same
   * option index, so `submit_response` and the answer key see no difference.
   */
  quizMode?: boolean
}) {
  const t = useTranslations('respondent')
  const c = (question.config ?? {}) as Cfg

  switch (question.type) {
    /* ---- numeric scales ------------------------------------------------- */
    case 'scale':
    case 'enps': {
      const points = question.type === 'enps' ? 11 : num(c, 'points', 5)
      const from = question.type === 'enps' ? 0 : 1
      /*
        The design's anchors are a DEFAULT PER TYPE, not per-question data:
        `lowLabel: q.type === "enps" ? "Svært lite sannsynlig" : (q.lowLabel ||
        "Ikke i det hele tatt")` (HeiTuva.dc.html:2902-2903). A question that
        carries its own anchors overrides them; one that does not still gets the
        pair the prototype shows, which is why the scale under the buttons was
        blank on every seeded survey — no question in the seed sets them.

        The wording is a message, not a literal: it is copy, and it has to
        follow the respondent's language like every other string here.
      */
      const isEnps = question.type === 'enps'
      const low = str(c, 'low_label') || t(isEnps ? 'enpsLowDefault' : 'scaleLowDefault')
      const high = str(c, 'high_label') || t(isEnps ? 'enpsHighDefault' : 'scaleHighDefault')
      return (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2.5">
            {Array.from({ length: points }, (_, i) => i + from).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={value === n}
                onClick={() => onChange(n)}
                // The design's `flex: 1 1 0` (HeiTuva.dc.html:2927): equal
                // widths, one row, no minimum basis. `min-w-[44px]` is the one
                // addition — RESPONSIVE.md's 44px floor. A 5-point scale still
                // fits one row at 390px, exactly as designed; an 11-point eNPS
                // wraps instead of rendering 18px targets nobody can hit.
                // docs/DEVIATIONS.md D41.
                className={`${CHOICE} min-w-[44px] flex-1 basis-0 text-center`}
                style={pick(value === n)}
              >
                {n}
              </button>
            ))}
          </div>
          {low || high ? (
            <div className="mt-[9px] flex justify-between text-[13px] text-mut">
              <span>{low}</span>
              <span>{high}</span>
            </div>
          ) : null}
        </div>
      )
    }

    case 'likert':
    case 'smiley': {
      const labels = list(c, 'labels')
      const fallback = question.type === 'smiley' ? MOOD_LABELS : LIKERT_LABELS
      const shown = labels.length ? labels : [...fallback]
      return (
        <div className="mt-5 flex flex-col gap-2.5">
          {shown.map((label, i) => (
            <button
              key={`${label}-${i}`}
              type="button"
              aria-pressed={value === i + 1}
              onClick={() => onChange(i + 1)}
              className={`${CHOICE} w-full text-left`}
              style={pick(value === i + 1)}
            >
              {question.type === 'smiley' ? `${SMILEYS[i] ?? ''} ${label}` : label}
            </button>
          ))}
        </div>
      )
    }

    case 'slider': {
      const min = num(c, 'min', 0)
      const max = num(c, 'max', 100)
      const current = typeof value === 'number' ? value : Math.round((min + max) / 2)
      return (
        <div className="mt-[22px]">
          <input
            type="range"
            min={min}
            max={max}
            value={current}
            aria-label={question.text}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-8 w-full"
            style={{ accentColor: 'var(--ac)' }}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[13px] text-mut">{str(c, 'low_label')}</span>
            <span className="rounded-full bg-ac px-4 py-[7px] text-[15px] font-bold">{current}</span>
            <span className="text-[13px] text-mut">{str(c, 'high_label')}</span>
          </div>
        </div>
      )
    }

    /* ---- pick from a list ------------------------------------------------ */
    case 'yesno': {
      const opts = [
        { label: t('yes'), v: true },
        { label: t('no'), v: false },
      ]
      return (
        <div className="mt-5 flex gap-2.5">
          {opts.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={value === o.v}
              onClick={() => onChange(o.v)}
              className={`${CHOICE} min-w-[44px] flex-1 basis-0`}
              style={pick(value === o.v)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )
    }

    case 'choice': {
      const options = list(c, 'options')
      const multi = c.multi === true
      const chosen = Array.isArray(value) ? (value as number[]) : []

      // V2-10: the quiz tiles (V2:3399-3408). A two-column grid of tall
      // coloured buttons, each with its shape marker and its label. Only for a
      // single-choice question: a quiz awards points for THE correct option, so
      // a multi-select tile grid would be a control promising something the
      // scoring cannot express.
      if (quizMode && !multi) {
        return (
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {options.map((label, i) => {
              const on = value === i
              const tile = QUIZ_TILES[i % 4]!
              return (
                <button
                  key={`${label}-${i}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(i)}
                  className="touch-44 flex min-h-[84px] min-w-0 cursor-pointer items-center gap-3 rounded-[14px] px-[15px] py-3.5 text-left text-[15px] font-bold"
                  style={{
                    background: tile,
                    color: 'var(--sf)',
                    border: `3px solid ${on ? 'var(--ink)' : tile}`,
                    boxShadow: on ? '0 0 0 3px rgba(25,21,16,.12)' : 'none',
                  }}
                >
                  <span className="flex h-[30px] w-[30px] flex-none items-center justify-center">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d={QUIZ_ICONS[i % 4]} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1 leading-[1.3]">{label}</span>
                </button>
              )
            })}
          </div>
        )
      }

      return (
        <div className="mt-5 flex flex-col gap-2.5">
          {options.map((label, i) => {
            const on = multi ? chosen.includes(i) : value === i
            return (
              <button
                key={`${label}-${i}`}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  multi
                    ? onChange(
                        chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i].sort(),
                      )
                    : onChange(i)
                }
                className={`${CHOICE} w-full text-left`}
                style={pick(on)}
              >
                {label}
              </button>
            )
          })}
        </div>
      )
    }

    case 'dropdown': {
      const options = list(c, 'options')
      return (
        <select
          value={typeof value === 'number' ? String(value) : ''}
          aria-label={question.text}
          onChange={(e) => onChange(Number(e.target.value))}
          className="touch-44-field mt-5 min-h-[56px] w-full rounded-xl border-[1.5px] border-line bg-bg px-4 py-[15px] text-base text-ink outline-none"
        >
          <option value="" disabled>
            {t('chooseOne')}
          </option>
          {options.map((label, i) => (
            <option key={`${label}-${i}`} value={i}>
              {label}
            </option>
          ))}
        </select>
      )
    }

    case 'image': {
      // The image URLs a Builder upload will write are not in the schema yet, so
      // the card renders its label on the design's tinted panel rather than a
      // fake photo. docs/DEVIATIONS.md D39.
      const options = list(c, 'options')
      const chosen = typeof value === 'number' ? value : -1
      return (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {options.map((label, i) => (
            <button
              key={`${label}-${i}`}
              type="button"
              aria-pressed={chosen === i}
              onClick={() => onChange(i)}
              className="touch-44 cursor-pointer overflow-hidden rounded-[14px] border-[1.5px] text-left text-ink"
              style={{
                borderColor: chosen === i ? 'var(--ink)' : 'var(--line)',
                background: 'var(--sf)',
              }}
            >
              <span className="block h-[120px]" style={{ background: 'var(--sbg2)' }} />
              <span className="block px-3.5 py-3 text-[14.5px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      )
    }

    case 'ranking': {
      const options = list(c, 'options')
      const order = Array.isArray(value) && value.length ? (value as number[]) : options.map((_, i) => i)
      const move = (from: number, to: number) => {
        if (to < 0 || to >= order.length) return
        const next = [...order]
        const [item] = next.splice(from, 1)
        next.splice(to, 0, item!)
        onChange(next)
      }
      return (
        <div className="mt-[18px] flex flex-col gap-2">
          {order.map((optionIndex, position) => (
            <div
              key={optionIndex}
              className="flex items-center gap-[11px] rounded-xl border border-line bg-bg px-3.5 py-3"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-ac text-[13px] font-bold">
                {position + 1}
              </span>
              <span className="flex-1 text-[15px]">{options[optionIndex]}</span>
              <button
                type="button"
                aria-label={`${t('moveUp')}: ${options[optionIndex]}`}
                disabled={position === 0}
                onClick={() => move(position, position - 1)}
                className="touch-44 h-10 w-10 cursor-pointer rounded-[10px] border border-line bg-transparent text-sm disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`${t('moveDown')}: ${options[optionIndex]}`}
                disabled={position === order.length - 1}
                onClick={() => move(position, position + 1)}
                className="touch-44 h-10 w-10 cursor-pointer rounded-[10px] border border-line bg-transparent text-sm disabled:opacity-40"
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      )
    }

    case 'matrix': {
      const statements = list(c, 'statements')
      const points = num(c, 'points', 5)
      const rows = Array.isArray(value) ? (value as number[]) : []
      return (
        <div className="mt-[18px] flex flex-col gap-3">
          {statements.map((statement, r) => (
            <div key={`${statement}-${r}`} className="flex flex-col gap-2">
              <span className="text-sm">{statement}</span>
              <span className="flex flex-wrap gap-[5px]">
                {Array.from({ length: points }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${statement}: ${n}`}
                    aria-pressed={rows[r] === n}
                    onClick={() => {
                      const next = [...rows]
                      while (next.length < statements.length) next.push(0)
                      next[r] = n
                      onChange(next)
                    }}
                    className="touch-44 min-h-[44px] w-11 cursor-pointer rounded-[10px] border-[1.5px] text-sm font-semibold"
                    style={pick(rows[r] === n)}
                  >
                    {n}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )
    }

    /* ---- open and factual ------------------------------------------------ */
    case 'field': {
      const fields = Array.isArray(c.fields) ? (c.fields as unknown[]) : []
      const current = value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, string>)
        : {}
      return (
        <div className="mt-5 flex flex-col gap-3">
          {fields.map((f, i) => {
            const [label, kind] = Array.isArray(f) ? (f as string[]) : [String(f), 'text']
            const name = label ?? `felt-${i}`
            return (
              <label key={`${name}-${i}`} className="block">
                <span className="block text-xs text-mut">{name}</span>
                <input
                  type={kind === 'email' ? 'email' : kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
                  value={current[name] ?? ''}
                  onChange={(e) => onChange({ ...current, [name]: e.target.value })}
                  className="touch-44-field mt-[5px] min-h-[52px] w-full rounded-xl border border-line bg-bg px-4 py-3.5 text-base text-ink outline-none"
                />
              </label>
            )
          })}
        </div>
      )
    }

    case 'text':
    default:
      return (
        <textarea
          rows={5}
          value={typeof value === 'string' ? value : ''}
          placeholder={t('write')}
          aria-label={question.text}
          onChange={(e) => onChange(e.target.value)}
          className="mt-[18px] w-full resize-y rounded-xl border border-line bg-bg px-4 py-3.5 text-base leading-relaxed text-ink outline-none"
        />
      )
  }
}
