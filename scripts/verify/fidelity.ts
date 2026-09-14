/**
 * F2 — the drawing beside the app, for a person to look at.
 *
 * ── WHY THIS DID NOT EXIST, WHICH IS THE POINT ─────────────────────────────
 *
 * The repository already contains BOTH halves and has never put them together:
 *
 *   · `artifacts/reference-<key>/` — renders OF THE DRAWING (`verify:reference`)
 *   · `artifacts/phase-N/`          — renders OF THE APP      (`verify:browser`)
 *
 * `grep -rln "reference-v6" scripts/ tests/` returns exactly one file: the one
 * that WRITES them. Nothing has ever read them back.
 *
 * `tests/visual/screens.spec.ts` states the gap correctly in its own header —
 * «They are NOT proof of fidelity to the design — they were generated from this
 * implementation, so they can only ever confirm it still looks like itself» —
 * and then names `verify:reference` as «the fidelity gate», which is false in
 * its second clause: that script renders the bundle and compares it against its
 * own committed pictures of the bundle. It never looks at the app. That
 * sentence is corrected in the same commit as this file.
 *
 * ── WHAT THIS CAN ESTABLISH, AND WHAT IT CANNOT ────────────────────────────
 *
 * CAN: that a screen does or does not look like the drawing it is paired with.
 * A person opens the composite and sees it.
 *
 * CANNOT, and both of these are stated in the run's own output rather than only
 * here:
 *
 *  1. **Whether the drawing is what we decided to build.** Feltarbeid, the
 *     Oversikt tab, Målgruppe's drop-off half, the nps card, the cx workspace,
 *     uitest, quizPass/quizTries/certificate, the thirteen integrations and
 *     resume are all DECIDED-NOT-BUILT. A difference against those is a
 *     decision, not drift, and this script cannot tell them apart.
 *  2. **Anything about a surface the app never built.** A screen that does not
 *     exist produces no capture, so it appears here as a MISSING ROW and not as
 *     a difference. **That is precisely the class the 2026-09-14 audit was
 *     written for** — the survey list lost a six-column table, a view switcher
 *     and a «På tvers» card, and every one of them is invisible to a picture
 *     comparison because there is no picture of the thing that is absent. The
 *     rows are printed so the blindness is at least enumerated.
 *
 * And a third, which is why this REPORTS rather than ASSERTS: the two renders
 * show different data, different text lengths and different states. A pixel
 * diff between them would be red on every screen and worth nothing. A gate that
 * fails everywhere on its first run teaches nothing and gets switched off.
 *
 * ── IT READS COMMITTED RENDERS RATHER THAN RE-RENDERING ────────────────────
 *
 * Deliberate. CLAUDE.md: a baseline re-rendered under a newer Chromium silently
 * stops being the thing its phases were judged against. So this composites what
 * `verify:reference` and `verify:browser` already produced, and says when one is
 * missing instead of quietly making a fresh one.
 *
 * ── THE PAIRING IS DECLARED ────────────────────────────────────────────────
 *
 * Nineteen of the thirty-five names match by accident of naming and sixteen do
 * not (`builder` -> `bygg.default`, `rapporter` -> `rapporter.lovpalagte`). A
 * derived pairing would be an enumeration of the names that happen to agree, and
 * a WRONG pairing is the «captured under the wrong name» failure this project
 * already knows. So every pair is written down, and a bundle screen with no
 * entry is an error rather than a silence.
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

/** The drawing set this run compares against is the LAST `artifacts/reference-*`
 *  directory, derived in `targetBundleDir()` rather than named here — so
 *  promoting a handoff is one edit in `reference.ts` and none in this file. */
const OUT = 'artifacts/fidelity'

/**
 * bundle screen -> the app capture that is the same screen, as
 * `<label>.<state>`; the phase directory is resolved by looking.
 *
 * `null` means the app has NO CAPTURE to compare against, and the note says
 * which kind of nothing it is — the two are different and the report keeps them
 * apart:
 *   · «not in the capture manifest» — the app HAS this state; nobody declared it
 *     in `tests/routes.manifest.ts`, so there is no picture of it.
 *   · «not built» — there is no such screen. Nothing here can say more about it.
 */
type Pair = { app: string | null; note?: string }

