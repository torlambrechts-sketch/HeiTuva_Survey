# Status — what remains across the whole specification

**Written at V1-4's close, 2026-09-07.** Head `0276fd0` plus the V1-4 fix pass.
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
| V1-4 | Dashboard customisation | this session's report |

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

### V1-5 — Use-case library and five packs

`docs/v1/03-plan.md:389-430`. Decision batch **Q24, Q44, Q45** (`04-decisions.md:31, 51, 52`)
— all three are DEFAULT and none has been confirmed.

| Item | Reference |
|---|---|
| «Bruksområder» tab, six cards | NEW:1873-1897 |
| Category chips = use cases + Lovpålagt + Annet | NEW:4469, 4479 |
| Five new packs, two re-categorised | NEW:2837, 2842, 2857-2881 |
| Wizard use-case chips and filtered purposes | NEW:60-66, 4195-4197 |
| `use_cases` registry + `template_packs.use_case` | plan `:406-414` |

The CI seed assertion moves with it: `.github/workflows/ci.yml:63` currently
asserts `packs = 17`.

### V1-6 — Carried findings

`docs/v1/03-plan.md:432-462`. **No decision batch and no design work** — Q37's two
Oversikt surfaces were its only drawn scope and moved to V1-1. Its content is §3
of this file plus whatever V1-5's fix pass adds. Its size is not knowable now,
which is why it keeps a phase rather than being folded into V1-5.

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
| **Q31** | Respondent language chips: active locales, **bundle chip chrome adopted** | The COUNT rule is built (`app/s/[token]/page.tsx:49-62`, `lib/i18n/locales.ts:15`). The CHROME is not: the bundle is 11px / weight 700 / `padding:6px 8px` with `title` and `aria-label` carrying the language name (NEW:2322); the app renders 12px / semibold / `px-[13px] py-[7px]` and **no `title` or `aria-label`** (`app/s/[token]/Respondent.tsx:153-170`). The missing name attribute is the part that matters — a two-letter code with no accessible name is what the bundle's `title` exists to prevent. No deviation logged | unassigned |
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
| **Q40** | Amend RESPONSIVE.md's charts rule | **NOT IMPLEMENTED, and this one is an oversight rather than a wait.** `docs/RESPONSIVE.md:90-91` still reads "minimum height 200px"; the decided replacement (never smaller than the design draws it, never below 44px per interactive mark, drop the 200px floor) was never written in | unassigned |

**One provenance discrepancy worth reconciling.** `DECISIONS.md` marks Q28, Q31,
Q32 and Q36 as flat **CONFIRMED (Tor)**; `docs/v1/04-decisions.md` marks the same
four as "CONFIRMED as DEFAULT", which is weaker. The register is the authority,
so nothing is wrong today — but two files disagree about how firmly four
decisions are held, and the weaker one is the file a future phase reads first.

---

## 3. Carried forward

### From the phase reports

| Item | Owner | Reference |
|---|---|---|
| `bibliotek/actions.ts` builds a pack question's `config` by hand while the wizard uses `configFor` — `statements` and `multi` survive one path and are lost on the other | V1-6 | `reports/V1-2.md:299-301` |
| **Q49** — `get_trends` returns no `n` for a gated point, so «Runde for runde» shows less than Q28 permits | V1-6 | `reports/V1-2.md:302-306`, `04-decisions.md:54` |
| D97's correction to Q43's stated reason | V1-6 | `reports/V1-2.md:307` |
| `verify:roundtrip`'s `dsr_requests` and `profiles` probes leave rows behind | V1-6 | `reports/V1-2.md:309-311` |
| **React #418** on `bibliotek-maler/liste/mobile` — one failure, nine targeted reproductions and a clean full re-run, cause **not established**. Not called a flake | V1-4 → unresolved, carry to V1-5 | `reports/V1-3.md:236-268, 375-377` |
| **Q50** — timezone | V1-6 or sooner | `reports/V1-3.md:381` |
| **D99** — resAttrib/resAggregate, open rather than settled | V1-6 | `reports/V1-3.md:382` |

### From `docs/DEVIATIONS.md`

103 entries; most record a settled deviation and need nothing. These are the ones
with work still attached:

| # | Subject | State | Reference |
|---|---|---|---|
| **D27** | Administrator MFA deferred (Q14) | Deferred by decision. Deliberately NOT on the pre-launch list — `docs/OPERATIONS.md:76-78` | `DEVIATIONS.md:400` |
| **D88** | «Svar per virksomhet» composed and exported, table not yet drawn in the report | Still true for the REPORT section. The dashboard PANEL is drawn as of V1-4 | `DEVIATIONS.md:1670` |
| **D99** | Organisation surveys lose the aggregate half — **OPEN, not settled** | Nothing to do until a customer asks; the answer if one does is a named section, not a restored screen half | `DEVIATIONS.md:1930` |
| **D100** | Two presets seeded without the stream panel, descriptions changed | Reverts as a seed change when Q26 lifts | `DEVIATIONS.md:1952` |
| **D101** | First-run preset cards carry no illustration | The bundle's seven SVGs are keyed by array POSITION; the honest form is one per preset KEY | `DEVIATIONS.md:1983` |
| **D102** | The register panel counts 0 breaches for a survey predating `M:0040` | Affects `heituva-prod` surveys only. The repair is a decision; the thing that makes it safe to leave is the panel distinguishing "no breach question designated" from "no breaches found", which it does not | `DEVIATIONS.md` (new) |

### Apparatus

| Item | State | Reference |
|---|---|---|
| **The census manifest is hand-maintained** — it flags a file that SHRINKS, so an entry drifting upward is invisible. V1-3 found two stale by two. The fix is to GENERATE it (a `--write` mode, never on an ordinary run), applied **the next time the file is touched** rather than as an errand | instruction written into the file itself | `tests/census.ts:27-52` |
| Gate 3a's evidence now carries **five** instances of "the suite cannot see this" — the newest being that duplication is invisible to assertions checking presence rather than count | recorded, no action | `VERIFY.md:259-265` |

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
| Migrations | 76 (`supabase/migrations/*.sql`) |
| Deviations logged | 104 (`docs/DEVIATIONS.md`) |
| Decisions in the register | 43, of which 29 are CONFIRMED (Tor) (`DECISIONS.md:5`) |
| Decisions Q18-Q51 audited | 26 in the register + 8 staged only |
| UI messages per language | 1532 (`messages/no.json`, `messages/en.json`) |
| Gate 5a3 | 56 of 73 surfaces actively checked (44 RLS tables + 29 SECURITY DEFINER functions, 17 allowlisted) |
| Census manifest | 544 tests across 31 files (`tests/expected-counts.json`) |
| Capture states | 153 before V1-4; V1-4 adds three |
| v1 phases closed | 5 of **7** (V1-0 … V1-4) — V1-7 descheduled, so the bundle finishes at V1-6 |
| Phase reports on disk | 3 of 5 closed phases |
