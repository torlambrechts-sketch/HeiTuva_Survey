import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * V5-1 — the footer's claims, and the shell's corners.
 *
 * The footer ships on every signed-in page, which makes its copy the most-read
 * in the product and a false claim there the most expensive kind. Four of the
 * drawing's assertions were removed for measured reasons; these tests are what
 * stop a later fidelity pass restoring them, because restoring them would look
 * like correcting a deviation.
 */
const no = JSON.parse(readFileSync('messages/no.json', 'utf8'))
const en = JSON.parse(readFileSync('messages/en.json', 'utf8'))
const footer = readFileSync('components/AppFooter.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')

describe('the footer claims nothing untrue', () => {
  it('1. does NOT say data is stored in Norway', () => {
    /* Nothing is in Norway: Supabase is eu-central-1 (Frankfurt), Vercel
       answers from fra1, Brevo is French. The drawing said «Data lagres i Norge
       og EØS» — hard-coded in the MARKUP at v5:5154, not in a foot* data key,
       which is why the fix is a literal in this component. */
    for (const [loc, d] of [['no', no], ['en', en]] as const) {
      const pitch = d.footer.pitch as string
      expect(pitch.toLowerCase(), `${loc}: the pitch must not name Norway`).not.toMatch(/norge|norway/)
      expect(pitch, `${loc}: and it must still make the residency claim it CAN keep`)
        .toMatch(/EØS|EEA/)
    }
  })

  it('2. carries TWO badges, and neither is the DPIA', () => {
    // The DPIA has not been started. A badge saying it was done is the single
    // most load-bearing false claim available on a compliance product.
    const badges = Object.keys(no.footer).filter((k) => k.startsWith('badge'))
    expect(badges.sort()).toEqual(['badgeDpa', 'badgeEea'])
    const all = [...Object.values(no.footer), ...Object.values(en.footer)].join(' ')
    expect(all).not.toMatch(/DPIA/i)
  })

  it('3. renders no service status — there is no health source', () => {
    /* «Alle tjenester kjører normalt» was a string literal. A status indicator
       that cannot report trouble is worse than none, because it is believed. */
    const all = [...Object.values(no.footer), ...Object.values(en.footer)].join(' ')
    expect(all).not.toMatch(/kjører normalt|operating normally|all systems/i)
    expect(footer).not.toMatch(/footStatus|status(?=[A-Z])/)
  })

  it('4. renders no version — there is none to render', () => {
    /* Zero version columns in the schema, package.json says 0.1.0, zero
       «Versjon» in shipped copy. «Versjon 2.4 · september 2026» is the example
       the never-fabricate rule actually gives. */
    const all = [...Object.values(no.footer), ...Object.values(en.footer)].join(' ')
    expect(all).not.toMatch(/versjon|version/i)
    expect(JSON.parse(readFileSync('package.json', 'utf8')).version,
      'and if a real version ever appears here, this test is the reminder to decide').toBe('0.1.0')
  })

  it('5. asserts a legal role about HeiTuva, never about the customer', () => {
    /* The drawing said «{company} er behandlingsansvarlig» — a claim about the
       CUSTOMER'S role, and `organizations` has no column holding it. Tor's
       rule: either the column exists or the sentence does not. A column would
       be wrong too — its value is identical for every customer, so it is a
       constant wearing a column's clothes. The sentence now asserts what we DO
       hold: HeiTuva is the processor. */
    expect(no.footer.legal).toContain('databehandler')
    expect(no.footer.legal).not.toContain('behandlingsansvarlig')
    expect(en.footer.legal).toContain('processor')
    expect(en.footer.legal.toLowerCase()).not.toContain('controller')
    // The year interpolates rather than being the drawing's literal «2026».
    expect(no.footer.legal).toContain('{year}')
  })

  it('6. invents no contact address', () => {
    /* The bundle's help channel carries `hjelp@heituva.no` with «svar innen én
       arbeidsdag» — a service promise on a domain this project has recorded
       twice as never having been HeiTuva's. A third invented address is not
       shipped; the two that already exist are held in LEGAL_DRAFTS until a
       mailbox is confirmed to RECEIVE. */
    const all = [...Object.values(no.footer), ...Object.values(en.footer)].join(' ')
    expect(all).not.toMatch(/@/)
    expect(footer).not.toMatch(/heituva\.no/)
  })
})

describe('the shell card corners are decided once', () => {
  it('7. the header radius keys on whether the subnav RENDERED, not on a screen list', () => {
    /* Two copies of «which screens get a subnav» would disagree the first time
       one moved. `:has(> nav)` reads the fact instead. */
    expect(css).toMatch(/\.shell-card > header\s*\{[^}]*border-radius:\s*15px/)
    expect(css).toMatch(/\.shell-card:has\(> nav\) > header\s*\{[^}]*border-radius:\s*15px 15px 0 0/)
  })

  it('8. the wrapper carries the border and the header does not', () => {
    /* v5:160 moved width, border, the 16px radius and the shadow onto a
       wrapper; v4 had no headRadius key because its header WAS the card.
       `overflow:hidden` is NOT how these corners are made — it would clip the
       user menu and the mobile nav, which are absolutely positioned to escape
       this box. */
    const header = readFileSync('components/AppHeader.tsx', 'utf8')
    const at = header.indexOf('<header className=')
    const tag = header.slice(at, header.indexOf('>', at))
    expect(tag).not.toMatch(/\bborder\b|rounded-|shadow-|\bframe\b/)
    expect(header).toMatch(/shell-card frame relative z-30 mt-4 rounded-\[16px\] border border-line shadow-/)
    expect(css).not.toMatch(/\.shell-card[^{]*\{[^}]*overflow:\s*hidden/)
  })
})
