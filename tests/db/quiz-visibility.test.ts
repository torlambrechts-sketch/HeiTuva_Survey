import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Q125 — the Quiz workspace's picker option, and Q121's count.
 *
 * THE CENTRAL TEST HERE ASSERTS THE PAIRING, NOT THE FLAG. A test that says
 * «quiz.visible is false» is a test of today's answer, and it would have to be
 * edited by the very commit that reverses the decision — which makes it a
 * rubber stamp rather than a guard. The condition Tor wrote is:
 *
 *   the option returns when the `nps` AND `quiz` Oversikt cards exist,
 *   not before.
 *
 * So that is what is asserted, in both directions, against the RENDERER rather
 * than against a list: if the row is visible, both cards must be rendered; if
 * either card is missing, the row must be hidden. Reversing the decision with
 * only one card built fails here, and reversing it with both built passes
 * without touching this file. That is the difference between a test of a value
 * and a test of a rule.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SCREEN = 'app/(app)/oversikt/OverviewScreen.tsx'

function psql(query: string): string[] {
  return execFileSync('psql', [DB_URL, '-At', '-F', '|', '-c', query], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
}

/** Does Oversikt actually RENDER this module's card? Measured as a gated block
 *  in the screen — `{show.<key> ? (` — because that is the construct the page
 *  uses for every other card, and `show.<key>` appearing anywhere else (the
 *  type, a comment, computeShow's fallback list) is not a rendered card. That
 *  distinction is the W1 slip: a substring match measured the JSDoc. */
function rendersCard(key: string): boolean {
  const src = readFileSync(SCREEN, 'utf8')
  return src.includes(`{show.${key} ? (`)
}

describe('Q125 — the quiz workspace option is paired to its cards', () => {
  it('has a visible column that is NOT NULL and defaults to true', () => {
    const [row] = psql(`
      select is_nullable, column_default, data_type from information_schema.columns
       where table_schema='public' and table_name='workspaces' and column_name='visible'`)
    expect(row, 'workspaces.visible must exist — M:0105').toBeTruthy()
    const [nullable, dflt, type] = row!.split('|')
    expect(nullable).toBe('NO')
    expect(dflt).toContain('true')
    expect(type).toBe('boolean')
  })

  it("honours Q125's condition as written: quiz is selectable iff BOTH the nps and quiz cards render", () => {
    const rows = psql(`select key, visible from public.workspaces order by key`)
    // Non-vacuity first (D158): an empty registry would pass every assertion
    // below for the wrong reason.
    expect(rows.length).toBeGreaterThan(0)
    const visible = new Map(rows.map((r) => { const [k, v] = r.split('|'); return [k!, v === 't'] }))
    expect(visible.has('quiz')).toBe(true)

    // The rule, in the exact terms Q125 sets, so building the missing card
    // flips this without anybody editing the test.
    expect(visible.get('quiz')).toBe(rendersCard('nps') && rendersCard('quiz'))
  })

  it('records the measurement that Q125 condition is STRICTER than its intent', () => {
    /* Q128, logged not fixed. Q125's condition names «nps AND quiz», inherited
       from W3's sentence «quiz and nps have no Oversikt card». Measured, the
       QUIZ WORKSPACE does not switch on nps at all — its module set is
       {quiz, activity}. So the condition makes the Quiz option wait on a card
       belonging to a different workspace, and the module whose absence actually
       made Quiz render one card is `quiz`, which now renders.

       The same measurement surfaces the finding underneath: `nps` belongs to
       `cx`, whose set is {nps, activity, action} and which is SELECTABLE with
       its nps card unrendered — the very defect Q125 names, one workspace over,
       unhidden because the sentence was about quiz.

       Asserted rather than written in a report alone, so it cannot quietly stop
       being true: if nps is ever added to the quiz workspace, or cx's card is
       built, this test says so. */
    const quizMods = psql(`select module_key from public.workspace_module_links
                            where workspace_key='quiz' order by module_key`)
    expect(quizMods).toEqual(['activity', 'quiz'])
    expect(quizMods).not.toContain('nps')

    const cxMods = psql(`select module_key from public.workspace_module_links
                          where workspace_key='cx' order by module_key`)
    expect(cxMods).toContain('nps')
    const [cxVisible] = psql(`select visible from public.workspaces where key='cx'`)
    expect(cxVisible).toBe('t')
    expect(rendersCard('nps')).toBe(false)
  })

  it('keeps hiding out of the resolver: every workspace row still resolves', () => {
    // Q125's load-bearing half. Hiding governs the picker, never resolution, so
    // no row may be removed and an organisation pointing at a hidden row must
    // still be resolvable. Asserted as the FK being intact rather than as a
    // count, because a count would pass if a row were swapped for another.
    const keys = psql(`select key from public.workspaces order by key`).sort()
    expect(keys).toEqual(['cx', 'custom', 'hr', 'quiz'].sort())
    const [orphan] = psql(`
      select count(*) from public.organizations o
       where not exists (select 1 from public.workspaces w where w.key = o.workspace)`)
    expect(orphan).toBe('0')
  })

  it('wires the hide to the PICKER and not to the resolver', () => {
    /* The load-bearing half, and the one a passing DB flag does not prove: if
       the pickers kept reading `all`, `visible` would be a column nobody
       honours and the decision would be inert.

       Asserted over the exact expressions rather than by searching for the
       word «visible», because that word appears in the type, in three comments
       and in the SQL — the W1 slip, where a substring matched the JSDoc. */
    const reader = readFileSync('lib/workspace/current.ts', 'utf8')
    // Resolution reads every row...
    expect(reader).toContain('const current = fromCookieRow ?? byKey(org?.workspace) ?? all[0]!')
    // ...and only the picker list filters, keeping a hidden CURRENT visible so
    // a <select> never displays a row other than the one it would submit.
    expect(reader).toContain('all.filter((w) => w.visible || w.key === current.key)')

    // Both pickers must consume that list. The chip:
    expect(readFileSync('components/AppHeader.tsx', 'utf8')).toContain('options={ws.selectable}')
    // and the organisation default, which submits its value and would rewrite
    // the column if its option list omitted the current row.
    const admin = readFileSync('app/(app)/administrasjon/page.tsx', 'utf8')
    expect(admin).toContain("w.visible || w.key === (org?.workspace ?? 'hr')")
    expect(admin).toContain('workspaces={options}')
  })

  it('Q121 — no shipped quiz copy asserts a number of options', () => {
    for (const lang of ['no', 'en']) {
      const msgs = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as
        { dash: Record<string, string> }
      const body = msgs.dash.quizBody
      expect(body, `dash.quizBody missing in ${lang}`).toBeTruthy()
      // `quizzable` is choice | yesno | dropdown (M:0085) and yesno has TWO, so
      // a count of the bundle's fixture quiz is false of the class.
      expect(body).not.toMatch(/\b(fire|four|4)\b/i)
    }
  })
})
