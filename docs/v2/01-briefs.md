# 01 — Expert briefs (Round 1)

Seven briefs, written independently and left unharmonised. Where two briefs contradict
each other, that contradiction is the input to 02-conflicts; it is **not** resolved here.
Line numbers with a bare colon (`:4165`) refer to
`design-reference-v2/heituva-survey-app-design/project/HeiTuva.dc.html`.

---

## Brief 1 — Database architect

### What I see

Nine new subjects, of which four are ordinary and five are not.

**Ordinary** (a table, an RLS policy, a test, done):

| Subject | Shape |
|---|---|
| Use-case registry | `use_cases(key, label, short, description, preset, tint, sort_order)` + translations. Six rows (:4034–4041). `template_packs` gains `use_case_key`. Data-not-code — a pack moves category by an UPDATE, not a deploy. |
| Five new template packs | Rows in `template_packs` + `template_pack_translations`. No DDL. |
| Help articles | Twelve rows (:4177+) with steps/mock/related as `jsonb`, org_id NULL, public-by-design like `report_section_types`. `helpForum` is **not** part of this — see Brief 7. |
| Suppression | `suppressions(org_id, email, reason, created_by, created_at)`, unique on `(org_id, lower(email))`. Read by `send_round` and by import. |

**Not ordinary:**

**1. Oppgaver.** `loop_actions` (`…0006_compliance_reports.sql:116`) is
`{text, owner_member_id, due_at, done boolean}`. v2's task carries `kind`, `law`, `source`,
a six-step status (:5181) and a refusal to close without an effect assessment (:5197). The
lifecycle is the interesting part, and it is a **state machine with a guarded terminal
transition**, which belongs in a trigger, not in a server action:

- `tasks(id, org_id, title, kind, law, source_kind, source_ref, owner_member_id, due_at, status, created_at)` with `status` an enum of the six.
- `task_effect_assessments(task_id, round_id, assessed_by, assessed_at, note)`.
- A `before update` trigger that raises when `new.status = 'lukket'` and no assessment row exists.

Two things follow that are easy to get wrong. First, **CLAUDE.md's immutability rule
applies**: an append-only or freeze trigger written as "reject any UPDATE" collides with
PostgreSQL's own FK maintenance, and this has been rediscovered four times (D50, D51, D57,
duty-archive). The close guard must compare *the columns that carry meaning* and let an
`ON DELETE SET NULL` on `owner_member_id` through. Decide the cascade when the trigger is
written. Second, `law` is a citation string in the bundle, but `duty_definitions` already
holds the four statutory duties as rows; a task's legal basis should reference that
registry where one applies and fall back to free text only where it does not.

**2. Målgrupper.** `groups` (`…0002_tenancy.sql:29`) is `{id, org_id, name,
lead_member_id}` with `unique(org_id, name)`. v2 needs `kind` (gruppe/segment),
`population_id`, `source`, `synced_at`, and for segments a stored `rule`. Two hard parts:

- **The rule is an evaluable predicate** (:4320 `"stillingsprosent < 100 og ansatt før 2024"`).
  Storing it as text and evaluating it in SQL is how an injection surface gets built. It
  must be a **structured predicate** (jsonb: field, operator, value, joined by AND) over a
  fixed, allowlisted field set — and the fields it wants (`stillingsprosent`, `startdato`,
  `land`) are HR fields this product does not hold, which makes most segments
  integration-blocked in practice even though the mechanism is not.
- **Segments freeze per round.** `auditRows` :5033 — "312 treff · frosset for Ukespuls 36".
  A self-updating segment that is re-evaluated after send would change a round's
  denominator retroactively, which breaks every participation number and every k
  computation over that round. So `survey_rounds` needs a materialised membership, not a
  live join.

**3. Populations.** Catalogue-blocked (00-diff §0.1). What I can say from here: a
population carries a **lawful basis** and a **retention period** (:5037–5042), and
`app.apply_retention` already exists, so retention wants to be driven from the population
rather than from a global setting. And the send guard (below) needs `survey_rounds` to
carry exactly one population.

**4. Live.** `live_sessions(survey_id, round_id, current_question_id, revealed boolean,
settings jsonb, started_at, ended_at)`, `live_audience_questions(session_id, text, votes,
moderated_at, moderated_by)`, and a moderation queue for free text
(`cloudModeration` :6180). Every read the projector makes is a new SECURITY DEFINER
surface that 5a3 will enumerate.

**5. Quiz.** `survey_questions` gains `answer_index` and `points`; a `quiz_attempts` table
carries member, attempt number, score, passed. **But I do not think it belongs in
`responses` at all** — see my "what I think is a mistake".

### Every new SECURITY DEFINER function is a k-gate surface

5a3 derives its list from the catalog (`scripts/verify/policy-coverage.ts:1-26`), so each
of these lands on the list the moment it is created and needs a denial test in the same
phase:

`task_list`, `task_advance`, `task_create_from_finding` (if it survives Brief 2),
`audience_list`, `audience_freeze_for_round`, `live_session_state`, `live_reveal`,
`live_audience_questions`, `quiz_leaderboard`, `panel_layout_get/set`, `stream_window`,
`help_articles` (probably not definer — it is public content), `api_key_*` and
`webhook_deliver` (deferred phase).

The two-sided catalogue-derived `k_for` assertion applies to `stream_window` and
`quiz_leaderboard` and `live_session_state` without exception: **nothing calls the old
constant, everything reading the vault calls `app.k_for`**. `app.k_for`
(`…0032_threshold_policy.sql:69`) returns `0` for organisation surveys and
`greatest(k_threshold, 3)` otherwise, so "0 means ungated" is a case every new caller must
handle explicitly rather than by `>= k`.

### Three highest-risk items

1. **The task close guard.** It is the feature's whole legal point (:5197) and it is the
   exact shape of trigger CLAUDE.md says has been got wrong four times.
