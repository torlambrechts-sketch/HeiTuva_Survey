/**
 * DECISIONS Q55 — no shipped string may assert a FIXED number where the
 * threshold is variable.
 *
 * ── WHY THIS IS NOT A LIST OF PHRASES ───────────────────────────────────────
 *
 * V2-0 swept for «fem svar», «under fem», «below five», «five answers», «n ≥ 5»
 * and reported CLEAN. Four keys survived it — two of them public marketing —
 * because they say «fem har svart», «fem som standard», «mindre enn fem»,
 * «five by default», «until five have answered». V2-1 found them.
 *
 * That is V1-6's first rule: THE DERIVATION MUST DESCRIBE THE PROPERTY, NOT A
 * SYMPTOM OF IT. A phrase list is a list of symptoms, and it fails again the
 * first time somebody writes «før det femte svaret».
 *
 * The property is: A NUMERAL NEAR A THRESHOLD WORD. So this looks for a number
 * word or digit within PROXIMITY characters of a threshold word, in either
 * language, and reports every hit. Keys that legitimately carry a number are an
 * ALLOWLIST WITH A REASON EACH — a bare list would be the same mistake one
 * level up.
 *
 *   npx tsx scripts/verify/threshold-copy.ts
 */
import { readFileSync } from 'node:fs'

/**
 * Two proximities, because two kinds of threshold word.
 *
 * «terskel»/«threshold» name the gate, so a number anywhere near one is a claim
 * about it. «svar»/«answer» are ordinary words — «Tre grunner til at folk
 * svarer» is not a threshold claim — so a number only counts as a claim when it
 * QUALIFIES the word directly: «fem svar», «five answers».
 */
const NEAR_GATE = 60
const NEAR_GENERIC = 14

/**
 * Numerals PER LANGUAGE, and that is not tidiness.
 *
 * Running the Norwegian list against English matched «to» in "attributed TO the
 * company" as the numeral two, and «en» as the article. Cross-language numeral
 * words are irreducibly ambiguous, so each file is scanned with its own list —
 * which is also why «en»/«one» are absent from both: in Norwegian «en terskel»
 * is an article, and the ambiguity is not worth the one real hit it might find.
 *
 * Digits exclude a following «%»: «58 % svar» is a response RATE.
 */
/**
 * ── AND \b IS NOT A WORD BOUNDARY IN NORWEGIAN ──────────────────────────────
 *
 * V2-8 found this by hand: the gate could not see «åtte».
 *
 * JavaScript's `\b` is defined on the ASCII word class, so `å` is a NON-word
 * character. In «terskelen til åtte» the character before `å` is a space —
 * also non-word — so there is no boundary there and `\båtte\b` never matches.
 * The gate has therefore been blind to one of the ten Norwegian numerals it
 * lists since it was written, and it is not a harmless one: **8 is the
 * threshold the statutory harassment pack locks**, which makes it the numeral
 * most likely to appear beside a threshold word in copy that matters.
 *
 * Every other numeral in both lists is ASCII, so nothing else was affected —
 * which is exactly why it survived: the gate was right nine times out of ten
 * and silent on the tenth. D110's fourth case, arriving as a regex flag.
 *
 * The fix is a boundary that knows about letters rather than about ASCII:
 * `(?<![\p{L}\d])` … `(?![\p{L}\d])` under the `u` flag.
 */
const B0 = String.raw`(?<![\p{L}\d])`
const B1 = String.raw`(?![\p{L}\d])`

const NUMERALS: Record<string, string> = {
  no: String.raw`${B0}(?:\d{1,2}(?!\s*%)|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti)${B1}`,
  en: String.raw`${B0}(?:\d{1,2}(?!\s*%)|two|three|four|five|six|seven|eight|nine|ten)${B1}`,
}

const GATE = String.raw`${B0}(?:terskel\p{L}*|threshold\p{L}*)${B1}`
const GENERIC = String.raw`${B0}(?:svar|svarene|svart|answers?|answered|responses?)${B1}`

