import { describe, expect, it } from 'vitest'
import { parseRecipients } from '@/lib/send/import'

/**
 * The import parser is the one place in Phase 3 where a customer hands us a
 * file we did not write. Every case here is one somebody's export actually
 * produces.
 */
describe('parseRecipients', () => {
  it('reads the design\'s documented columns', () => {
    const { rows } = parseRecipients(
      'e-post,navn,gruppe\nola@nordisk.no,Ola Nordmann,Design\nkari@nordisk.no,Kari,Utvikling',
    )
    expect(rows).toEqual([
      { email: 'ola@nordisk.no', name: 'Ola Nordmann', group: 'Design' },
      { email: 'kari@nordisk.no', name: 'Kari', group: 'Utvikling' },
    ])
  })

  it('reads a mobile column and keeps a phone-only row (the SMS case)', () => {
    const { rows, rejected } = parseRecipients(
      'e-post;mobil;navn\nola@nordisk.no;918 27 364;Ola\n;+47 412 34 567;Kari\n;;Ingen',
    )
    expect(rows).toEqual([
      { email: 'ola@nordisk.no', phone: '+4791827364', name: 'Ola' },
      { phone: '+4741234567', name: 'Kari' },
    ])
    expect(rejected).toEqual([{ line: ';;Ingen', reason: 'no-email' }])
  })

  it('accepts a sheet with a phone column and no email column at all', () => {
    const { rows } = parseRecipients('navn,mobil\nOla,91827364\nKari,0047 41234567')
    expect(rows.map((r) => r.phone)).toEqual(['+4791827364', '+4741234567'])
  })

  it('drops a phone it cannot read rather than sending to it', () => {
    const { rows, rejected } = parseRecipients('e-post,mobil\na@b.no,12345\n,12345')
    expect(rows).toEqual([{ email: 'a@b.no' }])
    expect(rejected).toEqual([{ line: ',12345', reason: 'no-email' }])
  })

  it('treats the same phone twice as one person', () => {
    const { rows, rejected } = parseRecipients('mobil\n91827364\n+47 918 27 364')
    expect(rows).toHaveLength(1)
    expect(rejected[0]?.reason).toBe('duplicate')
  })

  it('strips the BOM Excel writes, so the first header still matches', () => {
    const { rows } = parseRecipients('﻿e-post;navn\nola@nordisk.no;Ola')
    expect(rows).toEqual([{ email: 'ola@nordisk.no', name: 'Ola' }])
  })

  it('detects semicolons, which is what a Norwegian Excel exports', () => {
    const { rows } = parseRecipients('email;name;group\na@b.no;A;Ledelse')
    expect(rows[0]).toEqual({ email: 'a@b.no', name: 'A', group: 'Ledelse' })
  })

  it('honours quoted fields containing the delimiter', () => {
    const { rows } = parseRecipients('e-post,navn\na@b.no,"Nordmann, Ola"')
    expect(rows[0]!.name).toBe('Nordmann, Ola')
  })

  it('treats a first row of addresses as data, not a header', () => {
    const { rows } = parseRecipients('a@b.no\nc@d.no')
    expect(rows.map((r) => r.email)).toEqual(['a@b.no', 'c@d.no'])
  })

  it('accepts a bare list separated by commas or semicolons', () => {
    const { rows } = parseRecipients('a@b.no, c@d.no; e@f.no')
    expect(rows.map((r) => r.email)).toEqual(['a@b.no', 'c@d.no', 'e@f.no'])
  })

  it('picks the name out of an unlabelled row', () => {
    const { rows } = parseRecipients('Ola Nordmann,ola@nordisk.no,Design')
    expect(rows[0]).toEqual({ email: 'ola@nordisk.no', name: 'Ola Nordmann', group: 'Design' })
  })

  it('lowercases addresses so a duplicate in different case is caught', () => {
    const { rows, rejected } = parseRecipients('Ola@Nordisk.no\nola@nordisk.no')
    expect(rows).toHaveLength(1)
    expect(rejected[0]!.reason).toBe('duplicate')
  })

  it('reports a line with no address rather than dropping it silently', () => {
    const { rows, rejected } = parseRecipients('e-post,navn\n,Ola uten e-post\nb@c.no,B')
    expect(rows.map((r) => r.email)).toEqual(['b@c.no'])
    expect(rejected).toEqual([{ line: ',Ola uten e-post', reason: 'no-email' }])
  })

  it('rejects something that is not an address', () => {
    const { rejected } = parseRecipients('e-post\nikke-en-epost')
    expect(rejected[0]!.reason).toBe('invalid-email')
  })

  it('returns nothing for empty input rather than a phantom row', () => {
    expect(parseRecipients('   \n\n ')).toEqual({ rows: [], rejected: [] })
  })
})
