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

## Batch F — sent 2026-09-07 · **OPEN**

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

### Flagged with the batch

**V2-4 (Oppgaver) is currently sequenced without the from-findings source**, precisely so the
statutory register — the most valuable thing in this bundle — does not wait on Q72. If Q72
lands on option 1, that split stops being necessary and the two phases could merge.
**Recommendation is still to keep them separate:** the negative tests in V2-5 *are* the phase,
and they deserve their own verification pass.

---

## Batches not yet sent

`docs/v2/04-decisions.md` holds the drafts. In plan order: **B** (V2-1, Q57–Q59),
**C** (V2-2, Q60–Q61), **D** (V2-3, Q62–Q67), **E** (V2-4, Q68–Q71), **G** (V2-6, Q74–Q75),
**H** (V2-7, Q76), **I** (V2-8, Q77), **J** (V2-9, Q78–Q82), **K** (V2-10, Q83–Q85),
**L** (V2-11, Q86–Q89).
