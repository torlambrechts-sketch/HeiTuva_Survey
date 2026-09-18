# ONBOARDING — a briefing for a conversation that has none of this context

**Written 2026-09-18 at `8f41a8f` (= `origin/main`, clean tree).** Not a summary of what anybody
remembers — a measurement, taken at that commit, to be read *instead of* anyone's recollection.

**Why.** The conversation planning this work was compacted, and its errors started coming from
remembering summaries rather than reading files — a step rail removed in V6-2 described as present,
`results` put in the subnav list when `hasSubnav` refuses it, «snitt 58 %» read as a new bundle's
arrival when it was our own shipped copy. Each was an inference from memory where the answer was in
a file.

**So every count carries the command that re-derives it (D110).** Run them; do not trust the numbers
because they are written down. Three came back different from the record — § 9.

---

## 1. WHAT THE PRODUCT IS

A survey and feedback SaaS for the Norwegian market: build from thirteen question types, send by
email, link or QR, collect anonymously, read aggregates, dashboards, trends and themes. That is table
stakes. What it is *built around* is a statutory-compliance wedge — a duty engine mapping a survey to
the law it discharges: Arbeidsmiljøloven § 4-3, Åpenhetsloven §§ 4–5 (30 June deadline, board
signature, versioned public archive), Likestillingsloven § 26 / ARP (into årsberetningen), aml.
kap. 2A. Each duty carries a checklist, owner, cadence, named signers, an archive of signed versions
and a linked template pack.

Two things a competitor does not do. **k-anonymity is enforced in the database, not in the report
layer** — clients cannot select from `responses` or `answers` at all, and every result read goes
through a SECURITY DEFINER RPC returning `insufficient_data` below k=5. It is not a setting a
customer can turn down. **And the product states its refusals on screen rather than leaving a gap** —
33 shipped Norwegian sentences say a drawn panel is not built and why («Fire av de seks tallene
finnes ikke»; «Det er en avgjørelse, ikke en manglende del»). That is deliberate: a fabricated figure
is indistinguishable from a real one in review, so the product renders the real state, nothing, or a
stated refusal.

---

## 2. THE INVARIANTS — verbatim from CLAUDE.md, with what enforces each

Do not propose breaking these.

| # | Invariant (verbatim) | Enforced by |
|---|---|---|
| 1 | **k-anonymity, k=5, database-enforced.** Clients never select from `responses` or `answers` (no RLS select policy exists for them — do not add one). All result reads go through the SECURITY DEFINER RPCs (`aggregate_results`, `get_quotes`, heatmap RPCs) which return `insufficient_data` for any cell with n < 5 and strip group labels below threshold. | `app.k_threshold()` (22 migrations); `insufficient_data` (19). Measured by parsing every `create policy` in `supabase/migrations/`, comments stripped: **zero policies of any kind on `responses`/`answers`** — which is why the advisors' two `rls_enabled_no_policy` findings there are by design (§ 5.4), not a gap |
| 2 | **Anonymity is structural.** Anonymous submissions: `invitation_id` NULL, no user id, no IP/user-agent anywhere, `submitted_hour` truncated to the hour. The DB CHECK constraint enforcing this stays. The only write path is `rpc.submit_response`. | `…20260902000005_answers.sql:18` — `check (anonymity_at_submission <> 'anonymous' or invitation_id is null)` |
| 3 | RLS on every table, org-scoped via `app.is_org_member` / `app.has_role`. New table ⇒ RLS + policies in the same migration + a test. **Corollary:** no per-organisation value reaches a respondent surface unless a decision says so by name. | Gate 5a3 (`verify:policy`) enumerates every RLS table and definer function |
| 4 | Role semantics: `administrator` (settings/privacy/users), `redaktor` (create/send), `leser` (aggregates only — no quote-RPC group filters, no named free text). | RLS policies + persona clients in `tests/db/` |
| 5 | Tokens hashed at rest (SHA-256), constant-time compare, expiry honored. Signed URLs only for Storage. | `…_foundation.sql` token helpers |
| 6 | Zod validation at every server boundary. Service-role key server-side only. | **A person, at Gate 4. No mechanical gate.** |
| 7 | No respondent free text in logs, error payloads, or analytics. Sentry scrubbing configured. | **A person, at Gate 4. No mechanical gate.** |
| 8 | Schema changes only via `supabase/migrations/`. Never edit applied migrations; add new ones. **Ask «who writes this column?» in the migration that adds it** — and its twin, «what reads it?». | 156 migrations; `lib/org/options.ts` answers both faces per key, and `tests/db/org-options.test.ts` opens the named file and requires the symbol |

