import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, outsiderClient, serviceClient, type Client } from './clients'
import { writesValidatedColumn } from './factories'

/**
 * W0 — the workspace model. DECISIONS Q119 (the tooltip's third clause is not
 * built), Q122 (org default is a column, per-person choice is a cookie),
 * Q124 (bind the dashboard preset by key, not by title).
 *
 * ── WHY EVERY NEGATIVE TEST HERE ASSERTS NON-VACUITY FIRST ─────────────────
 *
 * D158: four of C1's negative tests PASSED against a database with none of the
 * feature in it — each asserted over an empty result, so `JSON.stringify(null)`
 * was `"null"`, a loop ran zero times, `[]` equalled `[]`. This session has no
 * Docker, so **none of these tests could be proven red locally before the
 * schema existed**; CI is the first thing that runs them. That makes the
 * non-vacuity guard the only protection against the D158 shape, so every test
 * below establishes that the thing it is about EXISTS before asserting what is
 * true of it.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

let svc: Client
let outsider: Client
let anon: Client

beforeAll(async () => {
  svc = serviceClient()
  ;[outsider, anon] = [await outsiderClient(), anonClient()]
})

describe('W0 · the registries exist and are shaped as registries', () => {
  it('seeds four workspaces and six modules', async () => {
    const { data: ws } = await svc.from('workspaces').select('key').order('sort_order')
    const { data: mods } = await svc.from('workspace_modules').select('key')
    expect(ws?.map((w) => w.key)).toEqual(['hr', 'cx', 'quiz', 'custom'])
    expect(mods).toHaveLength(6)
  })

  it('every workspace carries a complete vocabulary — no blank grammar', async () => {
    const { data } = await svc.from('workspaces').select('key, person, person_def, persons')
    // NON-VACUITY: an empty table would make the loop below assert nothing.
    expect(data!.length).toBeGreaterThan(0)
    for (const w of data!) {
      expect(w.person.trim(), `${w.key}.person`).not.toBe('')
      expect(w.person_def.trim(), `${w.key}.person_def`).not.toBe('')
      expect(w.persons.trim(), `${w.key}.persons`).not.toBe('')
    }
  })

  it('every workspace shows at least one module', async () => {
    const rows = psql(`
      select w.key, count(l.module_key)
        from public.workspaces w
        left join public.workspace_module_links l on l.workspace_key = w.key
       group by w.key`)
    expect(rows.length).toBe(4)
    for (const [key, n] of rows) expect(Number(n), `${key} has modules`).toBeGreaterThan(0)
  })
})

describe('W0 · Q124 — the preset binding is by key, and the presets exist', () => {
  it('every non-null preset_key resolves, and at least three are non-null', async () => {
    const rows = psql(`
      select w.key, w.preset_key, p.title
        from public.workspaces w
        left join public.dashboard_presets p on p.key = w.preset_key
       where w.preset_key is not null`)
    // NON-VACUITY: `where preset_key is not null` returning nothing would make
    // the resolution check below pass over an empty set. The bundle names three.
    expect(rows.length).toBeGreaterThanOrEqual(3)
    for (const [wsKey, presetKey, title] of rows) {
      expect(title, `${wsKey} -> ${presetKey} resolves to a shipped preset`).toBeTruthy()
    }
  })

  it('the three titles the bundle names are the ones that resolve', async () => {
    const rows = psql(`
      select w.key, p.title
        from public.workspaces w
        join public.dashboard_presets p on p.key = w.preset_key
       order by w.sort_order`)
    expect(rows).toEqual([
      ['hr', 'Arbeidsmiljø'],
      ['cx', 'Kundeopplevelse'],
      ['quiz', 'Medlem og frivillig'],
    ])
  })

  it('Tilpasset has no preset — it renders the other sentence', async () => {
    const { data } = await svc.from('workspaces').select('preset_key').eq('key', 'custom').single()
    expect(data).not.toBeNull()
    expect(data!.preset_key).toBeNull()
  })
})

describe('W0 · Q119 — the workspace writes no survey defaults', () => {
  /**
   * The decision as a test. Q119 removed the tooltip's third clause because a
   * statutory pack's policy is a LOCK (M:0032:96) and a workspace is a
   * PREFERENCE — so a `default_*` column here would be a second writer of
   * columns the pack already owns, racing it in exactly the case the HR
   * workspace exists for.
   *
   * Stated as a PROPERTY of the table rather than as a list of column names I
   * decided not to add, so a later phase that adds one fails here.
   */
  it('the workspaces table has no column that could be a survey default', () => {
    const cols = psql(`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'workspaces'`).map((r) => r[0]!)
    expect(cols.length).toBeGreaterThan(0)
    const offenders = cols.filter((c) =>
      /default|threshold|anonym|policy|pack|k_for|retention/i.test(c),
    )
    expect(offenders, 'Q119: a workspace is a preference, not a writer of survey policy').toEqual([])
  })
})

