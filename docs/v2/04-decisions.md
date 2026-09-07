# 04 — Decisions (Round 3)

Decision lines for `DECISIONS.md`, each confirmable in one line. **Anything the bundle
implies but never states is a decision** and appears here rather than being chosen quietly
during a phase.

**Numbering.** `DECISIONS.md` runs to **Q51**, so these begin at **Q52** — which is what the
instruction asked for. (An earlier pass numbered from Q18 on the mistaken belief that the
register ended at Q17; withdrawn.)

**Count: 38 decisions, Q52–Q89. Twenty-three touch the security core** — marked **●**, and
**●●** where a whole phase hangs on one. A security-core decision changes what the k-gate,
the anonymity invariant, the role model, the single-write-path rule or the lawful-basis
model does. Those are taken in the batch preceding their phase, never during it.

**Provenance note.** `docs/v1/04-decisions.md` became a **staging area**, not a register,
after a provenance discrepancy in V1-4's fix pass. This file is the same kind of thing:
nothing here is confirmed until it is promoted to `DECISIONS.md`, and if the two ever
disagree, `DECISIONS.md` wins.

---

## The batch order

One batch per phase, taken **before** the phase starts.

| Batch | Before phase | Decisions | Security-core |
|---|---|---|---|
| **A** | V2-0 | Q52●, Q53, Q54, Q55●, Q56 | 2 |
| **B** | V2-1 | Q57●, Q58●, Q59● | 3 |
| **C** | V2-2 | Q60●, Q61 | 1 |
| **D** | V2-3 | Q62, Q63●, Q64, Q65●, Q66●, Q67● | 4 |
| **E** | V2-4 | Q68, Q69●, Q70, Q71 | 1 |
| **F** | V2-5 | **Q72●●**, Q73● | 2 |
| **G** | V2-6 | Q74●, Q75 | 1 |
| **H** | V2-7 | Q76● | 1 |
| **I** | V2-8 | Q77 | 0 |
| **J** | V2-9 | Q78●●, Q79●, Q80●, Q81, Q82 | 3 |
| **K** | V2-10 | Q83, Q84●●, Q85● | 2 |
| **L** | V2-11 | Q86●, Q87●, Q88●, Q89 | 3 |
| | | **38** | **23** |

**Batch A is five lines and unblocks everything**; Q52 in particular, because every fidelity
question in the plan is answered against whichever bundle it names. **Batch F is worth taking
early** even though its phase is sixth: Q72 shapes V2-4's copy, V2-5 entirely, and
`task.created` in V2-11.

---

## Batch A — before V2-0

**Q52 ●** — *Does Q18's rule extend to a third bundle?*

**This is a rule about how the project reads its own history, not a preference, so the
reasoning is set out rather than a recommendation offered.**

**What Q18 actually decided.** Not "use the newest bundle". Q18 decided that **two bundles
stay, and each governs a different question**: `design-reference-v1/` is the target for every
screen a v1 phase touches, and `design-reference/` remains the reference for Phase 1–7 work
**as built** — "so a fidelity question about an untouched screen is answered against the
bundle it was built from, not against a later one that moved the frame under it." The
mechanism follows: `scripts/verify/reference.ts:21` carries both paths, `verify:reference`
renders into `artifacts/reference/` and `artifacts/reference-v1/` and **overwrites neither**,
and `design-reference-v1/README.md` says which document governs where the two diverge.

**What that rule is for.** A bundle is not a specification of the product; it is a
specification of the product *at a moment*. When a later handoff redraws a screen nobody has
touched, the screen has not become wrong — the frame moved under it. Judging it against the
new bundle would manufacture a defect out of a change of mind, and the repository would
accumulate "fidelity findings" that are really just history. Q18's answer is that fidelity is
**a question with a date on it**.

