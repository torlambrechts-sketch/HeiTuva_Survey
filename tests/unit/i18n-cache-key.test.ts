import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bundleFingerprint } from '@/lib/i18n/fingerprint'
import no from '@/messages/no.json'

/**
 * The /oppgaver raw-key defect, asserted as the property that prevents it.
 *
 * MEASURED FIRST, and the original diagnosis was wrong: it was read as missing
 * `ui_messages` ROWS. The live deployment carries C4's own copy, so the bundle
 * HAS the keys, and `fetchShipped` makes the bundle the BASE — a missing row
 * cannot render raw. The stale half was the cache: its key named only the
 * locale, while the value it holds depends on the bundle too.
 */
describe('the shipped-message cache key depends on the bundle, not only the locale', () => {
  it('changes when any message changes', () => {
    const base = bundleFingerprint(no)
    const oneMore = JSON.parse(JSON.stringify(no)) as Record<string, Record<string, string>>
    oneMore.dash = { ...oneMore.dash, aKeyThatDidNotExistBefore: 'x' }
    expect(bundleFingerprint(oneMore)).not.toBe(base)

    const oneEdited = JSON.parse(JSON.stringify(no)) as Record<string, Record<string, string>>
    const firstKey = Object.keys(oneEdited.dash!)[0]!
    oneEdited.dash![firstKey] = `${oneEdited.dash![firstKey]} `
    expect(bundleFingerprint(oneEdited), 'a changed VALUE must move it too, not just a new key')
      .not.toBe(base)
  })

  it('is stable for an unchanged set — a key that churns would defeat the cache', () => {
    expect(bundleFingerprint(no)).toBe(bundleFingerprint(no))
    expect(bundleFingerprint(no)).toMatch(/^[0-9a-f]{12}$/)
  })

  it('is actually IN the cache key, beside the locale', () => {
    /* Asserted over the expression rather than by searching for the word
       «fingerprint», which appears in three comments — the W1 slip, where a
       substring matched the JSDoc. */
    const src = readFileSync('lib/i18n/messages.ts', 'utf8')
    expect(src).toContain("['ui_messages', locale, BUNDLE_FINGERPRINT[locale] ?? 'no-bundle']")
    expect(src).toContain('bundleFingerprint(messages)')
    // And the safety net stays: the tag revalidates on a seed, the expiry
    // catches every out-of-band path. The key fixes the third case — a new
    // deployment inheriting the previous one's merged set.
    expect(src).toContain('revalidate: 300')
  })
})