const PAIRS: Record<string, Pair> = {
  'admin-brukere': { app: 'admin-brukere.default' },
  'admin-firma': { app: 'admin-firma.default' },
  'admin-grupper': { app: 'admin-grupper.default' },
  'admin-integrasjoner': { app: 'admin-integrasjoner.default' },
  'admin-malgrupper': { app: 'admin-malgrupper.default' },
  'admin-personvern': { app: 'admin-personvern.default' },
  'admin-profil': { app: 'admin-profil.default' },
  'admin-valg': { app: 'admin-valg.default' },
  bibliotek: { app: 'bibliotek-maler.default' },
  'bibliotek-bank': { app: 'bibliotek-bank.default' },
  builder: { app: 'bygg.default' },
  dashboard: { app: 'dashboard.default' },
  hjelp: { app: 'hjelp.default' },
  live: { app: 'live.default' },
  'live-revealed': { app: null, note: 'not in the capture manifest — the app reveals, no state declared' },
  oppgaver: { app: 'oppgaver.default' },
  'oppgaver-oppgaver': { app: null, note: 'not in the capture manifest — /oppgaver?type=oppgaver is built' },
  'oppgaver-tilbakemeldinger': { app: null, note: 'not in the capture manifest — /oppgaver?type=tilbakemeldinger is built' },
  oversikt: { app: 'oversikt.default' },
  profil: { app: 'profil.default' },
  'rapport-editor': { app: 'rapport-editor.innhold' },
  'rapport-editor-del': { app: 'rapport-editor.del' },
  'rapport-editor-filter': { app: 'rapport-editor.filter' },
  rapporter: { app: 'rapporter.lovpalagte' },
  'rapporter-mine': { app: 'rapporter.mine-rapporter' },
  'rapporter-standard': { app: 'rapporter.standardmaler' },
  respondent: { app: 'respondent.default' },
  'respondent-kommentar': { app: null, note: 'not in the capture manifest — the comment box is built' },
  'respondent-kommentar-lagret': { app: null, note: 'not in the capture manifest — the saved state is built' },
  'respondent-takk': { app: null, note: 'not in the capture manifest — the thanks screen is built' },
  'respondent-takk-sendt': { app: null, note: 'not in the capture manifest — the thanks screen is built' },
  resultater: { app: 'resultater.default' },
  send: { app: 'send.default' },
  undersokelser: { app: 'undersokelser.default' },
  wizard: { app: 'undersokelser-ny.formal' },
}

async function targetBundleDir(): Promise<string> {
  const dirs = (await readdir('artifacts')).filter((d) => d.startsWith('reference-'))
  if (dirs.length === 0) throw new Error('no artifacts/reference-* — run `npm run verify:reference`')
  // `reference-v6` sorts after `reference-v1`; two digits would break that, and
  // it is the one place a name is parsed, so it is asserted rather than assumed.
  const keys = dirs.map((d) => d.slice('reference-'.length))
  if (keys.some((k) => /^v\d\d/.test(k))) {
    throw new Error(`a two-digit bundle key breaks lexical ordering here: ${keys.join(', ')}`)
  }
  return `artifacts/${dirs.sort().at(-1)!}`
}

async function findAppShot(stem: string): Promise<string | null> {
  const phases = (await readdir('artifacts')).filter((d) => d.startsWith('phase-'))
  for (const p of phases.sort()) {
    const f = `artifacts/${p}/${stem}.desktop.png`
    if (existsSync(f)) return f
  }
  return null
}

/** Side by side, each scaled to the same width so vertical content differences
 *  are what the eye lands on. Composited in the browser because the project has
 *  no image library and does not need one for this. */
const COMPOSITE = (name: string, left: string, right: string) => `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin:0; background:#FCF6E9; font:13px/1.4 system-ui, sans-serif; color:#191510 }
  h1 { font:600 16px/1.2 system-ui, sans-serif; margin:14px 16px 4px }
  .k { margin:0 16px 12px; color:#5F5849; font-size:11.5px }
  .row { display:flex; gap:16px; padding:0 16px 16px; align-items:flex-start }
  .col { flex:1 1 0; min-width:0 }
  .cap { font-weight:700; font-size:12px; margin:0 0 6px }
  img { width:100%; display:block; border:1px solid #E8DFC9; border-radius:8px; background:#fff }
</style>
<h1>${name}</h1>
<p class="k">left: the drawing (verify:reference) &nbsp;·&nbsp; right: the app (verify:browser) &nbsp;·&nbsp; different data by design — look at STRUCTURE, not pixels</p>
<div class="row">
  <div class="col"><p class="cap">TEGNINGEN</p><img src="${left}"></div>
  <div class="col"><p class="cap">APPEN</p><img src="${right}"></div>
</div>`

