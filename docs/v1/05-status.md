# Status — what remains across the whole specification

> **THIS FILE IS DERIVED, NOT A SOURCE. Read it to find where to look; verify against the
> source before you act on it.**
>
> The sources are **`DECISIONS.md`** (what was decided) and **the code, the migrations and
> the tests** (what exists). This file is a summary of both, written by hand, at a moment.
> **Summaries age and nobody re-measures them** — that is precisely their purpose, to save
> the reader from re-measuring, which is also why a stale row here is invisible for longer
> than a stale row anywhere else.
>
> It has happened, and the row is still below, struck: **Q31** was listed as PARTIAL after it
> had landed whole in `8b4efab`. The row survived **six** later edits to this file, was read
> as outstanding in the v2 planning round, and became decision **Q54** — a decision to fix
> something already fixed. It cost one decision rather than a phase only because V2-0's
> Gate 1 reads the code instead of this file.
>
> So: a claim here that some work is outstanding is a **pointer to check**, never a finding.
> Confirm it in the source, and if the source disagrees, the source wins and the row gets
> struck **with its evidence** rather than deleted — so the next reader can see that a status
> row outlived its subject.

**Written at V1-4's close, 2026-09-07; updated at V1-6's close and again at the
bundle's close, the same day.** The one-page summary of the whole bundle is
`docs/v1/06-closeout.md`; this file stays the detailed picture.
Not a phase report: this is the whole picture, so that the next decision is taken
against the remaining work rather than against the next phase.

Every line carries a reference. Counts are counted, not estimated. There are no
effort figures anywhere in this file — none has been measured, and a number
nobody measured is worse than no number.

**How to read the four sections.** §1 is the v1 bundle, which has a plan. §2 is
work that is *decided* — someone confirmed it and nothing was built. §3 is work
that is *known* — logged as a finding or a deviation, owned by a phase. §4 is
work that appears in `docs/` and belongs to no phase at all, which is the section
most likely to be forgotten and the reason this file exists.

---

## 1. The v1 bundle

Source: `docs/v1/03-plan.md`. Decision batches: `docs/v1/04-decisions.md:10-21`.

### Phases closed

| Phase | What it built | Report |
|---|---|---|
| V1-0 | Frame, navigation, reference harness, Q47's kernel rule | chat only |
| V1-1 | Policy panel (Q17 §1/§2), Oversikt compliance card (Q37) | chat only |
| V1-2 | Attributed results, organisation results, rounds | `docs/v1/reports/V1-2.md` |
| V1-3 | Recurrence — cadence vocabulary, pause/stop, schedules read | `docs/v1/reports/V1-3.md` |
| V1-4 | Dashboard customisation | `docs/v1/reports/V1-4.md` |
| V1-5 | Use-case library and the five packs | `docs/v1/reports/V1-5.md` |

**Two phases have no report on disk.** V1-0 and V1-1 were reported in chat before
the file convention existed (`docs/v1/reports/V1-2.md:10-11` records the offer to
backfill them). Backfilling is optional and nobody has asked; noted because "five
phases closed, three reports" otherwise looks like a gap.

### V1-4's remainder

Everything in `docs/v1/03-plan.md:331-341`'s scope table is built after the fix
pass. Two items in that table were built during the fix pass rather than the
build, and are named here because they were found by an audit rather than by a
gate:

- **The stream panel's drawn absence** (Q26). The refusal was built — no registry
  row, so no layout can name it — but the picker never offered it at all, which
  is hiding rather than drawing. Q26's own words: «the bundle sanctions drawing
  its absence, so this is not hiding a feature.» Now drawn greyed with its
  precondition, and `tests/unit/dashboard-panels.test.ts` asserts it stays
  unnamable.
- **«Frys som rapport»** (Q29, NEW:940, 3647-3650). The bundle has two controls
  and they answer different questions — the opener reads the PINS, the freeze
  reads the LAYOUT. Only the opener existed.

Nothing else from V1-4's plan is outstanding.

### V1-5 — CLOSED 2026-09-07

`docs/v1/reports/V1-5.md`. Q24, Q44 and Q45 confirmed and built; `verify:all`
returned `CHAIN_EXIT=0` in one pass. What the phase carried, for the record:

