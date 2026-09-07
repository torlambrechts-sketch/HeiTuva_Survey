import 'server-only'

import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { CADENCE_KEY, type Cadence, type CustomUnit } from '@/lib/send/registry'
import { hasScheduleStatus, scheduleStatus } from './status'

/**
 * The ↻ chip's sentence for one survey, ready to render.
 *
 * Three pages draw the context bar — Bygg, Send and Resultater — and all three
 * want the same chip. This is the read and the formatting in one place, so the
 * chip cannot say one thing on Bygg and another on Resultater.
 *
 * Read through RLS as the viewer. Since M:0044's predicate swap a leser reads
 * `schedules` too (Q23), which is the point: a chip that rendered from a row a
 * leser reads as absent would be indistinguishable from a survey that does not
 * repeat, and «Pauset · runde 3 av 12» is exactly what a reader opens the
 * screen to check.
 *
 * Returns '' when there is no series, which is also the condition for not
 * drawing the chip — one value rather than a flag that could disagree with it.
 */
export async function readScheduleChip(
  surveyId: string,
  status: 'utkast' | 'aktiv' | 'lukket',
): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('schedules')
    .select('cadence, runs_total, runs_done, paused_at, active, next_run_at, custom_every, custom_unit')
    .eq('survey_id', surveyId)
    .maybeSingle()
  if (!data) return ''

  const t = await getTranslations('send')
  const state = scheduleStatus(
    {
      cadence: data.cadence as Cadence,
      runsTotal: data.runs_total,
      runsDone: data.runs_done,
      pausedAt: data.paused_at,
      active: data.active,
      nextRunAt: data.next_run_at,
      customEvery: data.custom_every,
      customUnit: data.custom_unit as CustomUnit | null,
    },
    status,
    (c) => t(CADENCE_KEY[c].label as 'cadOnce').toLowerCase(),
    (iso) => new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
  )
  return hasScheduleStatus(state)
    ? t(state.key, ('values' in state ? state.values : {}) as never)
    : ''
}