**Why a third bundle is the case Q18 was written for, not an exception to it.** v2 is the
first handoff that moves the frame under screens signed off against a *previous* handoff
rather than against the original — the hardening pass over 42 controls, the header losing its
visible name, and a fifth nav item. If v2 simply superseded v1, every screen V1-0 … V1-5
built would become answerable against a bundle it was not built from, which is the exact
outcome Q18 exists to prevent. The rule was written for two bundles because there were two;
its reason does not stop at two.

**What extending it costs, stated plainly.** A third render directory
(`artifacts/reference-v2/`) and a third path in `reference.ts`, CLAUDE.md and VERIFY.md; a
per-screen answer to "which bundle governs this?" that has to be *written down* rather than
inferred; and a re-render that turns every current Gate 3a diff red in one commit. The
alternative — v2 supersedes v1 wholesale — costs nothing today and discards the reason Q18
was confirmed. The third option, v2 governing only the screens it introduces, is tidier still
and leaves the hardening pass with no bundle authorising it, which would make it an invented
change under CLAUDE.md's do-not-invent rule.

**What follows mechanically from each answer**, so the choice is between consequences rather
than adjectives:

| | Extend to three | v2 supersedes v1 | v2 governs new screens only |
|---|---|---|---|
| Screens V1-0…V1-5 built | judged against v1, except where a v2 phase touches them | judged against v2 — new findings on signed-off work | judged against v1 |
| The 42-control hardening pass | authorised, on the screens a v2 phase touches | authorised everywhere | **unauthorised** — no bundle covers it |
| Renders | three directories | one, and the v1 renders become history | two |
| «which bundle governs this screen» | written per screen | needs no answer | written per screen |
| Q18's stated reason | preserved | discarded | preserved |

*Confirm: extend the rule to three bundles / v2 supersedes v1 wholesale / v2 governs only the
screens it introduces.*

**Blocks:** V2-0, and every fidelity question in every phase after it.

**Q53** — *How the v2 hardening pass reconciles with `docs/RESPONSIVE.md`.* v2 adds
`box-sizing:border-box;max-width:100%` to 42 controls (00-diff §A.6). The app solved the same
class through RESPONSIVE.md's patterns, and **D90** records one deliberate divergence (a 20px
gutter where the bundle draws 36px).
**Proposed:** treat it as a **check**, screen by screen — where the app's mechanism already
achieves the property, record it and change nothing; adopt the bundle's mechanism only where
the property is not already held. D90 is not reopened.
*Confirm: check-not-rebuild (recommended) / adopt the bundle's inline mechanism everywhere.*

**Q54** — *Q31's carried chip chrome.* `docs/v1/05-status.md § 2` marks Q31 PARTIAL: the
count rule is built (`app/s/[token]/page.tsx:49-62`), the chrome is not — the bundle is
11px/700 with `title` and `aria-label` carrying the language name (V1:2322); the app renders
12px/semibold with **no accessible name**, and no deviation is logged. v2 does not change the
chips.
**Proposed:** fix it in V2-0. The missing accessible name is the part that matters — a
two-letter code with no name is exactly what the bundle's `title` exists to prevent — and it
is a respondent-facing surface, which is pixel-perfect by CLAUDE.md.
*Confirm: fix in V2-0 (recommended) / log a deviation and keep the app's chrome.*

**Q55 ●** — *The splash and legal texts still promise a categorical five.* Shipped today:
`messages/no.json:1369` (`"n ≥ 5"`), `:1344`, `:1455` (pricing fine print), and — the one
that is a different kind of wrong — `:1573` `dpa4P`, inside a **data-processing agreement**:
"terskel på fem svar før noe resultat vises". D87 flagged all of these to Tor and nobody has
answered. With Q17's floor of three and no threshold at all for organisation respondents,
none is categorically true. v2's splash re-asserts `n ≥ 5` (`HeiTuva Splash.dc.html:375`), so
a v2 fidelity pass will reinstate it unless this is settled first.
**Proposed:** rewrite to the guarantee that is true — "aldri under virksomhetens terskel,
minst tre" — on the splash, and have the DPA and privacy texts corrected in the same pass
that goes to the lawyer (`docs/LEGAL_DRAFTS.md`, none reviewed yet).
*Confirm: rewrite (recommended) / keep and accept the inaccuracy / wording you supply.*

