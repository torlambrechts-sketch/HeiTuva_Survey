import type { Database } from '@/types/database'

/**
 * V7-3 — THE SIX CONTENT BLOCKS, AS ONE REGISTRY.
 *
 * v7 lets an editor interleave content with the questions: a section heading,
 * a paragraph, a picture, a video link, a fact box and a divider
 * (`blockDefs`, v7:6858-6867). They render in the respondent's flow, they carry
 * no answer, and they order as one sequence with the questions.
 *
 * ── SITAT IS NOT HERE, AND THAT IS A DECISION RATHER THAN AN OMISSION ─────
 *
 * v7 draws SEVEN. Tor dropped «Sitat» outright — not deferred — and the
 * reasoning is worth carrying because the drawing makes the block look easy:
 * its own description is «Utsagn fra forrige runde, med kilde» (v7:6864) and
 * its seed is «Anonymt svar, mars» (v7:6875), which is a respondent's free text
 * with an attribution.
 *
 * Asking that respondent for consent afterwards means reaching the one person
 * who wrote it, and **a free-text ANSWER is unlinked by construction**:
 * `responses` carries no `invitation_id`, which is invariant 2 and structural.
 * Only a COMMENT carries one (QR-2), so only comments could ever be quoted —
 * and a share-link respondent can never be asked at all. Rather than ship a
 * block that works for one source and not the other, the block does not exist.
 *
 * `app.block_type` has six values, so a seventh is a migration and not a row
 * here — which is what keeps this registry and the database from disagreeing.
 *
 * ── WHY THE FIELD MATRIX IS DATA ──────────────────────────────────────────
 *
 * Each type shows a different set of fields, and v7 states that as five
 * predicates over `type` (v7:10098-10102). Written as a row per type instead,
 * so a reader sees the whole matrix at once and a seventh type cannot arrive
 * with three of its five answers missing. The DATABASE enforces the same shape
 * from the other side — `survey_blocks_rule_is_empty`,
 * `survey_blocks_url_is_video` and `survey_blocks_media_is_img` (M:0127) — so
 * this table decides what the EDITOR sees and the CHECKs decide what can be
 * stored. Neither is the rule on its own.
 */
export type BlockType = Database['public']['Tables']['survey_blocks']['Row']['type']

/** The drawing's order, which is the palette's order (v7:6859-6866). */
export const BLOCK_TYPES = ['section', 'info', 'img', 'video', 'fact', 'rule'] as const

export type BlockFields = {
  /** Every type but the divider. `v7:10098`. */
  title: boolean
  /** `v7:10099` — v7 lists `info, section, quote, fact`; `quote` is not ours. */
  body: boolean
  /** `v7:10100` — the upload. */
  media: boolean
  /** `v7:10101` — the video link. */
  url: boolean
  /** `v7:10102`. */
  caption: boolean
}

export type BlockSpec = {
  /** `nav`-independent: the label and description live in `builder`. */
  labelKey: string
  descKey: string
  fields: BlockFields
  /**
   * The 24×24 stroke path the drawing gives each type (v7:6860-6866), copied
   * verbatim because an icon is a visual and the bundle wins on visuals.
   */
  icon: string
  /**
   * The row's background in the builder's flow (`blockTint`, v7:10097). Only
   * `fact` differs, and only because the drawing says so — `quote`'s `--ac2`
   * left with the type.
   */
  tint: 'sf' | 'sbg'
}

const NONE: BlockFields = { title: false, body: false, media: false, url: false, caption: false }

