# 02 — Conflicts (Round 2)

Two classes: **(A)** the bundle contradicting a committed decision, and **(B)** the security
reviewer and the product reviewer disagreeing about whether a feature can exist in this
product at all. Each is resolved, or marked **TOR'S CALL** with the options stated. Nothing
is split down the middle.

The instruction named Q17, Q28, Q31, Q45, Q49 and the QUIZ_TILES/token rule as the likely
collisions. All six are real decisions in `DECISIONS.md` and all six are addressed below —
**Q28 turns out to be the interesting one**, and not in the direction the instruction
expected.

---

## A. Bundle versus committed decisions

### A1. Q18 assumes two bundles; there are now three

**Q18 (CONFIRMED):** `design-reference-v1/` governs every screen a v1 phase touches;
`design-reference/` remains the reference for Phase 1–7 work *as built*, "so a fidelity
question about an untouched screen is answered against the bundle it was built from, not
against a later one that moved the frame under it". CLAUDE.md, `VERIFY.md` and
`scripts/verify/reference.ts:21` all carry both paths, and `verify:reference` renders both
into `artifacts/reference/` and `artifacts/reference-v1/`, overwriting neither.

v2 is a third handoff and Q18's sentence does not extend itself to it.

**TOR'S CALL, and it is the first thing to settle** because every fidelity question in the
plan depends on the answer. Q18's own logic gives the shape:

1. **Extend the rule as written** — `design-reference-v2/` governs every screen a v2 phase
   touches; v1 keeps the screens v1 phases touched and v2 does not; the original keeps
   Phase 1–7's untouched screens. A third render directory, `artifacts/reference-v2/`. This
   is the reading that follows from Q18 and I recommend it.
2. **v2 supersedes v1 wholesale** — one target for everything, and the v1 renders become
   history. Cheaper to explain, and it discards Q18's actual reason: v2 moves the frame
   under screens that were signed off against v1 (the hardening pass, the header, the fifth
   nav item), which is precisely the situation Q18 exists to stop being answered by
   guesswork.
3. **Freeze v2 to the new screens only** — v2 governs Oppgaver, Live, Quiz, Målgrupper,
   Profil, Integrasjoner and Help; everything else stays on v1. Tidy, but it leaves the
   hardening pass with no bundle authorising it.

Whichever is chosen, the render step is a scheduled commit of its own: re-rendering makes
every existing Gate 3a diff go red at once, which is correct and must not be discovered
mid-phase.

### A2. The threshold picker is drawn, and its copy contradicts a flag that exists — **Q17, Q36, Q38**

v2 draws Q38's Personvern controls (00-diff §A.0b): chips `[3,5,8,10]` V2:5583 and
`[5,8,10,12]` V2:5587, note V2:5591, markup V2:2737–2747.

The chips agree with the schema — 3 is Q17's floor, 10 is Q36's CHECK (`M:0036`). **The
note does not.** It says *"Den som lager en undersøkelse kan heve terskelen, men ikke senke
den under virksomhetens minimum"*, which is stricter than `privacy.redaktor_may_lower`
(`M:0034`) — a flag that exists so an organisation **can** permit lowering. The switch that
flag was built for is not drawn anywhere in v2.

