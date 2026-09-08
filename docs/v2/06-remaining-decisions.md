# 06 — Every remaining decision, V2-4 to V2-11

**One document, grouped by phase, so the rest of the plan can be cleared in one reading.**
Sent 2026-09-08, after V2-3b closed.

**How to answer.** Every question below is marked one of two ways:

| Mark | Meaning |
|---|---|
| **DEFAULT-SAFE** | Take my recommendation without reading the argument if you like. Either an existing confirmed decision or a rule in `CLAUDE.md` already forces the answer, **or** the recommendation is the conservative direction — the default builds nothing and can be reversed by a later decision without unbuilding anything |
| **NEEDS YOUR ANSWER** | My recommendation has no external authority to lean on. It is a legal claim, a product judgement, a change to a frozen specification, or it decides how far the k-anonymity guarantee reaches. Getting it wrong is not a phase, it is a disclosure or a promise |

**●** marks a question touching **the security core or an aggregate path**.
**●●** marks one where that *is* the question.

**15 DEFAULT-SAFE · 12 NEEDS YOUR ANSWER · 27 total.**

*Counted from the table below rather than from memory —
`awk '/^\| # \| Phase/,/^---$/' docs/v2/06-remaining-decisions.md | grep -c 'DEFAULT-SAFE'`
and the same for the other class. The first draft of this line said 16 and 11.*

---

## The whole list, at a glance

| # | Phase | Question | Mark | Class |
|---|---|---|---|---|
| Q68 | V2-4 | Oppgaver supersedes `loop_actions` | | **DEFAULT-SAFE** |
| Q69 | V2-4 | The close guard's cascade behaviour | ● | **DEFAULT-SAFE** |
| Q70 | V2-4 | Where a task's legal basis comes from | | **DEFAULT-SAFE** |
| Q71 | V2-4 | Oppgaver's Teams notification | | **DEFAULT-SAFE** |
| **Q97** | V2-4 | **Moving a task backwards out of Lukket** | | **NEEDS YOUR ANSWER** |
| **Q98** | V2-5 | **When the blind-spot generator fires, and de-duplication** | | **DEFAULT-SAFE** |
| **Q99** | V2-5 | **Whether a group growing past k closes the task** | | **DEFAULT-SAFE** |
| Q74 | V2-6 | `helpForum` | ● | **DEFAULT-SAFE** |
| Q75 | V2-6 | Where help articles live | | **DEFAULT-SAFE** |
| Q76 | V2-7 | Test mode as a dry run through `submit_response` | ● | **DEFAULT-SAFE** |
| Q77 | V2-8 | Bruksområder's publish gate | | **DEFAULT-SAFE** |
| Q78 | V2-9 | **The live counter, as a Q28 extension** | ●● | **NEEDS YOUR ANSWER** |
| Q79 | V2-9 | The projected word cloud and its queue | ● | **NEEDS YOUR ANSWER** |
| Q80 | V2-9 | `audienceQuestions` on the projected screen | ● | **DEFAULT-SAFE** |
| Q81 | V2-9 | A projected viewport is a class RESPONSIVE.md never covered | | **NEEDS YOUR ANSWER** |
| Q82 | V2-9 | Is the live stage a separate route | | **NEEDS YOUR ANSWER** |
| Q83 | V2-10 | Four non-token colours on a pixel-perfect respondent surface | | **NEEDS YOUR ANSWER** |
| Q84 | V2-10 | **Quiz has assessment semantics** | ●● | **NEEDS YOUR ANSWER** |
| Q85 | V2-10 | Two quiz refusals are UI-only | ● | **DEFAULT-SAFE** |
| Q86 | V2-11 | BankID / ID-porten reopens Q4 | ● | **NEEDS YOUR ANSWER** |
| Q87 | V2-11 | Can a BI export honour `app.k_for` at all | ● | **NEEDS YOUR ANSWER** |
| Q88 | V2-11 | Sykefravær correlated against risk per unit | ● | **DEFAULT-SAFE** |
| Q89 | V2-11 | The integrations program: go or no-go | | **NEEDS YOUR ANSWER** |
| **Q100** | carried | **Who writes `suppressions.source = 'avmelding'`** | | **DEFAULT-SAFE** |
| **Q101** | carried | **`bounce` as a suppression source** | | **NEEDS YOUR ANSWER** |
| **Q102** | carried | **Per-field operator sets, and sending to a segment** | | **DEFAULT-SAFE** |
| **Q103** | carried | **Applying `M:0058` and `M:0060` to prod** | ● | **NEEDS YOUR ANSWER** |

