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
const NUMERALS: Record<string, string> = {
  no: String.raw`\b(?:\d{1,2}(?!\s*%)|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti)\b`,
  en: String.raw`\b(?:\d{1,2}(?!\s*%)|two|three|four|five|six|seven|eight|nine|ten)\b`,
}

const GATE = String.raw`\b(?:terskel\w*|threshold\w*)\b`
const GENERIC = String.raw`\b(?:svar|svarene|svart|answers?|answered|responses?)\b`

function nearRe(numeral: string, word: string, gap: number) {
  return new RegExp(
    `(?:${numeral}[\\s\\S]{0,${gap}}?${word})|(?:${word}[\\s\\S]{0,${gap}}?${numeral})`,
    'iu',
  )
}

function asserts(lang: string, text: string): boolean {
  const n = NUMERALS[lang]!
  return nearRe(n, GATE, NEAR_GATE).test(text) || nearRe(n, GENERIC, NEAR_GENERIC).test(text)
}

/**
 * Allowed, each with the reason it is allowed. An entry without a reason is a
 * place a finding goes to be forgotten — the same rule Gate 5a3's allowlist
 * carries.
 */
const ALLOWED: Record<string, string> = {
  // Interpolated: the number comes from the data, so the string cannot lie.
  'admin.anonExplainer': 'interpolates {k} from organizations.default_k_threshold',
  'admin.orgThresholdNote': 'interpolates {k}; the «tre» in it is the CHECK floor, which is fixed',
  'admin.orgThresholdChip': 'interpolates {k} — it IS the picker',
  'admin.pMinResponsesDesc': 'interpolates {k}',
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
  'admin.thresholdTwoWarning': 'the 2 is the condition under which the string renders at all',
  'admin.thresholdTwoGdpr': 'same — rendered only at 2',
  'builder.policyTwoText': 'same — the builder\u2019s tier, rendered only at 2',

  // Numbers that sit near a threshold word and are about something else. Each
  // reason names WHAT the number is, so a later reader can tell a stale
  // allowlist entry from a live one.
  'dash.streakOne': 'the 1 is a WEEK count — «har svart 1 uke på rad»',
  'dashboard.heatNoteGeneric': 'the 4,2 / 3,6 are colour-band scores; the string already says «under terskelen»',
  'builder.cLavDesc': 'the 1–2 are SCALE VALUES that trigger a follow-up, not a gate',
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
      const interpolates = /[{#]/.test(value)
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
      if (reason && /interpolat|derived/i.test(reason) && !interpolates) {
        hits.push({
          lang,
          key: full,
          text: `STALE ALLOWLIST ENTRY — allowed because it «${reason}», but it no longer does:\n      ${value}`,
        })
        continue
      }

      // A string that INTERPOLATES cannot assert a fixed number: the value comes
      // from the data, so it is true by construction. That is the whole remedy
      // Q55 applied, and it is a property of the string rather than a list of
      // which strings are fine.
      if (interpolates) continue
      if (!asserts(lang, value)) continue
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
    `threshold-copy: CLEAN — no un-allowlisted, non-interpolated string puts a numeral ` +
      `within ${NEAR_GATE} chars of «terskel»/«threshold» or ${NEAR_GENERIC} chars of ` +
      `«svar»/«answer», in either language.`,
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
