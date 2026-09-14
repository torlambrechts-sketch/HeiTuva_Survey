/**
 * Captures the design prototype itself, screen by screen, so every later
 * comparison is against a rendered baseline rather than someone's reading of
 * the markup.
 *
 * The prototype is one page driven by internal JS state. We set that state
 * directly through the React fiber rather than clicking a guessed path — a
 * click sequence would silently capture the wrong screen the moment the
 * prototype's navigation changes, and some states (warnings, sent
 * confirmations) have no click path at all.
 *
 * Run once per design-bundle update; commit the PNGs.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Page } from '@playwright/test'
import { serveCdnFromCache } from './cdn-cache'

/**
 * FOUR bundles, all rendered, all kept (DECISIONS Q18, extended by Q52).
 *
 * `design-reference/` is the first handoff and remains the reference for
 * Phase 1–7 work AS BUILT: a fidelity question about a screen no later phase
 * has touched is answered against the bundle it was built from, not against a
 * later one that moved the frame under it.
 *
 * `design-reference-v1/` is the second handoff. It was the TARGET while the v1
 * bundle ran; it is now the reference for every screen a v1 phase built and no
 * v2 phase touches.
 *
 * `design-reference-v2/` is the third handoff. It was the target while the v2
 * bundle ran; it is now the reference for every screen a v2 phase built and no
 * v3 phase touches — AND it stays the reference for the two surfaces v3 did not
 * hand over at all (splash, Bruksområder).
 *
 * `design-reference-v3/` is the fourth handoff and is the TARGET for every
 * screen a v3 phase touches. It is a ONE-FILE handoff: `HeiTuva.dc.html` only.
 *
 * WHICH SURFACE IS JUDGED AGAINST WHICH IS NOT INFERRED HERE. It is written
 * down once, per surface, in `docs/v2/00-diff.md § 0.3`. This file only
 * renders; that table decides.
 *
 * So the renders are three sets side by side, named for what they are rather
 * than by which ran last. Overwriting an earlier set would destroy the only
 * evidence of what the phases before it were judged against.
 */
type Bundle = {
  key: string
  /** What this render set is FOR, printed in the run so the reader need not infer. */
  role: string
  design: string
  /** OPTIONAL, and that is the correction v3 forced. This was typed `string`
   *  because the first three handoffs all shipped a splash — an enumeration of
   *  the bundles that existed, read as a property of bundles. v3 handed over
   *  ONE file. A required field would have been satisfied by pointing v3's
   *  splash at v2's, which is the exact failure the `only`/`bruksomrader`
   *  machinery below exists to prevent: a screen captured from a page its own
   *  bundle never drew, then compared against as though it had. */
  splash?: string
  /** v2 ships a THIRD prototype file. Optional for the same reason. */
  bruksomrader?: string
  out: string
}

/** Adding one here is step 1 of 6 — the rest of the checklist is in CLAUDE.md
 *  under "ADDING A BUNDLE". `.gitignore` is the one that bites: `artifacts/*`
 *  is ignored, so a new set renders, reports captured, and is committed
 *  nowhere. */
