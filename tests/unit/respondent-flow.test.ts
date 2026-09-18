import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { questionsOf, respondentFlow, stepLabelFor } from '../../lib/respondent/flow'
import { BLOCK_SEEDS, BLOCK_TYPES, BLOCKS, seededBlock } from '../../lib/surveys/blocks'
import { safeVideoUrl } from '../../lib/surveys/media'

/**
 * V7-3c — what a round's snapshot entry IS, what a block may say, and the two
 * refusals on the respondent's side.
 *
 * `tests/db/blocks.test.ts` holds the property the DATABASE owns — an answer
 * against a block is unrepresentable. This file holds the property the
 * RESPONDENT PATH owns: that a block never becomes a question, that a round
 * sent before M:0127 still renders, and that the `info` seed does not promise
 * anonymity the block cannot keep (D233).
 */
const MESSAGES = Object.fromEntries(
  (['no', 'en'] as const).map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')) as Record<string, Record<string, string>>,
  ]),
)

const q = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'text',
  text: `Q ${id}`,
  kind: 'question',
  ...extra,
})
const b = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'info',
  kind: 'block',
  title: `B ${id}`,
  ...extra,
})

describe('V7-3c — the snapshot is partitioned by a PROPERTY, not by a list', () => {
  it('1. a block announces itself; everything else is a question', () => {
    const flow = respondentFlow([q('q1'), b('b1'), q('q2')])
    expect(flow.map((s) => s.kind)).toEqual(['question', 'block', 'question'])
  })

  it('2. AN ENTRY WITH NO `kind` IS A QUESTION — every round sent before M:0127', () => {
    /* The load-bearing default. `question_snapshot` carried untagged question
       objects from M:0004 until M:0127, so a rule written as
       `kind === 'question'` would have emptied every historical survey the
       moment it shipped — a respondent opening an old link would have been
       shown a survey with no questions in it. */
    const legacy = [
      { id: 'q1', type: 'scale', text: 'Hvordan har du det?', required: true },
      { id: 'q2', type: 'text', text: 'Noe mer?' },
    ]
    const flow = respondentFlow(legacy)
    expect(flow).toHaveLength(2)
    expect(flow.every((s) => s.kind === 'question')).toBe(true)
    expect(questionsOf(flow).map((x) => x.id)).toEqual(['q1', 'q2'])
  })

  it('3. an UNKNOWN kind is dropped rather than guessed into a question', () => {
    /* It can only come from a future writer, and guessing «question» would
       create an answer key for something that may not be one. */
    const flow = respondentFlow([q('q1'), { id: 'x', kind: 'divider-v9', type: 'info' }])
    expect(flow.map((s) => s.kind)).toEqual(['question'])
  })

  it('4. an unknown BLOCK TYPE is dropped, and that cannot lose an answer', () => {
    /* Dropping is safe here precisely because a block carries no answer.
       Rendering it would mean inventing a treatment no bundle draws. */
    const flow = respondentFlow([b('b1'), { id: 'b2', kind: 'block', type: 'quote', body: 'x' }])
    expect(flow).toHaveLength(1)
    expect(flow[0]!.kind === 'block' && flow[0]!.block.id).toBe('b1')
  })

  it('5. `media_key` NEVER reaches the client — only whether there is a picture', () => {
    /* A storage path is an authorisation claim. The browser gets
       `/s/<token>/media/<block_id>`; the key stops on the server (M:0128). */
    const flow = respondentFlow([
      b('b1', { type: 'img', media_key: 'ffffffff-0000/secret.png' }),
      b('b2', { type: 'img' }),
    ])
    const withKey = flow[0]!.kind === 'block' ? flow[0]!.block : null
    expect(withKey?.hasMedia).toBe(true)
    expect(JSON.stringify(flow)).not.toContain('secret.png')
    expect(flow[1]!.kind === 'block' && flow[1]!.block.hasMedia).toBe(false)
  })

  it('6. the video URL is refused AT THE PARSE, not at render', () => {
    const cases: [string, boolean][] = [
      ['https://vimeo.test/1', true],
      ['http://vimeo.test/1', false],
      ['javascript:alert(1)', false],
      ['https://', false],
      ['data:text/html,x', false],
      ['not a url', false],
    ]
    for (const [raw, ok] of cases) {
      const flow = respondentFlow([b('v', { type: 'video', url: raw })])
      const got = flow[0]!.kind === 'block' ? flow[0]!.block.url : 'MISSING'
      expect(got === null, `${raw}`).toBe(!ok)
      expect(safeVideoUrl(raw) === null, `safeVideoUrl ${raw}`).toBe(!ok)
    }
  })

  it('7. a snapshot that is not an array, or holds junk, yields an empty flow', () => {
    expect(respondentFlow(null)).toEqual([])
    expect(respondentFlow('[]')).toEqual([])
    expect(respondentFlow([null, 7, {}, { kind: 'block' }])).toEqual([])
  })

  it('8. blank text is null, so a renderer never prints an empty heading', () => {
    const flow = respondentFlow([b('b1', { title: '  ', body: '', caption: 'C' })])
    const block = flow[0]!.kind === 'block' ? flow[0]!.block : null
    expect(block?.title).toBeNull()
    expect(block?.body).toBeNull()
    expect(block?.caption).toBe('C')
  })
})

