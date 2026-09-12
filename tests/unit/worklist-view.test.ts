import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  WORKLIST_COOKIE,
  WORKLIST_VIEWS,
  isWorklistView,
  resolveWorklistView,
} from '@/lib/worklist/view'

/**
 * V5-2 — where the Arbeidsliste's view mode lives, and the measurement that
 * made the question smaller than it was asked.
 */
const bundle = readFileSync(
  'design-reference-v5/heituva-survey-app-design/project/HeiTuva.dc.html',
  'utf8',
).split('\n')

describe('the column toggles are NOT on this screen — measured, not assumed', () => {
  it('1. colOwner..colScore render inside isUitest, and isTasks contains none of them', () => {
    /* The persistence question was put as «the column toggles AND the view mode
       are per-person state». Five of those six things belong to the
       table-variant playground: they are its «Vis kolonner» control, fed by
       `uiColumns` and read from `st.uiCols`.

       Building them on the Arbeidsliste would have been inventing five controls
       the bundle does not draw there — which is why this is a test and not a
       note. */
    const lineOf = (needle: string) => bundle.findIndex((l) => l.includes(needle)) + 1
    const uitestOpen = lineOf('<sc-if value="{{ isUitest }}"')
    const tasksOpen = lineOf('<sc-if value="{{ isTasks }}"')
    expect(uitestOpen, 'isUitest must be findable').toBeGreaterThan(0)
    expect(tasksOpen, 'isTasks must be findable').toBeGreaterThan(uitestOpen)

    for (const col of ['colOwner', 'colStatus', 'colDate', 'colResponses', 'colScore']) {
      const at = lineOf(`<sc-if value="{{ ${col} }}"`)
      expect(at, `${col} must be findable`).toBeGreaterThan(0)
      expect(at, `${col} renders inside isUitest, not on the Arbeidsliste`).toBeLessThan(tasksOpen)
      expect(at).toBeGreaterThan(uitestOpen)
    }

    // The other half of the claim: the tasks block mentions none of them.
    const tasksBlock = bundle.slice(tasksOpen, tasksOpen + 300).join('\n')
    expect(tasksBlock).not.toMatch(/colOwner|colStatus|colDate|colResponses|colScore/)
  })

  it('2. and «Lukk valgte» is not built, which the database made cost-free', () => {
    /* Tor: DO NOT BUILD — Q69 says a task cannot close before its effect is
       assessed, and a bulk button makes the bypass the fast path. Measured, it
       could never have worked: `guard_task_close` refuses
       `foreslatt -> lukket` outright, and refuses `effektvurdert` without a
       `task_effect_assessments` row. A button that fails on almost every
       selection is worse than no button.

       The bundle draws it, so this test is what stops a fidelity pass adding
       it back. */
    const src = readFileSync('lib/worklist/view.ts', 'utf8')
    expect(src).not.toMatch(/bulkClose|onIvBulkClose|lukkValgte/i)
  })
})

describe('the cookie is resolved against the set, never trusted', () => {
  it('3. a known cookie wins', () => {
    expect(resolveWorklistView('board', 'list')).toBe('board')
    expect(resolveWorklistView('list', 'board')).toBe('list')
  })

  it('4. an UNKNOWN cookie falls back exactly as an absent one does', () => {
    /* A cookie is user-supplied. `readWorkspace` spells out the same rule and
       the same reason: collapsing the fallbacks would hide a bad cookie behind
       a correct-looking render. */
    for (const bad of ['tavle', 'BOARD', '', '  ', 'list;DROP', null, undefined]) {
      expect(resolveWorklistView(bad, 'board'), `cookie ${JSON.stringify(bad)}`).toBe('board')
    }
  })

  it('5. the organisation default is the second step, and «list» the third', () => {
    expect(resolveWorklistView(null, 'board')).toBe('board')
    expect(resolveWorklistView(null, null)).toBe('list')
    // An unknown ORG value falls back too — the column has a CHECK, but a
    // reader that trusts the column is a reader that breaks when the check is
    // dropped.
    expect(resolveWorklistView(null, 'kanban')).toBe('list')
  })

  it('6. the writer boundary and the reader share one copy of the set', () => {
    expect([...WORKLIST_VIEWS]).toEqual(['list', 'board'])
    expect(isWorklistView('board')).toBe(true)
    expect(isWorklistView('kanban')).toBe(false)
    // The zod field imports WORKLIST_VIEWS rather than re-listing the two, so a
    // third mode cannot be accepted by one side and refused by the other.
    const actions = readFileSync('app/(app)/administrasjon/actions.ts', 'utf8')
    expect(actions).toMatch(/import \{ WORKLIST_VIEWS \} from '@\/lib\/worklist\/view'/)
    expect(actions).toMatch(/worklist_view: z\.enum\(WORKLIST_VIEWS\)/)
  })

  it('7. the cookie name says it is per-device', () => {
    expect(WORKLIST_COOKIE).toBe('heituva.worklist')
  })
})

describe('the column has a writer in the phase that adds it', () => {
  it('8. saveCompany reads the field and writes the column', () => {
    /* Invariant 8. Four recorded instances of a column that was read
       everywhere and written by nothing; this one gets its writer in the same
       migration's phase, and the test is what keeps that true. */
    const actions = readFileSync('app/(app)/administrasjon/actions.ts', 'utf8')
    expect(actions).toMatch(/worklist_view: formData\.get\('worklist_view'\)/)
    expect(actions).toMatch(/worklist_view: parsed\.data\.worklist_view/)

    const form = readFileSync('app/(app)/administrasjon/CompanyForm.tsx', 'utf8')
    expect(form, 'and the control that produces it exists').toMatch(/name="worklist_view"/)

    const page = readFileSync('app/(app)/administrasjon/page.tsx', 'utf8')
    expect(page, 'and the page reads it back, or the control has no default')
      .toMatch(/worklist_view/)
  })
})
