# 04 — Decisions (Round 3)

Decision lines for `DECISIONS.md`, each confirmable in one line. **Anything the bundle
implies but never states is a decision** and appears here rather than being chosen quietly
during a phase.

**On numbering.** The instruction asked for lines "from Q52". `DECISIONS.md` in this
repository contains **Q1–Q17** (00-diff §0.2), so these continue from the real register at
**Q18**. If the missing round arrives and renumbers, these move as a block; the content
does not change.

**Count: 33 decisions, Q18–Q50. Eighteen touch the security core** — marked **●**
(**●●** where the whole phase hangs on it). A security-core decision is one that changes
what the k-gate, the anonymity invariant, the role model, the single-write-path rule or the
lawful-basis model does. Those cannot be taken during a phase; they are taken in the batch
that precedes it.

---

## The batch order

One batch per phase, taken **before** the phase starts. A phase whose batch is unanswered
does not begin.

| Batch | Before phase | Decisions | Of which security-core |
|---|---|---|---|
| **A** | V2-0 | Q39●, Q40, Q41, Q46 | 1 |
| **B** | V2-1 | Q20●, Q21● | 2 |
| **C** | V2-3 | Q27●, Q50 | 1 |
| **D** | V2-4 | Q37, Q38● | 1 |
| **E** | V2-5 | Q30, Q34●, Q35, Q36, Q48● | 2 |
| **F** | V2-6 | Q31, Q47● | 1 |
| **G** | V2-7 | **Q18●●**, Q19● | 2 |
| **H** | V2-9 | Q32, Q33 | 0 |
| **I** | V2-10 | Q24●●, Q25●, Q26●, Q28, Q29 | 3 |
| **J** | V2-11 | Q22, Q23●●, Q49● | 2 |
| **K** | V2-12 | Q42●, Q43●, Q44●, Q45 | 3 |
| | | **33** | **18** |

Batch **G** is the one to take early even though its phase is seventh: Q18 shapes three
phases and the final phase depends on it. Batch **A** is four lines and unblocks
everything.

---

## Decisions

### Batch A — before V2-0

