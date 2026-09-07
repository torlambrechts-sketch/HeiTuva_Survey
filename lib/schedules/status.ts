import type { Cadence, CustomUnit } from '@/lib/send/registry'

/**
 * «↻ Runde 3 av 12 · neste 14. mars» — the recurrence status sentence.
 *
 * The bundle computes it in one place (`recurLine`, :3269-3272) and reads it in
 * four: the Send screen's status row (:2175), the survey row's chip (:873), the
 * context bar's chip (:228) and the rounds panel's heading (:2596). This module
 * is that one place. Four components each assembling "Runde N av M" from the
 * same three columns is how they come to disagree about what a paused series
 * says — and the pause state is exactly the one a reader checks the chip for.
 *
 * Pure and synchronous, and it returns a KEY plus values rather than a string:
 * the sentence has four shapes and every one of them is `ui_messages` copy in
 * two languages. Assembling Norwegian here would put a fifth language surface
 * outside the translation editor.
 */
export type ScheduleState = {
  cadence: Cadence
  /** 0 means "until I stop it" — the design's «Til jeg stopper den». */
  runsTotal: number
  runsDone: number
  /** Non-null while the series is paused (DECISIONS Q22). */
  pausedAt: string | null
  /** False once someone has stopped it. */
  active: boolean
  nextRunAt: string | null
  customEvery: number | null
  customUnit: CustomUnit | null
}

export type ScheduleStatus =
  | { key: 'recurNone' }
  | { key: 'recurPlanned'; values: { cadence: string; runs: number } }
  | { key: 'recurPlannedOpen'; values: { cadence: string } }
  | { key: 'recurEnded'; values: { round: number } }
  | { key: 'recurPaused'; values: { round: number; total: string } }
  | { key: 'recurRunning'; values: { round: number; total: string; next: string } }
  | { key: 'recurRunningNoDate'; values: { round: number; total: string } }

/**
 * `runsTotal = 0` is «til du stopper den», and it is NOT the same as "no total
 * known" — the design says so out loud on the picker. So the total travels as a
 * pre-formatted string rather than a number: an empty one for the open-ended
 * case, « av 12» otherwise. A number with a magic 0 would leave every call site
 * to remember what 0 meant, which is where «Runde 3 av 0» comes from.
 */
export function scheduleStatus(
  schedule: ScheduleState | null,
  surveyStatus: 'utkast' | 'aktiv' | 'lukket',
  cadenceLabel: (c: Cadence) => string,
  formatDate: (iso: string) => string,
): ScheduleStatus {
  if (!schedule || schedule.cadence === 'once') return { key: 'recurNone' }

  const label = cadenceLabel(schedule.cadence)
  const round = Math.max(1, schedule.runsDone)
  const total = schedule.runsTotal > 0 ? ` av ${schedule.runsTotal}` : ''

  // A draft has not run yet, so it has a plan rather than a position in one.
  if (surveyStatus === 'utkast') {
    return schedule.runsTotal > 0
      ? { key: 'recurPlanned', values: { cadence: label, runs: schedule.runsTotal } }
      : { key: 'recurPlannedOpen', values: { cadence: label } }
  }

  // Stopped, or closed: the series has a last round rather than a next one.
  if (surveyStatus === 'lukket' || !schedule.active) {
    return { key: 'recurEnded', values: { round: schedule.runsDone } }
  }

  if (schedule.pausedAt) return { key: 'recurPaused', values: { round, total } }

  // `next_run_at` can be null on a live schedule — a series whose cadence is
  // `once` never had one, and one the scheduler has not touched yet may not
  // have one either. Saying «neste —» would be worse than not saying it.
  return schedule.nextRunAt
    ? {
        key: 'recurRunning',
        values: { round, total, next: formatDate(schedule.nextRunAt) },
      }
    : { key: 'recurRunningNoDate', values: { round, total } }
}

/** Whether the ↻ chip is drawn at all: `hasRecurStatus` (:4338). */
export const hasScheduleStatus = (s: ScheduleStatus) => s.key !== 'recurNone'
