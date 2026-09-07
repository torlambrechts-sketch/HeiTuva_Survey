import { describe, expect, it } from 'vitest'
import {
  BOM,
  attributedCsv,
  attributedCsvFilename,
  csvField,
  csvValue,
} from '@/lib/results/attributed-csv'
import type { Attributed } from '@/lib/results/types'

/**
 * DECISIONS Q43 — the file itself.
 *
 * The route checks in `scripts/verify/export.ts` prove WHO may have this file.
 * They cannot prove what is in it, because a fixture holds tidy values: no
 * supplier in the demo seed is called «Bergen Logistikk, avd. Nord» and no
 * answer contains a line break. Those are the cases that break a CSV, so they
 * are tested here rather than hoped for.
 */
const labels = {
  name: 'Virksomhet',
  status: 'Status',
  respondedAt: 'Svardato',
  statusLabels: { svart: 'Svart', paaminnet: 'Påminnet', ikke_svart: 'Ikke svart' },
} as const

const doc = (rows: Attributed['rows'], questions: Attributed['questions']): Attributed => ({
  survey_id: 's', title: 'Aktsomhetsvurdering leverandør', respondent_kind: 'organisation',
  k: 0, invited: rows.length, responded: 0, unattributed: 0, questions, rows,
})

describe('csvField — the separator, the quote and the line break', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvField('Nordvest Tekstil AS')).toBe('Nordvest Tekstil AS')
  })

  it('quotes a value containing the separator', () => {
    // The whole reason a bare join is wrong: this name would otherwise become
    // two columns and shift every later cell one to the right.
    expect(csvField('Bergen Logistikk, avd. Nord; AS')).toBe('"Bergen Logistikk, avd. Nord; AS"')
  })

  it('doubles an embedded quote, and quotes the field', () => {
    expect(csvField('Kalt «Nord" AS')).toBe('"Kalt «Nord"" AS"')
  })

  it('quotes a value containing a line break', () => {
    expect(csvField('Første linje\nAndre linje')).toBe('"Første linje\nAndre linje"')
  })
})