**Q39 ●** — *The splash and legal pages still promise a categorical five.*
`HeiTuva Splash.dc.html:375` (`n ≥ 5`), `:489`, `:571`; `legal.privacy3P`, `legal.dpa4P`.
Q17 made k a per-survey policy with a floor of 3, so these sentences are no longer
categorically true. D87 flagged them to Tor and they are still flagged.
**Proposed:** rewrite to the guarantee that is actually true ("aldri under virksomhetens
terskel, minst tre") on the splash and in the legal texts. *Confirm: rewrite / keep and
accept the inaccuracy / different wording you supply.*

**Q40** — *Innsikt as a nav group.* The bundle collapses Dashboard and Rapporter into one
nav item with two sub-tabs (:4790, :5280, :4487). `docs/RESPONSIVE.md` § App shell does not
cover a nav item that is a group, so the mobile slide-over treatment is a stop-and-ask.
**Proposed:** adopt the restructure; in the slide-over, render the two sub-items as two
flat entries under a group label (no disclosure), which needs no new pattern.
*Confirm: two flat entries / a disclosure / keep five flat items and reject the grouping.*

**Q41** — *When the reference PNGs are re-captured.* Repointing `scripts/verify/reference.ts:21`
at `design-reference-v2/` turns every existing Gate 3a comparison red at once.
**Proposed:** do it as V2-0's first step, as one commit, with the diffs triaged into
"fixed in V2-0" and "logged for the phase that owns that screen".
*Confirm: yes / re-capture per phase instead.*

**Q46** — *Is the missing round arriving?* This repo has no `docs/v1/`, no V1-0…V1-6
reports, no `/design-reference-v1/`, no decisions past Q17 and no deviations past D88, and
the arithmetic says the instruction's 4901-line baseline never landed here (00-diff §0.2).
**Proposed:** treat this plan's baseline as `design-reference/` at 4097 lines and proceed.
*Confirm: proceed / the missing work is coming and this plan waits for it.*

### Batch B — before V2-1

**Q20 ●** — *Verneombud: a fourth role, or a duty capacity?* The bundle says "Fire roller"
(:4279) and gives verneombud its own role (:4283, :5100, :5131). CLAUDE.md and
`app.member_role` define three.
**Proposed:** **not a role — a duty capacity.** `duty_signers` already records who signs;
a verneombud is a `leser` who signs statutory duties. Correct the copy to say so. Keeps the
role model, which is a security surface, at three.
*Confirm: duty capacity (recommended) / a real fourth role in `app.member_role` / copy only.*

**Q21 ●** — *A per-topic automatic threshold of 8.* `orgSensitiveChips` :5587 and
`orgThresholdNote` :5591: "Kartlegging av trakassering, varsling og helse settes
**automatisk** til 8." Q17 defines a default, a floor and a lock — not a topic escalation.
**Proposed:** adopt it **as a pack property** — sensitive statutory packs carry 8 in their
seeded `policy`, applied by the existing `app.apply_pack_policy`. A seed change, no DDL,
and it cannot be got wrong by classifying a topic at runtime.
*Confirm: pack property (recommended) / a second org-level default as drawn / reject.*


### Batch C — before V2-3

**Q27 ●** — *`helpForum`: build a forum, or ship articles and contact only?* :5086 puts a
forum tab beside the articles, and :2091 writes its promise — "HR-folk, verneombud og
innkjøpere deler maler, formuleringer og erfaringer. **Skriv med fullt navn eller
anonymt.**" That is an unmoderated anonymous posting surface inside a product whose selling
point is a *controlled* anonymity guarantee, and a community product carries a permanent
operational obligation: moderation staffing, spam, harassment, retention and takedown.
**Proposed:** **not built.** Ship the twelve articles (:4177+) and `helpContact` /
`contactSent` (:5159), which are the useful part and are ordinary content work. If a
community is wanted, buy one rather than building one behind a tab.
*Confirm: articles and contact only (recommended) / build the forum with named posting only /
build it as drawn, anonymous posting included.*

**Q50** — *Where help articles live.* Twelve articles (:4177+) with steps, a mock screen, a
caption and related links.
**Proposed:** a `help_articles` registry table with a `jsonb` body plus translations —
data-not-code, like `report_section_types`; `ui_messages` is for strings, not structured
documents. Add it to 5a3's `PUBLIC_BY_DESIGN` allowlist **with a reason**.
*Confirm: registry table (recommended) / `ui_messages` / MDX files in the repo.*

### Batch D — before V2-4

**Q37** — *Member status vocabulary.* The bundle uses Aktiv / Bounce / Reservert / Ny
(:4327–4335); `org_members.status` is `invited/active/inactive` (`…0002_tenancy.sql:43`)
and bounce lives on `survey_invitations.bounced_at`.
**Proposed:** map rather than duplicate — `invited → Ny`, `active → Aktiv`,
`inactive → (hidden)`; `Bounce` derived from the latest invitation's `bounced_at`;
`Reservert` derived from `suppressions`. No new status column.
*Confirm: derive (recommended) / a new enum matching the bundle exactly.*

**Q38 ●** — *Suppression scope.* Is "har sagt nei til undersøkelser" (:4332) an objection to
**all** surveys from the organisation, or per population / per survey type? The bundle's
own reasons differ: "Avmeldt kundeundersøkelser" vs "Reservert av personen selv" (:5014).
**Proposed:** org-wide by default, with an optional population scope once populations
exist; GDPR art. 21 objection is to *processing*, so the default must be the broad one.
*Confirm: org-wide default (recommended) / per population from the start / per survey.*

### Batch E — before V2-5

**Q30** — *Q9 amendment: sync sources move from Send to Målgrupper.* The bundle removes
`isPasteImport`/`isSyncImport` and points sync at Målgrupper (:3040); Send keeps a one-off
list (:3020) with "Lagre som målgruppe" (:3037).
**Proposed:** amend Q9 — substance unchanged (CSV/Excel/paste real, sync stubbed behind
`feature_flags`), location changed. Record it as an amendment so the register does not read
as drift.
*Confirm: amend Q9 / keep sync stubs on Send as Q9 originally placed them.*

**Q34 ●** — *Populations depend on the expansion catalogue.* `popRows` :5037–5042 is the
R3 contacts/accounts entity and carries a **lawful basis** per population.
**Proposed:** V2-5 ships **groups and segments only**; the Populasjoner section renders the
design's unavailable state, never fabricated counts (CLAUDE.md: never fabricate data in the
UI). Populations land when the catalogue does.
*Confirm: split as proposed / wait for the catalogue and ship Målgrupper whole / invent a
population model here.*

