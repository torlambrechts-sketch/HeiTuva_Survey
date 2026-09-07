# 00 — Three-way diff (Round 0)

**Line-reference convention.** `V2:` = `design-reference-v2/…/HeiTuva.dc.html` (6727 lines).
`V1:` = `design-reference-v1/…/HeiTuva.dc.html` (4901) — the same file `docs/v1/*` calls
`NEW:`. `OLD:` = `design-reference/…/HeiTuva.dc.html` (4097). `M:00nn` = a migration.
Every clause asserting what an artefact does carries the line it does it on — the fifth
rule in `docs/v1/06-closeout.md § 1`, and this document is where it applies hardest.

Bundle installed at `design-reference-v2/`. `design-reference/` and `design-reference-v1/`
are untouched. **DECISIONS Q18 will need extending to three bundles** — see 02-conflicts §A1.

---

## 0. A correction that governs this whole document

An earlier pass of this file was written on the branch `claude/vedlagt-md-instruksjoner-qya32n`
**before it was rebased onto `origin/main`**, and `main` was not present in the clone at
session start. That pass concluded that the v1 round did not exist in this repository. It
does. `docs/v1/` (00-diff … 06-closeout, plus `reports/V1-2` … `V1-6`),
`design-reference-v1/` at exactly 4901 lines, `DECISIONS.md` through Q51,
`docs/DEVIATIONS.md` through D104, and 81 migrations are all on `main`, and
`git merge-base` put the old branch tip at `cd74022` — a pure ancestor of the v1 work.

The conclusion was wrong and so was everything downstream of it. In particular the earlier
pass claimed that v2 *unblocks* nine surfaces D87 refused to build, and ordered the plan
around doing them first. **Those surfaces were built in V1-1, V1-2 and V1-4.** The
corrected picture is below, and the plan's ordering (03-plan) is rebuilt on it.

Two things the earlier pass got right and that survive re-derivation: the missing fourth
page (§0.2), and the corrections to the instruction's splash claim (§A.7).

---

## 0.1 BLOCKING PREREQUISITE — the expansion catalogue

Three v2 surfaces are the same subject as work decided outside this repository. This is
**not** news to the repo: `docs/v1/05-status.md § 4` already records that R2, R3 and R4
were produced in conversation and never committed, and `docs/v1/06-closeout.md § 3` lists
the catalogue as open item 6, Tor's.

| v2 surface | Catalogue item | Evidence |
|---|---|---|
| Målgrupper — populations, sources, dynamic rules | **R3** contacts/accounts | `DEFAULT_AUD` V2:4312–4323 carries `kind/name/pop/count/source/updated/rule`; `popRows` V2:5037–5042 carries a **lawful basis and a retention period** per population |
| Integrasjoner' CRM row — "trigger NPS etter sak" | **R4** event ingestion | `intGroups` V2:5222 |
| The stream panel, if v2 revives it | **R4** — already reconciled | `docs/v1/05-status.md § 1` — V1-7 was descheduled precisely because the panel is a *reader* over R4's ingestion, so "a phase here cannot depend on a document not in this repository" |

**Do not schedule these until the catalogue lands.** The Målgrupper *group and segment*
layer is expressible against `public.groups` today and is planned that way (§B.9); only
the population layer is blocked.

## 0.2 A second blocker, smaller and concrete

`HeiTuva Splash.dc.html:1027` and `:1029` link twice to **`HeiTuva Lovpalagt.dc.html`**,
a fourth page the bundle does not contain:

```
$ ls design-reference-v2/heituva-survey-app-design/project/*.dc.html
HeiTuva Bruksomrader.dc.html   HeiTuva Splash.dc.html   HeiTuva.dc.html
```

The v1 bundle had two `.dc.html` files, v2 has three, and the splash references a fourth.
Any splash fidelity pass meets two dead links on the first read. Tor supplies the page or
strikes the links.

---

## 0.3 Which bundle governs which surface — **Q52, CONFIRMED (Tor): extend to three**

Q18's rule extends. `design-reference-v2/` governs every screen a **v2 phase touches**;
`design-reference-v1/` keeps the screens v1 phases built and v2 does not touch;
`design-reference/` keeps Phase 1–7 work as built. `verify:reference` gains a third render
directory, `artifacts/reference-v2/`, and overwrites neither of the others.

**Written once, here, so no phase rediscovers it.**

### The rule that makes the table decidable

Two clarifications, both forced by the evidence rather than chosen:

1. **Governance is per SURFACE, not per file.** The v1 round touched
   `app/(app)/profil/page.tsx` and `app/(app)/administrasjon/layout.tsx` — but the profil
   change is one line removing `max-width:[900px]` (V1-0's wide toggle) and the admin change
   is two lines in the tab rail. Neither redrew a screen body. **The shell is governed by the
   bundle that last drew the shell; a screen body is governed by the bundle it was built
   from.** Reading it per file would hand v1 every screen in the app on the strength of a
   frame change, which is the opposite of what Q18 protects.
2. **A property check does not move governance; building to a new drawing does.** V2-0's
   hardening pass (Q53 — check, not rebuild) touches controls on every screen. That is a
   check that a property holds, not adoption of a new drawing, so it moves nothing. If it
   were read as a touch, v2 would govern everything after V2-0 and Q52 would have decided
   nothing.

### The table

Provenance derived from `git diff --name-only cd74022..3b7cef5 -- 'app/**'` (the v1 round)
and the phase table in `docs/v1/06-closeout.md § 1`.

| Surface | Built from | Governs today | Moves to v2 in |
|---|---|---|---|
| **App shell** — header, nav, Innsikt rail, wide toggle | **v1** (V1-0) | v1 | **V2-0** — fifth nav item, avatar-only user button |
| `oversikt` | **v1** (V1-1, Q37 compliance card) | v1 | — |
| `undersokelser` (list) | original *(v1 frame only)* | **original** | — |
| `undersokelser-ny` (wizard) | **v1** (V1-5, use-case rail in step 0) | v1 | — |
| `bygg` — Builder + policy panel | **v1** (V1-1, Q17 §1/§2) | v1 | **V2-3** — the audience breach warning |
| `send` | **v1** (V1-3, recurrence controls) | v1 | **V2-3** — import consolidation, audience picker |
| `resultater` | **v1** (V1-2 attributed, V1-6 rounds) | v1 | — |
| `resultater/csv` | **v1** (V1-2, Q43) | v1 | — |
| `dashboard` + «Tilpass» | **v1** (V1-4) | v1 | — |
| `rapporter`, `rapport-editor` | **v1** (V1-0 rail, V1-2 Q30) | v1 | — |
| `bibliotek` | **v1** (V1-5) | v1 | — |
| `profil` (the member's own) | original *(v1 frame only — one line)* | **original** | — |
| `admin-firma`, `admin-grupper`, `admin-valg`, `admin-sprak` | original *(v1 touched `layout.tsx` only)* | **original** | — |
| `admin-brukere` | original | **original** | **V2-2** — member statuses |
| `admin-personvern` | original | **original** | **V2-1** — Q38's threshold picker |
| `respondent` (`/s/[token]`) | original body; **v1** for the language chips (Q31) and peer results (Q47) | mixed, as listed | **V2-10** — quiz tiles |
| `r/[token]` (shared report) | original | **original** | — |
| `logg-inn`, `kom-i-gang` | original | **original** | — |
| `splash` | original *(v1 byte-identical, 696 lines both)* | **original** | **V2-8** |
| `personvern`, `databehandleravtale` (marketing) | original | **original** | copy only in V2-0 (Q55); layout unmoved |
| **Oppgaver** | — | — | **v2 from birth** (V2-4) |
| **Målgrupper**, **Profil og avsender**, **Integrasjoner** | — | — | **v2 from birth** (V2-3, V2-1, V2-11) |
| **Help centre** | — | — | **v2 from birth** (V2-6) |
| **Bruksområder** | — | — | **v2 from birth** (V2-8) |
| **Live**, **Quiz** | — | — | **v2 from birth** (V2-9, V2-10) |

**Rows marked "—" in the last column are answered against the bundle in "Governs today" for
the life of this plan.** A later phase that adopts a v2 drawing for one of them moves it, and
moving it is an edit to this table — not a judgement made inside the phase.

**The accepted cost, recorded so it is not mistaken for a regression.** V2-0 re-renders and
**every current Gate 3a diff goes red in one commit**. That is the correct behaviour of a
gate whose baselines have moved, it is one scheduled commit, and it is the price of the rule
rather than a defect in it.

---

## A. BUNDLE DIFF — the three legs

### A.0 Counts, measured

```
lines            OLD 4097   →  V1 4901   →  V2 6727
diff OLD→V1      +981  −177        (4097 + 981 − 177 = 4901)
diff V1→V2      +2032  −206        (4901 + 2032 − 206 = 6727)
sc-if states     OLD 126    →  V1 166    →  V2 205
  OLD→V1         +40  −0
  V1→V2          +43  −4
<sc-for>         OLD 120    →  V1 148    →  V2 204
```

**Corrections to the instruction's own mining, which it asked me to verify:**

| Instruction | Measured | Verdict |
|---|---|---|
| 6727 lines from 4901 | 6727 from 4901 | **correct** |
| 2002 added, 176 removed | **2032 added, 206 removed** | off by 30 each way |
| 32 new sc-if states | **43** | under by 11 |
| 2 removed (`isPasteImport`, `isSyncImport`) | **4** — also `q.advScale`, `respondOne.hasChoices` | under by 2 |
| box-sizing 24 → 82 | 24 → 82 | **correct** (V1 24, V2 82) |
| inputs swap `min-width:140px` for `flex:1 1 130px;min-width:0` | `min-width:140px` 2 → 0; `flex:1 1 130px;min-width:0` 0 → 2 | **correct** |
| v2 keeps `flex:1 1 220px`, which V1-1's defect 4 fixed | V1:387 has it, V2:414 has it, OLD has none | **correct** — see §A.6 |

**The 43 states added V1→V2**, which is the real "what is new" list:

`adminIntegrasjoner adminMalgrupper adminProfil bankNote cameFromBuild contactSent
g.hasWarn g2.small hasAudMix hasBrandOverride hasThresholdWarn helpArticles helpContact
helpForum helpList helpOpen isHelp isLiveMode isLiveScreen isQuizMode isTasks liveRevealed
metaClosed metaOpen mgImportDone mgImportOpen mgNote modeNote noHelpHits notTestMode
p.quizLine pickerOpen quizAnonBlocked respondOne.plainChoices respondOne.quizTiles
sendBlocked senderLocked sg.small t2.hasLaw t2.isLate t2.needsEffect tabGeneral testMode`

**The 40 added OLD→V1**, listed because the earlier pass mistook them for v2 scope and
they are the Q17/dashboard set that V1-0…V1-5 built:

`attribNote b.hidden custData custLayout custPanels customizeOpen dashNeedsSetup dashReady
hasCtxRecur hasPolWarnings hasRecurStatus hasRounds i.req isCustomCadence p.il0…p.il6
p.mine pn.canPin pn.isDuties pn.isRegister pn.isStream polAnonNote polIsPerson polLocked
polLowWarn polOpen r.open recurInherited resAggregate resAttrib s.hasRecur s.isRecur
showUseCases t.hasPolicy wizIsCustom`

### A.0b What v2 unblocks — one staged decision, not nine surfaces

The earlier pass claimed v2 unblocks the nine surfaces D87 refused. It does not: those were
built in V1-1, V1-2 and V1-4 (§B.1). But two decisions **were** parked on exactly this
condition, and v2 settles one of them.

`docs/v1/04-decisions.md:61-62` — both staged, never promoted, and both reading **"Wait for
a bundle; D87's stop-and-ask stands"**:

| # | Subject | v2 |
|---|---|---|
| **Q38** | Personvern §8 controls (still undrawn) | **PARTLY DRAWN.** `orgThresholdChips` V2:5583 offers `[3,5,8,10]`; `orgSensitiveChips` V2:5587 offers `[5,8,10,12]` default 8; `orgThresholdNote` V2:5591; markup V2:2737–2747. Neither exists in v1 (`grep orgThresholdChips` on `design-reference-v1` returns nothing) |
| **Q39** | «Svar per virksomhet» **report section body** and the optional-mode per-choice texts | **STILL UNDRAWN.** V2:3611 is the Resultater attributed table (V1:2541 already had it) and V2:4030 / V2:5337 are the dashboard panel registry (V1:2960 / V1:3696). The report *section body* — D88's item — is drawn in neither bundle |

Two things about Q38's half, both of which are 02-conflicts material rather than a
green light:

1. The picker's low end is **3**, which is Q17's floor for natural persons, and its ceiling
   is **10**, which is Q36's CHECK (`M:0036`). The chips agree with the schema.
2. The note asserts a rule the schema does not have: *"Den som lager en undersøkelse kan
   heve terskelen, men ikke senke den under virksomhetens minimum."* That is stricter than
   `privacy.redaktor_may_lower` (`M:0034`), which exists precisely so an organisation **can**
   permit lowering. **The switch that flag was built for is not drawn**, and the copy reads
   as though the flag were always false. Q38 is therefore drawn *enough to decide*, not
   drawn *enough to build verbatim*.

Also new in v2 and not in Q38: a **topic-driven escalation** — "Kartlegging av trakassering,
varsling og helse settes automatisk til 8" (V2:5591). Q17 defines a default, a floor and a
lock; it defines no topic rule.

### A.1 Oppgaver is a fifth nav item — the instruction was right

| | `const screens` |
|---|---|
| OLD:2942 | `dash, surveys, dashboard, library, reports` (5) |
| V1:3513 | `dash, surveys, insight, library` (**4** — Dashboard and Rapporter merged into Innsikt) |
| V2:4790 | `dash, surveys, **tasks**, insight, library` (5) |

The Innsikt merge is **V1's** change and it is built: `components/InsightTabs.tsx`,
`components/AppHeader.tsx:27-30` (`dash, surveys, insight, library`). v2 adds exactly one
item, Oppgaver, and the instruction's claim A is correct as written. (An earlier pass
"corrected" this; the correction was a baseline artefact and is withdrawn.)

`insightTabs` is unchanged V1:3639 → V2:5280.

### A.2 Oppgaver — a statutory-obligation register with a database-shaped lifecycle

`DEFAULT_TASKS` **V2:4165–4175** (the instruction said :4160+). Nine rows carrying
`title, source, kind, law, owner, due, status, late`. Statutes present: `aml. § 3-1 (2) c`,
`aml. § 4-3 (3)`, `aml. § 2A-3`, `ldl. § 26 (2) nr. 1`, `aml. § 14-4 a`,
`åpenhetsloven § 4`, and — not in the instruction's list — **`åpenhetsloven § 7`**
(V2:4172, "Svar på innsynskrav").

Lifecycle hard-coded at **V2:5181**:
`["Foreslått","Besluttet","Pågår","Gjennomført","Effektvurdert","Lukket"]`, advanced one
step at a time by `onAdvance` V2:5191–5195. The constraint that makes it schema rather than
flow is **V2:5197**, rendered at V2:2175:

> "Et tiltak kan ikke lukkes før effekten er vurdert. Det er kravet i aml. § 3-1 og ldl. § 26 fjerde ledd."

with `needsEffect: t2.status === "Gjennomført"` (V2:5189) and its prompt at V2:2203.
Four filters V2:5164, four stat tiles V2:5168–5177 — one of which counts tasks *with a
legal basis*.

**The row that is the security problem** is V2:4168 —
`source:"Psykososial kartlegging · under terskel"`, `law:"aml. § 4-3 (3)"`, named owner —
with V2:4239 ("Funn under terskel blir oppgaver med ansvarlig og frist, med hjemmel
synlig") and V2:4270 ("Funn under terskel blir oppgave automatisk, med kilde og hjemmel").
Analysed in 01-briefs §2(i).

`taskChannels` V2:5198 and the late-row copy V2:2206 both promise Teams notification — an
integration this build does not have.

### A.3 Live mode

Screen block V2:1829–1945. `liveStage` V2:6176–6182 (`title/counter/code/revealLabel/step`),
`liveGuard` V2:6147, `DEFAULT_LIVE` V2:4338, ten toggles labelled V2:6136–6145
(`fullscreen, qr, counter, manualReveal, liveChart, cloud, countdown, questions, temp,
closing`; `countdown` and `questions` default off, the rest on).

Projected surfaces: word cloud V2:6179 gated by `cloudModeration` V2:6180 ("3 frisvar
venter på moderering før de vises"); priority exercise V2:6181; **audience questions with
vote counts** V2:6183, rendered V2:1906–1912; temperature V2:6184; closing screen V2:6185;
and under `isQuizMode` the team leaderboard V2:6186, rendered V2:1934.

`liveGuard` V2:6147 states the static rule and the design honours it — do not report it as
unaddressed. The timing question and the UGC surface are 01-briefs §2(ii) and §2(v), and
both must now be argued against **Q28**, which is confirmed and says the threshold hides
*svarutledete tall, not counts of people*.

### A.4 Quiz mode

`quizAnon` computed **V2:4831**; `quizAnonBlocked` V2:6164; `DEFAULT_QUIZ` V2:4339;
toggles V2:6149–6153; `quizGuard` V2:6163. The design already resolves the anonymity
collision — every toggle returns early and renders at `opacity .45` / `cursor:not-allowed`
(V2:6156–6158), and both numeric fields do the same (V2:6160, V2:6162). The leaderboard is
**team**-level (`quizBoard` V2:6186, `DEFAULT_QUIZ.team = true`).

The assessment fields are the real question: `quizPass` V2:6159 (default 70), `quizTries`
V2:6161 (default 2), `certificate` V2:6152 ("Sertifikat ved bestått — Sendes på e-post"),
and per-question `answerIndex` / `pointsAward` V2:6507. `modeNote` V2:6122 refuses quiz on
statutory packs, in the UI only.

`QUIZ_TILES` **V2:4084–4089** — `#F26B21 #2F6FB0 #2F7D4F #B0343C`, `fg:"#FFFDF6"`, used at
V2:4768, reaching the respondent surface through `respondOne.quizTiles`.

### A.5 Målgrupper, suppression, member state, Profil, Integrasjoner, API, help

Unchanged in substance from the first pass — these are all genuinely new in v2 (none of
their states appears in the OLD→V1 list). Condensed:

- **Målgrupper** (`adminMalgrupper`, screen V2:2405+). Populasjoner `popRows` V2:5037–5042
  with a lawful basis and a retention period each, and `popNote` V2:5043's separation rule.
  Grupper `mgGroups` V2:5045 and Segmenter `mgSegments` V2:5049 from `DEFAULT_AUD`
  V2:4313–4322, segment rules rendered monospace (V2:4320–4322). `auditRows` V2:5031–5036
  includes "312 treff · **frosset for Ukespuls 36**" — segments freeze per round, a schema
  requirement.
- **`adminTabs`** V1:3606 (5 tabs) → V2:4889 (8): `firma, **profil**, brukere,
  **malgrupper**, grupper, **integrasjoner**, personvern, valg`. The app carries a sixth,
  `sprak`, by D79 (`app/(app)/administrasjon/layout.tsx:65`), so v2's rail lands at nine.
- **Suppression** `SUPPRESSED` V2:4325, consumed at V2:4971 / V2:4982 / V2:4993, reasons at
  V2:5014. **Member state** `MEMBERS` V2:4327–4335 — Aktiv / Bounce / **Reservert** ("har
  sagt nei til undersøkelser", V2:4332) / Ny.
- **Profil og avsender** V2:2310–2404, whose lock derives from the survey policy:
  `brandLocked = !!(sv.policy && (sv.policy.locked || sv.policy.legal))` **V2:4830**,
  driving `senderOptions` V2:4933, the refusal V2:4934, `senderLocked` V2:4935 and
  `accentOverride` V2:4939. It is a Q17 policy surface, not a profile setting.
- **Integrasjoner** `intGroups` V2:5200–5227 — fifteen systems in five groups, table in
  01-briefs §2(iv). `dataFlowNote` V2:5250.
- **API + webhooks** `apiKey` V2:5240, `webhookEvents` **V2:5243–5249** including
  **`threshold.breached`** V2:5248.
- **Help centre** `isHelp` V2:1946+, `HELP_ARTICLES` V2:4177+ (**12 articles**),
  `helpForum` V2:5086 with anonymous posting promised at V2:2091, `contactSent` V2:5159,
  `statusRows` V2:5161.
- **Send guards** `audBlocked = audPops.length > 1` **V2:4829** → `sendBlocked` V2:6618,
  button relabelled V2:6619, greyed V2:6620, `not-allowed` V2:6621, handler returns early
  V2:6624; `audMixWarn` **V2:6551**.
- **Test mode** `testMode` V2:6631, entered V2:6637, and short-circuited in `submit()` at
  **V2:4577**.
- **Import consolidated.** `isPasteImport`/`isSyncImport` (V1:4019–4020) are gone. Send now
  carries a one-off list — "Engangsliste for denne utsendingen" V2:3020 — with
  `onSaveAsAudience` V2:3037 and a hand-off at V2:3040 to Målgrupper.

### A.6 The hardening pass, and where v2 converged on a shipped fix

```
                              OLD   V1   V2
box-sizing:border-box          20   24   82
max-width:100%                  0    0   42
min-width:140px                 2    2    0
flex:1 1 130px;min-width:0      0    0    2
flex:1 1 220px                  0    1    1
```

The instruction's numbers were right and the earlier pass's were not — the earlier pass
measured against OLD.

**The convergence fact the instruction asked me to confirm: yes.** `flex:1 1 220px` enters
at **V1:387** and v2 keeps it at **V2:414**, and the app already ships it —
`app/(app)/undersokelser/[id]/bygg/QuestionCard.tsx:107` renders
`flex-[1_1_220px]` with a comment at `:100` citing `HeiTuva.dc.html:387`. v2 has not moved
it. No other convergence on a shipped fix was found: `max-width:100%` (42 occurrences) and
the `flex:1 1 130px` pair are new in v2 and have no counterpart in the app.

**The header change is v1→v2 and is not in any state diff.** V1:195 is still the pill with
the visible `{{ userName }}`; V2:195 is a 38×38 avatar-only button with
`aria-label="Brukermeny for {{ userName }}"` and `title="{{ userName }}"`, and the role
line moves into the dropdown at V2:200.

### A.7 Splash and Bruksområder

**The splash is byte-identical OLD → V1 (696 lines both) and grows to 1051 in v2.** So all
of its growth is v2's.

Corrections to the instruction's claim N, which hold against the v1 baseline too:
- **`authNote` is not new.** It appears three times in the 696-line splash and three times
  in the 1051-line one.
- The state diff shows **two** new states, not one: `r.isLegal` V2:217 and `r.hasPage`
  V2:226 — a ranked list whose "details" links point at the **missing fourth page** (§0.2).

**Bruksområder is a new file** (v1 shipped two `.dc.html`, v2 ships three). `ORDER` at
`HeiTuva Bruksomrader.dc.html:290` names nine survey types: `puls, medarbeider,
psykososial, trakassering, likestilling, aktsomhet, onboarding, kunde, exit`; headline
`:51` "Ni undersøkelser norske virksomheter kjører oftest".

**Correction to the instruction's claim Q, and it dissolves the concern.** The nine are
survey *types* and map onto template packs; `USE_CASES` (V2:4034–4041, six) is a different
axis — the *category* registry that drives `packCats` V2:6229 and `useCaseCards` V2:6233.
And **`PACKS` is identical in v1 and v2 at 23 entries** — the five the earlier pass called
new to v2 (`Servicedesk etter sak`, `IT og verktøy`, `Innbyggerundersøkelse`,
`Brukerundersøkelse tjeneste`, `Frivillige etter arrangement`) arrived in **v1** and were
built in V1-5 under Q45. All nine of Bruksområder's types exist as seeded packs today
(CI asserts `packs = 22`, `.github/workflows/ci.yml:78`). The page markets what exists.

---

## B. APPLICATION DIFF — against `main`'s tree

**BUILT** = exists and matches v2's shape, so a *fidelity check* per CLAUDE.md, not a
rebuild · **PARTIAL** · **NOT BUILT**.

Current state: **81 migrations**, 44 `public` tables, census **577 tests / 35 files**,
Gate 5a3 **56 of 74**.

### B.1 Built in v1 — the earlier pass called these new; they are not

| # | v2 surface | Class | Where it lives |
|---|---|---|---|
| B.1 | Innsikt nav group, wide toggle | **BUILT** (V1-0) | `components/InsightTabs.tsx`, `components/AppHeader.tsx:27-30`, `components/WideToggle.tsx`; D89 |
| B.2 | Builder policy panel «Hvem svarer og hva vises» (Q17 §1/§2) | **BUILT** (V1-1) | `app/(app)/undersokelser/[id]/bygg/PolicyPanel.tsx`, `Builder.tsx`, `lib/questions/policy-warnings.ts`; `M:0036` (Q36 ceiling) |
| B.3 | Oversikt compliance card | **BUILT** (V1-1, Q37) | `app/(app)/oversikt/ComplianceCard.tsx`; D92, D93 |
| B.4 | Attributed results table | **BUILT** (V1-2) | `public.attributed_results`, `app.attributed_rows`; `tests/invariants/attributed-results.test.ts` |
| B.5 | «Svar per virksomhet» + share-scope refusal + CSV export | **BUILT** (V1-2, Q30/Q43) | `M:0038`; D96, D97. **D88 remains true only for the report SECTION body** (`docs/v1/05-status.md § 3`) |
| B.6 | Recurrence — cadence, pause/stop, schedules RLS | **BUILT** (V1-3) | `M:0043`–`M:0045`, `app/(app)/undersokelser/[id]/send/CustomCadence.tsx` |
| B.7 | Dashboard customisation — layouts, panel registry, presets, «Tilpass» | **BUILT** (V1-4) | `M:0046`–`M:0048`; `app/(app)/dashboard/CustomizeCard.tsx`, `PresetChooser.tsx`, `PanelControls.tsx`, `FreezeButton.tsx` |
| B.8 | Use-case registry, «Bruksområder» tab, chips, five packs | **BUILT** (V1-5) | `M:0049`; `app/(app)/bibliotek/UseCaseCard.tsx`, `chips.ts`. CI asserts `uses = 6`, `packs = 22` |
| B.9 | Stream panel | **DEFERRED, absence DRAWN** (Q26) | `feature_flags.event_stream_panel` seeded `false` at `M:0047:72`; `tests/unit/dashboard-panels.test.ts` asserts it stays unnamable. **V1-7 descheduled — tied to R4** |

Consequence: the earlier pass's phases "V2-1 Q17 completion part 1", "V2-2 part 2", "V2-3
use cases and packs" and "V2-8 Del B" were all proposing to build what exists. They are
withdrawn; what remains of them is a **fidelity check of v2 against the built screens**,
which is one phase, not four.

### B.2 Genuinely not built

| # | v2 surface | Class | Nearest existing thing |
|---|---|---|---|
| B.10 | **Oppgaver** | NOT BUILT | `loop_actions` (`M:0006:116`) is `{text, owner_member_id, due_at, done boolean}`, surfaced by `app/(app)/oversikt/LoopActionForm.tsx`. No `kind`, no `law`, no `source`, no six-step lifecycle, no effect assessment. Oppgaver **supersedes** it |
| B.11 | Tasks from below-threshold findings | NOT BUILT | And must not be built before 01-briefs §2(i) is answered |
| B.12 | **Live mode** | NOT BUILT | `share_links.kind in ('link','qr')` (`M:0004:38`) gives the QR join path only |
| B.13 | **Quiz** | NOT BUILT | No `answer_index`/`points` on `survey_questions`, no attempts, no pass mark, no certificate |
| B.14 | **Målgrupper** — groups and segments | PARTIAL | `public.groups` (`M:0002:29`) is `{id, org_id, name, lead_member_id}`, `unique(org_id,name)`; members join by `org_members.group_id`. Missing `kind`, `population_id`, `source`, `synced_at`, the rule, the per-round freeze, the audit log |
| B.15 | **Målgrupper** — populasjoner | NOT BUILT · **CATALOGUE-BLOCKED** | Nothing models a population, a lawful basis or a per-population retention. `app.apply_retention` is global |
| B.16 | Suppression list | NOT BUILT | `survey_invitations.bounced_at` (`M:0004:27`) covers bounce only |
| B.17 | Member statuses Aktiv/Bounce/Reservert/Ny | PARTIAL | `org_members.status` is `check (status in ('invited','active','inactive'))` (`M:0002:43`) |
| B.18 | Admin → **Profil og avsender** | NOT BUILT | The tab does not exist. The lock it needs **does**: `app.guard_survey_policy`, `app.apply_pack_policy`, `M:0032`/`M:0034` |
| B.19 | Admin → **Integrasjoner** | NOT BUILT · **DEFERRED** | Entra SSO is real (`M:0029`, D82); `feature_flags` exists for stubs (Q9); `docs/INTEGRATION_ARCHITECTURE.md` and `docs/SLACK_INTEGRATION.md` are on main and are the groundwork |
| B.20 | Public API + webhooks | NOT BUILT · **DEFERRED** | `pgmq` + `mail_outbox_*` (`M:0009`) is the queue precedent |
| B.21 | Mixed-population send guard | NOT BUILT | `send_round` (`M:0008`, re-declared `M:0027`, interval in `M:0045`) has no population concept |
| B.22 | Test mode | NOT BUILT | `submit_response` is the only write path; no dry-run |
| B.23 | **Help centre** | NOT BUILT | No route. Twelve articles are content. `helpForum` is UGC — scope-split |
| B.24 | **Bruksområder** page | NOT BUILT | New public route. Its nine types all exist as packs (§A.7) |
| B.25 | `hasThresholdWarn` per-audience warning | NOT BUILT — **see B.26** | |
| B.26 | Splash growth (696 → 1051) | PARTIAL | `app/(marketing)/page.tsx` (Phase 6b). Blocked on §0.2 |
| B.27 | `box-sizing`/`max-width:100%` hardening over existing screens | PARTIAL | A fidelity check. The app solved the class via `docs/RESPONSIVE.md`; D90 records one deliberate divergence |
| B.28 | Import consolidation | PARTIAL | `import_jobs` (`M:0004`), CSV/Excel/paste shipped (Q9), `tests/unit/import.test.ts`. v2 moves sync out of Send into Målgrupper |
| B.29 | Header avatar-only button + role line | PARTIAL | `components/AppHeader.tsx`, `components/UserMenu.tsx` |

### B.26 `hasThresholdWarn` and D94 — the instruction's question, answered

The instruction asks whether `hasThresholdWarn`'s `audGroups` is "the data source D94 has
been waiting for". **No — D94 is closed, and this would be a fourth caller of a rule that
already has three.**

- **D94 closed in V1-2** (`docs/DEVIATIONS.md:1783`, "Status: CLOSED in V1-2", migration
  `M:0039`). `surveys.target` got a writer — a trigger on `survey_invitations`, not the
  Send action, because recipients reach a round by several paths — and the count is
  decided as *the latest round's*, proven both ways in `tests/db/policy-panel.test.ts`.
- The rule already has **one implementation and three callers**:
  `lib/questions/policy-warnings.ts`, called from `Builder.tsx`, `PolicyPanel.tsx`, and
  `SendScreen.tsx:160` (which feeds it `target: reach`, computed at `:146` from the
  recipients being chosen right now).
- v2's `hasThresholdWarn` **V2:4988** is a *different* comparison — per audience group at
  pick time, `g.count > 0 && g.count < 5` — and it hard-codes 5 where `app.k_for` belongs
  (§A.8). Built as drawn it becomes a **fourth home** for the threshold-versus-count rule.

`docs/v1/06-closeout.md § 1` names this exact shape as the defect signature of this
codebase — "one rule written in two places", removed four times in the v1 bundle. So the
finding is not "wire up `audGroups`"; it is **`hasThresholdWarn` must be a fourth caller of
`policyWarnings`, not a fourth copy of it**, and it must take its k from `app.k_for`.

### B.27 The threshold constant regressed in three places in the bundle

Q17 made k per-survey (`app.k_for`, `M:0032:69` — returns **0** for organisation surveys,
else `greatest(k_threshold, 3)`), and Q36 put a 3–10 CHECK on it (`M:0036`). Three v2
surfaces hard-code 5:

- `hasThresholdWarn` **V2:4988** — `g.count > 0 && g.count < 5`
- `mgGroups.small` **V2:5048** — `g.count < 5`
- `mgSegments.small` **V2:5052** — same

(and the warning's group list at V2:4986 uses the same constant). See 02-conflicts §A3.

---

## C. SCHEMA DIFF

Inventory only. Every new SECURITY DEFINER function in `public` is a surface Gate 5a3
enumerates from the catalogue (`scripts/verify/policy-coverage.ts`), and every one that
reads `responses`/`answers` is caught by the two-sided catalogue assertion at
**`tests/invariants/threshold-policy.test.ts:366-386`**, which fails by construction until
the new function calls `app.k_for` — unless it earns a `DO_NOT_GATE` entry, of which there
are exactly two today (`overview_activity`, `survey_response_counts`).

| Surface | Missing from the schema |
|---|---|
| **Oppgaver** | A task entity with `kind`, `law_ref`, `source_kind`/`source_ref`, a six-step status enum, `late`; an effect-assessment table; and a trigger refusing `Lukket` without one. `law_ref` should reference `duty_definitions` (4 rows) where a statutory duty applies |
| **Tasks from findings** | A way to reference a finding without disclosing it; the audit trail for automatic creation |
| **Målgrupper groups/segments** | `groups` lacks `kind`, `population_id`, `source`, `synced_at`, a **structured** rule predicate, and per-round materialised membership |
| **Populations** | Everything, plus the FK from group → population and population-driven retention. **Catalogue-blocked** |
| **Send guard** | No population on `survey_rounds`/`survey_invitations` |
| **Suppression** | An org-scoped opt-out keyed by email, honoured by `send_round` and import, surviving re-import |
| **Member state** | Bounce must promote from invitation to member; `Reservert` derives from suppression |
| **Live** | A session entity, the ten toggles as policy, a moderation queue, an audience-questions table with votes — the product's first UGC |
| **Quiz** | `answer_index`/`points`; attempts; pass mark; certificate issuance; **own tables** (01-briefs §1) |
| **Test mode** | A dry-run through `submit_response` that validates without inserting and without consuming a token |
| **Profil og avsender** | Sender domains with DNS state, sender profiles, logo slots, accent/type overrides. Reuse the existing lock |
| **Help centre** | Twelve articles as a registry; the forum is UGC and scope-split |
| **Integrasjoner / API** (deferred) | Connection state, consented field lists, hashed API keys, scopes, a signed delivery queue |

Nothing here needs `use_cases`, `dashboard_layouts`, `dashboard_presets` or the panel
registry — those exist (`M:0046`–`M:0049`).

---

## D. What this document does not establish

- Anything about `HeiTuva Lovpalagt.dc.html` beyond §0.2.
- Whether v2's hardening pass (§A.6) conflicts with `docs/RESPONSIVE.md`'s solutions on any
  specific screen — that is the fidelity phase's job, screen by screen.
- Whether the standing limitation in `docs/v1/06-closeout.md § 3` (**every gate reads
  local; nothing has ever read prod**) bites on any v2 surface. It is not this bundle's
  finding and it has no owner; it is carried into 03-plan as a limit, not solved there.