---

## 3. WHAT IS BUILT

`docs/STATE.md` is the inventory (2026-09-17). **Read it rather than this section.** Four headline
numbers, re-derived at `8f41a8f`:

```bash
find app -name page.tsx | wc -l    # 40 routes          ls supabase/migrations/*.sql | wc -l  # 156
find app -name route.ts  | wc -l   #  6 route handlers
python3 -c "import json;d=json.load(open('tests/expected-counts.json'));print(sum(d.values()),len(d))"
                                   # 1685 tests, 128 files
```

**Every screen v7 draws exists in the product: 15 of 15** (STATE.md § 1 has the screen→route table).

```bash
B=design-reference-v7/heituva-survey-app-design/project/HeiTuva.dc.html   # 10558 lines
grep -oE '\bst\.screen *[=!]== *"[A-Za-z0-9_-]+"' $B | grep -oE '"[^"]+"' | sort -u | wc -l   # 15
md5sum $B   # 4d8fde3aea0f56e481bfe2416c811f96
```

**STATE.md's own limit sentence governs how much any of this is worth:** it works at the grain of a
**section heading**. A control with no heading — a chip, a select, a sort order — does not appear,
and a heading shipped under different wording reads as missing until somebody looks (10 of 34 did).
*A complete inventory of sections; a sample of controls.* `docs/fidelity/01-per-screen.md` is finer
and older. Production is in step with `supabase/migrations/` (STATE.md § 2), verified by whole-
catalogue **fingerprint**, not by probe — see § 7.

---

## 4. WHAT IS REFUSED, AND WHY

**The section that stops a new reader proposing something already settled.** Derivation: keys or
values in `messages/no.json` matching
`refus|defer|unbuilt|unavailable|ikke bygget|vi (lagrer|viser|sender) ikke|tegningen` → **42**. Of
those, **33 are refusal sentences**; the rest are three transient "could not fetch" errors, five bare
labels and one privacy paragraph (§ 9). Grouped by *kind of reason*:

- **The data does not exist (8).** `refuseLevering` — the drawn funnel has six numbers and four are
  invented (no open tracking; submit is one transaction so there is no partial response; `bounced_at`
  has no writer, D133). `qNoTheme` — no theme per question, and a column derived from ordering is
  worse than none. `engageNoEstimate` — no measurements to build a response-rate estimate on. Plus
  `refuseMatrise`, `mgLawfulBasisUnavailable`, `mgFieldUnavailable`, `detailRefusal_not_built`.
- **A structural promise (4).** `dropoffRefused` — «Vi viser ikke hvem som ikke har svart.» Plus the
  respondent and live anonymity notes and `detailRefusal_self_entered` (the directory does not
  overwrite what a person wrote about herself).
- **A product decision (7).** `apiUnavailable` — no public API, no webhooks: «Det er en avgjørelse,
  ikke en manglende del»; data leaves through export and shared reports, which keep k and are
  traceable. `refuseFordeling`/`refuseFrisvar` — not missing tabs; they live **inside** the
  question's own card. `deferBolger` — one reminder, not four waves. Plus `invNoEmbeddedQuestion`,
  `impXlsxRefused`, `quizCertificateUnavailable`.
- **Not built yet, and the copy says so (11).** Four `live.*Unavailable`, `mgAuditUnavailable`,
  `mgPopulationsUnavailable`, `mgSyncUnavailable`, `errSsoUnavailable`, `quizInstantUnavailable`,
  `unavailableHint`, `deferSammenlign`.
- **Two switches that save and change nothing, and say so (2).** `oUnread_digest-unbuilt`,
  `oUnread_selfserve-unbuilt`.

### Decided-not-built — Tor's list, not derived from copy

Sources: `scripts/verify/fidelity.ts:30`, `lib/surveys/subtabs.ts`. One line each:

- **Sitat** — a *security* decision: «Utsagn fra forrige runde, med kilde» is a respondent's free
  text rendered to a respondent; we have exactly that datum and that path (`get_quotes`), and the
  drawing proposes the unsafe reading by name.
- **Feltarbeid** — a surface organised around who did not answer *is a list of names and an omission,
  whatever it is called*.
- **Målgruppe's drop-off half** — Feltarbeid renamed; the page counts `group_id` and never reads
  `responded_at`, asserted over the source in `tests/unit/audience-half.test.ts`.
