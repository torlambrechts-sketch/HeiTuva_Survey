/**
 * V2-6 — seed the twelve help articles FROM THE BUNDLE, not from a transcription.
 *
 * `HELP_ARTICLES` in `design-reference-v2/.../HeiTuva.dc.html` is the source of
 * truth for this copy (CLAUDE.md: the bundle wins on visuals, and this is
 * visible prose). Reading it here rather than retyping it means the copy cannot
 * drift from the drawing by a typo, and a bundle revision is re-run rather than
 * re-read.
 *
 * ── WHAT THIS SCRIPT DELIBERATELY DOES NOT COPY ───────────────────────────
 *
 * Ten sentences. Each is corrected on the way through, by exact match, and the
 * script FAILS if any of them stops matching — a silent no-op would leave the
 * bundle's false copy in a help article, which is the worst place for it: a
 * user reading the help centre is being told how the product works. See
 * CORRECTIONS below, where each carries the measurement it rests on.
 *
 *   npx tsx scripts/seed-help.ts --local
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { HELP_EN } from './help-en'

type Step = [string, string]
type MockRow = [string, string, string]
type Article = {
  title: string
  cat: string
  time: string
  tint: string
  lead: string
  steps: Step[]
  mockTitle: string
  mockScreen: string
  mock: MockRow[]
  caption: string
  related: string[]
}

const BUNDLE = 'design-reference-v2/heituva-survey-app-design/project/HeiTuva.dc.html'

/**
 * ── THE COPY SWEEP, RUN AT THE MOMENT THE COPY SHIPS ───────────────────────
 *
 * V2-4's security-copy sweep checked the 105 promise-shaped strings that were
 * ALREADY shipped. These twelve articles were not — they carried two of that
 * sweep's forward notes — so they get the same treatment here, at the one
 * moment it is cheap: before they reach a user. **Ten sentences across the
 * twelve are false or describe something unbuilt**, each checked against the
 * running database rather than against the plan.
 *
 * A correction that silently matches nothing would leave the bundle's false copy
 * in a help article — the one surface a confused user reads to learn how the
 * product works — so every entry must match EXACTLY ONCE or the seed fails.
 */
