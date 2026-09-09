# 08 — V2-11 (Integrasjoner, the public API, the webhooks): opening note and risk register

**2026-09-09. OPENED, NOT BUILT.** Q89 and Q103 are Tor's, and this is the one phase where
*«not started without my go-ahead»* has been in the instruction since the first day. **No
migration, no route, no component, no test has been written for it.**

Position checked first: `git merge-base origin/main HEAD` = `3b7cef5` = `origin/main` head.

---

## 1. WHAT THE PLAN GOT WRONG — a fourth phase running

### 1.1 «Fifteen external systems» — it is FOURTEEN

`03-plan.md § V2-11` opens: *«fifteen external systems is larger than any phase this project
has run and is a program.»* Parsed from `intGroups` (V2:5200-5224):

```
python3 - <<'PY'   # the command, so the number is derivable
import re; src=open('design-reference-v2/heituva-survey-app-design/project/HeiTuva.dc.html').read()
blk=src[src.index('intGroups: ['):src.index('intConnected:')]
print(len(re.findall(r'\["([a-z]+)","([^"]+)","[^"]*","([^"]+)","([^"]*)","([^"]+)"\]', blk)))
PY
→ 14
```

The conclusion does not change — fourteen is still a program — but the number was never
measured, and this register is the document that decides what gets built, so it is measured
here.

### 1.2 The screen is a TAB, and it displaces the one this project built

`adminTabs` (V2:4889) draws **eight** tabs and `integrasjoner` is the sixth. The built rail
also has eight (`app/(app)/administrasjon/layout.tsx:57-77`) — but they are not the same eight:

| Bundle | Built |
|---|---|
| firma · profil · brukere · malgrupper · grupper · **integrasjoner** · personvern · valg | firma · profil · brukere · grupper · malgrupper · personvern · valg · **sprak** |

`sprak` is the translation editor, which v1 added and no bundle draws in this rail. So V2-11
does not «add a tab»: it makes the rail **nine**, or it forces a decision about `sprak`. Not a
question this register answers; recorded because the plan treats the screen as additive.

### 1.3 The drawn screen ASSERTS FOUR LIVE CONNECTIONS

By default status, from the same parse: **4 «Tilkoblet», 2 «Trenger oppsett», 8 «Ikke
tilkoblet»** — and `intConnected` (V2:5236) renders «**4 aktive tilkoblinger**» from a
hard-coded `{entra:1, hr:1, teams:1, brreg:1}`.

**None of the four exists.** Measured: `entra_sync`, `google_sync` and `hr_sync` are
`feature_flags` rows seeded **false**
(`select key, enabled from feature_flags where org_id is null`), and there is no row of any
kind for `teams` or `brreg`. **This is `docs/v2/00-diff.md § 0.3`'s claim-set rule at its
sharpest**: the screen's default state is a claim that the product is already connected to
Microsoft Entra, an HR system, Teams and Brønnøysund. Built as drawn, it ships four false
statements on the administrator's own settings page.

### 1.4 A help article already describes this screen

`koble-til-hr-og-lonnssystem` (`requires_flag = 'hr_sync'`, V2-6) says *«Integrasjonssiden
viser hvilke felter vi henter fra hvert system»* — help text about a screen that does not
exist, shipped honestly because the flag is off and D117's «not built yet» line renders.
**When the screen is built, that article's copy becomes checkable and must be re-swept** —
CLAUDE.md's ADDING A BUNDLE step 7, on a surface rather than on a bundle.

---

## 2. `threshold.breached` NAMES A MECHANISM THAT DOES NOT EXIST

**Tor's correction, 2026-09-09, and it is the register's most consequential entry.**

The bundle lists six webhook events (V2:5243-5250). Five describe things that exist or plainly
could. The sixth does not:

> `threshold.breached` — «Funn under terskel — kan utløse undersøkelsesplikt»

**Q72 REJECTED that trigger.** What `app.generate_blind_spot_tasks` fires on is a survey having
a **group that will never receive its own results** — an audience-size condition, *a count of
people*, per Q28 — **not a finding falling below threshold.** D114 corrected two drawn
sentences for exactly this reason and `tests/db/help.test.ts` bans «Funn under terskel» from
the help articles.

So the webhook as drawn is worse than unbuilt: **it would export, to a customer's own systems,
the claim that HeiTuva detects sub-threshold findings** — the one thing the k-gate exists to
prevent anyone from learning. A payload capable of firing it would have to know something no
RPC in this product will tell it.

**If it should exist at all it needs a different name and a different payload**, and that is an
**OPEN QUESTION in this register, not a connector to build.** The honest shape, if wanted, is
something like `survey.blind_spot_detected` carrying a survey id and nothing else — no group,
no count, no finding. Whether even that is wise is Tor's call: a webhook is an export path, and
this one exports the existence of a compliance risk.

