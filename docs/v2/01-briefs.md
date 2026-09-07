# 01 — Expert briefs (Round 1)

Seven briefs, independent, unharmonised. Where two contradict each other, that is input to
02-conflicts, not something resolved here. `V2:` = the v2 bundle, `V1:` = `design-reference-v1/`,
`M:00nn` = a migration. Written against `origin/main` — 81 migrations, census **577 tests
across 35 files**, Gate 5a3 **56 of 74**, `DECISIONS.md` through Q51, `DEVIATIONS.md`
through D104.

Each brief: what they see · three highest-risk items · what they think is a mistake · one
thing another expert will get wrong.

---

## Brief 1 — Database architect

### What I see

Six new subjects. The v1 round already absorbed the ones that looked hardest in the
bundle's *drawing* — the policy panel, attributed results, dashboard layouts, the use-case
registry — so what is left is genuinely new, and most of it is new in a way the schema has
no precedent for.

**Ordinary** (a table, RLS in the same migration, a denial test, done):

| Subject | Shape |
|---|---|
| Suppression | `suppressions(org_id, email, reason, source, created_by, created_at)`, unique on `(org_id, lower(email))`. Read by `send_round` and by import |
| Help articles | Twelve rows (V2:4177+) with steps/mock/related as `jsonb`, `org_id null`, public-by-design like `report_section_types`. The **forum is not this** |
| Profil og avsender | Sender domains with DNS verification state, sender profiles, logo slots, accent/type overrides |

**Not ordinary:**

**1. Oppgaver.** `loop_actions` (`M:0006:116`) is `{text, owner_member_id, due_at, done
boolean}`. v2's task carries `kind`, `law`, `source`, six statuses (V2:5181) and a refusal
to close without an effect assessment (V2:5197). The lifecycle is a **state machine with a
guarded terminal transition**, which belongs in a trigger:

- `tasks(id, org_id, title, kind, law_ref, source_kind, source_ref, owner_member_id, due_at, status, created_at)`
- `task_effect_assessments(task_id, round_id, assessed_by, assessed_at, note)`
- a `before update` trigger raising when `new.status = 'lukket'` with no assessment row.

Two things to get right. First, **CLAUDE.md's immutability rule**: a trigger written as
"reject any UPDATE" collides with PostgreSQL's own FK maintenance, and this repo has
rediscovered that four times (D50, D51, D57, duty-archive). Compare the columns that carry
meaning; let an `ON DELETE SET NULL` on `owner_member_id` through; decide the cascade when
the trigger is written. Second, `law_ref` should reference `duty_definitions` — four seeded
rows, CI asserts `duties = 4` (`.github/workflows/ci.yml:78`) — where a statutory duty
applies, and be free text only where none does. Q35's precedent is the argument: the
bundle classified questions by regex and Tor's answer was **"data on the pack. Never a
regex on question text."** A `law` string parsed at read time is the same mistake.

**2. Målgrupper — groups and segments.** `groups` (`M:0002:29`) gains `kind`,
`population_id`, `source`, `synced_at`, and for segments a rule. Two hard parts:

- **The rule is an evaluable predicate** (V2:4320, `"stillingsprosent < 100 og ansatt før
  2024"`). Stored as text and evaluated in SQL it is an injection surface. It must be a
  **structured predicate** — jsonb clauses over an allowlisted field set — and the fields it
  wants (`stillingsprosent`, `startdato`, `land`) are HR fields this product does not hold,
  so most segments are integration-blocked in practice even though the mechanism is not.
- **Segments freeze per round** (V2:5033, "312 treff · frosset for Ukespuls 36"). A
  self-updating segment re-evaluated after send changes a round's denominator
  retroactively. `survey_rounds` needs materialised membership. Note the precedent already
  in the schema: `M:0039` made `surveys.target` the **latest round's** recipient count, and
  D94 records Tor's reasoning for why a survey-level number was the wrong shape. Same
  question, same answer: the number belongs to the round.

**3. Populations.** Catalogue-blocked (00-diff §0.1). What I can say: a population carries
a lawful basis and a retention period (V2:5037–5042), and `app.apply_retention` exists and
is global, so retention wants to become population-driven **with** populations, not after.

**4. Live.** `live_sessions(survey_id, round_id, current_question_id, revealed, settings
jsonb, started_at, ended_at)`, a moderation queue for projected free text, and
`live_audience_questions(session_id, text, votes, moderated_at, moderated_by)` — the
product's first UGC.

**5. Quiz.** `survey_questions` gains `answer_index` and `points`; attempts, pass mark,
certificate. **In its own tables** — see below.

### Every new SECURITY DEFINER function is a 5a3 surface, and the catalogue assertion is real