**Q35** — *Retention per population.* `popRows` carries "24 mnd", "5 år", "12 mnd";
`app.apply_retention` has one global path.
**Proposed:** retention becomes population-driven **in the same phase as populations**, not
before — enforcing the send guard while retention stays global gives the screen a promise
the lifecycle does not keep (02-conflicts §B7).
*Confirm: together (recommended) / retention first / leave retention global.*

**Q36** — *Segment freeze semantics.* `auditRows` :5033 — "312 treff · frosset for Ukespuls
36". A self-updating segment re-evaluated after send would retroactively change a round's
denominator, every participation rate and every k computation over that round.
**Proposed:** membership is **materialised at send** into `round_audience_members` and
never re-evaluated for that round. Changing a rule marks the history, as the design says.
*Confirm: materialise at send (recommended) / live join with a snapshot for reporting only.*

**Q48 ●** — *The mixed-population send guard belongs in the database.*
`audBlocked = audPops.length > 1` :4829 → button disabled :6620–6621, handler returns early
:6624, copy :6551 ("ulikt behandlingsgrunnlag"). A legal-basis rule whose only enforcement
is `cursor:not-allowed` is not enforced.
**Proposed:** `send_round` refuses a round spanning more than one population — but this
needs populations, so it lands with Q34, not before.
*Confirm: in `send_round` with populations (recommended) / keep the UI guard and accept it.*

### Batch F — before V2-6

**Q31** — *Oppgaver supersedes `loop_actions`.* `loop_actions`
(`…0006_compliance_reports.sql:116`) is `{text, owner_member_id, due_at, done}`; Oppgaver is
a statutory register with kind, hjemmel, source and a guarded six-step lifecycle.
**Proposed:** migrate (`text → title`, `done → Lukket`), retire the Oversikt surface, do not
run both.
*Confirm: migrate and retire (recommended) / keep both / drop `loop_actions` rows.*

**Q47 ●** — *Test mode.* The bundle short-circuits submission in the client at :4577.
Server-side, a test must not write a response, must not consume a token and must not set
`responded_at` — otherwise a "test" silently marks a real invitation answered.
**Proposed:** a dry-run flag on `submit_response` that runs every validation and returns
without inserting, asserted by a negative test that the response count did not move.
*Confirm: dry-run in the RPC (recommended) / a separate preview path that never reaches the
RPC / no test mode.*

### Batch G — before V2-7 (take this one early)

**Q18 ●● — the first decision of the plan.** *What may a task created from a below-threshold
finding contain?* The bundle says a finding under the threshold becomes a task
automatically, with source and hjemmel visible (:4239, :4270), and ships one whose source
reads "Psykososial kartlegging · under terskel" with `law: "aml. § 4-3 (3)"` (:4168). A
task naming a source, a group and a legal basis discloses that a specific sub-threshold
group scored badly — which is what k exists to prevent. The duty is real (aml. § 4-3 (3)
does not pause below five answers); the payload is the question.
**Proposed:** **the duty, not the finding.** The task states that an undersøkelsesplikt is
triggered *for the survey* — no group, no question, no score — and the responsible person
investigates offline. The duty is discharged; nothing is disclosed.
*Confirm: the duty only (recommended) / the finding, administrator-only and never exported /
as drawn.*
**Blocks:** V2-7 entirely, the builder's breach copy, and `task.created` in V2-12.

**Q19 ●** — *`threshold.breached` as a webhook.* :5248 — "Funn under terskel — kan utløse
undersøkelsesplikt". It carries the disclosure past every control the product has, to a
system where none of this product's RLS applies.
**Proposed:** **do not build it.** If the task itself is safe under Q18, `task.created`
already exports it; the threshold event adds only the leak.
*Confirm: do not build (recommended) / build it carrying only a survey id / build as drawn.*

### Batch H — before V2-9

**Q32** — *The missing fourth page.* `HeiTuva Splash.dc.html:1027` and `:1029` link twice to
`HeiTuva Lovpalagt.dc.html`, which the bundle does not contain.
**Proposed:** Tor supplies the page, or the two links are struck. A public page shipping
with dead links is not a fidelity pass.
*Confirm: supply the page / strike the links / link to Bruksområder instead.*

