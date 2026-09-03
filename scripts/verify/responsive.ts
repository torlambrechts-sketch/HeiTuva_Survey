/**
 * Rule-based mobile check for app routes (docs/RESPONSIVE.md § Verification bar).
 *
 * App screens have no mobile reference image — DECISIONS Q15 puts admin mobile
 * in v1 and RESPONSIVE.md supplies the patterns instead — so mobile is verified
 * against rules, not against a PNG. This measures the rules that can be
 * measured; "nothing clipped or overlapping" and "the named pattern was
 * applied" stay a human read of the screenshots the capture harness produces.
 *
 *   npm run verify:responsive
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { ROUTES } from '../../tests/routes.manifest'
import { gotoRoute, signIn } from '../../tests/helpers/session'

if (!process.argv.includes('--local')) config({ path: '.env.local' })

/** RESPONSIVE.md: reference viewport 390px, and the header must not overflow at
 *  320px either. */
const WIDTHS = [390, 320] as const
const MIN_TAP = 44

type Finding = { route: string; width: number; severity: 'blocker' | 'defect'; detail: string }

async function overflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

/**
 * Touch-area audit (RESPONSIVE.md rule 2).
 *
 * Rule 2 is about the touchable region, not the painted control: the control
 * keeps its design size and the hit area is grown around it. So this reports
 * two different things, and the second is the one that actually hurts users:
 *
 *   small    — the effective hit area is under 44px, so the control is hard to hit
 *   overlap  — two hit areas intersect, so one control steals the other's taps
 *
 * `::after` does not render on replaced elements, so `<select>` and `<input>`
 * are reported with their tag: they cannot take the overlay treatment and need
 * a different answer.
 */
async function touchAreas(page: Page) {
  return page.evaluate((min) => {
    const sel = 'a[href], button, select, input:not([type="hidden"]), [role="switch"]'
    type Box = { label: string; tag: string; painted: DOMRect; hit: DOMRect }

    const controls: Box[] = []
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (style.opacity === '0') continue
      // Disabled controls cannot be activated, so a tap area is meaningless —
      // the locked k=5 switch and the SSO switch are both deliberately inert.
      if ((el as HTMLButtonElement).disabled) continue
      if (el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('aria-disabled')) continue
      // Inside an inert or aria-hidden subtree: not focusable, not hit-testable
      // and not exposed to assistive tech, so it has no touch area to overlap.
      // The new-survey wizard marks the app header inert while it is open, and
      // without this its close button and the header avatar — which really do
      // occupy the same corner — read as a genuine overlap.
      if (el.closest('[inert]') || el.closest('[aria-hidden="true"]')) continue
      // The sr-only idiom: clipped to 1x1 but still focusable. It is reachable
      // by keyboard, never by thumb, so a touch area does not apply. Tailwind's
      // .sr-only uses the legacy `clip`, not `clip-path` — checking only the
      // latter missed it and reported a 1x1 "touch target".
      const clipped = style.clipPath !== 'none' || (style.clip !== 'auto' && style.clip !== '')
      if (clipped && r.width <= 2 && r.height <= 2) continue

      // The hit area an ::after overlay produces: centred on the control,
      // at least min in each axis. Read it off the element when one is present
      // so a control that already carries the treatment measures as it really is.
      // Replaced elements never render ::after, so crediting one here would
      // silently pass a <select> that is still 39px to the thumb.
      const replaced = ['select', 'input', 'textarea'].includes(el.tagName.toLowerCase())
      const after = getComputedStyle(el, '::after')
      const hasOverlay = !replaced && after.content !== 'none' && after.position === 'absolute'
      const w = hasOverlay ? Math.max(r.width, parseFloat(after.width) || 0) : r.width
      const h = hasOverlay ? Math.max(r.height, parseFloat(after.height) || 0) : r.height
      const hit = new DOMRect(
        r.x - (w - r.width) / 2,
        r.y - (h - r.height) / 2,
        w,
        h,
      )
      controls.push({
        label:
          el.getAttribute('aria-label') ||
          (el.textContent ?? '').trim().slice(0, 40) ||
          `<${el.tagName.toLowerCase()}>`,
        tag: el.tagName.toLowerCase(),
        painted: r,
        hit,
      })
    }

    const small = controls
      .filter((c) => c.hit.width < min || c.hit.height < min)
      .map((c) => ({
        label: c.label,
        tag: c.tag,
        w: Math.round(c.painted.width),
        h: Math.round(c.painted.height),
      }))

    // Every pair whose hit areas intersect. O(n^2) is fine at these counts and
    // is the check the spec asks for — comparing bounding boxes, not eyeballing.
    const overlaps: { a: string; b: string; area: number }[] = []
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]!.hit
        const b = controls[j]!.hit
        const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (dx > 0.5 && dy > 0.5) {
          overlaps.push({
            a: controls[i]!.label,
            b: controls[j]!.label,
            area: Math.round(dx * dy),
          })
        }
      }
    }

    return { small, overlaps, total: controls.length }
  }, MIN_TAP)
}