**Q56** — *The missing fourth page.* `HeiTuva Splash.dc.html:1027` and `:1029` link twice to
`HeiTuva Lovpalagt.dc.html`, which the bundle does not contain.
**Proposed:** supply the page or strike the links. A public page shipping with dead links is
not a fidelity pass. Blocks V2-8.
*Confirm: supply / strike / link to Bruksområder instead.*

## Batch B — before V2-1

**Q57 ●** — *Q38's picker is drawn; the `redaktor_may_lower` switch is not.* v2 draws the
Personvern threshold chips (V2:5583, V2:5587, V2:2737–2747) — Q38's status was "wait for a
bundle" and one has arrived. But `orgThresholdNote` V2:5591 asserts *"Den som lager en
undersøkelse kan heve terskelen, men ikke senke den under virksomhetens minimum"*, which is
stricter than `privacy.redaktor_may_lower` (`M:0034`) — a flag that exists so an organisation
**can** permit lowering, read by the guard, with no writer since D87.
**Proposed:** build the picker as drawn; **keep the column and do not build the switch**; and
parameterise the note on the flag rather than asserting the flag is always false. Removing a
working consumer to match a bundle that forgot it is what **Q29** refused, in words Tor kept
because the reasoning generalises.
**And log the divergence**, because it is a bundle-versus-schema disagreement rather than a
style choice: `docs/DEVIATIONS.md` records that V2:5591 asserts a rule stricter than
`M:0034` holds, that **the flag is the truth and the note is copy**, and that the note is
therefore rendered from the flag. Without the entry the next reader meets a screen whose
sentence and whose database disagree, with nothing saying which was decided.
*Confirm: as proposed (recommended) / drop `redaktor_may_lower` to match the copy / build the
switch from the brief's prose.*

**Q58 ●** — *A per-topic automatic threshold of 8.* V2:5591 — "Kartlegging av trakassering,
varsling og helse settes **automatisk** til 8", with chips `[5,8,10,12]` default 8 (V2:5587).
Q17 defines a default, a floor and a lock, not a topic rule.
**Proposed:** adopt it **as a pack property** — sensitive statutory packs carry 8 in their
seeded `policy`, applied by the existing `app.apply_pack_policy`. A seed change, no DDL, and
it cannot be got wrong by classifying a topic at runtime. **This is Q35's precedent exactly**:
the bundle classified by regex and the answer was "data on the pack. Never a regex on question
text."
*Confirm: pack property (recommended) / a second org-level default as drawn / reject.*

**Q59 ●** — *Verneombud: a fourth role, or a duty capacity?* v2 says "Fire roller" (V2:4279)
and gives verneombud its own role (V2:4283, V2:5100, V2:5131) — while its own Brukere screen
lists three (V2:2279). The v1 bundle says nothing of the kind. The product has three
(`app.member_role`, CLAUDE.md §4).
**Proposed:** **a duty capacity, not a role.** `duty_signers`
(`supabase/migrations/20260904000004_duty_signing.sql`) already records who signs; a
verneombud is a `leser` who signs statutory duties. Correct the help copy to match V2:2279.
Keeps the role model — a security surface 5a3 enumerates against — at three.
*Confirm: duty capacity (recommended) / a real fourth role / copy only.*

## Batch C — before V2-2

**Q60 ●** — *Suppression scope.* Is "har sagt nei til undersøkelser" (V2:4332) an objection to
**all** surveys from the organisation, or per population / per survey type? The bundle's own
reasons differ — "Avmeldt kundeundersøkelser" vs "Reservert av personen selv" (V2:5014).
**Proposed:** org-wide by default, with an optional population scope once populations exist.
GDPR art. 21 is an objection to *processing*, so the default must be the broad one.
*Confirm: org-wide (recommended) / per population from the start / per survey.*

