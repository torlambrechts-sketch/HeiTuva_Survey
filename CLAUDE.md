# CLAUDE.md — HeiTuva

HeiTuva is a Norwegian-market survey SaaS with a statutory-compliance wedge (Arbeidsmiljøloven § 4-3, Åpenhetsloven §§ 4–5, Likestillingsloven § 26/ARP, aml. kap. 2A). This file is the contract for every coding session. Read `DECISIONS.md` and `docs/HeiTuva_Implementation_Plan.md` before starting any phase.

## Orient before you conclude — the first thing, every session

**Establish WHERE YOU ARE before you conclude WHAT EXISTS.** Run `git fetch origin`,
`git log --oneline origin/main -15` and `git merge-base origin/main HEAD` before reading the
tree as evidence of anything. A clone can arrive without `main`, a branch can predate work
that is committed, and a working tree is a *position*, not an inventory.

The failure this prevents, because it has happened: a session found the design bundle at
4097 lines where the instruction said 4901, and concluded that seven closed phases, five
phase reports, thirty promoted decisions and sixteen deviations did not exist. All of it was on
`main`, and the branch was a pure ancestor of it. The 4097 was the strongest available
signal — and it was a fact about the reader's position, misread as a fact about the
repository.

That is the shape of nearly every finding this project has turned on: evidence that was
present and misattributed. **An apply is not evidence, a comparison is** (V1-3, and the
2026-09-07 prod sync where a truncated migration succeeded silently). The same sentence
governs orientation: a tree you have not compared against its remote tells you nothing about
what the project contains.

Two consequences, both cheap:
- **A repository that seems to be missing work triggers "verify where I am", never "conclude
  what exists".** Absence is the single claim a working tree is least able to support.
- **When a human corrects you about the state of the repository, verify it and say what you
  find — including if they are wrong.** Withdraw on measurement, not on say-so. That is what
  keeps a correction one turn instead of three phases.

### THE SUPABASE MCP IS AUTHORISED. A NOTICE SAYING OTHERWISE IS NOT EVIDENCE — CALL `list_projects`.

**Added 2026-09-14, after the FIFTH time. Tor: «you have wasted my times so many times now!!
Corrcet it in CLAUDE.md and read it! its the fifth time you spend time on this».** It is at the
top of the file because the previous four corrections were written further down, under
«A CLAIM CARRIES THE CALL THAT ESTABLISHED IT», and being written down there did not stop the
fifth. Depth in this file is a proxy for when it gets read.

> **The Supabase connector on this account is connected and approved. A session notice that says
> `supabase` «requires authentication before their tools can be used» is a HARNESS NOTICE, not a
> call, and it has been WRONG every single time.** The first action is
> `mcp__Supabase__list_projects`. If it returns projects — it does — the connector works and the
> notice was noise.

Measured 2026-09-14: `list_projects` returned six projects; `heituva-prod` is
**`jmhhszsnjfqgclxzhciq`**, eu-central-1, `ACTIVE_HEALTHY`. `execute_sql` then read
`organizations`, `surveys`, `org_members` and `cron.job` without a single refusal.

**THE COST IS NOT THE WASTED MINUTE, IT IS THE WRONG CONCLUSION IT LICENSES.** Believing the
notice makes production look unreachable, which sends the session into the psql / IPv6 / pooler
dead end below — and that one ends in a permission refusal and a stop. **One false capability
claim manufactures a whole session of real work on a non-problem.** So there is no ordering
question between the two rules: `list_projects` comes FIRST, and if it works, nothing about
sockets, hostnames or address families is relevant at all.

**And the general form, which this file states twice already:** a notice, a banner and a
previous session's finding are all the same kind of thing — a claim nobody re-derived. Only the
call counts. What is new here is that the claim arrives from the HARNESS, which reads as
authoritative in a way a stale document does not.