**RESOLVED, in the direction the register already points.** Q38's status was "wait for a
bundle"; a bundle has arrived that draws the picker and not the switch. Build the picker as
drawn. Do **not** delete `redaktor_may_lower` to match the copy — it is a shipped column
with a guard reading it, and removing a control to match a bundle that forgot it is exactly
what **Q29** refused ("do not remove a working consumer to match a bundle that forgot it",
kept in those words at Tor's instruction because the reasoning generalises). The switch
stays undrawn and unbuilt; the note is rendered only where it is true, i.e. parameterised
on the flag. Log as a deviation.

### A3. A per-topic automatic threshold of 8 — **Q17, and it is new**

`orgSensitiveChips` V2:5587 (default 8) and V2:5591: *"Kartlegging av trakassering,
varsling og helse settes **automatisk** til 8."* Repeated in the help centre V2:4230 and
V2:5131. Q17 defines a default, a floor and a lock — no topic rule.

**TOR'S CALL.** It strengthens the guarantee rather than weakening it, so "the file wins on
security" does not settle it. Three readings:

1. **A pack property.** Sensitive statutory packs carry 8 in their seeded `policy`, applied
   by the existing `app.apply_pack_policy` (`M:0032`). No DDL, and it cannot be got wrong by
   classifying a topic at runtime. **This is Q35's precedent exactly** — the bundle
   classified questions by regex and Tor's answer was "data on the pack. Never a regex on
   question text." A topic string parsed to pick a threshold is the same mistake in the
   same place.
2. **A second org-level default**, as drawn, applying to a named pack set.
3. **Reject** and keep one org default.

Recommend (1).

### A4. ~~Three~~ **FOUR** v2 surfaces hard-code 5 in logic — **Q17**

`hasThresholdWarn` **V2:4988** (`g.count > 0 && g.count < 5`), `mgGroups.small` **V2:5048**,
`mgSegments.small` **V2:5052**; the warning's group list V2:4986 uses the same constant.

**CORRECTED 2026-09-08 — a fourth rendered surface was missed, and it is on a screen that
already ships.** The Send audience picker carries `warn: g.count < 5` and `hasWarn: g.count <
5` (**V2:6543–6544**), rendered as a chip at **V2:3072–3074**. `00-diff.md § B.27` says
«three» from the same enumeration. Six logic lines across four rendered surfaces, not four
lines across three — and the missed one is the only one attached to a screen a user reaches
today, so a phase that fixed «the three» would have left the live one behind. Found by a
`grep -n "count < 5"` over the whole bundle rather than by re-reading the list.

**`docs/DEVIATIONS.md` D110, instance 1.** The count here was written once and inherited into
`00-diff.md § B.27` without being re-counted: **a count in a plan is not a measurement.** When
this enumeration next changes, change it by running the grep.

**RESOLVED — the file wins.** `app.k_for` (`M:0032:69`) returns **0** for organisation
surveys and `greatest(k_threshold, 3)` otherwise, so `count < 5` is wrong in both
directions. Any phase touching an aggregate path carries the two-sided catalogue-derived
assertion, and it is not a slogan here: **`tests/invariants/threshold-policy.test.ts:366-386`**
enumerates every caller-reachable `public` SECURITY DEFINER function whose body reads
`responses`/`answers` and fails unless it calls `app.k_for`.

And per 01-briefs §1 and §6: `hasThresholdWarn` must be a **fourth caller** of
`lib/questions/policy-warnings.ts`, not a fourth copy of the rule. D94 closed in V1-2;
`policyWarnings` already has three callers.

### A5. The bundle's categorical "fem" — **Q17, and the open part is the splash**

The bundle has said "fem" categorically since v1 (V1:1557, V1:1829, V1:3394, V1:3913) and
v2 repeats it (V2:1711, V2:2790, V2:4660). **This is already settled for the app**: D87
rewrote `reports.groupThreshold`, `reports.dutyThreshold` and `admin.groupThresholdNote`,
and `messages/no.json:623` and `:629` now read "under terskelen" and "fem som standard,
aldri under tre for personer". Nothing new to decide — the deviation is logged and holds.

**What is still open is what D87 flagged to Tor and nobody has answered**, and it is
sitting in shipped public copy today:

| Key | Text |
|---|---|
| `messages/no.json:1369` | `"drivers2Stat": "n ≥ 5"` |
| `messages/no.json:1344` | "Team med under fem svar skjules automatisk" |
| `messages/no.json:1455` | "ingen tall under fem svar" (the pricing fine print) |
| `messages/no.json:1573` | `dpa4P` — "terskel på fem svar før noe resultat vises, håndhevet i databasen" |
| `messages/no.json:1553` | `privacy3P` |

**TOR'S CALL, and overdue.** With a floor of three and no threshold at all for organisation
respondents, these are no longer categorically true — and `dpa4P` is in a **data-processing
agreement**, which is a different kind of wrong from marketing copy. v2's splash re-asserts
`n ≥ 5` (`HeiTuva Splash.dc.html:375`), so a v2 splash fidelity pass will otherwise
reinstate it.

### A6. The bundle asserts a fourth role — **CLAUDE.md role semantics**

New in v2: V2:4279 *"**Fire roller** styrer hva folk ser"*, V2:4283 *"Verneombud har egen
rolle i lovpålagte kartlegginger"*, repeated V2:5100 and V2:5131. (The v1 bundle says
nothing of the kind — `grep -c "Fire roller"` returns 0.) The product has three:
`app.member_role`, CLAUDE.md §4, and v2's own Brukere screen agrees at V2:2279
("Administrator … Redaktør … Leser").