export const BLOCKS: Record<BlockType, BlockSpec> = {
  section: {
    labelKey: 'blkSection',
    descKey: 'blkSectionDesc',
    fields: { ...NONE, title: true, body: true },
    icon: 'M4 6h16M4 11h10M4 16h16M4 21h7',
    tint: 'sf',
  },
  info: {
    labelKey: 'blkInfo',
    descKey: 'blkInfoDesc',
    fields: { ...NONE, title: true, body: true },
    icon: 'M5 5h14M5 10h14M5 15h10',
    tint: 'sf',
  },
  img: {
    labelKey: 'blkImg',
    descKey: 'blkImgDesc',
    fields: { ...NONE, title: true, media: true, caption: true },
    icon: 'M4 5h16v14H4zM8 11l3 3 3-4 4 5',
    tint: 'sf',
  },
  video: {
    labelKey: 'blkVideo',
    descKey: 'blkVideoDesc',
    fields: { ...NONE, title: true, url: true, caption: true },
    icon: 'M4 6h16v12H4zM10 9l5 3-5 3z',
    tint: 'sf',
  },
  fact: {
    labelKey: 'blkFact',
    descKey: 'blkFactDesc',
    fields: { ...NONE, title: true, body: true },
    icon: 'M12 4l8 4v6c0 4-3.5 6-8 7-4.5-1-8-3-8-7V8z',
    tint: 'sbg',
  },
  rule: {
    labelKey: 'blkRule',
    descKey: 'blkRuleDesc',
    fields: NONE,
    icon: 'M4 12h16',
    tint: 'sf',
  },
}

/** A block as the builder holds it, before it is a row. */
export type BlockDraft = {
  /** Client-side until saved. */
  id: string
  type: BlockType
  title: string
  body: string
  caption: string
  url: string
  /** The opaque Storage key, written by the upload action and never typed. */
  mediaKey: string | null
}

/**
 * ── D233 — THE SEEDS, AND THE ONE SENTENCE THAT DOES NOT SHIP ─────────────
 *
 * v7 prefills a new block (`blockSeed`, v7:6869-6881), and that is a real
 * feature rather than placeholder text: the palette's own description of a
 * section is «Starter en ny del med egen tittel og innledning», so an editor
 * who adds one gets a draft to edit rather than two empty boxes. The copy is
 * the drawing's, verbatim, and it lives in `messages/*.json` because it is
 * user-facing text.
 *
 * **ONE SEED IS REFUSED, AND IT IS THE `info` BLOCK'S SECOND CLAUSE.** v7:6871
 * reads: «Svarene brukes til å forbedre arbeidsmiljøet. **Ingen ser hva du har
 * svart alene — resultatene vises bare samlet.**»
 *
 * The second sentence is a promise the block cannot keep, and it is false in
 * three reachable states of this product rather than one:
 *
 *  - **A NAMED survey.** `anonymity = 'named'` is a shipped mode; the manager
 *    sees who answered what, by design, and the respondent is told so by the
 *    anonymity sheet.
 *  - **A COMMENT.** `survey_comments` carries `invitation_id` when the
 *    feedback mode is named or the respondent chooses to be named (C3, QR-2) —
 *    which is exactly the thing that makes a reply possible.
 *  - **QUIZ MODE.** `app.guard_quiz_policy` REQUIRES named answers, so a quiz
 *    is structurally the opposite of what the sentence says.
 *
 * **And the promise is already made, correctly, somewhere else.**
 * `anonymityPromise` (`lib/respondent/anonymity-promise.ts`) derives it from
 * the survey's own mode and threshold, which is why it is true on every one of
 * them. A block repeating it in fixed words is a SECOND answer to a question
 * that has one — and the second one cannot be told it is wrong.
 *
 * So the seed keeps the first sentence, which is true of every mode, and drops
 * the second. An editor who wants to say something about anonymity can still
 * type it; what does not happen is the product putting a false promise in her
 * mouth by default. **A fixture that ships a false promise is worse than copy
 * that does, because nobody reads a seed** — it arrives pre-approved, in a box
 * that already has words in it, on the surface where the person reading was
 * promised something.
 */
export type BlockSeed = { titleKey?: string; bodyKey?: string; captionKey?: string; url?: string }

