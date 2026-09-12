import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TASK_STEPS, type TaskStatus } from '@/lib/tasks/lifecycle'
import {
  BUCKET_KEY,
  BUCKET_TINT,
  COLUMN_KEY,
  COLUMN_TINT,
  SCOPE_KEY,
  WORKLIST_BUCKETS,
  WORKLIST_COLUMNS,
  WORKLIST_SCOPES,
  WORKLIST_TYPES,
  bucketOf,
  columnOf,
  matchesScope,
  matchesType,
  progressPercent,
  type WorklistFacts,
} from '@/lib/worklist/rows'

/**
 * The unified row model, v5:3252-3372.
 *
 * The two places this deliberately diverges from the bundle are the two things
 * most worth a test, because both are «four names used for five states» and the
 * surplus state is the one that matters:
 *
 *   * `effektvurdert` must NOT land in the column «Lukket» — the bundle's
 *     `i === 3 ? 2 : 3` does exactly that, and Q69 exists to keep a task whose
 *     effect is assessed distinct from one that is closed.
 *   * a row with no deadline must not be filed under a temporal bucket.
 *
 * Both are asserted over the whole status enum rather than over the cases I
 * happened to think of, so a seventh lifecycle step fails a test in the commit
 * that adds it.
 */
const task = (o: Partial<WorklistFacts> = {}): WorklistFacts => ({
  kind: 'task',
  status: 'foreslatt',
  dueAt: null,
  hasLaw: false,
  mine: false,
  handled: false,
  ...o,
})

const comment = (o: Partial<WorklistFacts> = {}): WorklistFacts => ({
  kind: 'comment',
  status: null,
  dueAt: null,
  hasLaw: false,
  mine: false,
  handled: false,
  ...o,
})

const NOW = new Date('2026-09-12T10:00:00Z')

/**
 * Source with COMMENTS STRIPPED, and it is not a convenience.
 *
 * The first run of the two refusal tests below failed on my own explanatory
 * prose: the comment that says «Lukk valgte» is not built contains the string
 * «Lukk valgte», and the one that says the panel never becomes «Avsendere»
 * contains «Avsendere». A grep over a file that documents its own refusals will
 * always find the words it refuses.
 *
 * This is the third instance of one shape in one day (CLAUDE.md, «the thing
 * measured was not the thing claimed»): the production catch-all sweep matched
 * `when others` inside a comment explaining why that handler is narrow, and the
 * real gate strips `--` comments while the one-off did not. Same fix, same
 * reason — measure the CODE, not the file.
 */
const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('the buckets', () => {
  it('a late open task is «Over frist»', () => {
    expect(bucketOf(task({ status: 'pagar', dueAt: '2026-08-20' }), NOW)).toBe('over-frist')
  })

  it('a closed task is «Avsluttet» even when its deadline has passed', () => {
    // `isLate` already says a closed task is never late — the deadline stopped
    // mattering when the duty was discharged. The bucket must agree, or the
    // list colours a discharged duty red.
    expect(bucketOf(task({ status: 'lukket', dueAt: '2026-08-20' }), NOW)).toBe('avsluttet')
  })

  it('a deadline inside seven days is «Denne uken», and the eighth day is not', () => {
    expect(bucketOf(task({ dueAt: '2026-09-19' }), NOW)).toBe('denne-uken')
    expect(bucketOf(task({ dueAt: '2026-09-20' }), NOW)).toBe('senere')
  })

  it('NO ROW WITHOUT A DEADLINE IS FILED UNDER A TEMPORAL BUCKET', () => {
    // The divergence, stated as the property. The bundle puts an unhandled
    // comment in «Denne uken» and a dateless task in «Senere», and both are
    // claims about when something is due made over a row that carries no date.
    const temporal = ['over-frist', 'denne-uken', 'senere']
    for (const status of TASK_STEPS) {
      if (status === 'lukket') continue
      expect(temporal).not.toContain(bucketOf(task({ status, dueAt: null }), NOW))
      expect(bucketOf(task({ status, dueAt: null }), NOW)).toBe('uten-frist')
    }
    expect(bucketOf(comment(), NOW)).toBe('uten-frist')
    expect(temporal).not.toContain(bucketOf(comment(), NOW))
  })

  it('a handled comment is «Avsluttet»', () => {
    expect(bucketOf(comment({ handled: true }), NOW)).toBe('avsluttet')
  })

  it('every bucket has a message key and a tint', () => {
    for (const b of WORKLIST_BUCKETS) {
      expect(BUCKET_KEY[b]).toBeTruthy()
      expect(BUCKET_TINT[b]).toBeTruthy()
    }
  })
})