2. **Segment freezing.** Get it wrong and every historical participation rate silently
   changes. It is invisible in review because nothing errors.
3. **`quiz_attempts` next to `responses`.** One table holding both anonymous survey
   responses and identified assessment results is one migration away from a join that
   should be impossible.

### What I think is a mistake

Putting quiz results in the response tables. The anonymity CHECK on `responses` exists
because linkage must be *structurally* impossible, not merely unused. A quiz result is by
design attributable — it has a person, a score, a pass/fail and a certificate (:6152).
Storing it beside responses means the CHECK must be relaxed or a discriminator added, and
either way the invariant stops being "no anonymous row can reference a person" and becomes
"no anonymous row *of this kind* can". That is a weaker sentence and a weaker guarantee.
Quiz belongs in its own tables with its own RLS.

### One thing another expert will get wrong

The frontend architect will read `hasThresholdWarn` (:4988) as a display detail and
reimplement `g.count < 5` in TypeScript. It is a **database** question: the warning must be
derived from `app.k_for(survey)`, and it fires before any response exists, which means the
audience count has to be readable at build time by someone who may not read results.

---

## Brief 2 — Security reviewer

The centre of gravity. Four collisions, in severity order.

### (i) Tasks from below-threshold findings — and `threshold.breached`

**What the bundle says.** Three places, not one:

- :4239 — "Funn under terskel blir oppgaver med ansvarlig og frist, **med hjemmel synlig**."
- :4270 — "Funn under terskel blir oppgave **automatisk**, med kilde og hjemmel."
- :4168 — a shipped task: `source:"Psykososial kartlegging · under terskel"`,
  `kind:"Risikovurdering"`, `law:"aml. § 4-3 (3)"`, `owner:"Tuva Berg"`, `due:"20. sep"`.
- :5248 — the webhook: `threshold.breached` — "Funn under terskel — kan utløse
  undersøkelsesplikt".

**Why this is worse than quiz or live.** It does not look like a security feature. It looks
like compliance, and it is drawn as compliance, which is exactly why it will pass review.
The task at :4168 is titled "Risikovurdering av ytringsklima" with a source naming the
survey and the phrase "under terskel". Give that to anyone who knows which team answered
the psykososial survey and you have disclosed that a specific sub-five group scored badly
on ytringsklima. k=5 exists to prevent precisely that inference. The task then goes to a
named owner, appears in a task list any `redaktør` can read, is announced in Teams
(:5198), and — via `threshold.breached` — leaves for a system where none of this product's
RLS applies.

**The legal argument for the feature is real and I am not disputing it.** aml. § 4-3 (3)
does not suspend the undersøkelsesplikt because fewer than five people answered. A
duty that only bites at n≥5 would be a duty an employer could evade by keeping teams
small. So the question is not *whether* the duty exists. The question is **what a task may
contain**.

**Establish this, and it is a stop-and-ask, not a judgement call:**

> Can a task be created from a suppressed finding without naming the group, the survey, or
> the score?

My reading of the design as drawn: **no**. `source` names the survey and the threshold
state; `law` names the provision, which for `aml. § 4-3 (3)` implies the topic; and the
task list is filterable by `lov` (:5164), which lets a reader enumerate exactly the
statutory findings. Three fields that are individually defensible compose into the
disclosure.

**What could ship.** Three shapes, in decreasing safety, for Tor to choose between:

1. **The duty, not the finding.** A below-threshold cell raises a task that says an
   undersøkelsesplikt is triggered for *the survey*, with no group, no question and no
   score — the responsible person then does the investigation offline. The duty is
   discharged; nothing is disclosed. This is what I would build.
2. **The finding, visible only to a named role, never exported.** The task carries the
   group, is readable only by `administrator` (never `leser`, never `redaktør`), is
   excluded from Teams announcements, and `threshold.breached` **is not implemented**.
   This is defensible but it makes the task list role-split, which the design does not draw.
3. **As drawn.** I do not think this can ship.

**`threshold.breached` specifically.** It carries the disclosure across the RLS boundary by
construction. Whatever shape (1)–(3) is chosen, this event cannot be specified until that
choice is made — which is why the deferred integrations/API phase **depends on an earlier
phase's decision** and must not be started before it.

### (ii) Live mode — the timing leak, and the projected free text

**Already handled, do not re-report:** `liveGuard` :6147 states the static rule and the
design honours it. Say so and move on.

**What remains — the timing leak.** In a room of six, the audience watches
`liveStage.counter` (:6177) tick 3 → 4 → **5**, and at 5 the bars appear (`liveRevealed`,
:1863). Everyone present knows who is in the room and who just put their phone down. The
static gate is satisfied at every instant and the anonymity is gone anyway. No check this
repo has — 5a3, the invariant suite, the k-surface tests — can see this, because it is not
a property of a query result; it is a property of a *sequence* of query results observed by
a human.

Mitigations, none free:
- Do not show the counter below the threshold at all (`counter` is a toggle, :6138 — but it
  defaults **on**).
- Reveal on the presenter's action only (`manualReveal` :6139, defaults on) **and** refuse
  the reveal until n ≥ k + a margin.
- Add jitter/batching to the counter so it does not move per submission.

This is a **design decision with a legal consequence**, which puts it with Tor, not with
me. What I will say plainly: shipping the counter as drawn, defaulting on, in a room
smaller than about twice the threshold, means the product's central promise is false in the
one place where it is being demonstrated to the whole company.

**The word cloud.** `DEFAULT_LIVE.cloud` defaults **on** (:4338) and shows respondent free
text on a projector. There **is** a moderation queue — `cloudModeration` :6180, "3 frisvar
venter på moderering før de vises" — so this is not unaddressed either. Establish:

- What does the queue gate — every word, or only flagged ones? The copy says free texts
  wait "før de vises", which reads as all of them.