const BUNDLES: Bundle[] = [
  {
    key: 'legacy',
    role: 'first handoff — the baseline Phases 1–7 were built against',
    design: 'design-reference/heituva-survey-app-design/project/HeiTuva.dc.html',
    splash: 'design-reference/heituva-survey-app-design/project/HeiTuva Splash.dc.html',
    out: 'artifacts/reference',
  },
  {
    key: 'v1',
    role: 'second handoff — the reference for screens v1 built and no v2 phase touches',
    design: 'design-reference-v1/heituva-survey-app-design/project/HeiTuva.dc.html',
    splash: 'design-reference-v1/heituva-survey-app-design/project/HeiTuva Splash.dc.html',
    out: 'artifacts/reference-v1',
  },
  {
    key: 'v2',
    role: 'third handoff — screens v2 built and no v3 phase touches, plus splash and Bruksområder, which v3 did not re-issue',
    design: 'design-reference-v2/heituva-survey-app-design/project/HeiTuva.dc.html',
    splash: 'design-reference-v2/heituva-survey-app-design/project/HeiTuva Splash.dc.html',
    bruksomrader: 'design-reference-v2/heituva-survey-app-design/project/HeiTuva Bruksomrader.dc.html',
    out: 'artifacts/reference-v2',
  },
  {
    key: 'v3',
    role: 'fourth handoff — the reference for screens a v3 phase built and no v4 phase touches',
    design: 'design-reference-v3/heituva-survey-app-design/project/HeiTuva.dc.html',
    // No `splash`, no `bruksomrader`: v3 handed over one file. Those two
    // surfaces stay governed by v2 and are rendered from v2's set.
    out: 'artifacts/reference-v3',
  },
  {
    key: 'v4',
    role: 'fifth handoff — the reference for every screen a v4 phase built and no v5 phase touches',
    design: 'design-reference-v4/heituva-survey-app-design/project/HeiTuva.dc.html',
    // No `splash`, no `bruksomrader`, for the SECOND handoff running. v3 being
    // one file was read once as the anomaly that made `Bundle.splash` optional;
    // v4 being one file too is the evidence it is the norm, not the exception.
    // Both surfaces stay v2's and are rendered from v2's set.
    out: 'artifacts/reference-v4',
  },
  {
    key: 'v5',
    role: 'sixth handoff — the target for every screen a v5 phase touches',
    design: 'design-reference-v5/heituva-survey-app-design/project/HeiTuva.dc.html',
    // No `splash`, no `bruksomrader`, for the THIRD handoff running — which is
    // now simply what a handoff looks like. Both surfaces stay v2's.
    out: 'artifacts/reference-v5',
  },
  {
    key: 'v6',
    role: 'seventh handoff — the target for every screen a v6 phase touches',
    design: 'design-reference-v6/heituva-survey-app-design/project/HeiTuva.dc.html',
    // No `splash`, no `bruksomrader`, for the FOURTH handoff running. Both
    // surfaces stay v2's.
    //
    // AND v6 IS THE FIRST HANDOFF TO REMOVE KEYS, so `since` alone is not
    // obviously enough — its stated limit is that it assumes screens are ADDED.
    // 34 keys are gone (28 uitest, 6 survey-list). The check the checklist
    // names was run rather than assumed, and its result is stated as measured:
    // of the 15 state keys the SCREENS manifest sets, 14 resolve in v6 and the
    // fifteenth is `billing`, which is SPLASH-ONLY and resolves in v2's splash
    // file (9 occurrences) because that is the file the splash renders from.
    // The captured PNGs are pairwise distinct. So no `until` is needed. Without the second half a removed key is silent
    // — the state simply does not apply and the previous screen is captured
    // under the new name.
    out: 'artifacts/reference-v6',
  },
]

const WIDTH = 1440

/** Screens, keyed by the prototype's own `screen` state value. Extra state is
 *  merged in for screens that need a sub-tab or a specific condition. */