async function main() {
  const bundleDir = await targetBundleDir()
  const key = bundleDir.slice('artifacts/reference-'.length)
  await mkdir(OUT, { recursive: true })

  const drawn = (await readdir(bundleDir))
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .sort()

  const undeclared = drawn.filter((d) => !(d in PAIRS))
  if (undeclared.length) {
    throw new Error(
      `${undeclared.length} screen(s) in ${bundleDir} have no PAIRS entry: ${undeclared.join(', ')}\n` +
        'Declare each one — as an app capture, or as null with the reason. A screen the ' +
        'drawing has and this file does not mention is exactly the silence this script exists to break.',
    )
  }

  console.log(`\nFIDELITY — the drawing beside the app`)
  console.log(`  drawing: ${bundleDir}   (${drawn.length} screens, bundle ${key})`)
  console.log(`  app:     artifacts/phase-*/  (desktop, 1440px)\n`)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()

  let composed = 0
  const missing: { name: string; note: string }[] = []

  try {
    for (const name of drawn) {
      const pair = PAIRS[name]!
      if (pair.app === null) {
        missing.push({ name, note: pair.note ?? 'no app capture declared' })
        console.log(`  --   ${name.padEnd(30)} no app capture — ${pair.note ?? ''}`)
        continue
      }
      const shot = await findAppShot(pair.app)
      if (!shot) {
        missing.push({ name, note: `expected artifacts/phase-*/${pair.app}.desktop.png — run verify:browser` })
        console.log(`  MISS ${name.padEnd(30)} ${pair.app}.desktop.png not found`)
        continue
      }

      const left = pathToFileURL(resolve(`${bundleDir}/${name}.png`)).href
      const right = pathToFileURL(resolve(shot)).href

      /* A REAL FILE, NAVIGATED TO — not `setContent`.
         The first version used `page.setContent`, which leaves the document on
         `about:blank`, and a document with no origin cannot load a `file://`
         subresource. Every composite came out as two broken-image icons and the
         run printed `ok` on all twenty-eight: green for something that
         structurally could not be seen, which is the shape CLAUDE.md lists six
         instances of. It is now seven, and this one was committed by the script
         written to find that class of thing. */
      const html = `${OUT}/.${name}.html`
      await writeFile(html, COMPOSITE(name, left, right))
      await page.goto(pathToFileURL(resolve(html)).href, { waitUntil: 'load' })

      /* AND THE GUARD, because navigating is a fix and `naturalWidth` is the
         evidence. Without it the next thing that stops the images loading — a
         renamed directory, a sandbox flag — is silent in exactly the same way. */
      const decoded = await page.evaluate(async () => {
        await Promise.all(
          [...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))),
        )
        return [...document.images].map((i) => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }))
      })
      const blank = decoded.filter((d) => d.w === 0 || d.h === 0)
      if (blank.length) {
        throw new Error(
          `composite for "${name}" has ${blank.length} image(s) that did not decode: ` +
            blank.map((b) => b.src).join(', '),
        )
      }

      const out = `${OUT}/${name}.png`
      await page.screenshot({ path: out, fullPage: true })
      await rm(html, { force: true })
      composed++
      const [l, r] = decoded
      console.log(
        `  ok   ${name.padEnd(30)} ${pair.app.padEnd(30)} ` +
          `drawing ${l!.w}x${l!.h}  app ${r!.w}x${r!.h}  -> ${out}`,
      )
    }
  } finally {
    await browser.close()
  }

  const report = [
    `# Fidelity composites — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Drawing: \`${bundleDir}\` (${drawn.length} screens). App: \`artifacts/phase-*/*.desktop.png\`.`,
    ``,
    `${composed} composite(s) in \`${OUT}/\`. ${missing.length} screen(s) with no app capture:`,
    ``,
    ...missing.map((m) => `- **${m.name}** — ${m.note}`),
    ``,
    `## What these can and cannot establish`,
    ``,
    `They can show whether a screen looks like the drawing it is paired with. They cannot`,
    `say whether the drawing is what we decided to build — the decided-not-built list is a`,
    `decision and not drift — and they are **structurally blind to a surface the app never`,
    `built**, because a screen that does not exist produces no capture. Those appear above`,
    `as rows, which is the most this comparison can do about them.`,
    ``,
  ].join('\n')
  await writeFile(`${OUT}/00-report.md`, report)

  console.log(`\n  ${composed} composite(s), ${missing.length} without an app capture -> ${OUT}/`)
  console.log(`
  WHAT THIS CAN ESTABLISH: whether a screen looks like the drawing beside it.
  WHAT IT CANNOT:
    · whether the drawing is what we DECIDED to build. Feltarbeid, the Oversikt
      tab, Målgruppe's drop-off half, the nps card, the cx workspace, uitest,
      quizPass/quizTries/certificate, the thirteen integrations and resume are
      decided-not-built; a difference against those is a decision.
    · anything about a surface the app never built. It produces no capture, so
      it is a MISSING ROW above and not a difference — and that is the class the
      2026-09-14 audit was written for.
  It asserts nothing and exits 0 whatever it finds: the two renders show
  different data, so a pixel diff between them would be red everywhere and worth
  nothing.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