- Who moderates, and does that person thereby read individual free text? If the moderator
  is a `redaktør`, that is a new read path into free text that `get_quotes`' rules
  (`…0009_rpcs.sql:176` — `leser` + a group filter is `forbidden`) currently govern. **Does
  `get_quotes`' threshold and leser rule apply to the projected surface at all?** As drawn,
  no: the projector reads a different path. That is the finding. It must, or the product
  has two different answers to "who may read free text".
- Word clouds are not aggregation. A rare word from one respondent is a quote with the
  grammar removed. The cloud needs its own minimum-occurrence floor, which is not the same
  number as k and is not in the bundle.

### (iii) Quiz mode — assessment semantics, not anonymity

**Already resolved in the design, do not re-litigate:** `quizGuard` :6163 — quiz settings
are locked while the survey is anonymous, enforced at :6156–6162 (early return on every
toggle and both numeric fields). The leaderboard as drawn is **team**-level (`quizBoard`
:6186, `DEFAULT_QUIZ.team = true` :4339), not individual.

**The real question.** `certificate` (:6152, "Sertifikat ved bestått — Sendes på e-post"),
`quizPass` (:6159, "Bestått-grense", default 70) and `quizTries` (:6161, "Antall forsøk",
default 2) give this **assessment** semantics. An employee who fails a mandatory quiz twice
has produced an HR record. Three consequences:

1. **Retention.** A survey response is retained under the survey's retention rule. A
   failed competence assessment is employment documentation with a different — usually
   longer, sometimes statutory — retention, and a different erasure answer under GDPR
   art. 17. The product currently has one retention path (`app.apply_retention`).
2. **Who may see a result.** `leser` sees aggregates. Who sees that Marit failed? Her
   manager? HR? The bundle does not say, and the roles as defined (CLAUDE.md §4) have no
   answer, because none of them was designed for individual performance data.
3. **Whether it belongs in the same table.** See Brief 1. I agree with the database
   architect for a different reason: the DSR flow (`dsr_requests`) answers "what do you
   hold about me" from a schema where the answer for surveys is *structurally* "nothing
   attributable". Quiz breaks that sentence unless it lives elsewhere.

Also worth recording: `modeNote` :6122 refuses quiz on statutory packs — "Quiz kan ikke
brukes på lovpålagte maler". Good. That refusal is enforced in the UI only and belongs in
the database with the rest of the policy guard.

### (v) User-generated content — a surface this product has never had

Two places, and they are not a live-mode detail:

- **`audienceQuestions`** :6183 — participants submit questions that appear **on the
  projected screen** with vote counts, e.g. "Hvordan påvirker omorganiseringen
  produktteamet?" · 12 stemmer. Rendered :1906–1912. Toggle `questions` :6143, defaults
  **off** (:4338) — the only mercy in the design.
- **`helpForum`** :5086 — a forum tab beside articles and contact.

Both are UGC with moderation, storage and harassment consequences, and the live one is
displayed publicly in a room to colleagues. A question can name a person. A question can
*be* harassment. A question can be a whistleblowing disclosure under aml. kap. 2A that has
just been read aloud to the department — which is the opposite of what kap. 2A requires.

What UGC needs that this product has none of: a moderation queue with a *pre*-publication
gate, a retention rule, an author record (which collides with the anonymity the live
surface otherwise promises), a report/abuse path, and a takedown obligation. That is a
product area, not a toggle. Brief 7 should treat it as such.

### (iv) Integrasjoner — input to the deferred phase's risk register

Analysed here, scheduled nowhere. Each needs its own lawful basis and DPA text, and three
bring data categories this product has never held:

| System | What it brings | Why it is its own problem |
|---|---|---|
| `fravar` — Sykefravær, "Korrelér risiko mot fravær per enhet" (:5209) | fraværsprosent per enhet | **Health data, GDPR art. 9.** Joined to psychosocial results per unit. Art. 9 needs its own condition — art. 9(2)(b) is arguable for HSE duties but is not the same basis as the rest of the product runs on. And "per enhet" is a group small enough to be a person. |
| `hr` (:5206) | stillingsgruppe, ansiennitet, stillingsprosent, **kjønn** | Gender to enable ARP under ldl. § 26. Also the field that makes a two-axis breakdown re-identifying in a small unit. |
| `lonn` (:5207) | lønn per stillingsgruppe (aggregert), "grunnlag for ARP" | Salary. Aggregated per the note (:5250), which is the right design — but the aggregation must be enforced at the boundary, not promised in copy. |
| `bankid` (:5215) | navn, signaturtidspunkt | Revisits **Q4**, which deferred respondent identity and reserved `survey_invitations.identity_provider`. Duty signing today is audit-grade (member + timestamp + content hash), not a qualified signature. BankID changes what a signature *means* legally, which is a decision above this plan. |
| `bi` — Power BI/Tableau (:5225) | **"aggregerte resultater"** | **Establish whether this export could honour `app.k_for` at all.** A BI tool's value is slicing; a k-gate that holds for the slices the product ships does not hold for slices the customer invents in Power BI. My reading: an export that hands over per-group rows cannot be k-safe downstream, so the only safe export is one already collapsed to the gated shape — which is most of what makes it worth buying. Say that plainly rather than shipping a connector that quietly breaks the guarantee. |
| `crm` (:5222) | kunde-e-post, sakstype | R4 event ingestion; not in this repo (00-diff §0.1). |

Output of this section is the **final phase's risk register**, not a set of connectors.

### Three more, smaller, and all real

- **`testMode` must not write responses.** It short-circuits in the client at :4577. If
  test mode is implemented server-side it must not reach `submit_response`'s insert, and
  it must not consume a token or set `responded_at` — otherwise a "test" silently marks a
  real invitation answered.