type Screen = {
  name: string
  state: Record<string, unknown>
  width?: number
  /** The splash is a SECOND prototype file in each bundle. It shares the
   *  DCLogic base and the fiber trick, but nothing else — its own state shape,
   *  its own copy object, and no `screen` key at all — so it is named per
   *  screen rather than assumed. Marked here, resolved per bundle below. */
  splash?: true
  /** Bruksområder is a THIRD file, and only v2 has it. */
  bruksomrader?: true
  /** The bundle this screen FIRST APPEARS IN. It is rendered for that bundle
   *  and every later one. Omitted = it has been there from the first handoff.
   *
   *  A screen whose bundle does not have it would not fail loudly — the state
   *  key simply would not apply and the previous screen would be captured under
   *  the new name, which is the "measured as whatever page linked to it"
   *  failure VERIFY.md's one-time setup already names. So the restriction is
   *  declared, not left to the duplicate-hash check to catch after the fact.
   *
   *  THIS WAS `only: string[]` AND IT WAS AN ENUMERATION. Every v2 surface was
   *  written `only: ['v2']`, which was true of the bundles that existed and
   *  false the moment a fourth arrived: v3 contains all eight of those screens,
   *  and `only` would have silently withheld every one of them from the set
   *  they are the target for. The property is "present from v2 ONWARD", so
   *  that is what the field now says. Adding a fifth bundle needs no edit to
   *  any screen line.
   *
   *  The limit, stated rather than left implicit: this assumes screens are
   *  added and not removed. It held v2 -> v3 and was VERIFIED, not assumed —
   *  `docs/v3/00-diff.md` compares the sorted `sc-if` key sets and `comm -23`
   *  returns nothing. If a handoff ever drops a screen, that needs an `until`,
   *  and the check that would catch it is the same set comparison. */
  since?: string
  /** A patch that cannot be written as a literal, because it depends on a value
   *  the prototype computes at runtime. Source of a function body taking the
   *  prototype's own state `st` and its logic instance `logic`, and returning
   *  the patch object; merged on top of `state`.
   *
   *  This exists because of `uid()` (D143): question ids are
   *  `"q" + Math.random().toString(36).slice(2,8)`, so the respondent screen's
   *  saved-comment state — `qcSaved` keyed BY a question id — has no literal
   *  that reaches it. Without this the C3 phase would build a state with no
   *  rendered baseline to be judged against, which is the "green for something
   *  that structurally could not be seen" shape this project has hit six times.
   *
   *  `logic` is handed over as well as `st` so the body can DERIVE the key the
   *  way the prototype derives it, rather than reimplementing the derivation
   *  here. That distinction earned itself immediately: reimplementing it
   *  produced a plausible key and a silently wrong capture, and calling the
   *  prototype's own `respondList` produced the key the prototype actually
   *  uses — which turned out not to be a question id at all (D156). */
  stateFrom?: string
}

