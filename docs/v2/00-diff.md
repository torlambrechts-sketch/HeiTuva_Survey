# 00 — Three-way diff (Round 0)

Evidence rules for this document: every clause asserting what the bundle does carries the
line it does it on. Every clause asserting what the application does carries `file:line`.
Every count carries the command that produced it. Where the instruction that commissioned
this round asserted a fact, I verified it and say so; where it was wrong against this
repository, the correction is stated in full rather than quietly applied.

Bundle installed at `design-reference-v2/heituva-survey-app-design/`. `design-reference/`
is untouched.

---

## 0. BLOCKING PREREQUISITES — read before anything else

### 0.1 The expansion catalogue is not in this repository (as the instruction said)

Three surfaces in this bundle are the same subject as work decided outside this repo:

| Surface | Catalogue item | Evidence |
|---|---|---|
| Målgrupper — populations, sources, dynamic rules | R3 contacts/accounts entity | `DEFAULT_AUD` :4312–4323 carries `kind/name/pop/count/source/updated/rule`; `popRows` :5037–5042 carries a *lawful basis* per population |
| Integrasjoner' CRM row — "trigger NPS etter sak" | R4 event ingestion | `intGroups` :5222 `["crm","CRM og kundeservice","HubSpot, Salesforce, Zendesk — trigger NPS etter sak", … "kunde-e-post, sakstype","Nivå 3"]` |
| Bruksområder page | the use-case registry | `USE_CASES` :4034–4041 (six); `HeiTuva Bruksomrader.dc.html` :51 markets nine |

**Nothing that depends on the catalogue may be scheduled until the catalogue lands.**
Concretely, that is: the Målgrupper *population* model (§A.4 below) and any part of the
final integrations phase that reads CRM events. It is *not* the whole of Målgrupper — the
group/segment layer is expressible against `public.groups` today (see §B.4), and it is
planned that way.

### 0.2 A second blocking gap the instruction did not know about: there is no v1 leg

The instruction asks for a **three-way** diff — original / v1 / v2 — and to read
`docs/v1/05-status.md` and the V1-0…V1-6 reports. **None of those exist in this
repository, and neither does `/design-reference-v1/`.** This is not a filing accident;
the work itself is absent. Evidence:

```
$ ls design-reference*/            # design-reference/ only, before this session
$ git log --oneline | wc -l        # 50 commits, tip = cd74022
$ git branch -a                    # two branches; the other is 12 commits BEHIND this one
$ grep -rn "V1-0\|docs/v1\|design-reference-v1" --include=*.md .   # no matches
$ grep -rln use_cases .            # no matches — the V1-5 registry does not exist
```

Arithmetic confirms the missing leg rather than a mislabelling. The instruction mined
"6727 lines from 4901, 2002 added, 176 removed". This repo's `design-reference/…/HeiTuva.dc.html`
is **4097** lines, and 4097 + 2985 − 355 = 6727 (`diff` counts below). But
4901 + 2002 − 176 = 6727 exactly. So the instruction's baseline is a real 4901-line bundle
that this repository has never held.

Everything else in the instruction that references that round is likewise absent here:

| Instruction reference | State in this repo |
|---|---|
| `Q45`, `Q49`, `Q52` | `DECISIONS.md` ends at **Q17** (17 rows, header line 5) |
| `D94` | `docs/DEVIATIONS.md` ends at **D88** (`docs/DEVIATIONS.md:1670`) |
| "V1-5 seeded SIX use cases" | no `use_cases` table, no seed rows, no `USE_CASES` in the old bundle |
| "V1-1's defect 4 fixed the builder input" | the old bundle has no `flex:1 1 220px` at all (count 0) |
| "V1-6 shipped a defect behind a green visual diff" | no such report exists |
| "the descheduled V1-7 stream panel" | in this repo the stream panel is **D87 Del B**, deferred for a stated reason |

**Consequence, and it is the single most useful correction in this document:** what the
instruction treats as *new v2 surfaces* are, in this repository, of two very different
kinds, and the plan must not mix them:

- **Kind 1 — the answer to a stop-and-ask this repo already logged.** `docs/DEVIATIONS.md:1622`
  (D87) lists **nine** surfaces the Q17 design brief described in prose and Phase 9 refused
  to build, because `/design-reference/` did not draw them, and building from prose would
  break the do-not-invent rule. **v2 draws all nine.** See §A.0. These are not new scope;
  they are scope already decided under Q17, unblocked.
- **Kind 2 — genuinely new product.** Oppgaver, Live, Quiz, the help centre, Målgrupper's
  population model, Integrasjoner, the public API and webhooks. See §A.1 onward.

The three-way diff is therefore delivered as a **two-way diff with the middle leg named as
missing**. Every number below is measured against `design-reference/` (4097 lines), and
where the instruction quoted a number against the 4901 baseline I give both.

### 0.3 What Tor owes before Round 3's phases can be scheduled

1. The expansion catalogue (R3/R4), per §0.1.
2. `HeiTuva Lovpalagt.dc.html` — **a fourth page the bundle references but does not
   contain.** `HeiTuva Splash.dc.html:1027` and `:1029` link to it twice
   (`href="HeiTuva Lovpalagt.dc.html#" + r.page`). The bundle ships three `.dc.html`
   files. Any splash fidelity pass hits two dead links on the first read.