- **The nps card** — both halves refused for *different* reasons (Q126): the left on **measurement**
  (zero `enps` questions exist anywhere), the right on **invariant** (one person's score joined to
  her verbatim is n=1 per row, and an anonymous round has no person to reply to).
- **Segmenter** — the only refusal about the *model*, and the easiest to build by accident: segments
  are rules selecting a population, never labels on an answer, because **k does not compose** (two
  overlapping segments of five with an intersection of two disclose the two by subtraction).
- **Levering / Leveranse** — Leveranse's SPF/DKIM/DMARC rows are facts about *our* sending domain,
  identical for every survey, so they would not belong on a survey tab even if measured.
- **Tema** — no theme per question, and we do not guess one.
- **The Oversikt tab, cx, uitest, resume, the thirteen integrations, quizPass/quizTries/certificate,
  the public API** — `uitest` is design exploration no phase builds; `cx` is selectable today with
  its `nps` card unrendered, reported rather than fixed because a reversal is Tor's (Q128).

---

## 5. WHAT IS LEFT

`docs/STATE.md` § 5, in its order — by size, not importance. Sequencing is Tor's.

| # | Item | Cost | Blocked on |
|---|---|---|---|
| 5.1 | **The survey shell card (Q245, D247)** — largest remaining visual item. Scope is **nine routes, not four**: v7's `isSvDetail` is one screen whose twelve pills are our eight tab routes plus `/bygg`. `SurveyContextBar` already renders the header half on all nine; the change is joining them — one component gains a body slot, nine pages pass children. | Medium. **The risk is a `verify:responsive` fix pass across nine routes** — why V7-5 left it. | Nothing. Decided. |
| 5.2 | **«Anslått lengde» on the survey detail** (v7:1552) — an estimated-length card with a warning on the read view. `estimatedMinutes` already exists. | One card, no schema. Smallest real item. | Nothing. |
| 5.3 | **Three flags with no reader.** `ai_insights`, `ai_translate`, `stripe_billing` are in `lib/flags.ts` and nowhere else — D208's second face, in a registry whose point is that a flag gates something. | Small once decided. | **Tor's** — a scope decision. |
| 5.4 | **Leaked-password protection is off** (`auth_leaked_password_protection`, WARN). **The only new advisor finding**; the other 53 are standing by-design ones. | One dashboard setting. | **Tor's** — production is a decision. |
| 5.5 | **Entra SSO — the login half.** I2 built the pull (sync, `entra_connections`, worker). `sso_exempt` and `ssoRequired` exist and are read; the plumbing waits on the provider. | Real work. Phase 6, and a capability rather than a screen. | Provider setup. |
| 5.6 | **The benchmark comparison has no reachable state.** Q134 removed invented figures; V7-5 removed two a test leaked (D245). `benchmarks` is empty, so it never renders. | Not a defect — Q134's honest consequence. | **Tor's** — sourced figures are a *content* decision. |
| 5.7 | **The frozen apparatus — four logged items** (D190, D168, D242, D243). See § 6. | Not product work. | Whoever unfreezes it. |
| 5.8 | **Open production checks.** (a) `sent_at` means *accepted by the provider*, not delivered; no Brevo webhooks, so `bounced_at` has no writer (D133). (b) Whether Brevo keeps the EU/EØS promise Q6 chose Stockholm for — a claim the privacy notice makes. (c) **`personvern@heituva.no` in `legal.privacy6P`/`8P`** — the origin is `www.heituva.com`; left untouched until a replacement is confirmed to **receive**, because a `.com` that bounces is worse than a `.no` that is someone's inbox. **The sharpest open item here: a contact address in a privacy notice.** | (c) is one edit **in two places** — the JSON is the seed, `ui_messages` is what the product serves. | **Tor's** — a mailbox must exist and receive. |

---

## 6. THE APPARATUS — and what each gate CANNOT establish

**Read this closest.** A reader who trusts a green gate without knowing its blind spot repeats the
last month. `verify:all` chains seventeen scripts; VERIFY.md's seven gates are the protocol.

