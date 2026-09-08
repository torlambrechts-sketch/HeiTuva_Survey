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

## Batch B — sent 2026-09-07 · **Q57 and Q59 CONFIRMED and promoted; Q58 RETURNED with a correction**

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

#### OUTCOME — as proposed, promoted to `DECISIONS.md` Q57, with two additions

`default_k_threshold` gets its **first writer**, so the 3–10 CHECK is exercised from the
application side for the first time — negative tests in **Q36's shape: 11 refused, 10
accepted, 2 refused**. And the writer is **`administrator`, not `redaktør`**: a privacy
setting sits with the role that already owns the Personvern tab.

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

#### OUTCOME — **RETURNED. Confirmed as a pack property, but three facts make the confirmed
form unbuildable as written, and they were found by checking the seed rather than the plan.**

Tor confirmed "pack property", plus two requirements: list the packs **by key, not by topic**
("listing by topic moves the regex into a spreadsheet"), and **8 is a floor the pack carries,
not a ceiling** — an organisation whose default is 10 must not be lowered to 8 by choosing one
of these packs.

Measured against the seeded rows, `select key, policy from template_packs where org_id is null`:

1. **Only TWO packs carry a locked policy at all** — `psykososial-kartlegging`
   (`k_threshold: 5`) and `leverandor-apenhetsloven` (`k_threshold: 0`, organisation). Every
   other pack's `policy` is null.
2. **`trakassering-ytringsklima` carries NO policy**, so `apply_pack_policy` never fires for
   it. Giving it 8 is not a threshold bump: it means adding `locked: true`,
   `anonymity: anonymous` and `respondent_kind: person` — **bringing the pack under Q17's lock
   for the first time**, which is a larger change than the decision describes.
3. **"varsling" and "helse" have no pack.** Of v2's three named sensitive topics, only
   trakassering maps to one. Whether `psykososial-kartlegging` is v2's "helse" is a judgement
   about the world, not about the code — and listing by key is exactly what forces it to be
   asked rather than resolved by a regex in a spreadsheet.

**And the floor requirement needs a code change after all.** `app.apply_pack_policy`
(`M:0034`) **assigns** rather than takes a maximum —
`new.k_threshold := coalesce((v_policy->>'k_threshold')::int, new.k_threshold)` — and
**returns early**, so the organisation default is never consulted for a locked pack. Under
that code a pack carrying 8 would lower an org whose default is 10 to 8, which is the outcome
Tor's requirement forbids. My Batch B statement that this needs "no code change at all" was
right that the mechanism exists and **wrong that it implements the semantics** — the second
time verification has moved this decision.

The fix is `greatest(pack_k, org_default)`. Note it changes behaviour for the **existing**
locked packs too, not only new ones: today `psykososial-kartlegging` pins a survey at 5 even
in an organisation whose default is 10. Under `greatest` it would be 10. That is a
strengthening in every case — the survey is never gated less than the organisation chose —
but it is a change to the security kernel and belongs to Tor, not to a build.

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

#### OUTCOME — duty capacity, promoted to `DECISIONS.md` Q59

The deciding reason is duplication rather than cost: **`duty_signers` already expresses
exactly this, and a fourth enum value would express it a second time, in the one place in the
schema where a mistake is most expensive.** That v2 contradicts itself internally — four roles
in the help copy (V2:4279), three on Brukere (V2:2279) — is itself a sign the role is not
thought through in the bundle. Help copy corrected to match V2:2279 and logged.

---

## Batch C+D — sent 2026-09-08, before V2-3 · **Q60, Q61, Q62, Q63, Q64, Q65, Q66, Q67 + four new**

Sent together because suppression moved into V2-3 (Tor, 2026-09-08). Every draft below was
re-checked against the repository by a 62-agent groundwork pass before sending; **nineteen
claims contradicting the plan or a draft survived an adversarial re-check, and thirty-seven
were refuted and are not carried forward.** What changed is marked ▲.

### 0 — WHAT THE GROUNDWORK FOUND FIRST, WHICH IS NOT A QUESTION