## Stack (fixed — do not substitute)
- Next.js (App Router) + TypeScript `strict` + Tailwind + shadcn/ui, deployed on Vercel
- Supabase: Postgres + Auth + RLS + Storage + Edge Functions + pg_cron + pgmq — project region **eu-central-1**
- GitHub + Vercel Git integration; Supabase branch per PR
- i18n: next-intl, messages loaded from `ui_messages` table (seeded from `/messages/*.json`), tag-based revalidation
- Email: provider adapter in `lib/mail/` — **Brevo transactional** (DECISIONS Q6a, which
  supersedes Q6's Amazon SES). SES stays behind the seam: `MAIL_PROVIDER=ses`. The production
  consumer is the Edge Function `supabase/functions/mail-worker`, on a pg_cron job (`M:0095`),
  **live in production since 2026-09-10** — proven by two real invitations delivered from the
  cron-scheduled run, not by a local send. Deploying it needs `npm run edge:bundle`, whose
  output is compared against `get_edge_function` afterwards: an apply is not evidence.
  **`survey_invitations.sent_at` means ACCEPTED BY THE PROVIDER, not delivered** — this account
  has no transactional webhooks, so there is no delivered event and `bounced_at` has no writer
  at all (D133). Q6 chose Stockholm to keep the EU/EØS promise; whether Brevo keeps it is an
  open check, not a settled fact.

## Design fidelity — pixel-perfect, non-negotiable
- **Six handoff bundles, each governing a different question (DECISIONS Q18, extended
  by Q52).** `/design-reference-v5/` (sixth handoff) is the source of truth for every
  screen a **v5 phase touches** — read `project/HeiTuva.dc.html` there before building it.
  `/design-reference-v4/` (fifth handoff) is the reference for every screen a v4 phase
  built and no v5 phase touches.
  `/design-reference-v3/` (fourth handoff) is the reference for every screen a v3 phase
  built and no v4 phase touches.
  `/design-reference-v2/` (third handoff) is the reference for every screen a v2 phase
  built and no later phase touches, **and it is the only bundle holding the splash and
  Bruksområder at all** — v3 AND v4 were both ONE-FILE handoffs, so those two surfaces
  stay v2's. Two in a row is why that is written as a property of handoffs rather than
  as a note about v3.
  `/design-reference-v1/` (second handoff) is the reference for every screen a v1 phase
  built and no v2 phase touches. `/design-reference/` (first handoff) remains the
  reference for Phase 1–7 work **as built**: a fidelity question about an untouched
  screen is answered against the bundle it was built from, not against a later one that
  moved the frame under it. **WHICH SURFACE IS JUDGED AGAINST WHICH IS WRITTEN DOWN ONCE,
  PER SURFACE, IN `docs/v2/00-diff.md § 0.3` — read that table rather than inferring it.**
  Rendered baselines follow the same split: `artifacts/reference/`, `artifacts/reference-v1/`,
  `artifacts/reference-v2/`, `artifacts/reference-v3/`, `artifacts/reference-v4/` and
  `artifacts/reference-v5/`.
  `npm run verify:reference` renders **the target set only** — the last `BUNDLES` entry,
  derived rather than named, so promoting a handoff is one edit — and overwrites no older
  set; those are regenerated by name (`--bundle=<key>`, `--all`), because a baseline
  re-rendered under a newer Chromium silently stops being the thing its phases were judged
  against. What changed between bundles, screen by screen: `docs/v1/00-diff.md`,
  `docs/v2/00-diff.md` and `docs/v3/00-diff.md`; v4's is `docs/v2/00-diff.md § 0.3c`.

  **A HANDOFF NEED NOT CONTAIN EVERY FILE THE PREVIOUS ONE DID, AND NEITHER v3 NOR v4 DID.** The
  harness's `Bundle.splash` was typed as required because the first three bundles all had
  one — an enumeration of the bundles that existed, read as a property of bundles. A
  required field would have been satisfied by pointing v3's splash at v2's file, which is
  precisely the failure the per-screen declarations exist to prevent: a screen captured
  from a page its own bundle never drew, and then compared against as though it had.
  `splash` and `bruksomrader` are both optional now, and a screen living in a file its
  bundle lacks is SKIPPED rather than rendered from the app page.

  **AND THE COMPANION RULE, WHICH V4 EARNED TWICE IN ONE FILE: DIFFING KEYS TELLS YOU WHAT A
  HANDOFF ADDED; ONLY READING THE MARKUP TELLS YOU WHAT IT CHANGED AWAY.** The project's habit
  is to compare bundles by their `sc-if` key sets, and that habit is right about arrivals and
  blind to reversals. v4 supplied two instances, both properties changed away, both invisible
  to any count, both found by reading lines:
  - the header's `border-radius`, which an intermediate handoff made `999px` and v4 reverted to
    the theme's 16px — so two files 7172 lines long differ by one property and no identifier;
  - the nav label, `v3:4965` «Oppgaver og tilbakemeldinger» → `v4:5095` «Oppgaver», reverting
    copy C4 had shipped hours earlier (**Q123: NOT adopted** — it is a layout decision wearing a
    naming decision's clothes, and «Oppgaver» is untrue of half that screen's content).

  A count is monotone when identifiers only arrive, which is the usual case, and monotonicity
  reads as reassurance. It is not: **it rules out removal and says nothing about substitution.**
  So a bundle diff reports key-set changes AND walks the changed lines, and the walk is where the
  reversals are. **Match the visual output exactly. Do not restyle, do not substitute components, do not "improve" spacing, colors, or copy.** Recreate the rendering in React/Tailwind; never copy the prototype's internal structure (`sc-if`/`sc-for`, inline styles).
- **ADDING A BUNDLE — the checklist, because two of these were missed in one phase.** A
  handoff is not installed until every one of these is done. The failure they prevent is the
  same each time: a baseline that renders, is reported captured, and is structurally invisible
  afterwards.
  1. `scripts/verify/reference.ts` — a `BUNDLES` entry. **Step 1 USED TO SAY `only: ['<key>']`
     AND THAT FIELD NO LONGER EXISTS** (corrected at V5-0): `only` was itself an enumeration —
     `only: ['v2']` was true of the bundles that existed and would have withheld every v2
     surface from v3 the moment a fourth arrived — so it became `since: '<key>'`, «present from
     this bundle ONWARD». **Adding a bundle therefore needs no screen-line edit at all**, which
     v5 confirmed: one entry, and 35 screens captured with 0 failures.
     `since`'s stated limit is that it assumes screens are ADDED and not removed, so a handoff
     that drops one needs an `until` — CHECK IT rather than assume it. v5 removes eight `sc-if`
     keys (C4's model) and the check is two commands: every state key the `SCREENS` manifest
     sets must still exist in the new bundle, and the captured PNGs must be pairwise distinct.
     At v5 both held — 35 files, 35 hashes — so no `until` was needed. Without the second
     command a removed key is silent: the state simply does not apply and the previous screen
     is captured under the new name.
  2. `.gitignore` — an `!artifacts/reference-<key>/` allowlist line. **`artifacts/*` is
     ignored**, so without it the set renders and is committed nowhere.
  3. `.eslintignore` — a `design-reference-<key>/` line, or eslint lints the bundle's own
     `support.js` and reports errors in code nobody wrote.
  4. `CLAUDE.md` and `VERIFY.md` — the third path, and which surface it governs.
  5. `docs/v2/00-diff.md § 0.3` — the per-surface governance row.
  6. **Commit the rendered directory**, and check it landed: `git status artifacts/`.
  7. **RUN THE SECURITY-COPY SWEEP OVER THE NEW BUNDLE'S PROSE — once per bundle, not
     once.** A bundle's copy is a CLAIM SET, and every claim about who can see what, what is
     kept, what is merged, or how many roles there are is a promise the running product
     either honours or does not. Twenty-one sentences across the v2 bundle were false against
     the database; «Kjønnsdelt rapport» promised a field that exists nowhere in the schema,
     on a public page. **Nothing mechanical protects prose** — the gates protect schema and
     data — so this step is the protection, and it has to run again for every handoff.

     **A LINE THAT DESCRIBES TWO SYSTEMS WITHOUT SAYING WHICH ONE IT MEANS
     MANUFACTURES A DEFECT THAT DOES NOT EXIST.** The claim-set sweep compares
     the bundle against the running product, so its notes are always about two
     things at once — and a note that does not name which half it is describing
     is read as being about ours.

     `docs/v2/06-remainder.md` carried: «quizPreview's chips render a pass mark
     and an attempt count, which Q84 did not build, so they are not rendered at
     all.» One sentence, two subjects, no boundary. The BUNDLE renders them
     — `(st.quizPass || 70) + " % for å bestå"`, unconditionally. Our
     `QuizPanel` renders neither, deliberately, with its reasoning written beside
     it. **V2-10 was right all along**, and the line was read as an outstanding
     defect for long enough to reach a review instruction as one — «fix
     quizPreview's chips» — where the honest answer was that there was nothing to
     fix.

     The cost is not the wasted look. It is that a manufactured defect is
     indistinguishable from a real one until someone reads the source, and the
     reading that clears it is exactly the reading a busy phase skips. **Name the
     system in the sentence:** «the bundle draws X; we render Y» is two clauses
     and cannot be misread. This is the same discipline as «a count is not a
     finding until the lines are read», one step earlier — before the count is
     written down.

     **A HOST OR A URL IS A CLAIM, NOT A SPECIFICATION.** The sweep covers these too, and
     they are the easiest kind to implement by accident: a claim about who can see what
     reads as a promise and invites checking, while `heituva.no/s/…` reads as a fact and
     invites copying. It is neither — it is the mock's guess at a domain that did not exist
     when the bundle was drawn. **Check every host, URL and contact address against the
     PRODUCTION origin, and against whether the mailbox is actually staffed.**

     **The first count of this was FOURTEEN, attributed to the bundles, and it was wrong on both
     the number and the place.** Recorded rather than replaced, because that is what this file
     says to do with a number nobody re-derived.

     Measured 2026-09-10 —
     `grep -ro 'heituva\.no' . | grep -v node_modules | grep -v '^./artifacts/' | wc -l` —
     `heituva.no` appears **28 times** in this repository — 8 inside
     the three bundles, 5 quoted in DEVIATIONS, 9 in `.next/` build output derived from the
     shipped strings, and **6 that reached shipped copy** in `messages/{no,en}.json`. The
     production origin is `https://www.heituva.com`; `heituva.no` is not HeiTuva's domain and
     never was. **The useful split is 6 reached shipped copy and 22 did not** — a bundle
     occurrence is inert, a `messages/*.json` occurrence is a sentence a customer reads.
     Two of the six were `send.smsLinkPlaceholder`, fixed in the file AND in
     prod's `ui_messages` — **which is two edits, not one: the JSON is the seed, the table is
     what the product serves, and changing the file changes nothing a user sees — the file alone
     is a correction nobody receives.** The other
     four are `personvern@heituva.no` in `legal.privacy6P` and `legal.privacy8P`, and they
     are the sharpest case in the category: **inventing a contact address in a privacy notice
     is the same error as inventing an origin, with a worse consequence — a data subject who
     cannot reach the controller.** They stay untouched until the replacement mailbox is
     confirmed to RECEIVE, not merely to exist, because a `.com` that bounces is worse than a
     `.no` that is at least someone's inbox.
  A baseline reported but never committed is the shape this project has hit six times —
  green for something that structurally could not be seen: `ui_messages` cross-tenant behind
  a green 5a3; V1-6's screen whose visual gate had only ever photographed the old state;
  D102's pre-`M:0040` survey and V1-6's gated multi-round trend, both invisible because the
  seed reaches only states the current code creates; prod nineteen migrations behind while
  every gate stayed green; and `overview_activity` hand-applied, which would have failed
  Gate 1's lint (D104).
- Theme tokens (Tailwind theme, CSS vars):
  `--bg #FCF6E9 · --sf #FFFDF6 · --sf2 rgba(25,21,16,.05) · --ink #191510 · --mut #5F5849 · --line #E8DFC9 · --ac #F5C64A · --acf #191510 · --ac2 #A8D5D2 · --ac3 #FBD5C4 · --sbg #FBEBBE · --sbg2 #F6EEDD`
  radius 16px · shadow `0 2px 10px rgba(25,21,16,.05)` · fonts: Playfair Display (display), DM Sans (body), Bricolage Grotesque (logo only) · base 14px · focus outline `3px solid #191510, offset 2px` · entry animation fade + 6px translateY, .25s ease
- Desktop app pixel-perfect at ≥1280px. Respondent-facing surfaces — `/s/[token]`, report share links, splash — mobile-first pixel-perfect at 380–420px.
- **All app screens are responsive down to 390px (DECISIONS Q15).** Below 1280px there is no design to match, so follow `docs/RESPONSIVE.md` exactly — it is a specification, not a suggestion. The do-not-invent rule is relaxed ONLY to the patterns in that file; anything it does not cover is a stop-and-ask. Tokens never change across breakpoints; no feature may be hidden on mobile.
- Every UI string comes from next-intl (`no` is the source language). **Never hard-code user-facing text.** Norwegian copy must match the design bundle verbatim.

## Security invariants — violating any of these fails the PR
1. **k-anonymity, k=5, database-enforced.** Clients never select from `responses` or `answers` (no RLS select policy exists for them — do not add one). All result reads go through the SECURITY DEFINER RPCs (`aggregate_results`, `get_quotes`, heatmap RPCs) which return `insufficient_data` for any cell with n < 5 and strip group labels below threshold.
2. **Anonymity is structural.** Anonymous submissions: `invitation_id` NULL, no user id, no IP/user-agent anywhere, `submitted_hour` truncated to the hour. The DB CHECK constraint enforcing this stays. The only write path is `rpc.submit_response` (token-validated, single transaction: mark `responded_at`, insert unlinked response).
3. RLS on every table, org-scoped via `app.is_org_member` / `app.has_role`. New table ⇒ RLS + policies in the same migration + a test.
   **AND THE COROLLARY THAT V4-0 MADE STANDING: NO PER-ORGANISATION VALUE MAY REACH A
   RESPONDENT-FACING SURFACE UNLESS A DECISION SAYS SO BY NAME.** `/s/[token]`, report share
   links and the splash are read by people who were promised anonymity, and anonymity is a
   property of what the RESPONDENT can observe, not only of what the database stores.
   The instance this came from: v4 introduces a per-organisation vocabulary — «ansatt» in one
   organisation, «kunde» in another, «deltaker» in a third — and **measured, it reaches zero
   respondent surfaces**: all sixteen `ws*` identifiers sit on manager-facing screens. Had it
   reached `/s/[token]`, a respondent answering two surveys would learn they came from the same
   product, and a respondent seeing «deltaker» would learn something about the organisation that
   invited them. That is a fingerprint, assembled out of a word.
   **It is worth a standing rule rather than a note because vocabulary switching FEELS like an
   improvement everywhere**, so the phase that carries it onto the respondent screen will be doing
   it on purpose and for a good reason. Branding is the decided exception (Q58's logo and accent,
   which the respondent is meant to see); everything else is a stop-and-ask.
4. Role semantics: `administrator` (settings/privacy/users), `redaktor` (create/send), `leser` (aggregates only — no quote-RPC group filters, no named free text).
5. Tokens hashed at rest (SHA-256), constant-time compare, expiry honored. Signed URLs only for Storage.
6. Zod validation at every server boundary. Service-role key server-side only.
7. No respondent free text in logs, error payloads, or analytics. Sentry scrubbing configured.
8. Schema changes only via `supabase/migrations/`. Never edit applied migrations; add new ones.
   **ASK «WHO WRITES THIS COLUMN?» IN THE MIGRATION THAT ADDS IT.** Not when something looks
   wrong later — then, in writing, beside the column. A column with no writer produces a
   feature that is fully built, fully read, green on every gate, and reachable only from
   psql; the seed sets it, so even the demo works. **Three instances, and they are why this
   is a standing question rather than a lesson:** D102's pre-`M:0040` survey state, `created_by`
   (which V2-4's audit found had no writer at all), V2-9's `surveys.run_mode` — read by the
   Live page, read by the context bar, set by the seed, writable by no editor — and **Q50's
   `organizations.timezone`, found in the remainder walk: the column existed, was `NOT NULL`,
   was validated by `app.timezone_known`, and all three `next_run_at` sites read it, while
   `grep -rn "timezone" app/ lib/` returned one hit and it was a Playwright browser context.**
   **THAT ONE IS FIXED, and the tense is corrected rather than the instance deleted
   (re-measured 2026-09-11, at the start of W0):** `saveCompany` writes it
   (`app/(app)/administrasjon/actions.ts:64`, the `timezone:` line with its own comment about
   not nulling a NOT NULL column) and `CompanyForm.tsx:152` is the control. The example stays
   because **the instance is the evidence for the question**, and an example silently repaired
   into the present tense is how a rule stops being believed. Two of the four now have writers;
   the question is unchanged.
   **THREE OF THE FOUR TIMES THIS HAS FIRED, THE COLUMN EXISTED AND WAS READ** — which is why
   the question is not «is the column there» but «who WRITES it». A column that is read
   everywhere looks finished from every angle except the one that matters. If the answer is
   «nothing yet», say so in the column comment and log it; if the answer is «a server action»,
   the phase that adds the column adds the action, and a test asserts it exists.

## Data-not-code
Question types, template packs, statutory duties, report sections, quality-flag rules, benchmarks, feature flags, and UI messages are **data** (seeded tables / registries). One renderer per question type keyed off the registry. Adding a pack/duty/language is a migration or a row, not a component.

## Testing gates (CI must be green to merge)
- `tsc --noEmit`, ESLint
- Unit tests (Vitest)
- **Invariant suite** against local Supabase: cross-org isolation; leser cannot read answers; anonymous response has no linkage (attempt to insert linked anonymous row fails); `aggregate_results` refuses n<5; token replay rejected
- Playwright e2e for the phase's flows + screenshot diff vs `/design-reference/screenshots/` (tolerance 0.1%)
- `supabase db lint` + advisors clean

## Phase order (do not reorder; one phase = one PR series)
0. Foundation: scaffold, theme, all migrations in `supabase/migrations/` (provided), seeds, invariant test suite. **No UI before the invariant suite is green.**
1. Auth + shell + Profil + Administrasjon (all 5 tabs incl. Personvern/DSR)
2. Bibliotek → Builder (13 question types, quality flags, preview, wizard) → Undersøkelser list + sharing
3. Send (email/link/QR channels; CSV/Excel/paste import; anonymity modes; schedule/reminders via pgmq queue) + `/s/[token]` respondent flow (no/en) + `rpc.submit_response`
4. Aggregation RPCs + snapshots → Resultater → Dashboard (heatmap etc.) → trends, themes (algorithmic), insights, benchmarks
5. Duty engine (checklists, signers, versions, deadlines → Oversikt chips + "Krever handling") → report editor → PDF export → Oversikt screen last
6. Splash page, Entra SSO, SMS (flagged), PPTX, AI features (flagged), translation editor, hardening pass

Definition of done per screen: pixel-diff pass, all states from the design reachable (incl. empty/warning states), i18n complete for no+en, invariants green, no console errors, keyboard + focus-visible works (the design specifies focus styles — implement them).

## Operating authority
You are authorised to run this project end to end without asking for permission per action.
Ask only where this file says to ask.

**Run freely, no confirmation needed:**
- Any local command: install, build, dev server, tests, Playwright, linters, scripts.
- Local database: `supabase start/stop/reset/db push/db lint`, psql, seeds, fixtures — the
  local stack is disposable, reset it whenever it helps.
- Remote database (prod project): apply migrations (`supabase db push`), run the seed
  script, execute read queries, call RPCs, read logs and advisors, enable extensions,
  schedule cron jobs. Keeping prod in step with `supabase/migrations/` is your job, not
  something to hand back.
- Supabase MCP: any tool it exposes, including `apply_migration`, `execute_sql`,
  `list_tables`, `get_advisors`, `deploy_edge_function`.
- Vercel: link the project, set and read env vars, trigger builds, deploy previews,
  inspect deployment logs.
- Git and GitHub: branch, commit, push, open PRs, read and re-run CI.
- Web search and fetching documentation when a CLI flag or API has changed.

**Stop and ask first (destructive or irreversible):**
- Dropping or truncating a table, or deleting rows in bulk on the remote project.
- Anything that weakens a security invariant: disabling RLS, adding a select policy to
  `responses`/`answers`, lowering `app.k_threshold()`, removing the anonymity CHECK.
- Deploying to **production** (previews are yours; production is a decision).
- Rotating keys, changing auth providers, altering billing, deleting a project or branch.
- Force-pushing, rewriting history, or deleting a branch that is not your own working branch.

**Secrets:** read them from the environment or the local keychain. Never print a full
secret to the terminal, never write one into a file that git tracks, never put one in a
commit message or PR body. If a required credential is missing, say exactly which one and
how to provide it — do not work around it by weakening a control.

**When a tool is unauthorised:** say which tool, which command failed, and what the human
must click. Do not silently fall back to a manual instruction and carry on — an
unapplied migration that everyone believes is applied is worse than a stopped session.

## Immutability rules must permit referential maintenance
An append-only or freeze trigger written as "reject any UPDATE or DELETE" will collide
with PostgreSQL's own FK maintenance — `ON DELETE SET NULL` and cascades are UPDATEs and
DELETEs the database issues on your behalf — and the symptom is a parent row that cannot
be deleted, discovered far from the trigger. Write the rule as *"nobody may change this
content"*: compare the columns that carry meaning and reject only when they differ,
allowing FK-driven nulling of reference columns through. Decide the cascade behaviour
deliberately when the trigger is written, not when a delete fails.

**THIS GOVERNS FOREIGN KEYS TOO, NOT ONLY TRIGGERS — same mechanism, different syntax.**
`ON DELETE RESTRICT` is a freeze rule written as "reject any DELETE", and it collides the
same way: it is checked IMMEDIATELY and cannot be deferred, so a cascade that would have
removed the referencing rows anyway is refused mid-flight. In V2-3b, RESTRICT on
`survey_invitations.group_id` made the whole ORGANISATION undeletable — a rule meant to
protect a past round's record had broken the erasure path, and it surfaced as `dropOrg`
failing in the demo seed, far from anything about freezing. `NO ACTION DEFERRABLE
INITIALLY DEFERRED` says what was meant: deleting one group a round was sent to is still
refused, at commit; deleting the organisation is allowed, because by commit time nothing
points at the group. **The rule is never "this row is sacred"; it is "no record may be
left pointing at something that stopped existing under it".**

This has now been rediscovered SEVEN separate times: D50, D51, D57, the duty-archive case,
V2-3b's FK pair — which then bit a second time in the same migration, when an audit trigger
on a lifted objection tried to write a row for an organisation already erased — V2-9's, and
Q137's.

**Q137'S IS THE FIRST WHERE THE MAINTENANCE IS DONE BY A WORKER RATHER THAN BY THE DATABASE, AND
THE FIRST WHERE THE GUARD INVERTED INTO ITS OWN OPPOSITE.** The construct is a TRIGGER SCOPE:
`guard_invitation_not_suppressed` was declared `before insert or update`, where the rule it means is
«no invitation may be CREATED for, or RE-POINTED at, an objecting address». Written over every
UPDATE it also refused the writes the system makes on its own behalf — `app.enqueue_reminders`
rotating a token, so ONE objecting address aborted the whole reminder sweep for every organisation
on a silent pg_cron job; and the mail worker writing `sent_at` AFTER Brevo has accepted the message,
so the worker could not mark it spent and the queue redelivered it. **A person exercising their
GDPR art. 21 objection was therefore sent the same mail repeatedly, BY the guard written to protect
them.** `update of email` is the fix, and it is the column rather than the predicate, as every
earlier instance also turned out to be.

So the list of constructs is now: triggers, foreign keys, CHECK constraints, and **the scope
clause of a trigger**. The question to ask is unchanged and is the only part worth memorising:
*which of the columns this rule names can be changed by something other than the code I am looking
at?* A cascade is such a something. **So is a background worker recording what it did.**

**V2-9's is the one that widens the family, so it is worth a sentence of its own.** It was a
**CHECK constraint** — a third construct after triggers and foreign keys — and the phase
introduced it *in the very migration written to accommodate the new case*. The CHECK was
widened to allow a row that carries `live_session_id`; the column it now depended on was
`on delete set null`; so erasing an organisation cascaded, nulled that column, and the row
failed the constraint that had just been relaxed for it. Two individually correct decisions,
one broken pair, and the symptom miles away: **`dropOrg` failing.**

So the family is not «triggers and foreign keys». It is **any rule written over a column the
database reserves the right to change on your behalf**, and the question to ask of a new one
is: *which of the columns this predicate names can be changed by something other than the
code I am looking at?* A cascade is such a something. The fix is usually the column and not
the predicate — V2-9 restated the same rule over `channel`, which is `not null` and which
nothing nulls.

**AND THE GENERAL FORM, WHICH ARRIVES THROUGH TRIGGERS AS WELL AS THROUGH FOREIGN KEYS
(V2-9): A GUARD ON ONE TRANSITION IS NOT A GUARD ON THE STATE.** Everything above is about
writing the rule as what it *means* rather than as the operation you happened to be
thinking about, and the same slip has a second shape: guarding the column that carries the
new value, and leaving every other road to the same state open. `app.guard_run_mode_anonymous`
was first written `before update of run_mode` — correct for «switch this survey to live»,
and blind to «make this live survey named», which reaches `live` + `named` by setting the
mode first and the anonymity second. Both columns are in the trigger now. **When you guard
a combination, enumerate the columns the combination is made of, not the one the user
happened to touch.**

## AN ENUMERATION MISTAKEN FOR A PROPERTY — the shape under most of the others

**Added 2026-09-09 (Tor), after V2-9.** Several of the rules below and above are instances of
one thing, and naming it is cheaper than rediscovering it a fifth time. **The failure is
writing down the cases you can see and treating that list as the rule.** The list is always
correct about its members and always silent about the member that has not arrived.

**Extended 2026-09-10, after S1–S4.** Three more, and all three landed in ONE tranche — one in a
specification, two in a CI workflow. Neither of those is a database construct, which is the
evidence that this section is not a note about Postgres.

**Extended 2026-09-11, after C4/C5, the verification pass that followed, and V4-0's sweep.
ELEVEN instances** — measured, not carried, and the command is written here rather than the number
so that the next addition corrects this paragraph by being made:
`awk '/^\| Where \| The enumeration/,/^$/' CLAUDE.md | grep -c '^| [^-]'` minus the header row,
which returns 12 and therefore eleven.
Tor called the new one the tenth and the ninth correction; the table held seven when I counted it,
so this is the EIGHTH and the number is written as what re-derives. Said rather than quietly
matched, because this file already records a carried number that was wrong for four phases
(«61 of 83»), and the rule out of that — a divergence note carries the command that re-derives it —
is the one being added beside D110 in the same breath. **If the two missing instances are real they
are somewhere this table is not, and the command above will keep saying eight until they are in
it.**

**Fifteen instances now** — the command above returns 16 and therefore fifteen; the fifteenth was added 2026-09-14 and is the reachability row at the bottom, whose own section is below. The ninth is a REPEAT of the third — which is itself a finding — the
tenth is the subtlest of all of them, and the eleventh was caught by a SWEEP OVER PROSE rather than
by a gate or a measurement, which is a third way of finding them. Ten different constructs, one
shape:

| Where | The enumeration | The property it should have been |
|---|---|---|
| `\b` in a Norwegian regex (D113, D116) | the ASCII word characters | «a letter, in any alphabet» |
| «interpolates `{k}`» as an allowlist reason (D110 addition) | clause 1 of the string | «nothing in this string asserts a fixed number» |
| `revoke … from public` (D115, second mechanism) | the PUBLIC pseudo-role | «no unauthenticated role may execute this» |
| Referential maintenance as «triggers and FKs» (V2-9) | the two constructs that had bitten | «any rule over a column the database may change on your behalf» |
| **RESPONSIVE.md's narrow-row clause** (S3/S2, D129) | «email + role select + status», the controls the row had when the clause was written | «the controls in this row, however many there turn out to be» |
| `supabase start -x …storage-api…` in CI (S2) | what the *old* job, which ran only `tests/invariants`, needed | «the services the gates in THIS job touch» |
| `playwright install … chromium` in CI (S2) | the browser I had in mind | «the browsers the suite's projects use» — the mobile project is WebKit |
| **`scripts/edge-bundle.ts`'s import assertion** (mail tranche) | the entry point's three imports, which are the ones the script rewrites | «no relative specifier ANYWHERE in the bundle may lack an explicit extension» |
| **`revoke … from public` AGAIN** (C4/C5, `M:0101`/`M:0102`) | the PUBLIC pseudo-role — **the same enumeration row 3 already names** | **«A GRANT IS A FACT ABOUT THE CATALOGUE AND MUST BE READ BACK FROM THE CATALOGUE.»** `from public, anon` is the fix; `has_function_privilege('anon', …)` is the rule. |
| **`gap-y-[13px]` carried to a smaller chip** (C4, `verify:responsive`) | 13px, measured against the `py-2` (40px) rail it was copied FROM | **«A CONSTANT COPIED FROM A WORKING CONTEXT CARRIES ITS CONTEXT'S ASSUMPTIONS INVISIBLY.»** The number belongs to the CONTROL, not to the pattern. |
| **«Fire alternativer»** as a module label (V4-0 sweep, Q121) | four, counted off the bundle's fixture quiz | **«A DESCRIPTION OF A CLASS MAY NOT CARRY A COUNT OF THE INSTANCE IN FRONT OF YOU.»** `quizzable` is `choice \| yesno \| dropdown`; `yesno` has two. |
| **`M:0107`'s own invitation derivation** (Q137, I1-1) | the FUNCTIONS that insert invitations — and then, one level out, the ROWS that reach a person | **«WHAT REACHES A PERSON IS NOT A ROW, IT IS A `pgmq.send`.»** Four functions hold five insertion points (`send_round` has two), so a body-wide read let the group loop's guard stand in for the named loop's. And `app.enqueue_reminders` inserts nothing at all and reaches them anyway. |
| **`before insert or update` as a guard scope** (Q137, `M:0108`) | every UPDATE — which is the operation the author was thinking about, not the rule | **«A GUARD'S SCOPE IS THE COLUMN THE RULE IS ABOUT.»** `update of email` re-checks a re-pointed invitation; every-UPDATE also refused token rotation and the worker's `sent_at`, so **objecting caused repeated mail to the person who objected.** |
| **`verify:i18n`'s Norwegian detector** (Q129, 2026-09-12) | the strings it already knows — the `no` message set — used as the definition of «Norwegian» | **«A DETECTOR THAT IDENTIFIES A DEFECT BY MATCHING KNOWN STRINGS CAN ONLY REPORT THE DEFECTS THAT COLLIDE WITH ONE.»** Not a gate looking in the wrong place: a gate that can only see what collides with something it already holds. |
| **«the prod host is IPv6-only»** as a reachability diagnosis (2026-09-14) | the ONE hostname a lookup was run against — accurate about it, and silent about the container | **«A ROUTE IS A PROPERTY OF THE EGRESS, NOT OF A HOSTNAME.»** Both IPv4 poolers time out too: TCP 5432 does not leave a Claude Code container at all. The plausible repair the true fact suggests — «use the pooler» — is the trap, and it was walked ~10 times. |

The fourth is the clearest about *why* this is a category, because **CHECK constraints arriving
as the third construct is what proved the first two were examples someone had read as the list.**
Two instances look like a category; three make you ask what the category actually is.

**THE FIFTH IS THE SHARPEST, BECAUSE THE ENUMERATION WAS IN A SPECIFICATION AND THE PHASE THAT
BROKE IT QUOTED IT WHILE BREAKING IT.** `docs/RESPONSIVE.md` decides card-vs-row by whether the
controls fit, and then illustrates it: «This is the Brukere case: email + role select + status fit
cleanly». That parenthesis is a COUNT of the controls that existed the day it was written, not a
property of the row. S3 added a fourth control to that row — the group select — and the sentence
became false silently, with no gate able to see it: `verify:responsive` is the gate that would
have, and it was one of the thirteen that never ran. It failed within one run of being scheduled,
with four blockers at 390px and 320px.

What makes it worth keeping is the comment S3 wrote directly above the new control. It cited the
clause **approvingly** — «RESPONSIVE.md § Data tables, narrow row: three fields that fit» — in the
same edit that made «three» wrong. **A specification's worked example is the most quotable thing
in it and the part most likely to be an enumeration**, so quoting one back is not evidence that
you are complying with it. Read the RULE the example illustrates, and ask whether your change
moves the example.

The sixth and seventh are the same shape in CI, in one tranche, both mine: three instances in a
single piece of work, which is the strongest evidence this section has that the shape is not
about databases.

**THE NINTH IS THE THIRD, REPEATED — WHICH IS THE ONLY ENTRY IN THIS TABLE THAT IS A DUPLICATE,
AND THAT IS WHY IT IS WORTH A LINE.** `M:0101` and `M:0102` both wrote
`revoke all on function … from public`, leaving standing the grant `anon` INHERITS from PUBLIC.
`M:0013` found this on 2026-09-04 and wrote the reason into its own migration
(«`revoke … from anon` alone leaves that PUBLIC grant standing»); this file lists it as row 3; the
tranche that reproduced it cites this very table twice in its own commit messages.

So **knowing a shape by name, having the instance written down, and quoting the table in the same
work is not protection.** What caught it was a test asserting `has_function_privilege('anon', …)`
— a measurement, on the object, after the fact.

**THAT IS WHY THE RIGHT-HAND COLUMN OF ROW 9 IS THE LESSON AND NOT THE PATCH** (Tor, 2026-09-11):
*«The lesson you drew is the right one and it should be the row's text: a grant is a fact about the
catalogue and must be read back from the catalogue. That is the only form of the rule that does not
depend on remembering.»*

`from public, anon` is a spelling, and a spelling is something you have to recall at the moment you
write it — which is precisely what failed here, twice, with the reason already written down in two
places. **A measurement does not depend on recall.** It is the same discipline as
`get_edge_function` against the repository (the ninth check) and as «an apply is not evidence, a
comparison is»: the object is asked what it actually is, after the fact, by something that runs
whether or not anybody remembered.

Neither function was exploitable as written — both resolve authority from `app.has_role` and an anon
caller has no `auth.uid()` — and «it refuses anyway» is precisely the argument that keeps a wrong
grant alive until something changes underneath it.

**THE TENTH IS THE HARDEST OF ALL OF THEM TO SEE, BECAUSE THE ENUMERATION IS A NUMBER THAT IS
CORRECT SOMEWHERE ELSE.** (Tor, 2026-09-11, after `verify:responsive` failed on C4's screen.)

C4 moved the task-filter rail out of the Oppgaver header and re-styled its chips to V3:2196's
smaller `py-[7px]` — 30px painted instead of 40px — while copying `gap-y-[13px]` from the rail it
came from. `verify:responsive` reported four blockers at 320px: «Alle»/«Lovpålagt» overlapping by
52px², «Mine»/«Lovpålagt» by 34px².

`app/globals.css` had already done the arithmetic, for this exact case, in the comment on
`.touch-cluster`: *a 30px painted control with a 44px hit area overflows (44 − 30) / 2 = 7px on each
side, so two adjacent ones need at least 14px between their painted edges.* **Thirteen is one short.
At 40px the overflow is 2px and thirteen is ample** — so the same class list has **two different
correct answers**, and which one applies is decided by the chip, not by the pattern.

**Why this is harder than the other nine.** Every earlier instance is a list that is visibly a list
— three imports, one pseudo-role, two constructs, the browsers you had in mind. A reader can at
least ask «is this all of them?» **A number cannot be interrogated that way: a constant that is
right in one place looks identical to a constant that is right everywhere.** `gap-y-[13px]` carried
its context — a 40px chip — invisibly, and nothing about the token says what it was measured
against.

**What made it a property rather than a fix**: sweeping the repo for every 30px chip rail instead of
correcting the one the gate named. That found `FeedbackList`'s rail carrying the same latent defect
— it simply had three chips rather than four and did not wrap at the widths tested — and confirmed
the only two such rails in existence are the two C4 created. **One gate finding, two fixes, and a
measured statement about the rest of the codebase.**

**And the same phase supplies the companion case, which is row 9 seen in a class list.**
`FeedbackList`'s `<select>` measured 189×36 because it was given `touch-44`, whose hit area is an
`::after` — and a `<select>` is a REPLACED element, on which `::after` renders nothing at all.
`globals.css` carries `touch-44-field` for precisely this, immediately below, with the reason in its
own comment. **Two utilities, one of them named for the case, the explanation adjacent, and the
wrong one taken** — a spelling that must be recalled at the moment of writing, which is exactly what
that form of rule cannot prevent. The measurement caught it; the documentation did not.

**THE EIGHTH IS THE YEAR'S IRONY, AND THE ENUMERATION WAS WRITTEN BY ME, IN THE COMMIT THAT SAID
THE SCRIPT EXISTED TO PREVENT TRANSCRIPTION ERROR.** `scripts/edge-bundle.ts` assembles the
`mail-worker` payload because there is no `SUPABASE_ACCESS_TOKEN` here and the deploy goes through
MCP by hand — the step that had already shipped v6 with comment blocks shortened. So the script
prints per-file md5s, and its commit message says so.

It asserted that each of the entry point's three imports was present before rewriting it, and said
**nothing about the imports inside the files it copies**. `lib/mail/brevo.ts` is written
`from './env'` — extension-less, which the app's tsconfig resolves and Deno does not. The running
function has `./env.ts` **only because I typed the extension in by hand while transcribing an
earlier payload.** So *the tool built to guarantee fidelity would have regressed the one thing
hand-transcription got right*, and because `./env` is a VALUE import the failure would have been
module resolution on the worker's first request — not a caught type error, not a failed deploy
check, but production returning 500 on the first cron tick after the deploy.

Three things make it the sharpest entry in this table:
- **The enumeration and the guarantee were in the same file, written in the same sitting.** Knowing
  the shape by name and having just written it down twice did not prevent committing it.
- **It was found by a comparison, not by a gate.** `get_edge_function` against the repository —
  the ninth check, aimed at a function instead of a migration. Nothing in CI knows Deno's
  resolution rules; `tsc` resolves `./env` happily, which is exactly why the repo file is written
  that way and is correct there.
- **The fix was the property, then the proof, in that order.** Rewrite every extension-less
  relative specifier, then assert over the FINISHED bundle that none survives — so index.ts and any
  future edit are covered, and a fourth shared module needs no edit here. Then prove the assertion
  fires before trusting it: a synthetic `./packs.json` gives exit 1 naming file and specifier.
  «Prefer the fix that is robust against the construct nobody has thought of» applied to a
  transcription tool.

**THE TWELFTH IS A DIFFERENT KIND, AND IT IS THE FIRST ONE WHERE THE ENUMERATION IS THE
DETECTOR'S OWN VOCABULARY** (Tor, 2026-09-12, after Q129).

`verify:i18n` decides «this English page is showing Norwegian» by matching the rendered text against
the `no` message set. That set is an enumeration — of the strings the product happens to have as UI
MESSAGES — and it was silently doing duty as the definition of the Norwegian language.

`workspaces.label` for `cx` is «Kunder og service». It had been in the DOM of **every English page
since W1**, and it is not a message, so the gate had nothing to name it with and said the page was
clean. The defect became visible only when `M:0106` made the `quiz` row selectable and its label
«Quiz og arrangement» turned out to be character-for-character a message added hours earlier —
`dash.quizKicker`. The gate then reported 28 routes and blamed the message.

**The proof is the sequence: 28 -> 4 -> 2 -> 0.** Each fix uncovered a SEPARATE untranslated registry
standing behind the previous one — the workspace chip, then Oversikt's strip and the Firma tab, then
`use_cases` in the library, whose `hr` row carries the same Norwegian string a third time. A gate
that could see «Norwegian» rather than «a string I have on file» would have reported all of it at
once, on the first run, two phases earlier.

**Why it is worth its own row rather than a note under row 5.** Every earlier instance is a list
somebody WROTE — three imports, one pseudo-role, two constructs, the controls a row had that day. A
reader can at least ask «is this all of them?» **This one nobody wrote: it is the detector's corpus,
and it is invisible as an enumeration precisely because it looks like a capability.** The question to
ask of any matcher is therefore not «is the list complete» but **«what is this list standing in for,
and what else belongs to that thing?»**

**Two consequences, and the second is the one that pays.**
- A test, an allowlist reason or a guard should be stated as the property, and where it cannot
  be, the enumeration must say what it is an enumeration OF — this is what
  «state the SCOPE of an allowlist reason, not only its content» already says one level down.
- **Prefer the fix that is robust against the construct nobody has thought of.** V2-9's CHECK
  was repaired by moving the rule to a column no cascade can withdraw, not by adding a fourth
  disjunct — so the fourth construct, whatever it is, does not need this rule rewritten again.
  Fix the column, not the predicate.

## A CONTINUOUS RUN ON A SHARED BRANCH PAYS FOR WORK IT THROWS AWAY

**Added 2026-09-11 (Tor), after C0–C5 ran as six phases continuously on one branch.** The
arrangement was asked for deliberately and it delivered; what it also did was bill twice, and both
bills were invisible until somebody counted.

> **A continuous run on a shared branch with `cancel-in-progress` pays for work it throws away,
> twice: once in unmeasured gates and once in minutes.**

**The first bill: nine of eleven browser gates never executed across the entire tranche.** Not
failed — never run. The workflow's concurrency group is `ci-${{ github.ref }}`, so each phase's push
killed the previous phase's slowest job, and the browser job is always the slowest. Measured across
all six runs rather than assumed: `verify:roundtrip` passed on five, `verify:hermetic` on one, and
**`interaction`, `i18n`, `respondent`, `send`, `export`, `splash`, `browser`, `responsive` and
`visual` on none at all.** Every phase reported its database half green and its visual half
UNVERIFIED, which was true and read as a Docker limitation rather than as a structural one.

**The second bill: 2000 Actions minutes, exhausted in about an hour.** Eight runs, most cancelled
halfway through the expensive job. The Free tier's Linux limit with no spending limit set means
GitHub stops allocating runners rather than billing, so four consecutive runs failed in two seconds
with zero steps — a failure that looks like nothing at all and is not in the diff. **A cancelled run
has already spent its minutes; cancellation stops the clock, it does not refund it.**

**The two are the same bill.** Work started and thrown away costs the minutes it burned AND the
evidence it would have produced. Running the phases continuously meant every phase's verification
was cancelled by the next phase's start, so the tranche reached its end with the database half
well-evidenced and the visual half barely evidenced at all — and then had no minutes left to find
out.

**What it does not mean.** Not «never run phases continuously» — the arrangement was right and the
database work is better for it. It means the cost is real and should be chosen with open eyes:

- **The verification of phase N is not free once phase N+1 has started.** On a branch with
  `cancel-in-progress`, starting the next phase is the act that discards it.
- **A phase whose gates were cancelled has not been verified, and «UNVERIFIED» in a report should
  distinguish «no runner» from «the gate ran and could not see it».** Those read the same and are
  not the same.
- **Count the gates that actually executed, per run, before writing the number down.** «11 gates
  done» on a cancelled job counts the skipped ones; the honest measure is `conclusion == 'success'`,
  and this tranche proved the difference twice.

**The instance that closes it:** once the quota was restored and the gates finally ran,
`verify:responsive` failed with four blockers — on the one screen C4 had just added four controls
to. **The gate that would have caught it existed, was scheduled, and had been cancelled five times
running.** It had earned its place once before, in S2, by failing within one run of first being
scheduled.

## A REFUSAL NAMED IN A COMMENT IS FOUND BY A GREP OVER THAT COMMENT

**Added 2026-09-12, after V5-2 and V5-3 hit it in the same session.** This file already records the
production instance — an ad-hoc catch-all sweep matched `when others` inside a comment explaining
why that handler is narrow, and the real gate strips `--` comments first. It happened twice more,
in TypeScript, and the general form is worth a heading:

> **A file that documents its own refusals contains the words it refuses.** A source-grepping test
> aimed at «this string must not appear» will find it in the paragraph saying it must not appear.

- `tests/unit/worklist-rows.test.ts` asserts the bulk bar has no «Lukk valgte» and that the owner
  panel never becomes «Avsendere». Both went red on correct code: the doc comments above those very
  controls name what is refused and why.
- `tests/unit/integrations.test.ts` test 8 forbade «Sluttdato» across the `integrations`
  namespace — and V5-3's detail page names that field **on purpose, in order to refuse it.**

**The two fixes are different, and the difference is the lesson.** The first is mechanical: strip
comments and measure the CODE, which is what the migration gate already does. The second is not —
the string genuinely ships now, so the property had to be RESTATED rather than widened: *the word
appears only where the page also says it is not read*, with the exemption DERIVED from the registry
so that a field moved from refused to built loses it automatically.

**Widening would have been the easy move and the wrong one.** Dropping «Sluttdato» from the
forbidden list buys a green test and loses the guard; deriving the exemption keeps both. This is the
same choice as «fix the column, not the predicate» one level up.

## A catch-all is a decision, not a safety measure
**A catch-all is not a safety measure, it is a decision to make one class of failure
invisible, and it is only sound if you know which class.** You will know it as one thing;
what lands inside it will be another, and the handler will swallow that just as faithfully.
The defence does not fail — it works as designed, on the wrong thing.

That is not hypothetical here. `M:0070` wrapped `generate_blind_spot_tasks` in
`exception when others then null` for a failure named in the comment beside it: «the AI
prompt row is missing». What landed inside it was «the call site is wrong» — the migration
had patched `send_round` at all five occurrences of a `replace()` anchor, four of them error
paths — and the handler hid every one. It was found by asking why the demo seed produced no
generated task, not by any gate.

So: **name the conditions.** `when unique_violation or foreign_key_violation` is a decision
about a class, written down, and it is fine. `when others` is the absence of one. The same
reasoning governs any defence that turns a loud failure into no failure at all — a
`try/catch` that returns `null`, a `?? fallback` over a parse — and where the swallow is
genuinely necessary at runtime (an evaluator that must not throw on a keystroke), it is only
acceptable if a test proves the swallowed case does not occur. `lib/questions/quality.ts`'s
`toJsRegex` is the worked example: it returns `null` on a pattern it cannot compile, which
would silently disable a rule, and `tests/db/catalogue-invariants.test.ts` compiles every
seeded pattern and asserts none of them lands there.

**The assertion is the half that matters, and it must be catalogue-derived rather than a
list.** Scoped to the one function I already knew about, the test would have had the same
shape as the defence it was written about. It sweeps `pg_proc` across `app` and `public`;
the answer is currently zero, so there is no allowlist, and the next handler like mine fails
a test in the commit that adds it (D115).

## Control substitution
The design's control is authoritative. Substituting a different control for layout or
convenience is restyling and is forbidden. The single exception: where the prototype's
control cannot express a real schema constraint — a free-text field standing in for a
foreign key, because the mock had no database behind it. Then use the real control,
styled exactly as that control class is styled elsewhere in the bundle, and log it as a
deviation with the constraint named (see D56).

## Never fabricate data in the UI
If a value does not exist in the schema, do not render a placeholder that looks like data
(a hard-coded `v1`, an invented count, a 0% derived from an unknown denominator). Render
the real state, render nothing, or render the design's empty/unknown treatment. A fake
value is worse than a gap: it is indistinguishable from a real one in review, and it
survives into screenshots and demos as though it were true.

## A CLAIM CARRIES THE CALL THAT ESTABLISHED IT — the same rule as D110's, for capabilities

**Added 2026-09-12 (Tor), after a five-route availability report had two wrong rows.** This is not a
new rule. It is the SECOND INSTANCE of one this file already states for numbers: *a number in a
document must be derivable by a command, and the command goes beside it* — the rule out of «61 of
83», added beside D110. Written as one rule with two instances rather than as two rules, because the
thing being prevented is identical: **a claim that was true when someone wrote it, carried forward by
people who cannot check it.**

> **NEVER REPORT A CAPABILITY AS UNAVAILABLE WITHOUT THE CALL BESIDE THE CLAIM.** Not the notice, not
> the banner, not the last session's finding — the call, and what it returned.

`npm run verify:capability` (`scripts/verify/capability.ts`) is the mechanical half: one row per
external dependency, each one CALLING — `docker info`, `supabase --version`, `supabase projects
list`, a TCP connect to both production endpoints, a real query against `LOCAL_DB_URL`. It gates
nothing and exits 0 whatever it finds, because «no Docker» is a true state of a laptop and not a
defect. It reports what the call returned, raw.

**THE TWO FAILURES IT COMES FROM ARE DIFFERENT, AND THE SECOND IS WHY THE RULE EXISTS AS WELL AS THE
SCRIPT.**

- **The MCP row was reported from a session notice, with no call at all.** The connector had been
  authorised the whole time; the first `list_projects` returned six projects, and every subsequent
  read worked. **A probe catches this one** — there is nothing to get right except making the call.
- **The Docker row WAS called.** `docker info` returned «Cannot connect to the Docker daemon at
  unix:///var/run/docker.sock», which was ACCURATE, and it was reported as «Docker is unavailable».
  `which dockerd` returned `/usr/bin/dockerd`; `dockerd &` brought it up in four seconds, with
  eleven Supabase containers still attached to it. **A fact about a PROCESS'S RUN STATE was read as a
  fact about the ENVIRONMENT.** «Not running» read as «not available».

**No probe catches the second, and that is the point.** The call was made and the call was honest;
what failed was the step after it. This is the same shape as *«the ledger cannot be diffed against
filenames»* and as row 10's constant that is right somewhere else: **the thing measured was not the
thing claimed.** So the script's output ends by saying so in its own words — a machine without Docker
and a machine whose daemon is stopped print identically, and one of them is four seconds from
working.

**THREE IN ONE DAY, AND THE RATE IS THE FINDING** (Tor, 2026-09-12). «The thing measured was not
the thing claimed» is not an occasional slip; on 2026-09-12 it happened three times before noon, in
three different materials:

1. **The Docker daemon.** `docker info` returned «Cannot connect» — accurate about the daemon,
   reported as a fact about the environment. `dockerd &` fixed it in four seconds.
2. **The stale `next-server` processes.** `buildTargetsLocal()` and `buildIsStale()` both inspect
   OUR `.next` directory, which is a perfect proxy for «the running server is right» and only while
   the running server is ours. A leftover process on a different Next MAJOR passed both and was
   reused; one `verify:responsive` run against it reported 6464 findings and 277 blockers on a
   two-pixel CSS change. Fixed by asking the SERVER what build it is serving
   (`scripts/verify/server.ts`, `serverBuildId()`), and the guard was proven to fire against a
   synthetic foreign build before being trusted.
3. **An ad-hoc catch-all query against production.** It reported `when others` in `send_round`. The
   match was inside a COMMENT explaining why that handler is narrow; the real gate strips `--`
   comments first and the one-off did not. A manufactured defect on prod, cleared only by reading
   the lines.

**None of the three was a missing measurement.** Every one of them measured something, accurately,
and then answered a question the measurement had not been asked. That is why the rule is «the call
beside the claim» and not «make more calls»: the call is necessary and it is not sufficient, and
what closes the gap is naming, in the sentence, WHICH object was interrogated.

**And the script is itself an enumeration, stated as one** (row 9, aimed at this file): its rows are
the dependencies this project has actually hit, and the next thing assumed will not be among them.
When that happens the remedy is the rule first and a row second — never the row alone, because a
list of capabilities to test can only ever be as long as the last surprise.

### THERE IS NO POSTGRES ROUTE TO PRODUCTION FROM A CLAUDE CODE CONTAINER — SETTLED, STOP RE-DERIVING IT

**Added 2026-09-14 (Tor, exasperated, and right): «you do this EVERY time; why cant you remember?
Ipv6 and IPv4 you been though this at least 10 times allready».** He is describing a session cost
paid over and over for one fact, and the reason it kept being paid is that the fact was never
written as a conclusion — only the probe's raw rows existed, and raw rows invite re-interpretation.

So it is a conclusion now:

> **From a Claude Code container, production Postgres is unreachable BY EVERY HOSTNAME, and the
> address family is not why.** Outbound traffic goes through an HTTP CONNECT proxy (`HTTPS_PROXY`),
> which carries 443. **Raw TCP 5432 does not leave.** The next step after a failed connection is
> therefore never another host.

Measured, `npm run verify:capability`, 2026-09-14:

| row | call | result |
|---|---|---|
| `prod-db-direct` | tcp `db.<ref>.supabase.co:5432` | families: **IPv6** only, `ENOTFOUND` |
| `prod-db-pooler:0` | tcp `aws-0-eu-central-1.pooler.supabase.com:5432` | resolves IPv4, **timeout 20s** |
| `prod-db-pooler:1` | tcp `aws-1-eu-central-1.pooler.supabase.com:5432` | resolves IPv4, **timeout 20s** |
| `prod-rest-https` | `GET https://<ref>.supabase.co/rest/v1/` | **HTTP 401 — reachable, unauthenticated** |

**The IPv4 pooler is the trap, and it is what makes this a row in the enumeration table rather than
a note.** «The direct host is AAAA-only» is TRUE, it is the first thing a lookup shows, and it
names a repair — «use the IPv4 pooler» — that is plausible, cheap to try, and wrong. So the honest
reading of one accurate measurement leads directly into a second measurement nobody takes. It is
row 10's shape one level out: *a fact that is right about the object it names and silent about the
thing that is actually blocking.* The address family was a property of ONE hostname; the blocker is
a property of the CONTAINER.

**And it is a worse instance than the Docker one, because the correct repair looks like a
circumvention.** Reaching production by a second hostname after the first attempt was denied is
indistinguishable from working around the denial, so the attempt costs a stop as well as a session.

**What to do instead, in order:**
1. **`npm run verify:capability` FIRST**, before any sentence about what production can be reached
   from. Its last paragraph now states this conclusion in its own output, so a future session reads
   it rather than deriving it.
2. **Supabase MCP** — the authorised route (see Operating authority). It speaks HTTPS to
   `api.supabase.com` and needs no database socket. When the session reports it unauthenticated,
   that is a connector authorisation the human grants; it is not a network fact and no hostname
   affects it.
3. **REST over HTTPS with a key in the environment.** `scripts/seed-org-demo.ts` already works this
   way — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, no socket at all. `.env.local` is gitignored
   (`.gitignore:6`), so it is a safe place for the key; the standing secrets rule still holds —
   never printed, never committed.
4. **Otherwise the human runs it**, and the ask is one line rather than a diagnosis.

## Verification
After every phase, run the protocol in VERIFY.md. No phase is complete until its Gate 6 report shows READY FOR REVIEW with evidence. Claims without evidence (command output, file:line, or a screenshot you opened) are not acceptable status.

**A phase gets ONE verification pass and ONE fix pass.** Findings from the fix pass are
logged to the next phase's list, never fixed in a third round. If the fix pass surfaces
something that genuinely cannot ship — a security invariant actually broken, not merely
untested — say so plainly and stop for a decision. Everything else is logged. A phase that
has had its two passes closes.

The verification apparatus itself is frozen: VERIFY.md's seven gates, Gate 5a3
(`verify:policy`), the test census (`tests/census.ts` + `tests/expected-counts.json`) and
the 5a3 allowlist are what exist and they are enough. Do not add gates, meta-checks,
manifests or rules mid-phase. Something interesting that surfaces gets logged for the next
phase, not built.

**TWO NUMBERS CARRY FORWARD, AND THEY ARE CONSEQUENCES THAT MUST BE READABLE — NOT TARGETS
THAT MUST BE REACHED.** (Tor, 2026-09-12, rewriting his own rule.) This said «may only move
up» for six phases, and that form is **a target expressed as a counter, which a counter can
satisfy by making the product worse.** D158 proved it from the other side: removing four
negative tests that could not fail made the census FALL, and the fall was correct — the
tests were passing against a database with none of the feature, so deleting them is what
made the number mean something again.

So the rule is:

> **A number may move in either direction. What must never happen is a number moving with
> nobody able to say why.** Every movement carries the derivation beside it: the command
> that re-derives it, and one sentence naming what moved and whether it was added, removed
> or re-measured.

That is the same rule this file already states for `«61 of 83»` — a carried number nobody
re-derives is how a wrong one survives four phases — and for capability claims. One rule,
a third instance.

The two numbers are **57 of 77 surfaces actively checked** by 5a3, and **40 files / 668
tests** in the census manifest, as of V1-0.
Both were re-measured on a fresh `supabase db reset` at the start of V1-0
(2026-09-06): 5a3 enumerated 42 RLS tables + 29 SECURITY DEFINER functions = 71,
of which 16 were allowlisted by design, leaving 55. **V1-4 took it to 56 of 73:**
`dashboard_layouts` and `dashboard_presets` are two new RLS tables, the second
allowlisted with its reason (a shipped registry carrying no org id, no survey id
and no number). Every checked surface is protected AND guarded, none merely
unproven. The census rose 392 → 395 with Q47's three tests,
395 → 399 with Q36's four, 399 → 417 with the policy panel's
ten warning tests, its five guard tests and «valgfritt» gaining a derived
promise, and 417 → 421 with Q30's four. V1-2 took it 421 → 463: Q43's CSV
serialiser (18), Q35's roles (12) and pack data (5), D94's round semantics (5)
and the k=0 cell-shape invariant (3), then 464 → 475 in the acceptance pass
with the CSV's no-address property (2) and the refusal-copy rule (9). V1-3 took
it 475 → 498 with Q23's schedules RLS (6), Q20/Q22's recurrence (9) and the
status sentence (8). V1-4 took it 498 → 544: Q51's layout constraints and Q25's
RLS (22), the layout model (14), Q42's threshold sentence (5) and the panel
vocabulary's three-way binding (5). V1-5 took it 544 → 553 with Q24/Q45's
registry, the total-mapping assertion and the untouched category CHECK (9);
5a3's denominator rose 73 → 74 with `use_cases`, allowlisted with its reason,
so the checked number holds at 56. **V1-6 took the census 553 → 572** with Q49's
count and its narrowing (4), Q50's clock (7), Q48(b)'s registry binding (5), the
pack builder's two callers (2) and the fix pass's participation denominator (1);
5a3 did not move at all, because `M:0053` replaces a function that already
existed and `M:0051`'s two new ones live in the `app` schema. The close-out took
it 572 → 577 with D102's five (`tests/unit/register-stats.test.ts`). **V2-1 took it
577 → 585** with Q57's org-threshold suite, and **V2-2 → 612**: Q91's boundary
from both ends and the statutory-lock refusal (`tests/db/org-threshold.test.ts`,
18), the k=2 promise tier (4), the shared tier boundary and the «two» copy's
three-way binding (`tests/unit/threshold-tier.test.ts`, 12) and the reachability
of 2 on a survey (1). V2-2's Profil half took it 612 → 631 with the branding suite
(`tests/db/branding.test.ts`, 19). 5a3's checked number held at **56** through
all of it while its denominator rose 74 → 75: `M:0054` replaces two functions in
the `app` schema and `M:0055` moves two CHECK constraints — neither an
app-schema function nor a CHECK is a catalogue surface either sweep enumerates,
a recorded limit of that gate rather than a gap in it — and `M:0056`'s
`brand_accents` is a new RLS table, allowlisted with `use_cases`' reason and,
like it, CHECKED rather than trusted: the suite asserts the table has no column
matching org/survey/count. **V2-3a took the census 636 → 668 across 40 files**
(`tests/db/segments.test.ts` 15, `tests/db/audience-freeze.test.ts` 5, Q62's
five and the shared-predicate seven) and 5a3 **56 of 75 → 57 of 77**: `segments`
is a new RLS table that is CHECKED, and `segment_fields` is allowlisted with
`use_cases`' reason and checked the same way. **The checked number moved up for
the first time since V1-4.** **V2-3b took it 57 of 77 → 58 of 78** — `suppressions`
is a new RLS table and it is CHECKED, not allowlisted, so the checked number moved
up a second phase running; it reports PROVEN even on a bare reset, because the
demo seed carries an objection. The census rose 668 → 691 across 42 files:
`tests/db/suppressions.test.ts` (11), Q64's gap tests in
`tests/db/audience-freeze.test.ts` (5) and Q61's mapping in
`tests/unit/member-status.test.ts` (7). **Q96 took it 691 → 692** with the
same-person lift audit, which also proved `created_by` had no writer at all.
5a3 is unmoved by
any of them: a CHECK constraint is neither an RLS table nor a SECURITY DEFINER
function, and a function in the `app` schema is enumerated by neither sweep, so
neither is a catalogue surface — recorded limits of that gate, not gaps in it.
**V2-4 took the census 692 → 724 across 43 files** — `tests/db/tasks.test.ts`
carries 32 — and 5a3 **58 of 78 → 59 of 80**: `tasks` and
`task_effect_assessments` are new RLS tables and both are CHECKED, `task_kinds`
is allowlisted with `use_cases`' reason and checked the same way, and
`loop_actions` was dropped. **The checked number has now moved up three phases
running.** The phase also REPAIRED an existing gate rather than adding one:
`verify:copy` skipped any string containing a placeholder, so a fixed number in
a second clause was invisible — it strips ICU placeholders and tests what is
left, and found two more allowlist reasons wrong on its first run (V2-4 § 3,
D113).
**V2-5 → V2-8 ran as one continuous session.** The census rose 724 → 769 across
49 files (`round-freeze` 6, `fk-tenancy` 5, `blind-spots` 9, `help` 10,
`test-mode` 9, `use-cases-page` 6) and 5a3 **59 of 80 → 61 of 83**: V2-6's
`support_messages` is CHECKED and PROVEN on a bare reset because the demo seed
carries a message, and `help_articles` and `help_article_translations` are
allowlisted with reasons and checked against them. **The checked number moved up
a fourth phase running**; V2-7 and V2-8 left it unchanged, because a modified RPC
is not a new surface and V2-8 added no table. **The block's three carries took it
769 → 774 across 50 files**, all in one new file: `tests/db/catalogue-invariants.test.ts`
holds the catalogue-derived zero-catch-all sweep (D115) and the seeded-pattern
dialect check (D116). 5a3 is unmoved — neither is a catalogue surface.

**V2-9 took the census 774 → 791 across 51 files** (`tests/db/live.test.ts`, 17)
and 5a3 **61 of 84 → 64 of 89**. `live_sessions` is a new RLS table that is
CHECKED and PROVEN on a bare reset because the demo seed carries a closed
session; `live_stopwords` is allowlisted with `use_cases`' reason and checked
the same way; `close_live_session` and `live_cloud` are CHECKED, and
`redeem_live_voucher` is allowlisted with its reason beside `submit_response`.
**The checked number has now moved up five phases running.**

**W0 took the census to 1130 across 80 files and 5a3 to 71 of 100** (run 144, `0092a33`,
re-derived from the gate's own output rather than carried: 61 RLS tables — 40 checked, 21
allowlisted — plus 39 SECURITY DEFINER functions — 31 checked, 8 allowlisted — with ZERO unproven).
**The denominator rose 97 → 100 and the checked number held at 71**, which is the correct outcome
rather than a miss: `workspaces`, `workspace_modules` and `workspace_module_links` are shipped
registries carrying no org id, so all three are allowlisted with `use_cases`' reason — and CHECKED
against it, not trusted. `tests/db/workspaces.test.ts` (27) asserts each has no column matching
org/survey/count/threshold/total, that RLS is on, that a SEEDED read succeeds for outsider and
anon, and that no policy permits anything but SELECT. Tor's rule from Q118 is the one that
applies: **new surfaces must not vanish from the count; the number is not required to rise.**

**W1 took the census to 1142 across 81 files** (`tests/unit/workspace-chip.test.ts`, 12 — the
tooltip's two clauses in both languages, the nav label Q123 kept, the chip's `touch-44-field`, and
the header's contents asserted as *what v4 draws in it*). **5a3 is unmoved at 71 of 100**: W1 added
no table and no SECURITY DEFINER function, which is the correct reading rather than a gap — a
component is not a catalogue surface.

**W2 took the census to 1167 across 82 files** (`tests/unit/workspace-modules.test.ts`, 21 — all
sixteen row combinations of Oversikt's module grid, plus the cookie parser's refusals). 5a3 unmoved
at **71 of 100**: no new table, no new definer function. Green on its first run, with the two states
a seed cannot reach — the module set is a COOKIE — captured as manifest states and measured clean at
390px.

**W3 took the census to 1186 across 82 files and 5a3 to 71 of 101** — the denominator rose by
exactly `M:0104`'s `workspace_use_case_lifts` and the checked number held, confirmed on three
consecutive runs. The phase's finding is the one the cross-workspace capture was asked for:
`verify:responsive` blocked at 320px **only in the `cx` workspace**, because the layout-note chip
carried the bundle's `flex-none` and `whitespace-nowrap` and its width was therefore set by a
REGISTRY VALUE — «Kundeopplevelse» is three characters longer than «Arbeidsmiljø», ~18px at 11.5px
semibold, and the measured overflow was 18px exactly. Row 10 one level out: the constant is a
layout rule and the varying thing is a WORD.

**V5-1 took the census to 1271 across 91 files** (`tests/unit/shell-footer.test.ts`, 8 — the four footer claims that do not ship, and the shell card's corners) and **V5-2's foundation to 1279 across 92 files** (`tests/unit/worklist-view.test.ts`, 8). **5a3 unmoved at 79 of 109** through both: `M:0112` adds a COLUMN and a CHECK, and neither is a catalogue surface either sweep enumerates — the same recorded limit, not a gap.

**AND V5 HAS NOW MIS-ASSIGNED A STATE BY ITS NAME TWICE, WHICH IS WORTH THE LINE.** `hasSubtools` is `st.screen === "uitest"` and carries no `ui` prefix; the five `col*` toggles render at v5:2959-2971 INSIDE `isUitest` and look like product vocabulary. Both were sorted by spelling and both belonged to the playground — so the uitest set is **28 of 45**, not the 23 V5-0 published. **A prefix is not a location**, and the cost of the second one would have been building five controls the bundle does not draw on the screen they were assigned to.

**I1-3 took the census to 1263 across 90 files** (`tests/unit/integrations.test.ts`, 10). **5a3 is unmoved at 79 of 109** — a screen is not a catalogue surface, which is the correct reading rather than a gap.

**AND `verify:i18n` EARNED ITSELF AGAIN, ON ROW 12's EXACT MECHANISM.** The first version of `lib/scim/catalogue.ts` carried the connector names, descriptions and «Henter» lines as hard-coded Norwegian — Q129's shape, a registry of Norwegian strings rendered straight to screen. The gate failed the route and named **`admin.mgFieldStillingsprosent`**: a message from a DIFFERENT screen whose value happened to collide with one word in my row. It could name nothing else, because a detector that identifies a defect by matching known strings can only report the defects that collide with one. **One word of fourteen rows was visible to it; the other thirteen rows were not.** The copy moved to `messages/*.json`, and the test that replaced the registry assertion is stronger for it: it asserts over the SHIPPED STRINGS, in both languages, including that every key the panel builds by concatenation actually resolves — a missing one renders as a raw key, which is the defect Tor found nine of behind seventeen green gates.

**I1-2 took the census to 1253 across 89 files** (`tests/db/scim-endpoint.test.ts`, 23 — the route handlers called as FUNCTIONS, so the bearer check, the Zod boundary and the tenancy scope run in the normal suite with no gate added and no server to go stale) and **5a3 to 79 of 109**: one new RLS table and seven new SECURITY DEFINER functions, **all eight CHECKED and none allowlisted**. The checked number moved up for the first time since V2-10.

**AND THE THING THAT SUITE STRUCTURALLY CANNOT SEE IS D162.** All twenty-two of its tests passed while the endpoint was UNREACHABLE in production: calling handlers directly never meets the middleware, whose public-path list did not name `/api/scim/`, so an unauthenticated SCIM request got **a 307 to `/logg-inn`** — an HTML login page sent to a machine that speaks JSON. Found by READING the middleware. Test 23 guards the line as a proxy; only an HTTP request to a running server proves the route is served, and no gate makes one for an API route.

**M:0109 took the census to 1227 across 88 files** (`tests/db/scim.test.ts`, 11 — all eleven proven RED first against functions that did not exist). **5a3 holds at 71 of 101**: both SCIM functions live in the `app` schema, which neither sweep enumerates — the same recorded limit as `M:0107`'s, and the correct reading rather than a gap.

**M:0108 took the census to 1216 across 87 files** — `tests/db/deactivation.test.ts` 6 -> 14, and no other entry moved (the proof is the one-line diff, not the total). 5a3 holds at **71 of 101**: both new functions live in the `app` schema, which neither sweep enumerates. Green from a bare `supabase db reset` — with `npm run seed:i18n` and `npm run seed:help` after it, without which four `ui_messages`/`help_articles` tests fail for want of content rather than for a defect.

**I2 TOOK THE CENSUS TO 1340 ACROSS 95 FILES AND 5a3 TO 81 OF 111 — AND IT IS THE FIRST TRANCHE
WHOSE NUMBERS WENT DOWN BEFORE THEY WENT UP, which is the reason the rule above is worded as it now
is.** The derivation, because that is what the rule asks for:

```
census   1325  − 37 (scim.test.ts 14, scim-endpoint.test.ts 23, both deleted)
               + 51 (entra-credential 25, entra-sync 13, entra-graph 13)
               +  1 (integrations 19 → 20)
               = 1340 across 95 files
```

**AND I WROTE 1324 HERE FIRST, FROM A RUN THAT PREDATED THE LAST TWO TEST FILES.** Recorded rather
than silently corrected, because it is the rule's own failure mode arriving in the paragraph that
states the rule: a number carried from an earlier measurement, into a document, by the person who
took it. The reconciliation above is what caught it — the arithmetic did not close, and the honest
reading of that was «the total is stale», not «the parts are strange».

**A FILE'S COUNT IS NOT A RECORD OF WHAT IT CHECKS**, and `integrations.test.ts` is the proof: it
moved by one while SIX of its assertions were rewritten, because I2 reversed what V5-3 had measured
about the same screen. The diff is the evidence; the total is a summary of it.

5a3 went **80 of 110 → 81 of 111**, through an intermediate **72 of 102**: eight SCIM surfaces
removed (`scim_credentials` plus seven `public` functions) and nine added (`entra_connections`,
`entra_connection_status`, `disconnect_entra`, `store_entra_connection` and the five worker
wrappers). Every one is CHECKED; none is allowlisted. The four `app.scim_*` and the six `app.entra_*`
functions are in neither sweep's denominator — the same recorded limit of that gate, twice more.

**AND 5a3's OWN ASSUMPTION SURFACED AS A CRASH.** It probes every RLS table with
`select id from <table> where org_id = …`, and `entra_connections` was keyed on `org_id` alone.
«Every org-scoped RLS table has an `id`» is an enumeration of the forty that existed. The apparatus
is frozen, so **the table conformed rather than the gate** — a surrogate `id`, the claim kept in
`unique (org_id)` — and the assumption is logged for whoever unfreezes it (D168).

**V5-2 AND V5-3 TOOK THE CENSUS TO 1325 ACROSS 94 FILES AND 5a3 TO 80 OF 110.** V5-2's two files
carry 37 (`tests/db/worklist-notes.test.ts` 16, `tests/unit/worklist-rows.test.ts` 21) and V5-3 took
`tests/unit/integrations.test.ts` from 10 to 19; the diff against the previous manifest is **two
added lines and one raised**, which is the proof rather than the total. The 1316 written down
mid-phase was the count BEFORE V5-3's nine — corrected by re-running `CENSUS_WRITE=1` rather than by
adjusting the sentence, because **the census asserts a FLOOR, so an understated entry is a silently
weakened guard for that one file** and `integrations.test.ts` would have been left at 10. 5a3's denominator rose
109 -> 110 with `M:0113`'s `worklist_notes` and the CHECKED number rose 79 -> 80: the table is
CHECKED rather than allowlisted, and PROVEN on a bare reset because the demo seed carries two notes
— one on a task and one on a comment, because the two go through different halves of the select
policy and a fixture with only the first would leave the second unproven.

**AND TWO REGISTRIES ARE NOT REACHED BY `supabase db reset` + `seed-demo`, WHICH IS A FACT ABOUT
THE RUN ORDER AND WORTH WRITING DOWN ONCE.** A bare reset leaves `help_articles` at 0 and
`ui_messages` at 52, so `tests/db/help.test.ts` (3 tests) and `tests/invariants/invariants.test.ts`
(1) fail for a reason that is not a defect: `npm run seed:help` and `npm run seed:i18n -- --local`
are separate scripts. Same shape as the six-tables-unproven note below — «run order changes what a
gate can prove, not the number» — and the remedy is the same: run them, then measure.

**M:0107 took the census to 1208 across 87 files** (`tests/db/deactivation.test.ts`, 6 — two
proven RED first, two controls asserting an external address is untouched, one asserting the
answer counts are unchanged, and the catalogue derivation over every insertion point into
`survey_invitations`). **5a3 is unmoved at 71 of 101**, which is the correct reading rather than a
gap: `M:0107` REPLACES a function that already existed, and it lives in the `app` schema, which
neither sweep enumerates — a recorded limit of that gate, twice over.

**AND THAT RUN SETTLED THE QUESTION THE PARAGRAPH BELOW LEAVES OPEN.** `CENSUS_WRITE=1` ran on a
machine with a database for the first time since the mail tranche, and
`tests/db/catalogue-invariants.test.ts` came back **7** — the hand-raised entry was right. The
proof that nothing else moved is the diff, not the total: the rewrite changed exactly one line.
A hand-corrected floor confirmed by the mechanism it stood in for.

**The mail tranche and the S-block took the census to 942 across 64 files**, and `M:0096`'s
two `proconfig` tests are the last of them — hand-raised in `tests/expected-counts.json` from
5 to 7 for `catalogue-invariants`, because Docker was unavailable in the session that added
them and `CENSUS_WRITE=1` could not run. **The census asserts a FLOOR (`got < want`), so an
understated entry is not a failure — it is a silently weakened guard for that one file**, which
is why it was corrected by hand rather than left for the next full run to notice. The next
`CENSUS_WRITE=1` on a machine with a database should confirm 7 and nothing else moved.

**V2-10 took the census 798 → 820 across 53 files** (`tests/db/quiz.test.ts` 18,
`tests/unit/quiz-tiles.test.ts` 4)
and 5a3 **64 of 89 → 65 of 90**: `quiz_leaderboard` is a new SECURITY DEFINER
function and it is CHECKED. **The checked number has now moved up six phases
running.** No new table — Q84's narrowing plus Q61's «derive, do not duplicate»
removed `quiz_attempts` entirely, so there is no per-person score table at all.

**THE DENOMINATOR ABOVE IS CORRECTED, AND 61 OF 84 IS NOW THE CARRIED NUMBER**
(Tor, 2026-09-09). The V2-5→V2-8 line said «61 of 83». Re-measured by removing
V2-9's four migrations, resetting and running the gate, the state before this
phase was **61 of 84** —
V2-6 added three tables and V2-7 one function to a denominator of 80, and the
carried line dropped one. An arithmetic slip in a carried number, not a gap in
the gate: the CHECKED count of 61 was right both times. Recorded rather than
quietly overwritten, because a carried number nobody re-derives is how a wrong
one survives four phases. The command is
`npm run verify:policy 2>&1 | grep -cE '^  (ok|NO DATA)'` against
`grep -E 'enumerated'`.

**Two gate repairs, both of which earned themselves on their first run.**
`verify:copy` could not see «åtte» — JavaScript's `\b` is ASCII-only, so `å` is
a non-word character and `\båtte\b` never matches after a space. The gate had
been blind to one of the ten Norwegian numerals it lists since it was written,
and it is the one that matters most: **8 is the threshold the statutory
harassment pack locks.** Fixed with `(?<![\p{L}\d])`…`(?![\p{L}\d])` (D123).
And `verify:i18n` gained two seeded-content sources it was missing,
`survey_questions.text` and `duty_definitions.basis`.

**TWENTY-ONE SENTENCES OF BUNDLE COPY WERE FALSE AGAINST THE RUNNING PRODUCT** —
ten in the help articles (D117), eleven in Bruksområder (D122, D124). None was
caught by a gate; every one was caught by measuring a claim against the database.
The gates protect the schema and the data. **Nothing mechanical protects prose,
and prose is what a user reads to decide whether to trust the numbers.**

**Run order changes what 5a3 can prove, not the number.** 55 of 71 either way. But
the script only counts a surface as *proven* when there was a real row for the
policy to refuse, so run it on a freshly reset database and six tables report
PROTECTED BUT UNPROVEN — `demo_requests`, `duty_survey_links`, `logic_rules`,
`report_exports`, `report_shares`, `template_pack_translations` are empty until
something writes them. In `verify:all` the db suite runs first and populates them,
and every surface reports `ok`. Six unproven tables after a bare reset are that
ordering, not a regression.

## When ambiguous
If the design bundle and this file conflict, this file wins on security, the bundle wins on visuals. If something is genuinely unspecified (e.g., a hover state, an error state the prototype lacks), choose the minimal consistent option and log it in `docs/DEVIATIONS.md` — do not invent features.
