import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, serviceClient, type Client } from './clients'
import { createOrg, createSurvey, dropOrg } from './factories'
import { PERSONAS } from './personas'

/**
 * V7-3 — content blocks, and the properties two tables buy that one would not.
 *
 * ── WHAT THESE ARE ACTUALLY TESTING ───────────────────────────────────────
 *
 * The measurement that chose the schema is `docs/v7/02-blocks-measurement.md`:
 * eleven of the fifteen SQL functions that read `survey_questions` reach it
 * through `answers.question_id`, so **a row nobody can answer is a row they
 * never see**. Putting blocks in their own table extends that immunity to the
 * rest for free; putting them in `survey_questions` would have converted it
 * into eleven filters somebody has to remember.
 *
 * So the first tests here are not «the feature works». They are **«the wrong
 * thing cannot be expressed»**, which is a different and stronger claim, and
 * the reason to write them first is that they are the ones that would quietly
 * stop being true under the other schema.
 *
 * Tests 1-3 are the structural half. 4-7 are the order across two tables.
 * 8-10 are `send_round`. 11-13 are the CHECKs and the freeze.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

/** Runs SQL that is EXPECTED to fail, and returns the error text. */
function psqlErr(query: string): string {
  try {
    execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-tAc', query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    const err = e as { stderr?: string | Buffer; message?: string }
    return String(err.stderr ?? err.message ?? '')
  }
  return ''
}

const TAG = `v73-${randomUUID().slice(0, 8)}`
const ORG = `Blokk ${TAG}`

const svc: Client = serviceClient()
const anon: Client = anonClient()
let admin: Client

let orgId = ''
let surveyId = ''
let emptyId = ''
let questionId = ''

beforeAll(async () => {
  /* The administrator persona is a MEMBER of this fixture org, because
     `send_round` resolves authority from `app.can_edit_survey` and a psql
     session has no `auth.uid()` at all — it answers `forbidden`, which reads
     exactly like a broken function. */
  const org = await createOrg(ORG, [
    { email: PERSONAS.administrator.email, role: 'administrator' },
  ])
  orgId = org.id
  admin = await adminClient()
  const survey = await createSurvey(orgId, `Med innhold ${TAG}`, [
    { type: 'scale', text: 'Hvordan har uken vært?' },
    { type: 'text', text: 'Hva bør vi endre?' },
  ])
  surveyId = survey.id
  // A survey with blocks and NO questions — the case one table would have let
  // through `send_round`'s emptiness guard.
  const empty = await createSurvey(orgId, `Bare innhold ${TAG}`, [])
  emptyId = empty.id

  questionId = psql(
    `select id from public.survey_questions where survey_id = '${surveyId}' order by position limit 1`,
  )[0]![0]!
}, 60_000)

afterAll(async () => {
  await dropOrg(ORG, svc)
}, 60_000)

