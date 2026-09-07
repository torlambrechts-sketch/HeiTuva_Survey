import { describe, expect, it } from 'vitest'
import { hasScheduleStatus, scheduleStatus, type ScheduleState } from '@/lib/schedules/status'

/**
 * DECISIONS Q22 — what the ↻ chip says, in the one place that decides it.
 *
 * The bundle reads `recurLine` on four screens (:2175, :873, :228, :2596). The
 * risk this module exists to remove is those four disagreeing about a PAUSED
 * series, which is the state a reader checks the chip for in the first place.
 */
const base: ScheduleState = {
  cadence: 'weekly',
  runsTotal: 12,
  runsDone: 3,
  pausedAt: null,
  active: true,
  nextRunAt: '2026-03-14T08:00:00.000Z',
  customEvery: null,
  customUnit: null,
}
const label = (c: string) => `hver ${c}`
const date = () => '14. mars'
const status = (s: Partial<ScheduleState>, survey: 'utkast' | 'aktiv' | 'lukket' = 'aktiv') =>
  scheduleStatus({ ...base, ...s }, survey, label as never, date)

describe('(Q22) the recurrence status sentence', () => {
  it('a running series names the round and the next date', () => {
    expect(status({})).toEqual({
      key: 'recurRunning',
      values: { round: 3, total: ' av 12', next: '14. mars' },
    })
  })

  it('THE ONE THAT MATTERS: a paused series says paused, and gives no next date', () => {
    // A next date on a paused series is a promise the scheduler will not keep —
    // it skips the row entirely (M:0044), so the date is stale the moment the
    // pause begins.
    const s = status({ pausedAt: '2026-03-01T00:00:00.000Z' })
    expect(s.key).toBe('recurPaused')
    expect(JSON.stringify(s)).not.toContain('14. mars')
  })

  it('a stopped series has a last round, not a next one', () => {
    expect(status({ active: false })).toEqual({ key: 'recurEnded', values: { round: 3 } })
    expect(status({}, 'lukket').key).toBe('recurEnded')
  })

  it('a draft has a plan rather than a position in one', () => {
    expect(status({}, 'utkast')).toEqual({
      key: 'recurPlanned',
      values: { cadence: 'hver weekly', runs: 12 },
    })
  })

  it('runsTotal 0 is «til du stopper den», never «av 0»', () => {
    // The magic zero is resolved HERE, once. Leaving it as a number for four
    // call sites to interpret is where «Runde 3 av 0» comes from.
    expect(status({ runsTotal: 0 })).toEqual({
      key: 'recurRunning',
      values: { round: 3, total: '', next: '14. mars' },
    })
    expect(status({ runsTotal: 0 }, 'utkast').key).toBe('recurPlannedOpen')
    expect(JSON.stringify(status({ runsTotal: 0 }))).not.toContain('av 0')
  })

  it('a live schedule with no next run says so rather than «neste —»', () => {
    expect(status({ nextRunAt: null })).toEqual({
      key: 'recurRunningNoDate',
      values: { round: 3, total: ' av 12' },
    })
  })

  it('no schedule, and a one-off, draw no chip at all', () => {
    expect(hasScheduleStatus(scheduleStatus(null, 'aktiv', label as never, date))).toBe(false)
    expect(hasScheduleStatus(status({ cadence: 'once' }))).toBe(false)
    // POSITIVE CONTROL: everything else does draw one — without this the
    // assertion above passes on a function that always returns recurNone.
    expect(hasScheduleStatus(status({}))).toBe(true)
  })

  it('round is never 0 — a series that has not run yet is on round 1', () => {
    // `runs_done` starts at 1 when a schedule is created by `send_round`
    // (M:0027:209) but at 0 if a row is inserted directly, and «Runde 0» reads
    // as a bug to a customer rather than as "not started".
    expect(status({ runsDone: 0 })).toMatchObject({ values: { round: 1 } })
  })
})