**Q61** — *Member status vocabulary.* v2 uses Aktiv / Bounce / Reservert / Ny (V2:4327–4335);
`org_members.status` is `invited/active/inactive` (`M:0002:43`) and bounce lives on
`survey_invitations.bounced_at`.
**Proposed:** **derive, do not duplicate** — `invited → Ny`, `active → Aktiv`,
`inactive → (hidden)`; `Bounce` from the latest invitation's `bounced_at`; `Reservert` from
`suppressions`. No new status column.
*Confirm: derive (recommended) / a new enum matching the bundle.*

## Batch D — before V2-3

**Q62** — *Q9 amendment: sync moves from Send to Målgrupper.* v2 removes
`isPasteImport`/`isSyncImport` (V1:4019–4020); Send keeps a one-off list (V2:3020) with
"Lagre som målgruppe" (V2:3037) and hands sync to Målgrupper (V2:3040).
**Proposed:** amend Q9 — substance unchanged (CSV/Excel/paste real, sync stubbed behind
`feature_flags`), location changed. Record it as an amendment so the register does not read
as drift.
*Confirm: amend Q9 (recommended) / keep sync on Send.*

**Q63 ●** — *Populations wait for the catalogue.* `popRows` V2:5037–5042 is R3's
contacts/accounts entity and carries a **lawful basis** per population.
**Proposed:** V2-3 ships **groups and segments only**; the Populasjoner section renders the
design's unavailable state, never fabricated counts (CLAUDE.md's never-fabricate rule).
*Confirm: split (recommended) / wait for the catalogue and ship Målgrupper whole / invent a
population model.*

**Q64** — *Segment freeze semantics.* V2:5033 — "312 treff · frosset for Ukespuls 36". A
self-updating segment re-evaluated after send changes a round's denominator retroactively.
**Proposed:** membership is **materialised at send** into `round_audience_members` and never
re-evaluated for that round; changing a rule marks the history, as the design says. The
precedent is `M:0039`, where D94 decided `surveys.target` is the **latest round's** count —
same question, same answer: the number belongs to the round.
*Confirm: materialise at send (recommended) / live join with a snapshot for reporting.*

**Q65 ●** — *How a segment rule is stored.* V2:4320 draws it as prose:
`"stillingsprosent < 100 og ansatt før 2024"`.
**Proposed:** a **structured predicate** — jsonb `{field, op, value}` clauses over an
allowlisted field set — never free text evaluated in SQL. Note most of the fields it wants
(`stillingsprosent`, `startdato`, `land`) are HR fields this product does not hold, so most
segments are integration-blocked in practice; the rule editor must say so rather than
offering fields that can never match.
*Confirm: structured predicate (recommended) / free text stored and displayed only, no
evaluation / defer segments entirely.*

**Q66 ●** — *Retention per population.* `popRows` carries "24 mnd", "5 år", "12 mnd";
`app.apply_retention` has one global path.
**Proposed:** retention becomes population-driven **in the same phase as populations**.
Enforcing the send guard while retention stays global gives the screen a promise the data
lifecycle does not keep.
*Confirm: together (recommended) / retention first / leave retention global.*