**So the bundle contradicts itself**, which makes this cheaper than it looks.

**TOR'S CALL.** A verneombud does have a distinct statutory position (aml. § 6-2, and the
medvirkning a psykososial report must document). Options:

1. **A fourth role** in `app.member_role`. Touches every RLS policy and every
   `app.has_role` call, and 5a3 re-enumerates all 74 surfaces against it.
2. **A duty capacity, not a role.** Already expressible: `duty_signers` records who signs
   (`supabase/migrations/20260904000004_duty_signing.sql`), so a verneombud is a `leser` who signs statutory duties. Correct
   the help copy to match V2:2279.
3. Copy only — write "fire roller" and mean three plus a signer.

Recommend (2). One copy change, already built, and it keeps the role model — a security
surface — at three.

### A7. Import: sync sources move out of Send — **Q9**

v2 removes `isPasteImport`/`isSyncImport` (V1:4019–4020). Send now carries a one-off list
(V2:3020) with "Lagre som målgruppe" (V2:3037) and hands sync to Målgrupper at V2:3040.

**RESOLVED — the bundle wins; Q9 is amended, not violated.** Q9's substance (CSV/Excel/paste
real, sync stubbed behind `feature_flags`) is untouched; only the location changes, and the
new location is better — a synced source with an owner and a sync status is an
organisational object, not a per-send action. Q9 gets an amendment line so the register does
not read as drift.

### A8. `QUIZ_TILES` introduces four non-token colours — **CLAUDE.md tokens**

V2:4084–4089 — `#F26B21`, `#2F6FB0`, `#2F7D4F`, `#B0343C` with `fg:"#FFFDF6"`, reaching the
**respondent** surface via `respondOne.quizTiles` (V2:4768).

**TOR'S CALL.** Three readings, argued in 01-briefs §3: new named tokens (`--qz1…--qz4`);
a logged deviation with hard-coded hexes; or reuse the existing accents. Recommend the
first — (2) puts a hex in a component, which is what the token system prevents, and (3)
gives four near-identical luminances on a surface read from the back of a room. Whichever:
**measure the contrast**. `#FFFDF6` on `#F26B21` is about 3:1 — large-text-only under AA —
and these tiles carry answer text on a pixel-perfect mobile-first surface.

### A9. The stream panel must not be revived by this bundle — **Q26 and the V1-7 descheduling**

v2 carries the stream panel exactly as v1 did (`ARCHE_LABEL` V2:4024, registry row V2:4032,
markup V2:1325–1326 — the same rows as V1:2960 and its neighbours).

**RESOLVED — no change.** Q26 defers it behind `feature_flags.event_stream_panel`, seeded
`false` at `M:0047:72`, with its absence **drawn** in the picker, and
`tests/unit/dashboard-panels.test.ts` asserts it stays unnamable. V1-7 was then descheduled
because the panel is a reader over R4's ingestion and "a phase here cannot depend on a
document not in this repository". A third bundle drawing the same panel changes none of
that. **No v2 phase may lift the flag**, and Q41 (the window-step gate rule) stays with the
ingestion half.

