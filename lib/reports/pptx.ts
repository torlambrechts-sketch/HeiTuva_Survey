import 'server-only'

import PptxGenJS from 'pptxgenjs'
import type { ComposedDocument, ComposedSection } from '@/app/(app)/rapporter/editor-types'
import type { PrintLabels } from './print'

/**
 * The slide form of an already-composed document (DECISIONS Q10, Phase 6).
 *
 * Same contract as `renderReportHtml`: it takes `compose_report`'s output and
 * nothing else, so a deck can only ever show what the reader was allowed to
 * see. A withheld cell is a withheld cell on the slide too. Every branch below
 * mirrors a branch in print.ts on purpose — a section type the PDF prints as
 * bars is bars here, prose is prose, and a section with no composer says so
 * rather than borrowing another section's numbers.
 *
 * Shapes, not images. pptxgenjs sizes images with `image-size`, which carries
 * an unpatched advisory for exotic formats (ICNS/JXL/HEIF); nothing here calls
 * `addImage`, and the only reference to `image-size` in the library's bundle is
 * inside a commented-out function. The deck is text and rectangles.
 */

// The theme, in the hex pptxgenjs wants (no '#').
const INK = '191510'
const MUT = '5F5849'
const LINE = 'E8DFC9'
const AC = 'F5C64A'
const SF = 'FFFDF6'
const SF2 = 'F3EEE2' // --sf2 flattened onto --sf; slides have no alpha tracks

const W = 10 // inches, 16:9
const MARGIN = 0.6
const BODY_TOP = 1.35
const BODY_W = W - MARGIN * 2
const ROW_H = 0.34
const ROWS_PER_SLIDE = 11

type Slide = ReturnType<PptxGenJS['addSlide']>

function heading(slide: Slide, title: string, labels: PrintLabels) {
  slide.background = { color: SF }
  slide.addText(labels.org.toUpperCase(), {
    x: MARGIN, y: 0.35, w: BODY_W, h: 0.25,
    fontFace: 'DM Sans', fontSize: 8, color: MUT, charSpacing: 2,
  })
  slide.addText(title, {
    x: MARGIN, y: 0.6, w: BODY_W, h: 0.55,
    fontFace: 'Playfair Display', fontSize: 22, color: INK, bold: false,
  })
  slide.addShape('rect', { x: MARGIN, y: BODY_TOP - 0.12, w: BODY_W, h: 0.01, fill: { color: LINE }, line: { color: LINE } })
}

/** One bar row: label, track, fill (or the withheld word), value. Mirrors `barHtml`. */
function bar(slide: Slide, y: number, label: string | null, value: number | null | undefined, withheld: string) {
  const gated = value == null
  const labelW = 2.6
  const valueW = 0.9
  const trackX = MARGIN + labelW + 0.15
  const trackW = BODY_W - labelW - valueW - 0.3
  slide.addText(label ?? '', {
    x: MARGIN, y, w: labelW, h: ROW_H, fontFace: 'DM Sans', fontSize: 10, color: INK, valign: 'middle',
  })
  slide.addShape('roundRect', {
    x: trackX, y: y + 0.1, w: trackW, h: ROW_H - 0.2, rectRadius: 0.07,
    fill: { color: SF2 }, line: { color: SF2 },
  })
  if (!gated) {
    const pct = Math.max(0, Math.min(1, value / 5))
    if (pct > 0) {
      slide.addShape('roundRect', {
        x: trackX, y: y + 0.1, w: Math.max(0.12, trackW * pct), h: ROW_H - 0.2, rectRadius: 0.07,
        fill: { color: AC }, line: { color: AC },
      })
    }
  }
  slide.addText(gated ? withheld : value.toFixed(1), {
    x: trackX + trackW + 0.15, y, w: valueW, h: ROW_H,
    fontFace: 'DM Sans', fontSize: gated ? 8.5 : 10, color: gated ? MUT : INK, bold: !gated,
    align: 'right', valign: 'middle',
  })
}

/** Label/value pairs in two columns. Mirrors the `.cell` rows. */
function cellRow(slide: Slide, y: number, left: string, right: string, rightMuted = false) {
  slide.addText(left, {
    x: MARGIN, y, w: BODY_W - 1.6, h: ROW_H, fontFace: 'DM Sans', fontSize: 10, color: INK, valign: 'middle',
  })
  slide.addText(right, {
    x: MARGIN + BODY_W - 1.5, y, w: 1.5, h: ROW_H, fontFace: 'DM Sans',
    fontSize: rightMuted ? 8.5 : 10, color: rightMuted ? MUT : INK, align: 'right', valign: 'middle',
  })
  slide.addShape('rect', { x: MARGIN, y: y + ROW_H, w: BODY_W, h: 0.005, fill: { color: LINE }, line: { color: LINE } })
}

function prose(slide: Slide, text: string, muted = false) {
  slide.addText(text, {
    x: MARGIN, y: BODY_TOP, w: BODY_W, h: 5.6 - BODY_TOP,
    fontFace: 'DM Sans', fontSize: muted ? 10 : 12, color: muted ? MUT : INK, valign: 'top',
    paraSpaceAfter: 6,
  })
}

/**
 * Rows are paginated: a partition with 30 groups becomes three slides with the
 * same title, not one slide with rows off the bottom.
 */
function paginate<T>(items: T[], per: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per))
  return out.length ? out : [[]]
}

