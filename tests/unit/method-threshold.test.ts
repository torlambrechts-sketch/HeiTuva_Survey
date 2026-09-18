import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * T1.6 — «the threshold in the method section, always».
 *
 * A composed report has FOUR renderers, and the property this test states is
 * that every one of them renders the method section's threshold. It was true of
 * three: the editor, the PDF and the deck. The fourth is `app/r/[token]`, the
 * public share link, and it was the one where the omission cost the most — its
 * reader is outside the organisation and has nothing else to go on.
 *
 * The renderer set is SWEPT rather than listed. A list would be the four that
 * exist today, which is exactly the enumeration that let a fourth be missed in
 * the first place; a fifth renderer joins this set by consuming
 * `ComposedSection` and fails here if it drops the section.
 *
 * `compose_report` (M:0089) supplies `{k, sources}` for the method section
 * unconditionally, so a renderer that omits the branch is dropping data it was
 * handed — not rendering an absence.
 */

const ROOTS = ['app', 'lib']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

/** Comments name what a file refuses as often as what it does, and this
 *  project has gone red three times on a grep that matched its own prose. The
 *  sweep measures code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Consumers, not the declaration: `editor-types.ts` names `ComposedSection`
 *  because it DEFINES it, and a type has no method section to render. */
const renderers = () =>
  ROOTS.flatMap((r) => walk(r)).filter((f) => {
    const src = stripComments(readFileSync(f, 'utf8'))
    return src.includes('ComposedSection') && !/export type ComposedSection\b/.test(src)
  })

describe('T1.6 — every composed-report renderer states the threshold', () => {
  it('the renderer set is swept, and it is not empty', () => {
    const found = renderers()
    // A derivation that finds nothing looks identical to a product that has
    // nothing. The floor is what tells them apart.
    expect(found.length).toBeGreaterThanOrEqual(4)
    expect(found.some((f) => f.includes(join('app', 'r')))).toBe(true)
  })

  it.each(renderers())('%s renders the method section from extra.k', (file) => {
    const src = stripComments(readFileSync(file, 'utf8'))
    expect(src).toContain("'method'")
    expect(src).toMatch(/typeof extra\.k === 'number'/)
  })

  it.each(renderers())('%s states the attributed case rather than a bare 0', (file) => {
    const src = stripComments(readFileSync(file, 'utf8'))
    // k = 0 is an organisation survey — attributed by design, no threshold at
    // all. Rendering «Resultater vises fra 0 svar» would be a false statement
    // about a real setting, which is the one error Q17 names.
    expect(src).toContain('methodAttributed')
  })

  it.each(renderers())('%s carries the per-source line for a weaker source', (file) => {
    const src = stripComments(readFileSync(file, 'utf8'))
    // A document at 5 drawing on a survey at 2 is only as strong as its
    // weakest source, and the reader is the person who needs to know.
    expect(src).toContain('sourceLowerK')
  })
})
