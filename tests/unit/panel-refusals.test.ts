import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as Record<string, Record<string, string>>

const audience = readFileSync('app/(app)/administrasjon/malgrupper/AudiencePanel.tsx', 'utf8')
const integrations = readFileSync('app/(app)/administrasjon/IntegrationsPanel.tsx', 'utf8')

/** CLAUDE.md: a refusal named in a comment is found by a grep over that comment. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** Every .ts/.tsx under a root, for the catalogue-derived audit sweep. */
function walk(root: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(root)) {
    const p = join(root, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/**
 * G3 — the three surfaces Tor named, each BUILT or REFUSED on the screen.
 *
 * «Absent with no notice is the one outcome that is not acceptable.» These are
 * not tests of chrome: each asserts that the screen carries the sentence, and
 * that the sentence is TRUE of the running product. A refusal that outlives its
 * reason is a lie the same way a missing notice is.
 */
describe('G3 — Integrasjoner: API-nøkkel and Webhooks are refused, not absent', () => {
  it('1. the refusal is on the screen, in both languages', () => {
    expect(integrations).toContain("t('apiTitle')")
    expect(integrations).toContain("t('apiUnavailable')")
    for (const m of [no, en]) {
      expect(m.integrations?.apiTitle).toBeTruthy()
      expect(m.integrations?.apiUnavailable?.length ?? 0).toBeGreaterThan(80)
    }
  })

  it('2. it reads as a DECISION, not as a delay', () => {
    /* Q89 is expressly «not deferred for capacity and must not be read as
       scheduling». A notice saying «coming soon» would reverse it in copy. */
    expect(no.integrations?.apiUnavailable).toMatch(/avgjørelse/i)
    expect(no.integrations?.apiUnavailable).not.toMatch(/kommer|snart|ennå/i)
    expect(en.integrations?.apiUnavailable).toMatch(/decision/i)
    expect(en.integrations?.apiUnavailable).not.toMatch(/coming|soon|yet/i)
  })

  it('3. no key and no endpoint are drawn — Q151 stands', () => {
    /* The bundle draws a fabricated key `ht_live_9f2c··············a41` and a
       fabricated rotation date. A disabled control still advertises. */
    const code = codeOnly(integrations)
    expect(code).not.toMatch(/ht_live_/)
    expect(code).not.toMatch(/Webhook-URL|Roter nøkkel|Rotate key/)
  })
})

describe('G3 — Målgrupper: Frosne medlemskap is BUILT, Endringslogg is refused', () => {
  it('4. the freeze rule is stated, verbatim from v6:8797', () => {
    expect(audience).toContain("t('mgFreezeTitle')")
    expect(audience).toContain("t('mgFreezeNote')")
    expect(no.admin?.mgFreezeNote).toBe(
      'Medlemskapet fryses når undersøkelsen sendes. Da kan to runder sammenlignes selv om segmentregelen endres senere.',
    )
    expect(en.admin?.mgFreezeNote).toBeTruthy()
  })

  it('5. the changelog refusal is on the screen, in both languages', () => {
    expect(audience).toContain("t('mgAuditTitle')")
    expect(audience).toContain("t('mgAuditUnavailable')")
    for (const m of [no, en]) expect(m.admin?.mgAuditUnavailable?.length ?? 0).toBeGreaterThan(80)
  })

  it('6. the refusal names the ONE event that is recorded, and it is true', () => {
    /* Catalogue-derived rather than a list I happened to know: every `audit(`
       call in `app/` and `lib/`, with the audience-shaped actions picked out.
       If a phase adds `group.created`, this test fails in that commit and the
       refusal gets rewritten rather than quietly outliving its reason. */
    const actions = new Set<string>()
    for (const file of [...walk('app'), ...walk('lib')]) {
      const src = codeOnly(readFileSync(file, 'utf8'))
      /* The action is the SECOND argument — `audit(orgId, 'member.group', …)`
         — so the first form of this regex matched nothing at all and the sweep
         reported an empty catalogue. Caught by `expect(size).toBeGreaterThan`,
         which is why that line is here: a derivation that finds nothing looks
         identical to a product that has nothing. */
      for (const m of src.matchAll(/audit\([^)\n]*?'([a-z_]+\.[a-z_]+)'/g)) if (m[1]) actions.add(m[1])
      for (const m of src.matchAll(/action:\s*'([a-z_]+\.[a-z_]+)'/g)) if (m[1]) actions.add(m[1])
    }
    expect(actions.size).toBeGreaterThan(10)
    const audienceShaped = [...actions].filter((a) =>
      /^(group|segment|import|sync)\./.test(a) || a === 'member.group',
    )
    expect(audienceShaped.sort()).toEqual(['member.group'])
  })

  it('7. no changelog table is rendered — the refusal is a sentence, not a shell', () => {
    const after = audience.slice(audience.indexOf("t('mgAuditTitle')"))
    expect(after).not.toContain('<table')
    expect(after).not.toContain('.map(')
  })
})
