# Legal texts — DRAFT STATUS

None of the customer-facing legal texts in this repository have been reviewed by
a lawyer. They were written from the system as built, by the same process that
built it, and must get a Norwegian lawyer's read before any customer sees them.
Tor's instruction, Phase 6 acceptance: "DPA, personvernerklæring, DPIA and the
subprocessor list get a Norwegian lawyer's read before any customer sees them."

| Document | Where | Status |
|---|---|---|
| Personvernerklæring | `/personvern` — `legal.privacy*` in `messages/*.json` | DRAFT — banner shown on the page |
| Databehandleravtale | `/databehandleravtale` — `legal.dpa*` | DRAFT — banner shown on the page |
| Oversikt over underleverandører | inside both texts (privacy §7, DPA §5) | DRAFT — part of the above |
| Risikovurdering (DPIA) | not written; Administrasjon → Personvern lists it as "Ikke lastet opp ennå" | NOT STARTED |

The `legal.draftNotice` banner renders on both pages until the key is emptied
by the reviewed text's commit — that commit is the sign-off record. Do not
remove the banner without it.