- **`SUPPRESSED` is a GDPR art. 21 obligation, not a convenience.** :4325, with member
  status "Reservert — har sagt nei til undersøkelser" (:4332). An objection to processing
  must be honoured by the *system*, not by whoever remembers to filter the list. It belongs
  in `send_round` and in import (which the bundle already does at :4971 and :4993), and it
  must survive a re-import of the same CSV.
- **The audience-mix block is a legal-basis rule enforced by a disabled button.**
  `audBlocked = audPops.length > 1` :4829 → `sendBlocked` :6618, button disabled :6620–6621,
  handler returns early :6624, copy at :6551: "Ansatt- og kundedata har ulikt
  behandlingsgrunnlag". A rule whose only enforcement is `cursor:not-allowed` is not
  enforced. It belongs in `send_round` as a refusal.

### Three highest-risk items

1. Tasks from below-threshold findings, and `threshold.breached`.
2. Live's timing leak plus the projected free text and audience questions.
3. Quiz as assessment: retention, visibility, and which table.

### What I think is a mistake

Treating "Live respekterer anonymitetsterskelen" (:6147) as the anonymity story for live
mode. It is a true sentence about a static check and it will be quoted in a sales
conversation as though it covered the room. It does not.

### One thing another expert will get wrong

The product reviewer will say Oppgaver "supersedes `loop_actions`" and schedule it as a
migration of an existing feature. It is not a bigger `loop_actions`; it is a statutory
register whose most-drawn source is a disclosure I do not think can ship as designed. The
feature can be built; the *source* is the open question, and it gates the webhook phase.

---

## Brief 3 — Frontend architect

### What I see

New components, and — more of the work than it looks — variations of components that
already exist.

**Genuinely new components**

| Component | Why nothing existing covers it |
|---|---|
| Task card with a six-step chip rail (:2180–2210) | The chip rail (`stepChips` :5190) is a progress indicator with six discrete labelled states. Nothing in the app has one. Closest is the wizard step indicator, which is 4-step and modal. |
| Projected live stage (:1843–1868) | A dark surface (`background:var(--ink)`, `color:var(--sf)`) at 38px display type with an inline QR grid (:1852–1858, 11×11 cells). The app has no dark surface anywhere. |
| Word cloud (:1874–1884) | Variable font sizes (`cw.size` 28px→13px) in a wrap flow. |
| Quiz tiles (:4768) | Four saturated colour tiles with an icon path. |
| Population card (:2412–2422) | Tinted card carrying a lawful basis and a retention period. |
| Segment row with monospace rule (:2455–2468) | `font-family:ui-monospace` inside a list row. |
| API key reveal (:2695) | Monospace masked value + reveal toggle. |
| Help article layout (:1946+) | Article + step list + mock screen + caption + related. |

**Variations of existing components** — these should reuse, not fork:

| v2 element | Existing component |
|---|---|
| Task filter pills (:2159–2163) | The tab-chip pattern already used for Administrasjon tabs / Undersøkelser filters (`docs/RESPONSIVE.md` § "Tab rails and chip groups") |
| Task stat tiles (:2166–2172) | The Oversikt stat cards |
| Målgrupper group cards (:2434–2445) | The Bibliotek template cards |
| Live setting toggles (:6136+) | The switch used on Administrasjon → Alternativer (46×26, per CLAUDE.md tokens) |
| Integrasjon rows (:2670+) | The Brukere table row + status chip |
| Admin tabs, now eight (:4889) | `app/(app)/administrasjon/AdminTabs.tsx` — already wraps per RESPONSIVE.md |
| Innsikt sub-tabs (:5280) | Same tab-chip pattern |
| Attributed-results table (:3607–3640) | The Rapporter table |

**The header change** (00-diff §A.10) touches `components/AppHeader.tsx`,
`components/AppNav.tsx`, `components/MobileNav.tsx` and `components/UserMenu.tsx`. It is
small and it is not optional: the visible name goes, `aria-label` gains the name,
`title` is added, and the role line moves into the dropdown (:195, :199–200).

### QUIZ_TILES — a token decision, not a detail

`QUIZ_TILES` :4084–4089 introduces `#F26B21`, `#2F6FB0`, `#2F7D4F`, `#B0343C` with
`fg:"#FFFDF6"`. None is in the theme. CLAUDE.md's token list is
`--ac #F5C64A · --ac2 #A8D5D2 · --ac3 #FBD5C4 · --sbg #FBEBBE · --sbg2 #F6EEDD` and the
rule is that **tokens never change across breakpoints**; the spirit is that they do not
change across surfaces either.

Three honest readings, and this is Tor's call:

1. **They are new tokens** — a fifth accent family for a quiz answer-tile role, added to
   the theme and to `tailwind.config.ts` as `--qz1…--qz4`. Defensible: they are functional
   (four visually distinct answer positions), they are not decorative, and the existing
   accents are too close in value to distinguish under projection.
2. **They are a deviation** — used only inside quiz, logged in `docs/DEVIATIONS.md`, not
   added to the theme, and never reachable from any other surface.
3. **They are wrong and quiz uses the existing accents** — `--ac`, `--ac2`, `--ac3`, `--sbg`.
   This is the only reading that keeps one token set, and it is the one I would argue
   against: those four have near-identical luminance and would be indistinguishable at the
   back of a room, which is the entire use case.

I recommend (1) with the role named in the theme, because (2) produces a hard-coded hex in
a component, which is what the token system exists to prevent. But it is a decision, and it
must be taken before the quiz phase, not during it.

Note also `QUIZ_DK` :4090 — a "don't know" icon path — and that the tiles are reached
through `respondOne.quizTiles`, i.e. they land on the **respondent** surface, which is
pixel-perfect mobile-first. The contrast pairing (`#FFFDF6` on `#F26B21`) should be
measured, not assumed; `#F26B21` with off-white is around 3:1, which fails AA for body
text and passes for large text only.

### Three highest-risk items