export const BLOCK_SEEDS: Record<BlockType, BlockSeed> = {
  section: { titleKey: 'seedSectionTitle', bodyKey: 'seedSectionBody' },
  // `seedInfoBody` is v7:6871's FIRST sentence only. See D233 above.
  info: { titleKey: 'seedInfoTitle', bodyKey: 'seedInfoBody' },
  img: { titleKey: 'seedImgTitle', captionKey: 'seedImgCaption' },
  video: { titleKey: 'seedVideoTitle', captionKey: 'seedVideoCaption', url: 'https://' },
  fact: { titleKey: 'seedFactTitle', bodyKey: 'seedFactBody' },
  rule: {},
}

export function newBlock(type: BlockType, id: string): BlockDraft {
  return { id, type, title: '', body: '', caption: '', url: '', mediaKey: null }
}

/**
 * A new block WITH the drawing's prefill. `say` resolves a `builder.*` key, so
 * the seed is translated rather than Norwegian-in-the-registry — Q129's shape,
 * which `verify:i18n` can only see when the string collides with a message it
 * already holds.
 */
export function seededBlock(
  type: BlockType,
  id: string,
  say: (key: string) => string,
): BlockDraft {
  const seed = BLOCK_SEEDS[type]
  const fields = BLOCKS[type].fields
  return {
    ...newBlock(type, id),
    title: fields.title && seed.titleKey ? say(seed.titleKey) : '',
    body: fields.body && seed.bodyKey ? say(seed.bodyKey) : '',
    caption: fields.caption && seed.captionKey ? say(seed.captionKey) : '',
    url: fields.url && seed.url ? seed.url : '',
  }
}

/**
 * The fields a type does not use are cleared on the way to the database, not
 * merely hidden.
 *
 * Hiding alone would keep a `url` on a block whose type changed from `video` to
 * `info`, and `survey_blocks_url_is_video` would then refuse the save — with
 * the symptom appearing at SAVE time, on a field the editor cannot see. The
 * CHECK is right and the editor has to agree with it before it gets there.
 */
export function forStorage(b: BlockDraft): {
  type: BlockType
  title: string | null
  body: string | null
  caption: string | null
  url: string | null
  media_key: string | null
} {
  const f = BLOCKS[b.type].fields
  const keep = (on: boolean, v: string) => (on && v.trim() !== '' ? v.trim() : null)
  return {
    type: b.type,
    title: keep(f.title, b.title),
    body: keep(f.body, b.body),
    caption: keep(f.caption, b.caption),
    url: keep(f.url, b.url),
    media_key: f.media ? b.mediaKey : null,
  }
}

/**
 * ── ONE ORDER OVER TWO KINDS ──────────────────────────────────────────────
 *
 * The builder holds questions and blocks as ONE list, because that is what the
 * editor manipulates and what `position` means. This is the only place that
 * knows how to take such a list apart again, so the save path cannot invent a
 * second answer to «what position is this».
 *
 * `position` is assigned from the list INDEX, over both kinds together. That is
 * what `app.guard_flow_position` (M:0127) enforces from the other side: two
 * tables, one order space, and a collision refused at COMMIT rather than
 * mid-renumber.
 */
export type FlowItem<Q> = { kind: 'question'; item: Q } | { kind: 'block'; item: BlockDraft }

export function splitFlow<Q>(flow: FlowItem<Q>[]): {
  questions: { item: Q; position: number }[]
  blocks: { item: BlockDraft; position: number }[]
} {
  const questions: { item: Q; position: number }[] = []
  const blocks: { item: BlockDraft; position: number }[] = []
  flow.forEach((entry, position) => {
    if (entry.kind === 'question') questions.push({ item: entry.item, position })
    else blocks.push({ item: entry.item, position })
  })
  return { questions, blocks }
}

/** Move the item at `from` to `to`, returning a new list. */
export function moveInFlow<T>(flow: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= flow.length || to >= flow.length) return flow
  const next = flow.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

