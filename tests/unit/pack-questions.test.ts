import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PackQuestion, configFor, surveyQuestionFrom } from '../../lib/questions/pack'

/**
 * The two paths that create a survey from a pack must produce the SAME survey.
 *
 * They did not: `bibliotek/actions.ts` («Bruk mal») built `config` by hand from
 * three fields while `undersokelser/actions.ts` (the wizard) used `configFor`,
 * so a matrix question created from the library lost its `statements` and a
 * multi-select lost `multi`. Nothing failed and the survey looked plausible.
 *
 * The fix is one module with two callers. This file is what keeps it one:
 * asserting the BEHAVIOUR of the shared builder, and asserting by inspection
 * that neither caller has grown its own copy again.
 */
describe('a pack question becomes one survey question, whichever path builds it', () => {
  const matrix = PackQuestion.parse({
    text: 'Vurder følgende utsagn',
    type: 'matrix',
    statements: ['Er tydelig', 'Lytter', 'Følger opp'],
  })
  const multi = PackQuestion.parse({
    text: 'Hvilke tilbud bruker du?',
    type: 'choice',
    options: ['Kurs', 'Rådgivning'],
    multi: true,
  })

  it('THE DEFECT: statements and multi survive', () => {
    expect(configFor(matrix).statements, 'a matrix keeps its rows').toEqual([
      'Er tydelig',
      'Lytter',
      'Følger opp',
    ])
    expect(configFor(multi).multi, 'a multi-select stays multi').toBe(true)
    expect(configFor(multi).options).toEqual(['Kurs', 'Rådgivning'])
  })

  it('Q35 travels too — the role and its short heading', () => {
    const roled = PackQuestion.parse({
      text: 'Har dere avdekket brudd?',
      type: 'yesno',
      role: 'brudd',
      short: 'Brudd',
    })
    expect(configFor(roled).role).toBe('brudd')
    expect(configFor(roled).short).toBe('Brudd')
  })

  it('the type must be one the registry knows, so an unrenderable question fails at the parse', () => {
    // The two schemas disagreed here as well: the library's accepted any
    // string. A pack question whose type no renderer knows creates a survey
    // nobody can answer, and the parse is the only place that is cheap.
    expect(() => PackQuestion.parse({ text: 'x', type: 'ikke-en-type' })).toThrow()
  })

  it('the row shape is the builder\'s, not each caller\'s', () => {
    const row = surveyQuestionFrom(matrix, 'survey-1', 3)
    expect(Object.keys(row).sort()).toEqual(
      ['survey_id', 'position', 'type', 'text', 'help', 'required', 'config'].sort(),
    )
    expect(row.position).toBe(3)
    expect((row.config as Record<string, unknown>).statements).toHaveLength(3)
  })

  it('NEITHER CALLER HAS ITS OWN COPY — asserted by inspection, because that is how it drifted', () => {
    // A behavioural test cannot see a second builder; it only sees the one it
    // imports. The drift was two files each doing it their own way, so the
    // assertion has to look at the files. Same shape as the catalogue sweeps:
    // derive the set, do not remember it.
    for (const file of [
      'app/(app)/bibliotek/actions.ts',
      'app/(app)/undersokelser/actions.ts',
    ]) {
      const src = readFileSync(file, 'utf8')
      expect(src, `${file} declares its own PackQuestion`).not.toMatch(
        /^const PackQuestion = z\.object\(/m,
      )
      expect(src, `${file} defines its own configFor`).not.toMatch(/^function configFor\(/m)
    }
  })
})
