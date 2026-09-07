# 05 — Decision batches, as sent

**What this file is.** The batches as they were *put to Tor*, with the argument intact.
Three files, three different jobs, and they are not interchangeable:

| File | Holds | Authority |
|---|---|---|
| `DECISIONS.md` | what was **decided** | **the register — the only authority on how firmly anything is held** |
| `docs/v2/04-decisions.md` | the **drafts** each batch was confirmed from | staging area; if it disagrees with the register, the register wins |
| **this file** | what was **asked**, and the reasoning as argued | a record, not an authority |

It exists because the register keeps the outcome and the staging area keeps a one-line
proposal, and neither keeps the case. When a decision is revisited — and `DECISIONS.md`'s
own header sets out when a confirmed decision may be corrected — the question is what was
argued at the time, not what was written down after.

Batches are sent in the order the plan needs them (`docs/v2/03-plan.md`), which is not
always the order the phases run.

---

## Batch A — sent 2026-09-07 · **CONFIRMED, promoted to `DECISIONS.md` Q52–Q56**

Five decisions, two on the security core. Q52 led because every fidelity question in every
phase after it is answered against whichever bundle it names.

**The argument is not repeated here** — it survives in two places where it will actually be
read: `DECISIONS.md` Q52's rationale carries the reasoning, and the per-surface answer it
produced is `docs/v2/00-diff.md § 0.3`.

| # | Asked | Confirmed |
|---|---|---|
| **Q52 ●** | Does Q18's two-bundle rule extend to a third handoff? | **Extend to three.** v2 governs every screen a v2 phase touches; v1 keeps what v1 built and v2 does not touch; the original keeps Phase 1–7 as built. Table written once at `00-diff.md § 0.3`. Accepted cost: V2-0's re-render turns every Gate 3a diff red in one commit |
| **Q53** | How the v2 hardening pass reconciles with `docs/RESPONSIVE.md` | **A check, not a rebuild.** The mechanism is not the point, the property is. **D90 is not reopened** |
| **Q54** | Q31's carried chip chrome on `/s/[token]` | **Fix in V2-0**, the v1 chrome verbatim including the `title`/`aria-label` the app has never had |
| **Q55 ●** | The shipped copy still promising a categorical five | **Rewrite.** The DPA clause is corrected but held behind `legal.draftNotice` until a lawyer reads it — a contract, not copy. `docs/LEGAL_DRAFTS.md` now opens with it |
| **Q56** | Two bundle links to a page the bundle does not contain | **Strike the links.** Do not build the page, do not redirect to Bruksområder |

**Two clarifications Q52 forced, recorded because without them it decides nothing** — both
now part of the rule in `00-diff.md § 0.3`: governance is per **surface**, not per file; and
**a property check does not move governance, building to a new drawing does.**

---

## Batch F — sent 2026-09-07 · **CONFIRMED, promoted to `DECISIONS.md` Q72–Q73**

Two decisions, both on the security core. Sent out of phase order — its phase is sixth —
because Q72 shapes V2-4's card copy, all of V2-5, and `task.created` in V2-11. Deciding it
late means deciding it three times.

### Q72 ●● — What may a task created from a below-threshold finding contain?

**What the bundle commits to.** Three statements, not one, so this is a rule and not a sample:

- **V2:4239** — «Funn under terskel blir oppgaver med ansvarlig og frist, **med hjemmel synlig**.»
- **V2:4270** — «Funn under terskel blir oppgave **automatisk**, med kilde og hjemmel.»
- **V2:4168** — the shipped row: `source:"Psykososial kartlegging · under terskel"`,
  `kind:"Risikovurdering"`, `law:"aml. § 4-3 (3)"`, `owner:"Tuva Berg"`, `due:"20. sep"`.

**The legal argument for the feature is real and is not disputed.** aml. § 4-3 (3) does not
suspend the undersøkelsesplikt because fewer than five people answered; a duty that only bit
at n≥5 would be evadable by keeping teams small. **The duty exists. The question is the
payload.**

