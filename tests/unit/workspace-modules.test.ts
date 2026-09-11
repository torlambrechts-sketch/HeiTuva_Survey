import { describe, expect, it } from 'vitest'
import { computeShow, parseModuleCookie } from '@/lib/workspace/modules'

const KNOWN = ['action', 'duties', 'loop', 'activity', 'nps', 'quiz'] as const

/**
 * W2 — the module arithmetic, tested across every combination that matters
 * rather than the ones the app can currently reach.
 *
 * The app reaches four of the six modules today (`nps` and `quiz` have no card
 * yet), so a test driven through the page would leave half the templates
 * unexercised. The arithmetic is pure precisely so that limit does not become
 * the test's limit.
 */
describe('W2 · computeShow — the two rows and their column templates', () => {
  it('both of row A present splits evenly', () => {
    const s = computeShow(['loop', 'activity'])
    expect(s.rowA).toBe(true)
    expect(s.rowACols).toBe('1fr 1fr')
  })

  it.each([['loop'], ['activity']])('row A with only %s fills the width', (only) => {
    const s = computeShow([only])
    expect(s.rowA).toBe(true)
    expect(s.rowACols).toBe('minmax(0,1fr)')
  })

  it('neither of row A means the row does not exist', () => {
    const s = computeShow(['action'])
    expect(s.rowA).toBe(false)
    // The template is still a valid value — the row simply is not rendered.
    // Asserted so a future caller cannot read `rowACols` and get undefined.
    expect(s.rowACols).toBe('minmax(0,1fr)')
  })

  it('row B is ASYMMETRIC when both are present — 1.6fr and a 280px floor', () => {
    const s = computeShow(['action', 'duties'])
    expect(s.rowB).toBe(true)
    expect(s.rowBCols).toBe('minmax(0,1.6fr) minmax(280px,.9fr)')
  })

  it.each([['action'], ['duties']])('row B with only %s fills the width', (only) => {
    expect(computeShow([only]).rowBCols).toBe('minmax(0,1fr)')
  })

  it('the two rows are independent', () => {
    const s = computeShow(['loop', 'action'])
    expect([s.rowA, s.rowB]).toEqual([true, true])
    expect([s.rowACols, s.rowBCols]).toEqual(['minmax(0,1fr)', 'minmax(0,1fr)'])
  })

  it('an empty set shows nothing and still returns usable templates', () => {
    const s = computeShow([])
    expect([s.rowA, s.rowB, s.action, s.duties, s.loop, s.activity, s.nps, s.quiz]).toEqual([
      false, false, false, false, false, false, false, false,
    ])
    expect(s.rowACols).toBeTruthy()
    expect(s.rowBCols).toBeTruthy()
  })

  it('nps and quiz are standalone — they are outside both rows', () => {
    const s = computeShow(['nps', 'quiz'])
    expect([s.nps, s.quiz]).toEqual([true, true])
    expect([s.rowA, s.rowB]).toEqual([false, false])
  })

  /**
   * EVERY COMBINATION OF THE FOUR ROW MODULES, because the templates are the
   * thing a phase gets wrong and there are only sixteen of them. A spot check
   * would leave the case nobody thought of untested, which is the shape this
   * project keeps recording.
   */
  it('all sixteen row combinations agree with the counts', () => {
    const ROW = ['loop', 'activity', 'action', 'duties'] as const
    let checked = 0
    for (let mask = 0; mask < 16; mask++) {
      const mods = ROW.filter((_, i) => mask & (1 << i))
      const s = computeShow(mods)
      const aN = Number(mods.includes('loop')) + Number(mods.includes('activity'))
      const bN = Number(mods.includes('action')) + Number(mods.includes('duties'))
      expect(s.rowA, `${mask}`).toBe(aN > 0)
      expect(s.rowB, `${mask}`).toBe(bN > 0)
      expect(s.rowACols, `${mask}`).toBe(aN > 1 ? '1fr 1fr' : 'minmax(0,1fr)')
      expect(s.rowBCols, `${mask}`).toBe(
        bN > 1 ? 'minmax(0,1.6fr) minmax(280px,.9fr)' : 'minmax(0,1fr)',
      )
      checked++
    }
    expect(checked).toBe(16)
  })
})

describe('W2 · parseModuleCookie — a cookie is client-editable, so it is checked', () => {
  it('absent means «nothing chosen», which is NOT «chose nothing»', () => {
    expect(parseModuleCookie(undefined, KNOWN)).toBeNull()
  })

  it('an empty array means «chose nothing» and survives as such', () => {
    // This is the distinction the empty state depends on: null falls back to
    // the workspace's own set, [] renders «Ingen moduler er valgt».
    expect(parseModuleCookie('[]', KNOWN)).toEqual([])
  })

  it('keeps the known keys in the order given', () => {
    expect(parseModuleCookie('["activity","action"]', KNOWN)).toEqual(['activity', 'action'])
  })

  it('drops a key the registry does not have', () => {
    expect(parseModuleCookie('["action","forfalsket"]', KNOWN)).toEqual(['action'])
  })

  it('drops duplicates', () => {
    expect(parseModuleCookie('["action","action"]', KNOWN)).toEqual(['action'])
  })

  it.each([
    ['not json at all', 'action,duties'],
    ['an object', '{"action":true}'],
    ['a bare string', '"action"'],
    ['a number array', '[1,2]'],
  ])('refuses %s, distinctly from an empty choice', (_what, raw) => {
    expect(parseModuleCookie(raw, KNOWN)).toBeNull()
  })

  it('a key retired from the registry stops being shown', () => {
    // The filter is against the registry passed in, not a list in the module,
    // so retiring a key in a migration is enough.
    expect(parseModuleCookie('["quiz"]', ['action', 'activity'])).toEqual([])
  })
})