describe('W0 · Q122 — the org default is a column with a writer, the choice is not', () => {
  it('organizations.workspace is NOT NULL and defaults to hr', () => {
    const rows = psql(`
      select is_nullable, column_default from information_schema.columns
       where table_schema='public' and table_name='organizations' and column_name='workspace'`)
    expect(rows.length, 'the column exists').toBe(1)
    expect(rows[0]![0]).toBe('NO')
    expect(rows[0]![1]).toMatch(/'hr'/)
  })

  it('refuses an unknown workspace key', async () => {
    const { data: org } = await svc.from('organizations').select('id').limit(1).single()
    // NON-VACUITY: with no organisation there is nothing to refuse, and the
    // error below would be about the missing row rather than the key.
    expect(org?.id).toBeTruthy()
    const { error } = await svc
      .from('organizations')
      .update({ workspace: 'ikke-en-arbeidsflate' })
      .eq('id', org!.id)
    expect(error, 'the foreign key refuses an unknown workspace').not.toBeNull()
  })

  it('SAVECOMPANY IS THE WRITER — the standing question, asserted', () => {
    const src = readFileSync('app/(app)/administrasjon/actions.ts', 'utf8')
    const r = writesValidatedColumn(src, 'saveCompany', 'workspace')
    expect(r.writes, 'saveCompany writes organizations.workspace').toBe(true)
    expect(r.validated, 'the value came through the Zod boundary').toBe(true)
    expect(r.literal, 'and is not a hard-coded literal').toBe(false)
  })

  it('THE PER-PERSON CHOICE IS NOT A COLUMN — no workspace column on org_members', () => {
    const rows = psql(`
      select column_name from information_schema.columns
       where table_schema='public' and table_name='org_members'`)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r[0]).filter((c) => /workspace/i.test(c!))).toEqual([])
  })
})

