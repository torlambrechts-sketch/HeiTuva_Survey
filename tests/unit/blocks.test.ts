import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BLOCKS,
  BLOCK_TYPES,
  buildFlow,
  flowCounts,
  flowToLists,
  forStorage,
  moveInFlow,
  newBlock,
  type BlockDraft,
  type BlockType,
} from '../../lib/surveys/blocks'

/**
 * V7-3 — the block registry and the one order it shares with the questions.
 *
 * `tests/db/blocks.test.ts` holds the half the DATABASE owns: an answer against
 * a block is unrepresentable, the CHECKs, the deferred cross-table guard. This
 * file holds the half the EDITOR owns, and the two halves meet in one place —
 * `forStorage` has to agree with `survey_blocks_rule_is_empty`,
 * `survey_blocks_url_is_video` and `survey_blocks_media_is_img` or the save
 * fails at the database on a field the editor can no longer see.
 */
const MESSAGES = Object.fromEntries(
  (['no', 'en'] as const).map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')) as Record<string, Record<string, string>>,
  ]),
)
const migration = readFileSync('supabase/migrations/20260917000127_survey_blocks.sql', 'utf8')

const draft = (type: BlockType, patch: Partial<BlockDraft> = {}): BlockDraft => ({
  ...newBlock(type, `new:${type}`),
  ...patch,
})

describe('V7-3 — the block registry', () => {
  it('1. covers exactly the six values the ENUM has, derived from the migration', () => {
    /* Not a list checked against a list: the enum is read out of the migration
       that created it, so a seventh value cannot arrive with no registry row —
       which is how a palette ends up offering five of six, or the database
       accepting a type nothing can render. */
    const m = /create type app\.block_type as enum \(([^)]*)\)/.exec(migration)
    expect(m, 'app.block_type not found in M:0127').not.toBeNull()
    const declared = [...m![1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]!)
    expect([...declared].sort()).toEqual([...BLOCK_TYPES].sort())
    expect(Object.keys(BLOCKS).sort()).toEqual([...declared].sort())
    // Sitat is the seventh v7 draws, and it is DECIDED-NOT-BUILT.
    expect(declared).not.toContain('quote')
  })

  it('2. every label and description ships in BOTH languages', () => {
    const missing: string[] = []
    for (const t of BLOCK_TYPES) {
      for (const key of [BLOCKS[t].labelKey, BLOCKS[t].descKey]) {
        for (const lang of ['no', 'en'] as const) {
          if (!MESSAGES[lang]?.['builder']?.[key]) missing.push(`${lang}.builder.${key}`)
        }
      }
    }
    expect(missing, missing.join(', ')).toEqual([])
  })

  it('3. the pane says blocks produce NO DATA, and with two tables that is true', () => {
    /* A claim the drawing makes and we now ship (`blkPaneNote`): «Innholdsblokker
       teller ikke som spørsmål og gir ingen data.» Under one table it would have
       been a promise held up by eleven filters. Under two it is held up by
       `answers.question_id`, which has no target in `survey_blocks` — the
       property `tests/db/blocks.test.ts` test 1 proves. */
    for (const lang of ['no', 'en'] as const) {
      const note = MESSAGES[lang]!['builder']!['blkPaneNote']!
      expect(note.length).toBeGreaterThan(60)
    }
    expect(MESSAGES['no']!['builder']!['blkPaneNote']).toContain('gir ingen data')
  })

  it('4. forStorage CLEARS every field the type does not use — over all six', () => {
    /* Derived over the whole registry rather than over the two types somebody
       was thinking about. A block whose type changed from `video` to `info`
       keeps its `url` in the editor's state; sending it would be refused by
       `survey_blocks_url_is_video`, at save time, on a field the editor can no
       longer see. */
    for (const t of BLOCK_TYPES) {
      const full = draft(t, {
        title: 'T',
        body: 'B',
        caption: 'C',
        url: 'https://x.test',
        mediaKey: 'opaque-key',
      })
      const row = forStorage(full)
      const f = BLOCKS[t].fields
      expect(row.title, `${t}.title`).toBe(f.title ? 'T' : null)
      expect(row.body, `${t}.body`).toBe(f.body ? 'B' : null)
      expect(row.caption, `${t}.caption`).toBe(f.caption ? 'C' : null)
      expect(row.url, `${t}.url`).toBe(f.url ? 'https://x.test' : null)
      expect(row.media_key, `${t}.media_key`).toBe(f.media ? 'opaque-key' : null)
    }
  })

  it('5. …and the three CHECKs in M:0127 can never fire on what forStorage returns', () => {
    /* The same property from the database's side, stated over the CONSTRAINTS
       the migration actually declares rather than over my memory of them. */
    expect(migration).toContain('survey_blocks_rule_is_empty')
    expect(migration).toContain('survey_blocks_url_is_video')
    expect(migration).toContain('survey_blocks_media_is_img')

    for (const t of BLOCK_TYPES) {
      const row = forStorage(
        draft(t, { title: 'T', body: 'B', caption: 'C', url: 'u', mediaKey: 'k' }),
      )
      if (t === 'rule') {
        expect([row.title, row.body, row.caption, row.url, row.media_key]).toEqual([
          null, null, null, null, null,
        ])
      }
      if (row.url !== null) expect(t).toBe('video')
      if (row.media_key !== null) expect(t).toBe('img')
    }
  })

  it('6. blank is null, not an empty string — an absent title is absent', () => {
    const row = forStorage(draft('section', { title: '   ', body: '' }))
    expect(row.title).toBeNull()
    expect(row.body).toBeNull()
  })
})