5a3 derives its list from the catalogue (`scripts/verify/policy-coverage.ts`), currently
**45 RLS tables + 29 SECURITY DEFINER functions = 74, 18 allowlisted, 56 checked**. More
sharply: **`tests/invariants/threshold-policy.test.ts:366-386`** enumerates every
`public` SECURITY DEFINER function reachable by `authenticated` or `anon` whose body reads
`responses`/`answers`, and fails unless it calls `app.k_for`. It fails **by construction**
for any new vault reader. There are exactly two `DO_NOT_GATE` entries today —
`overview_activity` and `survey_response_counts` — and both are there under **Q28**, which
confirmed that the threshold hides *svarutledete tall, not counts of people*.

New definer functions I can foresee: `task_list`, `task_advance`, `audience_list`,
`audience_freeze_for_round`, `live_session_state`, `live_reveal`,
`live_audience_questions`, `quiz_leaderboard`. Of those, `live_session_state` and
`quiz_leaderboard` read the vault and must call `app.k_for` — which returns **0** for
organisation surveys (`M:0032:69`), a case every new caller must handle explicitly rather
than by `count >= k`.

### Three highest-risk items

1. **The task close guard** — the feature's legal point (V2:5197) and the exact trigger
   shape this repo has got wrong four times.
2. **Segment freezing** — no error, no visible symptom, wrong denominators. And the demo
   seed will not produce it, because the seed reaches only states the current code creates
   (`docs/v1/05-status.md § 3`).
3. **`quiz_attempts` next to `responses`** — one table holding anonymous responses and
   identified assessment results is one migration from a join that must be impossible.

### What I think is a mistake

Putting quiz results in the response tables. The anonymity CHECK exists so linkage is
*structurally* impossible, not merely unused. A quiz result is attributable by design —
person, score, pass/fail, certificate (V2:6152). Storing it beside responses means
relaxing the CHECK or adding a discriminator, and either way the invariant stops being "no
anonymous row can reference a person" and becomes "no anonymous row *of this kind* can".
That is a weaker sentence, and `dsr_requests` answers "what do you hold about me" from the
stronger one.

### One thing another expert will get wrong

The frontend architect will read `hasThresholdWarn` (V2:4988) as a display detail and write
`g.count < 5` in TypeScript. Two things are wrong with that. It hard-codes a constant Q17
removed — it must take `app.k_for(survey)`. And the rule already exists:
`lib/questions/policy-warnings.ts`, with **three** callers (`Builder.tsx`,
`PolicyPanel.tsx`, `SendScreen.tsx:160`). D94 closed in V1-2. A fourth *copy* is precisely
the defect signature `docs/v1/06-closeout.md § 1` names — "one rule written in two places",
removed four times in the v1 bundle. It must be a fourth **caller**.

---

## Brief 2 — Security reviewer

The centre of gravity. Four collisions, in severity order.

### (i) Tasks from below-threshold findings — and `threshold.breached`

**What the bundle says.** V2:4239 "Funn under terskel blir oppgaver med ansvarlig og frist,
**med hjemmel synlig**"; V2:4270 "Funn under terskel blir oppgave **automatisk**, med kilde
og hjemmel"; V2:4168 the shipped task — `source:"Psykososial kartlegging · under terskel"`,
`kind:"Risikovurdering"`, `law:"aml. § 4-3 (3)"`, `owner:"Tuva Berg"`; V2:5248 the webhook
`threshold.breached` — "Funn under terskel — kan utløse undersøkelsesplikt".

**Why this is worse than quiz or live.** It does not look like a security feature. It looks
like compliance and is drawn as compliance, which is why it will pass review. Give that
task to anyone who knows which team answered the psykososial survey and you have disclosed
that a specific sub-threshold group scored badly on ytringsklima. The task then goes to a
named owner, sits in a list any `redaktør` reads, is filterable by `lov` (V2:5164) so the
statutory findings can be enumerated, is announced in Teams (V2:5198), and via
`threshold.breached` leaves for a system where none of this product's RLS applies.

**The legal argument for the feature is real and I am not disputing it.** aml. § 4-3 (3)
does not suspend the undersøkelsesplikt because fewer than five people answered — a duty
that only bit at n≥5 would be evadable by keeping teams small. **The question is what a
task may CONTAIN.**

**This is not the same question Q28 answered, and the difference matters.** Q28 confirmed
that counts of people stay visible while svarutledete tall are gated. A task saying "12 of
40 answered" would be Q28-compliant. A task whose *existence* is conditioned on a gated
value discloses the gated value — it is not a count, it is a predicate over an average.
Q28 does not license it.

**Establish, and it is a stop-and-ask:** can a task be created from a suppressed finding
without naming the group, the survey, or the score? My reading of the design as drawn:
**no**. Three shapes, decreasing safety:

1. **The duty, not the finding.** The task states an undersøkelsesplikt is triggered *for
   the survey* — no group, no question, no score — and the responsible person investigates
   offline. The duty is discharged; nothing is disclosed. **This is what I would build.**
2. **The finding, administrator-only, never exported.** Defensible, but it splits the task
   list by role, which the design does not draw.
3. **As drawn.** I do not think this can ship.

**`threshold.breached`** carries the disclosure across the RLS boundary by construction.
Whichever shape is chosen, this event cannot be specified until that choice is made — so
the deferred API phase **depends on an earlier phase's decision**.

