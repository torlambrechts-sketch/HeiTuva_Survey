import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CRUMBS, crumbFor, type CrumbKey } from '../../lib/shell/crumbs'

/**
 * F3 — the breadcrumb is one surface, and the registry is what makes it one.
 *
 * The audit's finding: drawn on five screens, built on two, as two hand-rolled
 * copies with different message keys. These assert the property that replaces
 * that — every screen the drawing gives a breadcrumb has one, and no screen it
 * does not gains one by accident.
 */
describe('F3 — the breadcrumb registry', () => {
  it('covers exactly the five routes v6 draws a breadcrumb on', () => {
    const drawn = ['/undersokelser', '/dashboard', '/rapporter', '/oppgaver', '/bibliotek']
    for (const p of drawn) expect(crumbFor(p), `no crumb for ${p}`).not.toBeNull()

    /* And nowhere else. The survey detail is the sharp one: v6 draws a back
       BUTTON there (v6:1155), not a breadcrumb, and a prefix match would put
       the list's crumb on all eight survey tabs. */
    for (const p of [
      '/oversikt',
      '/profil',
      '/hjelp',
      '/administrasjon',
      '/administrasjon/brukere',
      '/undersokelser/ny',
      '/undersokelser/abc-123',
      '/undersokelser/abc-123/bygg',
      '/undersokelser/abc-123/send',
      '/undersokelser/abc-123/resultater',
    ]) {
      expect(crumbFor(p), `unexpected crumb on ${p}`).toBeNull()
    }
  })

  it('Dashboard and Rapporter share one leaf, because the drawing does', () => {
    expect(crumbFor('/dashboard')).toBe('insight')
    expect(crumbFor('/rapporter')).toBe('insight')
  })

  it('Handlinger has NO icon chip — the drawing’s own inconsistency, kept', () => {
    /* v6:3667 uses gap:9px and no chip where the other four use gap:10px and a
       28px tinted square. «All of them have an icon» is an enumeration read as
       a property, and acting on it would have invented a fifth icon. */
    expect(CRUMBS.tasks.icon).toBeNull()
    expect(CRUMBS.tasks.tint).toBeNull()
    for (const k of ['surveys', 'insight', 'library'] as CrumbKey[]) {
      expect(CRUMBS[k].icon, `${k} lost its icon`).not.toBeNull()
      expect(CRUMBS[k].tint, `${k} lost its tint`).toMatch(/^var\(--/)
    }
  })

  it('every leaf resolves in both languages, and the root is shared', () => {
    for (const lang of ['no', 'en']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')).crumb as Record<string, string>
      expect(m?.root, `${lang}.crumb.root`).toBeTruthy()
      for (const c of Object.values(CRUMBS)) {
        expect(m[c.leaf], `${lang}.crumb.${c.leaf}`).toBeTruthy()
      }
    }
  })

  it('the two hand-rolled copies are GONE, not left beside the shared one', () => {
    /* The condition `AppSubnav` sets for `admin` and Q172 set for the library:
       two controls doing one job is worse than one. A registry beside two
       surviving copies would be three. */
    /* Swept over the whole app rather than over the two files that had one:
       «these two» is a list of the copies that existed the day this was
       written, and the defect being guarded is precisely a copy appearing
       somewhere nobody is looking. */
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name === 'node_modules'
          ? []
          : e.isDirectory()
            ? walk(`${dir}/${e.name}`)
            : e.name.endsWith('.tsx')
              ? [`${dir}/${e.name}`]
              : [],
      )
    const offenders = walk('app').filter((f) => readFileSync(f, 'utf8').includes('opacity-50">→'))
    expect(offenders, 'a hand-rolled breadcrumb survives').toEqual([])
    for (const lang of ['no', 'en']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8'))
      expect(m.library?.crumbRoot, `${lang} library.crumbRoot survives`).toBeUndefined()
      expect(m.tasks?.wlCrumbRoot, `${lang} tasks.wlCrumbRoot survives`).toBeUndefined()
    }
  })
})