**Q91 was decided in V2-2 and not implemented.** `M:0055` moved the floor to 2 in the CHECK
and left `app.k_for` — the gate — at `greatest(s.k_threshold, 3)`. A threshold of 2 was
writable, audited, warned about in the copy Q91 prescribed, and gated at 3. Fixed in `M:0057`
before this batch was sent, not deferred: it is a confirmed decision the build did not honour.
Full account in the commit and in `docs/v2/reports/V2-2.md`. **No decision needed — reported
because it is mine and because a phase closed green over it.**

---

### Q60 ● — Suppression scope
*Unchanged.* Is «har sagt nei til undersøkelser» (V2:4332) an objection to **all** surveys from
the organisation, or per population / per survey type?
**Proposed: org-wide by default**, with an optional population scope once populations exist.
GDPR art. 21 is an objection to *processing*, so the default must be the broad one.
*Confirm: org-wide (recommended) / per population from the start / per survey.*

### Q61 — Member status vocabulary
*Unchanged in substance.* ▲ **The citation was wrong**: `M:0002:43` is `name text,`; the status
CHECK is at `:46`.
**Proposed: derive, do not duplicate** — `invited → Ny`, `active → Aktiv`, `inactive →
(hidden)`; `Bounce` from the latest invitation's `bounced_at`; `Reservert` from `suppressions`.
No new status column.
*Confirm: derive (recommended) / a new enum matching the bundle.*

### Q62 — Q9 amendment: sync moves from Send to Målgrupper
▲ **The draft said «substance unchanged, location changed». The substance is not what Q9
claims it is, in two ways, and both are live today.**

1. **The `feature_flags` gate does not exist.** `entra_sync`, `google_sync` and `hr_sync` are
   seeded `false` (`supabase/seed.sql:162-163`) and **read by nothing** — a whole-repo grep
   returns nine lines, none a call site. The real gate is `IMPLEMENTED_SOURCES`
   (`lib/send/registry.ts:125`), a hard-coded client constant branched on at
   `SendScreen.tsx:364`. It is not org-scoped and cannot be turned on per tenant. Q9's clause
   «sync sources gated by `feature_flags`», `03-plan.md`'s «still behind `feature_flags`» and
   **D44** all describe a mechanism no code performs.
2. **«Excel (.xlsx)» does not read xlsx.** The file input accepts `.csv,.tsv,text/csv`
   (`SendScreen.tsx:376`) and the handler is `file.text()` (`:380`); `parseRecipients` takes no
   source argument. No xlsx library is in `package.json`. The shipped label is «Excel (.xlsx)»
   and the shipped help text is «Vi leser første ark». **Q9 says «CSV / Excel / paste real in
   v1».** A real .xlsx silently produces garbage rather than refusing.

**Proposed:** amend Q9 on three points — the location moves to Målgrupper; the flag mechanism
is **built** (wire `isFlagEnabled` to the seeded rows) rather than asserted; and **«Excel» is
either implemented or renamed**. Recommendation: rename to «CSV / TSV» and refuse a real
`.xlsx` with a message, because a parser is a phase of its own and a silent wrong answer is
worse than a missing feature. D44 is corrected rather than relocated.
*Confirm: amend on all three (recommended) / location only / build the xlsx parser now.*

### Q63 ● — Populations wait for the catalogue
▲ **Suppressing the Populasjoner card does not remove populations from the phase.** Every group
card (V2:2437) and every segment row (V2:2458) renders a **population pill whose text is the
population name**, tinted from `g.pop` (V2:5047, :5051); the «Ny målgruppe» form forces a
population choice from a four-option select (V2:2470-2494). `groups` has no population column,
so the pill has nothing to render.
▲ **And there is a second, undocumented population surface**: a **«Behandlingsgrunnlag»** card
(V2:2610-2621, data :5016-5021) showing a **lawful basis per population with a count of
people** — «Kunder / Samtykke ved kjøp / 1 208 av 1 420». It appears in no v2 planning
document and a population may hold several bases.
**Proposed:** V2-3 ships groups and segments only, as before — **and the population pill
renders the design's unavailable treatment rather than a name it does not have**, with
Behandlingsgrunnlag handled the same way. Never a fabricated population.
*Confirm: split, pill unavailable (recommended) / add a population column now / ship Målgrupper
whole and wait for the catalogue.*

