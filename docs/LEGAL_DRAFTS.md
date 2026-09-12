# Legal texts — DRAFT STATUS

None of the customer-facing legal texts in this repository have been reviewed by
a lawyer. They were written from the system as built, by the same process that
built it, and must get a Norwegian lawyer's read before any customer sees them.
Tor's instruction, Phase 6 acceptance: "DPA, personvernerklæring, DPIA and the
subprocessor list get a Norwegian lawyer's read before any customer sees them."

| Document | Where | Status |
|---|---|---|
| Personvernerklæring | `/personvern` — `legal.privacy*` in `messages/*.json` | DRAFT — banner shown on the page. **`privacy8P` names the DEMO ORGANISATION as the contact and `privacy7P` names the wrong email provider — both in shipped public text, see the section at the end (V5-1)** |
| Databehandleravtale | `/databehandleravtale` — `legal.dpa*` | DRAFT — banner shown on the page. **`dpa4P` has been WRONG TWICE in committed text (Q55, then Q91) — see the table below; start the review here** |
| Oversikt over underleverandører | inside both texts (privacy §7, DPA §5) | DRAFT — part of the above |
| Risikovurdering (DPIA) | not written; Administrasjon → Personvern lists it as "Ikke lastet opp ennå" | NOT STARTED |

## START THE REVIEW HERE — the same DPA clause has now been wrong TWICE

**`messages/*.json` → `legal.dpa4P`**, the technical-measures clause of the
databehandleravtale, has carried two different false numbers in committed text. The
history is the finding; the current wording is only the third attempt at it.

| # | Wording | Committed | Made false by | How long it stood |
|---|---|---|---|---|
| 1 | «terskel på **fem** svar før noe resultat vises, håndhevet i databasen» | Phase 6 | **Q17** — the threshold became a per-survey policy with a floor of three, and `app.k_for` returns **0** for organisation respondents (`supabase/migrations/20260904000032_threshold_policy.sql:69`) | Q17 (Phase 8) → `a8f88f1` (V2-0). D87 flagged it at the close of Phase 9; the answer came in the v2 planning round. |
| 2 | «virksomhetens egen terskel, aldri lavere enn **tre**» | `a8f88f1` (V2-0), on Q55's instruction | **Q91** — the floor moved to two (`supabase/migrations/20260907000055_threshold_floor_two.sql`) | `a8f88f1` → V2-2, i.e. two phases |
| 3 | «virksomhetens egen terskel, aldri lavere enn **to**» | V2-2 | — | current |

**Read that table before reading the clause.** Two independent authors, two different
numbers, the same failure: *a contract that names a bound the product is free to move.*
Version 2 was written by the correction to version 1 and was false within two phases —
which is why "is the number right now?" is the wrong question for the reviewer to answer.

**The question for the lawyer.** Should this clause carry a numeral at all? The three
candidate shapes, none of them chosen here, because the choice is legal rather than
technical:

- **(a) Name the number** — what versions 1–3 do. Accurate only until the product bound
  moves, and it has moved twice.
- **(b) Name the mechanism, not the number** — «resultater vises først når antallet svar i
  gruppen når virksomhetens terskel, håndhevet i databasen; terskelen framgår av
  virksomhetens innstillinger». Cannot go stale; states less.
- **(c) Name the number in an annex** that the DPA references, so a change is an annex
  revision rather than a breached clause.

**A second inaccuracy, still live in both texts.** «Terskel» is only meaningful for
natural persons. Organisation respondents are **attributed by name with no threshold at
all** — deliberate, and stated in `privacy3P` and `dpa4P` since `a8f88f1`. A reviewer
reading only the threshold sentence will still read it as universal; whether the two
clauses are separated clearly enough is a drafting question for the review.

**And a third number now enters the same clause family.** Q91 permits a threshold of **2**,
at which the aggregate is, in practice, personal data — a respondent can derive the other
answer by subtraction. `admin.thresholdTwoGdpr` states that at the point of choosing. The
DPA does not mention it. **Whether a processing agreement can promise "threshold" as a
technical measure while the product permits a value that discloses is the single most
important thing on this page**, and it is not a question this repository should answer.

**Status and sequencing.** Corrected text lands in `messages/*.json` and **does not go live
on the strength of that commit**: `legal.draftNotice` stays up, and only the lawyer's
sign-off commit empties it. **The DPA clause is a contract, not copy.** The same inaccuracy
in non-contractual text — `legal.privacy3P`, `reports.dutyThreshold`,
`admin.orgThresholdNote`, `admin.anonExplainer`, and the splash's `"n ≥ 5"` and pricing fine
print — is corrected without waiting for the review.