describe('V7-3c — D233: the seed may not promise anonymity', () => {
  const say = (lang: 'no' | 'en') => (key: string) => MESSAGES[lang]!['builder']![key] ?? `!${key}`

  it('9. every seeded key RESOLVES in both languages', () => {
    /* A missing key renders as a raw key, which is the defect Tor found nine of
       behind seventeen green gates. Derived over the registry, so a seventh
       type cannot arrive with its copy missing. */
    const missing: string[] = []
    for (const t of BLOCK_TYPES) {
      const seed = BLOCK_SEEDS[t]
      for (const key of [seed.titleKey, seed.bodyKey, seed.captionKey]) {
        if (!key) continue
        for (const lang of ['no', 'en'] as const) {
          if (!MESSAGES[lang]?.['builder']?.[key]) missing.push(`${lang}.builder.${key}`)
        }
      }
    }
    expect(missing, missing.join(', ')).toEqual([])
  })

  it('10. THE INFO SEED CARRIES NO ANONYMITY PROMISE — in either language', () => {
    /* v7:6871 is «Svarene brukes til å forbedre arbeidsmiljøet. Ingen ser hva
       du har svart alene — resultatene vises bare samlet.» The second sentence
       is false on a NAMED survey, false of a COMMENT (which carries
       `invitation_id`), and structurally false in QUIZ MODE (which requires
       named answers). The promise is made correctly elsewhere, by
       `anonymityPromise`, derived from the survey's own mode.

       Stated as a property over EVERY seed rather than over the one sentence:
       no default block copy may claim anything about who can see an answer. */
    const forbidden = [
      /ingen ser/i,
      /bare samlet/i,
      /anonym/i,
      /nobody (can )?see/i,
      /only .*aggregate/i,
      /anonymous/i,
    ]
    for (const lang of ['no', 'en'] as const) {
      for (const t of BLOCK_TYPES) {
        const seed = BLOCK_SEEDS[t]
        for (const key of [seed.titleKey, seed.bodyKey, seed.captionKey]) {
          if (!key) continue
          const text = MESSAGES[lang]!['builder']![key]!
          for (const bad of forbidden) {
            expect(bad.test(text), `${lang}.${key}: ${text}`).toBe(false)
          }
        }
      }
    }
    // And the half that DOES ship is v7's first sentence, unchanged.
    expect(MESSAGES['no']!['builder']!['seedInfoBody']).toBe(
      'Svarene brukes til å forbedre arbeidsmiljøet.',
    )
  })

  it('10b. NO SEED ASSERTS A THRESHOLD, and `seedImgCaption` is v7 verbatim', () => {
    /* V7-6, and it exists because of a demonstrated hole rather than a worry.
       `verify:copy` failed on `builder.seedImgCaption` — «Fra svar til tiltak i
       fire steg», a numeral fifteen characters from «svar» — and the fix was an
       allowlist entry with a reason, which is the gate's own documented
       mechanism. **Then the mutation test showed what that mechanism costs:**
       replacing the value with «Vises fra fem svar» left the gate CLEAN,
       because an allowlist keyed by NAME short-circuits before it reads the
       string. The script's own header says so — «an allowlist keyed by name
       ages exactly like a phrase list» — and five sibling entries share the
       property.

       So the guard for that key lives HERE instead, in the layer that is not
       frozen, and it is stated two ways:

       - the FAMILY property, over every seed in both languages: a block's
         default copy may not claim a threshold, which is Q55's rule aimed at
         the one place the gate can now be told to look away from;
       - the VALUE, pinned, because the whole justification for the allowlist
         entry is that the string is v7:6873 verbatim. Edit it and this fails,
         which is the allowlist entry asking to be re-justified. */
    const thresholdClaim = [
      /terskel/i,
      /threshold/i,
      /vises fra \S+ svar/i,
      /from \S+ answers/i,
      /\S+ svar før/i,
      /minst \S+ svar/i,
      /at least \S+ answers/i,
    ]
    for (const lang of ['no', 'en'] as const) {
      for (const t of BLOCK_TYPES) {
        const seed = BLOCK_SEEDS[t]
        for (const key of [seed.titleKey, seed.bodyKey, seed.captionKey]) {
          if (!key) continue
          const text = MESSAGES[lang]!['builder']![key]!
          for (const bad of thresholdClaim) {
            expect(bad.test(text), `${lang}.${key}: ${text}`).toBe(false)
          }
        }
      }
    }
    // v7:6873, both halves, because the allowlist reason names this line.
    expect(MESSAGES['no']!['builder']!['seedImgCaption']).toBe(
      'Fra svar til tiltak i fire steg',
    )
    expect(MESSAGES['en']!['builder']!['seedImgCaption']).toBe(
      'From answer to action in four steps',
    )
  })

  it('11. a seed only fills fields the type actually uses', () => {
    /* Otherwise `forStorage` would clear it on the way out and the editor would
       watch text they were shown disappear on save. */
    for (const t of BLOCK_TYPES) {
      const block = seededBlock(t, 'new:x', say('no'))
      const f = BLOCKS[t].fields
      if (!f.title) expect(block.title, `${t}.title`).toBe('')
      if (!f.body) expect(block.body, `${t}.body`).toBe('')
      if (!f.caption) expect(block.caption, `${t}.caption`).toBe('')
      if (!f.url) expect(block.url, `${t}.url`).toBe('')
      expect(block.mediaKey, `${t}.mediaKey`).toBeNull()
    }
    // The divider has nothing to say, and v7's seed for it is `{}`.
    const rule = seededBlock('rule', 'new:r', say('no'))
    expect([rule.title, rule.body, rule.caption, rule.url]).toEqual(['', '', '', ''])
  })
})