### Q64 — Segment freeze semantics
▲ **The bundle already states this decision's answer in its own copy, and no v2 document cites
it.** `freezeNote` (V2:5030): «Medlemskapet fryses når undersøkelsen sendes.» Every document
cites **V2:5033 instead, which is a string inside `auditRows`** — the changelog's echo, not the
card. The freeze surface is «Frosne medlemskap», `freezeRows` V2:5024-5029.
▲ **And the freeze already exists structurally for the email/SMS path.** `survey_invitations`
is a per-round snapshot: `send_round` copies each member's email and `group_id` into it at send
time, and the denominator reads that snapshot, not live membership. **Measured**: moving three
of six members to another group after send moved no denominator. So `round_audience_members` is
not needed to create the freeze — it already holds.
▲ **What is actually missing is narrower**: `survey_invitations` carries **no `member_id`**,
only a copied email string, so a round's audience cannot be joined back to people, and four
columns referencing `groups` are `ON DELETE SET NULL`, so deleting a group blanks the snapshot's
group labels.
**Proposed:** confirm materialise-at-send as the semantic — it already is — and **replace the
proposed `round_audience_members` table with the two narrow fixes**: a nullable `member_id` on
`survey_invitations`, and a decision on the `ON DELETE SET NULL` behaviour for group references
(CLAUDE.md's immutability rule, fifth instance).
*Confirm: narrow fixes (recommended) / build round_audience_members anyway / leave as is.*

### Q65 ● — How a segment rule is stored
*Unchanged and still recommended: a **structured predicate** — jsonb `{field, op, value}` over
an allowlisted field set, never free text evaluated in SQL.*
▲ One thing the draft did not settle: the bundle's rule text is **Norwegian prose**
(«stillingsprosent < 100 og ansatt før 2024», V2:4319-4322) with four prose example chips, and
nothing decides whether the rendered rule is **UI chrome** (generated from the predicate, so it
translates) **or stored content** (typed by the customer, so it does not). Recommendation:
generated from the predicate, so `en` works and the displayed rule cannot disagree with the
stored one.
*Confirm: structured + generated display (recommended) / structured + stored display string /
free text, displayed only, never evaluated.*

### Q66 ● — Retention per population
*Unchanged.* **Proposed:** retention becomes population-driven **in the same phase as
populations**.
*Confirm: together (recommended) / retention first / leave retention global.*

### Q67 ● — The mixed-population send guard belongs in the database
*Unchanged.* **Proposed:** `send_round` refuses a round spanning more than one population,
which needs populations, so it lands with Q63.
*Confirm: in `send_round` with populations (recommended) / keep the UI guard.*

---

### FOUR NEW, forced by the groundwork. **Q92 is the load-bearing one.**

**Q92 ●● — A person can belong to only ONE group. Segments break that.**
Membership is a scalar FK: `org_members.group_id` (`M:0002:45`). **There is no join table** —
`git grep group_members` returns nothing across the tree. The bundle draws the same person in a
gruppe *and* a segment (V2:4313 vs V2:4319), which this schema cannot express.
Three options, and they are not equivalent:
- **(a) Segments are never stored as membership** — a segment is a rule, evaluated at pick time
  and materialised only into `survey_invitations` at send. No schema change to membership. The
  Målgrupper count is computed, not stored.
- **(b) `group_members` join table**, `groups` gains `kind`. Expresses the bundle exactly, and
  is the largest change in the v2 series: every reader of `org_members.group_id` moves.
- **(c) Segments in a separate table** from groups, sharing nothing.
**Recommended: (a).** It matches what a segment *is* (a rule), needs no membership migration,
and the freeze already works because invitations snapshot the result. Its cost is that a
segment has no stable member list between sends.
*Confirm: (a) rule-only (recommended) / (b) join table / (c) separate table.*

**Q93 ● — Segments must not leak into the results breakdown.**
If segments become rows in `groups`, they enter the team breakdown silently: three RPCs iterate
`from public.groups g where g.org_id = v_org` **unfiltered** (`M:0042:110-114` and neighbours),
and `responses.respondent_group_id` FKs to `groups`. Every heatmap, team list and composed
report would gain segment rows. **Under Q92(a) this cannot happen and the question closes.**
Under (b) or (c) every one of those call sites needs a `kind` filter *in the same migration*.
*Confirm: closed by Q92(a) (recommended) / filter every call site.*

**Q94 — «Lagre som målgruppe» is a redaktør action on an administrator-only table.**
`groups_cud_ins` is `administrator` only (`M:0030:57`). Send is a redaktør surface. As it
stands the button refuses for the role the design shows using it.
**Proposed:** widen `groups_cud_ins` to `redaktor` — creating an audience is not a privacy
setting, and a redaktør can already send to anyone they can import. Deletion stays
administrator-only.
*Confirm: widen insert to redaktør (recommended) / keep administrator-only and disable the
button / make it an administrator request.*

**Q95 ● — Which k does the Målgrupper threshold badge compare against?**
The badge «Under terskel — resultater vises ikke» sits on an **admin tab with no survey in
scope**, so there is no `app.k_for` to call. The bundle hard-codes 5 (V2:5048, :5052 — and two
more sites the diff undercounts, V2:6543-6544 on the Send picker).
**Proposed:** the **organisation's `default_k_threshold`** (Q90's floor), because that is the
lowest threshold any *new* survey in this organisation can have, and the badge is a warning
about future surveys rather than a statement about an existing one. The copy must say so —
«under virksomhetens terskel», not «under terskelen».
*Confirm: org default (recommended) / the strictest k among the org's live surveys / no badge
outside a survey context.*