### (ii) Live mode — the timing leak, against Q28

**Already handled, do not re-report:** `liveGuard` V2:6147 states the static rule and the
design honours it.

**What remains.** In a room of six the audience watches `liveStage.counter` (V2:6177) tick
3 → 4 → **5** and the bars appear (V2:1863). Everyone present knows who is in the room and
who just put their phone down. The static gate is satisfied at every instant.

**And here I have to argue against a confirmed decision, which is the honest position
rather than a comfortable one.** Q28 says the threshold hides svarutledete tall, **not
counts of people** — "how many were invited, how many took part and what share that is stay
visible". `liveStage.counter` is a count of people who took part. Read literally, Q28
licenses it.

I think Q28 is right and still does not cover this, for a reason that is about the
*surface*, not the number. Q28's enumerated homes are the survey row, Oversikt, Resultater's
stat cards and the report's participation section — all of them **asynchronous, private
reads by an authenticated member**. The live counter is the same number **rendered
continuously to a co-located audience**. What leaks is not the count; it is the
**increment**, correlated with a room. Nobody watching Oversikt can see who submitted;
everybody in the room can. That is a property of the projection, and Q28 was not asked
about projection because no projected surface existed when it was confirmed.

So this is a **Q28 extension, not a Q28 violation** — and it must be put that way, because
writing it as "the bundle breaks Q28" would be wrong and would get the extension refused.

Mitigations, none free: do not show the counter below the threshold (`counter` is a toggle,
V2:6138, defaulting **on**); refuse the reveal until n ≥ k (`manualReveal` V2:6139 defaults
on); batch or jitter the counter.

**The word cloud.** `DEFAULT_LIVE.cloud` defaults **on** (V2:4338) and projects respondent
free text. A moderation queue exists — `cloudModeration` V2:6180 — so this is not
unaddressed either. Establish: does the queue gate every text or only flagged ones (the
copy reads as all); does the moderator thereby read individual free text, and if that
moderator is a `redaktør`, is that a new read path; and **does `get_quotes`' rule apply to
the projected surface at all?** Today `get_quotes` refuses a `leser` with a group filter
(`M:0009:176-177`). As drawn the projector reads a different path — that is the finding. It
must obey the same rule or the product has two answers to "who may read free text". And a
word cloud is not aggregation: a rare word from one respondent is a quote with the grammar
removed, so it needs its own minimum-occurrence floor, which is **not** k.

### (iii) Quiz — assessment semantics, not anonymity

**Resolved in the design; do not re-litigate.** `quizGuard` V2:6163, enforced at
V2:6156–6162 by early returns on every toggle and both numeric fields. The leaderboard is
**team**-level (V2:6186).

**The real question.** `certificate` (V2:6152), `quizPass` (V2:6159, default 70),
`quizTries` (V2:6161, default 2) give this **assessment** semantics. An employee who fails
a mandatory quiz twice has produced an HR record. Three consequences:

1. **Retention.** One retention path exists (`app.apply_retention`) and it is survey-shaped.
   A failed competence assessment is employment documentation with a different — often
   statutory — retention and a different art. 17 answer.
2. **Who may see an individual result.** The three roles were designed for aggregate
   reading. None of them answers "may Marit's manager see that she failed".
3. **Which table.** See Brief 1; I agree for a different reason — `dsr_requests` answers
   "what do you hold about me", and for surveys the answer is structurally "nothing
   attributable". Quiz breaks that sentence unless it lives elsewhere.

`modeNote` V2:6122 refuses quiz on statutory packs — good, and enforced in the UI only. It
belongs in `app.guard_survey_policy` with the rest of the policy guard.

### (v) User-generated content — a surface this product has never had

- **`audienceQuestions`** V2:6183, rendered V2:1906–1912 — participants submit questions
  that appear **on the projected screen** with vote counts. Toggle V2:6143, defaults
  **off** (V2:4338), which is the only mercy in the design.
- **`helpForum`** V2:5086, whose own copy at V2:2091 promises "Skriv med fullt navn eller
  **anonymt**".

Both are UGC with moderation, storage and harassment consequences, and the live one is
projected to colleagues in a room. A question can name a person. A question can *be*
harassment. A question can be a whistleblowing disclosure under aml. kap. 2A read aloud to
the department — the opposite of what kap. 2A requires. What UGC needs and this product has
none of: a pre-publication moderation gate, a retention rule, an author record (colliding
with the anonymity the same surface promises), an abuse path, a takedown obligation.

### (iv) Integrasjoner — input to the deferred phase's risk register