describe('the board columns', () => {
  it('EFFEKTVURDERT IS NOT FILED UNDER «AVSLUTTET»', () => {
    // The bundle's own mapping does this, and it is the defect the fifth column
    // exists to prevent: aml. § 3-1 and ldl. § 26 fjerde ledd are about the gap
    // between «we assessed the effect» and «we are done».
    expect(columnOf(task({ status: 'effektvurdert' }))).toBe('effektvurdert')
    expect(columnOf(task({ status: 'effektvurdert' }))).not.toBe('avsluttet')
    expect(columnOf(task({ status: 'lukket' }))).toBe('avsluttet')
  })

  it('every lifecycle status maps to a declared column', () => {
    for (const status of TASK_STEPS) {
      const col = columnOf(task({ status }))
      expect(WORKLIST_COLUMNS).toContain(col)
    }
  })

  it('an unknown status throws rather than being filed under «Nytt»', () => {
    // Loud rather than silently wrong, the same shape as
    // app.member_blocks_invitation's else branch. A seventh step added to the
    // enum and not taught to this function is a test failure, not a row in the
    // wrong column.
    expect(() => columnOf(task({ status: 'nyfarge' as TaskStatus }))).toThrow(/unknown task status/)
  })

  it('a comment sits in «Nytt» until it is handled', () => {
    expect(columnOf(comment())).toBe('nytt')
    expect(columnOf(comment({ handled: true }))).toBe('avsluttet')
  })

  it('every column has a message key and a tint', () => {
    for (const c of WORKLIST_COLUMNS) {
      expect(COLUMN_KEY[c]).toBeTruthy()
      expect(COLUMN_TINT[c]).toBeTruthy()
    }
  })
})

describe('the scopes', () => {
  it('«Mine», «Over frist» and «Lovpålagt» exclude every comment', () => {
    // Three of the five are properties only a task has, and the bundle agrees —
    // it sets mine:false, late:false and law:"" on every feedback row. A filter
    // that passed comments through would be a filter that does not filter.
    for (const scope of ['mine', 'frist', 'lov'] as const) {
      expect(matchesScope(comment({ handled: false }), scope)).toBe(false)
      expect(matchesScope(comment({ handled: true }), scope)).toBe(false)
    }
  })

  it('«Ubehandlet» means unhandled for a comment and not-closed for a task', () => {
    expect(matchesScope(comment({ handled: false }), 'nye')).toBe(true)
    expect(matchesScope(comment({ handled: true }), 'nye')).toBe(false)
    expect(matchesScope(task({ status: 'pagar' }), 'nye')).toBe(true)
    expect(matchesScope(task({ status: 'lukket' }), 'nye')).toBe(false)
  })

  it('«Alle» passes everything, and every scope has a message key', () => {
    expect(matchesScope(comment(), 'alle')).toBe(true)
    expect(matchesScope(task(), 'alle')).toBe(true)
    for (const s of WORKLIST_SCOPES) expect(SCOPE_KEY[s]).toBeTruthy()
  })

  it('the type rail splits the list and nothing else', () => {
    expect(matchesType(task(), 'oppgaver')).toBe(true)
    expect(matchesType(comment(), 'oppgaver')).toBe(false)
    expect(matchesType(comment(), 'tilbakemeldinger')).toBe(true)
    expect(matchesType(task(), 'tilbakemeldinger')).toBe(false)
    for (const v of WORKLIST_TYPES) expect(matchesType(task(), v) || v !== 'alle').toBe(true)
  })
})