const CORRECTIONS: { from: string; to: string; why: string }[] = [
  {
    from: 'Funn under terskel blir oppgaver med ansvarlig og frist, med hjemmel synlig.',
    to:
      'Grupper som er for små til å få egne resultater blir oppgaver med ansvarlig og ' +
      'frist, med hjemmel synlig. Plikten gjelder uansett hva de svarte.',
    why: 'D114 / Q72 (V2:4239): the trigger is audience size, not a finding',
  },
  {
    from: 'Funn under terskel blir oppgave automatisk, med kilde og hjemmel.',
    to:
      'Er en gruppe for liten til å få egne resultater, opprettes oppgaven automatisk ' +
      'ved utsending, med kilde og hjemmel. Den sier ingenting om hva gruppen svarte.',
    why: 'D114 / Q72 (V2:4270): same sentence, second article',
  },
  {
    from: 'Under terskel',
    to: 'Gruppe under terskel',
    why: 'D114 / Q72: the mock row said a FINDING under threshold requires action',
  },
  {
    from: 'Grupper under terskelen slås sammen i rapporten, uansett hvem som ser den.',
    to:
      'Grupper under terskelen vises ikke i rapporten, uansett hvem som ser den. Er bare ' +
      'én gruppe skjult, skjules også den nest minste — ellers kan den skjulte regnes ut ' +
      'fra summen.',
    why:
      'V2:4227 was FALSE and D109 is its class — wrong in the CAUTIOUS direction. ' +
      '`app.suppress_partition` sets {n: null, avg: null, suppressed: true} and hides a ' +
      'second row when exactly one is hidden. It suppresses; it does not merge. ' +
      '`reports.suppressedNote` already describes the real behaviour, so the article ' +
      'would have contradicted the report it explains',
  },
  {
    from: 'Fire roller styrer hva folk ser. Ingen av dem gir tilgang til enkeltsvar i anonyme undersøkelser.',
    to:
      'Tre roller styrer hva folk ser. Ingen av dem gir tilgang til enkeltsvar i anonyme ' +
      'undersøkelser.',
    why:
      "D106: `app.member_role` has THREE values — administrator, redaktor, leser — and v2's " +
      'own Brukere screen says three. The second sentence is true and stays: `answers` and ' +
      '`responses` carry no select policy for any role',
  },
  {
    from: 'Hver oppgave har én ansvarlig. Over frist varsles eieren i Teams.',
    to: 'Hver oppgave har én ansvarlig. Oppgaver over frist er merket i listen.',
    why:
      'Q71: TEAMS IS NOT BUILT, and this is the THIRD place the claim appeared — after ' +
      'V2:5198 and V2:2206, which V2-4 corrected. `weekly_digest` was the same shape one ' +
      'field over. The replacement describes the «Over frist.» banner the card actually renders',
  },
  {
    from: 'Leser ser summerte resultater. Verneombud har egen rolle i lovpålagte kartlegginger.',
    to:
      'Leser ser summerte resultater og aldri enkeltsvar. Verneombud er ikke en egen rolle — ' +
      'de signerer lovpålagte rapporter som signatar.',
    why:
      'D106, second half: the LEAD said four roles and this step names the fourth. ' +
      '`app.member_role` has three. Verneombud appears in `duty_signers`, which is a ' +
      'signature and not an access level — a reader given a role that does not exist ' +
      'will look for it under Brukere and not find it',
  },
  {
    from: 'Verneombud',
    to: 'Verneombud (signatar)',
    why: 'D106: the mock row asserted a fourth role in one word',
  },
  // ── THE CORRECTED BUNDLE'S OWN THREE (2026-09-10) ────────────────────────
  //
  // The revised `HeiTuva.dc.html` changed nine lines, six of them in this
  // article, to catch the bundle up with Q17/Q91 — the threshold is chosen by
  // the organisation, not fixed at five. Three of the six still need a
  // correction, and the first two are the interesting kind: **the bundle traded
  // one false sentence for another, and kept the first.**
  {
    from:
      'Terskelen bestemmer hvor mange svar som må inn før tall vises. Dere velger den selv; ' +
      'vi anbefaler fem, åtte for sensitive temaer. Lovpålagte kartlegginger har låst ' +
      'minimum. Fem er standard. For sensitive temaer bør dere bruke åtte.',
    to:
      'Terskelen bestemmer hvor mange svar som må inn før tall vises. Dere velger den selv; ' +
      'vi anbefaler fem, åtte for sensitive temaer. Lovpålagte kartlegginger har låst minimum.',
    why:
      'THE BUNDLE PREPENDED THE TRUE SENTENCES AND KEPT THE OLD ONES. Its last two — ' +
      '«Fem er standard. For sensitive temaer bør dere bruke åtte.» — are the text the ' +
      'revision was written to replace, and they now sit after the sentence that replaces ' +
      'them. «Fem er standard» asserts a FIXED number about a variable threshold, which is ' +
      'the class Q55 forbids: `organizations.default_k_threshold` defaults to 5 but is ' +
      'settable 3-10 (M:0034), so five is standard only for an organisation that has not ' +
      'changed it. Dropping the two duplicates leaves the revision saying what it meant',
  },
  {
    from:
      'Terskelen settes for hele virksomheten. Bare lovpålagte kartlegginger har et minimum ' +
      'som ikke kan senkes.',
    to:
      'Terskelen settes for hele virksomheten, og verdien er et gulv: heller ikke en ' +
      'administrator kan sette en enkelt undersøkelse under den, med mindre virksomheten ' +
      'har slått på «Tillat at redaktører senker terskelen». Lovpålagte maler har i tillegg ' +
      'sitt eget minimum.',
    why:
      'FALSE AGAINST THE RUNNING PRODUCT, and the sentence it replaced was true. Q90, ' +
      "M:0054 `app.guard_survey_policy`: when `k_threshold` moves on a person survey and " +
      'the new value is below `organizations.default_k_threshold`, the trigger raises ' +
      '`below_org_floor` — and its own comment says the flag is the organisation\'s ' +
      'exception «so this binds an administrator too: a setting any single person can ' +
      'undercut is not a setting». So a statutory pack is NOT the only minimum that cannot ' +
      'be lowered; the organisation\'s own default is one, and it is the one most readers ' +
      'of this article will hit first',
  },
  {
    from: 'Sensitive temaer (anbefalt 8)',
    to: 'Sensitive temaer (låses av malen)',
    why:
      'D114 again — a mock row is a claim about a control. This one sits in a mock of ' +
      '`Administrasjon · Personvern` between two real toggles, and that screen has THREE ' +
      'rows: the threshold, IP logging, EU-only (`PrivacyPanel.tsx:11-12,76`). There is no ' +
      'sensitive-topics setting anywhere in the schema. Eight is real but it arrives from ' +
      'the statutory harassment template, which LOCKS it (`surveys.trakasseringAnonNote`: ' +
      '«malen låser terskelen til åtte») — and the real panel already says so in the one ' +
      'control\'s description («lovpålagte maler har egen terskel»), not as a second row. ' +
      '«(anbefalt 8)» reads as advice an administrator may take here; «(låses av malen)» ' +
      'says where the number actually comes from',
  },
  {
    from: 'Du kan lime inn en liste, laste opp fil eller synkronisere med katalogen. Ved synk holdes gruppene oppdatert automatisk.',
    to:
      'Du kan lime inn en liste eller laste opp en fil. Katalogsynkronisering er ikke ' +
      'slått på ennå — når den er det, holdes gruppene oppdatert automatisk.',
    why: '`entra_sync` and `google_sync` are feature_flags rows and both are OFF',
  },
  {
    from: 'CSV og Excel forventer kolonnene e-post, navn og gruppe. Entra ID og Google henter grupper direkte.',
    to:
      'CSV forventer kolonnene e-post, navn og gruppe. Entra ID og Google henter grupper ' +
      'direkte når synkronisering er slått på.',
    why:
      'Same flags. And Q62: .xlsx is REFUSED by the importer, so «CSV og Excel» named a ' +
      'format the product declines',
  },
]