Q97–Q103 are new. Q68–Q89 are the drafts in `04-decisions.md`, restated here with the
classification and with anything that has changed since they were written.

---

## V2-4 — Oppgaver

### Q68 — Oppgaver supersedes `loop_actions` · DEFAULT-SAFE

`loop_actions` is measured today as `id, org_id, survey_id, text, owner_member_id, due_at,
done, created_at` (`M:0006:116`), surfaced by `oversikt/LoopActionForm.tsx`.

**Recommend:** migrate (`text → title`, `done → Lukket`), retire the Oversikt surface, do not
run both.

**Why it is safe:** two task lists in one product is the defect shape this project has hit
repeatedly — a second store of a fact that disagrees with the first the moment one is written
alone (Q61's reasoning, one surface over). The migration is reversible; the rows are few and
carry no derived state.

### Q69 ● — The close guard's cascade behaviour · DEFAULT-SAFE

**Recommend:** the guard compares only the columns that carry meaning and refuses
`status → 'lukket'` without an assessment row. `owner_member_id` stays `ON DELETE SET NULL`
and the trigger lets that through, asserted by a negative test that deletes an owning member.

**Why it is safe despite the mark: `CLAUDE.md` already decides this, and V2-3b is the reason
the rule now covers both halves.** The note has been rediscovered **five** times, and the
fifth was mine, in FK form rather than trigger form — `ON DELETE RESTRICT` made an
organisation undeletable. The recommendation is that rule applied, not a judgement about it.
The mark is there because it is a trigger on a compliance record, not because the answer is
open.

### Q70 — Where a task's legal basis comes from · DEFAULT-SAFE

`duty_definitions` holds **4** statutory duties (measured:
`select count(*) from public.duty_definitions`).

**Recommend:** `law_ref` references `duty_definitions` where a statutory duty applies; free
text only where none does.

**Why it is safe:** Q35's precedent, and the data-not-code rule in `CLAUDE.md`. A citation
string parsed at read time is the thing that rule exists to prevent.

### Q71 — Oppgaver's Teams notification · DEFAULT-SAFE

**Recommend:** adjust the copy at V2:5198 and V2:2206. Do not ship a promise the product
cannot keep.

**Why it is safe:** D73's rule, and V2-3b just applied the same one twice — the sync line and
`unsubNote`. Reversible the day Teams lands.

### Q97 — Moving a task backwards out of Lukket · NEEDS YOUR ANSWER

**The plan says «decide and test, either way» and nothing decides it.** This is the gap.

**Why it needs you rather than a default:** it is a question about what a *closed statutory
obligation* means, not about a state machine. Closing a task under Q69 requires an assessment
row, so a closed task carries a record that somebody looked. Two readings, and both are
defensible:

- **Reopening is allowed, audited.** A task closed in error otherwise needs a new task, which
  loses the history and the assessment that explains it.
- **Lukket is terminal.** A compliance record that can be reopened is a compliance record
  whose closure means less; the honest move on an error is a new task that references the old.

**My recommendation is reopening-with-audit**, because the alternative makes a mistyped close
permanent and this product has one administrator per organisation in practice — the same
argument that decided Q96 four hours ago. But I am not confident it survives a lawyer, and it
is one word from you.

---

## V2-5 — Tasks from a survey's blind spots

Q72 and Q73 are confirmed. Two things the plan does not settle.

### Q98 — When the generator fires, and de-duplication · DEFAULT-SAFE

**Recommend:** fire **at send**, once per round, de-duplicated on (survey, round). Not
nightly, not on audience edit.

**Why it is safe:** forced by **Q64**. The audience is frozen into `survey_invitations` at
send and never re-evaluated for that round, so send is the one moment the group sizes the
task is about are the sizes that will actually receive it. Any other cadence would produce a
task about an audience the round does not have.

### Q99 — Whether a group growing past k closes the task · DEFAULT-SAFE

**Recommend:** **no auto-close.** A person closes it, with an assessment.

**Why it is safe:** forced by **Q69**. The close guard refuses `status → 'lukket'` without an
assessment row, so auto-closing would have to either bypass the guard or write a
system-generated assessment saying somebody looked when nobody did. The second is the
never-fabricate rule on a compliance record. The duty is to *assess*, not to have a big enough
group.

---

## V2-6 — Help articles and contact

### Q74 ● — `helpForum` · DEFAULT-SAFE

**Recommend:** **not built.** Ship the twelve articles and `helpContact` / `contactSent`.

**Why it is safe:** the default builds nothing, and it is reversible. V2:2091 writes the
promise «Skriv med fullt navn eller anonymt» — an unmoderated anonymous posting surface
inside a product whose selling point is a *controlled* anonymity guarantee, plus a permanent
moderation, spam, harassment, retention and takedown obligation. If a community is wanted,
buying one costs less than owning one.

### Q75 — Where help articles live · DEFAULT-SAFE

**Recommend:** a `help_articles` registry with a `jsonb` body plus translations; allowlisted
in 5a3 **with a stated reason**, checked rather than trusted, exactly as `segment_fields` and
`brand_accents` are.

**Why it is safe:** data-not-code, and `ui_messages` is for strings rather than structured
documents. The table does not exist yet (measured: `to_regclass('public.help_articles')` is
null), so nothing is being migrated.

---

## V2-7 — Test mode

### Q76 ● — A dry run through `submit_response` · DEFAULT-SAFE

**Recommend:** a dry-run flag on `submit_response` that runs every validation and returns
without inserting.

**Why it is safe despite the mark:** the recommendation only *adds* a path that writes
nothing, and the phase's five negative tests are the deliverable — no response row, no
`responded_at`, no token consumed, not reachable by `anon` without a valid token, and **the
anonymity CHECK asserted unchanged by diffing the constraint**. The alternative (a separate
preview path that never reaches the RPC) is the dangerous one: it would be a second write
path in a product whose second invariant is that there is exactly one.

---

## V2-8 — Bruksområder and the splash

### Q77 — Bruksområder's publish gate · DEFAULT-SAFE

**Recommend:** ship it. Q56 is already confirmed (strike the links), so the blocker is gone.

**Why it is safe:** the page markets nine survey types and they exist as seeded packs.

> **A correction to the draft, because the number was typed rather than measured.**
> `04-decisions.md` says «CI asserts `packs = 22`». **There is no such assertion in the
> suite**, and the measured count is **29**
> (`select count(*) from public.template_packs`). The claim it supports still holds — the
> nine types are seeded — but the evidence for it did not exist. **D110's shape, in the
> batch document itself.**

---

## V2-9 — Live mode *(blocked; four of five need you)*

### Q78 ●● — The live counter, as a Q28 extension · NEEDS YOUR ANSWER

**This is the largest open question in the plan.** `liveGuard` (V2:6147) is a true statement
about a *static* check and the design honours it. It does not cover the room: in a group of
six the audience watches `liveStage.counter` go 4 → 5 and the bars appear.

**Q28 licenses the number** — counts of people stay visible — but its four enumerated homes
are asynchronous private reads by an authenticated member. The live counter renders the same
number **continuously to a co-located audience**. What may be new is not the number but the
**increment**, watched in real time by a room that already knows who is present: **a
correlation channel rather than an aggregation**, which is a different kind of thing from
anything Q28 ruled on, and Q28 was confirmed before any projected surface existed.

**Recommend:** counter **off** below the threshold, reveal refused until n ≥ k. Both default
*on* today (V2:6138, V2:6139), so this is a default change plus a database guard.

**Why it needs you:** it is an extension of the k guarantee into a channel the guarantee was
never written for, and **the phase report will have to say the mitigation is a mitigation and
not a proof** — no gate can observe a room. That sentence is yours to accept, not mine to
write on your behalf.

### Q79 ● — The projected word cloud and its queue · NEEDS YOUR ANSWER

Three sub-questions, and my recommendation answers all three: the queue gates **every** text
rather than only flagged ones; moderation is an **administrator** action; the projected read
path goes through the **same** rule as `get_quotes` (`M:0009:176-177` — a `leser` with a
group filter is refused) rather than a second answer; and the cloud gets its own
minimum-occurrence floor, which is **not** k, because a rare word from one respondent is a
quote with the grammar removed.

**Why it needs you:** the second sub-question creates a **new read path to individual free
text** for a role that did not have one. That is a change to the role semantics in
`CLAUDE.md` invariant 4, and it should be decided rather than inherited from a moderation
feature.

### Q80 ● — `audienceQuestions` on the projected screen · DEFAULT-SAFE

**Recommend:** **not built.** Live ships with it off and unimplemented.

**Why it is safe:** it defaults off in the bundle already (V2:4338), so the default builds
nothing and changes nothing. Public UGC displayed to colleagues in a room can name a person,
be harassment, or be an aml. kap. 2A disclosure read aloud to the department — which is the
opposite of what kap. 2A requires. Reopen it with a moderation design if it is wanted.

### Q81 — The projected viewport · NEEDS YOUR ANSWER

**`CLAUDE.md` makes this a stop-and-ask by contract**, not by my judgement: below 1280px
there is no design to match, the do-not-invent rule is relaxed **only** to `RESPONSIVE.md`'s
patterns, and a projector is none of its three breakpoints. Type must scale with viewing
distance, not pixels.

**Recommend:** answer it via Q82 rather than by adding a fourth breakpoint — a chrome-free
route can carry its own type scale without touching the app's breakpoints, and
`RESPONSIVE.md` stays frozen.

**Why it needs you:** the alternative edits a specification the contract calls frozen.

### Q82 — Is the live stage a separate route · NEEDS YOUR ANSWER

v2 draws the stage inside the app shell (V2:1829) with the standard header, so **the
presenter's avatar and the org nav go on the wall**.

**Recommend:** a **chrome-free route** for the stage, with the presenter's controls staying on
the app screen. It also answers Q81, the QR's physical size, and the second-device question.

**Why it needs you:** it is a departure from what the bundle draws, on a surface with no
reference render — Gate 3a degrades to «captured and looked at» for the whole phase. That
should be your call, and it is the one answer that unblocks four other questions.

---

## V2-10 — Quiz *(blocked)*

### Q83 — Four non-token colours on a pixel-perfect surface · NEEDS YOUR ANSWER

`QUIZ_TILES` (V2:4084–4089) introduces `#F26B21`, `#2F6FB0`, `#2F7D4F`, `#B0343C`, reaching
the **respondent** surface via `respondOne.quizTiles` (V2:4768) — which is mobile-first
pixel-perfect, not RESPONSIVE.md.

**Recommend:** **new named tokens** (`--qz1…--qz4`) in the theme and `tailwind.config.ts`,
with a stated role. They are functional rather than decorative: the existing accents have
near-identical luminance and would not read from the back of a room. Contrast of `#FFFDF6` on
each is **measured and recorded** — `#F26B21` is roughly 3:1, which is large-text-only under
AA.

**Why it needs you:** it adds to the theme table in `CLAUDE.md`, which is the design system's
own contract, for one feature. The alternative — hard-coded hexes behind a deviation — is
worse, and reusing the accents defeats the purpose. But growing the token set is a design
decision and it is yours.

### Q84 ●● — Quiz has assessment semantics · NEEDS YOUR ANSWER

`certificate` (V2:6152), `quizPass` (V2:6159, default 70), `quizTries` (V2:6161, default 2).
**An employee who fails a mandatory quiz twice has produced an HR record.** Three
sub-questions: retention (a failed assessment is employment documentation with a different,
often statutory, retention and a different art. 17 answer, and `app.apply_retention` has one
survey-shaped path); who may see an individual result (the three roles were designed for
aggregate reading); and which tables.

**Recommend:** quiz lives in **its own tables** with its own RLS and its own retention.
Individual results visible to `administrator` only; the leaderboard stays team-level as drawn.

**Why it needs you:** this is the one place in the plan where the product acquires a new
*category* of data about an identified individual. The recommendation keeps «no anonymous row
can reference a person» intact rather than weakening it to «no anonymous row *of this kind*
can» — but the retention answer is a legal one, and whether HeiTuva should hold employment
assessment records at all is a business decision before it is a schema.

### Q85 ● — Two quiz refusals are UI-only · DEFAULT-SAFE

Quiz is locked while a survey is anonymous (V2:6156–6158) and refused on statutory packs
(V2:6122) — both client-side early returns today.

**Recommend:** both become database refusals in `app.guard_survey_policy`, with negative
tests.

**Why it is safe:** identical to **Q67**, already confirmed. A rule enforced only by a
disabled control is not enforced, and the recommendation is strictly the stronger direction.

---

## V2-11 — Integrasjoner *(final phase, not started)*

### Q86 ● — BankID / ID-porten reopens Q4 · NEEDS YOUR ANSWER

Q4 deferred respondent identity and reserved `survey_invitations.identity_provider`. Duty
signing today is **audit-grade** — member, timestamp, content hash — and **not** a qualified
signature.

**Recommend:** answer the legal question before the connector. The column is ready; the
meaning is not.

**Why it needs you:** what a BankID signature changes about the legal claim a signed duty
report makes is a legal question, and the product's compliance wedge is the thing being
claimed.

### Q87 ● — Can a BI export honour `app.k_for` at all · NEEDS YOUR ANSWER

V2:5225 exports «aggregerte resultater» outside every UI gate. **A BI tool's value is
slicing, and a gate that holds for the slices the product ships does not hold for slices the
customer invents.**

**Recommend:** the only safe export is one already collapsed to the gated shape — and say so
publicly rather than shipping a connector that quietly breaks the guarantee.

**Why it needs you:** it decides whether the k guarantee survives leaving the product, and the
alternative you might prefer — a controller-to-controller handover with the k obligation
transferred contractually — is a commercial and legal position, not an engineering one.

### Q88 ● — Sykefravær correlated against risk per unit · DEFAULT-SAFE

V2:5209 — **health data under GDPR art. 9**, joined to psychosocial results per unit, where a
unit can be small enough to identify a person.

**Recommend:** **not a product feature.** If a customer wants it, that is a bespoke engagement
with a DPIA, not a connect button.

**Why it is safe:** the default builds nothing and forecloses nothing. Marked DEFAULT-SAFE on
that basis alone — **if you disagree commercially, this is the one to pull out of the bulk
confirmation**, because art. 9(2)(b) is arguable for HSE duties and a different basis from
the rest of the product is a real option, not a mistake.

### Q89 — The integrations program: go or no-go · NEEDS YOUR ANSWER

Thirteen systems in the plan's table plus a public API, each larger than any phase this
project has run.

**Recommend:** V2-11 stays written as a phase and **not started** until you say so, and until
Q86, Q87, Q88 and the expansion catalogue for CRM (R4) are settled. Q72 is already answered,
so `task.created`'s payload is no longer a blocker.

**Why it needs you:** it is explicitly yours by the plan's own terms.

---

## Carried out of V2-3a and V2-3b

### Q100 — Who writes `suppressions.source = 'avmelding'` · DEFAULT-SAFE

The CHECK admits `manuell`, `avmelding`, `import`, `bounce` (measured). **Only `manuell` has a
writer.** `avmelding` is the unsubscribe link `unsubNote` (V2:5022) promises and nothing
builds.

**Recommend:** it lands with **mail templates**, which is V2-11's mail work or a phase you
name — not V2-4. Until then the value stays in the CHECK with this line as its record, because
removing it would delete the vocabulary the next author needs.

**Why it is safe:** it is a scheduling answer, and the alternative (build the endpoint now)
would put a public unauthenticated write path into `suppressions` in a phase that is not about
that.

### Q101 — `bounce` as a suppression source · NEEDS YOUR ANSWER

Q61 derives the **status** «Bounce» from `survey_invitations.bounced_at`. Nothing promotes a
hard bounce into an **objection**, and the CHECK admits the value.

**Why it needs you:** these are different things and the product should not blur them. A
bounce is a fact about an address; an objection is a decision by a person — **the same
distinction Q96 turned on four hours ago**. Auto-suppressing on bounce would record a legal
objection nobody made, and it would show as «Reservert» on the Medlemmer card, which says a
person declined when the mail server did. **My recommendation is not to promote it**, and to
keep bounce handling as a deliverability concern. But it is your call whether the value should
exist at all.

### Q102 — Per-field operator sets, and sending to a segment · DEFAULT-SAFE

V2-3a's two logged minors: the database tells `segment_field_not_allowed` and
`segment_field_unavailable` apart while the screen does not, and `lt`/`gt` are labelled «er
før»/«er etter» for fields that are not dates. Both want **per-field operator sets**, which is
a data change to `segment_fields`. Sending to a segment is the other carried item.

**Recommend:** both in **one small phase after V2-4**, or folded into V2-4 if it runs short.
They are the same table and the same screen.

**Why it is safe:** it is a scheduling answer, and the guard that makes segment-sending safe
already exists — V2-3b's catalogue derivation makes an unguarded fourth recipient source fail
in the suite rather than in production.

### Q103 ● — Applying `M:0058` and `M:0060` to prod · NEEDS YOUR ANSWER

Prod carries `M:0059` (applied 2026-09-08, fingerprinted, `docs/OPERATIONS.md`). **`M:0058`
and `M:0060` are unapplied**, so prod has no `segments`, no `segment_fields`, no
`suppressions`, no suppression guard and no `member_id` writer.

**Why it needs you:** it reaches production, which `CLAUDE.md` reserves to you. Stated as a
fact rather than a request: with one member and no groups nobody is affected today, and that
stops being true at the first real organisation.

---

## What this document does not contain

**Nothing about V2-3a or V2-3b.** Both are closed with Gate 6 reports.

**No question whose answer is already in `DECISIONS.md`.** Q52–Q67, Q72, Q73 and Q90–Q96 are
confirmed and are not restated here. If one of them looks wrong now, that is a **correction**
to the register under its own rule — it may be corrected when it misdescribes the world, never
because implementing it turned out inconvenient — and it is a separate conversation from this
one.

**No new questions invented to look thorough.** Q97–Q103 are the seven the plan leaves open
(«decide and test, either way»), the two the V2-5 generator needs before it can be built, and
the three this run surfaced and logged. Everything else came from `04-decisions.md`.
