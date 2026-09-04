import 'server-only'

import type { ComposedDocument, ComposedSection } from '@/app/(app)/rapporter/editor-types'

/**
 * The printable form of an already-composed document.
 *
 * It takes `compose_report`'s output and nothing else. That is the whole point:
 * the export must be able to say exactly what the reader was allowed to see,
 * and it can only do that if it never reaches past the composition to the raw
 * aggregates. A withheld cell prints as withheld.
 *
 * Deliberately plain HTML with inlined styles rather than the app's Tailwind
 * build: the printer loads this string with no network at all (CSP would block
 * a font CDN inside a headless browser on Vercel anyway), so anything not in
 * the string does not exist. The type stack falls back to the system serif,
 * which is the honest outcome — a report that silently lost Playfair Display
 * would still be a correct report.
 */

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export type PrintLabels = {
  org: string
  generated: string
  suppressedRow: string
  suppressedNote: string
  insufficient: string
  sectionLabels: Record<string, string>
}

export function renderReportHtml(doc: ComposedDocument, labels: PrintLabels): string {
  const sections = (doc.sections ?? []).map((s) => sectionHtml(s, labels)).join('\n')
  const hidden = doc.suppressed_groups?.length ?? 0

  return `<!doctype html>
<html lang="no"><head><meta charset="utf-8">
<title>${esc(doc.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  :root {
    --bg:#FCF6E9; --sf:#FFFDF6; --sf2:rgba(25,21,16,.05); --ink:#191510;
    --mut:#5F5849; --line:#E8DFC9; --ac:#F5C64A;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; background:#fff; color:var(--ink);
    font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size:11pt; line-height:1.5;
  }
  .org { font-size:8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); }
  h1 { font-family:"Playfair Display", Georgia, serif; font-weight:500; font-size:22pt;
       line-height:1.2; margin:4pt 0 2pt; }
  .meta { font-size:9pt; color:var(--mut); }
  .rule { height:1px; background:var(--line); margin:12pt 0 14pt; }
  section { margin-bottom:16pt; break-inside:avoid; }
  h2 { font-size:11.5pt; font-weight:700; margin:0 0 6pt; }
  .row { display:flex; align-items:center; gap:10pt; margin-bottom:5pt; }
  .row .label { width:44mm; flex:none; font-size:9.5pt; }
  .row .track { flex:1; height:9pt; border-radius:5pt; background:var(--sf2); overflow:hidden; }
  .row .fill { display:block; height:100%; border-radius:5pt; background:var(--ac); }
  .row .value { width:26mm; flex:none; text-align:right; font-size:9.5pt; font-weight:600; }
  .cell { display:flex; justify-content:space-between; gap:10pt; margin-bottom:4pt; }
  .withheld { font-size:8.5pt; font-weight:400; color:var(--mut); }
  .note { font-size:8.5pt; color:var(--mut); line-height:1.45; }
</style></head>
<body>
  <div class="org">${esc(labels.org)}</div>
  <h1>${esc(doc.title)}</h1>
  <div class="meta">${esc(labels.generated)}</div>
  <div class="rule"></div>
  ${sections}
  ${hidden > 0 ? `<p class="note">${esc(labels.suppressedNote.replace('{count}', String(hidden)))}</p>` : ''}
</body></html>`
}

function sectionHtml(section: ComposedSection, labels: PrintLabels): string {
  const title = esc(labels.sectionLabels[section.key] ?? section.key)

  if (section.rows) {
    if (section.rows.length === 0) return ''
    const rows = section.rows
      .map((r) => {
        const withheld = r.suppressed || r.avg === null
        const pct = withheld ? 0 : Math.max(0, Math.min(100, (r.avg! / 5) * 100))
        return `<div class="row">
        <span class="label">${esc(r.label)}</span>
        <span class="track">${withheld ? '' : `<span class="fill" style="width:${pct.toFixed(1)}%"></span>`}</span>
        <span class="value">${
          withheld ? `<span class="withheld">${esc(labels.suppressedRow)}</span>` : esc(r.avg!.toFixed(1))
        }</span>
      </div>`
      })
      .join('\n')
    return `<section><h2>${title}</h2>${rows}</section>`
  }

  if (section.cells) {
    if (section.cells.length === 0) return ''
    const cells = section.cells
      .map((c) => {
        const withheld = c.insufficient_data || c.n === null
        const value = withheld
          ? `<span class="withheld">${esc(labels.insufficient)}</span>`
          : c.avg !== null
            ? esc(c.avg.toFixed(1))
            : `n=${esc(c.n)}`
        return `<div class="cell"><span>${esc(c.text)}</span><span>${value}</span></div>`
      })
      .join('\n')
    return `<section><h2>${title}</h2>${cells}</section>`
  }

  return ''
}