describe('V7-3 — one order over two kinds', () => {
  const q = (id: string) => ({ id })
  const b = (id: string, position: number) => ({ ...draft('info', { id }), position })

  it('7. a block sits where its position says, and the questions fill the gaps', () => {
    const flow = buildFlow([q('q1'), q('q2'), q('q3')], [b('b1', 1), b('b2', 4)])
    expect(flow.map((e) => (e.kind === 'block' ? e.item.id : e.item.id))).toEqual([
      'q1', 'b1', 'q2', 'q3', 'b2',
    ])
  })

  it('8. buildFlow and flowToLists round-trip', () => {
    const questions = [q('q1'), q('q2'), q('q3')]
    const blocks = [b('b1', 0), b('b2', 3)]
    const back = flowToLists(buildFlow(questions, blocks))
    expect(back.questions.map((x) => x.id)).toEqual(['q1', 'q2', 'q3'])
    expect(back.blocks.map((x) => [x.id, x.position])).toEqual([
      ['b1', 0],
      ['b2', 3],
    ])
  })

  it('9. NOTHING IS LOST to a contradictory stored state', () => {
    /* Two blocks claiming one slot, and one past the end — both reachable from
       a hand-edited row or a half-applied save. The derivation appends the
       leftovers rather than dropping them, because losing a block is worse than
       moving one, and because a renderer that silently omits content is the
       hardest kind of defect to notice. */
    const flow = buildFlow([q('q1')], [b('b1', 0), b('b2', 0), b('b3', 99)])
    const ids = flow.map((e) => e.item.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids)).toEqual(new Set(['q1', 'b1', 'b2', 'b3']))
  })

  it('10. an empty flow, a blocks-only flow and a questions-only flow all hold', () => {
    expect(buildFlow([], [])).toEqual([])
    expect(buildFlow([], [b('b1', 0)]).map((e) => e.item.id)).toEqual(['b1'])
    expect(buildFlow([q('q1'), q('q2')], []).map((e) => e.item.id)).toEqual(['q1', 'q2'])
  })

  it('11. moveInFlow moves one item and refuses a nonsense index', () => {
    const list = ['a', 'b', 'c']
    expect(moveInFlow(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveInFlow(list, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveInFlow(list, 1, 1)).toBe(list)
    expect(moveInFlow(list, -1, 0)).toBe(list)
    expect(moveInFlow(list, 0, 9)).toBe(list)
  })

  it('12. the save path assigns position from the FLOW, and parks BOTH tables first', () => {
    /* The reason this is asserted over the source: each Supabase call is its own
       transaction, so `position` has to be collision-free at every statement
       boundary. `app.guard_flow_position` is deferrable but spans two tables, so
       parking only the questions would leave a block on a slot a question is
       about to claim — and the symptom would be a save that fails on a reorder,
       far from the trigger. */
    const actions = readFileSync('app/(app)/undersokelser/[id]/bygg/actions.ts', 'utf8')
    const code = actions.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    expect(code).toMatch(/position: -\(flowPos\(q, i\) \+ 1\)/)
    expect(code).toMatch(/position: -\(b\.position \+ 1\)/)
    expect(code).toMatch(/position: flowPos\(q, i\)/)
    // And `forStorage` is what reaches the row, not the raw draft.
    expect(code).toMatch(/\.\.\.forStorage\(draft\)/)
  })
})

describe('V7-4 — what the flow is made of', () => {
  const q = (id: string) => ({ id })
  const blk = (id: string, type: BlockType, position: number) => ({
    ...draft(type, { id }),
    position,
  })

  it('13. counts questions, blocks and SECTIONS over one flow', () => {
    const flow = buildFlow([q('q1'), q('q2'), q('q3')], [
      blk('b1', 'section', 1),
      blk('b2', 'info', 2),
      blk('b3', 'section', 5),
      blk('b4', 'rule', 6),
    ])
    expect(flowCounts(flow)).toEqual({ questions: 3, blocks: 4, sections: 2 })
  })

  it('14. «SEKSJONER» IS ZERO WHEN THERE ARE NONE — v7 draws 1 (Q241)', () => {
    /* The bundle's own expression is `String(secs || 1)` (v7:10221), so a survey
       with no section block draws «1 Seksjoner». That is a fabricated value in
       the sense CLAUDE.md names — indistinguishable from a real one in review,
       and it survives into a screenshot as though it were true.

       Asserted from both sides: zero reads zero, and the chip's own source
       carries no `|| 1` fallback for anyone to reintroduce. */
    const noSections = buildFlow([q('q1')], [blk('b1', 'info', 1), blk('b2', 'rule', 2)])
    expect(flowCounts(noSections).sections).toBe(0)
    expect(flowCounts(noSections)).toEqual({ questions: 1, blocks: 2, sections: 0 })
    // An empty flow is all zeroes, not all ones.
    expect(flowCounts([])).toEqual({ questions: 0, blocks: 0, sections: 0 })

    const builder = readFileSync('app/(app)/undersokelser/[id]/bygg/Builder.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
    expect(builder).toContain('counts.sections')
    expect(builder).not.toMatch(/counts\.sections\s*\|\|/)
  })

  it('15. every chip label ships in BOTH languages', () => {
    const missing: string[] = []
    for (const key of ['flowChipQuestions', 'flowChipBlocks', 'flowChipSections']) {
      for (const lang of ['no', 'en'] as const) {
        if (!MESSAGES[lang]?.['builder']?.[key]) missing.push(`${lang}.builder.${key}`)
      }
    }
    expect(missing, missing.join(', ')).toEqual([])
  })
})