| Gate | Establishes | **Cannot** |
|---|---|---|
| `verify:visual` | This screen renders as it did last time. | **Nothing about fidelity to the design** — the baselines were generated from *this implementation*. It also discounts anti-aliasing at a 0.001 ratio, so **one changed nav word on a 1440×900 page is inside tolerance**: it can be green over a picture it would fail if the difference were one word longer. |
| `verify:reference` | The bundle's screens render distinctly from each other. | **It never looks at the app.** It renders the drawing and compares it to committed pictures of the drawing. It never renders one screen twice, so **four of the 35 v7 baselines are not reproducible and it cannot say so** (D242) — and every baseline is the drawing **in fallback fonts** (D243). |
| `verify:responsive` | No overflow, no overlap, controls ≥44px, at 390px and 320px. | **It never reads an HTTP status.** An error page has no overflow and no controls, so **a 500 scores perfectly.** The only trace is `controls=0` on a full screen — a number to read as impossible, not good (D190). |
| `verify:i18n` | No Norwegian on an English page — *for strings it has on file.* | It defines "Norwegian" as the `no` message set: an enumeration standing in for a language. A Norwegian string from a **registry** matches nothing and is invisible. It went 28 → 4 → 2 → 0 as each separate registry surfaced behind the last. It also prints `ok` on a 500. |
| `verify:policy` (5a3) | A denial test **exists** per RLS table and definer function. | **Not that the test's scope is right.** `ui_messages` was cross-tenant for six phases behind a green 5a3 — the policy asked "an administrator of *any* org" and the tests asked the same. It cannot see `app`-schema functions or CHECK constraints at all. |
| `verify:browser` | Every declared state captures without console or network errors. | One bad `<Link>` 404s from **every screen rendering that list** (Next prefetches), and no console line names the path — it is in the capture's `httpErrors` log. |
| `verify:fidelity` | The drawing beside the app, for a person to look at. | **A REPORT; exits 0 whatever it finds** — the two renders show different data, so a diff would be red everywhere. It cannot tell drift from a decision (§ 4), and is blind to a surface never built: that appears as a missing row. |
| The census | A floor: this file had at least this many tests. | **It rides on the reporter list.** `--reporter=dot` *replaces* `reporters: ['default', new CensusReporter()]`, so the gate never constructs and the run is green with the check absent. |
| Gate 3a (by eye) | What the screen *says*. | — this is the gate catching what no assertion can: a true thing painted misleadingly, a true thing not rendered, a control confidently describing the wrong state, and **duplication** (almost every assertion checks presence, and presence is satisfied by two). |

**Two structural facts.** `verify:all` **stops at the first failure**, leaving later gates *unrun* —
and silence is not a pass. On a shared branch with `cancel-in-progress`, starting the next phase
**discards the previous phase's verification**: nine of eleven browser gates never executed across
one six-phase tranche. A report must name every gate as *ran green / ran red / did not run, with the
reason / ran against code that was not the code*.

---

## 7. THE RECURRING MISTAKES — shapes, not instances

1. **An enumeration mistaken for a property.** *Sharpest:* `revoke … from public` is true of the
   pseudo-role and `anon` inherits that grant — found in `M:0013`, written into CLAUDE.md, and
   **committed again** in `M:0101` by someone quoting the table in the commit message. Only reading
   the grant back from the catalogue caught it.
2. **A constant carried from another context.** `gap-y-[13px]`, measured against a 40px chip, copied
   onto a 30px one needing 14px. A list can be interrogated; a number that is right somewhere else
   cannot.
3. **A measurement carried from another context** — "the thing measured was not the thing claimed".
   `docker info` said "cannot connect": true about the *daemon*, reported about the *environment*.
   Three instances in one morning.
4. **A guard that cannot fail.** Deleting `tuvaKeyFor`'s explicit null return left all twelve tests
   green, because nothing below it matched either. Prove a guard red before trusting it.
5. **A test keyed on how the code happens to be written.** One test *required* the exact line that
   made a screen return 500; another's locator name existed only on draft rows, so `.first()`
   silently meant "the first draft".
6. **A correct thing that became wrong because the world changed.** `M:0127` added **one table** and
   produced **five** instances — including «Spørsmål 1 av 7» shown to every respondent of a survey
   with content blocks. **No gate looks for this**: a wrong guard fires, a wrong sentence just gets
   read.
7. **A hypothesis that read as a fact once it was in a document.** D241's cause had a mechanism, a
   file and consistent timestamps — never measured, and false. It survived because the *conclusion*
   it supported was correct, and a correct conclusion has no symptom.
8. **Green for something structurally invisible.** Eight instances: `ui_messages` cross-tenant behind
   a green 5a3; production nineteen migrations behind while every gate stayed green. *A zero on a
   page that cannot be empty is a finding; a gate that goes green without a fix is a finding, not a
   relief.*