const SCREENS: Screen[] = [
  { name: 'oversikt', state: { screen: 'dash' } },
  { name: 'undersokelser', state: { screen: 'surveys' } },
  { name: 'dashboard', state: { screen: 'dashboard' } },
  { name: 'bibliotek', state: { screen: 'library' } },
  { name: 'bibliotek-bank', state: { screen: 'library', libTab: 'bank' } },
  { name: 'rapporter', state: { screen: 'reports' } },
  // Phase 5 built three states of this screen that had no rendered baseline,
  // so nothing could be compared against the design for them.
  { name: 'rapporter-standard', state: { screen: 'reports', repTab: 'standard' } },
  { name: 'rapporter-mine', state: { screen: 'reports', repTab: 'mine' } },
  { name: 'rapport-editor', state: { screen: 'reports', repEditing: true } },
  { name: 'rapport-editor-filter', state: { screen: 'reports', repEditing: true, repSide: 'filter' } },
  { name: 'rapport-editor-del', state: { screen: 'reports', repEditing: true, repSide: 'del' } },
  { name: 'builder', state: { screen: 'build' } },
  { name: 'send', state: { screen: 'send' } },
  { name: 'resultater', state: { screen: 'results' } },
  { name: 'profil', state: { screen: 'profile' } },
  { name: 'admin-firma', state: { screen: 'admin', adminTab: 'firma' } },
  { name: 'admin-brukere', state: { screen: 'admin', adminTab: 'brukere' } },
  { name: 'admin-grupper', state: { screen: 'admin', adminTab: 'grupper' } },
  { name: 'admin-personvern', state: { screen: 'admin', adminTab: 'personvern' } },
  { name: 'admin-valg', state: { screen: 'admin', adminTab: 'valg' } },
  // The respondent surface is mobile-first per CLAUDE.md, so capture it narrow.
  { name: 'respondent', state: { screen: 'respond' }, width: 390 },
  { name: 'respondent-takk', state: { screen: 'respond', thanked: true }, width: 390 },
  { name: 'wizard', state: { screen: 'dash', wizOpen: true } },

  // Phase 6's splash. Three states, because two of its controls change the
  // page rather than a detail: the billing toggle changes every price, and the
  // auth tab changes which form is on the page.
  { name: 'splash', state: {}, splash: true },
  { name: 'splash-priser-manedlig', state: { billing: 'mnd' }, splash: true },
  { name: 'splash-logg-inn', state: { mode: 'login' }, splash: true },

  // v2's new surfaces. `since: 'v2'` because the earlier bundles have no such
  // `screen` value — the patch would not apply, and the run would capture
  // whatever screen was already showing under the new name.
  { name: 'oppgaver', state: { screen: 'tasks' }, since: 'v2' },
  { name: 'live', state: { screen: 'livestage' }, since: 'v2' },
  { name: 'live-revealed', state: { screen: 'livestage', liveRevealed: true }, since: 'v2' },
  { name: 'hjelp', state: { screen: 'help' }, since: 'v2' },
  { name: 'admin-profil', state: { screen: 'admin', adminTab: 'profil' }, since: 'v2' },
  { name: 'admin-malgrupper', state: { screen: 'admin', adminTab: 'malgrupper' }, since: 'v2' },
  { name: 'admin-integrasjoner', state: { screen: 'admin', adminTab: 'integrasjoner' }, since: 'v2' },
  // Bruksområder is v2's third FILE, and v3 did not re-issue it. `since: 'v2'`
  // plus the file guard means it renders for v2 and is skipped for v3 — not
  // captured from v3's app page under the Bruksområder name.
  { name: 'bruksomrader', state: {}, bruksomrader: true, since: 'v2' },

  // v3's new surfaces: communication on every survey.
  //
  // `oppgaver` above is NOT duplicated here. Its `screen` value is unchanged
  // and v3 renders it with the new tab rail, so the v3 set's `oppgaver.png` is
  // already the new drawing. What is new is the two FILTERED states.
  { name: 'oppgaver-oppgaver', state: { screen: 'tasks', tfView: 'oppgaver' }, since: 'v3' },
  { name: 'oppgaver-tilbakemeldinger', state: { screen: 'tasks', tfView: 'tilbakemeldinger' }, since: 'v3' },
  // The per-question comment editor, open. 390px: this is the respondent
  // surface, which CLAUDE.md holds to a stricter bar than the app.
  { name: 'respondent-kommentar', state: { screen: 'respond', qcOpen: true }, width: 390, since: 'v3' },
  // The same question with a comment already saved. Reachable only through the
  // question's own random id, hence `stateFrom`.
  {
    name: 'respondent-kommentar-lagret',
    state: { screen: 'respond' },
    // Keyed the way the PROTOTYPE keys it — `respondList(st, active())[step].id`
    // — not the way a reader would assume. Those are different, and the
    // difference is D156: `respondList` emits no `id` at all, so every one of
    // the bundle's five reads resolves to the same slot.
    //
    // **AND v6 CHANGED THE MODEL UNDER THIS ENTRY WITHOUT CHANGING ITS KEY.**
    // Through v5 `qcSaved` is a MAP of saved comments keyed by question id, so
    // this patch had to build one. In v6 (v6:7849-7862) `qcSaved` is a DERIVED
    // BOOLEAN over a new scalar `st.qcSavedText`, and the map is read by
    // nothing. The key count is 11 in both files; `qcSavedText` is 0 in v5 and
    // 5 in v6. A key-set diff cannot see this — the identifier survived and its
    // MEANING moved — and the symptom was this screen rendering identical to
    // plain `respondent`, which is the failure the pairwise-distinct check
    // exists to catch. It caught it on the first v6 run.
    //
    // Both shapes are set, because `since: 'v3'` means this entry still renders
    // for v3, v4 and v5 when those sets are regenerated by name. Each model
    // reads its own and ignores the other, so no bundle needs this edited again
    // — the fix that is robust against the construct nobody has thought of.
    stateFrom:
      'const rq=logic.respondList(st, logic.active());' +
      'const i=Math.min(st.step||0, Math.max(0, rq.length-1));' +
      'const key=String((rq[i]||{}).id);' +
      'const body="Vi mangler et sted a ta opp ting som haster.";' +
      'return {qcOpen:false, qcText:"", qcSavedText:body,' +
      ' qcSaved:{[key]:{text:body,anon:true,question:(rq[i]||{}).text}}}',
    width: 390,
    since: 'v3',
  },
  // The end-of-survey box. `respondent-takk` already captures its unsent state
  // in v3 (the box is new there); this is the sent confirmation, which has no
  // click path from a fresh load.
  { name: 'respondent-takk-sendt', state: { screen: 'respond', thanked: true, fbSent: true }, width: 390, since: 'v3' },
]