**Q33** — *Bruksområder markets nine survey types.* `HeiTuva Bruksomrader.dc.html:51`,
`ORDER` :290. The D73 precedent: a public page must not claim a capability the product does
not have.
**Proposed:** the page ships only after V2-3 seeds the packs those nine map onto.
*Confirm: gate on V2-3 (recommended) / ship earlier with the unavailable ones marked.*

### Batch I — before V2-10

**Q24 ●● — the live counter.** `liveGuard` :6147 is a true statement about a static check
and the design honours it. It does not cover the room: in a group of six the audience
watches `liveStage.counter` (:6177) go 4 → 5 and the bars appear (:1863), and everyone knows
who just submitted. No gate in this repository can see this — it is a property of a sequence
observed by a human, not of a query result. `counter` defaults **on** (:4338).
**Proposed:** default the counter **off** below the threshold, and refuse the reveal until
n ≥ k. State plainly in the phase report that this is a mitigation, not a proof.
*Confirm: counter hidden below k + reveal refused below k (recommended) / jittered counter /
as drawn, with the limitation documented / do not build live.*

**Q25 ●** — *The projected word cloud, its moderation queue, and whether `get_quotes`' rules
apply to it.* `DEFAULT_LIVE.cloud` defaults on (:4338); `cloudModeration` :6180 says three
free texts are waiting. Three sub-questions: does the queue gate every text or only flagged
ones; does the moderator thereby read individual free text (and if that moderator is a
`redaktør`, is that a new read path); and does the projected surface obey the same rule as
`get_quotes` (`…0009_rpcs.sql:176` — `leser` + a group filter is `forbidden`)?
**Proposed:** the queue gates **every** text; moderation is an administrator action; the
projected read path goes through the **same** rules as `get_quotes`, not a second answer;
and the cloud gets its own minimum-occurrence floor (a rare word from one respondent is a
quote with the grammar removed) — a number that is **not** k.
*Confirm: as proposed / different answers per sub-question / no cloud.*

**Q26 ●** — *`audienceQuestions` on the projected screen.* :6183, rendered :1906; defaults
**off** (:4338). Public UGC displayed to colleagues in a room, in a product that promises
anonymity elsewhere. A question can name a person, can be harassment, or can be an
aml. kap. 2A disclosure read aloud to the department — the opposite of what kap. 2A
requires.
**Proposed:** **not built.** Live ships with it off and unimplemented. Reopen as its own
decision with a moderation design if it is wanted.
*Confirm: not built (recommended) / built with pre-publication moderation / as drawn.*

**Q28** — *A projected viewport is a class `docs/RESPONSIVE.md` has never covered.* Three
breakpoints exist (desktop ≥1280 pixel-perfect, tablet, mobile) and a projector is none of
them; type must scale with viewing distance, not pixels. CLAUDE.md relaxes "do not invent"
**only** to that file's patterns, so live cannot start until this is answered.
**Proposed:** answer it via Q29 rather than by adding a fourth breakpoint — a chrome-free
route can carry its own type scale without touching the app's breakpoints.
*Confirm: solve via Q29 (recommended) / add a projector class to RESPONSIVE.md — a change
to a frozen specification / do not build live.*

**Q29** — *Is the live stage a separate route?* The bundle draws it inside the app shell
(:1829) with the standard header — so the presenter's avatar and the org nav go on the
wall.
**Proposed:** a **chrome-free route** for the stage, with the presenter's controls on the
app screen. This also answers Q28 and the QR-size and second-device questions Brief 4
raised.
*Confirm: separate route (recommended) / one screen as drawn.*

### Batch J — before V2-11

**Q22** — *`QUIZ_TILES` introduces four non-token colours.* :4084–4089 — `#F26B21`,
`#2F6FB0`, `#2F7D4F`, `#B0343C` — reaching the **respondent** surface via
`respondOne.quizTiles` (:4768). CLAUDE.md's token rule says tokens do not change across
breakpoints; the spirit is that they do not change across surfaces.
**Proposed:** **new named tokens** (`--qz1…--qz4`) in the theme and `tailwind.config.ts`,
with a stated role. They are functional, not decorative — the existing accents have
near-identical luminance and would not read from the back of a room. Contrast of `#FFFDF6`
on each is **measured** and recorded (`#F26B21` is ~3:1 — large text only under AA).
*Confirm: new tokens (recommended) / a logged deviation with hard-coded hexes / reuse the
existing accents.*

