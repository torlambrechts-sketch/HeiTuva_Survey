/**
 * Recipient import — the parser, shared by the paste box, the CSV upload and
 * the Excel upload.
 *
 * One function rather than three because the three differ only in how bytes
 * become rows: after that, "which column is the email" is the same problem, and
 * solving it once means a fix to the header detection fixes every source.
 *
 * Pure and dependency-free so it can be unit-tested without a browser or a
 * database, which is what makes the awkward cases (a BOM, semicolons, quoted
 * fields containing commas, a header row that is actually data) worth writing
 * tests for at all.
 */

export type ImportedRecipient = {
  /** Absent for a phone-only row: the SMS channel's "skift og felt" case. */
  email?: string
  /** E.164 where the shape was recognisable; see `normalizePhone`. */
  phone?: string
  name?: string
  group?: string
}

export type ImportOutcome = {
  rows: ImportedRecipient[]
  /** Lines that looked like data but had no way to reach the person. */
  rejected: { line: string; reason: 'no-email' | 'invalid-email' | 'duplicate' }[]
}

/**
 * The same rule as `app.normalize_phone` in migration 0027, in the client so
 * the import summary can count a phone-only row as reachable BEFORE the send,
 * rather than the database quietly dropping it. The two must agree; the
 * database's is the one that decides.
 */
export function normalizePhone(raw: string | undefined): string | undefined {
  let v = (raw ?? '').replace(/[\s\-.()]/g, '')
  if (!v) return undefined
  if (v.startsWith('00')) v = `+${v.slice(2)}`
  if (/^[49][0-9]{7}$/.test(v)) return `+47${v}`
  if (/^47[49][0-9]{7}$/.test(v)) return `+${v}`
  if (/^\+[1-9][0-9]{7,14}$/.test(v)) return v
  return undefined
}

/**
 * Deliberately permissive, and deliberately not RFC 5322.
 *
 * A stricter pattern rejects addresses that exist (quoted locals, new TLDs) and
 * the cost of a false reject here is a person who never gets asked. The real
 * validation is the provider's: a bad address bounces, and the bounce
 * suppresses reminders.
 */
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

const HEADER_EMAIL = ['e-post', 'epost', 'email', 'e-mail', 'mail', 'adresse']
const HEADER_NAME = ['navn', 'name', 'fullt navn', 'full name']
const HEADER_GROUP = ['gruppe', 'group', 'team', 'avdeling', 'department']
const HEADER_PHONE = ['mobil', 'mobilnummer', 'telefon', 'tlf', 'phone', 'mobile', 'sms']

/** Split one delimited line, honouring double-quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      out.push(field)
      field = ''
    } else field += ch
  }
  out.push(field)
  return out.map((f) => f.trim())
}

/** Whichever of comma, semicolon or tab appears most on the first data line. */
function detectDelimiter(line: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, line.split(d).length - 1] as const)
  const best = counts.sort((a, b) => b[1] - a[1])[0]!
  return best[1] > 0 ? best[0] : ','
}

function findColumn(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(h.toLowerCase().replace(/^﻿/, '').trim()))
}

/**
 * Parses pasted or uploaded text into recipients.
 *
 * Handles the two shapes the design describes: a delimited table with a header
 * row ("Forventede kolonner: e-post, navn, gruppe — første rad er overskrift"),
 * and a bare list of addresses "skilt med komma, semikolon eller linjeskift".
 */
export function parseRecipients(raw: string): ImportOutcome {
  const rows: ImportedRecipient[] = []
  const rejected: ImportOutcome['rejected'] = []
  const seen = new Set<string>()

  // A UTF-8 BOM is what Excel writes, and it would otherwise become part of the
  // first header cell and stop it matching "e-post".
  const text = raw.replace(/^﻿/, '').trim()
  if (!text) return { rows, rejected }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const delimiter = detectDelimiter(lines[0] ?? '')
  const first = splitLine(lines[0] ?? '', delimiter)
  const emailCol = findColumn(first, HEADER_EMAIL)
  // A header only counts as one if it names an email or a phone column AND has
  // no address in it. A first row of raw addresses is data, not a header.
  const hasHeader =
    (emailCol >= 0 || findColumn(first, HEADER_PHONE) >= 0) && !first.some((f) => EMAIL.test(f))

  const nameCol = hasHeader ? findColumn(first, HEADER_NAME) : -1
  const groupCol = hasHeader ? findColumn(first, HEADER_GROUP) : -1
  const phoneCol = hasHeader ? findColumn(first, HEADER_PHONE) : -1

  const add = (email: string, name?: string, group?: string, line = email, phoneRaw?: string) => {
    const cleaned = email.trim().toLowerCase()
    const phone = normalizePhone(phoneRaw)
    if (!cleaned && !phone) {
      // A row with a name but no address and no phone is a row somebody meant
      // to include. Returning silently made it vanish between the file and the
      // recipient list, with the count as the only clue.
      rejected.push({ line, reason: 'no-email' })
      return
    }
    if (cleaned && !EMAIL.test(cleaned)) {
      rejected.push({ line, reason: 'invalid-email' })
      return
    }
    // One person is one address or one phone, whichever they have.
    const identity = cleaned || phone!
    if (seen.has(identity)) {
      rejected.push({ line, reason: 'duplicate' })
      return
    }
    seen.add(identity)
    rows.push({
      ...(cleaned ? { email: cleaned } : {}),
      ...(phone ? { phone } : {}),
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(group?.trim() ? { group: group.trim() } : {}),
    })
  }

  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const fields = splitLine(line, delimiter)

    if (hasHeader) {
      add(
        fields[emailCol] ?? '',
        fields[nameCol] ?? undefined,
        fields[groupCol] ?? undefined,
        line,
        phoneCol >= 0 ? fields[phoneCol] : undefined,
      )
      continue
    }

    // No header: every field that looks like an address is one. This is the
    // "lim inn e-poster skilt med komma, semikolon eller linjeskift" case, and
    // it also rescues a table whose header we did not recognise.
    //
    // Re-split on ALL the delimiters rather than the majority one. A pasted
    // line can mix them ("a@b.no, c@d.no; e@f.no"), and picking whichever
    // occurs most left the rest glued to their neighbour and rejected as
    // malformed. Only safe here: with no header there is no column meaning to
    // preserve, so a field boundary costs nothing.
    const loose = line
      .split(/[,;\t]+/)
      .map((f) => f.trim())
      .filter(Boolean)
    const addresses = loose.filter((f) => EMAIL.test(f))
    if (addresses.length === 0) {
      if (loose.length) rejected.push({ line, reason: 'no-email' })
      continue
    }
    // A row like "Ola Nordmann,ola@x.no,Design": the address is the email, the
    // field before it is a name if it is not itself an address.
    if (addresses.length === 1 && loose.length > 1) {
      const at = loose.indexOf(addresses[0]!)
      const name = loose.slice(0, at).find((f) => f && !EMAIL.test(f))
      const group = loose.slice(at + 1).find((f) => f && !EMAIL.test(f))
      add(addresses[0]!, name, group, line)
    } else {
      for (const a of addresses) add(a, undefined, undefined, line)
    }
  }

  return { rows, rejected }
}