describe('W0 · the registries are public by design, and that claim is CHECKED', () => {
  const TABLES = [
    'workspaces',
    'workspace_modules',
    'workspace_module_links',
    'workspace_use_case_lifts',
  ] as const

  it.each(TABLES)('%s carries no org id, no survey id and no number', (table) => {
    const cols = psql(`
      select column_name from information_schema.columns
       where table_schema='public' and table_name='${table}'`).map((r) => r[0]!)
    expect(cols.length, `${table} exists`).toBeGreaterThan(0)
    expect(
      cols.filter((c) => /org|survey|count|threshold|total/i.test(c)),
      `${table}: the 5a3 allowlist reason, checked rather than trusted`,
    ).toEqual([])
  })

  it.each(TABLES)('%s has RLS enabled', (table) => {
    const rows = psql(`
      select relrowsecurity from pg_class
       where oid = 'public.${table}'::regclass`)
    expect(rows.length).toBe(1)
    expect(rows[0]![0]).toBe('t')
  })

  it.each(TABLES)('an outsider and anon can both READ %s — it is a shipped registry', async (table) => {
    const a = await outsider.from(table).select('*')
    const b = await anon.from(table).select('*')
    expect(a.error, `${table}: outsider read`).toBeNull()
    expect(b.error, `${table}: anon read`).toBeNull()
    // NON-VACUITY: a table nobody seeded would return [] with no error, which
    // says nothing about the policy. The rows are the point.
    expect(a.data!.length, `${table} is seeded`).toBeGreaterThan(0)
    expect(b.data!.length).toBe(a.data!.length)
  })

  /**
   * NOBODY MAY WRITE, ASSERTED FROM THE CATALOGUE RATHER THAN BY ATTEMPTING A ROW.
   *
   * The first version of this test did `select('key')` and then tried to insert
   * `{ key: 'smugled' }` — `key` is a column on two of these three tables, and
   * `workspace_module_links` is keyed `(workspace_key, module_key)`. So the
   * setup read failed, and CI's very first run of this suite caught it.
   *
   * WHAT THE NON-VACUITY GUARD BOUGHT, because this is the whole argument for
   * it: the insert would have been refused anyway — for the wrong reason, an
   * unknown column rather than a missing policy — and the test would have
   * PASSED while proving nothing. That is D158's shape exactly, and with no
   * Docker here there was no red-first run to catch it instead.
   *
   * So the rewrite states the property rather than a better-chosen row: **no
   * policy on these tables permits anything but SELECT.** It is catalogue-
   * derived, it is uniform across the three tables, and it does not depend on
   * knowing the shape of a row — which is the thing I got wrong.
   */
  it.each(TABLES)('no policy on %s permits anything but SELECT', (table) => {
    const rows = psql(`
      select polname, case polcmd
               when 'r' then 'SELECT' when 'a' then 'INSERT'
               when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end
        from pg_policy where polrelid = 'public.${table}'::regclass`)
    // NON-VACUITY: a table with NO policy at all would also return [], and that
    // is a different state — RLS on with no policy denies everything, which
    // would be a registry nobody can read.
    expect(rows.length, `${table} has at least one policy`).toBeGreaterThan(0)
    expect(
      rows.filter((r) => r[1] !== 'SELECT'),
      `${table}: a shipped registry a client could write is a registry a client could poison`,
    ).toEqual([])
  })

  it.each(TABLES)('and the refusal is real: an outsider INSERT into %s fails', async (table) => {
    const rows = psql(`select count(*) from public.${table}`)
    expect(Number(rows[0]![0]), `${table} is seeded`).toBeGreaterThan(0)
    // Each table's own shape, because an insert refused for a malformed row
    // proves nothing about a policy — the lesson one test up.
    const row =
      table === 'workspace_module_links'
        ? { workspace_key: 'hr', module_key: 'quiz' }
        : { key: 'smugled', label: 'smugled' }
    const { error } = await outsider.from(table).insert(row as never)
    expect(error, `${table}: no insert policy exists, so the write is refused`).not.toBeNull()
  })
})