/** Reaches the prototype's logic instance through the React fiber and merges a
 *  state patch into it. Returns the resulting `screen` so the caller can prove
 *  the patch actually applied instead of capturing a stale screen. */
async function setPrototypeState(page: Page, patch: Record<string, unknown>, from?: string) {
  return page.evaluate(({ p, from }) => {
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
      if (!key) continue
      let fiber = (el as unknown as Record<string, { stateNode?: unknown; return?: unknown }>)[key]
      while (fiber) {
        const inst = fiber.stateNode as
          | { logic?: { state?: Record<string, unknown>; setState?: (p: unknown) => void } }
          | undefined
        if (inst?.logic?.setState && inst.logic.state) {
          let merged = p
          if (from) {
            // eslint-disable-next-line no-new-func
            const derived = new Function('st', 'logic', from)(inst.logic.state, inst.logic) as Record<
              string,
              unknown
            >
            if (!derived || !Object.keys(derived).length) {
              return { ok: false, screen: null, why: 'stateFrom returned nothing' }
            }
            merged = { ...p, ...derived }
          }
          inst.logic.setState(merged)
          return { ok: true, screen: inst.logic.state['screen'] as string }
        }
        fiber = fiber.return as typeof fiber
      }
    }
    return { ok: false, screen: null, why: 'no logic instance' }
  }, { p: patch, from })
}

/**
 * Which bundles this run renders. Default: the TARGET set only — the last entry
 * in BUNDLES, derived rather than named, so promoting a handoff is one edit.
 *
 * The legacy set is FROZEN, and not by discipline: re-rendering it moved five
 * PNGs the first time this ran, with no design change behind them — a newer
 * Chromium paints them slightly differently. A baseline that drifts with the
 * browser build is a baseline that silently stops being the thing Phases 1-7
 * were judged against, which is the whole reason Q18 keeps it.
 *
 * THE V1 SET FROZE FOR THE SAME REASON, and Q52 adds a second: v1 is no longer
 * a target, it is the reference for every screen a v1 phase built and no v2
 * phase touches. Re-rendering it under a newer Chromium would move PNGs that
 * are the only evidence of what V1-0…V1-6 were judged against — exactly the
 * loss the legacy freeze was introduced to prevent, one bundle along.
 *
 * THE V2 SET NOW FREEZES TOO, one bundle further along, and it carries an extra
 * duty the other frozen sets do not: NEITHER v3 NOR v4 handed over a splash or
 * a Bruksområder, so `splash*.png` and `bruksomrader.png` exist ONLY in the v2
 * set and are the live reference for those surfaces, not merely a record of
 * what v2 was judged against. Two one-file handoffs running is why that duty is
 * written as a standing property of the v2 set rather than as a note about v3.
 *
 * THE V3 SET FREEZES ON THE SAME TERMS the moment v4 becomes the target: it is
 * the reference for every screen a v3 phase built and no v4 phase touches.
 *
 * So the default renders the TARGET set only, and an older set is regenerated
 * only when someone asks for it by name. The names are BUNDLES' own keys —
 * listing them here would be a copy that goes stale the next handoff, so the
 * error message enumerates them from the array instead:
 *
 *   npx tsx scripts/verify/reference.ts                 the target set (default)
 *   npx tsx scripts/verify/reference.ts --all           every set
 *   npx tsx scripts/verify/reference.ts --bundle=<key>  one set by name
 *
 * Either way every set stays on disk, named, side by side.
 */
function selectedBundles(): Bundle[] {
  const args = process.argv.slice(2)
  if (args.includes('--all')) return BUNDLES
  const named = args.find((a) => a.startsWith('--bundle='))?.split('=')[1]
  if (named) {
    const hit = BUNDLES.filter((b) => b.key === named)
    if (!hit.length) throw new Error(`unknown bundle "${named}" — try ${BUNDLES.map((b) => b.key).join(' | ')}`)
    return hit
  }
  return BUNDLES.filter((b) => b.key === TARGET)
}

/** The newest bundle is the target. Derived from the list's order rather than
 *  written down a second time, so promoting a bundle is one edit. */