**The other five, checked against what exists:**

| Event | State |
|---|---|
| `survey.completed` | `survey_rounds.status = 'closed'` exists; a close already fires `app.freeze_round` (V2-5). Buildable |
| `response.received` | «uten innhold» — a count, per Q28. Buildable, and the copy is already correct |
| `task.created` | `tasks` exists (V2-4). Buildable |
| `task.overdue` | `tasks.due_at` exists; **nothing computes overdue on a schedule.** Needs a cron job that does not exist |
| `report.signed` | `duty_signers` / `sign_duty` exist (Phase 5). Buildable |
| `threshold.breached` | **§ 2 above — does not exist and should not be built as named** |

---

## 3. THE RISK REGISTER — fourteen connectors

**Order is by what each one READS, not by customer demand**, because the reading is what
creates the obligation. Level is the bundle's own (`Nivå 1-3`, `Lovpålagt`).

### 3.1 Group A — identity and directory. *Read: who works here.*

| # | Connector | Reads | Lawful basis | DPA consequence | Must be true first |
|---|---|---|---|---|---|
| 1 | **Entra ID** (Nivå 1) | navn, e-post, gruppe, stilling, sluttdato | Art. 6(1)(f) / (b) — administering an employment relationship | A **sub-processor entry** (Microsoft) in both texts; the transfer is intra-EU if the tenant is | **Entra SSO app registration** (`docs/OPERATIONS.md § Entra ID SSO`) — the same registration the launch gate already needs. SCIM is a second, larger thing than SSO and the plan conflates them |
| 2 | **Google Workspace** (Nivå 1) | navn, e-post, organisasjonsenhet | Same | Sub-processor entry (Google); **US transfer unless the tenant is EU-resident** — a DPA question, not an engineering one | Q6's EU-residency invariant applied to a directory. **Blocked on that, not on code** |

**Both write `org_members` and `groups`**, which V2-3a made `kind`/`source`-aware precisely so
a synced group is distinguishable from a hand-made one. That groundwork exists.

### 3.2 Group B — HR, pay and absence. *Read: facts about a person that this product has never held.*

| # | Connector | Reads | Lawful basis | DPA consequence | Must be true first |
|---|---|---|---|---|---|
| 3 | **HR-system** (Nivå 1) | stillingsgruppe, ansiennitet, stillingsprosent, **kjønn** | (f), and **`kjønn` is not art. 9 but is close enough to need its own line** | A new **category of personal data** in both texts; ARP reporting is its purpose and that purpose must be written | **Q65's `segment_fields`** already declares these fields `available = false`, which is the honest state. Making one available is a decision per field |
| 4 | **Lønnssystem** (**Lovpålagt**) | lønn **aggregert per stillingsgruppe** | Likestillingsloven § 26 / ARP — a statutory duty, so (c) | Pay data, even aggregated. The DPA must say *aggregated per group, never per person*, and **that sentence must be true in the schema, not only in the text** | **A decision that the aggregation happens BEFORE ingestion.** If a per-person figure ever enters this database the promise is false whatever the UI shows |
| 5 | **Sykefravær** (Nivå 2) | fraværsprosent per enhet | **Art. 9 — health data.** (f) is not available; needs (b)+(9)(2)(b) or explicit consent | **DPIA REQUIRED, and the DPIA is not started.** A new special-category processing in a product whose current DPIA does not exist | **The DPIA, first.** This connector cannot be scoped before it |

**`dataFlowNote` (V2:5251) is the promise all three rest on:** *«Lønn hentes aggregert per
stillingsgruppe, aldri per person. Anonyme svar kobles aldri mot data fra andre systemer.»*
The second clause is the k-anonymity invariant restated as an integration rule, and it is the
one a joined dataset would break silently.

### 3.3 Group C — notification and collaboration. *Read: nothing. Write: outward.*

| # | Connector | Reads | Lawful basis | DPA consequence | Must be true first |
|---|---|---|---|---|---|
| 6 | **Teams** (Nivå 1) | varsler, oppgavekort | (f) | Sub-processor entry; **message content leaves the EU boundary unless the tenant is EU** | **Q71 is already CONFIRMED as «not built»** and «varsles eieren i Teams» was corrected out of the help articles as a false claim (D117). This connector makes that claim true — the copy must be re-corrected *back*, deliberately |
| 7 | **Slack** (Nivå 1) | same | (f) | Sub-processor; **Slack is US-resident.** Q6's invariant is the blocker | Same as Teams, plus the residency question Google raises |
| 8 | **Kalender** (Nivå 3) | møtetid, frist, eier | (f) | Sub-processor entry only | Nothing structural. **The smallest connector in the set** |

