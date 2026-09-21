'use client'

import { useTranslations } from 'next-intl'
import { BLOCKS, BLOCK_TYPES, type BlockType } from '@/lib/surveys/blocks'

/**
 * V7-3 — «Legg til innhold» (v7:800-819).
 *
 * Six buttons, each a 30px icon chip with a label and a description, plus the
 * note about what a block is and an empty state.
 *
 * ── WHERE IT SITS, AND WHY NOT WHERE v7 PUTS IT ───────────────────────────
 *
 * v7 draws this in the builder's RIGHT STICKY COLUMN, shown when
 * `buildTab === "content"` — a fifth builder tab reached through a two-level
 * rail whose outer level is the shell subnav and whose inner level is
 * «Spørsmål · Innhold» (`v7:10195`). That restructure is a different piece of
 * work: it relabels every one of the builder's tabs and splits the rail in two,
 * and it is on V7-4's list.
 *
 * So the palette goes beside the question palette, in the pane the editor is
 * already in when they are adding things. **One control, in the place the other
 * half of the same job lives** — rather than a fifth tab invented here to hold
 * it, which would be a sub-tab nobody drew in that position. Logged as a
 * deviation with the restructure named, so the next phase moves it rather than
 * discovering it.
 *
 * ── THE NOTE IS A CLAIM AND IT IS TRUE ────────────────────────────────────
 *
 * «Innholdsblokker teller ikke som spørsmål og gir ingen data» (`v7:10238`).
 * Under one table that would have been a promise held up by eleven filters;
 * under two it is held up by `answers.question_id`, which has no target in
 * `survey_blocks`. The claim ships because the schema makes it true, which is
 * the order this project does these in.
 */
export function BlockPalette({
  count,
  disabled,
  onAdd,
  onDragType,
}: {
  /** How many blocks the flow already has, for the empty state. */
  count: number
  disabled: boolean
  onAdd: (type: BlockType) => void
  /** T8 · v8:821 — dual mode. Absent leaves the palette click-only. */
  onDragType?: (type: BlockType, label: string) => void
}) {
  const t = useTranslations('builder')

  return (
    <div className="mt-[14px] rounded-2xl border border-line bg-sf p-5">
      <div className="text-[15.5px] font-bold">{t('blkPaneTitle')}</div>
      <p className="mt-[5px] text-[12.5px] leading-[1.5] text-mut">{t('blkPaneNote')}</p>
      <div className="mt-[14px] flex flex-col gap-2">
        {BLOCK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onAdd(type)}
            /* T8 · v8:821 — the same button appends on a click and inserts at
               a position on a drag; v8's title says both, verbatim. */
            draggable={!disabled && onDragType !== undefined}
            onDragStart={(e) => {
              try {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData('text/plain', `block:${type}`)
              } catch {
                /* see Builder.dragFor — the state is what the UI reads */
              }
              onDragType?.(type, t(BLOCKS[type].labelKey as 'blkInfo'))
            }}
            onDragEnd={() => onDragType?.(type, '')}
            title={t('paletteDragHintB')}
            className="touch-44 flex cursor-pointer items-start gap-[11px] rounded-xl border border-line bg-bg px-[13px] py-[11px] text-left text-ink disabled:opacity-50"
          >
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-sbg"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={BLOCKS[type].icon} />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold">
                {t(BLOCKS[type].labelKey as 'blkInfo')}
              </span>
              <span className="mt-[2px] block text-[11.5px] leading-[1.4] text-mut">
                {t(BLOCKS[type].descKey as 'blkInfoDesc')}
              </span>
            </span>
          </button>
        ))}
      </div>
      {count === 0 ? (
        <p className="mt-[14px] rounded-xl bg-sbg px-[15px] py-[13px] text-[12.5px] leading-[1.5]">
          {t('blkPaneEmpty')}
        </p>
      ) : null}
    </div>
  )
}