| Item | Reference |
|---|---|
| «Bruksområder» tab, six cards | NEW:1873-1897 |
| Category chips = use cases + Lovpålagt + Annet | NEW:4469, 4479 |
| Five new packs, two re-categorised | NEW:2837, 2842, 2857-2881 |
| Wizard use-case chips and filtered purposes | NEW:60-66, 4195-4197 |
| `use_cases` registry + `template_packs.use_case` | plan `:406-414` |

The CI seed assertion moves with it: `.github/workflows/ci.yml:63` currently
asserts `packs = 17`.

### V1-6 — CLOSED 2026-09-07. **The v1 bundle is finished.**

`docs/v1/reports/V1-6.md`. The carried-findings pass: seven items, no fresh
decision batch, `verify:all` returned `CHAIN_EXIT=0` on the third run (the first
was the verification pass and found the phase's real defect; the second was
stopped by a harness staleness guard).

| Item | Reference |
|---|---|
| Q49 — a round's count survives its own threshold | `M:0050`, corrected by `M:0053`; `RoundsPanel.tsx:91` |
| Q50 — the organisation's clock, computed `at time zone` | `M:0051`, `M:0052` |
| Q48(b) — next-intl for the duty and section registries | `tests/unit/registry-strings.test.ts` |
| Census manifest generation (`CENSUS_WRITE=1`) | `tests/census.ts`, `package.json` |
| `bibliotek/actions.ts`'s config path — the FOURTH one-function-two-callers | `lib/questions/pack.ts` |
| `verify:roundtrip` cleans up after itself | `scripts/verify/roundtrip.ts` |
| D102's four repair options | `docs/DEVIATIONS.md` — **open, Tor's choice** |

**Two application defects were found by the verification pass** — Q49's
user-visible half never built, and the count on a gated point being the wrong
count — and both came out of one failing assertion. `V1-6.md` § 5.

### V1-7 — DESCHEDULED 2026-09-07. **The v1 bundle finishes at V1-6.**

Moved, not dropped, and it changed shape on the way. Tor's call after the V1-5
batch: the stream panel and the expansion catalogue's **R4 (event ingestion) are
the same subject**. The panel is a READER over transactional events; R4 is the
INGESTION of them — a panel with no events shows nothing, and events with no
panel are invisible. They become one feature in two halves, **ingestion first,
panel second**, scheduled after the catalogue lands and R4 has its own decision
line. That makes the panel depend on R4, which is why it leaves this plan: a
phase here cannot depend on a document not in this repository.

**Q41 travels with it** (`04-decisions.md:48`, still DEFAULT and unconfirmed).
A window-step gate rule is a property of the ingestion side — how events are
bucketed, and how adjacent windows may differ without leaking a difference below
k — so it belongs to the half that produces the series.

**Nothing a customer sees changes.** Q26's full effect shipped in V1-4: no
`stream` row, so no layout can name the panel; the flag seeded false; and the
picker DRAWS the absence with its precondition. Lifting it needs the migration
first and the flag second, which `tests/unit/dashboard-panels.test.ts` asserts.

The scope this phase would have carried is kept verbatim in
`docs/v1/03-plan.md` so it is not re-derived: the `stream_series` SECURITY
DEFINER reader, its four k-gate negative tests, and the two-sided `app.k_for`
catalogue assertion that fails by construction until the new function calls it.
It remains the only surface in this plan that would add a k-gate reader.

---

## 2. Decided but not implemented

Walked across all 26 rows of `DECISIONS.md` numbered Q18-Q51, plus the eight
numbers in that range that live only in `docs/v1/04-decisions.md` and were never
promoted to the register.

**26 register rows: 22 implemented, 3 partial, 1 not implemented.**

### Not implemented

| # | Decision | State | Owner |
|---|---|---|---|
| **Q50** | Timezone on the organisation, computed `at time zone` | No `organizations.timezone` column. `grep -rn timezone supabase/migrations/` returns only two prose lines (`20260907000044_recurrence.sql:131,134`). `grep -rn timezone app/ lib/` returns nothing. The three sites that compute `next_run_at` still do so in UTC independently: `M:0044:249`, `M:0044:161`, `M:0045:181` | V1-6, **or sooner — a launch-facing defect** |