3. A decision on whether the missing v1 round is meant to arrive (§0.2). If it is, this
   plan is written against a baseline that will move under it.

---

## A. BUNDLE DIFF — v2 against `design-reference/` (the only baseline present)

### A.0 Headline counts, verified

```
$ wc -l design-reference/…/HeiTuva.dc.html            4097
$ wc -l design-reference-v2/…/HeiTuva.dc.html         6727
$ diff old new | grep -c '^>'                         2985
$ diff old new | grep -c '^<'                          355
$ grep -o '<sc-if'  old | wc -l → 131 ;  new → 221
$ grep -o '<sc-for' old | wc -l → 120 ;  new → 204
```

Distinct `sc-if` state names (extracted as `<sc-if value="{{ name }}"`):
**126 → 205; 79 added, 4 removed.**

- Added (79): `adminIntegrasjoner adminMalgrupper adminProfil attribNote b.hidden bankNote
  cameFromBuild contactSent custData custLayout custPanels customizeOpen dashNeedsSetup
  dashReady g.hasWarn g2.small hasAudMix hasBrandOverride hasCtxRecur hasPolWarnings
  hasRecurStatus hasRounds hasThresholdWarn helpArticles helpContact helpForum helpList
  helpOpen i.req isCustomCadence isHelp isLiveMode isLiveScreen isQuizMode isTasks
  liveRevealed metaClosed metaOpen mgImportDone mgImportOpen mgNote modeNote noHelpHits
  notTestMode p.il0…p.il6 p.mine p.quizLine pickerOpen pn.canPin pn.isDuties pn.isRegister
  pn.isStream polAnonNote polIsPerson polLocked polLowWarn polOpen quizAnonBlocked r.open
  recurInherited resAggregate resAttrib respondOne.plainChoices respondOne.quizTiles
  s.hasRecur s.isRecur sendBlocked senderLocked sg.small showUseCases t.hasPolicy t2.hasLaw
  t2.isLate t2.needsEffect tabGeneral testMode wizIsCustom`
- Removed (4): `isPasteImport isSyncImport q.advScale respondOne.hasChoices`

**Correction to the instruction:** it claims "32 new sc-if states, 2 removed". Against
*this* baseline it is **79 new, 4 removed**. The 47-state difference is the missing v1
round — and it is almost exactly the Q17 state set (`polOpen polLocked polLowWarn
polAnonNote polIsPerson hasPolWarnings attribNote resAttrib resAggregate t.hasPolicy`
plus the dashboard-customise set `custData custPanels custLayout customizeOpen dashReady
dashNeedsSetup pn.*`), which is independent evidence for §0.2's conclusion. The two extra
removals it did not see are `q.advScale` and `respondOne.hasChoices`.

### A.0b The nine D87 surfaces are now drawn — this is Kind 1

| D87 surface (`docs/DEVIATIONS.md:1622`) | v2 evidence |
|---|---|
| Builder «Hvem svarer og hva vises» panel (§1) | `:714` heading, `:725` `sc-if polOpen`, `:734` "Hvem svarer" |
| Its two extra breach warnings (§2) | `polWarnings` / `hasPolWarnings` :6685; `polLowWarn` :6683 (`pol.kind === "person" && pol.threshold < 5`) |
| The attributed-results table (§5) | `sc-if resAttrib` :3607, heading «Svar per virksomhet» :3611, `attribRows` :3635 / :6692 |
| «Svar per virksomhet» section body (§6) | registry row :4030 `{ key:"register", arche:"reg", … req:"krever organisasjonsrespondenter" }`; panel :5337 |
| Filter-tab source lines (§6) | (see §A.9 — present, needs a per-line fidelity pass) |
| Personvern default-threshold picker (§8) | in the Personvern tab; `adminTabs` :4889 |
| Redaktør-may-lower switch (§8) | ditto |
| Del B panel library + presets | `DASH_PRESETS` :4044–4050; `custData/custPanels/custLayout` :5303; `customizeOpen` :5298; `dashPresets` :5292 |
| Del B event-stream panel | `ARCHE_LABEL.stream` :4024; panel row :4032; `streamWin` in initial state :4368; markup :1325–1326 |

The four dashboard **archetypes** are now explicit and named in one place — `:4024`:
`agg` "Aggregat over personer", `reg` "Register per respondent", `duty` "Pliktstatus over
tid", `stream` "Hendelsesstrøm". That classification is the spine the Q17 brief asked for
and it is the right organising principle for the aggregation phases.

### A.1 Navigation is restructured, and no state diff sees it

| | old | v2 |
|---|---|---|
| `const screens` | `:2942` `dash, surveys, dashboard, library, reports` | `:4790` `dash, surveys, tasks, insight, library` |

Oppgaver is **not** "a fifth nav item" — the count is five in both. **Dashboard and
Rapporter lose their top-level slots and become sub-tabs of a new group, Innsikt**:

- `insightTabs` `:5280` = `[["dashboard","Dashboard"],["reports","Rapporter"]]`
- `go()` `:4487` — `screen === "insight"` resolves to `this.state.insightLast || "dashboard"`
- `:4473` remembers which of the two you were last on
- `:4881` — the nav item lights up when `screen` is either `dashboard` or `reports`

