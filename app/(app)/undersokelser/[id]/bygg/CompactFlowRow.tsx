'use client'

import { useTranslations } from 'next-intl'
import { BLOCKS, type BlockDraft } from '@/lib/surveys/blocks'
import { DOT_TINT, moveTargets, type FlowDot } from '@/lib/surveys/flow-row'
import { TYPE_OPTION_KEY, type DraftQuestion } from './types'

/**
 * V7-5 — the flow's COMPACT row (v7:759-782).
 *
 * One row, one line: the badge, the status dot, the label, the kind pill, «Flytt
 * til plass», and the three actions. It exists for the case the builder's full
 * cards cannot serve — v7's own hint says so, «Kompakt visning gir overblikk i
 * lange undersøkelser» — and `LONG_SURVEY_THRESHOLD` has been in this codebase
 * for the same reason since Phase 2.
 *
 * ── ONE COMPONENT HERE, AND THAT IS A CORRECTION TO V7-4 § 3 ──────────────
 *
 * V7-4 read `badgeIsNum` / `badgeIsIcon` as keys that exist only because the
 * bundle renders both kinds of flow row with ONE component, and concluded the
 * property was «already structurally true» because we have `QuestionCard` and
 * `BlockCard`. **That was true of the FULL row and silent about this one.**
 * Compacted, the two kinds ARE one shape — same height, same columns, differing
 * only in the badge and the tint — so two components here would be two copies
 * of one row, which is the shape that drifts. The keys are real for us in this
 * row, and V7-4's sentence needed the word «full» in it.
 *
 * ── WHAT IS NOT HERE, AND WHY ─────────────────────────────────────────────
 *
 * **The grab handle.** v7's compact row opens with a `cursor:grab` ⠿ and is
 * `draggable`. D235 refuses the drag — no keyboard equivalent, no
 * `docs/RESPONSIVE.md` pattern — and a handle that cannot be grabbed is worse
 * than no handle: it is the third face of D221, a control whose appearance
 * claims an ability the code does not have. The full cards keep their handle
 * because they also keep the arrows beside it and the row reads as a row; a
 * one-line row with a handle and no drag is just a lie about a pixel.
 *
 * **v7's hint sentence, in full.** `flowDragHint` (v7:10191) is «Dra i
 * håndtaket for å flytte, eller bruk piltastene og «Flytt til». Kompakt visning
 * gir overblikk i lange undersøkelser.» Only the second sentence ships
 * (`builder.flowCompactHint`): shipping the first would tell the author about a
 * drag that is not there. **A bundle's copy is a claim set, and a claim about a
 * control is the easiest kind to implement by accident.**
 */
export type CompactRowItem =
  | { kind: 'question'; question: DraftQuestion; num: number }
  | { kind: 'block'; block: BlockDraft }

export function CompactFlowRow({
  item,
  dot,
  dotTitle,
  slot,
  total,
  disabled,
  onMove,
  onMoveTo,
  onRemove,
}: {
  item: CompactRowItem
  dot: FlowDot
  dotTitle: string
  /** 0-based position in the flow — what `moveInFlow` takes. */
  slot: number
  total: number
  disabled: boolean
  onMove: (delta: number) => void
  onMoveTo: (to: number) => void
  onRemove: () => void
}) {
  const t = useTranslations('builder')

  const isBlock = item.kind === 'block'
  const spec = isBlock ? BLOCKS[item.block.type] : null
  const label = isBlock
    ? item.block.title || t('compactNoTitle')
    : item.question.text || t('compactNoText')
  const kind = isBlock ? t(spec!.labelKey as 'blkInfo') : t(TYPE_OPTION_KEY[item.question.type])

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-[11px] rounded-xl border border-line px-[14px] py-[10px]"
      style={{ background: isBlock ? 'var(--sbg)' : 'var(--sf)' }}
    >
      {isBlock ? (
        <span
          aria-label={t('blkPaneTitle')}
          title={kind}
          className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-sf text-mut"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={spec!.icon} />
          </svg>
        </span>
      ) : (
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-sf2 text-[11.5px] font-bold">
          {item.num}
        </span>
      )}

      {/* The dot is `transparent` on a block rather than absent, so the columns
          line up down the list. It carries its own title either way — a bare
          coloured circle with no accessible name is decoration. */}
      <span
        title={dotTitle}
        aria-label={dotTitle}
        role="img"
        className="block h-[9px] w-[9px] flex-none rounded-full"
        style={{ background: DOT_TINT[dot] }}
      />

      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold">
        {label}
      </span>

      <span className="flex-none whitespace-nowrap rounded-full bg-sf2 px-[10px] py-1 text-[11px] font-semibold">
        {kind}
      </span>

      {total > 1 ? (
        <select
          value=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === '') return
            onMoveTo(Number(e.target.value))
          }}
          aria-label={t('moveToLabel')}
          className="touch-44-field flex-none rounded-[9px] border border-line bg-sf px-[9px] py-[6px] text-[12px] text-ink outline-none disabled:opacity-60"
        >
          <option value="">{t('moveToPlaceholder')}</option>
          {moveTargets(total, slot).map((i) => (
            <option key={i} value={i}>
              {t('moveToPlace', { n: i + 1 })}
            </option>
          ))}
        </select>
      ) : null}

      <span className="flex flex-none gap-1">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={disabled || slot === 0}
          aria-label={t('moveUp')}
          className="touch-44 h-7 w-7 cursor-pointer rounded-lg border border-line bg-sf text-[11px] text-mut disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={disabled || slot === total - 1}
          aria-label={t('moveDown')}
          className="touch-44 h-7 w-7 cursor-pointer rounded-lg border border-line bg-sf text-[11px] text-mut disabled:opacity-40"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={isBlock ? t('blkRemove') : t('deleteQuestion')}
          className="touch-44 h-7 w-7 cursor-pointer rounded-lg border border-line bg-sf text-sm leading-none text-mut disabled:opacity-40"
        >
          ×
        </button>
      </span>
    </div>
  )
}