**Why Q28 does not already license it.** Q28 confirmed that the threshold hides *svarutledete
tall, not counts of people* — invited, participated, and the share, on four named surfaces. A
task reading «12 av 40 har svart» is Q28-compliant. But a task whose **existence is
conditioned on a gated value** discloses that value: it is not a count, it is **a predicate
over an average**. Q28 drew a line between counts and derived numbers, and a conditional built
on a derived number sits on the far side of it.

**How the disclosure composes.** No single field is indefensible; four together are:

| Field | Alone | In combination |
|---|---|---|
| `source` «Psykososial kartlegging · under terskel» | names a survey and a threshold state | + names *which* survey scored badly |
| `law` «aml. § 4-3 (3)» | a statutory citation | implies the topic |
| `owner` a named person | ordinary | often identifies the unit |
| `kind` «Risikovurdering» | a task type | marks it as arising from a finding |

And a fifth channel the fields do not show: **`taskFilters` includes `lov` (V2:5164)**,
filtering on `!!t2.law`. A reader who filters to statutory tasks gets *the set* of surveys
with sub-threshold findings — **enumeration, not a single leak**. `taskChannels` (V2:5198)
then announces it in Teams, and `threshold.breached` (Q73) exports it past RLS entirely.

Anyone who knows which team answered the psykososial survey now knows that team scored badly
on ytringsklima. That is the inference k=5 exists to prevent, and the task list is readable by
every `redaktør`.

**The three options, and what follows mechanically from each:**

| | 1. The duty, not the finding | 2. The finding, administrator-only, never exported | 3. As drawn |
|---|---|---|---|
| Task says | «undersøkelsesplikt utløst for *denne undersøkelsen*» — no group, no question, no score | the finding, with group | the finding, with group |
| Duty discharged | yes — the responsible person investigates offline | yes | yes |
| Who reads it | anyone who reads tasks today | **administrator only** — splits the list by role, which the design does not draw | every `redaktør` |
| `lov` filter enumerates | nothing gated | the gated set, to administrators | the gated set, to editors |
| Teams announcement | safe | must be suppressed for this task kind | leaks |
| `task.created` webhook (V2-11) | safe to ship | must be filtered by kind | leaks |
| Bundle copy V2:4239 / V2:4270 | **becomes false — must change** | becomes partly false | unchanged |
| Testable by this repo's gates | yes — assert the produced row contains no group name | yes, plus a role split | the assertion has nothing to assert |

**Recommended: option 1.** It discharges the duty — the legal requirement — and discloses
nothing. Its one real cost is that it makes the bundle's own sentences false on their own
screen, and **there is precedent for exactly that**: **D103**, where a v1 phase changed bundle
copy on a decision's authority after Q49 made the drawn sentence untrue. The mechanism exists
and has been used once.

Option 2 is defensible but buys less than it costs: a role-split task list the design does not
draw, and a carve-out at every downstream surface (Teams, the webhook, the `lov` filter).

*Confirm: the duty only / the finding, administrator-only and never exported / as drawn.*

**Blocks:** V2-5 entirely, V2-4's card copy, and `task.created` in V2-11.

#### OUTCOME — option 1, with the TRIGGER changed. **The menu above was wrong.**

Tor took option 1 and then found the defect in it, which is worth recording exactly because
the analysis above led up to it and then stopped one step short.

**Option 1 as drafted still leaked, by elimination.** Groups A(12), B(9), C(4); a task saying
«undersøkelsesplikt utløst for Psykososial kartlegging» with A and B visible and healthy tells
the reader C scored badly. **The predicate was still over a gated value — merely wrapped.**
Removing the group name from the payload does not remove the payload's dependence on the
gated cell; it only makes the inference take one more step.

**The fix is to the condition, not the wording.** The trigger is not «a finding below
threshold» but **«this survey has an audience group whose SIZE is below `app.k_for(survey)`»**
— a group that will never receive its own results even at a 100 % response rate. That is a
**count of people**, which Q28 expressly permits, and it is a property of the **audience**,
not of the responses.

Confirmed copy: «Denne undersøkelsen har grupper som ikke får egne resultater. Plikten til å
kartlegge og følge opp gjelder likevel.»