/**
 * ── THE FLOW, DERIVED FROM TWO LISTS, AND THE ONLY PLACE THAT KNOWS HOW ───
 *
 * The Builder keeps the questions in their own array — every existing operation
 * (add, remove, change type, edit config) indexes it, and rewriting all of that
 * to walk a mixed list would be a large change with real regression risk in a
 * phase that has two passes.
 *
 * So blocks carry their FLOW position and the mixed list is derived. The
 * derivation is total and has no ties: walk the slots `0 … n-1`; if a block
 * claims a slot, it takes it, otherwise the next unplaced question does. A
 * block whose stored position is past the end, or two blocks claiming one slot
 * after a hand-edited row, cannot wedge it — the leftovers are appended in
 * order rather than dropped, because losing a block is worse than moving one.
 *
 * **This is the function the database's `app.guard_flow_position` is the other
 * half of.** It decides the order; the deferred trigger refuses a stored state
 * that contradicts it.
 */
export function buildFlow<Q>(
  questions: Q[],
  blocks: (BlockDraft & { position: number })[],
): FlowItem<Q>[] {
  const claimed = new Map<number, (BlockDraft & { position: number })[]>()
  for (const b of blocks) {
    const at = claimed.get(b.position)
    if (at) at.push(b)
    else claimed.set(b.position, [b])
  }
  const total = questions.length + blocks.length
  const out: FlowItem<Q>[] = []
  const placed = new Set<string>()
  let qi = 0
  for (let slot = 0; slot < total; slot++) {
    const here = claimed.get(slot)
    if (here && here.length) {
      const b = here.shift()!
      placed.add(b.id)
      out.push({ kind: 'block', item: b })
      continue
    }
    if (qi < questions.length) {
      out.push({ kind: 'question', item: questions[qi++]! })
      continue
    }
    break
  }
  // Anything a contradictory stored state left out — a position past the end,
  // or a duplicate slot — goes on the end rather than disappearing.
  for (const b of blocks) if (!placed.has(b.id)) out.push({ kind: 'block', item: b })
  while (qi < questions.length) out.push({ kind: 'question', item: questions[qi++]! })
  return out
}

/** The inverse: a flow back into the two lists the Builder and the save hold. */
export function flowToLists<Q>(flow: FlowItem<Q>[]): {
  questions: Q[]
  blocks: (BlockDraft & { position: number })[]
} {
  const questions: Q[] = []
  const blocks: (BlockDraft & { position: number })[] = []
  flow.forEach((entry, position) => {
    if (entry.kind === 'question') questions.push(entry.item)
    else blocks.push({ ...entry.item, position })
  })
  return { questions, blocks }
}

/**
 * ── WHAT THE FLOW IS MADE OF — one derivation, three counts ────────────────
 *
 * v7's `bFlowChips` (v7:10217) draws «Spørsmål N · Innhold N · Seksjoner N»
 * above the flow, which is the drawing answering a question the builder only
 * acquired when the flow gained a second kind of member: *what is in here?*
 *
 * ── «Seksjoner» SHIPS ITS REAL COUNT, INCLUDING ZERO ──────────────────────
 *
 * The bundle's own expression is `String(secs || 1)`, so a survey with no
 * section block draws **«1 Seksjoner»**. That is a fabricated value in the
 * sense CLAUDE.md names: indistinguishable from a real one in review, and it
 * survives into a screenshot as though it were true. The floor is dropped and
 * the chip states what is there (Q241).
 *
 * Derived here rather than counted at the call site, because three counts over
 * two kinds is exactly the arithmetic F1's defect was made of, and a screen
 * that counts for itself is a second answer waiting to disagree.
 */
export type FlowCounts = { questions: number; blocks: number; sections: number }

export function flowCounts<Q>(flow: FlowItem<Q>[]): FlowCounts {
  let questions = 0, blocks = 0, sections = 0
  for (const entry of flow) {
    if (entry.kind === 'question') { questions++; continue }
    blocks++
    if (entry.item.type === 'section') sections++
  }
  return { questions, blocks, sections }
}