const TARGET = BUNDLES[BUNDLES.length - 1]!.key

async function main() {
  const browser = await chromium.launch()
  let captured = 0
  let failed = 0
  const bundles = selectedBundles()
  const skipped = BUNDLES.filter((b) => !bundles.includes(b))
  for (const b of skipped) {
    console.log(`   (${b.key} not rendered this run — ${b.out}/ kept as committed; --all to regenerate)`)
  }

  try {
  for (const bundle of bundles) {
    await mkdir(bundle.out, { recursive: true })
    console.log(`\n== ${bundle.key} — ${bundle.role}\n   ${bundle.design}\n   -> ${bundle.out}/`)
    // Per bundle: two bundles rendering the same unchanged screen are not a
    // silent failure, but two SCREENS rendering identically within one bundle
    // still are.
    const hashes = new Map<string, string>()
    const bundleIndex = BUNDLES.findIndex((b) => b.key === bundle.key)
    const screens = SCREENS.filter((s) => {
      if (s.since) {
        const first = BUNDLES.findIndex((b) => b.key === s.since)
        if (first < 0) throw new Error(`screen "${s.name}" declares since:"${s.since}", which is not a bundle key`)
        if (bundleIndex < first) return false
      }
      // A screen living in a SECOND prototype file is skipped when this bundle
      // does not ship that file — rather than captured from the app page under
      // its name.
      if (s.bruksomrader && !bundle.bruksomrader) return false
      if (s.splash && !bundle.splash) return false
      return true
    })
    const withheld = SCREENS.length - screens.length
    if (withheld) console.log(`   (${withheld} screen(s) not in this bundle — skipped, not rendered from another page)`)
    for (const s of screens) {
      const width = s.width ?? WIDTH
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        locale: 'nb-NO',
      })
      const page = await ctx.newPage()
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))

      try {
        await serveCdnFromCache(page)
        const file0 = s.bruksomrader ? bundle.bruksomrader! : s.splash ? bundle.splash! : bundle.design
        await page.goto(pathToFileURL(resolve(file0)).href, {
          waitUntil: 'domcontentloaded',
        })

        // Wait for hydration: until the fiber is reachable the page is still
        // showing literal {{ }} templates. The app bundle proves it through a
        // nav button; the splash has no `nav button`, so both files are checked
        // the same way instead — no `{{` left anywhere in the body.
        await page.waitForFunction(
          () => {
            const text = document.body.innerText
            return text.length > 0 && !text.includes('{{')
          },
          { timeout: 30_000 },
        )

        const applied = await setPrototypeState(page, s.state, s.stateFrom)
        if (!applied.ok) throw new Error(`state patch did not apply: ${applied.why ?? 'unknown'}`)

        await page.waitForTimeout(400)
        await page.evaluate(() => document.fonts.ready)

        const file = `${bundle.out}/${s.name}.png`
        await page.screenshot({ path: file, fullPage: true })

        // A patch that changed nothing produces a byte-identical capture. That
        // is a silent failure — the baseline would look fine and be wrong.
        const hash = createHash('sha1').update(await readFile(file)).digest('hex')
        const clash = hashes.get(hash)
        if (clash) {
          failed++
          console.log(`  FAIL ${s.name}: identical to "${clash}" — state patch ${JSON.stringify(s.state)} had no effect`)
          continue
        }
        hashes.set(hash, s.name)
        captured++
        console.log(`  ok   ${s.name.padEnd(22)} ${width}px  ${applied.screen ? `screen=${applied.screen}` : 'standalone prototype (no screen state)'}`)
        if (errors.length) console.log(`       note: ${errors.length} page error(s): ${errors[0]?.slice(0, 90)}`)
      } catch (e) {
        failed++
        console.log(`  FAIL ${s.name}: ${e instanceof Error ? e.message : e}`)
      } finally {
        await ctx.close()
      }
    }
  }
  } finally {
    await browser.close()
  }

  console.log(
    `\nreference: captured ${captured}, failed ${failed} across ${bundles.length} bundle(s)` +
      `\n  ${BUNDLES.map((b) => `${b.out}/ = ${b.key}`).join('\n  ')}`,
  )
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