The application's nav is the *old* list: `components/AppHeader.tsx:19-24`
(`dash, surveys, dashboard, library, reports`), with the comment at `:12` naming the old
bundle's `~line 2942` as its source. Every route survives; the shell changes.

### A.2 Oppgaver — a statutory-obligation register, and its lifecycle is a database rule

`DEFAULT_TASKS` **:4165–4175** (not :4160). Nine rows, each with
`title, source, kind, law, owner, due, status, late`. The `law` values that appear:
`aml. § 3-1 (2) c`, `aml. § 4-3 (3)`, `aml. § 2A-3`, `ldl. § 26 (2) nr. 1`,
`aml. § 14-4 a`, `åpenhetsloven § 4`, `åpenhetsloven § 7` — the instruction's list is
right but misses `åpenhetsloven § 7` (row :4172, "Svar på innsynskrav").

The lifecycle is six steps, hard-coded at **:5181**:
`["Foreslått","Besluttet","Pågår","Gjennomført","Effektvurdert","Lukket"]`, advanced one at
a time by `onAdvance` (:5191–5195). The constraint that makes it a schema matter and not a
UI flow is **:5197**:

> `taskEffectNote: "Et tiltak kan ikke lukkes før effekten er vurdert. Det er kravet i aml. § 3-1 og ldl. § 26 fjerde ledd."`

rendered at `:2175`. The screen also derives `needsEffect: t2.status === "Gjennomført"`
(:5189) and shows a prompt at `:2203`. Four filters (`alle/mine/frist/lov`, :5164) and four
stat tiles (:5168–5177), one of which counts tasks **with a legal basis**.

**The row that is the security problem** is :4168:

> `{ title:"Risikovurdering av ytringsklima", source:"Psykososial kartlegging · under terskel", kind:"Risikovurdering", law:"aml. § 4-3 (3)", owner:"Tuva Berg", due:"20. sep", status:"Besluttet", late:true }`

and the two copy lines that make it a rule rather than a sample: **:4239**
("Funn under terskel blir oppgaver med ansvarlig og frist, med hjemmel synlig") and
**:4270** ("Funn under terskel blir oppgave automatisk, med kilde og hjemmel"). Analysed
in 01-briefs §2(i).

`taskChannels` :5198 — "Oppgaver varsles i Teams og i det ukentlige sammendraget" — makes
the notification path an integration dependency, and the late-row copy at `:2206` repeats
it ("varsel er sendt til eier i Teams").

### A.3 Live mode

States `isLiveScreen` (screen block :1829–1945), `isLiveMode`, `liveRevealed`, `liveStage`
(:6176–6182: `title/counter/code/revealLabel/step`), `liveGuard` :6147,
`DEFAULT_LIVE` :4338 — ten toggles, labelled at :6136–6145:
`fullscreen, qr, counter, manualReveal, liveChart, cloud, countdown, questions, temp,
closing`. Of these, `countdown` and `questions` default **off** and the rest **on**;
`countdown`'s own description :6142 says "Av som standard — ekskluderer folk som trenger tid".

Surfaces on the projected screen: word cloud (`cloudWords` :6179) gated by
`cloudModeration` :6180 ("3 frisvar venter på moderering før de vises"), a priority
exercise (:6181), **audience questions with vote counts** (`audienceQuestions` :6183,
rendered :1906–1912), a temperature reading (:6184), a closing/announcement screen
(:6185), and — only under `isQuizMode` — the team leaderboard (`quizBoard` :6186,
rendered :1934).

`liveGuard` :6147 states the static rule: "Live respekterer anonymitetsterskelen. Er det
færre svar enn terskelen, vises ingen tall på skjermen." The instruction is right that
this is already handled in the design and should not be reported as unaddressed. The
timing leak and the UGC surface are analysed in 01-briefs §2(ii) and §2(v).

### A.4 Quiz mode

`isQuizMode` :6131, `quizAnonBlocked` :6164 (**not :4831**; the underlying `quizAnon` is
computed at **:4831**: `(sv.policy ? sv.policy.anon : st.anonMode) === "anonymous" || st.anonMode === "anonymous"`),
`DEFAULT_QUIZ` :4339 `{timeBonus, team, instant, certificate}`, toggles :6149–6153,
`quizGuard` :6163. The design already resolves the anonymity collision by locking the
whole quiz settings group while the survey is anonymous (opacity .45, cursor not-allowed,
`onToggle` returns early — :6156–6158; the numeric fields do the same at :6160 and :6162).

Two fields the instruction correctly flags as the real question:
`quizPass` (:6159, "Bestått-grense", default 70) and `quizTries` (:6161, "Antall forsøk",
default 2), plus `certificate` "Sertifikat ved bestått — Sendes på e-post" (:6152). Per
question: `answerIndex` and `pointsAward` (:6507). Analysed in 01-briefs §2(iii).

`QUIZ_TILES` **:4084–4089** — four colours outside the theme: `#F26B21 #2F6FB0 #2F7D4F
#B0343C`, each with `fg:"#FFFDF6"`. Rendered at :4768 (`QUIZ_TILES[li % 4]`) and reached
by the respondent through `respondOne.quizTiles`. Also `modeNote` :6122 — quiz is refused
on statutory packs: "Quiz kan ikke brukes på lovpålagte maler".