function nearRe(numeral: string, word: string, gap: number) {
  return new RegExp(
    `(?:${numeral}[\\s\\S]{0,${gap}}?${word})|(?:${word}[\\s\\S]{0,${gap}}?${numeral})`,
    'iu',
  )
}

/**
 * Remove ICU placeholders — `{k}`, and nested plural forms such as
 * `{n, plural, one {# kanal} other {# kanaler}}` — so that what remains is only
 * the string's FIXED text. Braces nest, so this counts depth rather than
 * matching a pattern; a lone `#` is an ICU plural's own count and goes with
 * them.
 */
function stripPlaceholders(text: string): string {
  let out = ''
  let depth = 0
  for (const ch of text) {
    if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += ch === '#' ? '' : ch
  }
  return out
}

function asserts(lang: string, text: string): boolean {
  const n = NUMERALS[lang]!
  return nearRe(n, GATE, NEAR_GATE).test(text) || nearRe(n, GENERIC, NEAR_GENERIC).test(text)
}

/**
 * Allowed, each with the reason it is allowed. An entry without a reason is a
 * place a finding goes to be forgotten — the same rule Gate 5a3's allowlist
 * carries.
 *
 * ── AND THE REASON MUST STATE ITS SCOPE, NOT ONLY ITS CONTENT ───────────────
 *
 * `admin.pMinResponsesDesc` was allowed because it «interpolates {k}». It does.
 * It also carried «aldri under 3» against a floor of 2, and the entry hid that
 * for two phases. **A partial reason survives review because a reviewer checks
 * whether the reason is TRUE, not whether it is SUFFICIENT** — so an accurate
 * half-reason is confirmed by the very reading that should have caught it.
 * «interpolates {k} in clause 1, asserts nothing in clause 2» would have failed
 * review on sight. D110's fourth case, and its 2026-09-09 addition.
 *
 * So: where a string has more than one clause, say what each clause does.
 */