1. **The nav restructure (00-diff §A.1).** Every screen's header changes, `MobileNav`'s
   slide-over gains a group with sub-items, and the active-state derivation in
   `AppNav.tsx:20-26` (which maps pathname → key) has to learn that `/dashboard` and
   `/rapporter` both light "insight". Small diff, touches every page, easy to half-do.
2. **The dark projected surface.** The theme has no dark mode and no dark tokens. Building
   one screen's worth of inverted colours by hand is how a second, undocumented palette
   gets born.
3. **The box-sizing/`max-width` hardening (00-diff §A.10).** 42 controls. The app solved
   the same class differently, via `docs/RESPONSIVE.md`. This is a fidelity *check*, and
   the risk is that it gets treated as a rebuild and quietly changes desktop.

### What I think is a mistake

Drawing the live stage as an in-app screen with the normal header above it (:1829, inside
the same shell). A projected surface needs to be a full-bleed route with no chrome, no
nav, and no user avatar — the presenter's email address should not be on the wall. As
drawn it is a screen inside the app; as used it is a projector output. Those are different
components.

### One thing another expert will get wrong

The verification engineer will plan a screenshot diff for the live screen. There is no
reference PNG for it (`artifacts/reference/` has 26 files, none live), and there is no
viewport in `playwright.config.ts` for a projector. A green visual gate on that screen will
mean the screen was captured, not that it was right.

---

## Brief 4 — Responsive reviewer

Every surface against `docs/RESPONSIVE.md`, naming the pattern.

| Surface | RESPONSIVE.md pattern | Covered? |
|---|---|---|
| Nav restructure to five items incl. a group | § App shell / header — slide-over below `md` | **Partly.** The pattern covers nav items moving into the panel; it does not cover a nav item that is a *group with sub-items*. The Innsikt group needs either two flat entries in the panel or a disclosure. **Not covered → stop-and-ask.** |
| Header avatar-only button | § App shell / header | Covered. Note the 38×38 button (:195) needs the ≥44px hit area per global rule 2 — transparent padding, painted size unchanged. |
| Oppgaver — filter pills | § Tab rails and chip groups — wrap to multiple rows | Covered. |
| Oppgaver — stat tiles | The bundle already uses `repeat(auto-fit,minmax(180px,1fr))` (:2166) | Covered by the design's own grid; no pattern needed. |
| Oppgaver — task cards | § Data tables → wide rows become cards | **Already cards.** But `stepChips` is six chips in a row (:2197); below `md` they wrap, and the row gap must satisfy global rule 2's non-overlap requirement. Covered. |
| Målgrupper — populasjoner | `repeat(auto-fit,minmax(240px,1fr))` (:2411) | Covered. |
| Målgrupper — grupper | `repeat(auto-fill,minmax(280px,1fr))` (:2432) | Covered. |
| Målgrupper — segmenter | § Data tables. Four fields + a monospace rule → **wide row → card**. | Covered, with one caveat: the rule is monospace and long (:4320). In a card it wraps; it must not be truncated to unreadability. |
| Integrasjoner — 15 rows in 5 groups | § Data tables → wide rows → cards | Covered. |
| Admin tabs, now eight | § Tab rails → wrap | Covered. `AdminTabs.tsx` already wraps. |
| Innsikt sub-tabs | § Tab rails | Covered. |
| Attributed-results table | § Data tables | Covered. |
| Del B — panel library / customise | § Modals and the wizard → full-screen sheet below `md` | Covered. |
| Del B — stream panel | § Charts — aspect ratio, min-height 200px, legend below | Covered. |
| Quiz tiles on the respondent surface | Respondent surfaces are **mobile-first pixel-perfect**, not RESPONSIVE.md | Covered by the design itself — the bundle draws the tiles. |
| Help centre | § Data tables for the article list; article body is prose | Covered. |
| Send screen changes | § Send screen | Covered. |
| **Live mode — projected stage** | **Nothing.** | **NOT COVERED → stop-and-ask.** |

### The uncovered cases, listed as the instruction asks

1. **The projected live surface itself.** RESPONSIVE.md has three breakpoints — desktop
   ≥1280 pixel-perfect, tablet 768–1279, mobile <768 — and a projector is none of them. A
   1920×1080 projection at 4m viewing distance has a *smaller* effective angular resolution
   than a laptop at 60cm, so "desktop, but bigger" is wrong: type must scale with viewing
   distance, not with pixels. There is no rule for this. **Stop and ask.**
2. **The live stage's dark surface at any breakpoint.** Global rule 3 says tokens never
   change across breakpoints. It does not say what happens when a surface inverts. There
   are no dark tokens.
3. **A nav item that is a group** (above).
4. **The QR code's minimum physical size.** :1852 draws 132×132px. At projection that is a
   scan target whose size depends on the room, not the viewport. Not a responsive rule this
   file can express.
5. **The presenter's own device.** Is the live *control* surface (reveal button :1838,
   settings) used on a phone while the stage is on a projector? The bundle draws one
   screen containing both. Two surfaces on two devices is a product question with a
   responsive consequence.
6. **Audience questions on the projected screen** (:1906) — arbitrary user text at display
   size with no length limit in the design. Overflow behaviour is undefined.

Items 1–3 are blockers for the live phase. 4–6 should be answered in the same decision
batch.

### Three highest-risk items

1. Live is a whole viewport class this specification has never covered, and CLAUDE.md's
   relaxation of "do not invent" extends **only** to the patterns in RESPONSIVE.md.
   Anything else is a stop-and-ask, so the live phase cannot start with the file as it is.
2. The 44px hit area on the new 38×38 header button, and on the six step chips — both are
   the systemic-fix class RESPONSIVE.md warns about (global rule 2: implement once).
3. The box-sizing hardening (00-diff §A.10) intersects RESPONSIVE.md's "no horizontal
   scroll at 390px" blocker. The bundle's fix and the app's fix are different mechanisms;
   applying both without checking is how desktop drifts.

