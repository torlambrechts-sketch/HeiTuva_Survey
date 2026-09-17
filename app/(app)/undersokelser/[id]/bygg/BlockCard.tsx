'use client'

import { useTranslations } from 'next-intl'
import { BLOCKS, type BlockDraft } from '@/lib/surveys/blocks'

/**
 * V7-3 — one content block in the builder's flow (v7:720-757).
 *
 * The drawing's row: a grab handle, a 26px icon chip, a kind pill, the slot
 * («Plass 3 av 9»), four actions, and then whichever of the five fields the
 * type uses. `BLOCKS[type].fields` decides which — the same matrix the save
 * path clears against and the database's three CHECKs refuse from the other
 * side, so there is one answer to «does a fact box have a url» and three places
 * agree about it.
 *
 * ── THE DRAG HANDLE IS A HANDLE, NOT A DRAG ───────────────────────────────
 *
 * v7 makes every row `draggable` with `onDragStart/Over/Drop` and an end drop
 * zone (`v7:760`, `paletteDrag`/`insertFlowAt`). **The arrows ship and the drag
 * does not**, and that is a decision rather than an omission: a drag with no
 * keyboard equivalent is a control half this product's users cannot reach, and
 * `docs/RESPONSIVE.md` has no pattern for one. The drawing's own row carries
 * «Flytt opp»/«Flytt ned» beside the handle, so the reachable half is what it
 * draws too — and the handle's cursor is kept because the row looks wrong
 * without it. Logged as a deviation rather than left to be read as unfinished.
 */
export function BlockCard({
  block,
  slot,
  total,
  disabled,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: BlockDraft
  /** 1-based, for «Plass {n} av {total}». */
  slot: number
  total: number
  disabled: boolean
  onPatch: (patch: Partial<BlockDraft>) => void
  onMove: (delta: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const t = useTranslations('builder')
  const spec = BLOCKS[block.type]
  const f = spec.fields

  const input =
    'box-sizing-border w-full rounded-[10px] border border-line bg-bg px-3 py-[9px] text-[13px] text-ink outline-none disabled:opacity-60'
  const iconBtn =
    'touch-44 flex h-8 w-[30px] cursor-pointer items-center justify-center rounded-[9px] border border-line bg-transparent text-[13px] text-ink disabled:opacity-50'

  return (
    <div
      className="rounded-2xl border border-line p-[16px_18px]"
      style={{ background: spec.tint === 'sbg' ? 'var(--sbg)' : 'var(--sf)' }}
    >
      <div className="flex flex-wrap items-center gap-[10px]">
        {/* v7:723 — the handle. Present because the row is drawn with one; it
            moves nothing on its own, and the arrows beside it do. */}
        <span aria-hidden className="flex-none cursor-grab text-[14px] leading-none text-mut">
          ⋮⋮
        </span>
        <span
          aria-hidden
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-sf"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={spec.icon} />
          </svg>
        </span>
        <span className="whitespace-nowrap rounded-full bg-sf px-[10px] py-1 text-[11px] font-bold">
          {t(spec.labelKey as 'blkInfo')}
        </span>
        <span className="whitespace-nowrap text-[11.5px] text-mut">
          {t('blkPos', { n: slot, total })}
        </span>
        <span className="flex-1" />
        <span className="touch-cluster flex gap-1">
          <button
            type="button"
            aria-label={t('blkUp')}
            disabled={disabled || slot === 1}
            onClick={() => onMove(-1)}
            className={iconBtn}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={t('blkDown')}
            disabled={disabled || slot === total}
            onClick={() => onMove(1)}
            className={iconBtn}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={t('blkDuplicate')}
            disabled={disabled}
            onClick={onDuplicate}
            className={iconBtn}
          >
            ⧉
          </button>
          <button
            type="button"
            aria-label={t('blkRemove')}
            disabled={disabled}
            onClick={onRemove}
            className={iconBtn}
          >
            ✕
          </button>
        </span>
      </div>

      {f.title ? (
        <input
          value={block.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder={t('blkTitlePlaceholder')}
          aria-label={t('blkTitleLabel')}
          maxLength={200}
          disabled={disabled}
          className={`${input} mt-[11px]`}
        />
      ) : null}

      {f.body ? (
        <textarea
          value={block.body}
          onChange={(e) => onPatch({ body: e.target.value })}
          rows={3}
          placeholder={t('blkBodyPlaceholder')}
          aria-label={t('blkBodyLabel')}
          maxLength={4000}
          disabled={disabled}
          className={`${input} mt-[9px] resize-y leading-[1.5]`}
        />
      ) : null}

      {f.media ? (
        /* v7:745-747 draws an `<image-slot>` drop target. THE UPLOAD IS V7-3c's
           and lands on an opaque key; until a key exists the slot says so
           rather than showing a tinted rectangle that looks like a picture
           nobody chose — the never-fabricate rule applied to a placeholder. */
        <div className="mt-[9px] flex h-[150px] items-center justify-center overflow-hidden rounded-[11px] border border-line bg-sf">
          <span className="px-4 text-center text-[12.5px] text-mut">{t('blkMediaEmpty')}</span>
        </div>
      ) : null}

      {f.url ? (
        <input
          value={block.url}
          onChange={(e) => onPatch({ url: e.target.value })}
          placeholder={t('blkUrlPlaceholder')}
          aria-label={t('blkUrlLabel')}
          maxLength={2000}
          disabled={disabled}
          className={`${input} mt-[8px]`}
        />
      ) : null}

      {f.caption ? (
        <input
          value={block.caption}
          onChange={(e) => onPatch({ caption: e.target.value })}
          placeholder={t('blkCaptionPlaceholder')}
          aria-label={t('blkCaptionLabel')}
          maxLength={300}
          disabled={disabled}
          className={`${input} mt-[8px]`}
        />
      ) : null}

      {/* v7:755 — the divider shows the line it will draw. */}
      {block.type === 'rule' ? <div className="mt-3 h-px bg-line" /> : null}
    </div>
  )
}