**Two habits that catch most of them.** *An apply is not evidence — a comparison is*: read the object
back and diff it. And *an existence probe answers the question you asked; a fingerprint answers the
one you did not* — a probe's objects come from whoever asserted the distance, so fingerprint the
catalogue first. Production was once believed three migrations behind and was nine; applying them out
of order would have silently reverted a respondent-facing function, with a green apply and no error.

---

## 8. HOW THIS CONVERSATION WORKS

- **Tor decides scope and product** — which screens exist, what ships, what is refused. A screen
  treated unlike its neighbours is a product decision however it looks in the markup.
- **The assistant writes the instructions and takes the security and invariant decisions.** It has
  been the one refusing things that would break k-anonymity, and that continues. **It has no access
  to GitHub, Supabase, Vercel or the repository** — everything it knows comes from what Tor pastes.
- **Claude Code builds, measures and reports.** It has repository access, a local stack and the
  Supabase MCP.

**Two standing rules, for everyone here.**

**Ask rather than decide on an assumption.** When the bundle and a decision disagree, or a screen
would get different treatment from its neighbours, ask. The reason is not that bad guesses get made
— it is that *a well-reasoned decision is indistinguishable from a settled one once it is in the
code*, and the next phase inherits it as a premise. A phase that guesses badly gets caught; one that
guesses **well** does not. So this is not a stall: ask *inside* the phase, state the assumption, and
keep building everything the answer does not block.

**Never conclude from a gap — ask for what is missing.** A repository that seems to be missing work
triggers "verify where I am", never "conclude what exists": absence is the claim a working tree is
least able to support. And never claim to have done something you cannot do — «I'm checking that»,
said about something unreachable, costs a round of somebody waiting.

**Two mechanical consequences.** A phase gets **one verification pass and one fix pass**; fix-pass
findings go to the next phase, never a third round. And **the apparatus is frozen** — VERIFY.md's
seven gates, 5a3, the census and its allowlist are what exist. Something interesting gets logged, not
built.

---

## 9. WHAT I COULD NOT DERIVE, AND WHAT CAME BACK DIFFERENT

- **Gate 5a3's «82 of 115» is carried from CLAUDE.md, not re-derived** — it needs a running local
  stack. `docker info` fails here, **but `/usr/bin/dockerd` exists and was not started**, which by
  this project's own lesson is four seconds from working, not an unavailable environment. Command:
  `npm run verify:policy 2>&1 | grep -cE '^  (ok|NO DATA)'` against `grep -E 'enumerated'`.
- **The census is 1685 across 128 files; CLAUDE.md's last entry says 1684.** Accounted for:
  `git log -p -1 -- tests/expected-counts.json` shows `8f41a8f` raising
  `tests/unit/respondent-flow.test.ts` 17 → 18, nothing else. No prose followed the manifest — the
  shape CLAUDE.md records at G1.
- **STATE.md's derivation-B command does not reproduce its own answer.** As written
  (`grep -o 'st\.screen === "[a-z]*"'`) it returns **12**, missing `dash`, `library` and `respond`,
  which the bundle compares with `!==`. **The 15 is correct; the command is not.** Corrected in § 3.
- **STATE.md § 4 counts 42 as refusals.** 42 strings *match*; 33 are refusals. The other nine are
  `results.unavailable`, `dashboard.unavailable`, `respondent.testUnavailable` (transient errors);
  `surveys.refuseHeading`, `dashboard.panelUnavailable`, `integrations.statusUnavailable`,
  `reports.sectionUnavailable`, `admin.mgFieldUnavailable` (labels/templates); and `legal.privacy2P`.
- **Counts vs. top ids.** `DEVIATIONS.md` has **245 distinct** D-numbers to D247 (six ids appear
  twice: D40, D42, D102, D115, D116, D226); `DECISIONS.md` has **232 distinct** Q-ids to Q245. The
  top id is not the count.
- **One curiosity, reported not acted on.** The v7 bundle has `screen:"builder"` once as a `setState`
  target and `st.screen === "builder"` never — a state written and never read, `options.tuva`'s shape
  (D208's first face) in a drawing. Noted so nobody thinks it is a screen.
- **Not covered:** controls without headings (§ 3's limit); the seven bundles before v7 (derivation C
  ran against v7 only — `docs/v2/00-diff.md § 0.3` governs which surface is judged against which);
  copy fidelity, which is per bundle and per phase; and **anything about phases 0–5's correctness** —
  this is an inventory of what is absent, not an audit of what is present.