### What I think is a mistake

`liveStage` is rendered inside the app shell (:1829) with the standard header. If the
answer to uncovered case 5 is "the stage is a separate route", most of items 1–4 become
tractable, because a chrome-free route can have its own type scale without touching the
app's breakpoints. If the answer is "one screen", RESPONSIVE.md has to grow a fourth
breakpoint class, and that is a change to a frozen specification.

### One thing another expert will get wrong

The database architect will treat `hasThresholdWarn` as a build-time warning and not notice
that its rendering (:2561) sits inside the builder's right pane, which below `xl` becomes a
sheet (§ Three-pane Builder). A warning that only exists behind a closed sheet is not a
warning.

---

## Brief 5 — Verification engineer

### Gates per surface

`VERIFY.md` has seven gates. 5a3 is `npm run verify:policy` →
`scripts/verify/policy-coverage.ts`, which derives its surface list from the **database
catalog** — every RLS-enabled `public` table and every SECURITY DEFINER function in
`public` — and checks each twice: PROTECTED (measured by actually attempting access as
`anon` and as another org's member) and GUARDED (some file under `tests/` names it).

Current numbers, which may only move up: **55 of 71 surfaces actively checked**;
**18 files / 392 tests** in `tests/expected-counts.json` (sums to 392).

| Surface | Gate 3a (design compare) | Gate 3e (mobile) | 5a3 | Census delta |
|---|---|---|---|---|
| Nav restructure | Every existing screenshot re-taken | Every route | — | 0 |
| Oppgaver | New reference PNG needed | RESPONSIVE.md rules | `tasks`, `task_effect_assessments` + each definer fn | +1 file, ~20 tests |
| Målgrupper (groups/segments) | New reference PNG | rules | `audiences` and/or extended `groups` | +1 file, ~15 |
| Suppression | Part of Send/Brukere | rules | `suppressions` | +~8 to an existing file |
| Live | **No reference exists and no viewport exists** | **uncovered** | `live_sessions`, `live_audience_questions` + definer fns | +1 file, ~15 |
| Quiz | New reference PNG (respondent = pixel-perfect bar) | mobile-first pixel-perfect | `quiz_attempts` + `quiz_leaderboard` | +1 file, ~15 |
| Del B panels/stream | New reference PNG | § Charts | panel/layout tables + `stream_window` | +1 file, ~12 |
| D87 surfaces (builder panel, attributed table, Personvern controls) | New reference PNGs | rules | **no new surfaces** — the RPCs exist and are already guarded | +~10 to `threshold-policy` / `attributed-results` |
| Help centre | New reference PNG | rules | `help_articles` (public-by-design, needs an allowlist reason) | +~5 |
| Integrasjoner / API / webhooks | deferred | deferred | large; specified in that phase | deferred |

### The important part: which surfaces NO CURRENT FIXTURE REACHES

`tests/db/factories.ts` can create an org with N members, a survey with questions, a round
with invitations, and submit K responses **through `submit_response`** (VERIFY.md one-time
setup §5). `scripts/seed-demo.ts` produces the demo org. Between them, here is what
**cannot be produced today**:

1. **A task at any lifecycle step.** No table, so no fixture, so the entire six-step
   machine and the close guard are unreachable by the suite until the schema exists. This
   is fine *provided* the phase that creates the table creates the fixture in the same
   phase — CLAUDE.md's rule that a phase introducing a screen with no seedable state
   extends the demo seed in that phase.
2. **A below-threshold finding that produces a task.** Even with a task table, the fixture
   has to arrange n=4 in one group and n≥5 elsewhere and then assert what the task does
   **and does not** contain. There is no factory for "a gated cell".
3. **A live session.** No table, no fixture, no viewport, no reference PNG. Three separate
   gaps, and the third one means a Gate 3a "pass" for live would be meaningless.
4. **A quiz attempt, a pass mark, a failed attempt, a certificate.** None exist.
5. **An audience with counts before send.** `hasThresholdWarn` (:4988) fires on a
   pre-send audience. Factories build invitations *at* send. Nothing builds an audience
   that has a count and no round yet.
6. **A frozen segment.** The freeze-per-round behaviour (00-diff §A.5, bundle :5033) needs
   a fixture that changes a segment's membership *after* a round is sent and asserts the
   round's denominator did not move. This is the single most likely place for a silent
   defect, because nothing errors.
7. **A mixed-population send.** No population, so no fixture for the refusal.
8. **A suppressed address surviving a re-import.** Import tests exist
   (`tests/unit/import.test.ts`, 15) but they are unit tests over parsing, not database
   tests over suppression.

**Why this list matters more than usual.** The instruction records that V1-6 shipped a
defect behind a green visual diff because no fixture produced a gated multi-round trend.
That report is not in this repo (00-diff §0.2), so I cannot cite it — but the *mechanism*
is visible here anyway: `tests/invariants/k-surface.test.ts` (35 tests) proves the gate
returns `insufficient_data` at n=4 and data at n=5, which is exactly the one-sided-test
trap VERIFY.md warns about being avoided; it does **not** prove that a screen which never
had a gated fixture renders the gated state correctly. Live, quiz, tasks and Målgrupper are
**whole screens with no seedable state today**.

### Limits the apparatus cannot close, to be logged rather than built around

The apparatus is frozen (CLAUDE.md): seven gates, 5a3, the census, the allowlist. So these
get logged as limits:

- **5a3 proves a denial test exists, not that its scope is right.** `VERIFY.md`'s own
  closing note records `ui_messages` being cross-tenant for six phases behind a green 5a3.
  Every new table below inherits that limit.
- **No gate can see the live timing leak** (Brief 2(ii)). It is a property of a sequence
  observed by a human. Log it; do not invent a gate.
- **No gate can see what a task's `source` string discloses.** A string containing "under
  terskel" passes every check in this repository. The only control is that the string is
  *not constructed* that way — which is a schema and code-review matter, and should be
  asserted by a test that reads the produced task and fails on a group name appearing in
  it.
- **Screenshot diff against a design that does not exist.** For live, and for any surface
  whose reference PNG cannot be captured from the bundle, Gate 3a degrades to "captured and
  looked at". Say so in the phase report rather than reporting a comparison.

### Three highest-risk items

1. Four whole screens with no seedable state. If any of them ships without its fixture in
   the same phase, the phase's green is uninformative.
2. The frozen-segment behaviour: no error, no visible symptom, wrong numbers.
3. `verify:reference` drives the **old** bundle — `scripts/verify/reference.ts:21`
   (`const DESIGN = 'design-reference/…/HeiTuva.dc.html'`) and `:27` for the splash.
   Pointing it at v2 re-captures all **26** PNGs in `artifacts/reference/` and will make
   every existing Gate 3a diff go red at once — which is correct and necessary, and must
   be scheduled as its own step, not discovered mid-phase.

### What I think is a mistake

Planning a screenshot gate for live mode at all. Better to state in the phase's definition
of done that live has **no reference comparison**, and to spend the gate budget on the
counter's behaviour instead — a Playwright test that submits responses one at a time and
asserts what the projected DOM shows at n = k−1 and n = k.

### One thing another expert will get wrong

The product reviewer will fold the D87 surfaces (builder policy panel, attributed table,
Personvern controls) into the phases that need them, on the reasoning that they are small.
They are small *in code* and they touch the k kernel, so each one carries the two-sided
`k_for` assertion and each one needs the n=k−1/n=k pair. Small diff, full gate cost.

---

## Brief 6 — Product / scope reviewer

### What supersedes what

| New | Supersedes / collides with | Verdict |
|---|---|---|
| **Oppgaver** | `loop_actions` (`…0006_compliance_reports.sql:116`), surfaced on Oversikt | **Supersedes.** `loop_actions` is `{text, owner, due, done}`; Oppgaver is a statutory register with kind, hjemmel, source and a guarded six-step lifecycle. Migrate the rows (`text` → `title`, `done` → `Lukket`) and retire the old surface. Do **not** run both. |
| **Consolidated import** | **Q9** — "CSV/Excel/paste real in v1; Entra ID, Google Workspace, HR-systems as stubs behind the same UI (kommer)" | **Relocates, does not cancel.** v2 removes `isPasteImport`/`isSyncImport` from Send and points sync at Målgrupper (:3040). Q9's decision survives; its *placement* changes. Q9 should be amended rather than left to look violated. |
| **Bruksområder page + `USE_CASES`** | Nothing in this repo — there is no use-case registry (00-diff §B.24) | **New.** And the instruction's premise that a six-row registry already exists is false here. The nine cards on the marketing page are survey *types* (packs), not the six categories; see 00-diff §A.12. |
| **BankID / ID-porten** (:5215) | **Q4** — "Tokenized email links only in v1", `identity_provider` reserved, duty signing audit-grade not qualified | **Reopens a deferred decision.** Deferred phase. Note the reserved column means the schema is ready and the *legal meaning* is not. |
| **Integrasjoner** | **R3/R4** (not in this repo), **Q9** stubs, **Q6** provider posture, **Q7** data-leaving-Supabase posture | **Deferred phase, and partly catalogue-blocked.** |
| **Innsikt nav group** | The app's five-item nav (`AppHeader.tsx:19-24`) | **Supersedes.** Dashboard and Rapporter keep their routes and lose their top-level slots. |
| **Admin → Profil og avsender** | The **Q17** lock, not profile settings (`brandLocked` :4830) | **Extends Q17.** This tab is a policy surface wearing a branding costume. |
| **Målgrupper** | `public.groups` + Administrasjon → Grupper | **Extends and partly supersedes.** Groups stay; they gain a population, a source and a kind. Segments are new. |
| **Suppression / member state** | `org_members.status` (`invited/active/inactive`), `survey_invitations.bounced_at` | **Extends.** Different vocabulary for a partly overlapping idea; needs a mapping decision, not a parallel column. |
| **Live / Quiz** | Nothing | **New product areas.** See Brief 7. |
| **Help centre** | Nothing. `ui_messages` is the nearest home for the copy. | **New**, and the forum inside it is a different thing from the articles. |
| **Five new packs** | `template_packs` seed | **Additive.** Cheapest item in the bundle. |
| **The nine D87 surfaces** | `docs/DEVIATIONS.md:1622` — refused in Phase 9 for want of a bundle | **Unblocked.** This is not new scope; it is decided scope that can finally be drawn. |

### What I would sequence first, and why

The D87 surfaces. They are the only part of this bundle that closes an open commitment
rather than opening one, the kernel is already built and tested
(`…0032`, `…0034`, `tests/invariants/threshold-policy.test.ts` 11 tests,
`tests/invariants/attributed-results.test.ts` 15 tests), and D87 explicitly records that
the Personvern server actions were left unwritten *because there was no caller*. There is a
caller now. Doing this first also settles the k-display question everywhere before three
new surfaces start reading it.

### Three highest-risk items

1. **Oppgaver's source.** As a product, a statutory task register with hjemmel is the most
   valuable thing in this bundle — it is what makes HeiTuva a compliance product rather
   than a survey tool. Its most-drawn source is the one the security reviewer says cannot
   ship as drawn. If that argument holds, the feature is still worth building; what
   changes is the copy on three screens and the webhook. Deciding that late is expensive.
2. **Scope inflation via Målgrupper.** It reads like a grouping feature and is a
   processing-basis model. Half of it is catalogue-blocked. Building the half that is not,
   and calling it done, produces a screen that promises population separation it cannot
   enforce.
3. **The bundle markets what does not exist.** "Ni undersøkelser" (Bruksområder :51) and
   fifteen integrations on a public-adjacent page, when integrations are deferred, is the
   same class of problem as Q11's splash fix (D73 — the splash claimed four languages and
   was corrected to two). Whatever ships publicly must be true.