/** Articles whose SUBJECT is behind a disabled flag — see the migration. */
const REQUIRES_FLAG: Record<string, string> = {
  'Koble til HR- og lønnssystem': 'hr_sync',
}

/** `Kom i gang` → `komIGang`, the key the UI resolves through i18n. */
const CATEGORY_KEY: Record<string, string> = {
  'Kom i gang': 'komigang',
  Bygger: 'bygger',
  Anonymitet: 'anonymitet',
  Lovpålagt: 'lovpalagt',
  Rapporter: 'rapporter',
  Oppgaver: 'oppgaver',
  Administrasjon: 'administrasjon',
  Personvern: 'personvern',
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[æå]/g, 'a')
    .replace(/ø/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function extract(): Article[] {
  const src = readFileSync(BUNDLE, 'utf8')
  const start = src.indexOf('const HELP_ARTICLES = ')
  if (start < 0) throw new Error(`HELP_ARTICLES not found in ${BUNDLE}`)
  const from = start + 'const HELP_ARTICLES = '.length
  let depth = 0
  let end = -1
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) throw new Error('HELP_ARTICLES block is unbalanced')
  // The block is a plain object literal in the prototype's own source.
  const obj = Function(`return (${src.slice(from, end)})`)() as Record<string, Omit<Article, 'title'>>
  return Object.entries(obj).map(([title, a]) => ({ title, ...a }))
}

function applyCorrections(articles: Article[]): void {
  for (const c of CORRECTIONS) {
    let hits = 0
    for (const a of articles) {
      if (a.lead === c.from) {
        a.lead = c.to
        hits++
      }
      for (const s of a.steps) {
        if (s[1] === c.from) {
          s[1] = c.to
          hits++
        }
      }
      // Mock rows carry claims too — «Under terskel · krever tiltak» is the
      // falsified trigger in four words.
      for (const m of a.mock) {
        if (m[0] === c.from) {
          m[0] = c.to
          hits++
        }
      }
    }
    if (hits !== 1) {
      throw new Error(
        `D114 correction «${c.why}» matched ${hits} times, expected exactly 1.\n` +
          `A correction that silently matches nothing leaves the bundle's false copy in a ` +
          `help article, which is where a user goes to learn how the product works.`,
      )
    }
  }
}

