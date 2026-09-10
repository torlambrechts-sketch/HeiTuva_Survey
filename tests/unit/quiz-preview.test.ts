import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  B1 — THE ANSWER KEY REACHES THE PREVIEW.

  V2-10 built the quiz end to end: the columns, the guards, `quiz_leaderboard`
  k-gated, the respondent tiles, `QuizPanel`. It did not build the one screen
  where an EDITOR checks their own work — `PreviewPane` contained no occurrence
  of `quiz`, `riktig`, `correct` or either of the bundle's greens, so a survey
  could be keyed and sent with nothing on the building surface confirming which
  option had been marked.

  ── THE ONE PLACE THIS DELIBERATELY DIVERGES FROM THE BUNDLE ────────────────

  V2:6507 renders «Riktig svar: første alternativ» when `answerIndex` is
  undefined. `answer_index`'s own column comment refused that at the schema
  level, in these words: «a default of 0 would silently mark the first option
  correct on every question ever written — a fabricated answer key, which is
  worse than an absent one.» Rendering the bundle's default would have put back
  into the UI exactly what the migration kept out of the table, on the surface
  an editor reads to find out whether they HAVE set a key. `quizNoKey` («Ingen
  fasit valgt») is rendered instead. D144.

  The second divergence is the timer. The bundle writes «20 sek · tidsbonus»;
  there is no configured time limit anywhere in the schema, so the invented
  half is dropped and the true half kept. D145.
*/
const PANE = 'app/(app)/undersokelser/[id]/bygg/PreviewPane.tsx'
const BUILDER = 'app/(app)/undersokelser/[id]/bygg/Builder.tsx'
const MIGRATION = 'supabase/migrations/20260909000085_quiz.sql'
const NO = 'messages/no.json'
const EN = 'messages/en.json'

/* Comments stripped — these are about what the code DOES, and the header above
   quotes the bundle in prose (D139). */
const decomment = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const pane = decomment(readFileSync(PANE, 'utf8'))
/* SQL comments are written as adjacent string literals, so a phrase can be split
   across a `' '` join. Rejoining them means the assertion is about the sentence
   the database stores, not about how the migration happens to be wrapped — the
   first version of this test failed on exactly that and the code was fine. */
const sql = readFileSync(MIGRATION, 'utf8').replace(/'\s*\n\s*'/g, '')
const builder = decomment(readFileSync(BUILDER, 'utf8'))
const no = JSON.parse(readFileSync(NO, 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(readFileSync(EN, 'utf8')) as Record<string, Record<string, string>>

describe('the key is marked in the preview', () => {
  it('marks the correct option with the bundle greens, unchanged', () => {
    expect(pane).toContain("background: '#E4F2E0'")
    expect(pane).toContain("borderColor: '#2F5D2A'")
    expect(pane).toContain("color: '#2F5D2A'")
  })

  it('clears WCAG AA on the pair it ships, recomputed here rather than trusted', () => {
    // Q109 was answered by measurement, so the measurement lives beside the
    // colours. If either hex is ever edited, this recomputes and fails.
    const lin = (c: number) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    const L = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
    }
    const fg = pane.match(/color: '(#[0-9A-F]{6})'/)![1]!
    const bg = pane.match(/background: '(#[0-9A-F]{6})'/)![1]!
    const ratio = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('carries a second, non-colour channel', () => {
    expect(pane).toContain("t('quizCorrectMark')")
    expect(no.builder!.quizCorrectMark).toContain('riktig')
    expect(en.builder!.quizCorrectMark).toContain('correct')
  })

  it('NEVER defaults a missing key to option one, which is what the column refuses', () => {
    // The property, not the mechanism: nothing may mark a chip correct when
    // `answerIndex` is null.
    expect(pane).toContain('q.answerIndex !== null')
    expect(pane).toContain("t('quizNoKey')")
    expect(pane).not.toContain('første alternativ')
    // And the reason, asserted from the migration rather than restated here, so
    // the two cannot drift.
    expect(sql).toContain('fabricated answer key')
  })

  it('decides keyability from the same three types the CHECK constraint allows', () => {
    const allowed = sql.match(/answer_index is null or type in \(([^)]*)\)/)![1]!
    for (const type of ['choice', 'yesno', 'dropdown']) {
      expect(allowed).toContain(type)
      expect(pane).toContain(`q.type === '${type}'`)
    }
  })

  it('says so rather than staying silent on a type that cannot be keyed', () => {
    expect(pane).toContain("t('quizNotScoring')")
    expect(no.builder!.quizNotScoring).toBeTruthy()
  })
})

describe('the score bar and the add-panel note', () => {
  it('invents no time limit, because the schema configures none', () => {
    expect(sql).not.toMatch(/time_limit|seconds/)
    expect(no.builder!.quizPreviewBonus).not.toMatch(/\d/)
    expect(no.builder!.quizPreviewNoLimit).toBe('Ingen tidsgrense')
    expect(pane).toContain("t('quizPreviewNoLimit')")
  })

  it('derives the question count rather than printing one', () => {
    expect(pane).toContain("t('quizPreviewScore', { count: questions.length })")
    expect(no.builder!.quizPreviewScore).toContain('{count}')
  })

  it('gates the bar and the note on the same run mode QuizPanel is gated on', () => {
    expect(builder).toContain("quizMode={runMode === 'quiz'}")
    expect(builder).toContain("runMode === 'quiz' ? (")
    expect(builder).toContain("t('quizAddNote')")
  })

  it("names four options in the note, and the tiles agree", () => {
    // The bundle's sentence and `QUIZ_TILES` are one claim in two files.
    const tiles = readFileSync('app/s/[token]/QuestionInput.tsx', 'utf8')
    const count = tiles.match(/const QUIZ_TILES = \[([^\]]*)\]/)![1]!.split(',').length
    expect(count).toBe(4)
    expect(no.builder!.quizAddNote).toContain('fire alternativer')
  })

  it('ships both languages for every key this phase added', () => {
    for (const k of [
      'quizAddNote', 'quizPreviewScore', 'quizPreviewBonus', 'quizPreviewNoLimit',
      'quizKeyLine', 'quizNotScoring', 'quizCorrectMark',
    ]) {
      expect(no.builder![k], `no.builder.${k}`).toBeTruthy()
      expect(en.builder![k], `en.builder.${k}`).toBeTruthy()
    }
  })
})