### What I think is a mistake

Drawing Integrasjoner as a *settings tab with connect buttons*. Fifteen systems with
per-field disclosure, five levels and two "Lovpålagt" entries is a product surface with a
DPA behind each row. A tab with toggles makes it look like a feature that is nearly done.

### One thing another expert will get wrong

The security reviewer will treat Målgrupper's population separation as a rule to enforce in
`send_round` and stop there. It is also a **retention** rule (`popRows` :5037–5042 carries
"24 mnd", "5 år", "12 mnd" per population) and `app.apply_retention` currently has no
population input. Enforcing the send guard while retention stays global gives the screen a
promise the data lifecycle does not keep.

---

## Brief 7 — Scope-split reviewer (mandatory)

### This bundle is not one plan

Three things drawn here are each larger than any phase this project has run, and one of
them is not a build at all.

**Programs, not phases:**

1. **The public API and webhooks.** Six events (:5243–5249), an API key surface (:2695).
   Building it means: key issuance and hashed storage, scopes, rotation, rate limiting, a
   delivery queue with retries and dead-lettering, request signing, a subscription model,
   versioning, and public documentation. It also means a support obligation: an API you can
   break is different from a UI you can change. And `threshold.breached` cannot be
   specified at all until Brief 2(i) is settled. **Its own program. Placed last, per the
   instruction, and not started without Tor's go-ahead.**