describe('csvField — a spreadsheet evaluates what looks like a formula', () => {
  /**
   * Respondent free text is untrusted input that ends up in a file someone
   * opens in Excel without thinking about where the text came from. A cell
   * beginning `=`, `+`, `-` or `@` is evaluated, so `=HYPERLINK(...)` becomes a
   * live link and `=cmd|...` is worse. The single quote is the convention every
   * spreadsheet reads as "this is text".
   */
  it('neutralises a leading = ', () => {
    expect(csvField('=HYPERLINK("http://evil.test","Klikk")')).toBe(
      '"\'=HYPERLINK(""http://evil.test"",""Klikk"")"',
    )
  })

  it('neutralises +, - and @ too', () => {
    expect(csvField('+1+1')).toBe("'+1+1")
    expect(csvField('-2+3')).toBe("'-2+3")
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('does not touch a minus INSIDE a value — only a leading one is evaluated', () => {
    expect(csvField('12-14 ansatte')).toBe('12-14 ansatte')
  })
})

describe('csvValue — every question type arrives as different jsonb', () => {
  it('renders the scalar types', () => {
    expect(csvValue('Ja')).toBe('Ja')
    expect(csvValue(4)).toBe('4')
    expect(csvValue(true)).toBe('Ja')
    expect(csvValue(false)).toBe('Nei')
  })

  it('renders nothing for an absent value rather than "null"', () => {
    expect(csvValue(null)).toBe('')
    expect(csvValue(undefined)).toBe('')
  })

  it('joins a ranking or a multi-choice', () => {
    expect(csvValue(['Pris', 'Support'])).toBe('Pris · Support')
  })

  it('names the statements of a matrix instead of rendering [object Object]', () => {
    // CLAUDE.md: never fabricate data in the UI. "[object Object]" is worse
    // than a fabricated value — it is a value that cannot be read at all.
    expect(csvValue({ 'Er tydelig': 4, Lytter: 5 })).toBe('Er tydelig: 4 · Lytter: 5')
  })
})

describe('attributedCsv — the file', () => {
  const questions = [
    { id: 'q1', type: 'yesno', text: 'Har dere en policy?' },
    { id: 'q2', type: 'text', text: 'Beskriv tiltakene' },
  ]

  it('starts with a BOM and uses CRLF, so Excel reads æøå and the rows split', () => {
    const csv = attributedCsv(doc([], questions), labels)
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv).toContain('\r\n')
    expect(csv).toContain('Virksomhet;Status;Svardato;Har dere en policy?;Beskriv tiltakene')
  })

  it('writes a row per respondent, with the answers under their questions', () => {
    const csv = attributedCsv(
      doc(
        [{
          invitation_id: 'i1', name: 'Nordvest Tekstil AS', email: 'post@nordvest.test',
          round_id: 'r1', status: 'svart', responded_at: '2026-08-14T09:31:22.000Z',
          answers: [
            { question_id: 'q2', value: 'Årlig revisjon', comment: null },
            { question_id: 'q1', value: 'Ja', comment: null },
          ],
        }],
        questions,
      ),
      labels,
    )
    const row = csv.split('\r\n')[1]!
    // The answers arrive ordered by question_id, not by position — the columns
    // follow the QUESTIONS, so a row must be assembled by lookup rather than by
    // zipping two lists that only usually agree.
    expect(row).toBe('Nordvest Tekstil AS;Svart;2026-08-14;Ja;Årlig revisjon')
  })

  it('leaves the answer cells empty for someone who has not answered', () => {
    const csv = attributedCsv(
      doc(
        [{
          invitation_id: 'i2', name: 'Fjordfrakt AS', email: 'post@fjordfrakt.test',
          round_id: 'r1', status: 'paaminnet', responded_at: null, answers: null,
        }],
        questions,
      ),
      labels,
    )
    // Empty, not "—" and not "undefined": the file is data, and a dash in a
    // data column is a value someone will later count.
    expect(csv.split('\r\n')[1]).toBe('Fjordfrakt AS;Påminnet;;;')
  })

  it('carries a comment beside its answer', () => {
    const csv = attributedCsv(
      doc(
        [{
          invitation_id: 'i3', name: 'X AS', email: 'x@x.test', round_id: 'r1',
          status: 'svart', responded_at: '2026-08-14T09:00:00.000Z',
          answers: [{ question_id: 'q1', value: 'Nei', comment: 'Under arbeid' }],
        }],
        questions,
      ),
      labels,
    )
    expect(csv.split('\r\n')[1]).toContain('Nei — Under arbeid')
  })

  it('carries NO contact address anywhere in the file', () => {
    /*
      The property, not the column list. Tor's call (2026-09-06): a supplier
      register export is a legal artefact, and an address is administrative data
      that leaves the organisation the moment the file is forwarded. What the
      redegjørelse needs is which supplier answered what and when; chasing a
      non-responder happens in the app, where access is scoped and audited.

      Asserted over the WHOLE serialised file rather than by naming the columns,
      for the same reason the Q43 audit check is: a column list stops covering
      this the day someone adds a column, and the addresses are still on every
      row of the payload for anyone who reaches for them.
    */
    const csv = attributedCsv(
      doc(
        [
          { invitation_id: 'i1', name: 'Nordvest Tekstil AS', email: 'post@nordvest.test',
            round_id: 'r1', status: 'svart', responded_at: '2026-08-14T09:00:00.000Z',
            answers: [{ question_id: 'q1', value: 'Ja', comment: null }] },
          { invitation_id: 'i2', name: 'Fjordfrakt AS', email: 'kontakt@fjordfrakt.test',
            round_id: 'r1', status: 'ikke_svart', responded_at: null, answers: null },
        ],
        questions,
      ),
      labels,
    )
    expect(csv).not.toContain('post@nordvest.test')
    expect(csv).not.toContain('kontakt@fjordfrakt.test')
    expect(csv).not.toContain('@')
    // …and the rows are still there, so this is not passing on an empty file.
    expect(csv).toContain('Nordvest Tekstil AS')
    expect(csv).toContain('Fjordfrakt AS')
  })

  it('falls back to the address ONLY when a row has no name at all', () => {
    // An invitation with no name is a fixture defect rather than a real state
    // (`inviteOrganisations` requires one), but a blank first column would make
    // the row unidentifiable and the file useless. The address is the least-bad
    // identifier at that point, and it is the only path that can emit one.
    const csv = attributedCsv(
      doc(
        [{ invitation_id: 'i3', name: null, email: 'ukjent@leverandor.test', round_id: 'r1',
           status: 'svart', responded_at: '2026-08-14T09:00:00.000Z', answers: [] }],
        questions,
      ),
      labels,
    )
    expect(csv.split('\r\n')[1]).toBe('ukjent@leverandor.test;Svart;2026-08-14;;')
  })

  it('shows the date only, never the minute', () => {
    // `responded_at` on an ATTRIBUTED row is a real timestamp — the
    // hour-truncation rule in the anonymity CHECK is about anonymous responses
    // and does not apply here. This is an editorial choice, not a security one:
    // a register is read by date, and a minute invites someone to reason about
    // who answered just after whom.
    const csv = attributedCsv(
      doc(
        [{
          invitation_id: 'i4', name: 'Y AS', email: 'y@y.test', round_id: 'r1',
          status: 'svart', responded_at: '2026-08-14T23:59:59.000Z', answers: [],
        }],
        questions,
      ),
      labels,
    )
    expect(csv.split('\r\n')[1]).toContain(';2026-08-14;')
    expect(csv).not.toContain('23:59')
  })
})

describe('attributedCsvFilename', () => {
  it('folds the Norwegian letters rather than dropping them', () => {
    expect(attributedCsvFilename('Aktsomhetsvurdering leverandør')).toBe(
      'aktsomhetsvurdering-leverandor.csv',
    )
    expect(attributedCsvFilename('Årlig måling æ')).toBe('arlig-maling-ae.csv')
  })

  it('falls back to a name rather than producing ".csv"', () => {
    expect(attributedCsvFilename('«»')).toBe('undersokelse.csv')
  })
})