**Q67 ●** — *The mixed-population send guard belongs in the database.* `audBlocked` V2:4829 →
button disabled V2:6620–6621, handler returns early V2:6624, copy V2:6551 ("ulikt
behandlingsgrunnlag"). A legal-basis rule whose only enforcement is `cursor:not-allowed` is
not enforced.
**Proposed:** `send_round` refuses a round spanning more than one population — which needs
populations, so it lands with Q63, not before.
*Confirm: in `send_round` with populations (recommended) / keep the UI guard.*

## Batch E — before V2-4

**Q68** — *Oppgaver supersedes `loop_actions`.* `loop_actions` (`M:0006:116`) is
`{text, owner_member_id, due_at, done}`, surfaced by `oversikt/LoopActionForm.tsx`.
**Proposed:** migrate (`text → title`, `done → Lukket`), retire the Oversikt surface, do not
run both.
*Confirm: migrate and retire (recommended) / keep both / drop the rows.*

**Q69 ●** — *The task close guard's cascade behaviour, decided when the trigger is written.*
V2:5197 is the feature's legal point. CLAUDE.md: an append-only trigger written as "reject
any UPDATE" collides with PostgreSQL's own FK maintenance, and this has been rediscovered
four times (D50, D51, D57, duty-archive).
**Proposed:** the guard compares only the columns that carry meaning and refuses
`status → 'lukket'` without an assessment row; `owner_member_id` is `ON DELETE SET NULL` and
the trigger lets that through, asserted by a negative test that deletes an owning member.
*Confirm: as proposed (recommended) / a different cascade you name / block member deletion
while a task is open.*

**Q70** — *Where a task's legal basis comes from.* V2:4165–4175 carries `law` as a citation
string; `duty_definitions` holds the four statutory duties as rows (CI asserts `duties = 4`).
**Proposed:** `law_ref` references `duty_definitions` where a statutory duty applies, free
text only where none does. Q35's precedent: data on the registry, never a string parsed at
read time.
*Confirm: reference the registry (recommended) / free text throughout.*

**Q71** — *Oppgaver's Teams notification.* V2:5198 and V2:2206 both promise it; the
integration is deferred to V2-11.
**Proposed:** adjust the copy, or render the feature without the claim. A claim the product
cannot keep is not shipped — the D73 rule.
*Confirm: adjust the copy (recommended) / ship the copy and accept it / hold Oppgaver until
Teams exists.*

## Batch F — before V2-5 (take this early)

**Q72 ●● — the first decision of the plan.** *What may a task created from a below-threshold
finding contain?* v2 says a sub-threshold finding becomes a task automatically with source
and hjemmel visible (V2:4239, V2:4270) and ships one whose source reads "Psykososial
kartlegging · under terskel" with `law: "aml. § 4-3 (3)"` (V2:4168). A task naming a source,
a group and a legal basis discloses that a specific sub-threshold group scored badly. The
duty is real — aml. § 4-3 (3) does not pause below five answers — so the question is the
payload, not the feature.
**Q28 does not already license it:** Q28 keeps *counts of people* visible, and a task whose
**existence is conditioned on a gated value** discloses that value. It is a predicate over an
average, not a count.
**Proposed:** **the duty, not the finding** — the task states that an undersøkelsesplikt is
triggered *for the survey*, with no group, no question and no score, and the responsible
person investigates offline.
*Confirm: the duty only (recommended) / the finding, administrator-only and never exported /
as drawn.*
**Blocks:** V2-5 entirely, V2-4's card copy, and `task.created` in V2-11.

**Q73 ●** — *`threshold.breached` as a webhook.* V2:5248 — "Funn under terskel — kan utløse
undersøkelsesplikt". It carries the disclosure past every control, to a system where none of
this product's RLS applies.
**Proposed:** **do not build it.** If the task is safe under Q72, `task.created` already
exports it; the threshold event adds only the leak.
*Confirm: do not build (recommended) / build it carrying only a survey id / build as drawn.*

## Batch G — before V2-6

**Q74 ●** — *`helpForum`.* V2:5086 puts a forum beside the articles, and V2:2091 writes its
promise: "HR-folk, verneombud og innkjøpere deler maler, formuleringer og erfaringer. **Skriv
med fullt navn eller anonymt.**" That is an unmoderated anonymous posting surface inside a
product whose selling point is a *controlled* anonymity guarantee, plus a permanent
operational obligation — moderation staffing, spam, harassment, retention, takedown.
**Proposed:** **not built.** Ship the twelve articles (V2:4177+) and `helpContact` /
`contactSent` (V2:5159). If a community is wanted, buy one.
*Confirm: articles and contact only (recommended) / a forum with named posting only / as
drawn.*

**Q75** — *Where help articles live.* Twelve articles with steps, a mock screen, a caption and
related links.
**Proposed:** a `help_articles` registry with a `jsonb` body plus translations — data-not-code,
like `report_section_types`; `ui_messages` is for strings, not structured documents. Allowlist
it in 5a3 **with a reason**.
*Confirm: registry table (recommended) / `ui_messages` / MDX in the repo.*

## Batch H — before V2-7

**Q76 ●** — *Test mode.* v2 short-circuits submission in the client at V2:4577. Server-side a
test must not write a response, must not consume a token and must not set `responded_at` —
otherwise a "test" silently marks a real invitation answered.
**Proposed:** a dry-run flag on `submit_response` that runs every validation and returns
without inserting, asserted by a negative test on the response count and on `responded_at`.
*Confirm: dry-run in the RPC (recommended) / a separate preview path that never reaches the
RPC / no test mode.*

## Batch I — before V2-8

**Q77** — *Bruksområder's publish gate.* The page markets nine survey types
(`HeiTuva Bruksomrader.dc.html:51`, `ORDER` :290). All nine exist as seeded packs today
(CI asserts `packs = 22`), so the D73 gate is satisfied on content.
**Proposed:** ship it once **Q56** is resolved, since the splash's new states link to the
missing page from the same release.
*Confirm: ship with Q56 resolved (recommended) / ship the page and defer the splash changes.*

## Batch J — before V2-9 (Live)

**Q78 ●● — the live counter, as a Q28 EXTENSION.** `liveGuard` V2:6147 is a true statement
about a static check and the design honours it. It does not cover the room: in a group of six
the audience watches `liveStage.counter` (V2:6177) go 4 → 5 and the bars appear (V2:1863).
**Q28 licenses the number** — counts of people stay visible — but its four enumerated homes
are asynchronous private reads by an authenticated member. The live counter renders the same
number continuously to a **co-located audience**. What may be new is therefore **not the
number but the increment**, observed in real time by a room that already knows who is
present: **a correlation channel, not an aggregation** — which is a different kind of thing
from anything Q28 ruled on, and Q28 was confirmed before any projected surface existed.
**Q28 holds; a count of people is participation.** This is an extension of it, not a
violation, and phrased as a violation it gets refused and the real question is lost.
**Proposed:** default the counter **off** below the threshold and refuse the reveal until
n ≥ k (`counter` V2:6138 and `manualReveal` V2:6139 both default on, so this is a default
change plus a guard). State in the phase report that this is a mitigation, not a proof.
*Confirm: hidden below k + reveal refused below k (recommended) / jittered counter / as drawn
with the limitation documented / do not build live.*

**Q79 ●** — *The projected word cloud, its queue, and whether `get_quotes`' rule reaches it.*
`DEFAULT_LIVE.cloud` defaults on (V2:4338); `cloudModeration` V2:6180 says three texts are
waiting. Three sub-questions: does the queue gate every text or only flagged ones (the copy
reads as all); does the moderator thereby read individual free text, and if that moderator is
a `redaktør`, is that a new read path; and does the projected surface obey the same rule as
`get_quotes` (`M:0009:176-177` — a `leser` with a group filter is refused)?
**Proposed:** the queue gates **every** text; moderation is an administrator action; the
projected read path goes through the **same** rule as `get_quotes`, not a second answer; and
the cloud gets its own minimum-occurrence floor — a rare word from one respondent is a quote
with the grammar removed — which is **not** k.
*Confirm: as proposed / different answers per sub-question / no cloud.*

**Q80 ●** — *`audienceQuestions` on the projected screen.* V2:6183, rendered V2:1906;
defaults **off** (V2:4338). Public UGC displayed to colleagues in a room, in a product that
promises anonymity elsewhere. A question can name a person, be harassment, or be an
aml. kap. 2A disclosure read aloud to the department — the opposite of what kap. 2A requires.
**Proposed:** **not built.** Live ships with it off and unimplemented. Reopen as its own
decision with a moderation design if it is wanted.
*Confirm: not built (recommended) / built with pre-publication moderation / as drawn.*

**Q81** — *A projected viewport is a class `docs/RESPONSIVE.md` has never covered.* Three
breakpoints exist and a projector is none of them; type must scale with viewing distance, not
pixels. CLAUDE.md relaxes "do not invent" **only** to that file's patterns, so live cannot
start until this is answered.
**Proposed:** answer it via Q82 rather than by adding a fourth breakpoint — a chrome-free
route can carry its own type scale without touching the app's breakpoints.
*Confirm: solve via Q82 (recommended) / add a projector class to RESPONSIVE.md, a change to a
frozen specification / do not build live.*

**Q82** — *Is the live stage a separate route?* v2 draws it inside the app shell (V2:1829)
with the standard header, so the presenter's avatar and the org nav go on the wall.
**Proposed:** a **chrome-free route** for the stage, with the presenter's controls on the app
screen. This also answers Q81 and the QR-size and second-device questions.
*Confirm: separate route (recommended) / one screen as drawn.*

## Batch K — before V2-10 (Quiz)

**Q83** — *`QUIZ_TILES` introduces four non-token colours.* V2:4084–4089 — `#F26B21`,
`#2F6FB0`, `#2F7D4F`, `#B0343C` — reaching the **respondent** surface via
`respondOne.quizTiles` (V2:4768), which is pixel-perfect mobile-first.
**Proposed:** **new named tokens** (`--qz1…--qz4`) in the theme and `tailwind.config.ts` with
a stated role. They are functional, not decorative — the existing accents have near-identical
luminance and would not read from the back of a room. Contrast of `#FFFDF6` on each is
**measured** and recorded (`#F26B21` is ~3:1 — large text only under AA).
*Confirm: new tokens (recommended) / a logged deviation with hard-coded hexes / reuse the
existing accents.*

**Q84 ●●** — *Quiz has assessment semantics.* `certificate` V2:6152, `quizPass` V2:6159
(default 70), `quizTries` V2:6161 (default 2). An employee who fails a mandatory quiz twice
has produced an HR record. Three sub-questions: **retention** (a failed assessment is
employment documentation with a different, often statutory, retention and a different art. 17
answer, and `app.apply_retention` has one survey-shaped path); **who may see an individual
result** (the three roles were designed for aggregate reading); and **which tables**.
**Proposed:** quiz lives in **its own tables** with its own RLS and its own retention — the
database architect and the security reviewer reached this independently, and it is the only
answer that keeps "no anonymous row can reference a person" intact rather than weakening it
to "no anonymous row *of this kind* can", which is the sentence `dsr_requests` answers from.
Individual results are visible to `administrator` only; the leaderboard stays team-level as
drawn (V2:6186).
*Confirm: own tables + administrator-only + team leaderboard (recommended) / a different
visibility rule / no certificates / do not build quiz.*

**Q85 ●** — *Two quiz refusals are UI-only.* Quiz is locked while a survey is anonymous
(V2:6156–6158) and refused on statutory packs (V2:6122) — both client-side early returns.
**Proposed:** both become database refusals in `app.guard_survey_policy`, with negative
tests. A rule enforced only by a disabled control is not enforced — the same finding as Q67.
*Confirm: in the database (recommended) / UI only.*

## Batch L — before V2-11 (the final phase)

**Q86 ●** — *BankID / ID-porten reopens Q4.* V2:5215. Q4 deferred respondent identity and
reserved `survey_invitations.identity_provider`; duty signing is audit-grade (member +
timestamp + content hash), **not** a qualified signature. What Q4 did not decide is what a
BankID signature changes about the legal claim the product makes for a signed duty report.
**Proposed:** answer the legal question before the connector — the column is ready and the
meaning is not.
*Confirm: legal answer first (recommended) / build and keep the current claim / do not build.*

**Q87 ●** — *Can a Power BI / Tableau export honour `app.k_for` at all?* V2:5225 exports
"aggregerte resultater" outside every UI gate. A BI tool's value is slicing, and a gate that
holds for the slices the product ships does not hold for slices the customer invents.
**Proposed:** the only safe export is one already collapsed to the gated shape — and say so
publicly rather than shipping a connector that quietly breaks the guarantee.
*Confirm: gated-shape export only (recommended) / a controller-to-controller handover with
the k obligation contractually transferred / no BI export.*

**Q88 ●** — *Sykefravær correlated against risk per unit.* V2:5209 — health data (GDPR art. 9)
joined to psychosocial results per unit, where a unit can be small enough to identify a
person. Art. 9(2)(b) is arguable for HSE duties but is a different basis from the rest of the
product.
**Proposed:** **not a product feature.** If a customer wants it, that is a bespoke engagement
with a DPIA, not a connect button.
*Confirm: not a product feature (recommended) / build it with a DPIA and an art. 9 basis /
build as drawn.*

**Q89** — *The API and integrations program: go or no-go.* Fifteen systems and a public API
are each larger than any phase this project has run.
**Proposed:** V2-11 is written as a phase and **not started** until Tor says so, and until
Q72, Q86, Q87, Q88 and the expansion catalogue are settled.
*Confirm: hold until those settle (recommended) / start a scoping program now / drop the API.*

---

## Settled by Rounds 1–2, recorded so they are not reopened by accident

- **Q3 stands and is already implemented.** v2 relabels the `minResponses` toggle
  ("Håndhev minsteterskel", V2:5593) and still wires it live (V2:5600); the app has rendered
  it locked since Phase 1 — `messages/no.json:816` `"Alltid på — håndheves i databasen"`,
  `PrivacyPanel.tsx:21`. No new decision; the deviation holds.
- **Q17 stands over the bundle's copy and logic.** The app's own copy was rewritten in D87;
  the three v2 logic sites hard-coding 5 (V2:4988, V2:5048, V2:5052) take `app.k_for`
  (02-conflicts §A4). Only the splash/legal keys remain open, as **Q55**.
- **`hasThresholdWarn` is a fourth CALLER of `lib/questions/policy-warnings.ts`, not a fourth
  copy — and it is the FIFTH instance of one-function-many-callers in this project, the first
  caught BEFORE the copy existed.** The previous four were removed after the fact: V1-3's
  interval CASE, V1-4's panel vocabulary, V1-5's use-case mapping, and V1-6's pack-question
  builder (`lib/questions/pack.ts` names all four). `docs/v1/06-closeout.md § 1` calls it "the
  defect shape of this codebase". That this one is visible while the second copy is still
  hypothetical is the pattern's whole value, and it is worth making visible rather than
  quietly doing the right thing: the rule is being caught earlier each time.
  **And the answer to the question the v2 instruction asked: no — `audGroups` is NOT the data
  source D94 was waiting for.** D94 **closed in V1-2** (`docs/DEVIATIONS.md:1783`, migration
  `M:0039`): `surveys.target` gained a writer — a trigger on `survey_invitations` rather than
  the Send action, because recipients reach a round by several paths — and the count was
  decided as the **latest round's**, proven both ways in `tests/db/policy-panel.test.ts`.
  `policyWarnings` already has three callers (`Builder.tsx`, `PolicyPanel.tsx`,
  `SendScreen.tsx:160`, the last feeding it `target: reach` from `:146`). v2's
  `hasThresholdWarn` (V2:4988) is a *different* comparison — per audience group, at pick
  time — so it is new work, but it is new work for an existing function.
- **Q26 and the V1-7 descheduling stand.** No v2 phase lifts
  `feature_flags.event_stream_panel` (`M:0047:72`); the panel is R4's second half and Q41
  travels with it.
- **Q45 is not in collision.** `PACKS` is identical in v1 and v2 at 23 entries; the five new
  ones landed in V1-5. The earlier pass's claim that they were v2 scope is withdrawn.
- **Q49 is not in collision.** v2 does not re-assert the sentence D103 corrected.
- **Quiz does not live in the response tables** (02-conflicts §B7) — recorded as an invariant
  consequence, and restated as Q84's recommendation so it is confirmable.