### Partial

| # | Decision | What is missing | Owner |
|---|---|---|---|
| ~~**Q31**~~ | Respondent language chips | **NOT PARTIAL — CLOSED, and this row was stale.** Q31 landed whole in `8b4efab` («Q31 and Q40 land»): `app/s/[token]/Respondent.tsx` renders the v1 chrome verbatim — `gap-[2px] p-[3px]` on the group, `px-2 py-[6px]`, `text-[11px] font-bold`, `--sf` for the active chip — **with both `title` and `aria-label` carrying the language name**. Measured during V2-0's Gate 1, attribute by attribute, against NEW:2322. **The row survived six later edits to this file and was still being read as outstanding in the v2 planning round, where it became decision Q54 — a decision to fix something already fixed.** Kept struck rather than deleted so the next reader sees that a status row outlived its subject | closed |
| **Q48(b)** | `duty_definitions` and `report_section_types` get a translation overlay | Deferred **by the decision itself**, so this is a schedule, not a gap. `app/(app)/rapporter/ReportsScreen.tsx:49-55` still claims the Phase 6 editor translates them, which no path does. **V1-4 changed what (b) is:** the working pattern now exists (registry holds keys, next-intl holds strings, `tests/unit/dashboard-panels.test.ts` binds them over the set) and DECISIONS.md records that the first question is whether (b) EXTENDS it rather than building an overlay | unassigned |
| **Q26** | Stream panel deferred, **absence drawn** | Closed in V1-4's fix pass — listed here because the audit found it, not the gates | — |
| **Q29** | Opener kept, **beside «Frys som rapport»** | Closed in V1-4's fix pass, same reason | — |

### Staged but never promoted to the register

Eight numbers live only in `docs/v1/04-decisions.md`. Five belong to a future
phase and are listed in §1. The other three:

| # | Subject | State | Reference |
|---|---|---|---|
| **Q38** | Personvern §8 controls | NOT IMPLEMENTED **by decision** — waits for a bundle that draws them | `04-decisions.md:45` |
| **Q39** | Undrawn report-section bodies | NOT IMPLEMENTED **by decision** — same | `04-decisions.md:46` |
| **Q40** | Amend RESPONSIVE.md's charts rule | **DONE in V1-4's fix pass.** `docs/RESPONSIVE.md:98-99` carries both clauses and the 200px floor is dropped, with the reason it was wrong | closed |

**The provenance discrepancy is reconciled.** `docs/v1/04-decisions.md` is now a
STAGING AREA, not a register: its promoted rows point at `DECISIONS.md` and the
"CONFIRMED as DEFAULT" strings were neutralised to "DRAFT RECOMMENDATION" in
V1-4's fix pass. The single surviving occurrence is `04-decisions.md:11`, which
narrates the discrepancy rather than asserting it.

---

## 3. Carried forward

### From the phase reports

**Everything V1-6 owned is closed.** What is left is listed with a real owner; nothing
here says "a future phase".

| Item | Owner | State |
|---|---|---|
| `bibliotek/actions.ts` built a pack question's `config` by hand | — | **CLOSED in V1-6** — `lib/questions/pack.ts`, one builder for both callers |
| **Q49** — `get_trends` returned no `n` for a gated point | — | **CLOSED in V1-6** — `M:0050`, corrected by `M:0053`; panel at `RoundsPanel.tsx:91` |
| D97's correction to Q43's stated reason | — | **CLOSED in V1-2's acceptance** |
| `verify:roundtrip`'s probes left rows behind | — | **CLOSED in V1-6** — `scripts/verify/roundtrip.ts` |
| **Q50** — timezone | — | **CLOSED in V1-6** — `M:0051`, `M:0052` |
| **D102** — the register panel's 0 breaches | — | **CLOSED 2026-09-07** — scope measured on prod as ZERO, option D taken. `tests/unit/register-stats.test.ts` |
| **React #418** on `bibliotek-maler/liste/mobile` | **Unowned by design** — one failure, no reproduction in V1-4, V1-5 or V1-6. Not called a flake, and nothing to do until it recurs | `reports/V1-3.md:236-268` |
| **D99** — resAttrib/resAggregate | **Waits for a customer.** Open, not settled; the answer if one asks is a named report section, not a restored screen half | `DEVIATIONS.md:1930` |

