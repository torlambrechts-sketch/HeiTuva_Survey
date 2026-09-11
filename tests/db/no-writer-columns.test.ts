import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * S3 item 2 — the standing question is answered in writing, for all ten.
 *
 * CLAUDE.md: *«ASK «WHO WRITES THIS COLUMN?» IN THE MIGRATION THAT ADDS IT.
 * Not when something looks wrong later — then, in writing, beside the column.»*
 * Audit `A7a-11` measured how that was going: **fifteen of the sixteen
 * no-writer columns carried no column comment at all**, which is precisely the
 * thing the standing question asks for.
 *
 * ── WHAT THIS TEST CAN AND CANNOT BE ──────────────────────────────────────
 *
 * The property one would want is «every column with no writer says so». That is
 * not derivable from the catalogue: «has a writer» is a fact about application
 * code, and deriving it is what the audit spent two independent probes on.
 *
 * So this is an ENUMERATION, and — following CLAUDE.md's own rule about them —
 * it says what it is an enumeration OF: the ten columns the 2026-09-09 audit
 * identified as having no writer, or none outside the demo seed. It is not the
 * set of all such columns and does not claim to be. What it buys is that these
 * ten cannot silently lose their answer, and that the answer keeps the one
 * shape a reader can grep for.
 *
 * The eleventh, when it is found, is added here by the phase that finds it. The
 * test that would catch the eleventh by itself does not exist and cannot be
 * written from the database alone; that limitation is recorded in
 * docs/DEVIATIONS.md D130 rather than papered over.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

/** The audit's no-writer set (01-database.md § 1.3 and § 1.5, A7a/A7b). */
const NO_WRITER_SET: [table: string, column: string][] = [
  ['org_members', 'group_id'],
  ['duties', 'next_due_at'],
  ['surveys', 'run_mode'],
  ['survey_invitations', 'bounced_at'],
  ['groups', 'lead_member_id'],
  ['report_shares', 'expires_at'],
  ['live_sessions', 'created_by'],
  ['tasks', 'due_at'],
  ['organizations', 'timezone'],
  // C1's four, added by the phase that created them rather than by an audit
  // later — which is the whole point of the standing question. Each names the
  // phase that gives it a writer, and THAT PHASE REMOVES IT FROM THIS LIST.
  // A column here is not a defect; a column here that nobody notices is.
  // `surveys.feedback_mode` was here for exactly one phase. C2 gave it
  // `setFeedbackMode`, so it LEFT this list in the commit that wrote the action
  // — which is what «giving a column a writer is a visible act» means.
]

/*
  C4 and C5 both landed their writers in the same tranche, so all three of the
  columns declared here in C1 left the list at once:

    survey_comments.handled_at      -> public.set_comment_handled  (M:0101)
    survey_comments.handled_by      -> the same function
    survey_comment_replies.author_member_id -> public.reply_to_comment (M:0102)

  Recorded rather than silently removed: a column leaving this list is the
  visible act, and three leaving together is the thing a reader would otherwise
  have to reconstruct from two migrations.
*/

function commentOf(table: string, column: string): string | null {
  const rows = psql(`
    select coalesce(d.description, '')
      from pg_attribute a
      join pg_class t on t.oid = a.attrelid
      join pg_namespace n on n.oid = t.relnamespace
      left join pg_description d on d.objoid = a.attrelid and d.objsubid = a.attnum
     where n.nspname = 'public' and t.relname = '${table}' and a.attname = '${column}'`)
  if (!rows.length) return null
  return rows[0]?.[0] ?? ''
}

describe('every column the audit found without a writer answers the question', () => {
  for (const [table, column] of NO_WRITER_SET) {
    it(`${table}.${column} says who writes it`, () => {
      const comment = commentOf(table, column)
      expect(comment, `${table}.${column} does not exist — the set is stale`).not.toBeNull()
      expect(
        comment,
        `${table}.${column} has no column comment. CLAUDE.md asks the question ` +
          `IN WRITING, BESIDE THE COLUMN, and this is the column.`,
      ).not.toBe('')
      expect(
        comment,
        `${table}.${column} has a comment but does not answer «who writes this ` +
          `column?» — a comment about what the column MEANS is what all fifteen ` +
          `of the audit's silent columns would have had.`,
      ).toContain('WHO WRITES IT')
    })
  }

  /**
   * THE ANSWER HAS THREE VALUES, NOT TWO — which the first version of this
   * assertion got wrong, by testing `!includes('NOTHING')` and counting
   * «written only by the demo seed» as «has a writer». That is the exact
   * confusion the standing question exists to remove: a column the seed fills
   * looks written from every angle except a real organisation's.
   */
  const answerOf = (t: string, c: string) => {
    const comment = commentOf(t, c) ?? ''
    if (comment.includes('only scripts/seed-demo.ts')) return 'seed-only'
    if (comment.includes('NOTHING')) return 'nothing'
    return 'product'
  }

  it('the columns with a product writer each name their action', () => {
    const product = NO_WRITER_SET.filter(([t, c]) => answerOf(t, c) === 'product')
    // If a later phase gives a second column a writer, this list moves with it —
    // deliberately, so that giving a column a writer is a visible act.
    expect(product.map(([t, c]) => `${t}.${c}`).sort()).toEqual([
      'org_members.group_id',
      // Q50, given a writer 2026-09-10 by M:0097 — the fifth instance of the
      // standing question and the fourth where the column existed and was read.
      'organizations.timezone',
    ])
    expect(commentOf('org_members', 'group_id')).toContain('setMemberGroup')
    expect(commentOf('organizations', 'timezone')).toContain('saveCompany')
  })

  it('one is written by the demo seed and by nothing else', () => {
    const seedOnly = NO_WRITER_SET.filter(([t, c]) => answerOf(t, c) === 'seed-only')
      .map(([t, c]) => `${t}.${c}`)
      .sort()
    // CLAUDE.md's sentence, word for word: «A COLUMN WHOSE ONLY WRITER IS THE
    // SEED IS EXACTLY THE FINDING». Recorded as that rather than filed with the
    // columns nothing writes at all.
    //
    // `live_sessions.step` was the second, and left this set by being DROPPED
    // (M:0098, D136/D139) rather than by gaining a writer: the state its seeded
    // value described — a position between questions — is one the product
    // cannot be in. A column can leave the no-writer set in two ways, and this
    // is the first time it happened by deletion.
    expect(seedOnly).toEqual(['tasks.due_at'])
  })

  it('the remaining six are written by nothing at all', () => {
    const nothing = NO_WRITER_SET.filter(([t, c]) => answerOf(t, c) === 'nothing')
    // Seven until 2026-09-10; organizations.timezone left this group when
    // M:0097 gave it saveCompany. The number moves DOWN as writers arrive, and
    // a phase that adds a writer without moving it fails here.
    // Six, and it went 6 -> 10 -> 6 inside one tranche: C1 declared four columns
    // ahead of their actions (database before UI, deliberately), and C2, C4 and
    // C5 gave all four a writer. The number moves DOWN as writers arrive and UP
    // only when a migration creates a column ahead of its action.
    expect(nothing).toHaveLength(6)
  })
})