function sectionSlides(pptx: PptxGenJS, section: ComposedSection, labels: PrintLabels) {
  const title = labels.sectionLabels[section.key] ?? section.key
  const extra = section.extra ?? undefined
  const open = () => {
    const s = pptx.addSlide()
    heading(s, title, labels)
    return s
  }

  if (section.pending) {
    prose(open(), labels.pending, true)
    return
  }
  if (section.unavailable) {
    prose(open(), labels.unavailable, true)
    return
  }
  if (section.key === 'method' && extra && typeof extra.k === 'number') {
    prose(open(), extra.k === 0 ? labels.methodAttributed : labels.methodK.replace('{k}', String(extra.k)), false)
    return
  }
  if (section.key === 'per_virksomhet') {
    prose(open(), labels.perVirksomhet, true)
    return
  }

  if (extra?.quotes) {
    if (extra.quotes.length === 0) return
    for (const page of paginate(extra.quotes, 6)) {
      const s = open()
      s.addText(
        page.map((q) => ({ text: `«${q.text}»`, options: { breakLine: true, paraSpaceAfter: 10 } })),
        { x: MARGIN, y: BODY_TOP, w: BODY_W, h: 5.6 - BODY_TOP, fontFace: 'DM Sans', fontSize: 11, color: INK, valign: 'top' },
      )
    }
    return
  }

  if (extra?.themes) {
    if (extra.themes.length === 0) return
    for (const page of paginate(extra.themes, ROWS_PER_SLIDE)) {
      const s = open()
      page.forEach((th, i) =>
        cellRow(
          s, BODY_TOP + i * (ROW_H + 0.04),
          labels.themeMentions.replace('{label}', th.label).replace('{count}', String(th.count)),
          '',
        ),
      )
    }
    return
  }

  if (extra?.points) {
    if (extra.points.length === 0) return
    for (const page of paginate(extra.points, ROWS_PER_SLIDE)) {
      const s = open()
      page.forEach((pt, i) =>
        bar(s, BODY_TOP + i * (ROW_H + 0.04), labels.trendRound.replace('{n}', String(pt.round_no)), pt.avg, labels.suppressedRow),
      )
    }
    return
  }

  if (extra?.drivers) {
    if (extra.drivers.length === 0) return
    for (const page of paginate(extra.drivers, ROWS_PER_SLIDE)) {
      const s = open()
      page.forEach((d, i) => bar(s, BODY_TOP + i * (ROW_H + 0.04), d.text, d.avg, labels.insufficient))
    }
    return
  }

  if (extra && typeof extra.invited === 'number') {
    const s = open()
    const stats: [string, string][] = [
      [labels.invited, String(extra.invited)],
      [labels.responded, String(extra.responded ?? 0)],
    ]
    if (extra.completion !== null && extra.completion !== undefined) {
      stats.push([labels.completion, `${Math.round(extra.completion * 100)} %`])
    }
    stats.forEach(([l, v], i) => cellRow(s, BODY_TOP + i * (ROW_H + 0.04), l, v))
    return
  }

  if (section.key === 'summary') {
    const findings = (extra?.findings ?? []).filter((f) => f.text)
    const s = open()
    if (findings.length === 0) {
      prose(s, labels.summaryEmpty, true)
      return
    }
    s.addText(
      findings.map((f) => ({ text: f.text ?? '', options: { breakLine: true, paraSpaceAfter: 8 } })),
      { x: MARGIN, y: BODY_TOP, w: BODY_W, h: 5.6 - BODY_TOP, fontFace: 'DM Sans', fontSize: 12, color: INK, valign: 'top' },
    )
    return
  }

  if (section.rows) {
    if (section.rows.length === 0) return
    for (const page of paginate(section.rows, ROWS_PER_SLIDE)) {
      const s = open()
      page.forEach((r, i) =>
        bar(s, BODY_TOP + i * (ROW_H + 0.04), r.label, r.suppressed ? null : r.avg, labels.suppressedRow),
      )
    }
    return
  }

  if (section.cells) {
    if (section.cells.length === 0) return
    for (const page of paginate(section.cells, ROWS_PER_SLIDE)) {
      const s = open()
      page.forEach((c, i) => {
        const withheld = c.insufficient_data || c.n === null
        const value = withheld ? labels.insufficient : c.avg !== null ? c.avg.toFixed(1) : `n=${c.n}`
        cellRow(s, BODY_TOP + i * (ROW_H + 0.04), c.text ?? '', value, withheld)
      })
    }
  }
}

export async function renderReportPptx(doc: ComposedDocument, labels: PrintLabels): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = labels.org
  pptx.title = doc.title ?? ''

  // Title slide
  const first = pptx.addSlide()
  first.background = { color: SF }
  first.addText(labels.org.toUpperCase(), {
    x: MARGIN, y: 1.6, w: BODY_W, h: 0.3, fontFace: 'DM Sans', fontSize: 9, color: MUT, charSpacing: 2,
  })
  first.addText(doc.title ?? '', {
    x: MARGIN, y: 1.95, w: BODY_W, h: 1.4, fontFace: 'Playfair Display', fontSize: 34, color: INK, valign: 'top',
  })
  first.addText(labels.generated, {
    x: MARGIN, y: 3.5, w: BODY_W, h: 0.35, fontFace: 'DM Sans', fontSize: 10, color: MUT,
  })
  first.addShape('rect', { x: MARGIN, y: 3.95, w: 1.2, h: 0.06, fill: { color: AC }, line: { color: AC } })

  for (const section of doc.sections ?? []) sectionSlides(pptx, section, labels)

  const hidden = doc.suppressed_groups?.length ?? 0
  if (hidden > 0) {
    const s = pptx.addSlide()
    s.background = { color: SF }
    s.addText(labels.suppressedNote.replace('{count}', String(hidden)), {
      x: MARGIN, y: 2.4, w: BODY_W, h: 0.8, fontFace: 'DM Sans', fontSize: 10, color: MUT,
    })
  }

  const out = await pptx.write({ outputType: 'nodebuffer' })
  return out as Buffer
}
