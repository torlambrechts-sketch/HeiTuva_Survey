'use client'

import { useTranslations } from 'next-intl'
import {
  CUSTOM_UNITS,
  CUSTOM_WEEKDAYS,
  customCadenceDays,
  type CustomUnit,
} from '@/lib/send/registry'

/**
 * «Hver [n] [dag(er)] [ukedag] [kl.]» — HeiTuva.dc.html:2183-2195, new in v1.
 *
 * The four settings a custom cadence needs. Three of them are new columns on
 * `schedules` (`custom_every`, `custom_unit`, `custom_weekday`) and the fourth
 * is `send_at_local`, which has existed since M:0004 and until V1-3 was read by
 * nothing at all.
 *
 * The RANGES here are the CHECK's, not a second opinion: 1–52, three units,
 * Monday–Friday (`schedules_custom_shape`, M:0044). The constraint refuses a
 * half-configured cadence outright — all three settings or none — so this
 * component never emits a partial one, and the database says so if anything
 * else tries.
 *
 * The weekday selector stops at Friday because the bundle's does (:2192). A
 * survey that lands on a Saturday is a survey nobody answers until Monday, and
 * a 90-second pulse whose reminder window opens over the weekend has spent the
 * window before anyone reads it.
 */
export type CustomCadenceValue = {
  every: number
  unit: CustomUnit
  weekday: number
  hour: string
}

const FIELD =
  'touch-44-field rounded-[10px] border border-line bg-sf px-[10px] py-[9px] text-[13px] text-ink outline-none'

const WEEKDAY_KEY = ['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri'] as const
const UNIT_KEY: Record<CustomUnit, string> = {
  days: 'customUnitDays',
  weeks: 'customUnitWeeks',
  months: 'customUnitMonths',
}
const UNIT_NOUN: Record<CustomUnit, string> = {
  days: 'unitDay',
  weeks: 'unitWeek',
  months: 'unitMonth',
}

export function CustomCadence({
  value,
  disabled,
  onChange,
}: {
  value: CustomCadenceValue
  disabled: boolean
  onChange: (next: CustomCadenceValue) => void
}) {
  const t = useTranslations('send')

  const unitNoun = t(UNIT_NOUN[value.unit] as 'unitDay')
  const interval =
    value.every === 1
      ? t('everyOne', { unit: unitNoun })
      : t('everyN', { n: value.every, unit: unitNoun })

  // The weekday is only meaningful for weeks and months — «hver 3. dag, onsdag»
  // is a contradiction, and the bundle drops it for `days` too (:4336).
  const weekday =
    value.unit === 'days'
      ? ''
      : t('customLineWeekday', { day: t(WEEKDAY_KEY[value.weekday - 1] ?? 'weekdayMon') })

  return (
    <div className="mb-[13px] flex flex-wrap items-center gap-[10px] border-b border-line pb-[13px]">
      <span className="text-[13.5px] font-semibold">{t('customEvery')}</span>
      <input
        type="number"
        min={1}
        max={52}
        value={value.every}
        disabled={disabled}
        aria-label={t('customEvery')}
        onChange={(e) =>
          // Clamped to the CHECK's range here as well as there, so the field
          // cannot put the form into a state the database will refuse. A blank
          // input reads as NaN, which becomes 1 rather than an empty schedule.
          onChange({ ...value, every: Math.min(52, Math.max(1, Number(e.target.value) || 1)) })
        }
        className={`${FIELD} w-16`}
      />
      <select
        value={value.unit}
        disabled={disabled}
        aria-label={t('customUnit')}
        onChange={(e) => onChange({ ...value, unit: e.target.value as CustomUnit })}
        className={FIELD}
      >
        {CUSTOM_UNITS.map((u) => (
          <option key={u} value={u}>
            {t(UNIT_KEY[u] as 'customUnitDays')}
          </option>
        ))}
      </select>
      <select
        value={value.weekday}
        disabled={disabled || value.unit === 'days'}
        aria-label={t('customWeekday')}
        onChange={(e) => onChange({ ...value, weekday: Number(e.target.value) })}
        className={FIELD}
      >
        {CUSTOM_WEEKDAYS.map((d) => (
          <option key={d} value={d}>
            {t(WEEKDAY_KEY[d - 1] ?? 'weekdayMon')}
          </option>
        ))}
      </select>
      <input
        type="time"
        value={value.hour}
        disabled={disabled}
        aria-label={t('customHour')}
        onChange={(e) => onChange({ ...value, hour: e.target.value })}
        className={FIELD}
      />
      <span className="basis-full text-[12.5px] text-mut">
        {t('customLine', { interval, weekday, hour: value.hour })}
      </span>
    </div>
  )
}

/** Chip spacing for the plan preview — the registry's, not a second formula. */
export const customDays = (v: CustomCadenceValue) => customCadenceDays(v.every, v.unit)

/**
 * «hver uke» / «hver 3. uke» — the interval as a phrase.
 *
 * The cadence summary («Går automatisk … i 4 runder») needs the INTERVAL, not
 * the chip's label: «Går automatisk tilpasset i 4 runder» says nothing about
 * how often anything happens, and the bundle's own summary uses the interval
 * (`cadOf(rec).label`, :3265). Exported so the summary and the editor's own
 * line below it cannot describe the same settings differently.
 */
export function customIntervalPhrase(
  v: CustomCadenceValue,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const unit = t(UNIT_NOUN[v.unit])
  return v.every === 1 ? t('everyOne', { unit }) : t('everyN', { n: v.every, unit })
}