### A.5 Målgrupper

Tab added to `adminTabs` **:4889**, which grows from five to eight:

| old `:3012` | v2 `:4889` |
|---|---|
| firma, brukere, grupper, personvern, valg | firma, **profil**, brukere, **malgrupper**, grupper, **integrasjoner**, personvern, valg |

Screen block :2405–2470+. Three layers:

1. **Populasjoner** (`popRows` :5037–5042) — four rows, each carrying a **lawful basis and
   a retention period**: Ansatte / "Arbeidsavtale · behandlingsgrunnlag: arbeidsforhold" /
   HR-system / 86 / 24 mnd; Innleide og vikarer / "Arbeidsgiveransvar etter aml. § 2-2" /
   Bemanningsbyrå · CSV / 12 / 24 mnd; Leverandører / "Aktsomhetsvurdering ·
   åpenhetsloven" / Leverandørregister / 58 / 5 år; Kunder / "Samtykke eller
   kundeforhold" / CRM / 1 420 / 12 mnd. `popNote` :5043 states the separation rule:
   "En undersøkelse kan bare sendes til én populasjon om gangen, slik at kunde- og
   ansattdata aldri blandes."
2. **Grupper** (`mgGroups` :5045) — fixed lists, from `DEFAULT_AUD` :4313–4318, each with
   `source` ∈ {Entra ID, CSV, Leverandørregister} and `updated`.
3. **Segmenter** (`mgSegments` :5049) — rule-based and self-updating, `DEFAULT_AUD`
   :4319–4322, `rule` rendered as monospace: `"stillingsprosent < 100 og ansatt før 2024"`,
   `"startdato innen 90 dager"`, `"land i høyrisikoliste"`, `"sak lukket siste 30 dager"`.

Both list layers carry a below-threshold badge: `small: g.count < 5`,
`smallNote: "Under terskel — resultater vises ikke"` (:5048, :5052). **That 5 is a
hard-coded constant** — see §A.10.

`auditRows` :5031–5036 is a change log per audience, including
`"312 treff · frosset for Ukespuls 36"` — segments are **frozen per round**, which is a
schema requirement, not a UI nicety.

### A.6 Suppression and member state

`SUPPRESSED` **:4325** = `["reservert@nordiskstudio.no","kunde.avmeldt@example.no"]`,
consumed three ways: import blocks them (:4971), preview badges them "Reservert" (:4982),
the recipient list filters them out (:4993). `suppressRows` :5014 gives each a reason —
"Avmeldt kundeundersøkelser" / "Reservert av personen selv".

`MEMBERS` **:4327–4335**, eight rows, four statuses: `Aktiv`, `Bounce`
("adressen svarer ikke"), `Reservert` ("har sagt nei til undersøkelser", :4332), `Ny`
("importert i dag"). Rendered with per-status tint at :5009. The source column is real
provenance: "Entra ID · i dag", "HR-system · 1. sep", "importert i dag".

### A.7 Integrasjoner — DEFERRED, inventory only

`intGroups` **:5200–5227**. Fifteen systems in five groups. Verbatim, with the fields each
reads and its level:

| Group | Key | Name | Reads | Level |
|---|---|---|---|---|
| Brukere og organisasjon | entra | Microsoft Entra ID | navn, e-post, gruppe, stilling, sluttdato | Nivå 1 |
| | google | Google Workspace | navn, e-post, organisasjonsenhet | Nivå 1 |
| HR og lønn | hr | HR-system | stillingsgruppe, ansiennitet, stillingsprosent, **kjønn** | Nivå 1 |
| | lonn | Lønnssystem | **lønn per stillingsgruppe (aggregert)** — "grunnlag for ARP" | **Lovpålagt** |
| | fravar | **Sykefravær (aggregert)** — "Korrelér risiko mot fravær per enhet" | fraværsprosent per enhet | Nivå 2 |
| Varsling og samhandling | teams | Microsoft Teams | varsler, oppgavekort | Nivå 1 |
| | slack | Slack | varsler, oppgavekort | Nivå 1 |
| | kalender | Kalender | møtetid, frist, eier | Nivå 3 |
| Signering og arkiv | bankid | **BankID / ID-porten** — "Signering av rapporter og tiltaksplaner" | navn, signaturtidspunkt | **Lovpålagt** |
| | arkiv | Sak og arkiv | rapport-PDF, metadata | Nivå 2 |
| Leverandør og kunde | brreg | Brønnøysund og Proff | orgnr, bransje, land | Nivå 3 |
| | sanksjon | Sanksjonslister | treffliste | Nivå 3 |
| | crm | CRM og kundeservice — "trigger NPS etter sak" | kunde-e-post, sakstype | Nivå 3 |
| | bi | **Power BI og Tableau** | **aggregerte resultater** | Nivå 2 |

Four default to "Tilkoblet" in the mock (`defs = { entra:1, hr:1, teams:1, brreg:1 }`,
:5233). `dataFlowNote` :5250 is the product's own promise: "Vi henter bare feltene som er
listet per integrasjon. Lønn hentes aggregert per stillingsgruppe, aldri per person.
Anonyme svar kobles aldri mot data fra andre systemer."

### A.8 Public API and webhooks — DEFERRED, inventory only