**These three are the safest in the register** — they read nothing from the vault and export
only what a notification carries. If any integration ships first, it is one of these.

### 3.4 Group D — signature and archive. *Read: identity, for a legal act.*

| # | Connector | Reads | Lawful basis | DPA consequence | Must be true first |
|---|---|---|---|---|---|
| 9 | **BankID / ID-porten** (**Lovpålagt**) | navn, signaturtidspunkt | (c) — a signature on a statutory document | A **national eID**; its own agreement, not a DPA clause | **Q4's deferred identity decision, reopened.** The plan says so and it is right. `duty_signers` already records who signed; BankID changes what that record MEANS |
| 10 | **Sak og arkiv** (Nivå 2) | rapport-PDF, metadata | (c) for a public body, (f) otherwise | Sub-processor per system; **archive systems are often on-premises**, which changes the shape entirely | `report_exports` exists. A push target is an adapter, like `lib/mail/` |

### 3.5 Group E — supplier and customer. *Read: other organisations, not people.*

| # | Connector | Reads | Lawful basis | DPA consequence | Must be true first |
|---|---|---|---|---|---|
| 11 | **Brønnøysund / Proff** (Nivå 3) | orgnr, bransje, land | **Not personal data.** Public register | **None** — no DPA consequence at all | Nothing. **The cheapest connector in the register, and the only one with no privacy surface** |
| 12 | **Sanksjonslister** (Nivå 3) | treffliste | (c) — Åpenhetsloven aktsomhetsvurdering | A **match is an allegation about a named party**; retention and correction rules needed | A decision about **false positives**: what the product does when a supplier matches. That is a product question, not a feed |
| 13 | **CRM** (Nivå 3) | kunde-e-post, sakstype | (f) | Customer contacts are a **new data subject class** — this product currently holds employees | **R4 / R3, which are not in this repository.** Blocked on a document Tor supplies |
| 14 | **Power BI / Tableau** (Nivå 2) | aggregerte resultater | (f) | Export of aggregates; **the k-gate must hold on the way out** | **The public API and its k-gate**, i.e. § 4. This is not a connector, it is a consumer of the API |

---

## 4. THE PUBLIC API AND THE KEY — what is actually being asked for

`apiKey` renders `ht_live_9f2c··············a41` with a reveal toggle (V2:5240-5242). Nothing
in this product issues, stores, hashes, scopes or revokes an API key.

**The three things that must exist before an API key does:**

1. **A key table with the token-hashing rules of `survey_invitations`** — SHA-256 at rest,
   constant-time compare, expiry (CLAUDE.md invariant 5). A key is a longer-lived token than
   anything this product has issued.
2. **A scope model.** «Read aggregates» and «read the audience list» are different powers, and
   an unscoped key is the administrator's whole account in a string.
3. **THE K-GATE ON THE WAY OUT.** Every result read in this product goes through a SECURITY
   DEFINER RPC that gates on `app.k_for`. An API that bypassed them would be a second read path
   past the invariant — the shape invariant 2 forbids for writes, applied to reads.
   `tests/invariants/threshold-policy.test.ts:441-462` would catch a new SECURITY DEFINER
   function; **it would not catch a service-role query in an API route**, and that is the gap to
   close before any of this is written.

---

## 5. WHAT WOULD HAVE TO BE TRUE BEFORE ANY OF IT IS BUILT

1. **Q89** — Tor's go-ahead, which this phase has required since day one.
2. **The DPIA exists** (`docs/LEGAL_DRAFTS.md`: NOT STARTED). Connector 5 cannot be scoped
   without it and connectors 3–4 should not be.
3. **The four legal texts are reviewed**, because eleven of the fourteen add a sub-processor
   and the DPA's sub-processor list is one of the four.
4. **Q6's EU-residency invariant is applied per connector**, which blocks Google, Slack and
   probably CRM on a decision rather than on code.
5. **R2/R3/R4 land in this repository.** Connector 13 depends on a document that is Tor's to
   supply, and § 6.1 of `docs/v1/05-status.md` has said so since the v1 close-out.
6. **The API's k-gate question (§ 4.3) is answered** before an endpoint exists, not after.

**And a scheduling observation, offered because the register makes it visible:** connectors
**8 (Kalender), 11 (Brønnøysund)** and the three safe notification targets have **no privacy
surface and no blocking dependency**. If V2-11 is ever cut down to something shippable, that
is where it is — and it is a different phase from the one the plan describes.

---

## 6. NOTHING WAS BUILT

`git status` shows this file and no other change for V2-11. No migration, no route, no
component, no test, no flag row.