/** RESPONSIVE.md rule 3: tokens never change across breakpoints. Read them off
 *  the live page rather than trusting the stylesheet. */
async function tokens(page: Page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    const names = ['--bg', '--sf', '--sf2', '--ink', '--mut', '--line', '--ac', '--ac2', '--ac3', '--sbg']
    return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n).trim()]))
  })
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const findings: Finding[] = []
  let desktopTokens: Record<string, string> | null = null

  try {
    // Baseline the tokens once at desktop so mobile can be compared to them.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
      const page = await ctx.newPage()
      await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
      desktopTokens = await tokens(page)
      await ctx.close()
    }

    for (const width of WIDTHS) {
      for (const spec of ROUTES) {
        // One capture per route; the manifest's extra states are the capture
        // harness's job, this is about layout.
        //
        // Every route is swept, whatever its first state is called. Requiring
        // the name 'default' quietly dropped the new-survey wizard — whose
        // first state is 'formal' — so a screen RESPONSIVE.md names a pattern
        // for was never measured at any width. A route with no states at all
        // has nothing to visit.
        if (spec.states.length === 0) continue

        const ctx = await browser.newContext({
          viewport: { width, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          locale: 'nb-NO',
        })
        const page = await ctx.newPage()
        try {
          if (spec.as !== 'anon') await signIn(page, spec.as, BASE_URL)
          await gotoRoute(page, spec.route, spec.as, BASE_URL)
          await page.evaluate(() => document.fonts.ready)

          const { scrollWidth, clientWidth } = await overflow(page)
          if (scrollWidth > clientWidth) {
            findings.push({
              route: spec.label,
              width,
              severity: 'blocker',
              detail: `horizontal scroll: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
            })
          }

          const { small, overlaps, total } = await touchAreas(page)
          for (const t of small) {
            findings.push({
              route: spec.label,
              width,
              severity: 'defect',
              detail: `touch area ${t.w}x${t.h} (<${MIN_TAP}) on <${t.tag}>: ${t.label}`,
            })
          }
          // An expansion that swallows a neighbour's taps is worse than a small
          // control, so this is a blocker, not a defect.
          for (const o of overlaps) {
            findings.push({
              route: spec.label,
              width,
              severity: 'blocker',
              detail: `hit areas overlap by ${o.area}px²: "${o.a}" / "${o.b}"`,
            })
          }

          const mobileTokens = await tokens(page)
          for (const [name, value] of Object.entries(mobileTokens)) {
            if (desktopTokens![name] !== value) {
              findings.push({
                route: spec.label,
                width,
                severity: 'defect',
                detail: `token ${name} is "${value}" at ${width}px but "${desktopTokens![name]}" at desktop`,
              })
            }
          }

          const status =
            scrollWidth > clientWidth ? 'OVERFLOW' : overlaps.length ? 'OVERLAP' : small.length ? 'SMALL' : 'ok'
          console.log(
            `  ${status.padEnd(8)} ${spec.label.padEnd(26)} ${width}px  scrollWidth=${scrollWidth}` +
              `  controls=${total}  small=${small.length}  overlaps=${overlaps.length}`,
          )
        } catch (e) {
          findings.push({
            route: spec.label,
            width,
            severity: 'blocker',
            detail: `could not be measured: ${e instanceof Error ? e.message : e}`,
          })
          console.log(`  ERROR    ${spec.label} ${width}px: ${e instanceof Error ? e.message : e}`)
        } finally {
          await ctx.close()
        }
      }
    }
  } finally {
    await browser.close()
    server.stop()
  }

  const blockers = findings.filter((f) => f.severity === 'blocker')
  console.log(`\n${findings.length} finding(s), ${blockers.length} blocker(s)`)
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.route} @${f.width}px — ${f.detail}`)
  }
  process.exit(blockers.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