const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function sql(query: string): void {
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', query], { encoding: 'utf8' })
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

function main(): void {
  const articles = extract()
  if (articles.length !== 12) throw new Error(`expected 12 articles, found ${articles.length}`)
  applyCorrections(articles)

  const slugOf = new Map(articles.map((a) => [a.title, slugify(a.title)]))

  sql('delete from public.help_articles')

  articles.forEach((a, i) => {
    const slug = slugOf.get(a.title)!
    const catKey = CATEGORY_KEY[a.cat]
    if (!catKey) throw new Error(`no category key for «${a.cat}» — add it rather than defaulting`)
    const minutes = Number(a.time.replace(/[^0-9]/g, ''))
    if (!minutes) throw new Error(`unreadable read time «${a.time}» on «${a.title}»`)
    // A related link that resolves to nothing is a dead end in the one surface
    // a lost user reaches for. Resolve them all, and fail on any that does not.
    const related = a.related.map((r) => {
      const s = slugOf.get(r)
      if (!s) throw new Error(`«${a.title}» links to «${r}», which is not one of the twelve`)
      return s
    })
    const flag = REQUIRES_FLAG[a.title]
    sql(
      `insert into public.help_articles (slug, category_key, read_minutes, tint, sort_order, related_slugs, requires_flag)
       values (${lit(slug)}, ${lit(catKey)}, ${minutes}, ${lit(a.tint)}, ${i},
               ${lit(`{${related.map((r) => `"${r}"`).join(',')}}`)}::text[],
               ${flag ? lit(flag) : 'null'})`,
    )
    const body = {
      steps: a.steps.map(([head, text]) => ({ head, body: text })),
      mock: {
        title: a.mockTitle,
        screen: a.mockScreen,
        rows: a.mock.map(([label, meta, tint]) => ({ label, meta, tint })),
        caption: a.caption,
      },
    }
    sql(
      `insert into public.help_article_translations (slug, lang, title, lead, body)
       values (${lit(slug)}, 'no', ${lit(a.title)}, ${lit(a.lead)}, ${lit(JSON.stringify(body))}::jsonb)`,
    )
  })

  // ── English ──────────────────────────────────────────────────────────────
  // Translations of the CORRECTED Norwegian, not of the bundle: the ten fixed
  // sentences are written from what the product does, so they cannot drift back.
  let en = 0
  for (const [slug, a] of Object.entries(HELP_EN)) {
    if (!slugOf.has([...slugOf.keys()].find((t) => slugOf.get(t) === slug) ?? '')) {
      throw new Error(`help-en carries «${slug}», which is not one of the twelve slugs`)
    }
    const body = {
      steps: a.steps,
      mock: {
        title: a.mockTitle,
        screen: a.mockScreen,
        // The tint is a property of the ROW's position, not of the language, so
        // it is taken from the Norwegian document rather than duplicated.
        rows: a.mock.map((r, idx) => ({
          ...r,
          tint: articles.find((x) => slugOf.get(x.title) === slug)!.mock[idx]?.[2] ?? '#FCF6E9',
        })),
        caption: a.caption,
      },
    }
    sql(
      `insert into public.help_article_translations (slug, lang, title, lead, body)
       values (${lit(slug)}, 'en', ${lit(a.title)}, ${lit(a.lead)}, ${lit(JSON.stringify(body))}::jsonb)`,
    )
    en++
  }
  if (en !== articles.length) {
    throw new Error(`${en} English documents for ${articles.length} articles — i18n is not complete`)
  }

  console.log(
    `seed-help: ${articles.length} articles in no + ${en} in en, ` +
      `${CORRECTIONS.length} corrections applied`,
  )
}

main()