`apiKey` :5240 (`"ht_live_9f2c··············a41"`), `apiRevealed` :5241, reveal toggle
:5242, rendered :2695. `webhookEvents` **:5243–5249**: `survey.completed`,
`response.received` ("Nytt svar registrert (uten innhold)"), `task.created`
("Nytt tiltak opprettet fra funn"), `task.overdue`, **`threshold.breached`** ("Funn under
terskel — kan utløse undersøkelsesplikt"), `report.signed`.

### A.9 Help centre, Profil-and-sender, test mode, and the smaller states

- **Help centre.** `isHelp` block :1946–1945+, `helpOpen`, `helpList`, `noHelpHits`,
  `helpContact`, `contactSent` (:5159), `helpForum` :5086 (`st.helpTab === "forum"`).
  `HELP_ARTICLES` :4177+ — **12 articles** across seven categories (Kom i gang, Bygger,
  Anonymitet, Lovpålagt, Rapporter, Oppgaver, Administrasjon, Personvern), each with
  `lead`, three `steps`, a `mock` screen, a `caption` and `related` links. Also
  `statusRows` :5161 — a service-status panel.
- **Profil og avsender.** `adminProfil` block :2310–2404: logo slots, accent swatches with
  a stated contrast ratio, type pairs, **sender domains with DNS record status**
  (:2353–2360), and sender profiles. The lock is what ties it to the policy model:
  `brandLocked = !!(sv.policy && (sv.policy.locked || sv.policy.legal))` **:4830**, which
  drives `senderPick` :4932, collapses `senderOptions` to `["Nøytral"]` :4933, refuses the
  change :4934, sets `senderLocked` :4935 (rendered :3100) and blanks `accentOverride`
  :4939. So sender and brand inherit **Q17's** lock, not a profile setting — the
  instruction's point P, confirmed.
- **Test mode.** `testMode` :6631, entered by `onTestSurvey` :6637, left by `onExitTest`
  :6638, and short-circuited in `submit()` at **:4577** — `if (this.state.testMode){ this.setState({ thanked:true }); return; }`,
  i.e. the response is never appended. Banner at :3323 and :3558.
- **Send guards.** `audBlocked = audPops.length > 1` **:4829**; `sendBlocked: audBlocked`
  :6618; the button is relabelled "Velg én populasjon for å sende" :6619, greyed :6620,
  `cursor:not-allowed` :6621, and the handler returns early :6624. `audMixWarn` **:6551**:
  "Du har valgt flere populasjoner. Ansatt- og kundedata har ulikt behandlingsgrunnlag, så
  utsendingen er sperret til du velger én populasjon." Rendered :3084 and :3298.
- **Import consolidated.** `isPasteImport` (old :4019) and `isSyncImport` (old :4020) are
  gone. v2's Send screen has a single one-off list — "Engangsliste for denne utsendingen"
  :3020 — with `onSaveAsAudience` (:3037, "Lagre som målgruppe") and an explicit hand-off
  at :3040: "Synk fra Entra ID, Google Workspace, HR-system og distribusjonslister
  administreres i Målgrupper, der de får eier og synkstatus." **This supersedes Q9's
  placement of the sync stubs** (see 02-conflicts §3).
- **Recurrence.** `s.isRecur/s.hasRecur`, `hasCtxRecur` :5739, `recurInherited` :5993
  (cadence inherited from the duty: "Hyppigheten er arvet fra plikten (…)"),
  `isCustomCadence` :5987, `hasRecurStatus` :5994, `hasRounds` :6001 (`rounds.length > 1`).
- **Misc.** `metaOpen/metaClosed` :6632, `pickerOpen` :6197, `bankNote` :4431,
  `cameFromBuild` :6192, `tabGeneral` :6476, `mgImportOpen` :4953, `mgNote`, `mgImportDone`.

### A.10 A systematic change to existing screens that no state diff sees — confirmed, and one correction

Measured:

```
box-sizing:border-box          old 20   →  new 82   (+62)
max-width:100%                 old  0   →  new 42   (+42)
min-width:140px                old  2   →  new  0
flex:1 1 130px;min-width:0     old  0   →  new  2
<input>/<select>/<textarea>    old 54   →  new 76
```

The instruction says "24 → 82" and "roughly 58 existing fields". Against this baseline it
is **20 → 82**, and the measurable mechanism is the pairing `box-sizing:border-box;max-width:100%`
applied to 42 controls on a population that itself grew by 22. Whether v1 already carried
part of this, I cannot say — the middle leg is missing (§0.2). **The consequence stands
either way and is the important part: the fidelity check for v2 covers EXISTING screens,
not only new surfaces.**

The header change is the same class and equally invisible to a state diff:

| | old | v2 |
|---|---|---|
| user button | `:170` pill, `aria-label="Brukermeny"`, avatar **+ visible `{{ userName }}`** at `:172` | `:195` 38×38 circle, avatar only, `aria-label="Brukermeny for {{ userName }}"` **and** `title="{{ userName }}"` |
| dropdown | name at `:177` | name at `:199` **plus a role line** `{{ userRole }}` at `:200` |

**Confirmed fidelity fact:** the builder question input in v2 is
`box-sizing:border-box;max-width:100%;flex:1 1 220px;min-width:0` at **:414**. The old
bundle contains no `flex:1 1 220px` anywhere (count 0), so in this repo this is a v2
change, not a convergence on a shipped v1 fix.

### A.11 The threshold constant regressed in three places in the bundle

Q17 made `k` a per-survey policy (`app.k_for`, `supabase/migrations/20260904000032_threshold_policy.sql:69`),
floor 3, none for organisation respondents. **Three v2 surfaces hard-code 5 instead:**

- `hasThresholdWarn` **:4988** — `(st.audGroups || DEFAULT_AUD).some(g => g.count > 0 && g.count < 5)`
- `mgGroups.small` **:5048** — `g.count < 5`, note "Under terskel — resultater vises ikke"
- `mgSegments.small` **:5052** — same

Also `:4986` builds the warning's group list on the same constant. This is a bundle defect
against a committed decision, not a design choice; see 02-conflicts §1. It also answers the
instruction's question directly: **`hasThresholdWarn`'s `audGroups` IS the data source D87/D88
has been waiting for** — the builder's §2 breach warning needs a *pre-send audience with
counts*, which is exactly `DEFAULT_AUD` — but it must be re-derived from `app.k_for(survey)`
rather than from 5.

### A.12 Content growth outside the app file

- **Bruksområder** (new page, 331 lines). `ORDER` :290 — nine survey types:
  `puls, medarbeider, psykososial, trakassering, likestilling, aktsomhet, onboarding,
  kunde, exit`. Headline :51: "Ni undersøkelser norske virksomheter kjører oftest."
  **Correction to the instruction's point Q:** these nine are *survey types* and map to
  template packs, not to `USE_CASES`, which has six (:4034–4041, keys `hr, kunder, intern,
  leverandor, offentlig, medlem`) and is a *category* axis used by `packCats` :6229 and
  `useCaseCards` :6233. There is no contradiction to resolve between "nine" and "six";
  they are different registries. The real question is whether the app grows a use-case
  registry at all — see §B.5.
- **PACKS** grew 18 → 23 (`grep -c '^  "'` inside the `const PACKS` block). New:
  *Servicedesk etter sak, IT og verktøy, Innbyggerundersøkelse, Brukerundersøkelse
  tjeneste, Frivillige etter arrangement*.
- **Splash** 696 → 1051 lines. **Correction to the instruction's point N:** `authNote` is
  **not** new — it appears three times in both files. The two new states are `r.isLegal`
  :217 and `r.hasPage` :226, part of a ranked list whose "details" links point at the
  **missing fourth page** (§0.3.2). The other ~350 lines are content needing a fidelity
  pass.

---

## B. APPLICATION DIFF — every surface against what exists

Classification: **BUILT** (exists and matches the v2 shape) · **PARTIAL** (a real
implementation exists but v2 changes or extends it) · **NOT BUILT**.

| # | v2 surface | Class | Where it lives / what is missing |
|---|---|---|---|
| B.1 | Nav restructure to `dash/surveys/tasks/insight/library` | **PARTIAL** | `components/AppHeader.tsx:19-24` is the old five. Routes `/dashboard` and `/rapporter` exist (`app/(app)/dashboard/page.tsx`, `app/(app)/rapporter/page.tsx`); they need an Innsikt group with a remembered sub-tab (bundle :4473, :4487, :5280). `components/MobileNav.tsx` and `components/AppNav.tsx` both consume the same `NAV`. |
| B.2 | Header: avatar-only button + role line | **PARTIAL** | `components/AppHeader.tsx`, `components/UserMenu.tsx`. `initialsOf` already exists (`lib/auth/session`). Pure fidelity work. |
| B.3 | Oppgaver screen | **NOT BUILT** | Nearest thing is `loop_actions` (`supabase/migrations/20260902000006_compliance_reports.sql:116`) surfaced on Oversikt (`app/(app)/oversikt/page.tsx`, `app/(app)/oversikt/actions.ts`). `loop_actions` is `{text, owner_member_id, due_at, done boolean}` — a two-state checkbox with no `kind`, no `law`, no `source`, no six-step lifecycle, no effect assessment. Oppgaver **supersedes** it. |
| B.4 | Målgrupper — grupper og segmenter | **PARTIAL** | `public.groups` exists (`…0002_tenancy.sql:29`): `{id, org_id, name, lead_member_id}` with `unique(org_id, name)`; members join via `org_members.group_id` (`…0002_tenancy.sql:41`). Admin UI at `app/(app)/administrasjon/grupper/` + `GroupsPanel.tsx`. Missing: `pop`, `source`, `updated`, `kind` (gruppe/segment), the `rule` expression, per-round freezing, and the audit log (bundle :5031). |
| B.5 | Målgrupper — populasjoner | **NOT BUILT · CATALOGUE-BLOCKED** | Nothing models a population, a lawful basis or a retention period per population. This is R3 (§0.1). |
| B.6 | Suppression list | **NOT BUILT** | No opt-out table. `survey_invitations` has `bounced_at` (`…0004_distribution.sql:27`) but nothing for "har sagt nei". `app.apply_retention` exists but is unrelated. |
| B.7 | Member statuses Aktiv/Bounce/Reservert/Ny | **PARTIAL** | `org_members.status` is `check (status in ('invited','active','inactive'))` (`…0002_tenancy.sql:43`) — three values, different semantics. `survey_invitations.bounced_at` holds bounce at the *invitation* level, not the member level. |
| B.8 | Live mode | **NOT BUILT** | No screen, no route, no schema. `share_links` supports `kind in ('link','qr')` (`…0004_distribution.sql:38`) so the QR join path partly exists. |
| B.9 | Quiz mode | **NOT BUILT** | No `answerIndex`/`pointsAward` on `survey_questions`, no scoring, no attempts, no pass mark, no certificate. |
| B.10 | Tasks from below-threshold findings | **NOT BUILT** | And must not be built before the question in 01-briefs §2(i) is answered. |
| B.11 | Help centre | **NOT BUILT** | No route. Twelve articles are content (data-not-code → `ui_messages` or a new registry). `helpForum` is UGC and is scope-split. |
| B.12 | Admin → Profil og avsender | **NOT BUILT** (tab) / **PARTIAL** (lock) | The tab does not exist (`app/(app)/administrasjon/layout.tsx:59-66` lists brukere, grupper, personvern, valg, sprak). The lock it depends on **does** exist: `app.guard_survey_policy` and the pack-locked policy from `…0032_threshold_policy.sql` / `…0034_attributed_and_org_policy.sql`, and D87 already shipped the Send-screen lock copy. |
| B.13 | Admin → Integrasjoner | **NOT BUILT · DEFERRED** | Inventory only. Note two are already half-real: Entra ID SSO shipped in Phase 6e (`…0029_sso_break_glass.sql`, D82) and `feature_flags` exists for stubs (Q9). |
| B.14 | Public API + webhooks | **NOT BUILT · DEFERRED** | No API key surface, no outbound webhook machinery. `pgmq` and `mail_outbox_*` exist as the queue precedent (`…0009_mail_outbox_api.sql`). |
| B.15 | Send guard on mixed populations | **NOT BUILT** | `send_round` (`supabase/migrations/20260903000008_send_round.sql`, re-declared in `…0027_sms_channel.sql`) has no population concept. Today the design enforces it with a disabled button only (:6621, :6624). |
| B.16 | Test mode | **NOT BUILT** | `submit_response` is the only write path and is token-validated; there is no dry-run. |
| B.17 | Builder «Hvem svarer og hva vises» panel (D87 §1) | **PARTIAL** | Kernel shipped Phase 9: `app.k_for` (`…0032:69`), `app.guard_survey_policy`, `apply_pack_policy`, `organizations.default_k_threshold`, `privacy.redaktor_may_lower`, the org-survey naming CHECK (`…0034`). The **panel** was refused as D87. Now drawable. |
| B.18 | Two breach warnings (D87 §2) | **NOT BUILT** | Needs B.17's panel plus a pre-send audience with counts (§A.11). |
| B.19 | Attributed-results table (D87 §5) | **PARTIAL** | `public.attributed_results` and `app.attributed_rows` exist (`…0034`), tested in `tests/invariants/attributed-results.test.ts` (15 tests). The **table UI** was refused as D87/D88. Now drawable. |
| B.20 | «Svar per virksomhet» section body (D87/D88 §6) | **PARTIAL** | `compose_report` composes it through `app.attributed_rows` and refuses it over person sources with `reason: person_sources` (`…0021`, `…0017`). Renders today as a status line (D88). Now drawable. |
| B.21 | Personvern threshold picker + redaktør-may-lower switch (D87 §8) | **PARTIAL** | Both flags exist in the schema (`…0034`); D87 records that **no server actions were written**, deliberately, because an action with no caller is a lie. Now callable. |
| B.22 | Del B — panel library, presets, stream panel | **NOT BUILT** | `dashboard_pins` exists (`…0024_dashboard_pins.sql`) and is the nearest primitive. The four archetypes (:4024) are new. The stream panel needs a rolling window over rounds. |
| B.23 | Five new template packs | **NOT BUILT** | `template_packs` + `template_pack_translations` exist and are seeded (`supabase/seed.sql`); five rows + translations. Data-not-code. |
| B.24 | `USE_CASES` category registry | **NOT BUILT** | Six categories driving `packCats` (:6229), `wizUses` (:5848), `useChips` (:5914), `useCaseCards` (:6233), and the wizard. A registry table, data-not-code. |
| B.25 | Bruksområder marketing page | **NOT BUILT** | New public route. Nine cards, own data (`UC` :184, `ORDER` :290). |
| B.26 | Splash growth + the two new states | **PARTIAL** | `app/(marketing)/page.tsx` exists (Phase 6b). Two dead links (§0.3.2) block a clean fidelity pass. |
| B.27 | Responsive/box-sizing hardening on existing screens | **PARTIAL** | The app solved the same class differently — `docs/RESPONSIVE.md` patterns, D12's header fix, `scripts/verify/responsive.ts`. A **fidelity check**, not a rebuild (CLAUDE.md). |
| B.28 | Import consolidation | **PARTIAL** | `import_jobs` exists (`…0004_distribution.sql`), CSV/Excel/paste shipped (Q9), `tests/unit/import.test.ts` = 15 tests. v2 moves sync out of Send into Målgrupper and adds "Lagre som målgruppe". |
| B.29 | Recurrence: inherited cadence, rounds, custom | **PARTIAL** | `survey_rounds`, `schedules`, `app.run_due_schedules`, `close_round` all exist. "Cadence inherited from the duty" (:5993) is new and needs `duty_definitions` → schedule linkage. |

---

## C. SCHEMA DIFF — what each surface needs that the schema lacks

Inventory only. No proposals; those are Round 1's and Round 3's job. Current state:
**62 migrations**, 41 `public` tables, 40 `app.*` + 30 `public.*` functions.

| Surface | Missing from the schema | Cited against |
|---|---|---|
| **Oppgaver** | A task entity with `kind`, `law` (statutory citation), `source` (what produced it), a six-step `status` enum, `late`, and a **transition rule that refuses `Lukket` unless an effect assessment exists**. `loop_actions` has `text/owner_member_id/due_at/done` only. Also: the effect assessment itself (which round, which questions, measured against what). | `…0006_compliance_reports.sql:116` |
| **Tasks from findings** | A representation of a finding that can be *referenced* without disclosing it. Nothing today lets a row point at a suppressed cell. Also the audit trail for automatic creation. | `…0032_threshold_policy.sql:69` (`app.k_for`) |
| **Målgrupper — groups** | `groups` lacks `kind` (gruppe/segment), `population_id`, `source`, `synced_at`, `rule` (a stored, evaluable predicate), and per-round **freezing** of a segment's membership. | `…0002_tenancy.sql:29` |
| **Målgrupper — populations** | Everything: the entity, its lawful basis, its retention period, and the FK from group → population. **Catalogue-blocked.** | — |
| **Send guard** | No population on `survey_rounds`/`survey_invitations`, so the mixed-population refusal cannot be enforced in `send_round`. | `…0004_distribution.sql:14` |
| **Suppression** | An org-scoped opt-out list keyed by email with a reason and a timestamp, honoured by `send_round` and by import. | — |
| **Member state** | `org_members.status` allows `invited/active/inactive`; v2 needs `Aktiv/Bounce/Reservert/Ny` semantics, and bounce needs to promote from invitation to member. | `…0002_tenancy.sql:43` |
| **Live** | A session entity (which survey, which round, which question is on screen, revealed or not), the ten toggles as a policy row, a moderation queue for free text, and an **audience-questions table with votes** — the first UGC in the product. Plus whatever makes the *counter* safe (01-briefs §2(ii)). | — |
| **Quiz** | `survey_questions` has no `answer_index`/`points`; no attempts table, no pass mark, no certificate issuance, no team assignment for the leaderboard. And a decision on whether an assessment may live in `responses` at all. | `…0003_surveys.sql` |
| **Test mode** | A dry-run path that reaches `submit_response`'s validation without writing. Today the CHECK constraints and the single-write-path invariant assume every call is real. | `…0009_rpcs.sql` |
| **Profil og avsender** | Sender domains with DNS verification state; sender profiles; logo slots; accent/type overrides. The **lock** already exists and must be reused, not re-derived. | `…0034`, `app.guard_survey_policy` |
| **Del B panels** | A panel registry with the four archetypes, saved layouts, and org/user presets. `dashboard_pins` is the nearest primitive and is not a layout. | `…0024_dashboard_pins.sql` |
| **Stream panel** | A rolling-window aggregate over rounds, k-gated per window. No existing RPC returns that shape. | `…0001_results_rpcs.sql` |
| **Use cases** | A registry table + translations, seeded with six rows, referenced by `template_packs`. | `…0005_template_pack_order.sql` |
| **Template packs** | Five rows + `template_pack_translations` for no/en. Data-not-code; no DDL. | `supabase/seed.sql` |
| **Help centre** | Twelve articles with steps/mocks/related, in a registry or `ui_messages`. `helpForum` needs a UGC table with moderation — scope-split. | `…0007_ops_i18n.sql` |
| **Integrasjoner** (deferred) | Connection state per system per org, the field list actually consented to, and — for `fravar`, `hr.kjønn`, `lonn` — data categories the product has never held. | — |
| **API + webhooks** (deferred) | API keys (hashed, per CLAUDE.md invariant 5), scopes, a delivery queue with retries and signing, and a subscription table. `threshold.breached` cannot be specified before 01-briefs §2(i) is settled. | `…0009_mail_outbox_api.sql` (queue precedent) |

### C.1 The k-gate surface count moves

Gate 5a3 enumerates every RLS-enabled `public` table and every `SECURITY DEFINER` function
in `public` from the catalog (`scripts/verify/policy-coverage.ts:1-26`). Today: **55 of 71
surfaces actively checked**, **18 files / 392 tests** in the census
(`tests/expected-counts.json`, summing to 392). Every new table and every new SECURITY
DEFINER function below adds a surface 5a3 will enumerate and demand a denial test for.
The instruction's rule that those two numbers may only move up is carried into 03-plan.

---

## D. What this document does not establish

- Whether the missing v1 round (§0.2) is meant to arrive. If it does, the A-series counts
  change; the B and C series do not, because they are measured against the code.
- Whether v1 already applied the box-sizing/`max-width` hardening (§A.10). Unknowable here.
- Anything about `HeiTuva Lovpalagt.dc.html` (§0.3.2) beyond the fact that two links
  point at it and it is not in the bundle.