### A10. `threshold.breached`, Teams notification, and fifteen integrations are drawn as ready

Not a contradiction of a single decision, but a presentation problem: a settings tab with
connect buttons and a webhook list reads as nearly-done. **RESOLVED:** inventoried,
analysed, and placed in the single final phase. No earlier phase may assume any of it —
Målgrupper's Entra/CSV source field, sender domain verification and supplier org-number
lookup are planned against **manual or CSV input**, with the integration named as a later
enhancement. Oppgaver ships without the Teams notification its copy promises (V2:5198,
V2:2206), or with the copy adjusted.

### A11. Q31, Q45 and Q49 — checked, and only one has anything left

The instruction predicted collisions at Q31, Q45 and Q49. Verified:

- **Q31** (respondent language chips) — no v2 collision. But `docs/v1/05-status.md § 2`
  records it **PARTIAL**: the count rule is built (`app/s/[token]/page.tsx:49-62`), the
  chip *chrome* is not — the bundle is 11px/700 with `title` and `aria-label` carrying the
  language name (V1:2322); the app renders 12px/semibold and **no accessible name**, with
  no deviation logged. v2 does not change the chips, so this is **carried, not new**, and it
  belongs in the fidelity phase.
- **Q45** (the five new packs' categories) — **no collision.** `PACKS` is identical in v1
  and v2 at 23 entries, the five landed in v1, and CI asserts `packs = 22` with
  `unmapped = 0` (`.github/workflows/ci.yml:78`). The earlier pass's claim that these were
  new v2 scope is withdrawn.
- **Q49** (a round's count survives its own threshold) — **no collision, and v2 agrees with
  it.** Q49 is the reason `get_trends` emits `n` on a gated point, and D103 records the
  first time a v1 phase changed bundle copy on a decision's authority. Nothing in v2
  re-asserts the old sentence.

---

## B. Where the security reviewer and the product reviewer disagree

### B1. Tasks from below-threshold findings

**Product (01-briefs §6):** the statutory task register with hjemmel is the most valuable
thing in the bundle. **Security (§2 i):** as drawn, a task naming source, group and legal
basis discloses that a specific sub-threshold group scored badly, and `threshold.breached`
exports it past every control.

They do not disagree about the feature — only the payload. aml. § 4-3 (3) does not pause
below five answers, and nothing in the security position argues otherwise.

**Does Q28 already license it?** No, and the distinction is worth writing down because it
will otherwise be argued badly. Q28 confirms the threshold hides *svarutledete tall, not
counts of people* — invited, participated, and the share, on four named surfaces. A task
saying "12 of 40 answered" is Q28-compliant. But a task whose **existence is conditioned on
a gated value** discloses that value: it is not a count, it is a predicate over an average.
Q28 does not reach it.

**TOR'S CALL, and it is the first decision of the plan** — three phases hang off it
(Oppgaver's source, the builder's breach copy, the webhook). Options from §2(i):
(1) the duty, not the finding — recommended; (2) the finding, administrator-only, never
exported; (3) as drawn, which the security reviewer refuses.

Oppgaver is sequenced **without** the from-findings source so the valuable part does not
wait on this.

### B2. `threshold.breached` as a webhook

**RESOLVED — do not build it.** Both the security reviewer and the scope-split reviewer
reach it independently: if the task is safe under B1, `task.created` already exports it, and
the threshold event adds only the leak. Recorded as a decision line so it is a choice, not
an omission.

### B3. `helpForum`

**Product:** one tab (V2:5086) beside articles and contact. **Security + scope-split:** UGC
with moderation, storage, harassment and takedown obligations — and V2:2091 promises
*"Skriv med fullt navn eller anonymt"*, i.e. an anonymous posting surface inside a product
selling a **controlled** anonymity guarantee.

**RESOLVED — ship the twelve articles (V2:4177+) and `helpContact`/`contactSent` (V2:5159);
do not ship the forum.** If a community is wanted, buy one.

### B4. `audienceQuestions` on the projected screen

**Product:** a town hall without questions is a slideshow. **Security (§2 v):** public UGC
projected to colleagues, where a question can name a person, be harassment, or be an
aml. kap. 2A disclosure read aloud to the department.

**RESOLVED for the v2 build, reopenable.** It defaults **off** (V2:4338). Ship live — if
live is built at all (B6) — with it off and unbuilt.

### B5. The live counter, and whether Q28 already answers it

**This is the one place where the security reviewer argues against a CONFIRMED decision,
and the argument has to be made honestly or it will be refused.**

Q28 says counts of people stay visible. `liveStage.counter` (V2:6177) is a count of people.
Read literally, Q28 licenses it.

The security reviewer's position (§2 ii) is **not** that Q28 is wrong. It is that Q28's four
enumerated homes — the survey row, Oversikt, Resultater's stat cards, the report's
participation section — are all asynchronous private reads by an authenticated member,
whereas the live counter renders the same number **continuously to a co-located audience**.
What leaks is the **increment correlated with a room**, not the count. Nobody watching
Oversikt can see who submitted; everybody in the room can. Q28 was confirmed before any
projected surface existed.

**TOR'S CALL, framed as a Q28 EXTENSION, not a Q28 violation.** Options: hide the counter
below the threshold and refuse the reveal until n ≥ k (`counter` V2:6138 and `manualReveal`
V2:6139 both default on, so this is a default change plus a guard); batch or jitter the
counter; or ship as drawn with the limitation documented.

**And log the limit:** no gate in this repository can see this. It is a property of a
sequence observed by a human, not of a query result. The substitute is a Playwright test
reading the projected DOM at n = k−1 and n = k.

### B6. Whether Live and Quiz belong in this product at all

**Product:** they are drawn, demoed, and a live session is how a psykososial kartlegging
gets discussed rather than filed. **Scope-split:** each is a program.

**RESOLVED — each is its own phase, and neither starts until its decisions are taken.** Live
additionally **cannot start until `docs/RESPONSIVE.md`'s uncovered cases are answered**
(01-briefs §4, items 1–5), because CLAUDE.md relaxes "do not invent" only to that file's
patterns and a projector is not one of them.

The repo has a template for this and it worked: V1-7 was descheduled when the stream panel
turned out to be R4's second half, with the reasoning written down, the scope kept verbatim,
and the absence drawn rather than hidden.

### B7. Quiz results in the response tables

**The database architect (§1) and the security reviewer (§2 iii) agree from different
directions**, and no product counter-argument was offered. **RESOLVED:** quiz lives in its
own tables with its own RLS and its own retention. It is the only answer that keeps "no
anonymous row can reference a person" intact rather than weakening it to "no anonymous row
*of this kind* can", which is the sentence `dsr_requests` answers from.

### B8. Målgrupper: send guard versus retention

**Security** treats population separation as a `send_round` rule. **Product** points out
`popRows` V2:5037–5042 carries a retention period per population and `app.apply_retention`
is global.

**RESOLVED — both, or neither, in the same phase.** Since populations are catalogue-blocked
(00-diff §0.1), the whole cluster waits and Målgrupper ships **groups and segments only**.

---

## C. Conflicts that resolve themselves

- **Oppgaver vs `loop_actions`** — supersedes; migrate `text → title`, `done → Lukket`,
  retire `oversikt/LoopActionForm.tsx`.
- **Oppgaver as a fifth nav item** — extends the four-item nav V1-0 built.
- **Profil og avsender vs profile settings** — it is a Q17 policy surface (`brandLocked`
  V2:4830 derives from `policy.locked || policy.legal`) and reuses the existing lock.
- **Bruksområder's "nine"** — nine survey *types*, all seeded as packs; `USE_CASES` is a
  six-row category registry on a different axis. No contradiction, and the D73 gate
  ("a public page must not claim a capability the product does not have") is satisfied.
  What is **not** satisfied is the two dead links to `HeiTuva Lovpalagt.dc.html`
  (00-diff §0.2).