---

### Not questions — corrections V2-3 carries

| What | Correction |
|---|---|
| `03-plan.md` UI table | «Builder breach warning (V2:2561)» — **V2:2561 is not in the Builder.** It is inside Målgrupper → «Importer til en målgruppe» → `mgImportOpen`. The prescribed three-pane/sheet treatment solves a problem this screen does not have |
| Definition of done | «Census ≥630 / 38» is already met (**636 / 38**); «5a3 ≥61 of 74» has the wrong denominator (**75**) |
| `00-diff.md` § B.27 | «three v2 surfaces hard-code 5» — there are **four** rendered surfaces and six logic lines; the missed one is the Send audience picker (V2:6543-6544) |
| D44 | Says the syncs «are flagged off (`entra_sync`, …)» — no code reads those flags; and says «eleven unit tests» where there are 15 |
| Card count | The Målgrupper section draws **nine** cards; the scope table has seven rows. Two rows sit inside one card, and **Medlemmer**, **Reservasjonsliste** and **Behandlingsgrunnlag** are unlisted |

---

## Not a batch — the three threshold decisions, taken in conversation during V2-2

**These did not come from `04-decisions.md` and were not sent as a batch.** They arose while
V2-2 was executing Q58's return, and each one is recorded here so the shape is visible: a
decision reached in conversation is invisible until it is a register line, and this phase is
where that stopped being an abstraction (see `DECISIONS.md`'s header, third instance).

| # | What Tor decided | What it came out of |
|---|---|---|
| **Q58** | ONE pack key, `trakassering-ytringsklima`, seeded 8/anonymous/person/locked; `apply_pack_policy` takes `greatest(pack, org)` | The return in Batch B. Tor: the anonymity lock is «the RIGHT outcome, not a cost» |
| **Q90** | `organizations.default_k_threshold` is a **floor**, waived by `redaktor_may_lower` | D105's second clause: I asserted an absence, was told not to ship copy asserting an absence I could not demonstrate, enumerated it — and the enumeration showed the flag had no referent |
| **Q91** | The floor moves **3 → 2**, superseding Q17's floor, with prescribed copy | Tor, mid-phase, after Q90 |

**Q91's copy was prescribed rather than left to a writer, and the reason is in the decision:**
«Med terskel 2 kan den som svarer regne seg fram til hva den andre svarte» — **not** «kan være
gjenkjennelig». At 2 the property is arithmetic, not recognisability, and the softer word is
the failure Q17 calls «den eneste virkelige feilen i hele denne endringen».

**All three are in `DECISIONS.md`.** Q17 keeps its text and gains a pointer forward; Q36, Q55
and Q57 gain dated pointers where Q90 or Q91 moved the ground under them.

---

## Batches not yet sent

`docs/v2/04-decisions.md` holds the drafts. In plan order: **C** (V2-2, Q60–Q61), **D** (V2-3, Q62–Q67), **E** (V2-4, Q68–Q71), **G** (V2-6, Q74–Q75),
**H** (V2-7, Q76), **I** (V2-8, Q77), **J** (V2-9, Q78–Q82), **K** (V2-10, Q83–Q85),
**L** (V2-11, Q86–Q89).