describe('the progress bar', () => {
  it('a comment has NO bar — 20 % is an invented denominator', () => {
    // v5:3256 renders `handled ? 100 : 20` on a comment row. A comment has no
    // progress, so the honest render is nothing at all.
    expect(progressPercent(comment())).toBeNull()
    expect(progressPercent(comment({ handled: true }))).toBeNull()
  })

  it('a task bar is the step reached over the six the register defines', () => {
    expect(progressPercent(task({ status: 'foreslatt' }))).toBe(17)
    expect(progressPercent(task({ status: 'lukket' }))).toBe(100)
    // Monotone and never over 100, across the whole enum rather than the two
    // ends I picked.
    let last = 0
    for (const status of TASK_STEPS) {
      const pct = progressPercent(task({ status }))!
      expect(pct).toBeGreaterThan(last)
      expect(pct).toBeLessThanOrEqual(100)
      last = pct
    }
  })
})

describe('what the screen refuses to build', () => {
  /**
   * Tor's decision on «Lukk valgte» (v5:3232), asserted so it cannot come back
   * as a tidy-up. Q69: a task cannot close before its effect is assessed, and a
   * bulk button closing a selection makes that bypass the fast path.
   *
   * TWO assertions, because the bar and the action are two places it could
   * reappear — and the second is the one I would otherwise have got wrong:
   * «Flytt ett steg» would close a task sitting at `effektvurdert`, in bulk,
   * without Q97's confirmation, through the button that was kept.
   */
  it('the bulk bar has no close action', () => {
    const src = code('app/(app)/oppgaver/WorklistPanel.tsx')
    // Non-vacuity: the three kept actions must be present, or «no close action»
    // would also be true of an empty string.
    expect(src).toMatch(/wlBulkAdvance/)
    expect(src).toMatch(/wlBulkAssign/)
    expect(src).toMatch(/wlBulkDue/)
    expect(src).not.toMatch(/wlBulkClose|Lukk valgte/)
  })

  it('advanceTasks refuses the step into `lukket` and reports it', () => {
    const src = code('app/(app)/oppgaver/actions.ts')
    expect(src).toMatch(/to === 'lukket'/)
    expect(src).toMatch(/atClose/)
    // And the sentence exists in both languages, or the refusal is silent.
    for (const lang of ['no', 'en']) {
      const msgs = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as {
        tasks: Record<string, string>
      }
      expect(msgs.tasks.wlBulkAtClose, `${lang}: the refusal must have copy`).toBeTruthy()
      expect(msgs.tasks.wlBulkNeedsEffect, `${lang}: partial failure must have copy`).toBeTruthy()
    }
  })

  it('Q72 is corrected in the copy rather than implemented', () => {
    // The bundle's lead (v5:3151) reads «Hvert funn under terskel blir et
    // tiltak» — a task fired by a finding below threshold, which is the trigger
    // Q72 refused. What fires one is a group that will never see its own
    // results: a count of PEOPLE.
    const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as {
      tasks: Record<string, string>
    }
    expect(no.tasks.wlLead).not.toMatch(/under terskel/)
    expect(no.tasks.wlLead).toMatch(/aldri får se sine egne resultater/)
  })

  it('the owner panel is «Eiere» in every view and never «Avsendere» (Q155)', () => {
    const src = code('app/(app)/oppgaver/WorklistPanel.tsx')
    expect(src).toMatch(/wlOwners/)
    expect(src).not.toMatch(/Avsendere|wlSenders/)
    for (const lang of ['no', 'en']) {
      const msgs = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as {
        tasks: Record<string, string>
      }
      expect(msgs.tasks.wlOwners).toBeTruthy()
      expect(Object.keys(msgs.tasks)).not.toContain('wlSenders')
    }
  })
})