const ALLOWED: Record<string, string> = {
  // Interpolated: the number comes from the data, so the string cannot lie.
  'admin.anonExplainer':
    'the {k} comes from organizations.default_k_threshold; the fixed «to» is\n     surveys_k_threshold_floor',
  // Reason was «the «tre» in it is the CHECK floor». THE FLOOR HAS BEEN 2 SINCE
  // Q91, and the string itself was corrected then — «aldri settes under to».
  // Only the reason stayed at three, for two phases, saying the wrong thing
  // about a string that was right. The repaired check found it on first run.
  'admin.orgThresholdNote':
    'the {k} is the org default; the fixed «to» is surveys_k_threshold_floor',
  'admin.orgThresholdChip': 'interpolates {k} — it IS the picker',
  // WAS 'interpolates {k}' — and that reason was TRUE ABOUT ONE CLAUSE AND READ
  // AS TRUE ABOUT THE STRING. It also carried a fixed «aldri under 3», false
  // against `surveys_k_threshold_floor` (2), and the entry hid it for two
  // phases. See the premise note below `asserts`. The reason now names the
  // constraint, like the `legal.*` entries, so the next floor change finds it.
  'admin.pMinResponsesDesc':
    'the {k} is the org default; the fixed «2» is surveys_k_threshold_floor',
  'dashboard.thresholdLine': 'interpolates the k of the selection (Q42)',
  // Corrected during V2-2: I allowlisted `respondent.promise` believing it was
  // the derived anonymity promise. It is the greeting, «Har du 90 sekunder?»,
  // and the 90 is SECONDS. The self-check below caught my own wrong reason,
  // which is the best evidence it is not decorative. The real derived promises
  // are the `promiseAnonymous*` family and they interpolate, so they are
  // skipped before the allowlist is ever consulted.
  'respondent.promise': 'the 90 is SECONDS in the greeting, not a threshold',

  // Fixed numbers that are FACTS about the schema, not promises about the gate.
  // ALL THREE MOVED FROM «tre» TO «to» IN V2-2 (Q91). They are allowed because
  // the number they carry is the CHECK floor — which means they are exactly the
  // strings that go stale when the floor moves, and they had already gone stale
  // once (Q55). A reason naming WHICH constraint the number is lets the next
  // floor change find them by grep instead of by memory.
  'legal.privacy3P': 'says «aldri lavere enn to» — surveys_k_threshold_floor, fixed and true',
  'legal.dpa4P': 'same; and states that organisation surveys have no threshold at all',
  'reports.dutyThreshold': 'says «aldri under to for personer» — surveys_k_threshold_floor',

  // Q91's two-tier warning. The fixed 2 is not a promise about the gate — it is
  // the CONDITION OF THE STRING'S OWN DISPLAY: PrivacyPanel and PolicyPanel
  // render this block only when the selected value is 2, so a 2 in the text
  // cannot disagree with the threshold it describes. Interpolating {k} here
  // would be worse, not better: it would let the sentence «kan den som svarer
  // regne seg fram til hva den andre svarte» render at 5, where it is false.
  // V2-8, Bruksområder. THE ONE FIXED THRESHOLD A PUBLIC PAGE MAY STATE, and it
  // is allowed because it is a fact about a TEMPLATE rather than a promise
  // about the gate: `template_packs.policy` for `trakassering-ytringsklima`
  // carries `{"k_threshold": 8, "locked": true}`, so the pack sets 8 and an
  // organisation cannot lower it. `tests/db/use-cases-page.test.ts` asserts the
  // 8 against that row rather than trusting this reason — and asserts that NO
  // OTHER use-case string carries a fixed threshold, because «Anonymt, terskel
  // 5» appeared three times and «Vises fra 5 svar» once before this phase
  // corrected them. Scope, per D110's 2026-09-09 addition: this covers the
  // locked harassment threshold ONLY; every other number on that page is
  // derived from the packs at render time.
  'usecases.trakasseringSetupV3': 'the 8 is template_packs.policy.k_threshold, locked by the pack',
  'usecases.trakasseringAnonNote': 'same locked 8, in words',

  'admin.thresholdTwoWarning': 'the 2 is the condition under which the string renders at all',
  'admin.thresholdTwoGdpr': 'same — rendered only at 2',
  'builder.policyTwoText': 'same — the builder\u2019s tier, rendered only at 2',

  // Numbers that sit near a threshold word and are about something else. Each
  // reason names WHAT the number is, so a later reader can tell a stale
  // allowlist entry from a live one.
  'dash.streakOne': 'the 1 is a WEEK count — «har svart 1 uke på rad»',
  'dashboard.heatNoteGeneric': 'the 4,2 / 3,6 are colour-band scores; the string already says «under terskelen»',
  'builder.cLavDesc': 'the 1–2 are SCALE VALUES that trigger a follow-up, not a gate',
  'results.insightSplit': 'the 1–2 are SCALE VALUES on the answer scale, not a gate',
  'splash.heroBody': 'the numbers are minutes and seconds to build and answer',
}

type Hit = { lang: string; key: string; text: string }

const hits: Hit[] = []
const seen = new Set<string>()

