# Proposed amendment to CLAUDE.md — invariant 1

**Status: draft for Tor's approval. Not to be implemented until committed to CLAUDE.md.**

HeiTuva is a survey and feedback product. Statutory compliance is a wedge it is built around, not the
whole of it — most surveys it runs are pulse checks, customer satisfaction, event feedback and
onboarding, where a threshold is a product setting like any other. This draft is written that way:
the general rule is general, and statute appears only where a template actually carries one.

---

## Current text (verbatim, from CLAUDE.md via ONBOARDING § 2)

> **k-anonymity, k=5, database-enforced.** Clients never select from `responses` or `answers` (no RLS
> select policy exists for them — do not add one). All result reads go through the SECURITY DEFINER
> RPCs (`aggregate_results`, `get_quotes`, heatmap RPCs) which return `insufficient_data` for any cell
> with n < 5 and strip group labels below threshold.

## Proposed replacement

> **k-anonymity, database-enforced, floor k=3.** Clients never select from `responses` or `answers`
> (no RLS select policy exists for them — do not add one). All result reads go through the SECURITY
> DEFINER RPCs (`aggregate_results`, `get_quotes`, heatmap RPCs), which return `insufficient_data` for
> any cell below the survey's effective threshold and strip group labels below it.
>
> The threshold is a per-survey policy, not a constant: **5 by default**, settable to 3, 4, 5, 8 or 10,
> and **never below 3 where the respondent is a natural person**. The floor is enforced in the
> database, not in the picker. No setting disables the threshold for natural persons.
>
> **Four conditions, all structural. None of them is about a particular statute.**
>
> 1. **The floor is a CHECK constraint.** A value below 3 for a person survey is rejected by the
>    database whatever writes it.
> 2. **The threshold is immutable once a response exists.** Otherwise a suppressed cell can be read by
>    waiting and then lowering — that turns a setting into a retrieval mechanism. Enforced by
>    constraint, not by disabling a control.
> 3. **The strictest threshold governs any report drawing on more than one survey**, enforced in the
>    RPC. In the report layer instead, invariant 1's central claim stops being true where it matters.
> 4. **A below-threshold cell never exposes its actual n**, in any role, anywhere. The count is itself
>    a disclosure about the group.
>
> **Organisations are outside k.** Where the respondent is a legal entity rather than a natural person,
> k-anonymity is not the applicable protection and attribution is usually the point — supplier
> assessments, B2B customer surveys, member organisations alike. Anonymity is locked off and shown as
> locked rather than hidden. `respondent_kind` is immutable after the first response, and no path
> reclassifies a person survey as an organisation one.
>
> **Where a template carries a statutory policy, that policy is locked** — threshold and anonymity
> both — with the statute named on the lock. This is the only place law enters the rule.
>
> **Segmenter remains refused at any threshold.** Segments are rules selecting a population, never
> labels on an answer, because k does not compose: two overlapping segments of five with an
> intersection of two disclose the two by subtraction. This is arithmetic, not compliance, and it gets
> worse at 3.

---

## Who may set it

Written on the reading that «manager» is `redaktor` — the person who owns the survey. That is Q17 § 8's
model and it is also just how a survey tool normally works:

- `administrator` sets the organisation default and owns the switch below.
- `redaktor` may set the threshold on a survey they own, within the floor, when an administrator has
  enabled it. Off by default.
- `leser` cannot. That role is aggregates-only by definition, and a reader adjusting the threshold on
  results they are reading is the one shape here that is genuinely backwards.

If «manager» meant a team leader who only reads results, this section is wrong and I need to know.

## Audit — worth doing, not a blocker

A threshold change is worth logging. It is **not** a precondition for shipping the lowering: statutory
templates are locked by the rule above, so lowering happens on ordinary surveys where no
documentation duty attaches. `mgAuditUnavailable` records that audit is unbuilt (§ 5.3); it can stay
unbuilt without holding this up.

## Consequence for copy

The respondent banner is generated from the threshold in five variants — `anon(n)`, `low`, `named`,
`org(o)`, `choose(n)` — with `low` appended below the default: «I små grupper kan svar likevel være
gjenkjennelige.» That sentence is what keeps the promise accurate once the number can move.

Scope is **Norwegian and English**. The design bundle carries `no` and `sv` and draws **no English
banner at all**, so five English variants do not exist in the drawing and must be written.
