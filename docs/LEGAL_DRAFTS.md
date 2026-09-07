# Legal texts — DRAFT STATUS

None of the customer-facing legal texts in this repository have been reviewed by
a lawyer. They were written from the system as built, by the same process that
built it, and must get a Norwegian lawyer's read before any customer sees them.
Tor's instruction, Phase 6 acceptance: "DPA, personvernerklæring, DPIA and the
subprocessor list get a Norwegian lawyer's read before any customer sees them."

| Document | Where | Status |
|---|---|---|
| Personvernerklæring | `/personvern` — `legal.privacy*` in `messages/*.json` | DRAFT — banner shown on the page |
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

---

The `legal.draftNotice` banner renders on both pages until the key is emptied
by the reviewed text's commit — that commit is the sign-off record. Do not
remove the banner without it.
