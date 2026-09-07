# Legal texts — DRAFT STATUS

None of the customer-facing legal texts in this repository have been reviewed by
a lawyer. They were written from the system as built, by the same process that
built it, and must get a Norwegian lawyer's read before any customer sees them.
Tor's instruction, Phase 6 acceptance: "DPA, personvernerklæring, DPIA and the
subprocessor list get a Norwegian lawyer's read before any customer sees them."

| Document | Where | Status |
|---|---|---|
| Personvernerklæring | `/personvern` — `legal.privacy*` in `messages/*.json` | DRAFT — banner shown on the page |
| Databehandleravtale | `/databehandleravtale` — `legal.dpa*` | DRAFT — banner shown on the page. **`dpa4P` was WRONG in shipped text — see below (Q55); start the review here** |
| Oversikt over underleverandører | inside both texts (privacy §7, DPA §5) | DRAFT — part of the above |
| Risikovurdering (DPIA) | not written; Administrasjon → Personvern lists it as "Ikke lastet opp ennå" | NOT STARTED |

## START THE REVIEW HERE — a DPA clause that was wrong in shipped text (Q55)

**`messages/*.json` → `legal.dpa4P`** promises, inside the databehandleravtale:

> «… terskel på fem svar før noe resultat vises, håndhevet i databasen …»

**That is a contractual commitment the product no longer keeps.** DECISIONS **Q17** made the
threshold a per-survey policy with a **floor of three** for natural persons and **no
threshold at all** for organisation respondents (`app.k_for` returns 0 by design —
`supabase/migrations/20260904000032_threshold_policy.sql:69`). The clause is therefore
breached the moment anyone sets three, and is simply absent for supplier surveys, where
attribution is the point.

This is not loose marketing copy: it is the technical-measures clause of a data-processing
agreement, so it is the first thing the review should look at.

**Q55's replacement wording**, to be reviewed rather than assumed correct:
- person surveys — «aldri under virksomhetens terskel, som aldri er lavere enn tre»;
- **a separate clause** stating that supplier responses are attributed and not covered by a
  threshold at all.

**Status and sequencing.** The corrected text lands in `messages/*.json` in **V2-0**, and
**does not go live on the strength of that commit**: `legal.draftNotice` stays up, and only
the lawyer's sign-off commit empties it. **The DPA clause is a contract, not copy.** The same
inaccuracy in non-contractual text — `legal.privacy3P`, and the splash's `"n ≥ 5"` and
pricing fine print — is corrected in V2-0 without waiting for the review.

**Recorded because it went unanswered.** D87 flagged all of these to Tor at the close of
Phase 9 and the answer did not come until the v2 planning round; he records that as his.
The failure mode is worth naming: a threshold that became a *policy* left behind a set of
sentences that had been true when it was a *constant*, and nothing in the apparatus reads
prose.

---

The `legal.draftNotice` banner renders on both pages until the key is emptied
by the reviewed text's commit — that commit is the sign-off record. Do not
remove the banner without it.