| System | Brings | Why it is its own problem |
|---|---|---|
| `fravar` V2:5209 | fraværsprosent per enhet, "korrelér risiko mot fravær per enhet" | **Health data, GDPR art. 9**, joined to psychosocial results per unit — and a unit can be small enough to identify a person. Art. 9(2)(b) is arguable for HSE duties but is a different basis from the rest of the product |
| `hr` V2:5206 | stillingsgruppe, ansiennitet, stillingsprosent, **kjønn** | Gender enables ARP under ldl. § 26; it is also what makes a two-axis breakdown re-identifying in a small unit |
| `lonn` V2:5207 | lønn per stillingsgruppe (aggregert) | Aggregation is the right design (V2:5250 promises it) — but it must be enforced at the boundary, not promised in copy |
| `bankid` V2:5215 | navn, signaturtidspunkt | Reopens **Q4**. `survey_invitations.identity_provider` is reserved; duty signing is audit-grade, not qualified. What changes is the legal *claim* |
| `bi` V2:5225 | "aggregerte resultater" | **Establish whether it could honour `app.k_for` at all.** A BI tool's value is slicing; a gate that holds for the slices we ship does not hold for slices the customer invents. My reading: only an already-collapsed export is safe |
| `crm` V2:5222 | kunde-e-post, sakstype | **R4** — not in this repository |

### Three more, smaller, all real

- **`testMode` must not write.** It short-circuits in the client at V2:4577. Server-side it
  must not reach the insert, must not consume a token, and must not set `responded_at` —
  otherwise a "test" silently marks a real invitation answered.