**What it buys over the drafted option, each item verified rather than asserted:**

| | Drafted option 1 | Confirmed trigger |
|---|---|---|
| Existence discloses | the gated cell, by elimination | **nothing new** — `groups_sel` and `members_sel` are both `app.is_org_member(org_id)` (`M:0008:13-14, :23`), so any member incl. a `leser` already reads group sizes, and v2 badges them at `mgGroups.small` (V2:5048) |
| The `lov` filter (V2:5164) enumerates | surveys with bad findings — **narrowed, not closed** | surveys with **small groups** — the channel **closes** |
| Teams (V2:5198), `task.created` | need a per-kind carve-out | **safe without one** |
| Honesty about the situation | implies someone knows the finding is bad | the employer **cannot know it is fine either**, and a duty cannot be discharged by looking at a number they may not see |

**Accepted cost:** the task appears more often, including when nothing is wrong. Tolerable
noise — it points at a real blind spot every time.

**Negative tests** (Tor's three, with the form of the third specified in
`docs/v2/03-plan.md` V2-5): the row contains no group name, no question, no score and no
survey-level derived value; **a task is produced for a survey with a sub-threshold group
regardless of that group's results**; and **no task is produced by any path that reads a gated
value** — written as a catalogue-style assertion over the generator's reachable call graph,
not as "does not call `aggregate_results`", because V1-6's first rule is that the derivation
must describe the property and not a symptom of it.

**Bundle copy V2:4239 and V2:4270 become false and change on this decision's authority.**
D103 is the precedent; the mechanism has been used once. Logged in `docs/DEVIATIONS.md` when
V2-5 ships it.

**V2-4 and V2-5 stay separate.** The negative tests *are* V2-5; merging would bury them
inside a screen build.

### Q73 ● — `threshold.breached` as a webhook

**V2:5248** — «Funn under terskel — kan utløse undersøkelsesplikt.»

The security reviewer and the scope-split reviewer reached the same answer independently, from
different directions. The event fires **on the gated condition itself** and delivers to a
system where none of this product's RLS, roles or k-gate applies. Whatever Q72 decides, this
channel carries the disclosure across the boundary by construction — and if Q72 lands on
option 1, the event has nothing safe to say that `task.created` does not already say.

**Recommended: do not build it.** Recorded as a decision line rather than an omission, so a
later reader meets a choice with a reason rather than a gap in a list of six events.

*Confirm: do not build / build it carrying only a survey id / build as drawn.*

#### OUTCOME — **do not build**, recorded as a decision line rather than an omission. Under
the revised Q72 the event would only ever say «this survey has a small group», which
`task.created` already carries, while still delivering across a boundary where none of this
product's controls apply. The remaining five events ship.

### Flagged with the batch — and answered

**V2-4 (Oppgaver) is sequenced without the task generator**, so the statutory register does
not wait on Q72. The recommendation was to keep the phases separate even once Q72 landed.
**Confirmed:** the negative tests *are* V2-5, they deserve their own verification pass, and
merging would bury them inside a screen build.

---

## Batch B — sent 2026-09-07 · **OPEN**

Three decisions, all on the security core. V2-1's batch, sent after V2-0 closed.

**Every premise below was verified against source during V2-0's Gate 1**, not read off a
status document. That is Q54's lesson applied: Q54 was confirmed to fix something already
fixed, because `docs/v1/05-status.md` said it was outstanding and nobody re-measured. Two of
the three drafts changed on verification.

### Q57 ● — Q38's picker is drawn; the `redaktor_may_lower` switch is not

v2 draws the Personvern threshold controls that Q38 parked waiting for a bundle: chips
`[3,5,8,10]` (V2:5583) and `[5,8,10,12]` (V2:5587), note V2:5591, markup V2:2737–2747.
Neither exists in v1.

