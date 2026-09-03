'use client'

import { useTranslations } from 'next-intl'
import {
  ADD_PANEL_TINTS,
  QUESTION_TYPES,
  TYPE_GROUP_ORDER,
  specOf,
  type QuestionType,
} from '@/lib/questions/registry'
import type { QualityFlag } from '@/lib/questions/quality'
import {
  COMMENT_MODES,
  COMMENT_MODE_KEY,
  FIELD_INPUT_TYPES,
  FIELD_TYPE_KEY,
  GROUP_KEY,
  TYPE_OPTION_KEY,
  type DraftQuestion,
  type FieldInputType,
  type QuestionConfig,
} from './types'

const field =
  'w-full rounded-lg border border-line bg-sf px-[9px] py-[6px] text-[12.5px] text-ink outline-none'
const iconButton =
  'touch-44 h-8 w-[30px] cursor-pointer rounded-[9px] border border-line bg-transparent text-xs text-mut disabled:opacity-40'

/**
 * One question card (HeiTuva.dc.html:340-482).
 *
 * There is no per-type branch in this markup. Every editor renders because
 * `specOf(type)` says so, which is what CLAUDE.md's data-not-code rule asks
 * for: a fourteenth type is a row in the registry, not a new conditional here.
 */
export function QuestionCard({
  question,
  index,
  total,
  advanced,
  flags,
  anonymityBreach,
  disabled,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onSaveToBank,
  savedToBank,
}: {
  question: DraftQuestion
  index: number
  total: number
  advanced: boolean
  flags: QualityFlag[]
  anonymityBreach: boolean
  disabled: boolean
  onChange: (patch: Partial<DraftQuestion>) => void
  onMove: (delta: number) => void
  onDuplicate: () => void
  onRemove: () => void
  onSaveToBank: () => void
  savedToBank: boolean
}) {
  const t = useTranslations('builder')
  const spec = specOf(question.type)
  const config = question.config

  const patchConfig = (patch: Partial<QuestionConfig>) =>
    onChange({ config: { ...config, ...patch } })

  const list = (key: 'options' | 'statements'): string[] =>
    (key === 'options' ? config.options : config.statements) ?? []

  const setListItem = (key: 'options' | 'statements', i: number, value: string) => {
    const next = [...list(key)]
    next[i] = value
    patchConfig({ [key]: next })
  }
  const addListItem = (key: 'options' | 'statements', value: string) =>
    patchConfig({ [key]: [...list(key), value] })
  const removeListItem = (key: 'options' | 'statements', i: number) =>
    patchConfig({ [key]: list(key).filter((_, j) => j !== i) })

  return (
    <div className="rounded-2xl border border-line bg-sf px-[18px] py-4 shadow-card">
      {/* Header row: number, text, type, reorder, duplicate, bank, delete. */}
      <div className="flex flex-wrap items-center gap-[14px] md:gap-[10px]">
        <span
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg text-xs font-bold"
          style={{ background: 'var(--sf2)' }}
        >
          {index + 1}
        </span>
        <input
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          disabled={disabled}
          aria-label={t('questionText', { n: index + 1 })}
          className="touch-44-field min-w-0 flex-1 rounded-[10px] border border-line bg-bg px-[11px] py-[9px] text-sm font-medium text-ink outline-none disabled:opacity-60"
        />
        <select
          value={question.type}
          onChange={(e) => {
            const next = e.target.value as QuestionType
            // Switching type replaces the config with the new type's defaults.
            // Carrying the old one over leaves, say, a matrix's statements on a
            // yes/no question — invisible in the editor, and still in the row.
            onChange({ type: next, config: { ...specOf(next).defaultConfig } })
          }}
          disabled={disabled}
          aria-label={t('typeLabel')}
          className="touch-44-field rounded-[10px] border border-line bg-bg px-[11px] py-[9px] text-[13px] text-ink outline-none disabled:opacity-60"
        >
          {TYPE_GROUP_ORDER.map((group) => (
            <optgroup key={group} label={t(GROUP_KEY[group])}>
              {(Object.keys(QUESTION_TYPES) as QuestionType[])
                .filter((type) => specOf(type).group === group)
                .map((type) => (
                  <option key={type} value={type}>
                    {t(TYPE_OPTION_KEY[type])}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <span className="flex flex-wrap gap-[14px] md:gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            aria-label={t('moveUp')}
            title={t('moveUp')}
            className={iconButton}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={disabled || index === total - 1}
            aria-label={t('moveDown')}
            title={t('moveDown')}
            className={iconButton}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={disabled}
            aria-label={t('duplicate')}
            title={t('duplicate')}
            className={iconButton}
          >
            ⧉
          </button>
          <button
            type="button"
            onClick={onSaveToBank}
            disabled={disabled}
            className="touch-44 h-8 cursor-pointer whitespace-nowrap rounded-[9px] border border-line bg-transparent px-[10px] text-[11.5px] font-semibold text-mut disabled:opacity-40"
          >
            {savedToBank ? t('savedToBank') : t('saveToBank')}
          </button>
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t('deleteQuestion')}
          className="touch-44 h-8 w-8 cursor-pointer rounded-[10px] border border-line bg-transparent text-[15px] leading-none text-mut disabled:opacity-40"
        >
          ×
        </button>
      </div>

      {/* Numeric scale: points plus the two end labels. */}
      {spec.numericScale ? (
        <div
          className="mt-[10px] flex flex-wrap items-center gap-[10px] rounded-[10px] px-3 py-[10px]"
          style={{ background: 'var(--sf2)' }}
        >
          <span className="inline-flex items-center gap-[7px] text-[12.5px] text-mut">
            {t('steps')}
            <select
              value={String(config.points ?? 5)}
              onChange={(e) => patchConfig({ points: Number(e.target.value) })}
              disabled={disabled}
              aria-label={t('steps')}
              className="touch-44-field rounded-lg border border-line bg-sf px-[9px] py-[6px] text-[12.5px] text-ink outline-none disabled:opacity-60"
            >
              {[3, 4, 5, 6, 7, 10].map((p) => (
                <option key={p} value={p}>
                  1–{p}
                </option>
              ))}
            </select>
          </span>
          <input
            value={config.low_label ?? ''}
            onChange={(e) => patchConfig({ low_label: e.target.value })}
            disabled={disabled}
            placeholder={t('lowPlaceholder')}
            aria-label={t('lowPlaceholder')}
            className={`touch-44-field min-w-[140px] flex-1 ${field} disabled:opacity-60`}
          />
          <span className="text-xs text-mut">→</span>
          <input
            value={config.high_label ?? ''}
            onChange={(e) => patchConfig({ high_label: e.target.value })}
            disabled={disabled}
            placeholder={t('highPlaceholder')}
            aria-label={t('highPlaceholder')}
            className={`touch-44-field min-w-[140px] flex-1 ${field} disabled:opacity-60`}
          />
        </div>
      ) : null}

      {/* Word scale: five editable labels. */}
      {spec.wordScale ? (
        <div
          className="mt-[10px] grid grid-cols-2 gap-[6px] rounded-[10px] px-3 py-[10px] md:grid-cols-5"
          style={{ background: 'var(--sf2)' }}
        >
          {(config.labels ?? []).map((label, i) => (
            <input
              key={i}
              value={label}
              onChange={(e) => {
                const next = [...(config.labels ?? [])]
                next[i] = e.target.value
                patchConfig({ labels: next })
              }}
              disabled={disabled}
              aria-label={`${t('steps')} ${i + 1}`}
              className={`touch-44-field min-w-0 text-center ${field} disabled:opacity-60`}
            />
          ))}
        </div>
      ) : null}

      {flags.length ? (
        <div className="mt-[9px] flex flex-wrap gap-[6px]">
          {flags.map((f) => (
            <span key={f.key} className="rounded-full bg-ac3 px-[10px] py-[5px] text-xs">
              {f.message}
            </span>
          ))}
        </div>
      ) : null}

      {anonymityBreach ? (
        <p role="alert" className="mt-[9px] rounded-[10px] bg-ac3 px-3 py-2 text-[12.5px]">
          {t('anonBreach')}
        </p>
      ) : null}

      {/* Advanced options. Below md this is a disclosure, closed by default
          (RESPONSIVE.md, three-pane Builder); at md and up the mode chip
          decides, exactly as the design does. */}
      {advanced ? (
        <details className="mt-[11px] md:open" open>
          <summary className="touch-44 cursor-pointer list-none text-[12.5px] font-semibold text-mut md:hidden">
            {t('moreOptions')}
          </summary>
          <div
            className="mt-2 flex flex-col gap-[10px] rounded-xl px-[14px] py-3 md:mt-0"
            style={{ background: 'var(--sf2)' }}
          >
            <input
              value={question.help}
              onChange={(e) => onChange({ help: e.target.value })}
              disabled={disabled}
              placeholder={t('helpPlaceholder')}
              aria-label={t('helpPlaceholder')}
              className="touch-44-field w-full rounded-[9px] border border-line bg-sf px-[11px] py-2 text-[12.5px] text-ink outline-none disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center gap-[14px] md:gap-[10px]">
              <span className="flex items-center gap-[9px] text-[13px] text-mut">
                <button
                  type="button"
                  role="switch"
                  aria-checked={question.required}
                  aria-label={t('requiredAria')}
                  disabled={disabled}
                  onClick={() => onChange({ required: !question.required })}
                  className="touch-44 flex h-[22px] w-[38px] cursor-pointer rounded-full border-none p-[3px] disabled:opacity-60"
                  style={{
                    background: question.required ? 'var(--ac)' : 'var(--line)',
                    justifyContent: question.required ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span className="block h-4 w-4 rounded-full bg-white" />
                </button>
                {question.required ? t('required') : t('optional')}
              </span>

              {spec.numeric ? (
                <button
                  type="button"
                  aria-pressed={question.followUpOnLow}
                  disabled={disabled}
                  onClick={() => onChange({ followUpOnLow: !question.followUpOnLow })}
                  className="touch-44 cursor-pointer rounded-full border border-line px-[13px] py-[7px] text-[12.5px] disabled:opacity-60"
                  style={{ background: question.followUpOnLow ? 'var(--ac)' : 'transparent' }}
                >
                  {question.followUpOnLow ? t('followUpOn') : t('followUpOff')}
                </button>
              ) : null}

              <span className="inline-flex items-center gap-[7px] text-[13px] text-mut">
                {t('comment')}
                <select
                  value={question.commentMode}
                  onChange={(e) =>
                    onChange({ commentMode: e.target.value as DraftQuestion['commentMode'] })
                  }
                  disabled={disabled}
                  aria-label={t('comment')}
                  className="touch-44-field rounded-[9px] border border-line bg-sf px-[10px] py-[7px] text-[12.5px] text-ink outline-none disabled:opacity-60"
                >
                  {COMMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(COMMENT_MODE_KEY[m])}
                    </option>
                  ))}
                </select>
              </span>

              {spec.choiceOptions ? (
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={Boolean(config.multi)}
                    disabled={disabled}
                    onClick={() => patchConfig({ multi: !config.multi })}
                    className="touch-44 cursor-pointer rounded-full border border-line px-[13px] py-[7px] text-[12.5px] disabled:opacity-60"
                    style={{ background: config.multi ? 'var(--ac)' : 'transparent' }}
                  >
                    {config.multi ? t('multiOn') : t('multiOff')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={Boolean(config.randomize)}
                    disabled={disabled}
                    onClick={() => patchConfig({ randomize: !config.randomize })}
                    className="touch-44 cursor-pointer rounded-full border border-line px-[13px] py-[7px] text-[12.5px] disabled:opacity-60"
                    style={{ background: config.randomize ? 'var(--ac)' : 'transparent' }}
                  >
                    {config.randomize ? t('randomOn') : t('randomOff')}
                  </button>
                </span>
              ) : null}

              {spec.endLabels ? (
                <span className="flex min-w-[240px] flex-1 items-center gap-2">
                  <input
                    value={config.low_label ?? ''}
                    onChange={(e) => patchConfig({ low_label: e.target.value })}
                    disabled={disabled}
                    aria-label={t('lowPlaceholder')}
                    className={`touch-44-field flex-1 ${field} disabled:opacity-60`}
                  />
                  <span className="text-[13px] text-mut">→</span>
                  <input
                    value={config.high_label ?? ''}
                    onChange={(e) => patchConfig({ high_label: e.target.value })}
                    disabled={disabled}
                    aria-label={t('highPlaceholder')}
                    className={`touch-44-field flex-1 ${field} disabled:opacity-60`}
                  />
                </span>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}

      {/* Statement and option lists. One block, two labels — the markup is
          identical in the design, only the bullet shape differs. Image options
          are NOT here: they are a grid of upload cards, below. */}
      {spec.statements || spec.optionList ? (
        <div className="mt-[11px] flex flex-col gap-[7px] md:pl-9">
          {spec.statements ? (
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('statements')}</div>
          ) : null}
          {list(spec.statements ? 'statements' : 'options').map((value, i) => (
            <div key={i} className="flex items-center gap-[18px] md:gap-[9px]">
              <span
                className="h-[11px] w-[11px] flex-none border-[1.5px] border-mut"
                style={{ borderRadius: spec.statements ? '3px' : '999px' }}
              />
              <input
                value={value}
                onChange={(e) =>
                  setListItem(spec.statements ? 'statements' : 'options', i, e.target.value)
                }
                disabled={disabled}
                aria-label={
                  spec.statements
                    ? t('statementLabel', { n: i + 1 })
                    : t('optionLabel', { n: i + 1 })
                }
                className="touch-44-field min-w-0 flex-1 rounded-lg border border-line bg-bg px-[10px] py-[7px] text-[13px] text-ink outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => removeListItem(spec.statements ? 'statements' : 'options', i)}
                disabled={disabled}
                aria-label={spec.statements ? t('removeStatement') : t('removeOption')}
                className="touch-44 cursor-pointer border-none bg-transparent text-sm text-mut disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              addListItem(
                spec.statements ? 'statements' : 'options',
                spec.statements
                  ? t('statementLabel', { n: list('statements').length + 1 })
                  : t('optionLabel', { n: list('options').length + 1 }),
              )
            }
            disabled={disabled}
            className="touch-44 cursor-pointer self-start rounded-full border border-dashed border-line bg-transparent px-3 py-[6px] text-[12.5px] text-mut disabled:opacity-40"
          >
            {spec.statements ? t('addStatement') : t('addOption')}
          </button>
        </div>
      ) : null}

      {/* Image options: the design's 3-column grid of upload cards
          (HeiTuva.dc.html:437-452), not a text list. The upload target itself
          is Storage, which Phase 6 wires; until then the card shows the slot
          and its label, so the shape a respondent will see is visible here. */}
      {spec.imageOptions ? (
        <div className="mt-[11px] flex flex-col gap-[10px] md:pl-9">
          <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 md:grid-cols-3">
            {(config.options ?? []).map((label, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-line bg-sf">
                <div
                  className="flex h-[92px] items-center justify-center bg-bg text-[12px] text-mut"
                  role="img"
                  aria-label={t('imageAlt', { label: label || String(i + 1) })}
                >
                  {t('imageUpload')}
                </div>
                <div className="flex items-center gap-[6px] px-[10px] py-2">
                  <input
                    value={label}
                    onChange={(e) => setListItem('options', i, e.target.value)}
                    disabled={disabled}
                    aria-label={t('optionLabel', { n: i + 1 })}
                    className="touch-44-field min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-[6px] text-[12.5px] text-ink outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => removeListItem('options', i)}
                    disabled={disabled}
                    aria-label={t('imageRemove')}
                    className="touch-44 cursor-pointer border-none bg-transparent text-[15px] leading-none text-mut disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addListItem('options', t('optionLabel', { n: (config.options ?? []).length + 1 }))}
            disabled={disabled}
            className="touch-44 cursor-pointer self-start rounded-[9px] border border-line bg-transparent px-[14px] py-2 text-[12.5px] font-semibold text-ink disabled:opacity-40"
          >
            {t('addImage')}
          </button>
        </div>
      ) : null}

      {/* Form fields: a label and an input type per row. The registry has
          declared `formFields: true` for this type since the Builder landed,
          but nothing rendered it, so `config.fields` was uneditable — the
          survey could collect name and email and the author could not see or
          change which. That matters here more than elsewhere: this is the type
          that trips the anonymity warning. */}
      {spec.formFields ? (
        <div className="mt-[11px] flex flex-col gap-[7px] md:pl-9">
          {(config.fields ?? []).map(([label, inputType], i) => (
            <div key={i} className="flex flex-wrap items-center gap-[18px] md:gap-[9px]">
              <span className="h-[11px] w-[11px] flex-none rounded-[3px] border-[1.5px] border-mut" />
              <input
                value={label}
                onChange={(e) => {
                  const next = (config.fields ?? []).map((f, j) =>
                    j === i ? ([e.target.value, f[1]] as [string, string]) : f,
                  )
                  patchConfig({ fields: next })
                }}
                disabled={disabled}
                aria-label={t('fieldLabel', { n: i + 1 })}
                className="touch-44-field min-w-0 flex-1 rounded-lg border border-line bg-bg px-[10px] py-[7px] text-[13px] text-ink outline-none disabled:opacity-60"
              />
              <select
                value={inputType}
                onChange={(e) => {
                  const next = (config.fields ?? []).map((f, j) =>
                    j === i ? ([f[0], e.target.value] as [string, string]) : f,
                  )
                  patchConfig({ fields: next })
                }}
                disabled={disabled}
                aria-label={t('fieldType', { n: i + 1 })}
                className="touch-44-field rounded-lg border border-line bg-bg px-[10px] py-[7px] text-[13px] text-ink outline-none disabled:opacity-60"
              >
                {FIELD_INPUT_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {t(FIELD_TYPE_KEY[ft as FieldInputType])}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  patchConfig({ fields: (config.fields ?? []).filter((_, j) => j !== i) })
                }
                disabled={disabled}
                aria-label={t('removeField')}
                className="touch-44 cursor-pointer border-none bg-transparent text-sm text-mut disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              patchConfig({
                fields: [
                  ...(config.fields ?? []),
                  [t('fieldLabel', { n: (config.fields ?? []).length + 1 }), 'text'],
                ],
              })
            }
            disabled={disabled}
            className="touch-44 cursor-pointer self-start rounded-full border border-dashed border-line bg-transparent px-3 py-[6px] text-[12.5px] text-mut disabled:opacity-40"
          >
            {t('addField')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Tint for a type's swatch in the Add panel, cycled within its group. */
export function tintFor(indexInGroup: number): string {
  return ADD_PANEL_TINTS[indexInGroup % ADD_PANEL_TINTS.length] as string
}