describe('V7-3 — survey_blocks', () => {
  it('1. AN ANSWER AGAINST A BLOCK IS UNREPRESENTABLE, not merely refused', () => {
    /* The whole argument for two tables, stated as a test. `answers.question_id`
       references `survey_questions`, so a block id has no target there — this
       fails on the FOREIGN KEY, not on a trigger somebody wrote and a later
       migration could drop. Under one table it would have been expressible and
       only a guard would have stood between a block and an answer row. */
    psql(
      `insert into public.survey_blocks (survey_id, position, type, title, body)
       values ('${surveyId}', 50, 'info', 'Før du begynner', 'Litt bakgrunn.')`,
    )
    const blockId = psql(
      `select id from public.survey_blocks where survey_id = '${surveyId}' and position = 50`,
    )[0]![0]!

    const err = psqlErr(
      `insert into public.answers (response_id, question_id, value)
       values (gen_random_uuid(), '${blockId}', '"3"'::jsonb)`,
    )
    expect(err).toMatch(/foreign key|violates/i)
    // And the reason it is structural: the FK names survey_questions.
    const fk = psql(
      `select confrelid::regclass::text from pg_constraint
        where conname = 'answers_question_id_fkey'`,
    )
    expect(fk[0]![0]).toBe('survey_questions')
  })

  it('2. the eleven answer-joined functions cannot see a block — the immunity, measured', () => {
    /* Not «we filtered them»: they join through `answers.question_id`, which
       test 1 has just shown cannot name a block. Asserted over the CATALOGUE
       rather than over a list of function names somebody typed, so a twelfth
       function written tomorrow is covered by the same property. */
    const joined = psql(
      `select n.nspname || '.' || p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and pg_get_functiondef(p.oid) like '%survey_questions%'
          and pg_get_functiondef(p.oid) like '%a.question_id%'
        order by 1`,
    ).map((r) => r[0]!)
    // A derivation that finds nothing looks identical to a product that has
    // nothing; the floor is what tells them apart.
    expect(joined.length).toBeGreaterThan(5)
    expect(joined).toContain('public.dashboard_summary')
    expect(joined).toContain('public.get_trends')
  })

  it('3. RLS — an outsider and anon read nothing, and anon has no grant at all', async () => {
    const { data: asAnon } = await anon.from('survey_blocks').select('id').eq('survey_id', surveyId)
    expect(asAnon ?? []).toHaveLength(0)

    /* A GRANT IS A FACT ABOUT THE CATALOGUE AND MUST BE READ BACK FROM THE
       CATALOGUE — `revoke … from public` alone leaves the grant anon INHERITS
       from PUBLIC standing, which M:0013 found and M:0101/M:0102 reproduced. */
    const priv = psql(
      `select has_table_privilege('anon', 'public.survey_blocks', 'select')::text`,
    )
    expect(priv[0]![0]).toBe('false')

    const rls = psql(
      `select relrowsecurity::text from pg_class where oid = 'public.survey_blocks'::regclass`,
    )
    expect(rls[0]![0]).toBe('true')
  })

  it('4. ONE ORDER ACROSS TWO TABLES — a block may not take a question’s position', () => {
    const pos = psql(
      `select position from public.survey_questions where id = '${questionId}'`,
    )[0]![0]!
    const err = psqlErr(
      `insert into public.survey_blocks (survey_id, position, type, title)
       values ('${surveyId}', ${pos}, 'section', 'Kollisjon')`,
    )
    expect(err).toMatch(/one order|flow position/i)
  })

  it('5. …and a question may not take a block’s, which is the other half of the pair', () => {
    /* Guarding one direction is guarding one transition, not the state — the
       shape V2-9 recorded when `guard_run_mode_anonymous` watched the column
       the user happened to touch. */
    const err = psqlErr(
      `update public.survey_questions set position = 50 where id = '${questionId}'`,
    )
    expect(err).toMatch(/one order|flow position/i)
  })

  it('6. the guard is DEFERRED, so a renumber through negative positions commits', () => {
    /* `saveDraft` writes every row to a temporary NEGATIVE position and then to
       its real one, precisely so a reorder never collides mid-flight. An
       immediate check would refuse the intermediate state and the symptom would
       be a save that fails on a reorder — far from the trigger, which is how
       this project has met the same shape nine times. */
    /* Derived, not assumed: the factory does not number from zero, and the
       first version of this test did — «a constant copied from a working
       context carries its context's assumptions invisibly», one floor down. */
    const qs = psql(
      `select id from public.survey_questions where survey_id = '${surveyId}' order by position`,
    ).map((r) => r[0]!)
    const err = psqlErr(`
      begin;
        update public.survey_questions set position = -position - 1 where survey_id = '${surveyId}';
        update public.survey_blocks    set position = -position - 1 where survey_id = '${surveyId}';
        -- the block takes 0, the questions follow it in their old order
        update public.survey_blocks    set position = 0 where survey_id = '${surveyId}';
        update public.survey_questions set position = 1 where id = '${qs[0]}';
        update public.survey_questions set position = 2 where id = '${qs[1]}';
      commit;`)
    expect(err).toBe('')

    const flow = psql(
      `select position::text, 'block' from public.survey_blocks where survey_id = '${surveyId}'
       union all
       select position::text, 'question' from public.survey_questions where survey_id = '${surveyId}'
       order by 1`,
    )
    expect(flow.map((r) => `${r[1]}@${r[0]}`).join(' ')).toBe('block@0 question@1 question@2')
  })

  it('7. positions are unique WITHIN the block table too', () => {
    const err = psqlErr(`
      begin;
        insert into public.survey_blocks (survey_id, position, type) values ('${surveyId}', 9, 'rule');
        insert into public.survey_blocks (survey_id, position, type) values ('${surveyId}', 9, 'rule');
      commit;`)
    expect(err).toMatch(/duplicate key|unique/i)
  })

  it('8. send_round refuses a survey of blocks and NO questions', async () => {
    /* The defect that exists only in the one-table shape: the guard read
       `jsonb_array_length(v_snapshot) = 0`, which meant «no questions» only
       while the snapshot held nothing else. The error's NAME was already
       `no_questions`; this is the implementation catching up with it. */
    psql(
      `insert into public.survey_blocks (survey_id, position, type, title, body)
       values ('${emptyId}', 0, 'info', 'Bare tekst', 'Ingen spørsmål her.')`,
    )
    const { data } = await admin.rpc('send_round', {
      p_survey: emptyId,
      p_channels: ['link'],
    })
    expect(JSON.stringify(data)).toContain('no_questions')
  })

  it('9. the snapshot carries the blocks, tagged, in FLOW order', async () => {
    const { data } = await admin.rpc('send_round', {
      p_survey: surveyId,
      p_channels: ['link'],
    })
    expect(JSON.stringify(data)).not.toContain('error')

    const snap = psql(
      `select jsonb_agg(e->>'kind' order by (e->>'position')::int)::text
         from public.survey_rounds r,
              lateral jsonb_array_elements(r.question_snapshot) e
        where r.survey_id = '${surveyId}'`,
    )[0]![0]!
    // Test 6 left the flow as block, question, question.
    expect(JSON.parse(snap)).toEqual(['block', 'question', 'question'])
  })

  it('10. a block in the snapshot carries its own fields and no question fields', () => {
    const row = psql(
      `select e::text from public.survey_rounds r,
              lateral jsonb_array_elements(r.question_snapshot) e
        where r.survey_id = '${surveyId}' and e->>'kind' = 'block' limit 1`,
    )[0]![0]!
    const block = JSON.parse(row) as Record<string, unknown>
    expect(block['type']).toBe('info')
    expect(block['title']).toBe('Før du begynner')
    // A block has no `required`, no `comment_mode`, no `config` — the columns a
    // one-table row would have carried as dead weight, and which a renderer
    // could then have read as meaningful.
    for (const k of ['required', 'comment_mode', 'config', 'follow_up_on_low']) {
      expect(block, k).not.toHaveProperty(k)
    }
  })

  it('11. a Skillelinje carries no text, and url/media_key belong to one type each', () => {
    expect(
      psqlErr(
        `insert into public.survey_blocks (survey_id, position, type, title)
         values ('${emptyId}', 20, 'rule', 'Ikke lov')`,
      ),
    ).toMatch(/survey_blocks_rule_is_empty/)
    expect(
      psqlErr(
        `insert into public.survey_blocks (survey_id, position, type, url)
         values ('${emptyId}', 21, 'info', 'https://x.test')`,
      ),
    ).toMatch(/survey_blocks_url_is_video/)
    expect(
      psqlErr(
        `insert into public.survey_blocks (survey_id, position, type, media_key)
         values ('${emptyId}', 22, 'video', 'abc')`,
      ),
    ).toMatch(/survey_blocks_media_is_img/)
  })

  it('12. blocks are FROZEN after send, exactly as the questions are', () => {
    // Test 9 opened a round on `surveyId`.
    const err = psqlErr(
      `update public.survey_blocks set title = 'Endret' where survey_id = '${surveyId}'`,
    )
    expect(err).toMatch(/frozen/i)
    // And the message speaks for both tables now, because it has two callers.
    expect(err).toMatch(/content blocks/i)
  })

  it('13. run_due_schedules opens no round for a survey with no questions', () => {
    /* Measured while rewriting the function: nothing here stopped a scheduled
       survey with zero questions from opening an EMPTY round and mailing every
       recipient a link to it. `send_round` has refused that since Phase 3 and
       this path never did — the same class, on the silent job. */
    /* `psql()` returns ONE ROW PER LINE, so `[0][0]` on a function definition is
       its CREATE line and nothing else — which matches no body regex and looks
       exactly like a missing patch. Joined, not indexed. */
    const body = psql(
      `select pg_get_functiondef(p.oid) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where p.proname = 'run_due_schedules' and n.nspname = 'app'`,
    )
      .map((r) => r.join('\t'))
      .join('\n')
    expect(body).toMatch(/jsonb_array_length\(v_qs\) = 0/)
    // Rotation is over the QUESTIONS; the blocks always ride along.
    expect(body).toMatch(/rotate_questions and jsonb_array_length\(v_qs\) > 3/)
  })
})
