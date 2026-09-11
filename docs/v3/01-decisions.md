# v3 — the decisions, written before anything is built

Numbered onward from **Q110**, the head of `docs/review/05-decisions.md`.

Q111–Q113 are **taken**, because they are security core rather than taste. Q114 is **not taken**
and is for Tor: it is drafted with both readings and no default, because defaulting it would
decide something about statutory surveys by omission.

---

## Q111 — TOKEN LIFECYCLE: a used invitation token gains a read-after-submit capability, scoped to its own thread

**TAKEN. This is the blocker, and it is a real change to a security boundary.**

### What is true today

An invitation token is a one-shot write credential. `rpc.submit_response` validates it, marks
`responded_at`, inserts the unlinked response, and a second attempt is refused with
`already_responded`. Nothing reads through a token after that, because nothing needed to.

### What the bundle assumes

«Lederen kan svare, respondenten ser svaret ved **neste innlogging**.» **A respondent does not log
in.** She holds a link. The sentence is not a small copy error — it describes an authentication
model the respondent surface does not have and will not get, because giving respondents accounts
would undo the thing that makes them answer.

A thread is not a thread if only one side can read it. So either the token stays valid for reading
after submission, or manager replies are write-only and the feature is a suggestion box with extra
steps.

### The decision

**An invitation token gains a read-after-submit capability, and nothing else.** Stated as five
properties, because a capability described by what it enables is an enumeration and this one will
be attacked:

1. It **reads that respondent's own thread** — the comments carrying her `invitation_id`, and the
   replies to them.
2. It **does not re-open submission.** `already_responded` stays exactly as it is.
3. It **cannot read another respondent's thread**, including in the same round.
4. It **cannot read results** — no aggregate, no quote, no answer, hers or anyone's.
5. It **expires with the round.** A closed round's token reads nothing.

Property 2 is the one to build first, because it is the one a regression would silently undo.

### Negative tests, proven failing before the capability exists

```
a used token can read its own thread                      (the capability)
a used token still cannot submit                          (already_responded holds)
a used token cannot read another respondent's thread       (scoping)
a token from another round reads nothing                   (round isolation)
an expired / closed-round token reads nothing              (expiry)
```

**Why a capability rather than a second token.** A reply link mailed separately would be a second
credential with its own lifetime, its own leak surface, and its own revocation story, to reach data
the first credential already legitimately identifies. One credential with a narrowed second verb is
a smaller change than two credentials.

---

## Q112 — A COMMENT IS A MESSAGE, NOT AN ANSWER, and the promise changes with it

**TAKEN, and it is a deliberate downgrade of a guarantee this product sells on. Written down as
such rather than absorbed.**

### What changes

Free text today is k-gated. `get_quotes` refuses below threshold and strips group labels; a manager
never reads one person's words unaggregated. **That guarantee cannot survive a comment thread and
is not meant to.** A thread is one person by construction, and a reply is a manager addressing an
individual. Identity anonymity holds — the comment carries no name in `anonymous` mode. **The
k-gate on CONTENT does not apply at all**, because there is no aggregate to hide in.

### The respondent must be told, in the words that are true

> **«Kommentaren leses som den står. Den kobles ikke til navnet ditt, men den vises ikke sammen med
> andres svar.»**

**Do not reuse the anonymity banner.** «Anonymt» and «ingen kan lese det du skrev alene» are two
promises, and today's copy makes the first while implying the second. This feature keeps the first
and removes the second. A banner that says «anonymt» over a comment box is now *technically true
and materially misleading*, which is the worst kind of true.

### Structural consequence

Comments live **outside the answers vault**: their own table, their own RLS, not reachable through
any aggregate path. Asserted **catalogue-derived** rather than by naming the functions we know
about — the sweep enumerates SECURITY DEFINER functions and asserts none of them reads the comment
table, so the next aggregate to be written fails a test in the commit that adds it (D115's shape).

---

## Q113 — OPTIONAL MODE is scoped to the SUBMISSION, not the comment

**TAKEN. This overrides the bundle's behaviour and its copy.**

The bundle stores `anon` **per question id** (`qcSaved[id].anon`) and its mode description promises
«Et valg per kommentar». Measured, not assumed — see `00-diff.md § 4.2`, where I nearly recorded
the opposite.

### Why per-comment is unsafe

A respondent who names herself on question 3 and stays anonymous on questions 1 and 2 is
**de-anonymised across the whole submission**. The comments and the answers reach the database
together, from one handler, for one response. If a named comment and an anonymous answer can be
joined — by `response_id`, or by anything that stands in for it — then her anonymous answers become
hers. She made one choice about one comment and it silently disclosed everything else she said.

### The decision

**One choice, made once, applying to everything in that submission.** The alternative Tor names —
storing a named comment with no link to the response at all — also closes the hole, and is
rejected because it makes the thread unreachable: property 1 of Q111 needs the link to find «her
own thread».

**Negative test:** no path exists by which a named comment and an anonymous answer share a
`response_id`. Written as a property over the schema, not as a check of the one writer we happen to
have.

---

## Q114 — DOES THE PACK POLICY LOCK `feedbackMode` ON STATUTORY PACKS? **NOT TAKEN. For Tor.**

Q17's pack policy already locks **anonymity** and **threshold** on a statutory pack, and
`app.guard_quiz_policy` refuses quiz there outright. `feedbackMode` is the same shape of question
and it is not obvious, so it is not defaulted.

**The reading that says LOCK IT (to `anonymous`, or to `off`):**
A psykososial kartlegging is conducted under aml. § 4-3. A manager replying individually inside it
is a channel from the employer to a named employee about what that employee said regarding their
own working environment. Even with goodwill on both sides, the reply arrives with the employment
relationship attached. The statutory survey is the one place where the product's other locks exist
precisely because the stakes are not symmetrical, and this is the same asymmetry.

**The reading that says LEAVE IT OPEN:**
Following up is what § 4-3 asks an employer to *do*. The duty engine's whole premise is that a
finding becomes an action. A respondent who writes «jeg vet ikke hvem jeg skal varsle til» and gets
an answer has been served by the law's intent, and a product that refuses to let the employer
answer is enforcing a formality against the person it protects. The verneombud signs the report;
the channel is not unsupervised.

**What I would need in order to take it, and do not have:** whether a reply inside a statutory
kartlegging is disclosable to the Arbeidstilsynet as part of the documentation, and whether a
respondent can decline the thread without declining the survey. Both are questions about the law
and the relationship, not about the schema.

**Cost of deferring:** low, and asymmetric in the safe direction. `feedbackMode` defaults to
`anonymous`; if the answer is «lock it», locking later changes one row's policy and one guard. If
the answer is «leave it open», nothing is built that has to be unbuilt. **Building the lock first
and relaxing it would be the expensive order**, so the plan assumes no lock and isolates the
decision to one migration.