2. **Fifteen integrations.** Five groups, per-field disclosure, three new data categories
   (health, gender, salary), one identity decision (BankID/Q4), one export that probably
   cannot honour the k-gate (Power BI), and one that is R4 and not in this repo (CRM).
   Each needs a lawful basis, a DPA clause and a customer-facing description. This is a
   multi-quarter commercial and legal program with an engineering component, not an
   engineering project with a legal component. **Same final phase, and the phase's real
   output is the risk register and the order, not connectors.**

3. **A live presentation engine.** Real-time state, a projector surface with no design
   precedent in the theme, a viewport class RESPONSIVE.md does not cover (Brief 4), a
   moderation queue, UGC with votes, a timing-leak problem no gate can see (Brief 2(ii)),
   and a quiz sub-product layered on top with assessment semantics (Brief 2(iii)). Mentimeter
   is a company, not a feature. **Its own program.**

### What belongs in a v2 build

In dependency order, and each small enough for one verification pass and one fix pass:

- The **D87 nine** — decided scope, kernel built, now drawable.
- The **nav restructure and the fidelity check on existing screens** (00-diff §A.1, §A.10).
- **Data-not-code additions**: five packs, the six-row use-case registry, help articles.
- **Oppgaver**, without the from-findings source until Brief 2(i) is answered.
- **Målgrupper**, groups-and-segments only; populations wait for the catalogue.
- **Suppression and member state** — small, legally required (art. 21), overdue.
- **The send guard** as a database refusal, once populations exist.
- **Bruksområder** as a public page, once the missing fourth page question is resolved.

### What becomes its own program with its own decisions

- Live mode (including the word cloud and audience questions).
- Quiz (including certificates, pass marks and attempts).
- Integrasjoner + public API + webhooks — one program, one final phase, per the standing
  scope decision.

### What should not be built at all — my recommendation, and it is a recommendation

1. **`threshold.breached` as a webhook.** Whatever shape the from-findings task takes, an
   outbound event that fires on a sub-threshold finding exports the disclosure past every
   control the product has. If the task itself can be made safe, the *task* can be exported
   via `task.created`. The threshold event adds nothing but the leak.
2. **`helpForum`.** A support forum is a community product: moderation staffing, spam,
   harassment, retention, and a takedown process. HeiTuva has articles (twelve, good ones)
   and a contact form (`helpContact`, `contactSent` :5159). The forum tab is one string in
   the bundle and a permanent operational obligation. Ship articles + contact; drop the
   forum, or buy one.
3. **`audienceQuestions` on the projected screen.** Same reasoning at higher stakes: it is
   public UGC displayed to colleagues in a room, in a product whose other surfaces promise
   anonymity, in a company that may have an aml. kap. 2A obligation the moment someone
   types the wrong thing. It defaults off (:4338) — leave it off, and if live is built,
   ship without it.
4. **Sykefravær correlation** (`fravar`, :5209) — as a *product feature*. Correlating
   health data against psychosocial risk per unit is the single highest-consequence row in
   the integration table and the units are small enough to identify people. If a customer
   wants it, that is a bespoke conversation with a DPIA, not a connect button.

### Three highest-risk items

1. Planning the API, the integrations and live as *phases* in one plan. That is exactly how
   a bundle build becomes a program without anyone deciding to start one — which is why
   this brief was commissioned.
2. Building any earlier phase against something the deferred phase would deliver. The
   standing rule is explicit: Målgrupper's Entra/CSV source field, sender verification and
   supplier org-number lookup are planned against **manual or CSV input**, with the
   integration named as a later enhancement.
3. The catalogue dependency (00-diff §0.1) plus the missing v1 leg (§0.2). Two unknowns
   under the same plan.

### What I think is a mistake

Treating the deferred final phase as a placeholder. It has to be written as a real phase —
which integrations, in what order, what each reads, its lawful basis, its DPA consequence,
and what must be true before any of it starts — or it will be read as "we'll get to it",
and the first customer who asks for HR sync will get a yes.

### One thing another expert will get wrong

The frontend architect will cost Live as "one screen plus a projector view". The screen is
the cheapest part. The expensive parts are real-time state, the moderation queue, the UGC
lifecycle, and a viewport class that requires changing a frozen specification.