### Prod is nineteen migrations behind — **CLOSED 2026-09-07**

Measured 2026-09-07 while running D102's scope query. `heituva-prod`'s newest applied
migration is `20260905220242`; the repository's is `20260907000053`. **Nineteen migrations
are unapplied** — `0035` (Q47's peer-results org rule) through `0053` — which is every
schema change from V1-1's tail onward: the threshold ceiling, the quality-rules key, the
attributed-share scope, the pack roles, D94's k=0 fix and its sweep, the whole recurrence
series, `dashboard_layouts` and its registry, `use_cases`, Q49's count and Q50's clock.

**Applied on Tor's authorisation, 2026-09-07.** All nineteen, in order, zero failures.
Full record in `docs/OPERATIONS.md` § "Prod sync, 2026-09-07". Prod's schema is now
**identical to local byte for byte** across columns, constraints, policies, RLS tables,
normalised function bodies, grants and enums.

**The sync found two drifts that no gate could have seen**, which is the reason the
comparison mattered more than the applying:

1. `schedules.paused_at` was lost while applying 0044 — a hard-coded line offset stripped
   the file's first two statements, and nothing failed, because every later reference to
   the column is inside a plpgsql body. **A mechanical shortcut that succeeds is more
   dangerous than one that fails.**
2. `overview_activity` on prod was never the committed version and predates this session —
   a hand-applied variant declaring an `i int` the committed migration deliberately omits.
   Prod would have failed Gate 1's lint.

Both repaired. Seven security invariants verified on prod directly, advisors re-read with
no new finding. **One thing was NOT done and is a decision, not an omission: the invariant
suite was not run against prod**, because it is a fixture generator (28 `asUser` sites, 70
org inserts) and would write test users and organisations permanently into the production
database. `OPERATIONS.md` § 7 states what that leaves unproven and why a disposable
database is the right place for it.

**Also carried out of the sync:** PITR could not be taken — this session has no
management-API access — so a complete logical snapshot stood in, which was adequate only
because prod holds zero responses. **PITR is now the first item on the pre-launch gate**
(`docs/OPERATIONS.md`), to be enabled by Tor before the first real send; the substitute
expires the moment respondent data exists, because that is the one thing in this product
that cannot be regenerated.

**The remaining gap — behaviour under real RLS — is BLOCKED on a plan change.** Tor
directed it be closed on a disposable Supabase branch. Branching returned
`PaymentRequiredException: Branching is supported only on the Pro plan or above`, and a
throwaway free project (which would have served the same purpose at $0) was refused by the
free tier's two-active-project limit, both slots being held by `heituva-prod` and `gauge`.
Neither a plan upgrade nor pausing an unrelated project is mine to do. See the report for
the two ways to unblock it.

### From `docs/DEVIATIONS.md`

106 entries; most record a settled deviation and need nothing. These are the ones
with work still attached:

| # | Subject | State | Reference |
|---|---|---|---|
| **D27** | Administrator MFA deferred (Q14) | Deferred by decision. Deliberately NOT on the pre-launch list — `docs/OPERATIONS.md:76-78` | `DEVIATIONS.md:400` |
| **D88** | «Svar per virksomhet» composed and exported, table not yet drawn in the report | Still true for the REPORT section. The dashboard PANEL is drawn as of V1-4 | `DEVIATIONS.md:1670` |
| **D99** | Organisation surveys lose the aggregate half — **OPEN, not settled** | Nothing to do until a customer asks; the answer if one does is a named section, not a restored screen half | `DEVIATIONS.md:1930` |
| **D100** | Two presets seeded without the stream panel, descriptions changed | Reverts as a seed change when Q26 lifts | `DEVIATIONS.md:1952` |
| **D101** | First-run preset cards carry no illustration | The bundle's seven SVGs are keyed by array POSITION; the honest form is one per preset KEY | `DEVIATIONS.md:1983` |
| **D102** | The register panel counted 0 breaches for a survey predating `M:0040` | **CLOSED 2026-09-07.** Scope measured on prod: zero affected surveys. Option D taken — `registerStats` returns `null` with «ingen bruddspørsmål er utpekt», the panel draws «—» | `DEVIATIONS.md` D102 |
| **D103** | «Runde for runde»'s note amended, because Q49 made the bundle's sentence false on its own screen | Settled. The first time a v1 phase changed bundle copy on a decision's authority | `DEVIATIONS.md` D103 |

### Apparatus

| Item | State | Reference |
|---|---|---|
| **The census manifest is hand-maintained** — it flags a file that SHRINKS, so an entry drifting upward is invisible. V1-3 found two stale by two | **DONE in V1-6.** `CENSUS_WRITE=1` regenerates it, refuses a partial run, and never writes on an ordinary one | `tests/census.ts:55-143`, `package.json` (`census:write`) |
| **A screenshot gate cannot see a surface that was never built.** V1-6's largest defect passed Gate 3a and its visual diff, because the screen rendered exactly as its baseline did — the baseline was taken before the decision that required the change | recorded, no action; the decision-conformance section in Gate 6 is the mechanism that covers it | `docs/v1/reports/V1-6.md` § 5 |
| **THE DEMO SEED REACHES ONLY STATES THE CURRENT CODE CREATES**, so a state the code can produce but the seed never does is invisible to every gate at once. **Twice in this bundle:** (1) D102's pre-`M:0040` organisation survey — "affects nothing on the local stack or in the demo seed, both of which are created from the current pack"; (2) V1-6's multi-round survey below the threshold, which no fixture has, so Gate 3a photographs «Runde for runde» only in its ungated form. The general form is that a seed built by running the current code is a sample of the code's OUTPUTS, not of its INPUTS | **OWNED BY LAUNCH READINESS.** Not left unowned and not a phase of its own: the fixture work is one seed row plus one `routes.manifest.ts` state for the multi-round case, and it belongs beside the remote load test, which needs fixtures that are not the happy path either. **Its natural trigger is the first real organisation** — the same trigger the two deferred auth controls carry — because that is when the seed stops being the only data anyone has | `docs/v1/reports/V1-6.md` § 1.4, § 8.4; `docs/DEVIATIONS.md` D102 |
| Gate 3a's evidence now carries **five** instances of "the suite cannot see this" — the newest being that duplication is invisible to assertions checking presence rather than count | recorded, no action | `VERIFY.md:292-298` |
| **Standing question 5** — a test that fails because your own change altered the contract is not a stale test; it is the only reader that noticed the contract moved | **DONE in V1-6.** Written where the next one-line fix gets written | `tests/db/clients.ts` § 5 |
| **The bundles' copies of governing documents go stale by design.** `Designbrief_terskel_Q17.md` exists in `docs/` (amended by Q28) and inside the frozen v1 bundle (un-amended), and the frozen one reads as the more authoritative | **DONE in V1-6.** `design-reference-v1/README.md` says `docs/` governs, names the one diverged file, and carries the shell one-liner that re-checks the table | `design-reference-v1/README.md` |

---

## 4. Never scheduled

Everything in `docs/` that no phase covers. This is the section that exists
because nothing else points at these.

### Operator steps — `docs/OPERATIONS.md:11-78`

Six items in the pre-launch gate. **Item 1 is done** (Phase 7-9 migrations
applied to `heituva-prod` on 2026-09-05, ledger reconciled, `:18-47`).

| # | Step | Why the app cannot do it |
|---|---|---|
| 2 | **Leaked-password protection** — Supabase → Authentication → Passwords → HaveIBeenPwned | Auth setting; no code reads it (`:48-50`) |
| 3 | **`SUPABASE_SERVICE_ROLE_KEY`, then seed i18n against production** | The key is not on any machine that runs the seeds; `:51-56` records that the Phase 8/9 reseed was issued as raw SQL through the connector instead |
| 4 | **Turnstile widget + sign-up rate limit** — Cloudflare, then two Vercel env vars, then Supabase rate limits | With either key missing the check is skipped: right locally, **wrong in production** (`:57-64`) |
| 5 | **Entra ID** — app registration, client id/secret/tenant into Supabase | `:65-68`, steps at `:88-118` |
| 6 | **Production load test** — `scripts/verify/load.ts` is `--local` only because it submits real responses | Needs a throwaway survey in a throwaway org, an agreed window and an explicit go-ahead; it also needs a `--remote` mode that refuses to run without a named survey id (`:69-75`) |

### Legal texts — `docs/LEGAL_DRAFTS.md`

**None has been reviewed by a lawyer.** Tor's Phase 6 instruction: "DPA,
personvernerklæring, DPIA and the subprocessor list get a Norwegian lawyer's read
before any customer sees them."

| Document | State |
|---|---|
| Personvernerklæring (`/personvern`, `legal.privacy*`) | DRAFT — banner on the page |
| Databehandleravtale (`/databehandleravtale`, `legal.dpa*`) | DRAFT — banner on the page |
| Subprocessor list (privacy §7, DPA §5) | DRAFT — part of the above |
| Risikovurdering (DPIA) | **NOT STARTED** — Administrasjon → Personvern lists it as «Ikke lastet opp ennå» |

The `legal.draftNotice` banner renders until the key is emptied by the reviewed
text's commit; **that commit is the sign-off record** and the banner must not be
removed without it.

### Dependency decision — `docs/OPERATIONS.md:252-271`

**Next 16 is a decision, not a chore.** `package.json:41` pins `next: ^15.5.0`.
`postcss <= 8.5.22` under `next` carries four advisories (GHSA-qx2v-qp2m-jg93,
GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 — XSS through
unescaped `</style>`, and source-map path traversal). In this product PostCSS
runs at build time over our own stylesheets and no user input reaches it. The
only fix npm offers is **Next 16.3.4, a major upgrade**, recorded as open.

`image-size` is settled, not open: `package.json` `overrides` points it at
`stubs/image-size` so npm omits it entirely, and `tests/unit/absent-deps.test.ts`
asserts it cannot be resolved (`:254-263`).

### Expansion catalogue — R2, R3, R4

**These are not in this repository.** `grep -rn "R2\|R3\|R4" docs/ *.md` returns
nothing, and `docs/HeiTuva_Implementation_Plan.md`'s headings (`:1-260`) contain
no expansion catalogue. Their content is named in the request as: R2 twelve
packs, R3 contacts/accounts, R4 event ingestion.

**Tor's, not a gap in the build:** the catalogue was produced in conversation
and never committed — the same failure as Q17 — and he is supplying it. Nothing
here can be checked against them until it lands.

**R4 and the stream panel are reconciled as of 2026-09-07**, and the reconciling
changed the plan: they are one feature in two halves, ingestion first and panel
second, and **V1-7 is descheduled out of the v1 bundle** because the panel now
depends on a document not in this repository. See § 1.

---

## Counts

| | |
|---|---|
| Migrations | 81 (`supabase/migrations/*.sql`) |
| Deviations logged | 106 (`docs/DEVIATIONS.md`), of which D102 closed at the bundle's close |
| Decisions in the register | 48, of which 33 are CONFIRMED (Tor) (`DECISIONS.md:38`) |
| Decisions Q18-Q51 audited | 30 in the register + 4 staged only (Q38, Q39, Q40, Q41 — all V1-7's, descheduled with it) |
| UI messages per language | 1559 (`messages/no.json`, `messages/en.json`) |
| Gate 5a3 | 56 of 74 surfaces actively checked (45 RLS tables + 29 SECURITY DEFINER functions, 18 allowlisted) |
| Census manifest | 577 tests across 35 files (`tests/expected-counts.json`) |
| Capture states | 159 · responsive combinations 160 |
| v1 phases closed | **7 of 7** (V1-0 … V1-6) — V1-7 descheduled. **The bundle is finished.** |
| Phase reports on disk | 5 of 7 closed phases (V1-0 and V1-1 were chat-only) |
