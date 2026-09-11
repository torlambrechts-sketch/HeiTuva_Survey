# v3 — the decisions, written before anything is built

Numbered onward from **Q110**, the head of `docs/review/05-decisions.md`.

Q111–Q114 are all **taken**. Q111–Q113 were taken here because they are security core rather
than taste. **Q114 was brought to Tor undefaulted, with both readings, and he took it** —
2026-09-11, second reading, with two conditions and one question sent onward rather than
answered. It is recorded below as he decided it, not as it was drafted.

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

The bundle's mode description promises «Et valg per kommentar» (`V3:5339`).

**CORRECTED IN C0: the bundle's BEHAVIOUR already agrees with this decision, and only its COPY does
not.** `00-diff.md § 4.2` first read the storage shape — `qcSaved[id].anon` — as evidence of
per-question choice. Measured properly it is not: `V3:5362` and `V3:5378` both source the flag from
`st.fbAnon`, **one submission-level toggle**, and `respondList` emits no `id` at all, so the key
never varies (D156). The bundle even contradicts its own mode description elsewhere — the Oppgaver
subtitle says the choice «styres **per undersøkelse** under Generelt».

So this is a **copy correction, not a behaviour override**. The decision below does not change; the
claim made for it weakens, and the weaker claim is the true one.

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

### THE TENSION THIS EXPOSES, WHICH GOES IN THE MIGRATION (Tor, 2026-09-11)

Rejecting «a named comment with no link to the response» because Q111's property 1 needs the link
means **the thread IS the link**. Follow it one step:

- **An anonymous RESPONSE cannot reference an invitation.** That is invariant 2, enforced by a
  database CHECK, and it is the thing the product sells on.
- **An anonymous COMMENT must.** `survey_comments.invitation_id` is not optional in `anonymous`
  mode — without it there is no thread to read back, and Q111 property 1 fails.

So an anonymous respondent who writes a comment has an `invitation_id` **on a row carrying her
words**, which is strictly more than her answers have. Two rules that read like opposites sit side
by side in one schema, and **anyone reading the second one cold sees an invariant breach and fixes
it.**

This goes in the migration, in writing, beside the column — what it is for, why it is not the same
rule, and what it costs:

> `invitation_id` scopes a THREAD, not an answer. The anonymity CHECK on `responses` forbids this
> link because an answer must not be attributable; a comment must be, or the respondent cannot read
> the reply to it (Q111 property 1). **The cost is real and is accepted deliberately: a comment is
> attributable to its author by whoever holds the database, in a way an answer is not.** That is
> why Q112's sentence on the respondent screen says the comment «leses som den står» rather than
> reusing the anonymity banner. Do not "restore the invariant" here — removing this column does not
> make comments safer, it makes the thread unreadable and the feature a suggestion box.

**What anonymity still means for a comment**: no name is *rendered*, to any role, anywhere in the
product; no join to the response exists (Q113); and the comment is outside the answers vault
(Q112). What it does not mean is *unattributable at rest*. Those are different promises and the
respondent is told the one that is true.

---

## Q114 — DOES THE PACK POLICY LOCK `feedbackMode` ON STATUTORY PACKS? **TAKEN: NO LOCK.**

**Drafted here undefaulted with both readings and brought to Tor. He took it 2026-09-11: do not
lock.** Recorded as decided, with the reasoning that decided it, because a decision that keeps only
its conclusion loses the part that survives the next question.

Q17's pack policy already locks **anonymity** and **threshold** on a statutory pack, and
`app.guard_quiz_policy` refuses quiz there outright. `feedbackMode` looked like the same shape of
question. **It is not, and the deciding point is the asymmetry the LOCK reading names in its own
favour.**

**The reading that said LOCK IT:** a psykososial kartlegging is conducted under aml. § 4-3. A
manager replying individually inside it is a channel from the employer to a named employee about
what that employee said regarding their own working environment. Even with goodwill on both sides,
the reply arrives with the employment relationship attached. The statutory survey is the one place
where the product's other locks exist precisely because the stakes are not symmetrical.

**The reading that decided it:** following up is what § 4-3 asks an employer to *do*. The duty
engine's whole premise is that a finding becomes an action. A respondent who writes «jeg vet ikke
hvem jeg skal varsle til» and gets an answer has been served by the law's intent.

**And the asymmetry argument does not reach this case.** The product's existing locks protect the
employer's **SIGHT** — what a manager may see, of whom, below which threshold. `feedbackMode`
governs the employer's **REPLY**. Those are not the same power and the lock that is right for the
first is not automatically right for the second. Refusing an employer the ability to answer
«jeg vet ikke hvem jeg skal varsle til» enforces a formality **against the person the rule
protects**.

### Two conditions, built with it — asserted, not assumed

1. **A respondent can decline the thread without declining the survey.** On a statutory pack the
   comment field is **never required**. This is a test, not a convention: the phase asserts that no
   configuration of a statutory pack can make a comment a precondition of submitting.
2. **A thread inside a statutory survey is visible to the verneombud on the same footing as the
   rest of the documentation** — the supervision mechanism that already exists, not a new one. The
   channel is supervised because the role that signs the report can read it.

### The third question is not settled, and this line says so

**Whether a reply inside a statutory kartlegging is disclosable to the Arbeidstilsynet as part of
the employer's documentation is a question about the law, and it is not answered here.** It goes on
the lawyer's list beside the four texts. Nothing in this phase depends on the answer — a reply is
stored, readable by the roles named above, and retained like the rest of the round — but **nobody
should read «no lock» as «disclosure is settled».** It is not, and the difference matters if the
answer comes back as «yes, and the respondent must be told so up front», because that is a copy
change on the respondent screen and it is cheap only while it is known to be open.