for (const lang of ['no', 'en']) {
  const doc = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as Record<
    string,
    Record<string, unknown>
  >
  for (const [ns, entries] of Object.entries(doc)) {
    if (typeof entries !== 'object' || entries === null) continue
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') continue
      const full = `${ns}.${key}`
      const reason = ALLOWED[full]
      // Recorded BEFORE any early exit below: a key that exists but takes the
      // stale-reason branch must not also be reported as DEAD. Mutation-testing
      // the stale check produced exactly that double report.
      seen.add(full)

      // AN ALLOWLIST KEYED BY NAME AGES EXACTLY LIKE A PHRASE LIST. Proving it:
      // reinstating the four strings V2-0 missed, this sweep caught only two —
      // the other two were allowlisted, so a later edit that put a fixed number
      // back into an allowlisted key would pass in silence.
      //
      // So an entry whose REASON claims interpolation is verified against the
      // string. Such an entry can only ever be consulted when the string does
      // NOT interpolate — because interpolating strings are skipped below — and
      // that means the reason has stopped being true.
      // The honest form of an «interpolates» reason is not «this string contains
      // a placeholder» — that was the premise the skip below used to rest on,
      // and `admin.pMinResponsesDesc` is what it cost. It is: ONCE THE
      // PLACEHOLDERS ARE GONE, NOTHING IS LEFT ASSERTING. One rule covers both
      // ways such an entry rots — the placeholder removed entirely, and a fixed
      // number added beside one that stayed.
      if (
        reason &&
        /interpolat|derived/i.test(reason) &&
        asserts(lang, stripPlaceholders(value))
      ) {
        hits.push({
          lang,
          key: full,
          text:
            `MISLEADING ALLOWLIST ENTRY — allowed because it «${reason}», but with the ` +
            `placeholders removed it STILL puts a numeral near a threshold word, so the ` +
            `reason covers only part of the string:\n      ${value}`,
        })
        continue
      }

      // ── THE PREMISE THIS CHECK USED TO HOLD, AND WHY IT WAS FALSE ─────────
      //
      // It read: «a string that INTERPOLATES cannot assert a fixed number: the
      // value comes from the data, so it is true by construction» — and it
      // skipped the whole string on that basis. V2-4's copy sweep found the
      // counterexample by hand:
      //
      //   admin.pMinResponsesDesc
      //   «Standard {k} svar for nye undersøkelser · ALDRI UNDER 3 · …»
      //
      // The interpolation makes the FIRST clause true by construction and says
      // nothing whatever about the second. The DB floor is 2
      // (`surveys_k_threshold_floor`), so «aldri under 3» was false, on the very
      // panel where an administrator sets the number, one divider above a
      // sibling sentence that correctly said «aldri settes under to».
      //
      // The gate reasoned about the STRING. The claim lives in a CLAUSE. That is
      // this file's own opening lesson — THE DERIVATION MUST DESCRIBE THE
      // PROPERTY, NOT A SYMPTOM OF IT — turned back on itself: «the string
      // interpolates» is a SYMPTOM of «the number comes from the data», and the
      // property is per-clause.
      //
      // So: strip the ICU placeholders and test what is LEFT. A numeral still
      // near a threshold word once the interpolated parts are gone is a fixed
      // number the data cannot correct.
      const fixed = stripPlaceholders(value)
      if (!asserts(lang, fixed)) continue
      if (reason) continue
      hits.push({ lang, key: full, text: value })
    }
  }
}

/**
 * AN ALLOWLIST ENTRY FOR A KEY THAT DOES NOT EXIST IS NOT HARMLESS — it reads as
 * coverage and is a permanent no-op. Eight of the twenty entries here were
 * exactly that when this check was written: seven `interpolates {k}` reasons for
 * keys I believed existed (`results.gatedHover`, `share.leaderScope` and five
 * more) and `admin.orgThresholdNoteFloor`, which is `admin.orgThresholdNote`.
 * None of them had ever suppressed anything. The stale-REASON check below could
 * not see them, because a key that is never visited is never consulted.
 */
for (const key of Object.keys(ALLOWED)) {
  if (!seen.has(key)) {
    hits.push({
      lang: '--',
      key,
      text: `DEAD ALLOWLIST ENTRY — no such message key in no.json or en.json, so this entry suppresses nothing. Reason on file: «${ALLOWED[key]}»`,
    })
  }
}

if (hits.length === 0) {
  console.log(
    `threshold-copy: CLEAN — with ICU placeholders stripped, no un-allowlisted string ` +
      `puts a numeral within ${NEAR_GATE} chars of «terskel»/«threshold» or ` +
      `${NEAR_GENERIC} chars of «svar»/«answer», in either language.`,
  )
  console.log(`  ${Object.keys(ALLOWED).length} key(s) allowlisted, each with a reason.`)
  process.exit(0)
}

console.log(`threshold-copy: ${hits.length} string(s) put a numeral near a threshold word.\n`)
console.log('Each is either (a) interpolated and fine — add it to ALLOWED with the reason,')
console.log('or (b) a fixed number promising something the threshold no longer guarantees.\n')
for (const h of hits) {
  console.log(`  ${h.lang}  ${h.key}`)
  console.log(`      ${h.text.slice(0, 200)}${h.text.length > 200 ? '…' : ''}`)
}
process.exit(1)