**What now guards it, and what does not.** `npm run verify:copy`
(`scripts/verify/threshold-copy.ts`) fails the build when a **non-interpolated** string puts
a numeral near a threshold word, and `legal.privacy3P`, `legal.dpa4P` and
`reports.dutyThreshold` sit on its allowlist with the constraint their number comes from
named — so the next floor change finds them by grep rather than by memory. **It cannot tell
whether the number is right**, only that a fixed number is present and was reasoned about. A
review that relies on the gate has misunderstood it.

**A second clause now needs the reviewer, and it is not about the threshold.**
`legal.dpa9P` states that a signed copy of the agreement, carrying the customer's
name and date, **«finnes under Administrasjon → Personvern og GDPR →
Dokumentasjon»**. That surface exists and renders four document rows, each with a
not-yet-uploaded meta line, under `admin.docsComing` — *«Dokumentopplasting
kommer i en senere fase»* (`app/(app)/administrasjon/personvern/page.tsx:37`,
`:74`). **The DPA asserts, in the present tense, that a document is in a place
where no document is.** V2-4's copy sweep found it.

It is a draft inaccuracy rather than a shipped false promise — `draftNotice`
holds the whole page — and it is recorded here rather than fixed because the two
honest repairs are a lawyer's choice, not a developer's: either the clause moves
to the future tense, or the surface has to carry the document before the notice
comes down. **The second reading is the one that matters: emptying `draftNotice`
while `docsComing` still renders would make the contract false at the moment it
becomes a contract.** The sign-off commit must check that row.

---

The `legal.draftNotice` banner renders on both pages until the key is emptied
by the reviewed text's commit — that commit is the sign-off record. Do not
remove the banner without it.

---

## TWO NEW FINDINGS IN SHIPPED, PUBLIC TEXT — found by V5-1's footer sweep (2026-09-12)

Neither is a drafting question. Both are **factual errors in committed copy on a page the
middleware makes public** (`path === '/personvern'`), and both were found while checking whether
the v5 footer's «Data lagres i EØS» claim was true — which is how a footer sweep reaches a privacy
notice: the footer asserts a residency fact, and § 7 is where that fact is actually listed.

### 1 · `legal.privacy8P` («Kontakt») NAMES THE DEMO ORGANISATION

```
privacy8P: "Nordisk Studio AS, Storgata 12, 0155 Oslo. personvern@heituva.no."
```

**«Nordisk Studio» is `ORG_PRIMARY` in `tests/db/personas.ts` — the demo fixture's company.** The
contact section of the privacy notice gives a data subject the demo org's name, a street address
that belongs to nobody, and an invented mailbox on a domain this project has recorded twice as
«not HeiTuva's domain and never was».

This is the sharpest form of the never-fabricate rule, because **the whole purpose of a contact
section is to be actionable**: a data subject who cannot reach the controller has no route to any
of the rights the section above it enumerates. A fabricated value here does not merely mislead —
it removes the remedy.

**IT CANNOT BE FIXED FROM HERE, and that is the point of recording it rather than editing it.** The
replacement needs HeiTuva's registered entity name, its registered address and a mailbox confirmed
to RECEIVE. Inventing any of the three would be the same error with better spelling. What is needed,
exactly:

- the legal entity name as registered in Brønnøysund, and its organisation number;
- the registered address;
- a mailbox that receives — the existing `personvern@heituva.no` is already held under the standing
  rule that a `.com` which bounces is worse than a `.no` that is at least someone's inbox.

### 2 · `legal.privacy7P` («Underleverandører») NAMES THE WRONG EMAIL PROVIDER

```
privacy7P: "… Amazon Web Services (e-post — Stockholm), LINK Mobility (SMS — Norge) …"
```

**Email goes to BREVO, not AWS.** Q6a superseded Q6's Amazon SES; SES survives only as a dormant
adapter behind `MAIL_PROVIDER=ses`, and the production consumer has been the Brevo path since
2026-09-10, proven by two delivered invitations. **Brevo is French, not Stockholm.**

A sub-processor list is a disclosure a data subject is entitled to rely on, and this one names a
company that processes none of their mail and a country it does not pass through. France is EØS, so
the **residency promise survives** — which is worth stating plainly, because it means the footer's
«Data lagres i EØS» is true while § 7's account of *how* is wrong.

Two further rows want the reviewer's eye for the same reason:

- **LINK Mobility (SMS — Norge)**: SMS is behind a feature flag and no message has ever been sent.
  A sub-processor that processes nothing is not a disclosure, it is a plan.
- **Cloudflare (bot-beskyttelse på forsiden)**: this one IS live — `challenges.cloudflare.com` is in
  the deployed CSP — so it stays.

**Why this reached shipped text and no gate saw it:** `verify:copy` reasons about thresholds, and
`verify:i18n` compares rendered text against the message set — so a message whose *content* is
false about the world is invisible to both. The gates protect schema and data. **Nothing mechanical
protects prose**, which is the sentence CLAUDE.md already carries, arriving here for the fourth
time: ten false sentences in the help articles, eleven in Bruksområder, three in the v5 integration
rows, and now two in the privacy notice.