**Q23 ●●** — *Quiz has assessment semantics.* `certificate` (:6152), `quizPass` (:6159,
default 70), `quizTries` (:6161, default 2). An employee who fails a mandatory quiz twice
has produced an HR record. Three sub-questions: **retention** (a failed assessment is
employment documentation with a different, often longer, retention and a different art. 17
answer); **who may see an individual result** (the three roles were not designed for
performance data); and **which tables**.
**Proposed:** quiz lives in **its own tables** with its own RLS and its own retention — both
the database architect and the security reviewer reached this independently, and it is the
only answer that keeps the sentence "no anonymous row can reference a person" intact rather
than weakening it to "no anonymous row *of this kind* can". Individual results are visible
to `administrator` only; the leaderboard stays team-level as drawn (:6186).
*Confirm: own tables + administrator-only + team leaderboard (recommended) / a different
visibility rule / no certificates / do not build quiz.*

**Q49 ●** — *Two quiz refusals are UI-only today.* Quiz is locked while a survey is
anonymous (:6156–6158) and refused on statutory packs (:6122). Both are client-side early
returns.
**Proposed:** both become database refusals in `app.guard_survey_policy`, with negative
tests. A rule enforced only by a disabled control is not enforced — the same finding as
Q48.
*Confirm: in the database (recommended) / UI only.*

### Batch K — before V2-12

**Q43 ●** — *Can a Power BI / Tableau export honour `app.k_for` at all?* :5225 exports
"aggregerte resultater" outside every UI gate. A BI tool's value is slicing, and a gate that
holds for the slices the product ships does not hold for slices the customer invents.
**Proposed:** the only safe export is one already collapsed to the gated shape — and say so
publicly rather than shipping a connector that quietly breaks the guarantee.
*Confirm: gated-shape export only (recommended) / a controller-to-controller handover with
the k obligation contractually transferred / no BI export.*

**Q44 ●** — *Sykefravær correlated against risk per unit.* :5209 — health data (GDPR art. 9)
joined to psychosocial results, per unit, where a unit can be small enough to identify a
person. Art. 9(2)(b) is arguable for HSE duties but is a different basis from the rest of
the product.
**Proposed:** **not a product feature.** If a customer wants it, it is a bespoke engagement
with a DPIA, not a connect button.
*Confirm: not a product feature (recommended) / build it with a DPIA and art. 9 basis /
build it as drawn.*

**Q42 ●** — *BankID / ID-porten reopens Q4.* :5215. Q4 deferred respondent identity and
reserved `survey_invitations.identity_provider`; duty signing today is audit-grade (member +
timestamp + content hash), **not** a qualified signature. What Q4 did not decide is what a
BankID signature changes about the legal claim the product makes for a signed duty report.
**Proposed:** answer the legal question before the connector — the column is ready and the
meaning is not.
*Confirm: legal answer first (recommended) / build the connector and keep the current claim /
do not build.*

**Q45** — *The API and integrations program: go or no-go.* Fifteen systems and a public API
are each larger than any phase this project has run. Brief 7's position is that these are a
program with their own decisions, not phases in this plan.
**Proposed:** V2-12 is written as a phase (03-plan) and **not started** until Tor says so,
and until Q18, Q42, Q43, Q44 and the expansion catalogue are all settled.
*Confirm: hold until those are settled (recommended) / start a scoping program now / drop
the API.*

---

## Decisions the plan already treats as settled, recorded so they are not re-opened by accident

These came out of Rounds 1–2 with both reviewers agreeing, and are not in a batch:

- **Q3 stands.** The `minResponses` toggle (:5593) renders locked and informational, not
  switchable — the file wins on security (02-conflicts §A1).
- **Q17 stands over the bundle's copy and logic.** Five copy sites and three logic sites
  hard-code 5; all are parameterised on `app.k_for` (02-conflicts §A2, §A3).
- **Oppgaver is built without the from-findings source** until Q18 lands, so the valuable
  part does not wait on the hard decision (03-plan V2-6 / V2-7).