**What is already built, measured:** `organizations.default_k_threshold` exists with its
3–10 CHECK (`M:0034:15`, `:19-20`) and is **displayed today** — `PrivacyPanel.tsx:64`
interpolates it into `pMinResponsesDesc`. It has **no writer**: no action takes an int for it,
and `setPrivacy` is boolean-only and Zod-allowlisted (`administrasjon/actions.ts:92-97`).
`privacy.redaktor_may_lower` is read by the guard (`M:0034:108`) and tested
(`attributed-results.test.ts:267-288`), has no writer, is **not in `PrivacyKey`'s allowlist**,
and is drawn nowhere in v2.

**So the shape is: the number is shown but not settable, and the flag is enforced but not
settable.** V2-1 makes the first settable.

**The conflict** is that `orgThresholdNote` (V2:5591) asserts *"Den som lager en undersøkelse
kan heve terskelen, men ikke senke den under virksomhetens minimum"* — stricter than
`redaktor_may_lower`, a flag that exists so an organisation **can** permit lowering.

**Proposed:** build the picker as drawn; **keep the column and do not build the switch**;
parameterise the note on the flag rather than asserting the flag is always false; and **log
the divergence** — the flag is the truth, the note is copy. **Q29 applies verbatim**: do not
remove a working consumer to match a bundle that forgot it.

*Confirm: as proposed / drop `redaktor_may_lower` to match the copy / build the switch from
the brief's prose.*

### Q58 ● — a per-topic automatic threshold of 8

V2:5591: *"Kartlegging av trakassering, varsling og helse settes **automatisk** til 8."*
Q17 defines a default, a floor and a lock — no topic rule. It **strengthens** the guarantee,
so "the file wins on security" does not settle it.

**Verified, and stronger than the draft claimed:** `app.apply_pack_policy` (`M:0032`)
**already reads `k_threshold` from the pack's policy jsonb** —
`new.k_threshold := coalesce((v_policy->>'k_threshold')::int, new.k_threshold)`. The pack
route therefore needs **no DDL and no code change at all**. The mechanism is built and wired;
the decision is only *which packs carry which number*.

**Proposed:** adopt it **as a pack property** — sensitive statutory packs carry 8 in their
seeded policy. It cannot be got wrong by classifying a topic at runtime, which is **Q35's
precedent exactly**: the bundle classified questions by regex and the answer was "data on the
pack. Never a regex on question text." A topic string parsed to pick a threshold is the same
mistake in the same place.

*Confirm: pack property / a second org-level default as drawn / reject.*

### Q59 ● — verneombud: a fourth role, or a duty capacity?

v2 says "**Fire roller** styrer hva folk ser" (V2:4279) and gives verneombud its own role
(V2:4283, V2:5100, V2:5131). **The v1 bundle says nothing of the kind**, and **v2 contradicts
itself**: its own Brukere screen lists three (V2:2279). The product has three —
`app.member_role` is exactly `('administrator','redaktor','leser')` (`M:0001:7`).

A verneombud does have a distinct statutory position (aml. § 6-2, and the medvirkning a
psykososial report must document), so the design is not wrong about the world — it is
inconsistent with the product's role model.

**Proposed:** **a duty capacity, not a role.** `duty_signers`
(`20260904000004_duty_signing.sql`) already records who signs; a verneombud is a `leser` who
signs statutory duties. Correct the help copy to match V2:2279. One copy change, already
built, and it keeps the role model — a surface 5a3 enumerates against — at three.

**What the alternative costs, so the choice is between consequences:** a fourth enum value
touches every RLS policy and every `app.has_role` call, and 5a3 re-enumerates all 74 surfaces
against it. That is a security-kernel change to express something `duty_signers` already
expresses.

*Confirm: duty capacity / a real fourth role in `app.member_role` / copy only.*

---

## Batches not yet sent

`docs/v2/04-decisions.md` holds the drafts. In plan order: **C** (V2-2, Q60–Q61), **D** (V2-3, Q62–Q67), **E** (V2-4, Q68–Q71), **G** (V2-6, Q74–Q75),
**H** (V2-7, Q76), **I** (V2-8, Q77), **J** (V2-9, Q78–Q82), **K** (V2-10, Q83–Q85),
**L** (V2-11, Q86–Q89).
