import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Q130 — `dashboard_presets.title` stays a REGISTRY VALUE and is never localised.
 *
 * Q129 translated `workspaces` and `use_cases` and left this one. That looks
 * like an unfinished job and is a decision, so it is pinned here: a later phase
 * that "finishes Q129" has to meet the argument rather than walk past it.
 *
 * The argument is `app.preset_title_free`. It refuses a user layout whose name
 * matches a shipped preset, comparing the STORED title. Localise at render and
 * an English user sees «Work environment», names their own layout that, and the
 * guard — still comparing «Arbeidsmiljø» — permits it. Two layouts visibly
 * sharing a name, protected by a rule whose right-hand side nobody reads: a
 * guard in name only, which is the same reason Q128 refused to put the
 * visibility rule in a trigger.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[] {
  return execFileSync('psql', [DB_URL, '-At', '-F', '|', '-c', query], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
}

/** One value, newlines intact. `psql()` splits on them, which turned a function
 *  body into the single word «begin» — the test's own first slip. */
function psqlBlob(query: string): string {
  return execFileSync('psql', [DB_URL, '-At', '-c', query], { encoding: 'utf8' })
}

/** Run a statement expected to FAIL, and return what the database said. */
function psqlExpectError(sql: string): string {
  try {
    execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return ''
  } catch (e) {
    const err = e as { stderr?: string }
    return err.stderr ?? ''
  }
}

/** Every file that renders a preset title, found once and asserted non-empty so
 *  the sweep cannot pass by looking at nothing. */
const RENDER_SITES = [
  'app/(app)/oversikt/OverviewScreen.tsx',
  'app/(app)/dashboard/PresetChooser.tsx',
  'app/(app)/dashboard/CustomizeCard.tsx',
]

describe('Q130 — the shipped preset title is an identifier, not chrome', () => {
  it('the guard that decides this still compares the STORED title', () => {
    const src = psqlBlob(`
      select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = 'preset_title_free'`)
    expect(src, 'app.preset_title_free must exist — it is the whole argument').toBeTruthy()
    // Non-vacuity: the comparison is against dashboard_presets.title itself.
    expect(src).toContain('dashboard_presets')
    expect(src).toContain('lower(btrim(p.title))')
    expect(src).toContain('lower(btrim(new.title))')
  })

  it('and it actually refuses — measured, not read', () => {
    const [title] = psql(`select title from public.dashboard_presets order by sort_order limit 1`)
    expect(title, 'no shipped presets — the assertion below would be vacuous').toBeTruthy()

    const stderr = psqlExpectError(
      `insert into public.dashboard_layouts (org_id, user_id, title, panels)
       select id, null, '${title!.replace(/'/g, "''")}', '[]'::jsonb
         from public.organizations limit 1`)

    // The refusal, in the database's own words. Asserted rather than assumed,
    // because "it would refuse" is exactly the argument Q130 rests on.
    expect(stderr, 'the guard did not refuse a layout named after a shipped preset').not.toBe('')
    expect(stderr).toContain('is the name of a shipped preset')
  })

  it('no render site localises it — the sites are named and each is read', () => {
    for (const file of RENDER_SITES) {
      const src = readFileSync(file, 'utf8')
      expect(src.length, `${file} is empty — the sweep must read something`).toBeGreaterThan(0)
      // The two helpers Q129 introduced. Either one applied to a preset title
      // would silently defeat preset_title_free.
      const localised = /localise(Registry|Workspace)Names\s*\([^)]*preset/i.test(src)
      expect(localised, `${file} localises a preset title — see Q130 before doing this`).toBe(false)
    }
  })

  it('and no message key shadows a preset title', () => {
    /* The other road to the same place: adding `presetTitle_arbeidsmiljo` to
       messages and rendering that instead. Asserted over the message files, so
       the defect is caught at the point someone adds the key. */
    const titles = psql(`select lower(btrim(title)) from public.dashboard_presets`)
    expect(titles.length).toBeGreaterThan(0)
    for (const lang of ['no', 'en']) {
      const msgs = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as
        Record<string, Record<string, string> | string>
      for (const [ns, group] of Object.entries(msgs)) {
        if (typeof group === 'string') continue
        for (const key of Object.keys(group)) {
          expect(/^presetTitle_/.test(key), `${lang}: ${ns}.${key} shadows a preset title (Q130)`)
            .toBe(false)
        }
      }
    }
  })
})
