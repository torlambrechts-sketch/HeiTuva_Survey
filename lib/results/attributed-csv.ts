import type { Attributed, AttributedRow } from './types'

/**
 * The attributed register as a CSV file — DECISIONS Q43.
 *
 * Kept out of the route so the escaping has tests of its own. A route can only
 * be checked through a browser, and the cases that break a CSV are the ones a
 * fixture rarely contains: a supplier called «Bergen Logistikk, avd. Nord», an
 * answer with a line break in it, a value that begins with `=`.
 *
 * FORMAT, decided rather than drawn — the bundle's own handler is a toast
 * (`onAttribExport`, :4880), so there is nothing to be pixel-perfect to. The
 * choices and their reasons, logged as D96:
 *
 *   · semicolon, not comma — Norwegian Excel's list separator, and the app's
 *     own importer already accepts `;` (`lib/send/import.ts:86`), so a file
 *     exported here parses if it is pasted back in;
 *   · a UTF-8 BOM — without it Excel reads æ, ø and å as mojibake, and the
 *     importer strips it again (`import.ts:107`);
 *   · CRLF line endings, which is what RFC 4180 says and what Excel expects.
 *
 * Nothing here is gated, because nothing in the attributed path is: `k` is 0
 * and the rows are named by design. The gate is the route, which calls
 * `attributed_results` as the viewer.
 */
const SEP = ';'
const EOL = '\r\n'
export const BOM = '﻿'

/**
 * One field, escaped.
 *
 * The leading-character guard is not cosmetic. Excel and Sheets evaluate a cell
 * that starts with `=`, `+`, `-` or `@` as a formula, so a free-text answer of
 * `=HYPERLINK(...)` becomes a live link in a spreadsheet someone opens without
 * thinking about where the text came from. Respondent free text is exactly the
 * untrusted input that attack needs, so the field is prefixed with a single
 * quote — the convention every spreadsheet reads as "this is text".
 */
export function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/**
 * An answer value as one cell.
 *
 * `answers.value` is jsonb, so every question type arrives differently: a
 * string for yesno and choice, a number for scale, an array for ranking and
 * multi-choice, an object for matrix. Rendering an object as `[object Object]`
 * is the kind of fabricated-looking value CLAUDE.md forbids, so each shape gets
 * a real rendering and an unknown one falls back to its JSON rather than to a
 * lie.
 */
export function csvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nei'
  if (Array.isArray(value)) return value.map((v) => csvValue(v)).join(' · ')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${csvValue(v)}`)
      .join(' · ')
  }
  return String(value)
}

export type AttributedCsvLabels = {
  /** Column headings, from next-intl — the file is as translated as the screen. */
  name: string
  email: string
  status: string
  respondedAt: string
  /** One label per `AttributedRow['status']`. */
  statusLabels: Record<AttributedRow['status'], string>
}

export function attributedCsv(data: Attributed, labels: AttributedCsvLabels): string {
  const questions = data.questions ?? []
  const header = [
    labels.name,
    labels.email,
    labels.status,
    labels.respondedAt,
    ...questions.map((q) => q.text),
  ]

  const lines = [header.map(csvField).join(SEP)]

  for (const row of data.rows ?? []) {
    const byQuestion = new Map(
      (row.answers ?? []).map((a) => [a.question_id, a] as const),
    )
    const cells = [
      row.name ?? '',
      row.email ?? '',
      labels.statusLabels[row.status] ?? row.status,
      // Date only. `responded_at` on an attributed row is a real timestamp —
      // the hour-truncation rule is about ANONYMOUS responses — but a register
      // of suppliers is read by date, and a minute of it invites nobody to
      // reason about who answered just after whom.
      row.responded_at ? row.responded_at.slice(0, 10) : '',
      ...questions.map((q) => {
        const a = byQuestion.get(q.id)
        if (!a) return ''
        const v = csvValue(a.value)
        return a.comment ? (v ? `${v} — ${a.comment}` : a.comment) : v
      }),
    ]
    lines.push(cells.map(csvField).join(SEP))
  }

  return BOM + lines.join(EOL) + EOL
}

/** `Aktsomhetsvurdering leverandør` → `aktsomhetsvurdering-leverandor.csv`. */
export function attributedCsvFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'undersokelse'}.csv`
}
