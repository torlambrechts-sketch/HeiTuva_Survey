import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { changeBetween, changeLabel, hasValue, totalOf } from '@/lib/results/compare'

/**
 * G2.2 — A DERIVED FIGURE IS GATED BY ITS INPUTS.
 *
 * The defect: v8's comparison table puts an ungated «Endring» beside
 * individually gated rounds, and a change spanning a suppressed round
 * reconstructs it. 4.2 shown, — suppressed, +0.3 => 4.5.
 */
describe('G2.2 — a change is withheld when either endpoint is', () => {
  const shown = (avg: number) => ({ avg })
  const gated = { avg: null, insufficient_data: true }

  it('two shown endpoints give the change', () => {
    const c = changeBetween(shown(4.2), shown(4.5))
    expect(c.kind).toBe('value')
    expect(c.kind === 'value' && c.delta).toBe(0.3)
  })

  it('THE DEFECT: a suppressed TO endpoint yields no value to render', () => {
    const c = changeBetween(shown(4.2), gated)
    expect(c.kind, '4.2 + the change would reconstruct the suppressed round').toBe('suppressed')
    expect(c).not.toHaveProperty('delta')
  })

  it('and a suppressed FROM endpoint, which is the same leak backwards', () => {
    const c = changeBetween(gated, shown(4.5))
    expect(c.kind).toBe('suppressed')
    expect(c).not.toHaveProperty('delta')
  })

  it('names WHICH endpoint was withheld, so the screen need not re-derive it', () => {
    expect(changeBetween(shown(4.2), gated)).toEqual({ kind: 'suppressed', from: false, to: true })
    expect(changeBetween(gated, shown(4.5))).toEqual({ kind: 'suppressed', from: true, to: false })
  })

  it('there is NO numeric fallback — a suppressed change cannot be formatted as 0', () => {
    // The shape is the guard: `number | null` invites `?? 0`, and a zero change
    // beside a suppressed cell asserts the value did not move.
    expect(changeLabel(changeBetween(shown(4.2), gated), '—')).toBe('—')
    expect(changeLabel(changeBetween(shown(4.2), shown(4.5)), '—')).toBe('+0,3')
  })

  it('a missing cell is treated as withheld, not as zero', () => {
    expect(changeBetween(shown(4.2), null).kind).toBe('suppressed')
    expect(changeBetween(undefined, shown(4.2)).kind).toBe('suppressed')
  })

  it('hasValue requires BOTH halves — a flag without a null avg is not trusted', () => {
    expect(hasValue({ avg: 4, insufficient_data: true })).toBe(false)
    expect(hasValue({ avg: null })).toBe(false)
    expect(hasValue({ avg: 0 }), 'zero is a value').toBe(true)
  })

  /**
   * THE SECOND HALF. Suppressing the change is not enough if a total over the
   * same row lets a reader recover it by subtraction — the same defect one
   * column along.
   */
  it('a total over a set containing a suppressed member is itself suppressed', () => {
    expect(totalOf([shown(4), shown(5), gated]).kind).toBe('suppressed')
    expect(totalOf([shown(4), shown(5)]).kind).toBe('value')
    expect(totalOf([]).kind, 'an empty set has no total to publish').toBe('suppressed')
  })
})

/**
 * THE SWEEP, over the SET rather than over the files I happened to change.
 *
 * `lib/results/compare.ts` is only the recommended route if nothing else
 * subtracts two averages. This asserts it is the ONLY route: no file under
 * `app/`, `lib/` or `components/` may subtract one `.avg` from another.
 *
 * Comments are stripped first — this project has been bitten three times by a
 * file that documents its own refusal and is then found by a grep over that
 * documentation.
 */
describe('G2.2 — nothing else forms a difference between two result cells', () => {
  const ROOTS = ['app', 'lib', 'components']
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

  function files(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e.startsWith('.')) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) files(p, out)
      else if (/\.(ts|tsx)$/.test(e)) out.push(p)
    }
    return out
  }

  it('no file outside lib/results/compare.ts subtracts one avg from another', () => {
    // `x.avg - y.avg`, `mine - row.bench`, `a.avg - b` and friends.
    const SUBTRACT_AVG = /\b[A-Za-z_$][\w$]*\.avg\s*-\s*[A-Za-z_$]|\b[A-Za-z_$][\w$]*\s*-\s*[A-Za-z_$][\w$]*\.avg\b/
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const f of files(root)) {
        if (f === join('lib', 'results', 'compare.ts')) continue
        const text = strip(readFileSync(f, 'utf8'))
        for (const [i, line] of text.split('\n').entries()) {
          if (SUBTRACT_AVG.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 80)}`)
        }
      }
    }
    expect(
      offenders,
      `these form a difference between two result cells without the gate:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the sweep actually reaches files — a derivation that finds nothing looks clean', () => {
    const count = ROOTS.reduce((n, r) => n + files(r).length, 0)
    expect(count, 'if this is small the sweep above proves nothing').toBeGreaterThan(200)
  })
})