describe('W0 · the standing constraint — no per-organisation value on a respondent surface', () => {
  /**
   * CLAUDE.md, beside security invariant 3: «no per-organisation value may
   * reach a respondent-facing surface unless a decision says so by name».
   *
   * The vocabulary is the case this rule was written for. «deltaker» in one
   * organisation and «kunde» in another means a respondent who answers two
   * surveys learns they came from the same product; a respondent who sees
   * «deltaker» learns something about the organisation that invited them.
   *
   * Measured over the SOURCE rather than over the rendered page, because the
   * property is «this code never reads it», which a screenshot cannot show.
   */
  it('nothing under app/s/ reads the workspace registry or its vocabulary', () => {
    const files = execFileSync('bash', [
      '-lc',
      "find 'app/s' -type f \\( -name '*.ts' -o -name '*.tsx' \\) | sort",
    ], { encoding: 'utf8' }).split('\n').filter(Boolean)
    // NON-VACUITY: a typo'd path would find no files and pass trivially.
    expect(files.length, 'the respondent surface has source files').toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} must not read the workspace registry`).not.toMatch(
        /from\(['"]workspaces['"]\)|workspace_modules|person_def|wsPersons/,
      )
    }
  })

  /**
   * W3 STRENGTHENS THIS IN THE PHASE THAT COULD BREAK IT, which is the point:
   * a constraint verified after the phase able to violate it is verified at the
   * wrong time. W0 could only forbid the names it knew; W3 is where the
   * vocabulary actually starts moving through the app, so the test has to
   * forbid the shapes W3 introduced.
   *
   * The names are the ones W3 created: `readWorkspace`, `DEFAULT_VOCABULARY`,
   * `vocabulary.`, and each of the four prop forms the four manager screens
   * take. Any of them appearing under `app/s/` would mean a per-organisation
   * word had reached a respondent — «deltaker» in one organisation and «kunde»
   * in another, so a respondent answering two surveys learns they came from the
   * same product.
   */
  it('and nothing under app/s/ reads W3\'s vocabulary either', () => {
    const files = execFileSync('bash', [
      '-lc',
      "find 'app/s' -type f \\( -name '*.ts' -o -name '*.tsx' \\) | sort",
    ], { encoding: 'utf8' }).split('\n').filter(Boolean)
    expect(files.length, 'the respondent surface has source files').toBeGreaterThan(0)

    const FORBIDDEN = [
      'readWorkspace',
      'DEFAULT_VOCABULARY',
      'vocabulary.',
      'personDef',
      'personsCap',
      'workspace/current',
      'workspace/modules',
    ]
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const name of FORBIDDEN) {
        expect(src.includes(name), `${f} must not reference ${name}`).toBe(false)
      }
    }
  })

  /**
   * AND THE OTHER HALF, WITHOUT WHICH THE ABOVE IS VACUOUS: the vocabulary
   * must actually be in use somewhere, or a test that finds it nowhere is
   * passing because the feature does not exist rather than because it is
   * contained. Measured over the manager-facing screens W3 wired.
   */
  it('the vocabulary IS wired at all four sites — so the absence above means containment', () => {
    /*
     * THE FIRST DRAFT GREPPED FOR `vocabulary.` AND FOUND ONE FILE, and the
     * guard caught it: the pages bind `?.vocabulary ?? DEFAULT_VOCABULARY` and
     * then pass `vocab.persons`, so the string it searched for was never the
     * shape the code took. The wiring was there; the test was measuring a
     * spelling.
     *
     * Restated as the pairs v4 actually marks. This IS an enumeration, and it
     * says what it is an enumeration OF: the four sites v4 substitutes at —
     * V4:1024, :2288, :3021, :3218 — which is a closed set fixed by the bundle,
     * not a guess at which screens might use a word. A fifth site would be a
     * bundle change, and adding it here is then part of adopting it.
     */
    const SITES: [component: string, prop: string][] = [
      ['app/(app)/undersokelser/[id]/bygg/PreviewPane.tsx', 'personDef'],
      ['app/(app)/oppgaver/TasksPanel.tsx', 'persons'],
      ['app/(app)/administrasjon/OptionsPanel.tsx', 'persons'],
      ['app/(app)/undersokelser/[id]/send/SendScreen.tsx', 'personsCap'],
    ]
    for (const [file, prop] of SITES) {
      const src = readFileSync(file, 'utf8')
      expect(src.includes(`${prop}: string`), `${file} declares ${prop}`).toBe(true)
      expect(src.includes(`{ ${prop} }`), `${file} passes ${prop} to its message`).toBe(true)
    }

    // And the server side that supplies them: four pages resolve the workspace.
    const resolvers = execFileSync('bash', [
      '-lc',
      "grep -rl 'readWorkspace' 'app/(app)' || true",
    ], { encoding: 'utf8' }).split('\n').filter(Boolean)
    expect(resolvers.length, 'the pages that feed those four sites').toBeGreaterThanOrEqual(4)
  })
})

describe('W0 carry · types/database.ts was hand-transcribed, so it is CHECKED against the catalogue', () => {
  /**
   * `types/database.ts` is GENERATED by `supabase gen types`. W0 added three
   * tables and a column to it BY HAND, because that session had neither Docker
   * nor an authorised Supabase MCP — and a hand edit to a derived file is
   * exactly the transcription risk `scripts/edge-bundle.ts` exists to remove
   * elsewhere (and then reproduced, which is enumeration row 8).
   *
   * The fix is not «remember to regenerate». It is to ask the catalogue what
   * the columns actually are and compare, in the suite that already runs
   * against a database. A measurement does not depend on recall.
   *
   * This also catches DRIFT, not just the original transcription: a later
   * migration that adds a column without regenerating the types fails here.
   */
  const types = readFileSync('types/database.ts', 'utf8')

  /** The `Row:` field names inside one table's block of the generated file. */
  function rowKeys(table: string): string[] {
    const at = types.indexOf(`      ${table}: {`)
    if (at < 0) return []
    const rowAt = types.indexOf('        Row: {', at)
    const end = types.indexOf('        }', rowAt)
    if (rowAt < 0 || end < 0) return []
    return types
      .slice(rowAt + '        Row: {'.length, end)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(':')[0]!.trim())
      .sort()
  }

  function catalogueColumns(table: string): string[] {
    return psql(`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = '${table}'
       order by column_name`).map((r) => r[0]!)
  }

  it.each(['workspaces', 'workspace_modules', 'workspace_module_links'])(
    '%s: the generated type matches the database exactly',
    (table) => {
      const cat = catalogueColumns(table)
      // NON-VACUITY, both sides: a typo'd table name would make two empty
      // lists compare equal, which is D158's shape precisely.
      expect(cat.length, `${table} exists in the catalogue`).toBeGreaterThan(2)
      const typed = rowKeys(table)
      expect(typed.length, `${table} exists in types/database.ts`).toBeGreaterThan(2)
      expect(typed).toEqual(cat)
    },
  )

  it('organizations.workspace reached the generated type', () => {
    const typed = rowKeys('organizations')
    expect(typed.length).toBeGreaterThan(5)
    expect(typed).toContain('workspace')
    expect(catalogueColumns('organizations')).toContain('workspace')
  })
})

describe('W3 · the lift registry', () => {
  it('every lift resolves to a real use case — the mapping is TOTAL', () => {
    const dangling = psql(`
      select l.workspace_key, l.use_case_key
        from public.workspace_use_case_lifts l
        left join public.use_cases u on u.key = l.use_case_key
       where u.key is null`)
    const all = psql(`select workspace_key from public.workspace_use_case_lifts`)
    // NON-VACUITY: an empty lift table would make `dangling` empty too, and
    // the assertion would pass over nothing. V1-5 asserted the pack mapping
    // the same way, and for the same reason.
    expect(all.length, 'lifts are seeded').toBeGreaterThanOrEqual(5)
    expect(dangling, 'a lift naming a use case that does not exist').toEqual([])
  })

  it('Tilpasset lifts nothing — an absent row, not a null one', () => {
    const rows = psql(`
      select count(*) from public.workspace_use_case_lifts where workspace_key = 'custom'`)
    expect(Number(rows[0]![0])).toBe(0)
  })

  it('the rank is meaningful: quiz lifts medlem above hr', () => {
    const rows = psql(`
      select use_case_key from public.workspace_use_case_lifts
       where workspace_key = 'quiz' order by sort_order`)
    expect(rows.map((r) => r[0])).toEqual(['medlem', 'hr'])
  })
})