describe('V7-3c — the respondent path holds no storage path and no embed', () => {
  const block = readFileSync('app/s/[token]/RespondentBlock.tsx', 'utf8')
  const code = block.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

  it('12. NO <iframe> AND NO <video> on the respondent surface', () => {
    /* A third-party request made FROM the respondent's browser, on the one
       surface kept free of anything that could observe her. v7 draws a card
       with a play triangle (v7:5406-5412), not a player, so the card is also
       the fidelity-correct build. The link is her own navigation. */
    expect(code).not.toMatch(/<iframe/i)
    expect(code).not.toMatch(/<video/i)
    expect(code).toContain('rel="noopener noreferrer"')
  })

  it('13. the picture comes from OUR origin, through the helper', () => {
    /* Not a Supabase signed URL: `img-src 'self'` in next.config.ts refuses
       that origin, so a correct signed URL renders nothing at all. Asserted
       over the source AND over the CSP, so a future widening of one shows up
       here rather than as a blank image. */
    expect(code).toContain('respondentMediaHref(token, block.id)')
    expect(code).not.toMatch(/supabase\.co/)
    const config = readFileSync('next.config.ts', 'utf8')
    expect(config).toContain('"img-src \'self\' data: blob:"')
  })
})

describe('V7-3c — the step label counts the population it NAMES', () => {
  /* The flow the driving run built: three questions, four blocks, interleaved.
     `Spørsmål 1 av 7` is what a flow-wide denominator produced, and it is a
     false sentence: four of those seven cannot be answered. */
  const flow = respondentFlow([
    { id: 'q1', type: 'scale', text: 'Hvordan har du det?' },
    { id: 'b1', kind: 'block', type: 'section', title: 'Om arbeidsmiljøet' },
    { id: 'b2', kind: 'block', type: 'img', title: 'Slik ser prosessen ut' },
    { id: 'q2', type: 'text', text: 'Noe mer?' },
    { id: 'b3', kind: 'block', type: 'video', url: 'https://vimeo.test/x' },
    { id: 'b4', kind: 'block', type: 'rule' },
    { id: 'q3', type: 'yesno', text: 'Er dette greit?' },
  ])

  it('14. «Spørsmål N av M» counts QUESTIONS, never the flow', () => {
    expect(flow).toHaveLength(7)
    expect(stepLabelFor(flow, 0)).toEqual({ key: 'stepLabel', step: 1, total: 3 })
    expect(stepLabelFor(flow, 3)).toEqual({ key: 'stepLabel', step: 2, total: 3 })
    expect(stepLabelFor(flow, 6)).toEqual({ key: 'stepLabel', step: 3, total: 3 })
    // The defect this replaced: 7 as the denominator of «Spørsmål».
    for (const step of [0, 3, 6]) expect(stepLabelFor(flow, step).total).not.toBe(7)
  })

  it('15. a BLOCK step switches the label and counts the FLOW (v7:10442)', () => {
    for (const step of [1, 2, 4, 5]) {
      expect(stepLabelFor(flow, step)).toEqual({
        key: 'blockReadStep',
        step: step + 1,
        total: 7,
      })
    }
  })

  it('16. both labels resolve, in both languages, with both placeholders', () => {
    for (const lang of ['no', 'en'] as const) {
      for (const key of ['stepLabel', 'blockReadStep'] as const) {
        const text = MESSAGES[lang]!['respondent']![key]
        expect(text, `${lang}.respondent.${key}`).toBeTruthy()
        expect(text, `${lang}.${key} needs {step}`).toContain('{step}')
        expect(text, `${lang}.${key} needs {total}`).toContain('{total}')
      }
    }
    // And the two say DIFFERENT things — a block step that read «Spørsmål»
    // would be the defect with the derivation fixed and the copy still wrong.
    expect(MESSAGES['no']!['respondent']!['blockReadStep']).not.toContain('Spørsmål')
  })

  it('17. an out-of-range step never claims a question that is not there', () => {
    /* Reachable from a stale `step` after a round is replaced under the
       respondent. The question count is still the question count. */
    expect(stepLabelFor(flow, 99)).toEqual({ key: 'stepLabel', step: 3, total: 3 })
    expect(stepLabelFor([], 0)).toEqual({ key: 'stepLabel', step: 0, total: 0 })
  })
})