- **`SUPPRESSED` is a GDPR art. 21 obligation** (V2:4325; "Reservert — har sagt nei til
  undersøkelser", V2:4332). It must be honoured by `send_round`, not by whoever remembers
  to filter, and it must survive a re-import of the same CSV.
- **The audience-mix block is a legal-basis rule enforced by a disabled button.**
  `audBlocked` V2:4829 → V2:6620–6624, copy V2:6551. `cursor:not-allowed` is not
  enforcement.

### Three highest-risk items

1. Tasks from below-threshold findings, and `threshold.breached`.
2. Live's projected increment (a Q28 extension) plus the projected free text and audience
   questions.
3. Quiz as assessment: retention, visibility, which tables.

### What I think is a mistake

Treating `liveGuard` (V2:6147) as the anonymity story for live. It is a true sentence about
a static check and it will be quoted as though it covered the room.

### One thing another expert will get wrong

The product reviewer will say Oppgaver "supersedes `loop_actions`" and schedule it as a
migration of an existing feature. It is not a bigger `loop_actions`; it is a statutory
register whose most-drawn source is a disclosure I do not think can ship as designed. The
feature is buildable; the *source* is the open question, and it gates the webhook phase.

---

## Brief 3 — Frontend architect

### What I see

Far less new than the bundle's size suggests, because v1 built the structural work. The
frame (header, wide toggle, Innsikt rail), the policy panel, the attributed table, the
«Tilpass» card and the use-case library all exist. What is new is four screens and a
systematic pass over the old ones.

**Genuinely new components**

| Component | Why nothing existing covers it |
|---|---|
| Task card with a six-step chip rail (V2:2180–2210) | `stepChips` V2:5190 is a six-state labelled progress rail. Nothing has one; the wizard indicator is four-step and modal |
| Projected live stage (V2:1843–1868) | `background:var(--ink)`, `color:var(--sf)`, 38px display type, inline 11×11 QR grid (V2:1852–1858). **The app has no dark surface anywhere** |
| Word cloud (V2:1874–1884) | Variable font sizes in a wrap flow |
| Quiz tiles (V2:4768) | Four saturated colour tiles with icon paths |
| Population card (V2:2412–2422) | A tinted card carrying a lawful basis and a retention period |
| Segment row with monospace rule (V2:2455–2468) | `ui-monospace` inside a list row |
| API key reveal (V2:2695) | Monospace masked value + reveal toggle |
| Help article layout (V2:1946+) | Article + steps + mock screen + caption + related |

**Variations that must reuse, not fork** — and most of these now have a real component to
reuse, which is the difference the v1 round made:

| v2 element | Existing |
|---|---|
| Task filter pills (V2:2159–2163) | The tab-chip pattern; `components/InsightTabs.tsx` and `administrasjon/AdminTabs.tsx` are both instances |
| Task stat tiles (V2:2166–2172) | Oversikt's stat cards |
| Målgrupper group cards (V2:2434–2445) | `bibliotek/TemplateCard.tsx`, `UseCaseCard.tsx` |
| Live/quiz setting toggles (V2:6136+) | The 46×26 switch on Administrasjon → Alternativer |
| Integrasjon rows (V2:2670+) | The Brukere row + status chip |
| Admin tabs, now nine with `sprak` | `administrasjon/AdminTabs.tsx` — already wraps |
| Panel/preset chrome for anything dashboard-shaped | `dashboard/PanelControls.tsx`, `PresetChooser.tsx`, and the `.touch-cluster` utility RESPONSIVE.md § «Tilpass» requires |

**The header change** (00-diff §A.6) touches `AppHeader.tsx`, `AppNav.tsx`, `MobileNav.tsx`,
`UserMenu.tsx`. Small, not optional.

**The hardening pass** is 42 controls gaining `box-sizing:border-box;max-width:100%`. The
app solved the same class through `docs/RESPONSIVE.md`, and D90 records one deliberate
divergence (a 20px gutter where the bundle draws 36px). This is a **check**, screen by
screen, not a rebuild — and the risk is that it silently changes desktop.

### QUIZ_TILES — a token decision

V2:4084–4089 introduces `#F26B21`, `#2F6FB0`, `#2F7D4F`, `#B0343C` with `fg:"#FFFDF6"`,
reaching the **respondent** surface (`respondOne.quizTiles`, V2:4768), which is pixel-perfect
mobile-first. CLAUDE.md's tokens do not include them and the rule is that tokens do not
change across breakpoints; the spirit is that they do not change across surfaces.

Three readings, and it is Tor's call:

1. **New named tokens** (`--qz1…--qz4`) in the theme and `tailwind.config.ts`. Functional,
   not decorative: four visually distinct answer positions.
2. **A logged deviation** — hard-coded inside quiz only.
3. **Reuse `--ac/--ac2/--ac3/--sbg`** — one token set, at the cost of four near-identical
   luminances that will not read from the back of a room.

I recommend (1); (2) puts a hex in a component, which is what the token system exists to
prevent. Whichever is chosen, **measure the contrast** — `#FFFDF6` on `#F26B21` is about
3:1, large-text-only under AA, and these tiles carry answer text.

### Three highest-risk items

1. **The dark projected surface.** No dark tokens exist. Building one screen's inverted
   colours by hand is how a second, undocumented palette gets born.
2. **The hardening pass changing desktop.** 42 controls across screens that are currently
   pixel-perfect and have reference renders in two directories
   (`artifacts/reference/`, `artifacts/reference-v1/`).
3. **Oppgaver as a fifth nav item.** Small diff, touches every page: `AppHeader.tsx:27-30`,
   `AppNav.tsx`'s pathname→key derivation, `MobileNav.tsx`'s slide-over.

### What I think is a mistake

Drawing the live stage inside the app shell (V2:1829) with the standard header — so the
presenter's avatar and the org nav go on the wall. A projected surface should be a
full-bleed route with no chrome. As drawn it is a screen inside the app; as used it is a
projector output.

### One thing another expert will get wrong

The verification engineer will plan a screenshot diff for the live screen. There is no
reference render for it in either `artifacts/reference/` or `artifacts/reference-v1/`, and
`playwright.config.ts` has no projector viewport. A green visual gate there would mean the
screen was captured, not that it was right.

---

## Brief 4 — Responsive reviewer

Every surface against `docs/RESPONSIVE.md`, which the v1 round extended — it now carries
named patterns for expandable rows (Q34), the «Tilpass» card (Q33) and an amended Charts
rule (Q40) that **drops the 200px floor** in favour of 44px per interactive mark, plus a
`.touch-cluster` utility.

| Surface | Pattern | Covered? |
|---|---|---|
| Oppgaver — filter pills | § Tab rails and chip groups — wrap | Yes |
| Oppgaver — stat tiles | The bundle's own `auto-fit,minmax(180px,1fr)` (V2:2166) | Yes, no rule needed |
| Oppgaver — task cards | Already cards. `stepChips` (six, V2:2197) wrap; row gap must satisfy global rule 2 | Yes |
| Målgrupper — populasjoner / grupper | The bundle's own grids (V2:2411, V2:2432) | Yes |
| Målgrupper — segmenter | § Data tables → wide row → card. The monospace rule wraps, never truncated | Yes |
| Integrasjoner — 15 rows, 5 groups | § Data tables → wide rows → cards | Yes |
| Admin tabs, now nine | § Tab rails | Yes |
| Profil og avsender — swatches, domains | § Data tables (narrow rows keep the row); swatch grid is the bundle's | Yes |
| Help centre | § Data tables for the list; prose body | Yes |
| Send screen changes | § Send screen | Yes |
| Quiz settings in the builder | § Three-pane Builder — right pane becomes a sheet below `xl` | Yes |
| Quiz tiles on `/s/[token]` | **Respondent surface — mobile-first pixel-perfect**, not this file | Yes, by the design |
| Quiz leaderboard | § Data tables → narrow rows keep the row | Yes |
| **Live — projected stage** | **Nothing** | **NO → stop-and-ask** |

### The uncovered cases

CLAUDE.md relaxes "do not invent" **only** to the patterns in this file, so these are
blockers for the live phase, not judgement calls:

1. **The projected viewport is a class this file has never covered.** Three breakpoints
   exist — desktop ≥1280 pixel-perfect, tablet 768–1279, mobile <768. A projector is none:
   1920×1080 at 4m has *smaller* angular resolution than a laptop at 60cm, so "desktop but
   bigger" is wrong. Type must scale with viewing distance, not pixels.
2. **The dark surface.** Global rule 3 says tokens never change across breakpoints; it does
   not say what happens when a surface inverts, and there are no dark tokens.
3. **The QR's minimum physical size** (V2:1852 draws 132×132px) — a scan target whose size
   depends on the room, which is not a rule this file can express.
4. **The presenter's own device.** Is the live *control* surface (reveal V2:1838, settings)
   used on a phone while the stage is projected? The bundle draws one screen containing
   both. Two surfaces on two devices is a product question with a responsive consequence.
5. **Audience questions at display size** (V2:1906) — arbitrary user text, no length limit
   in the design, overflow undefined.

Item 4 is the lever: if the stage is a separate chrome-free route, 1–3 become tractable
because that route can carry its own type scale without touching the app's breakpoints. If
it is one screen, this file has to grow a fourth breakpoint class — a change to a frozen
specification.

### Three highest-risk items

1. Live needs RESPONSIVE.md to change or to be routed around, and the file is a
   specification, not a suggestion.
2. Hit areas on the new 38×38 header button (V2:195) and the six step chips — the systemic
   class global rule 2 exists for, and where Gate 3e once reported 228 blockers from one
   cause.
3. The hardening pass intersecting "no horizontal scroll at 390px". The bundle's mechanism
   (`box-sizing` + `max-width:100%`) and the app's (RESPONSIVE.md patterns, D90) are
   different; applying both blind is how desktop drifts.

### What I think is a mistake

Nothing in the bundle's responsive work — the hardening pass is the right instinct. The
mistake is drawing the live stage inside the shell, which is the same finding the frontend
architect reached from the other side.

### One thing another expert will get wrong

The database architect will treat `hasThresholdWarn` as a build-time warning and not notice
that its rendering (V2:2561) sits inside the builder's right pane, which below `xl` becomes
a sheet. A warning that exists only behind a closed sheet is not a warning — the same
finding the app already had to solve by giving `policyWarnings` a second home on
`SendScreen`.

---

## Brief 5 — Verification engineer

### Numbers per surface

Current: census **577 tests / 35 files**, 5a3 **56 of 74** (45 RLS tables + 29 SECURITY
DEFINER, 18 allowlisted), capture states **159**, responsive combinations **160**. Both
carried numbers may only move up.

| Surface | Gate 3a | Gate 3e | 5a3 | Census |
|---|---|---|---|---|
| Fidelity pass over built screens | **Re-render both reference sets** | every route | — | 0 |
| Oppgaver | new render | RESPONSIVE.md rules | `tasks`, `task_effect_assessments` + definer fns | +1 file |
| Målgrupper | new render | rules | extended `groups`, freeze table | +1 file |
| Suppression / member state | part of Send + Brukere | rules | `suppressions` | +~8 |
| Profil og avsender | new render | rules | sender tables | +~8 |
| Live | **no reference exists, no viewport exists** | **uncovered** | `live_sessions`, `live_audience_questions` + fns | +1 file |
| Quiz | new render (respondent = pixel-perfect bar) | mobile-first | `quiz_attempts` + `quiz_leaderboard` | +1 file |
| Help centre | new render | rules | `help_articles` (allowlist, with a reason) | +~5 |

### Which surfaces no current fixture reaches

`tests/db/factories.ts` provides `createOrg`, `createSurvey`, `createRound`, `inviteTo`,
`inviteOrganisations`, `createShareLink`, `submitResponses` (through the RPC), `dropOrg`.
That is a good spread. What it **cannot** produce:

1. **A task at any lifecycle step.** No table. Fine *provided* the phase that creates it
   extends the seed in the same phase — CLAUDE.md's rule.
2. **A below-threshold finding that produces a task.** Needs n=4 in one group and n≥5
   elsewhere, then an assertion on what the task does *and does not* contain. There is no
   factory for "a gated cell" as a source.
3. **A live session** — no table, no fixture, no viewport, no reference render. Three gaps,
   and the third makes a Gate 3a "pass" meaningless.
4. **A quiz attempt, pass mark, failed attempt, certificate.**
5. **An audience with counts before send.** `hasThresholdWarn` (V2:4988) fires pre-send.
   Factories build invitations *at* send. (Note `surveys.target` does now have a writer —
   `M:0039`'s trigger — so the *survey-level* count is producible; the per-audience-group
   one is not.)
6. **A frozen segment** — membership changed *after* a round is sent, asserting the
   denominator did not move. The most likely place for a silent defect, because nothing
   errors.
7. **A mixed-population send.** No population, so no fixture for the refusal.
8. **A suppressed address surviving re-import.** `tests/unit/import.test.ts` is parsing, not
   database behaviour.

**Why this list matters more than usual, and now I can cite it.** `docs/v1/reports/V1-6.md § 5`
records the bundle's largest defect: a migration shipped a field, `tsc` stayed clean
because nothing read it, and **the visual gate passed because it had only ever photographed
the old state** — the baseline predated the decision requiring the change. Every layer was
individually green. `docs/v1/05-status.md § 3` generalises it: **the demo seed reaches only
states the current code creates**, so a state the code can produce but the seed never does
is invisible to every gate at once. It happened twice in the v1 bundle. Live, quiz,
Oppgaver and Målgrupper are four whole screens in exactly that position.

That limitation already has an owner — launch readiness, triggered by the first real
organisation. **A v2 phase must not silently rely on that owner**: each phase extends the
seed itself.

### Limits to log rather than build around

The apparatus is frozen. These get logged:

- **5a3 proves a denial test exists, not that its scope is right.** `VERIFY.md`'s own note
  records `ui_messages` cross-tenant for six phases behind a green 5a3.
- **A CHECK constraint and an `app`-schema function are neither an RLS table nor a public
  SECURITY DEFINER function**, so neither is a 5a3 surface — a recorded limit, restated in
  CLAUDE.md after V1-6.
- **No gate can see the live increment** (Brief 2 ii). It is a property of a sequence
  observed by a human. Log it; the substitute is a Playwright test that submits one at a
  time and reads the projected DOM at n = k−1 and n = k.
- **No gate can see what a task's `source` string discloses.** The control is that the
  string is not *constructed* that way, asserted by reading the produced row and failing on
  a group name appearing in it.
- **EVERY GATE READS LOCAL; NOTHING HAS EVER READ PROD** (`docs/v1/06-closeout.md § 3`, the
  standing limitation with no owner). Not this bundle's finding and not this plan's to
  solve — carried as a limit.

### Three highest-risk items

1. Four whole screens with no seedable state, against a documented precedent of exactly
   that producing a green-but-wrong phase.
2. Frozen-segment behaviour: no error, no symptom, wrong numbers.
3. **`verify:reference` now renders two bundles and overwrites neither** (CLAUDE.md, Q18) —
   `artifacts/reference/` and `artifacts/reference-v1/`. Adding a third is a decision about
   Q18, not a script change, and re-rendering will make existing diffs go red at once. That
   is correct and must be its own scheduled step.

### What I think is a mistake

Planning a screenshot gate for live at all. Better to state in the phase's definition of
done that live has **no reference comparison**, and spend the budget on the counter's
observable behaviour instead.

### One thing another expert will get wrong

The product reviewer will treat the fidelity pass over built screens as cheap. It re-renders
both reference sets across 159 capture states and 160 responsive combinations, and every
diff it raises lands on a screen someone already signed off. It is the phase most likely to
produce a long, boring, genuinely necessary finding list.

---

## Brief 6 — Product / scope reviewer

### What supersedes what

| New | Supersedes / collides with | Verdict |
|---|---|---|
| **Oppgaver** | `loop_actions` (`M:0006:116`), surfaced by `oversikt/LoopActionForm.tsx` | **Supersedes.** Migrate `text → title`, `done → Lukket`; retire the old surface. Do not run both |
| **Oppgaver as a fifth nav item** | The four-item nav V1-0 built (`AppHeader.tsx:27-30`) | **Extends.** One item added |
| **Målgrupper** | `public.groups` + Administrasjon → Grupper | **Extends and partly supersedes.** Groups stay and gain population, source, kind; segments are new; populations are catalogue-blocked |
| **Consolidated import** | **Q9** — CSV/Excel/paste real, sync stubbed "behind the same UI" | **Relocates, does not cancel.** Sync moves from Send to Målgrupper (V2:3040). Q9 wants an amendment so the register does not read as drift |
| **Profil og avsender** | The **Q17** lock, not profile settings (`brandLocked` V2:4830) | **Extends Q17.** A policy surface wearing a branding costume |
| **Suppression / member state** | `org_members.status` (`invited/active/inactive`), `survey_invitations.bounced_at` | **Extends.** Needs a mapping decision, not a parallel column |
| **`hasThresholdWarn`** | `lib/questions/policy-warnings.ts` and its three callers; **D94, closed in V1-2** | **A fourth caller, not a fourth copy.** See Brief 1 |
| **BankID** (V2:5215) | **Q4** | Reopens a deferred decision. Deferred phase |
| **Integrasjoner** | **R3/R4** (not in repo), **Q9**, **Q6**, **Q7** | Deferred phase, partly catalogue-blocked. `docs/INTEGRATION_ARCHITECTURE.md` and `docs/SLACK_INTEGRATION.md` are the groundwork already on main |
| **Live / Quiz / Help centre** | Nothing | **New product areas** |
| **Bruksområder page** | The `use_cases` registry V1-5 built | **Additive and consistent** — all nine types it markets exist as seeded packs |
| **The stream panel, if v2 revives it** | **Q26 + the V1-7 descheduling** | **Do not revive it here.** It is R4's second half by a decision already taken |

### What I would sequence first, and why

The **fidelity pass over what v1 built**. v2 moves the frame under four screens that were
signed off against v1 (§A.6's hardening, the header, the nav gaining a fifth item), and
every later phase renders inside that frame. Doing it late means re-touching every screen
the new phases added.

That is a different answer from the one an earlier pass gave — it proposed building the
Q17/dashboard surfaces first, which are already built. Sequencing has to follow the tree,
not the bundle's apparent novelty.

### Three highest-risk items

1. **Oppgaver's source.** A statutory task register with hjemmel is the most valuable thing
   in this bundle — it is what makes HeiTuva a compliance product. Its most-drawn source is
   the one the security reviewer says cannot ship as drawn. The feature survives; the copy
   on three screens and the webhook change. Deciding late is expensive.
2. **Scope inflation via Målgrupper.** It reads as a grouping feature and is a
   processing-basis model. Half is catalogue-blocked. Shipping the other half and calling
   it done produces a screen promising population separation it cannot enforce.
3. **The bundle markets what does not exist.** Fifteen integrations drawn as a settings tab
   with connect buttons, when integrations are deferred. Same class as D73 (the splash
   claimed four languages and was corrected to two).

### What I think is a mistake

Drawing Integrasjoner as a settings tab. Fifteen systems with per-field disclosure, five
levels and two "Lovpålagt" entries is a surface with a DPA behind each row. Toggles make it
look nearly done.

### One thing another expert will get wrong

The security reviewer will treat population separation as a `send_round` rule and stop
there. It is also a **retention** rule — `popRows` V2:5037–5042 carries "24 mnd", "5 år",
"12 mnd" per population, and `app.apply_retention` has no population input. Enforcing the
send guard while retention stays global gives the screen a promise the data lifecycle does
not keep.

---

## Brief 7 — Scope-split reviewer (mandatory)

### This bundle is not one plan

Three things drawn here are each larger than any phase this project has run.

1. **The public API and webhooks.** Six events (V2:5243–5249), a key surface (V2:2695).
   Key issuance with hashed storage, scopes, rotation, rate limiting, a delivery queue with
   retries and dead-lettering, signing, subscriptions, versioning, public documentation —
   and a support obligation an API has and a UI does not. `threshold.breached` cannot be
   specified until Brief 2(i) is settled. **Its own program, placed last.**
2. **Fifteen integrations.** Three new data categories (health, gender, salary), one
   identity decision (Q4), one export that probably cannot honour the k-gate, one that is
   R4 and not in this repo. Each needs a lawful basis, a DPA clause and a customer-facing
   description. A commercial and legal program with an engineering component. **Same final
   phase; its real output is the risk register and the order.**
3. **A live presentation engine.** Real-time state, a projector surface with no theme
   precedent, a viewport class RESPONSIVE.md does not cover, a moderation queue, UGC with
   votes, an increment no gate can see, and quiz layered on top with assessment semantics.
   **Its own program.**

**The repo has already done this once and it worked.** V1-7 was descheduled when Tor
recognised that the stream panel and R4 are one feature in two halves
(`docs/v1/05-status.md § 1`), with the reasoning written down so it is not re-derived, the
scope kept verbatim in the plan, and the feature's absence *drawn* rather than hidden
(Q26). That is the template for everything in this brief.

### What belongs in a v2 build

- The **fidelity pass** over what v1 built (the frame, the hardening, the header, the fifth
  nav item).
- **Oppgaver**, without the from-findings source until Brief 2(i) is answered.
- **Målgrupper**, groups and segments only.
- **Suppression and member state** — small, art. 21, overdue.
- **Profil og avsender** — it extends a lock that exists.
- **Help articles and contact** — content.
- **Bruksområder** as a public page, once the missing fourth page is resolved.
- **Test mode** — small, and it protects the single-write-path invariant.

### What becomes its own program

- Live (including the word cloud and audience questions).
- Quiz (including certificates, pass marks, attempts).
- Integrasjoner + public API + webhooks — one program, one final phase.

### What should not be built at all

1. **`threshold.breached`.** If the task itself is safe, `task.created` already exports it;
   the threshold event adds only the leak.
2. **`helpForum`.** A community product: moderation staffing, spam, harassment, retention,
   takedown — and V2:2091 promises anonymous posting inside a product selling a *controlled*
   anonymity guarantee. Ship the twelve articles and the contact form.
3. **`audienceQuestions` on the projected screen.** Same reasoning at higher stakes. It
   defaults off (V2:4338) — leave it off.
4. **Sykefravær correlation** (V2:5209) as a *product feature*. Health data against
   psychosocial risk per unit, where units are small enough to identify people. A bespoke
   engagement with a DPIA, not a connect button.

### Three highest-risk items

1. Planning the API, the integrations and live as *phases* in one plan — how a bundle build
   becomes a program without anyone deciding to start one.
2. Any earlier phase depending on something the deferred phase would deliver. Målgrupper's
   Entra/CSV source field, sender domain verification and supplier org-number lookup are
   planned against **manual or CSV input**, integration named as a later enhancement.
3. Two unknowns under one plan: the catalogue (R3/R4) and the missing fourth page.

### What I think is a mistake

Treating the deferred final phase as a placeholder. Write it as a phase — which
integrations, in what order, what each reads, its lawful basis, its DPA consequence, what
must be true first — or it reads as "we'll get to it", and the first customer who asks for
HR sync gets a yes.

### One thing another expert will get wrong

The frontend architect will cost Live as "one screen plus a projector view". The screen is
the cheapest part. The expensive parts are real-time state, the moderation queue, the UGC
lifecycle, and a viewport class that requires changing a frozen specification.
