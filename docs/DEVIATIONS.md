# DEVIATIONS.md

Every departure from the design bundle, and every choice made where the design
was silent. Claude Code appends here (VERIFY.md Gate 6, item 5); we review the
whole list together in Phase 6.

## How to use this file
- **Accepted** means it matches a written decision. If the decision changes, the
  row becomes **to-fix** — an accepted-deviation label must never be what
  silently settles an open question.
- Every row needs a *reason*, not just a description. "Looked better" is not a
  reason; "the prototype has no error state for this and the minimal consistent
  option was X" is.
- Rows without a decision link are the ones to scrutinize in Phase 6: they are
  choices nobody explicitly made.

## Standing rule
D12's shape recurs, and D12 itself demonstrates it: a limitation correct under
one scope, a defect under another. It was logged as accepted, the scope decision
then changed, and the row flipped to to-fix. When logging this kind of
deviation, always name the decision it depends on — an accepted-deviation label
must never be what silently settles an open question.

## Status register

| ID | What | Status | Link |
|----|------|--------|------|
| D12 | At 390px the app shell header overflows; page renders ~898px wide | **Fixed** — slide-over nav, `scrollWidth == viewport` at 390px and 320px | DECISIONS Q15, docs/RESPONSIVE.md |
| D1–D11, D13–D24 | See the entries below | Accepted | as noted per entry |
| D25 | Brukere keeps its row and its inline controls below `md` | **Resolved** — spec corrected; implementation unchanged | docs/RESPONSIVE.md § Data tables |
| D26 | Question bank adds to the most recent draft | Accepted | see entry below |
| D27 | DECISIONS Q14 (administrator TOTP) — deferred 2026-09-04, re-enabled in Phase 7 | **Enforced** — the deferral's trigger ("before the first real organisation") is Phase 7; no flag in front of it | DECISIONS Q14 |
| D28 | Wizard reports the number of questions it will actually create | Accepted | see entry below |
| D29 | Survey rows link to screens later phases will build | Accepted | see entry below |
| D30 | Builder spacing grows below `md` so 44px hit areas stop overlapping | Accepted | docs/RESPONSIVE.md rules 2-3 |
| D31 | A sent survey's questions are read-only | **Enforced structurally** — database trigger, 2026-09-03 | supabase/migrations/20260903000004 |
| D33 | Standard packs ship without the design's headcount suffixes, and without the "Privat spørsmål" pack | Accepted | see entry below |
| D34 | The Undersøkelser row's meta line omits segments whose value does not exist yet | Accepted | see entry below |
| D35 | The selected survey row carries no ink border | Accepted | see entry below |
| D36 | The wizard's slider is themed, where the prototype leaves it unstyled | Accepted | see entry below |
| D37 | Supabase's PERFORMANCE advisors are deferred to the Phase 6 hardening pass | **Deferred** — Tor's call, 2026-09-03 | see entry below |
| D38 | The respondent surface has a closed/expired screen the design does not draw | Accepted | see entry below |
| D39 | Image-choice options render a tinted panel, not a photo | Accepted | see entry below |
| D40 | The thank-you screen has no peer-results panel yet | **Resolved** — built with a token-scoped, k-gated RPC (migration 0011) | see entry below |
| D41 | Scale buttons keep a 44px floor and wrap rather than shrink | Accepted | docs/RESPONSIVE.md |
| D42 | A reminder rotates the invitation token, with a 72-hour grace window on the previous hash | **Resolved** — Tor's call, 2026-09-04; migration 0012 | see entry below |
| D43 | Send has no "Sendes" scheduling picker and no reminder chips | **Scheduled — Phase 6**, with the recurring-round work | see entry below |
| D44 | Directory-sync imports render but do not import | Accepted | see entry below |

## Entries

Choices made where the handoff bundle, the design bundle, or CLAUDE.md left
something unspecified or self-contradictory. One entry per deviation.

## Bootstrap (pre-Phase 0)

### D1 — Membership helpers moved from migration 0001 to 0002
`app.is_org_member`, `app.has_role` and `app.member_id` were defined in
`0001_foundation.sql` but select from `public.org_members`, which
`0002_tenancy.sql` creates. SQL-language function bodies are validated at
creation time, so `supabase db reset` failed with `42P01 relation
"public.org_members" does not exist`.

Moved the three helpers to the end of `0002_tenancy.sql`, after the table.
Semantics are unchanged. The alternative — `set check_function_bodies = off`
in 0001 — was rejected because it defers a real dependency error to runtime.

### D2 — `feature_flags` primary key replaced with a nullable unique constraint
`0007_ops_i18n.sql` declared `org_id uuid references organizations(id)` with
the comment `NULL = global default`, and the `flags_sel` policy in 0008 reads
`org_id is null or app.is_org_member(org_id)`. But `primary key (key, org_id)`
makes `org_id` implicitly `NOT NULL`, so seeding the eight global flag rows
failed with `23502`.

Replaced the PK with `constraint feature_flags_key_org_uniq unique nulls not
distinct (key, org_id)` (PG 15+). This keeps one row per key per scope,
including exactly one global row per key, while allowing `org_id` to be NULL
as the schema comment and the RLS policy both intend. No foreign key
references `feature_flags`, so dropping the PK breaks nothing.

### D3 — Ops extensions versioned as migration 0010
`pg_cron`, `pgmq` and the `retention-daily` cron job were specified as ops
setup rather than schema. They are in `0010_ops_extensions.sql` so the setup
is reproducible on a fresh branch database instead of depending on someone
clicking dashboard toggles. `cron.schedule` is guarded by a `cron.job`
lookup so re-running alters the existing job rather than duplicating it.

### D4 — Security-advisor baseline for `heituva-prod`
The first remote apply raised findings. Two were real and are fixed forward in
`0011_advisor_hardening.sql` (0001/0009 were already applied, so they are not
edited — CLAUDE.md rule 8):

1. **`anon` could execute `aggregate_results` and `get_quotes`.** 0009 revokes
   from `PUBLIC` and grants to `authenticated`, but Supabase's default
   privileges grant EXECUTE to the `anon` role at CREATE time, and revoking the
   `PUBLIC` pseudo-role does not drop a grant held explicitly by `anon`. Both
   RPCs already refused anon at runtime (`app.is_org_member()` is false when
   `auth.uid()` is null), so this was defence in depth rather than an open door.
   Now revoked explicitly.
2. **Mutable `search_path` on four `app.*` helpers.** Pinned to `''`.
   `app.hash_token` mattered most: it resolves `digest()` from pgcrypto, which
   Supabase installs into `extensions`, so it previously inherited the caller's
   session `search_path`. Now schema-qualified as `extensions.digest`. Output is
   byte-identical — verified against the known SHA-256 of `hello` on both the
   local and remote databases — so stored token hashes stay valid.

The remaining advisor output is **accepted by design**. Treat this as the
allowlist when the CI gate requires advisors to be clean:

| Finding | Objects | Why accepted |
|---|---|---|
| `rls_enabled_no_policy` (INFO) | `responses`, `answers` | This *is* security invariant #1. RLS on with no policy = default deny for every client role. Adding a policy here would be the bug. |
| `anon_security_definer_function_executable` (WARN) | `get_survey_for_token`, `submit_response`, `get_peer_results` | The respondent flow at `/s/[token]` is unauthenticated by design. All three are token-validated, and `get_peer_results` is k-gated on top (D40). |
| `authenticated_security_definer_function_executable` (WARN) | `aggregate_results`, `get_quotes`, `survey_response_counts`, `claim_membership`, `get_survey_for_token`, `submit_response`, `get_peer_results`, `send_round`, `close_round`, and Phase 4's `get_heatmap`, `get_trends`, `get_themes`, `get_benchmarks`, `results_summary`, `dashboard_summary`, `snapshot_results` | SECURITY DEFINER RPCs are the *only* read path to `responses`/`answers`; that is the k-anonymity architecture, not an accident. `send_round` and `close_round` are DEFINER to reach `app.hash_token` and pgmq, and assert `app.can_edit_survey` themselves rather than relying on the definer's rights. |
| `auth_leaked_password_protection` (WARN) | Auth | **Not accepted — genuinely open.** A project-settings toggle (Auth → Passwords → check against HaveIBeenPwned), so it is Tor's to flip, not a code change. |

NOT on this list, and deliberately: `mail_outbox_read`, `mail_outbox_delete` and
`mail_outbox_archive`. They are SECURITY DEFINER too, but granted to
`service_role` only, so no advisor reports them — which is the check that the
grants are right, since the raw invitation tokens live in those messages.

Anything outside this table appearing in a future advisor run is a regression.
Re-read against prod on 2026-09-04 after migrations 0008-0011: 15 findings, all
matching the rows above.

Phase 4 adds seven RPCs to the third row for the same reason the first nine are
there: they are the only read path to `responses`/`answers`, and each one
applies the k gate per cell before anything leaves the database.
`snapshot_results` is DEFINER to reach `aggregate_results` and to write
`result_snapshots`, and asserts `app.can_edit_survey` itself rather than
relying on the definer's rights — the same pattern as `send_round`.

## Phase 0

### D5 — `app` schema: USAGE granted, function EXECUTE locked down (`0012`)
Inserting into `public.org_members` failed with `permission denied for schema
app`: PostgREST resolves a column's type before writing it, and `role` is
`app.member_role`. Phase 1's user administration would have hit this on its
first insert.

Granting `USAGE` alone was not safe. Every function in `app` still carried
PostgreSQL's default `PUBLIC EXECUTE`, and the only thing keeping them
unreachable was the missing schema `USAGE` — accidental protection, not policy.
`app.apply_retention()` is `SECURITY DEFINER` and deletes from `responses` and
`answers`, so exposing it would have been a data-loss vector open to any
signed-in user.

`0012` therefore revokes `EXECUTE` on every `app` function, grants `USAGE`, then
re-grants `EXECUTE` only on the eight helpers that RLS policies evaluate
(`is_org_member`, `has_role`, `member_id`, `can_view_survey`, `can_edit_survey`,
`round_survey`, `duty_org`, `report_org`). Policy expressions run with the
querying role's privileges, so `authenticated` genuinely needs those — an
earlier draft revoked them all and every policy-gated select failed with
`permission denied for function is_org_member`. Default privileges are revoked
so functions added later cannot silently regain `PUBLIC EXECUTE`.

Deliberately still unreachable: `apply_retention` (cron runs it as `postgres`),
`hash_token` and `k_threshold` (called only inside the `SECURITY DEFINER` RPCs,
which run as owner). Verified on both databases.

### D6 — `get_quotes` marked VOLATILE (`0013`)
`supabase db lint` flagged `public.get_quotes` as `STABLE` while its body orders
by `random()`. That ordering is a privacy control, not a cosmetic choice: 0009
notes it must never be chronological, because a stable order would let a reader
align quotes with submission times and re-identify respondents. A `STABLE`
marking permits the planner to evaluate once and reuse, which both misdeclares
the function and risks undermining the shuffle. Corrected with `alter function
... volatile`, leaving the body, arguments and grants untouched.

### D7 — `types/database.ts` is still a placeholder
`supabase gen types typescript --local` fails against the local container with
`password authentication failed for user "postgres"`. The Supabase clients are
therefore generically typed, so a wrong column name is a runtime error rather
than a compile error. Regenerate against the linked project before building
Phase 1 screens.

## Phase 1 (verification pass)

### D8 — `/logg-inn` is invented; the design has no login screen
The design bundle contains no authentication screen. Its only logged-out
affordance is a "Logg inn" button in the header (`HeiTuva.dc.html:155`), whose
`onLogin` handler simply flips `loggedOut` back to false
(`HeiTuva.dc.html:3476`). The login page was therefore designed by me from the
bundle's own primitives — card on `--sf` with `--line` border, 18px radius,
Playfair heading, uppercase 11px/.09em field labels, `--ac` primary button.
It needs a design decision from the product owner; it is not verifiable
against any reference.

### D9 — logged-out header state not implemented
The design shows a dark "Logg inn" button in the header when `loggedOut` is
true. The app redirects unauthenticated visitors to `/logg-inn` instead, so
that header state never renders. Deliberate, but it is a design element that
does not exist in the app.

### D10 — root font-size moved off 14px
CLAUDE.md fixes "base 14px". That had been applied as `html { font-size: 14px }`,
which silently scaled Tailwind's rem-based spacing scale to 87.5% — the header
rendered 14px padding where the design specifies 16px, and the user-menu
dropdown 7px where the design specifies 8px. 14px is now set on `body` as the
text size, leaving the root at the browser default so spacing utilities match
the design. Verified with getComputedStyle: header padding 16px, dropdown
padding 8px.

### D11 — focus ring is `!important` and unlayered
CLAUDE.md requires a 3px `#191510` focus outline. The design's inputs carry
`outline:none` at rest, expressed here as Tailwind's `outline-none` utility.
Utilities are emitted after `@layer base` and have equal specificity, so a
layered rule lost the cascade and the browser default (1px auto) rendered
instead. The rule is now unlayered with `!important`, which is the narrowest
mechanism that reliably wins. Verified: `outlineWidth 3px, style solid,
color rgb(25,21,16), offset 2px`.

### D12 — app shell is not usable at 390px — **FIXED**
At a 390px viewport the header's content is 867px wide, so the browser expands
the layout viewport to ~886px and the page renders zoomed out.

This was logged as accepted while CLAUDE.md scoped the app surface to >=1280px.
**DECISIONS Q15 (confirmed) puts admin mobile in v1, so it is now a defect, not
a deviation.** The fix is specified: `docs/RESPONSIVE.md` § App shell — below
`md`, logo + hamburger + avatar only, nav in a slide-over panel, "Ny
undersøkelse" as its first item, language switcher in the panel footer, and no
overflow at 320px. `document.documentElement.scrollWidth` must not exceed the
viewport at 390px.

This row is the standing rule's own example: an accepted-deviation label was
holding an open scope question shut.

**Fixed.** `components/MobileNav.tsx` moves the nav, the CTA and the language
switcher into a slide-over below `md`, per § App shell. Measured with
`npm run verify:responsive`: `scrollWidth` equals the viewport on all 12 routes
at 390px and at 320px, against 892–898px before, with 0 hit-area overlaps and
0 token drift. Nothing was removed to achieve it — rule 4 — only relocated.

### D13 — Profil "Pålogging og enheter" shows one session, not three
The design lists three devices with last-active times (HeiTuva.dc.html:3347).
Supabase exposes no per-user device or session list to a client — `auth.getUser`
describes only the current session, and the admin API's session listing is not
reachable from the browser and would need the service role. The card therefore
shows the current session and says so ("Vi viser den økten du er innlogget med
nå. Full enhetsoversikt kommer."), with "Logg ut overalt" wired to a global
sign-out, which does work. A real device list needs a server-side session
inventory; it is not something the design's data can be faked into.

### D14 — Om meg "Jobb-e-post" is read-only
The design renders it as an editable input. Changing a sign-in address is an
authentication flow with its own confirmation email, not a profile text field —
writing it here would either desynchronise `org_members.email` from
`auth.users.email` or silently do nothing. Rendered disabled with an
explanation.

### D15 — `profiles.notify` keys re-shaped
0002 seeded `notify` with new_responses / low_score / deadline / digest. The
design's four toggles are a different set: weekly digest, low RESPONSE RATE,
new FREE TEXT, and "when someone shares with me" — while `deadline` has no
toggle at all. 0015 re-shapes the default and migrates existing rows, mapping
low_score -> low_response and new_responses -> new_text where a value already
existed. Without this the screen would have written keys nothing reads.

### D16 — Administrasjon tabs are routes, not local state
The prototype switches the five tabs with component state
(HeiTuva.dc.html:1378). Here each tab is its own route under
`/administrasjon`. The header's user menu already deep-links to
`/administrasjon/personvern`, which local state cannot express, and a reload or
a back button would otherwise drop the administrator back onto Firma. The tab
rail renders identically — same 4px `--sf2` rail, 11px radius, `--sf` plus the
standard card shadow on the active tab — the elements are `<a>` rather than
`<button>`.

### D17 — plan sub-heading omits the renewal date
The design's sub-heading reads "Teamplan · 86 lisenser · fornyes 1. januar
2027" (HeiTuva.dc.html:3294). Plan and licence count come from real data
(`organizations.plan` and the count of non-inactive members). There is no
billing system and therefore no renewal date to read, so that third segment is
omitted rather than invented.

### D18 — DSR rows create real requests
The prototype's four "Behandle"/"Eksporter" buttons only write the row's title
into local state (HeiTuva.dc.html:3273-3277) — there is no request being
processed. Here the button reveals a subject-email field, which is the minimum
`dsr_requests` needs to create a row, and the requests that produces are listed
under the design's "Under behandling:" line with a status select. Without that
list there is no way to move a request through `mottatt → under_behandling →
fullfort`, so the 30-day deadline the same card advertises would be
untrackable — and the `dsr.status` audit event CLAUDE.md requires would have no
trigger.

### D19 — group progress bars are relative to the largest group
The design fills each group card's bar as `count / 40` (HeiTuva.dc.html:3255).
Nothing states that 40 is a real cap, and a bar that silently pins at 100% for
any group of 40+ misreads at a glance. The bar is filled relative to the
largest group in the org instead, so the comparison the bar is making is the
one it appears to make.

### D20 — Dokumentasjon list has no download
The design's four documents carry signing dates and a "Last ned" affordance
(HeiTuva.dc.html:3279-3284). No document store exists until Storage lands, so
the rows render with "Ikke lastet opp ennå" rather than fabricated dates, and
"Last ned" stays inert text with a note that uploading arrives in a later
phase. Making the label a dead link would be worse than making it plainly not
a link.

### D21 — onboarding screen is not in the design bundle
The prototype opens on a populated organization, so there is no signup or
first-run screen anywhere in it. One is required: a signed-in user with no
membership had no reachable page at all — middleware bounces an authenticated
request off `/logg-inn` to `/`, and the app layout sent them back to
`/logg-inn`, a redirect loop with no exit. `/kom-i-gang` is built from the login
card's primitives (same 420px card, same field and button treatment) and creates
the org through a service-role server action, which is unavoidable: `members_ins`
is gated on already being a member, so nobody can write their own first row.

### D22 — MFA screen is not in the design bundle (not currently built)
DECISIONS Q14 is deferred (D27), so there is no `/sikkerhet` screen in the tree
right now. This entry is kept as the design record for when Q14 returns: the
bundle has no MFA screen, so `/sikkerhet` reuses the login card's layout and
shows one of two states — enrol (QR plus the shared secret) when the account
has no verified factor, and challenge (six-digit code) when it has one but the
session is still aal1 — with enrolment behind an explicit button rather than
started on page load, so a GET never mutates the account's factors. It was
built this way in Phase 7 (7d) and removed again the same phase when Q14 went
back to deferred.

### D23 — Firmaopplysninger saves on blur, with a status chip
The design's Firma card has no save button (HeiTuva.dc.html:1386-1397): the
prototype writes each keystroke into local state, which is not persistence. The
card body is kept pixel-identical — no button is added — and it saves when a
changed field loses focus. The one addition is the "Lagret ✓" chip in the card
header, which is the treatment the design already uses on Profil's Om meg card,
because a save with no acknowledgement is indistinguishable from a save that
silently failed. A visually hidden submit button remains so pressing Enter in a
field still works.

### D24 — "Skjul resultater under 5 svar" carries an extra line
The design renders it as an ordinary toggle (HeiTuva.dc.html:3261). It cannot be
one: k=5 is enforced in the database and is not org-configurable (DECISIONS Q3),
so the action refuses the key and nothing an administrator did to that switch
would change anything. It renders on, non-interactive, with
"Alltid på — håndheves i databasen" appended to the design's own description.
Leaving the description verbatim would have meant shipping a switch that looks
live and silently ignores every click.

### D25 — Brukere cards keep their actions inline, not in an overflow menu
`docs/RESPONSIVE.md` § Data tables says a row below `md` becomes "a card —
primary field as the card title in the design's card styling, remaining fields
as label/value pairs, row actions in an overflow menu". Two parts of that are
not implemented as written:

1. **Actions are inline, not behind an overflow menu.** A row has exactly two
   controls, the role `<select>` and Deaktiver/Aktiver, and both fit at 390px
   with no horizontal scroll and no hit-area overlap (measured: 0 findings).
   Putting a role select behind a menu adds an interaction the design does not
   have anywhere and hides the single most consequential control on the screen
   — role assignment — behind a tap. The overflow menu earns its place when
   actions outnumber the width; here it would cost more than it saves.
2. **The card keeps the design's row separator rather than card chrome.** The
   pattern says "the design's card styling"; the rows sit inside a card
   already, so giving each row its own border, radius and surface would nest
   cards two deep, which appears nowhere in the bundle.

Status: **resolved — the spec moved, the code did not.** Tor's call: the
implementation was right and § Data tables was wrong. The section now scopes the
card treatment to wide rows (4+ fields, or controls that cannot fit at 390px)
and keeps narrow rows as rows, naming Brukere as the example. It also adds two
constraints that override the card treatment either way: consequential controls
— role selects, deactivate, retention, anything changing permissions or deleting
data — never go behind an overflow menu on any viewport, and a card is never
nested in a card.

Re-checked against the updated section rather than assumed: Brukere keeps the
row with only a `border-b` separator (UsersPanel.tsx:90), stacks below `md`
solely because ~335px of controls cannot fit at 390px (which the narrow-row
clause permits), renders the role select and Deaktiver inline at every viewport,
and carries no per-row card chrome — the one `rounded-[18px]` in the file is the
outer section. No code change was needed; only the stale comment citing the old
clause was corrected.

Worth keeping for the pattern it demonstrates: a named pattern in a
specification is still a claim about the world, and the right move on
disagreeing with one is to implement what is defensible, log it, and say so —
not to comply quietly or diverge quietly.

### D26 — the question bank adds to the most recent draft
The design's bank rows read "legges rett inn i {draftTitle}"
(HeiTuva.dc.html:1659) against a single implicit draft — the prototype has
exactly one survey, so the question of *which* one never arises. It does here.

"Legg til" targets the org's most recently updated survey with status `utkast`.
When there is no draft, the button is disabled with the reason shown above the
list ("Du har ingen utkast ennå — opprett en undersøkelse først") rather than
hidden: RESPONSIVE.md rule 4 forbids removing a feature, and a control that
silently does nothing is worse than one that says why it cannot.

The alternative — creating a draft on the fly — was rejected: a survey appearing
in Undersøkelser as a side effect of browsing the library is a surprise, and the
design gives no title for it.

Revisit when the Builder lands in this phase: if the builder holds an explicit
"current draft", this should follow it instead.

### D27 — administrator MFA: deferred (driver: DECISIONS Q14)
**Deferred.** Q14 says do not build or enforce TOTP; Supabase Auth's MFA
capability stays available but is not required at login. Nothing in the tree
enforces it: there is no `/sikkerhet` screen, no assurance-level redirect in
`app/(app)/layout.tsx`, no MFA check in the administrator-only server actions
(Administrasjon and the translation editor), and no harness TOTP seeding.
`supabase/config.toml` leaves `[auth.mfa.totp]` enrolment on, which is the
"capability available, not required" state Q14 asks for.

**Trail.** This control has moved three times and the register carries every
move on purpose:
- 2026-09-03 — *suspended* behind `feature_flags.admin_mfa` (App Authenticator
  was not enabled on `heituva-prod`, so the first administrator was held at
  `/sikkerhet` on a screen whose enrol call could not succeed).
- 2026-09-04 — *deferred*: the flag and the enforcement code both removed
  (`20260904000009`), to cut development friction while there were no customers
  and no real data.
- Phase 7 (7d) — *re-enabled* on the reading that Q14's trigger ("before the
  first real organisation") had arrived: `lib/auth/mfa.ts`, the `/sikkerhet`
  screens (D22), the layout gate, the admin-action gates, `scripts/seed-mfa.ts`,
  `tests/db/mfa.ts`, `satisfyMfa()` and a pinned `sikkerhet.png` all came back.
- Phase 7, same phase — *reverted to deferred* on Tor's instruction: all of the
  above removed again, back to the 2026-09-04 state. The route is gone rather
  than left enforcing nothing.

**Re-enable trigger (unchanged):** before the first real organisation is
onboarded, or before prod holds any real respondent data — whichever comes
first. `AUTHORIZE.md` lists it beside leaked-password protection, which is off
for the same window, so the two are re-enabled as one task. When Q14 returns,
re-enabling is restoring the enforcement code (the 7d diff is the template),
not flipping a row — and, on production, enabling TOTP enrolment in Auth
*before* the first administrator signs in, or the gate locks out the only
person who could unlock it.

### D28 — the wizard counts the questions it will actually create
The prototype's count slider runs 2-7 and slices the chosen pack
(HeiTuva.dc.html:78, :3535). A pack with four questions therefore produces four
while the summary still reads "med 7 spørsmål", and the question list on step 2
shows four rows under a label claiming seven.

The slider keeps the design's 2-7 range, and the slicing is unchanged. Only the
reported number moved: the step-2 label, the respondent-time estimate and the
step-4 summary all use `min(count, pack.questions.length)`, so the wizard never
promises a survey it is not about to create.

Not treated as a visual change: the same controls, in the same places, with the
same wording — the number inside the sentence is the only difference, and the
alternative is a summary that is wrong for eleven of the seventeen packs.

### D29 — the survey row links into screens that do not exist yet
The ··· menu and the primary button are the design's
(HeiTuva.dc.html:766-801), and five of their destinations belong to later
phases: `send` and `test` to Phase 3, `resultater` to Phase 4, `rapport` to
Phase 5.

They are rendered as real links rather than hidden or disabled. Hiding them
would make the menu a different menu at every phase boundary, and RESPONSIVE.md
rule 4 already refuses "hide the feature" as an answer elsewhere. Each
destination is declared in `tests/routes.manifest.ts` as a pending route, so the
verification harness classifies their prefetches as pending rather than as
failures, and the list of what is still missing stays visible in every capture
run.

`isPendingRoute` had to learn dynamic segments for this: it previously ignored
any pending route containing `[`, which was harmless while `/s/[token]` was the
only one and nothing linked to it. The moment a row prefetched
`/undersokelser/<uuid>/send`, every one of those reads as a real 404.

Revisit: nothing to revisit — each entry stops being pending when its phase
lands.

### D30 — the Builder's spacing grows below `md`, its controls do not
Measuring the Builder at 390px and 320px produced 34 overlap blockers, all of
one shape: the card's icon buttons are 30-32px at a 4px gap, and the option
rows put a bare `×` 9px from a text input. Expanded to 44px, those hit areas
sit on top of each other — RESPONSIVE.md rule 3's "the failure mode that
actually hurts users".

Per the rule, the control is a token and the spacing is layout. Every button
keeps its exact design size at every width; three gaps widen below `md` and
return to the design's value at `md` and up:

- card header row `10px → 14px`
- the reorder/duplicate/bank cluster `4px → 14px` (30px control + 14px = a 44px
  pitch exactly)
- option and statement rows `9px → 18px` (the bare `×` expands ~17px into the
  input, so anything less still overlaps)

The two header inputs — title and audience — are borderless and transparent, so
they cannot take the `touch-44-field` treatment: its inset ring would paint a
border the design does not have. They get plain vertical padding below `md`
instead, which is invisible on a transparent control and raises a 20px audience
field to a 44px touch box.

### D31 — a sent survey's questions are read-only
`can_edit_survey` answers who may edit, never when. Nothing in the schema stops
an administrator rewriting the questions of a survey that has already gone out,
and `survey_rounds.question_snapshot` is immutable by design — so the live round
and the Builder would simply disagree, with responses already attached to the
frozen set.

`saveDraft` refuses with `locked` unless `status = 'utkast'`, and the Builder
renders every control disabled with a line saying to copy the survey as a new
round instead. The design has no such state: its prototype has no rounds, so the
question cannot arise there.

**Updated 2026-09-03 — this is now enforced in the database** (Tor's call), by
`app.forbid_edit_after_send()` on `survey_questions` and
`app.forbid_translation_edit_after_send()` on `question_translations`
(migration 20260903000004).

The reasoning that moved it: aggregation keys on `question_id`. A question
edited after a round opened silently re-labels answers already given to the old
wording, and a deleted one cascades its answers away — both corrupt results
rather than raising, so a UI-only guard fails invisibly in exactly the place it
matters most.

The threshold is a round whose status is not `scheduled`. A survey scheduled in
advance stays editable; `open` and `closed` both mean the questions have been
seen. The trigger fires regardless of role, service role included: this is a
data rule, not a permission, and a background job corrupts results exactly as a
user would.

My earlier note said a CHECK would block Phase 3's reminder and schedule writes.
That argument was wrong on its own terms — those write to `survey_rounds` and
`schedules`, not to `survey_questions` — and it argued against a CHECK when a
trigger was the right instrument anyway.

Eight invariant tests cover it, including one that proves the redaktør really
may edit an unsent survey, so the refusals are refusals and not an RLS filter
returning an empty set.

### D32 — the responsive sweep measured a fraction of what it reported
Found by re-running Phase 1 against the fixed harness, which VERIFY.md now
requires whenever a harness fix widens coverage.

The sweep took one state per route, and only if that state was named
`default`. Everything reachable only by clicking was therefore never measured
at any width: the user menu, the DSR form, the invite states, the survey row
menu, the share panel, the Builder's panes, the wizard. Phase 1 and Phase 2
both reported green over surfaces the gate could not see.

With every state measured (74 combinations, up from 22), five real defects
surfaced — three of them in Phase 1, which had been signed off twice:

- `admin-firma/saved` scrolled horizontally at 320px (323px): the "Lagret" chip
  beside the display heading.
- `admin-personvern/dsr-form-open` scrolled at 320px (339px), and its email
  field was 42px tall.
- The user menu's rows sat flush, so their 44px areas overlapped by 840px² — a
  thumb aimed at "Min profil" could land on "Administrasjon".
- The survey row's ··· menu had the same overlap, 505px² per pair.
- The wizard's range input was 16px tall.

And one behavioural bug the sweep exposed rather than measured: the row menu's
links navigate client-side, so React reused the component and `open` survived
the navigation — the menu hung over the share panel it had just opened.

Two measurement corrections came with it, because the first widened run
reported 34 overlaps that were stacking rather than conflict:

- A control whose centre is covered by an overlay is skipped; it cannot receive
  a tap.
- An overlapping pair is skipped when the centre of the overlap is painted by
  one of the two. Whoever paints the region owns it; the other's expansion
  there was never reachable. Two neighbours colliding in the gap between them
  still report, which is the case the rule is about.

Focus is a separate axis and is not covered by either: `components/ModalLayer.tsx`
portals a dialog to `body` and marks every sibling `inert`, so the wizard and
the Builder's sheet no longer leave the shell behind them tabbable.

The sweep now prints `declared / measured / skipped` and fails on any shortfall.


### D33 — standard template packs drop the design's headcounts, and one pack

The design bundle's `PACKS` gives four packs an audience with a headcount:

| pack | design bundle | seeded |
| --- | --- | --- |
| Ukespuls — Produkt | `Produktteamet · 34 personer` | `Produktteamet` |
| Oppstartssjekk — 30 dager | `Nyansatte · 12 personer` | `Nyansatte` |
| Samling i Bergen | `Deltakere · 58 personer` | `Deltakere` |
| Arbeidsmiljø — månedlig | `Hele selskapet · 86 personer` | `Hele selskapet` |

A standard pack is a global row with `org_id NULL`: every organisation on
HeiTuva reads the same one. "34 personer" is therefore a number no organisation
supplied and none can be measured against — it is the prototype's stage
dressing, and shipping it renders a count that looks like data on a screen where
everything else is. CLAUDE.md forbids exactly that. The counts stay off until an
audience is a real membership with a real size, at which point the segment can be
computed rather than seeded.

The bundle's eighteenth pack, `"Privat spørsmål"` — title "Hei! Et kjapt
spørsmål", audience "Bare vennene mine · 9 personer" — is not seeded at all. It
is the designer's own placeholder illustrating a *private* template; as a
standard pack it would appear in every customer's Bibliotek. Firmaets maler is
where a private template belongs, and Phase 2's "Lagre som mal" now produces one,
so the state the pack was standing in for is reachable without it.

Consequence to keep in mind: the standard grid renders 17 cards, the reference
render 18. The pixel gate for `/bibliotek` compares against the app's own
baseline for that reason; `verify:reference` remains the fidelity check and it is
read with this entry beside it.

Everything else in `PACKS` is seeded verbatim, including `Samling i Bergen`,
which migration `20260903000005` restored after it had been shortened to
`Samling` with no entry here.

### D34 — the survey row's meta line omits what it cannot know

The design's row reads `Aktiv · 68 % · 42 av 62 svar · v1`. Three of those
segments need data Phase 2 does not have: the round's target headcount, and a
question-set version. The row now renders only the segments whose values exist —
status, and the response count as "N svar" — and hides the progress bar entirely
when no target is known.

The alternative was the one this replaced: a literal `v1` in the JSX and a
percentage computed against an unknown denominator, which rendered "Aktiv · 0 %"
on a survey with responses. Both looked like data and neither was. When Phase 3
records a round's invited count, the percentage and "42 av 62" come back from the
same place the count does; a question-set version arrives with Phase 3's round
snapshots.

### D35 — the selected survey row has no ink border

The prototype gives the row you last clicked a 1.5px `--ink` border, held in
component state. Selection here means "the survey whose panel is open", which is
a URL, and the share panel already marks it — the row's border would be a second
indicator of the same fact. Left out until a screen has a selection that is not
otherwise visible.


### D36 — the wizard's slider takes the accent colour

`HeiTuva.dc.html:79` gives the "Hvor mange spørsmål?" range input `flex:1` and
nothing else, so it paints the browser's default control — bright system blue,
the only colour in the app outside the palette. The design's other slider, the
respondent's (`HeiTuva.dc.html:2022`), sets `accent-color:#F5C64A`.

Read as an instruction the two conflict; read as intent they do not, so the
wizard's slider takes `accent-color: var(--ac)` like the respondent's. The
bundle wins on visuals, but not on an omission it contradicts elsewhere in
itself.


### D37 — the performance advisors are deferred to Phase 6

CLAUDE.md's testing gate asks for `supabase db lint` and the advisors clean.
`db lint` is clean. The PERFORMANCE advisors are not, and the findings below are
deferred to the Phase 6 hardening pass rather than fixed now. Counts re-read
from `heituva-prod` on 2026-09-04, after migrations 0005 and 0006 were applied —
135 findings, none of them introduced by those two:

| advisor | count | what it is |
| --- | --- | --- |
| `unindexed_foreign_keys` | 46 | a foreign key with no covering index |
| `multiple_permissive_policies` | 75 | two or more permissive policies on the same table and action, so both are evaluated |
| `unused_index` | 6 | an index nothing has used yet |
| `auth_rls_initplan` | 7 | `auth.uid()` called per row instead of once per statement |
| `no_primary_key` | 1 | `feature_flags` has none |

Deferred, not dismissed, and deliberately in that order:

- Every one of them is a cost, not a correctness or a security problem. A
  missing index makes a join slower; an overlapping permissive policy makes a
  read slower and is never more permissive than the union it already is;
  `auth_rls_initplan` re-evaluates a function that returns the same answer.
- Three of the four cannot be judged on an empty database. `unused_index` on a
  table with six rows means "nothing has run yet", not "this index is dead" —
  acting on it now would drop indexes Phase 4's aggregation is about to need.
  The unindexed foreign keys are the same: which ones matter depends on the
  queries Phases 3-5 actually issue.
- The policy overlaps are the one item with a real design decision behind it
  (a per-role policy set that reads clearly versus one combined policy that
  reads fast), and that decision wants the whole policy surface in front of it,
  which Phase 5 completes.

- `no_primary_key` on `feature_flags` cannot be fixed as stated. The table is
  keyed `UNIQUE NULLS NOT DISTINCT (key, org_id)` because a NULL `org_id` means
  "global flag", and a primary key's columns must be NOT NULL. Closing it means
  a surrogate `id` or a sentinel org, which is a modelling change, not a tuning
  one.

The Phase 6 pass owns these, against a database with representative data and
the full query set. Until then the advisor output is expected to be non-empty
and is read with this entry beside it. A new SECURITY advisor finding is not
covered by this deferral and still fails the gate.

### The SECURITY advisors, and why they are not on that list

D4 already set this allowlist during bootstrap; this is the same list re-read
against the synced schema on 2026-09-04, confirming that migrations 0002-0007
added nothing to it. Two things D4 does not cover: the exact object list has
grown by `claim_membership` and `survey_response_counts` (both added later,
both the same SECURITY DEFINER pattern D4 accepts), and there is one finding
that is NOT on D4's allowlist and is genuinely open — leaked-password
protection, last row below.

They are not "clean" in the sense of empty, and it is worth being precise about
what the eleven findings are, because most of them are the security invariants
working:

- `rls_enabled_no_policy` on `responses` and `answers` (INFO) — CLAUDE.md
  invariant 1. Clients never select from those tables; the absence of a select
  policy is the enforcement, not a gap. Adding one to silence the advisor would
  break the invariant.
- `anon_security_definer_function_executable` on `get_survey_for_token` and
  `submit_response` (WARN) — invariant 2. The respondent flow is anonymous and
  token-authenticated by design; these two are the only path in, and they are
  SECURITY DEFINER precisely so the caller needs no table rights.
- `authenticated_security_definer_function_executable` on `aggregate_results`,
  `get_quotes`, `survey_response_counts` and `claim_membership` (WARN) —
  invariant 1 again. These are the k-anonymity gate. They must read tables the
  caller cannot, which is what SECURITY DEFINER is for.
- `auth_leaked_password_protection` disabled (WARN) — the one genuine item. It
  is a project-settings toggle (Auth → Passwords → check against
  HaveIBeenPwned), not a code change, and it is Tor's to flip.


### D38 — the respondent flow has a screen the design does not

The prototype's link always resolves, so it draws no state for a token that
does not. The real surface needs one: links expire, rounds close, and people
paste URLs wrong.

An unknown token and a closed round render the SAME screen, deliberately. Two
different messages would answer the question "is this a real token?" for
someone trying them in bulk, which is the one question a public URL keyed by a
secret must not answer. It returns HTTP 200 for the same reason — a 404 is
equally an answer.

### D39 — image choices render a tinted panel

`image` questions carry option labels but no image URLs: the Builder's upload
slots have no storage path behind them yet (Phase 3 ships the respondent flow;
uploads land with the Send/Storage work). Rather than a broken `<img>` or a
stock photo standing in for the customer's own, the card renders the design's
tinted panel with the option's label under it — the layout is right and nothing
pretends to be a picture that was never uploaded.

### D40 — the thank-you screen's peer-results panel (RESOLVED)

Built in migration 0011 as `public.get_peer_results(p_token)`, deliberately not
by opening `aggregate_results` to `anon`. What makes it narrow enough to be a
public surface:

- **Token-scoped.** The caller proves possession of a token for that round.
  There is no survey id parameter, so there is nothing to walk.
- **One question.** The first numeric question of the round — the one the design
  charts. No question picker means no way to sweep the survey.
- **k-enforced in the same function**, using `app.k_threshold()` rather than a
  literal, so it moves with every other aggregate. Below the threshold it
  returns `insufficient_data` and *no counts at all* — not even `n`, because "4
  people have answered" is itself information about who, on a small team.
- **Opt-in.** Nothing is returned unless the survey's own `engage.reveal_results`
  is on.
- **Counts only.** No free text, no group breakdown. `get_quotes` stays
  authenticated-only and is unreachable from here.

It is fetched after submitting, never before: showing a respondent the
distribution first is how a survey ends up measuring conformity.

Verified in both directions — `verify:respondent` asserts real buckets above the
threshold, `insufficient_data` with no leaked count below it, and `not_found`
for an unknown token.

### D40 (original entry) — why it was deferred

The design's thank-you shows "Slik svarte kollegene dine" — a bar chart of the
first scale question, with the k-anonymity floor stated below it
(HeiTuva.dc.html:2117-2135).

It is not built, and the reason is a decision rather than time. Every aggregate
RPC is `authenticated`-only; showing peer results to a respondent means a
k-gated aggregate readable by anyone holding a token. That is a new public
surface on the most sensitive data in the product, and it should be designed as
one — token-scoped, round-scoped, k-enforced in the same SECURITY DEFINER
function — not added as a side effect of building a screen. Tracked as Phase 3
remaining work, not as a deviation to accept.

Until then the thank-you screen shows the survey's own `engage.thank_you` text,
which is real data the Builder collects, and nothing else. It does not render
an empty chart or a "results coming soon" placeholder.

### D41 — scale buttons keep their 44px floor

The design gives a scale's buttons `flex: 1 1 0` (HeiTuva.dc.html:2927) — equal
widths, one row, no minimum. At the 5 points the prototype shows, that is one
comfortable row at 390px and the implementation matches it exactly.

At 11 points — an eNPS question, which the prototype never renders on this
screen — the same rule gives 18px targets. `min-width: 44px` is added so those
wrap into two rows instead, which is RESPONSIVE.md's floor and the only rule
that governs below 1280px. A 5-point scale is unaffected, so the design's own
case is untouched.


### D42 — rotation with a grace window (RESOLVED)

**Tor's decision, 2026-09-04:** keep rotation, add a 72-hour grace window on the
previous hash. Both values stay one-way, so a database breach still yields no
usable link — this accepts two hashes for a window, it does not store a
credential. Implemented in migration 0012.

**Rejected for the record so it does not resurface:** an HMAC-derived token
regenerated on demand from a server secret. One secret compromise mints every
live respondent link — the same blast radius as encrypted storage, with fewer
moving parts to notice it happening.

**The constraint that came with it — rotation is incidental, not revocation.**
Closing a survey, closing a round or bouncing an invitation must invalidate BOTH
hashes immediately, or the grace window becomes a way for a closed survey to
keep taking answers. Making that true surfaced two defects, neither caused by
the grace window:

1. **Closing a survey did not close its rounds.** `closeSurvey` set
   `surveys.status = 'lukket'`; `submit_response` only ever read
   `survey_rounds.status`. A closed survey kept accepting answers — reproduced
   against the local database before the migration was written. Now a trigger on
   `surveys`, so every path that closes a survey closes its rounds, not just the
   button the UI happens to call.
2. **A bounced invitation still resolved.** `bounced_at` was written by the mail
   worker and read by nothing.

Both were possible because token resolution was copy-pasted into three RPCs.
There is now one `app.resolve_token`, and the three call it; that is why
`bounced_at` was missing from all three at once.

Covered by 14 negative tests in `tests/invariants/token-lifecycle.test.ts` —
closing the round, closing the survey, bouncing, expiry and answering each
assert that BOTH hashes are refused, and that a closed survey cannot be answered
through either. A replaced-but-in-window token opens the survey; past the window
it reports `replaced` and gets the "Denne lenken er erstattet" screen, which is
the one case worth distinguishing because the reader already holds a real link
and needs telling to look for the newer email.

### D42 (original entry) — why rotation was necessary at all

Tokens are hashed at rest (CLAUDE.md invariant 5), so the original link cannot
be reconstructed to put in a reminder: the database holds `sha256(token)` and
nothing else. Three options existed — rotate the token, store the raw one
encrypted, or send a reminder with no link. Migration 0010 rotates.

The cost is bounded but real. Reminders only go to invitations with
`responded_at is null`, so the link being invalidated is one nobody has
submitted through. The person it can bite is someone who opened the invitation,
left it in a browser tab, and returns after the reminder: they see the closed
screen and must use the newer email.

The alternative is holding a decryptable copy of every live respondent
credential, which is a materially worse thing to have breached in a product
whose entire proposition is that answers cannot be traced back.

**This one wants a decision rather than an acceptance.** If the tab case matters
more than the storage risk, the shape to consider is a short-lived
re-issue page ("this link has expired — send me a new one") rather than
encrypted storage.

### D43 — Send has no scheduling picker and no reminder chips

The design's Levering panel has a "Sendes" select (Med en gang / Mandag 09:00 /
Fredag 15:00) and, below the reminder select, two chips ("Påminnelse dag 2",
"Ny påminnelse dag 5").

Neither is built:

- **The "Sendes" picker** would have to defer the send. `send_round` opens the
  round in the same transaction that mints the tokens, so "Mandag 09:00" would
  need a scheduled-round state that does not exist yet (`survey_rounds.status`
  has a `scheduled` value, but nothing enqueues one). A picker that silently
  sent immediately would be worse than none — the user would believe they had
  scheduled something.
- **The reminder chips** duplicate the reminder select in the design; both set
  the same thing. The select is the substantive control and it writes
  `schedules.reminder_after_days`, whose CHECK constrains it to 0, 2 or 5 —
  exactly the three options offered.

**Scheduled for Phase 6**, alongside the recurring-round work — not deferred
indefinitely. The `schedules` table and the `scheduled` value on
`survey_rounds.status` already exist, so this is small once there is a reason to
be in that area again; what it still needs is a decision about how a scheduled
round appears on the Undersøkelser list before it is sent.

### D44 — the three directory-sync imports render but do not import

The design offers six import sources. Three are parsing problems and are built
(CSV, Excel, paste — `lib/send/import.ts`, eleven unit tests). Three are
integrations with their own OAuth flows and admin consent: Entra ID, Google
Workspace and HR systems. They are flagged off (`entra_sync`, `google_sync`,
`hr_sync`) and land in Phase 6 alongside Entra SSO.

**CORRECTED 2026-09-08. Two claims above are wrong, in different ways, and V2-3
carries the correction rather than relocating the entry. This entry is instance
2 of four in D110 — «a gate nobody reads is not a gate» is named there, and (a)
below is what named it.**

**(a) NEVER TRUE — «they are flagged off».** The three flags are seeded `false`
(`supabase/seed.sql:162-163`) and **read by nothing**: a whole-repo grep returns
nine lines, none a call site. What actually gates the three sources is
`IMPLEMENTED_SOURCES` (`lib/send/registry.ts:125`), a hard-coded client constant
branched on at `SendScreen.tsx:364` — not org-scoped, not a row, not switchable
per tenant. **The mechanism this deviation names has never existed**, and Q9's
own clause «sync sources gated by `feature_flags`» inherits the same error. That
makes it a data-not-code violation sitting inside the block V2-3 rewrites.

**(b) WENT STALE — «eleven unit tests».** `tests/unit/import.test.ts` has **15**
(`tests/expected-counts.json`). True when written, and the kind of number a
deviation should not carry: the census manifest already holds it, and a count
duplicated into prose is a count that drifts.

**(c) And a third claim, from the same family, found with them.** «Excel» is one
of the three «built» parsers — but the file input accepts `.csv,.tsv,text/csv`
(`SendScreen.tsx:376`), the handler is `file.text()` (`:380`), and no xlsx
library is in `package.json`. A real `.xlsx` is read as text and silently
produces garbage rather than refusing, under a label reading «Excel (.xlsx)» and
help text promising «Vi leser første ark». **Q62 decides whether that is
implemented or renamed**; recorded here because this entry is where a reader
would look for it.

Their cards still render, because the design draws six and hiding three would
misrepresent what the product does. Selecting one shows the design's own
explanation of what the sync does plus one line saying it is not available yet —
rather than a button that fails, or a card that silently does nothing.

### D45 — the quote attribution says nothing rather than "Anonym"

The design prints every free-text quote with an author line — `— {{ t.who }}`,
which in the prototype is the literal string "Anonym" for an anonymous survey
and a person's name otherwise (HeiTuva.dc.html:2189, 2740).

`get_quotes` returns no author, no group label and no timestamp, and it never
will: that is invariant 1 and invariant 7, and a quote carrying a name would be
an individual answer in a panel that exists to show aggregates.

So the line renders as `— Anonym` when the survey's anonymity mode actually is
`anonymous`, and is omitted entirely otherwise. Printing "Anonym" beside a quote
from a named survey would be a claim the data does not support — the reader
would take it as a promise that the answer cannot be traced, when the schema
says it can.

### D46 — the Dashboard has no panel pins and no "Åpne rapport"

Each Dashboard panel in the design carries a "Legg i rapport" pin, and the
header carries "Åpne rapport (n)" which opens the report editor with the pinned
sections pre-selected (HeiTuva.dc.html:3051-3056).

The report editor is Phase 5 and there is no table for a pin. A pin built now
would store nothing and open nothing, and the count in the button would be a
number about a report that does not exist — the fabricated-state case CLAUDE.md
rules out. Both arrive with Rapporter in Phase 5, where the pinned set has
somewhere to go.

Everything else on the panel — its data, its filters, its note — is built.

### D47 — the benchmark footnote cites the seed, not "214 virksomheter"

The design's "Mot bransjen" panel ends with "Sammenlignet med 214 norske
virksomheter i samme bransje og størrelsesgruppe siste 12 måneder"
(HeiTuva.dc.html:3658).

There is no such panel. `benchmarks` is a static seed of reference values whose
own `source` column reads "Seed — erstatt med kildeført referanse" (DECISIONS
Q8), and cross-tenant aggregation is explicitly a later product decision that
needs DPA language first. Printing the design's sentence would attribute our
seeded constants to a survey of 214 companies that nobody ran.

The panel therefore prints the row's own `source`. When Q8 is answered with real
sourced values, the footnote becomes true by changing the data — which is the
point of keeping it in a column.

The industry chips are the industries the table actually holds, for the same
reason: the design lists five, the seed has two, and seeding three more would be
inventing three datasets.

### D48 — the previous-round average is the previous round

The design's trend card shows `prevAvg` as `avgScore - 0.3` and its chip as the
constant string "+0,3 mot forrige runde" (HeiTuva.dc.html:3700-3701). Those are
placeholders in a prototype with no rounds.

Rounds are real here, so both numbers come from `get_trends`: the last two
points on the line, each independently k-gated. When there is no earlier round
the chip says so ("ingen tidligere runde") rather than inventing a delta, and
when the previous round is below the threshold the average shows as "—".

The same reasoning applies to the Dashboard's period selector. The prototype's
selector slices the SURVEY list while its own panel note says "snitt per runde";
here it selects rounds, and every RPC in the phase takes the resulting id set.

### D49 — eNPS is drawn on its own scale

The design's third benchmark row ("Anbefaler arbeidsplassen") renders on the
same 1–5 bar as the average score, against a hard-coded 4,3. The seeded
benchmark for that metric is `enps = 12`, which is an eNPS score on −100…100.

`get_benchmarks` returns the metric's `scale` alongside its value and the panel
draws the bar over the right range. Squeezing an eNPS score onto a 1–5 axis
would make "12" render as off-the-scale, and rebasing it to a 1–5 number would
be a figure nothing in the schema holds.

### D50 — two integrity triggers blocked their own cascade

Not a design deviation — a defect found while seeding this phase, recorded here
because it changes behaviour two earlier phases relied on.

`audit_events` is append-only, enforced by a trigger that raised on any DELETE.
`audit_events.org_id` cascades from `organizations`, so deleting an organisation
fired the trigger and rolled the whole delete back. `dropOrg` swallowed the
error, so the demo seed had been re-seeding on top of stale data rather than
replacing it. The same shape sat in D31's freeze: a sent survey's questions
could not be deleted even when the survey itself was being deleted.

Both now permit a DELETE only when the parent row is already gone — which during
a cascade it is, because PostgreSQL deletes the referenced row first. A direct
`delete from audit_events` against a live organisation still raises, and a
Builder edit to a sent survey's questions still raises; both halves are asserted
in `tests/invariants/invariants.test.ts`.

This matters beyond the harness: "sletting" is one of the four DSR types the
Personvern tab offers under GDPR art. 17, and an organisation that cannot be
deleted cannot honour it.

### D51 — one co-editor grant made an organisation undeletable

The third member of D50's family, found once `dropOrg` started reporting its
errors instead of swallowing them.

`survey_editors.granted_by` records who shared a survey with a co-editor. It was
declared with no ON DELETE action, so it defaulted to NO ACTION — and deleting
an organisation cascades into `org_members`, which then could not be removed
while any grant still named one of them.

It is now SET NULL rather than CASCADE, deliberately: the grant is what governs
access and must survive the granter leaving the company. Losing the name of who
granted it is a smaller loss than silently revoking a co-editor's access the day
their manager's account is removed. Every other "who did this" column in the
schema (`surveys.created_by`, `duties.owner_member_id`, `dsr_requests.handled_by`)
was already SET NULL; this one was the outlier.

The whole schema was audited for the same shape while there. The only other
foreign key with no delete action is `duties.definition_key → duty_definitions`,
and NO ACTION is correct there: a duty definition that is in use must not be
deletable.

### D52 — two verification gates were measuring history, not this run

Not deviations either — the same "stale state" defect as D50, in the harness.

`verify:send` asserted "2 invitations arrived" against a Mailpit inbox that had
been purged (fixed in Phase 3) but a **pgmq queue** that had not. Anything an
earlier run enqueued and never drained was delivered by this run's worker and
counted as this run's mail, which turned two into six. The queue is archived at
the start now, for the same reason and one hop earlier.

The same gate also SENDS the seeded draft, which flips it to `aktiv` and
consumes it — so a second run in a row had nothing to send. It re-seeds first,
as the capture harness now does. Both call sites pin the seeding child to the
local stack explicitly: `verify:send` loads `.env.local` unconditionally, so the
child would otherwise inherit the production URL, and the seed's own guard
refused it — correctly, which is how this was found.

### D53 — "Last ned rapport" is not on Resultater yet

The insights panel's header carries a "Last ned rapport" button and a transient
pill ("Rapporten er lagt i nedlastinger — klar for AMU og styret",
HeiTuva.dc.html:2201-2205). The Dashboard's `dutyNote` pill is the same
mechanism.

PDF export is Phase 5, with the report editor. The prototype's button sets a
message saying a file was downloaded and no file exists — rendering that would
be a fabricated outcome, and a button that does nothing at all is worse than one
that is not there yet. The panel keeps its heading, its insights, its note and
the five content chips, all of which are real.

It arrives with Rapporter, where there is something to download.

### D54 — "Legg til et svar" goes to Send, not to an in-app respondent view

The design's button opens the prototype's own respondent screen so the reader
can answer their own survey ("Svar selv" in the survey-row menu).

That route — `/undersokelser/[id]/test` — is still on the pending list; it was
scoped to Phase 3 and not built. Rather than invent a second respondent surface
here, the button goes to Send, which is where the survey's real respondent links
live (the shareable link and the test send). The label is the design's.

When `/test` is built, this button points at it and the deviation closes.

### D55 — the build no longer needs a database, and CI can be green

Not a design deviation. CI had failed on every run since Phase 0, so CLAUDE.md's
"CI must be green to merge" had never actually been satisfiable.

`next build` prerenders `/_not-found`, which renders the app shell, which reads
UI copy through `getMergedMessages`. That threw on a failed read, so a build with
no Supabase reachable died with `ui_messages read failed: fetch failed` — which
is every CI run, because the `static` job has no database.

The fix is a correction of which side is the source. `ui_messages` is SEEDED
FROM `/messages/*.json`; the table is an editable overlay for the Phase 6
translation editor, not the whole truth. So the bundled set is the base, the
table lays over it per key, and an unreachable or unseeded table degrades to the
shipped copy instead of taking the page down. That is also the right runtime
behaviour: a Supabase blip should not turn every route into an error page when
the messages are compiled into the build already.

Reproduced against the exact failing condition before and after:
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 npx next build` now completes.

**One check is genuinely weaker as a result**, and it is worth knowing: a key
added to `/messages/*.json` but never seeded into `ui_messages` used to render
as a raw `namespace.key` and be caught by the capture harness. It now renders
correctly from the bundle. The UI is right either way; what is no longer caught
is the seeding gap itself, which matters only to the translation editor. If that
becomes a problem, the check belongs in `scripts/seed-i18n.ts` as a diff, not in
a screenshot.

### D56 — "Ansvarlig" on a duty is a member picker, not a free-text field

The design's duty settings panel types the owner's name into a text input
(HeiTuva.dc.html:1057).

`duties.owner_member_id` is a reference to a real member, and it has to be: the
owner is who the deadline chip chases, who the reminder is addressed to, and
who an inspector is pointed at. A typed name that resolves to nobody is a label
pretending to be an assignment — it would look identical in a screenshot and do
nothing.

So the control is a `<select>` of the organisation's active members, with
"Ingen valgt" as the empty state. Same row, same position, same label.

### D57 — the archive trigger must not block the foreign key's own bookkeeping

Fourth in the family of D50/D51, and this one was mine.

The append-only trigger added in `20260904000004` refused every UPDATE on
`duty_versions`. But `report_id` and `archived_by` are ON DELETE SET NULL, so
deleting an organisation cascades into `reports` and `org_members` and each of
those issues an UPDATE against the archive to release the reference — the
trigger raised, and the whole delete rolled back. The demo seed failed on its
own cleanup, which is how it surfaced.

The distinction the trigger was missing: the archive's CONTENT is immutable, but
a foreign key going null because its target no longer exists is the database
maintaining its own keys, not somebody editing the record. `duty_id`, `label`,
`content_hash` and `published_at` can now never change; the two references may
be nulled only when the row they point at is genuinely gone. Nulling one by hand
while the target still exists is still refused, and both halves are asserted.

**The pattern is now four for four**, and worth stating once: every integrity
trigger written against "nobody may change this" has collided with PostgreSQL's
own referential maintenance. The next one should be written as "nobody may
change this CONTENT" from the start, with the cascade case handled deliberately
rather than discovered.

### D58 — a published duty is not told to start a survey

The prototype's primary-action ladder tests "has a linked survey" first
(HeiTuva.dc.html:3190-3201). That is right while the duty is being worked and
wrong once it is finished: a redegjørelse marked **Publisert**, with an archive
entry underneath it and both signatures in place, was still showing "Start
undersøkelse".

A duty that is published, whose checklist is complete and whose signatures still
cover the current content has no next step, so it is offered none. The deadline
line already says when it comes round again.

### D59 — a leser is shown every duty's state and none of its calls to action

Reading the duties is the whole point of the `leser` role, so the cards, the
checklists, the signing state and the archive all render. What is removed is the
primary button for rungs a leser cannot climb — starting a survey, finishing the
documentation, creating a report, signing, publishing. "Følg opp svar" stays,
because reading results is exactly what the role is for.

The controls that remain are disabled rather than hidden, so the screen still
shows what exists; the database refuses a leser's write regardless.

### D60 — composing a report is gated separately from reading a cell
The k-gate has always been per cell: `aggregate_results` returns
`insufficient_data` for anything below five, carrying no `n` and no `avg`. A
report is not a cell. It is a set of cells chosen by an editor, rendered
together, and read by someone who may not be the editor — and three disclosures
exist only at that moment. `public.compose_report(p_report, p_token)` is now the
single read path for a composed document, and it decides all three:

- **Differencing.** Show a per-group breakdown beside a total and the suppressed
  group is arithmetic. With groups of 12 and 3, gating the 3 changes nothing:
  15 − 12 = 3. `app.suppress_partition` applies the per-cell gate and then
  **complementary suppression** — while exactly one row is hidden, hide the
  smallest visible one too, so the residual always spans at least two groups.
- **A different reader.** A share link is read by someone who is not a member,
  so the reader is resolved at render time (token hash or membership) and the
  document is composed under *their* scope. A token narrows the report and can
  never widen it: a report already filtered to one group stays there however the
  link was cut.
- **A frozen scope.** `result_snapshots.scope` exists for a reason. A snapshot
  taken across all groups is true about all groups and false about any one of
  them, so a section may read a snapshot only when its scope matches exactly —
  otherwise it recomputes live, and says which it did (`source`, `snapshot_id`).

Two things the per-section rules do not cover, handled explicitly:

- **A sub-k residual across sections.** Complementary suppression is satisfied by
  two hidden rows, but 12 visible out of a total of 14 still discloses that two
  people sit behind the hidden rows. A cross-section pass withholds any scalar
  `n` whose residual against the visible rows would fall below k. It counts each
  group once, not each row — a document with both a `teams` and a `heatmap`
  section lists the same group twice, and double-counting would make the
  residual look negative and the check pass when it should not.
- **A hand-edited filter.** `reports.filters` is editor-supplied jsonb, not a
  foreign key, and the function is SECURITY DEFINER. Every survey id in the
  filter is checked against the report's own org, and one foreign id refuses the
  whole composition rather than the offending section.

**The tests were written first, and the mutation run is why they are trusted.**
All 17 failed against the absent function, and each of seven mutations of the
finished one was killed:

| Mutation | Killed by |
|---|---|
| M1 no complementary suppression | 2 tests |
| M2 pinned snapshot used whatever its scope or owner | 2 tests |
| M3 any token accepted, expiry ignored | 2 tests |
| M4 no cross-section residual check | 1 test |
| M5 filter survey ids trusted | 2 tests |
| M6 membership not checked | 2 tests |
| M7 token scope replaces the report's | 1 test |

M4 and M5 initially **survived** — the suite passed with the protection removed.
Both gaps were real, not theoretical: M4's is the two-tiny-groups residual above,
M5's is a cross-tenant read. Tests were added until both died. A negative test
that has never seen its defect is a decoration, and the only way to know which
ones those are is to break the code on purpose.

### D61 — "Lagre rapport" moves the report out of Utkast; it does not save content
The design's editor footer has a **Lagre rapport** button, and the prototype's
handler appends the draft to the saved list — because the prototype has no
database and the draft lives in component state until that click.

Here the content is saved on every change. It has to be: the document beside the
controls is composed by `compose_report` on the SERVER, so a section list held
only in the browser could not be rendered without shipping the composition —
and with it the k-gate — to the client. That is the one thing the gate must
never depend on.

So the control stays exactly where the design puts it and means the other half
of what "lagret" means on the Mine rapporter list: the report leaves `utkast`
and becomes `klar`. A published report is not walked back from here; publication
is `publish_duty`'s decision and carries a signature.

### D62 — the report editor is a state of /rapporter, not a route under a survey
`tests/routes.manifest.ts` carried a pending route `/undersokelser/[id]/rapport`
("Report editor for one survey") from an earlier phase. The design has no such
screen. The editor is `repEditing` on the Rapporter screen
(HeiTuva.dc.html:1092-1288), reached four ways — **Ny rapport**, **Bruk mal** on
a standard template, **Åpne** on a saved report, and **Lag rapport** from a
survey row — all of which set the same state.

It is therefore `/rapporter?rapport=<id>`, matching the `?fane=` pattern the
screen's own tabs already use. The survey row's **Lag rapport** now creates the
report with that survey already in its filter and opens the editor, which is
what the prototype's handler does; before this it linked to the route that did
not exist, and the capture harness reported the 404 as a pending route rather
than as the dead link it was.

### D63 — the share link is minted, shown once, and never derived from the title
The prototype prints `heituva.no/r/<slug-of-title>` in the Del panel, always,
before anything is shared. A slug of a title that appears in the report list is
guessable, and DECISIONS makes the link itself the credential — there is no
password behind it.

So the field shows nothing until a link is minted, and then shows it once:
32 bytes of CSPRNG, base64url, stored only as a SHA-256 hash, the same rule as
invitation tokens. `report_shares.group_id` carries the scope and
`compose_report` re-runs the whole k-gate under it, so the link does not hand
out a rendered document — it hands out the right to ask for one, and the answer
is composed for that scope.

### D64 — the period filter picks rounds, it does not store a relative window
The design's Periode select offers "Siste runde / Siste to runder / Alle
runder". Stored as those words, an archived statutory report would silently
repoint at newer data the next time a round closed — the document would say one
thing in June and another in September with no edit and no version.

`reports.filters.rounds` therefore holds round ids. The words remain the way you
choose them; what is written down is which rounds you chose.

### D65 — Oversikt shows real figures, or none; the prototype's padding is dropped
The prototype pads three numbers on the first screen anyone sees:

| Prototype | What it actually is |
|---|---|
| `milestone: responses + 289` | the response count plus a literal 289 |
| `managerGrade: "3 av 4"` | a hard-coded string |
| `streakLine: "Produktteamet har svart 6 uker på rad"` | one named team, six weeks, no data behind either |

That is mock scaffolding, and rendering it would put invented measurements on
the landing screen where they are indistinguishable from real ones (CLAUDE.md:
never fabricate data in the UI). So: the year total is the year total, the grade
counts real `loop_actions` against real surveys, and the streak is the run of
consecutive weeks in which the ORGANISATION had any response.

Organisation-wide, not per team, for a reason beyond honesty. Per-group
participation over time is exactly the shape k-anonymity protects — a group of
three answering in week 31 and not week 32 is a statement about three people —
so `overview_activity` has no group parameter at all and cannot be asked for
one.

Two more places where the honest answer is nothing:

- **No response rate without invitations.** `completion` is NULL, not 0, when
  nothing has been sent. A percentage over an empty denominator is a fabricated
  measurement, so the panel says "Ingen invitasjoner sendt" instead.
- **No "frisvar venter på lesing" item.** The prototype's third action counts
  unread free text. Nothing in the schema records that anything was read, so the
  count would never go down and the item would be permanent. It is left out
  until a read marker exists, rather than shown as a number that means nothing.

"Legg til tiltak" also changes: the prototype inserts a row reading "Nytt tiltak
— skriv hva dere gjorde", a placeholder standing in for text nobody wrote. The
button opens an input, and the row is created when there is something to put in
it.

### D66 — `revoke ... from anon` is not enough; PUBLIC holds the grant
`overview_activity` was written with `grant execute ... to authenticated` and
`revoke all ... from anon`, which reads as though anonymous callers are excluded.
They were not. PostgreSQL grants EXECUTE on every new function to **PUBLIC**, and
`anon` inherits that — revoking from the role leaves the PUBLIC grant standing,
so the function stayed callable without a session.

It was caught by the test that asserts an anonymous caller is refused, not by
reading the migration, which is the point: the migration looked correct. The
rule is **revoke from `public` first, then grant the one role that should have
it**, and the order matters because a later `grant ... to authenticated` does
not undo PUBLIC either.

The audit that follows from it — every `public.*` function `anon` can execute —
returns exactly four on both local and prod, each deliberate:
`submit_response`, `get_survey_for_token`, `get_peer_results` (the three
token-validated respondent paths) and `compose_report` (a share link has no
session; authorisation is inside the function). Nothing else.


### D67 — complementary suppression hides a team the design shows
The design's "Resultat per team" renders Produktteamet, Design and Utvikling with
numbers and Ledelse as "for få svar". With real data the composition can hide a
second team: when exactly one group of a partition is below the threshold, its
size is `total − visible`, so the document would state it. `app.suppress_partition`
therefore hides the smallest visible group too, and the note under the section
says how many are hidden. The design's own screenshot cannot show this because
its numbers are mocked and never sit one group away from disclosure.

### D68 — the document says where its numbers came from
Each section carries "Beregnet nå" or "Frosne tall fra {dato}". The prototype has
no equivalent, because it has no snapshots. It is added rather than left out: a
published statutory report renders from a frozen document and a draft renders
live, and a reader who cannot tell which has no way to know whether the number in
front of them can still move.

### D69 — the share field is empty until a link is minted
The design shows `heituva.no/r/rapport` in the Del panel at all times. That
string is a slug derived from the title, which would make every report's link
guessable from the report list — and the link IS the credential. The field shows
`—` until "Kopier lenke" mints a 32-byte token, and the raw token is returned
exactly once.

### D70 — `report_section_types` labels are seeded content, not chrome
The report editor's section names ("Utvikling over tid", "Heatmap team ×
spørsmål", …) come from the `report_section_types` registry, like template pack
titles and bank questions, so they render in Norwegian on the English UI. Several
of them also exist in the message catalogue as dashboard panel titles, so the
same words translate on the dashboard and do not in the report editor.

The alternative was to move the labels into next-intl, which would make the
registry half data and half component and break the rule that adding a section is
a row. The consistent fix is the one `template_pack_translations` already models
— a translation table for seeded rows — and that belongs to the Phase 6
translation editor. `verify:i18n` classifies these as seeded content, the same
treatment the packs get.

### D71 — PowerPoint export is rendered but disabled
The Del panel's "PowerPoint" button is drawn exactly as the design draws it and
is disabled unless `feature_flags.pptx_export` is on. The design shows it
enabled; there is no PPTX renderer until Phase 6, and a button that produces
nothing is worse than one that says it is unavailable.

### D72 — publishing freezes at the most restrictive scope, and the freeze can be refused
`publish_duty` freezes the composed document under the least-permissive scope the
report is shared at, and `compose_report` refuses to serve that frozen copy to a
reader whose scope would have seen more. A boardroom reader of a report that also
carries an all-employees link therefore reads a LIVE composition, not the frozen
one — the frozen copy is the all-employees document and would show them less than
they may see. The design has no concept of either, because it has no snapshots.

A report with no survey behind it publishes without a snapshot rather than being
refused: a statutory report can be entirely narrative, and there is nothing to
freeze.

### D73 — the splash offers two languages, not four
The design's language picker lists Norsk, Svenska, Dansk and English, its hero
badge reads "Norsk, svensk, dansk og engelsk · data i Norge og EØS", and its
footer repeats the four. `sv` and `da` are seeded but not served (see
`ACTIVE_LOCALES`, and the Språk tab's own "kommer" badges), so the public page
now offers `no` and `en` and says so: the badge reads "Norsk og engelsk · data i
Norge og EØS" and the footer "Norsk og engelsk".

A marketing page is a promise. Listing a language the product cannot render
would be the one kind of fabrication the splash is most exposed to, because a
visitor cannot check it before signing up. The picker becomes four entries again
by activating the locales, not by editing this page: it renders `ACTIVE_LOCALES`.
`?lang=` is honoured only for an active locale, for the same reason.

### D74 — the auth panel has a third mode the prototype does not
The design's panel toggles between "Prøv gratis" and "Logg inn". Pricing is shown
with the design's own numbers, but there is no billing engine (DECISIONS Q10), so
both paid plans' CTAs and "Få en gjennomgang på 20 minutter" have nowhere to post.
They open the same panel in a `demo` mode — same card, same tab rail, same field
styling, three fields instead of four — which files a `demo_requests` row through
`rpc.request_demo`.

The alternative was a CTA that does nothing, or a mailto:. The panel already
exists, is already the page's one form surface, and already carries the
confirmation treatment; a third mode of it is a smaller invention than a second
form.

### D75 — the mini-heatmap's column headers may shrink and wrap
The prototype gives the illustration's four column headers `flex:1`, whose
automatic minimum size is the min-content width — so a one-word label like
"Anbefale" refuses to shrink. Below roughly 1100px the header row broke out of
its card and stopped lining up with the cells under it, and at 320px it pushed
the page into horizontal scroll (RESPONSIVE.md rule 1). They carry `min-w-0` and
`break-words` here. Nothing changes at the design's own width; below it the
headers stay aligned with their columns instead of overflowing.

### D76 — form controls use the product's typeface, so they are 2–6px taller
The prototype has no CSS reset, and `<input>`, `<button>` and `<select>` do not
inherit `font-family` — so every form control in both design bundles renders in
**Arial** at the browser's default line-height, while the surrounding page is DM
Sans. The implementation styles them in DM Sans like everything else, which is
what the design plainly intends and what the rest of the product already does.

DM Sans's `normal` line height is taller than Arial's, so a field measures 46px
against the prototype's 44 and the panel's submit button 50 against 47 — about
30px accumulated over the sign-up panel. Line-height is otherwise matched
exactly (`leading-[normal]`, not Tailwind's inherited 1.5, which would have added
another 6px per control), and `touch-44-field` is deliberately NOT applied to
these fields: at 44px they already clear the touch minimum, and applying it made
them taller still.

### D77 — the panel's SSO buttons render disabled
"Entra ID" and "Google Workspace" are drawn exactly as the design draws them and
are disabled. Entra SSO is Phase 6's own item and is not wired; Google Workspace
is not in v1 at all. This is the treatment D71 already gives the PowerPoint
button and the Administrasjon screen gives its Entra toggle — the control is
present and honest about being unavailable, rather than absent or posting nowhere.

### D78 — the respondent surface reads the shipped copy, not the org's overrides
`ui_messages` now carries per-organisation overrides, and the app applies them:
`resolveOrgId` finds the viewer's org and the reader lays that org's rows over
the shipped ones. /s/[token] cannot do the same, because a respondent has no
session — the org would have to come from the token context, and
`get_survey_for_token` deliberately returns the org's NAME and default language
rather than its id.

So an org that rewrites a `respondent.*` string sees the change in preview
inside the app and not on the live response form. Adding `org_id` to the token
payload would fix it and hands an anonymous caller a tenant identifier, which is
a trade worth making deliberately rather than in passing. Logged for the next
phase.

### D79 — Administrasjon → Språk is a sixth tab the design does not draw
The design's only language surface is the personal picker on Profil
(HeiTuva.dc.html:1341-1347), which chooses the language you read HeiTuva in. The
translation editor is a different thing — it changes the wording everyone in the
organisation reads — and DECISIONS Q12 puts it in the admin app in Phase 6.

It is built from the component classes the other five tabs already use: the same
tab rail, the same `--sf` card on `--line`, the same field styling, the same
`--ac` primary button and `--ac2` badge. Nothing new is invented; the screen is
an arrangement of parts the bundle already specifies.

Two choices inside it are worth naming. It shows the key SEGMENT (`reports`),
not `nav.reports`: the namespace is already the picker's value, and a screen
that prints dotted message keys is indistinguishable — to a reader and to the
capture gate — from one whose translations failed to load. And the namespaces
themselves carry labels ("Bygg undersøkelse", not `builder`), because a raw code
identifier on screen is user-facing text like any other.

### D80 — SMS: who gets a text, and what it says
The design's fourth channel card, "SMS · For skift og felt", is people with a
phone and often no work inbox — so a recipient may now carry a phone and no
address at all (`survey_invitations.email` is nullable; an invitation has an
email or a phone or both, never neither). The import parser reads a `mobil`
column, the single field takes a number as well as an address, and Norwegian
shapes ("918 27 364", "+47 918 27 364", "0047…") normalise to E.164 in the
client AND in the database (`app.normalize_phone`); the database's answer is
the one that decides.

What decides the channel of one invitation is not drawn anywhere, so it is the
minimal rule: email when it can be, SMS when it must be. Someone with an address
gets email when email is selected; someone with only a phone gets SMS when SMS
is selected; someone with both gets email, because it carries the fuller message
and costs nothing per send. Nobody is reached twice. Whole groups are reached by
email only: an `org_members` row has an address and no phone, and a member of
the organisation has a work inbox by definition.

Two things the prototype shows that the product renders differently:

- The message preview's link. The design prints `heituva.no/s/<id>`; the real
  link does not exist until the round does (it is a token, and minting one for a
  preview would leave live URLs behind every visit), so the preview shows the
  link's SHAPE — "heituva.no/s/…" — the same treatment the share-link card gives.
- "med kortlenke". There is no URL shortener; the respondent link is the
  full `/s/<token>` and the message is trimmed to fit one 160-character segment
  with the link and the anonymity promise intact — the title is what gives.
  Adding a shortener would be a second token per invitation to expire and
  revoke, and a redirect hop the anonymity story would have to account for.

The flag is enforced in `send_round`, not only in the screen: an org without
`sms_channel` gets `sms_not_enabled` back, whatever a caller posts.

### D81 — the PowerPoint export is text and rectangles
`renderReportPptx` mirrors `renderReportHtml` branch for branch and takes the
same input — `compose_report`'s output and nothing else — so a deck can only
show what the reader was allowed to see. Bars are shapes, not chart objects and
not images: pptxgenjs sizes images with `image-size`, which carries an unpatched
denial-of-service advisory for exotic formats (ICNS/JXL/HEIF; GHSA-w3rx-r6r6-pgpr,
GHSA-5p2g-fcmc-qvqq, range `<=2.0.2` with no fixed release published). Nothing
here calls `addImage`, and the only reference to `image-size` in the library's
bundle is inside a commented-out function — the flagged code is never executed.
`npm audit` still reports it; that line is a known finding for the hardening
pass, not a vulnerability the product can reach.

Long sections paginate: a partition with thirty groups is three slides with the
same title, not one slide with rows off the bottom.

### D82 — Entra ID SSO: where the switch may be turned on, and where it bites
The design draws "Pålogging med Entra ID (SSO) — Deaktiverer passordpålogging"
as one switch. Two rules sit behind it that the prototype could not have:

- It can only be turned ON when Auth actually accepts Entra sign-ins
  (`/auth/v1/settings` reports `external.azure`), and only by an administrator
  who is themselves signed in through Entra. Otherwise the first request after
  saving would sign out the person who just saved. Turning it OFF is always
  allowed — whoever can reach the screen can undo it. Until the provider is
  configured the switch is drawn disabled and reads "ikke satt opp ennå".
- "Deaktiverer passordpålogging" is enforced AFTER credentials are accepted,
  in `requireViewer`, not in the sign-in action. An action that refused before
  checking the password would tell anyone which addresses belong to an SSO
  organisation; here the session is real and simply not allowed to continue,
  so nothing is learned that the person did not already have the password for.
  They land on `/logg-inn?feil=sso` with the reason and the Entra button.

The login screen (itself invented, D8) gains one control: "Logg inn med Entra
ID", drawn as the bordered secondary button the splash's panel uses for the
same thing, and present only when the provider is configured. Enabling the
provider on production is an operator action — an Entra app registration and
the Azure provider in Supabase Auth — and is outside what this branch can do.

**Amended in Phase 7 (decision 2 of the Phase 6 acceptance).** Enforcement is
org-wide, but the organisation must always retain at least one active
administrator who can authenticate without SSO — losing the ability to
administer your own compliance data is a worse failure than the one SSO
enforcement prevents. `org_members.sso_exempt` carries that mark. Migration
0029 refuses turning the switch on while no active administrator has it
(`sso_no_break_glass`), and refuses un-exempting, demoting, deactivating or
deleting the last one while it is on (`sso_last_break_glass`) — as data
rules, so the service role cannot bypass them either, and written to let
ordinary maintenance of the row (a rename, a regrouping) through.
`requireViewer` honours the mark: an exempt administrator's password or
magic-link session is served; everyone else's is ended as before. The Valg
card gains a list under the SSO row — "Kan logge inn uten Entra ID", one
switch per active administrator, drawn with the card's own switch control and
indented under the option rather than as a card in a card. The self-lockout
rule relaxes to match: the administrator turning enforcement on must be
signed in through Entra OR be exempt. Every refusal is shown with its reason,
which is what the decision asked for.

### D83 — `/personvern` and `/databehandleravtale` are invented pages
The splash's footer links to a privacy notice and a data processing agreement
the bundle does not draw. They are set in the product's own type on the
splash's ground, at reading width, with a heading, sections and a way back —
nothing more. Their content is the product's actual practice as built
(anonymity by constraint, k=5 in the database, EU/EØS residency, the
sub-processor list, 24-hour breach notification), not boilerplate; it lives in
the `legal` message namespace so wording is editable like everything else.
The Cloudflare Turnstile widget on the splash's two forms is likewise not in
the design: it renders only when a site key is configured, so the design's
form is what a visitor sees until the pre-launch gate turns it on.

### D84 — Phase 7b typography sample: six screens, one systemic font-build note
Decision 4 of the Phase 6 acceptance asked for the six highest-fidelity-risk
screens — splash, the respondent flow, the builder, Resultater, the report
document and Administrasjon — re-compared against references regenerated with
the design's own typefaces, and a count of how many matched.

All six match. Family, size, weight, letter-spacing, line-height and colour are
identical in computed style on every one, and the layout reproduces the design
(the visible differences between a capture and its reference are seeded data —
different survey titles, member counts, response numbers — not styling).

One difference belongs to no single screen and is recorded here rather than as
a per-screen defect: the same string, with the same CSS, measures up to ~2 %
wider in Playfair Display and ~1 % in DM Sans at some sizes (identical at the
14 px body size) between the app and the prototype. The cause is the font
*build*, not any rule in the app. The prototype loads Google Fonts' static
Playfair instances (`wght@500;600;700`) and keeps DM Sans's optical-size axis;
`next/font/google` self-hosts the *variable* Playfair Display and subsets by
unicode-range. Asking next/font for specific static weights or for the `opsz`
axis was tried and does not change this — it serves the identical variable file
regardless (same self-hosted hash, same measured advance), so the option was
reverted rather than left in as a change that reads like a fix but moves
nothing. The residual is a rendering-engine artifact well below a reader's
threshold and below what the screens' own seeded-data differences already span;
it is accepted, with no code change. Self-hosting the design's static instances
as local files would close it, and is logged here as the option if a future
pass wants pixel-identical glyph advances.

### D85 — respondent promise is derived; "optional" keeps its per-choice UI
Q17 makes the respondent banner on /s/[token] a function of the survey's
settings (lib/respondent/anonymity-promise.ts): anonymous surveys show the
threshold ("minst fem" / "minst tre" with the small-group caveat below 5),
named surveys show "vises med navnet ditt", organisation surveys show the
attributed promise. `optional` still shows today's invitation-to-choose banner
and its two choice chips; the design brief's refinement — the consequence text
under each option also derived from the threshold — is not built here, because
this phase is the policy model only, not the respondent-flow redesign. The
promise texts live in ui_messages (`respondent.promise*`), editable like all
copy; the number word is spelled per locale by the derivation.

### D86 — statutory pack policy lives in seed.sql, not only the migration
Q17's kernel (migration 20260904000032) sets `template_packs.policy` /
`duty_definitions.policy` on the statutory packs with an UPDATE. But the global
packs (org_id NULL) are seeded in `supabase/seed.sql`, which `supabase db reset`
runs *after* every migration — so on a fresh database the migration's UPDATE
matches zero rows and the packs land with `policy` NULL, leaving a statutory
survey unlocked. This was caught by the phase's verification pass: the negative
test proving a psykososial survey refuses even an administrator (threshold-policy
#4) passed against the accumulated dev volume but failed on a clean reset. The
fix follows the existing `sort_order` precedent (migration 20260903000005):
the value is written in seed.sql where the pack rows are created, and the
migration keeps its UPDATE as the backfill for a database whose packs predate
the migration (a live project seeded before this phase). The two carry the same
law-anchored values by hand; test #4 now guards against drift, so a mismatch is
caught rather than shipped.


### D87 — Phase 9 stop-and-ask: the Q17 brief's new screens wait for the bundle
The design brief (docs/Designbrief_terskel_Q17.md) describes nine surfaces that
`/design-reference/` does not contain: the builder's «Hvem svarer og hva vises»
panel (§1) and its two extra breach warnings (§2), the attributed-results
table (§5), the «Svar per virksomhet» section body and the Filter-tab source
lines as drawn (§6), the Personvern default-threshold picker and the
redaktør-may-lower switch (§8), and all of Del B (panel library, presets, the
event-stream panel). Building them from prose would break the do-not-invent
rule that has held fidelity for eight phases, so — decided with Tor — Phase 9
ships the **kernel and the copy-only surfaces** and the screens follow the
bundle. What shipped, and where it shows:

- Kernel (migration 20260904000034, tests/invariants/attributed-results.test.ts):
  `attributed_results` (the ungated path, organisation surveys only, leser
  refused), `organizations.default_k_threshold` (3–10) applied to NEW person
  surveys by `apply_pack_policy`, the `privacy.redaktor_may_lower` flag read by
  the guard, the CHECK that an organisation survey is always named, and in
  `compose_report`: `sources[]` with each survey's own k, a composed `method`
  section carrying the document's k, and `per_virksomhet` refused with
  `reason: person_sources` in any report that holds a person survey.
- Copy on existing screens, every string parameterised on the real threshold
  (no fixed "fem" survives where a k is known): Resultater's line under the
  title, its «for få svar» texts and hover (`title`) «Vises fra {k} svar. Nå:
  færre.», «n<{k}»; Dashboard's heat-map note and gated-cell hover on the
  strictest k of the selection; the Send screen's «Klar til å sendes» promise
  row (§3) and — new — its anonymity chips disabled with the brief's §1 lock
  copy when a pack or answers have frozen the policy, because `send_round`
  would otherwise fail on the guard; the library card's policy line (§7); the
  share panel's «Ledere ser bare sitt eget team, og bare der minst {k} har
  svart.»; the report editor's Filter tab («Strengeste terskel …», «… har
  terskel 3, men rapporten bruker 5»), its Innhold picker showing
  «Svar per virksomhet» as unavailable with the reason, the Metode section's
  «Resultater vises fra {N} svar …» in the editor, the PDF and the deck; and
  Personvern's anonymity explanation rewritten as §8 asks (never a categorical
  five), with the locked «Skjul resultater under terskelen» row stating the
  organisation's real default.
- Copy rewritten to stop promising five categorically, outside any screen with
  a k of its own (logged here because the bundle's Norwegian is otherwise
  verbatim): `reports.groupThreshold`, `reports.dutyThreshold`,
  `admin.groupThresholdNote`. Left untouched and flagged to Tor: the splash
  (`splash.*` "ingen tall under fem svar"), `legal.privacy3P` and
  `legal.dpa4P` — marketing and legal texts are his call, and with a floor of
  three they are no longer categorically true for every survey.
- Not built, no dead code left behind: the Personvern controls for the default
  threshold and the redaktør flag have no server actions yet — an action with
  no caller is a lie in the codebase; both land with the §8 controls. The two
  §2 breach warnings need the builder panel. Del B is a phase of its own.

### D88 — «Svar per virksomhet»: composed and exported, table not yet drawn
`per_virksomhet` is a registry row (data-not-code) and `compose_report`
composes its rows through `app.attributed_rows` — the same implementation
`attributed_results` uses, so there is one attributed path, not two. Until the
bundle carries the attributed table (D87), the section renders in the editor,
the PDF and the deck as a stated status line («Tabellen kommer med den
attribuerte resultatvisningen …»), the same treatment `actions` already has
for a section with no composer. In the Innhold picker it is offered only when
every chosen source is an organisation survey; otherwise it is shown disabled
with «Bare tilgjengelig når alle kildene er organisasjonsundersøkelser.» —
visible, not hidden, as the brief asks. The refusal itself is the RPC's: a
report row that names the section over person sources composes it as
`unavailable` with no rows, and the test proves no organisation name leaks
through the refused section.

### D89 — the wide toggle renders at `xl` and above only
`HeiTuva.dc.html:181-183` puts a round icon button between «Ny undersøkelse» and
the language globe; `4007-4011` is its handler — it flips a `wide` flag that
releases the frame's 1120px cap. DECISIONS **Q32** (confirmed 2026-09-06) is to
render it at `xl` and above only, and the control carries that in one class:
`hidden … xl:inline-flex` (`components/WideToggle.tsx:55`).

The reason is arithmetic, not taste. The frame is `calc(100% - 72px)` capped at
1120px, so the cap binds only from 1192px up. Below that the viewport is already
narrower than the cap and the button would be a control that visibly does
nothing on press — which D26 settled is worse than a control that is absent.
`docs/RESPONSIVE.md` rule 4 ("no feature may be hidden on mobile") is the rule
this bends, and it bends by its own escape clause: a control whose *only* effect
is a desktop-width layout choice has nothing to offer a 390px viewport. The
media query is the same 1280px `xl` breakpoint everything else uses rather than
a bespoke 1192px one, so there is one breakpoint vocabulary, not two.

The preference is per viewer and lives in `localStorage` exactly as the bundle
has it — nothing about a personal window-width choice belongs in the database —
and is applied before paint by the inline script at `app/layout.tsx` so a wide
viewer does not see the narrow frame flash first. The component reads the
attribute back on mount rather than seeding React state from it, because the
server cannot know the preference and rendering it into the first HTML would be
a hydration mismatch.

### D90 — the frame keeps a 20px gutter on mobile where the bundle draws 36px
`HeiTuva.dc.html` gives `.frame` `width: calc(100% - 72px)` at every width — a
36px gutter each side, unconditionally. The v1 bundle is a desktop artefact and
never renders below 1280px, so that number was never tested against a phone: at
390px it spends 18.5% of the viewport on margin, and the cards inside then carry
their own 16–20px padding on top of it, leaving ~250px of content.

`app/globals.css` therefore gives `.frame` `calc(100% - 40px)` and restores the
bundle's `calc(100% - 72px)` at `md` (768px) and up. Above `md` the rendering is
the bundle's, exactly; below it there is no design to match and
`docs/RESPONSIVE.md` governs, where 20px is the gutter every Phase 1–7 screen
already used (the per-screen `px-5` this frame replaced). This is the smaller
deviation of the two available: keeping 36px would have changed every screen's
mobile rendering, which no decision asked for.

### D91 — the Phase 1–7 reference renders are frozen and re-rendered on request
`scripts/verify/reference.ts` now drives both bundles
(`BUNDLES`, `reference.ts:21`): `design-reference-v1/` → `artifacts/reference-v1/`
and `design-reference/` → `artifacts/reference/`. Per **Q18** both sets stay, and
they are named for their bundle so which-is-which needs no inference.

Only the v1 set renders by default (`npm run verify:reference`); the legacy set
needs `--bundle=legacy` or `--all`. That is not a convenience — it is what keeps
the older set trustworthy. The renders are browser screenshots, and a Chromium
upgrade repaints them: re-rendering the legacy bundle on this container's
Chromium moved five PNGs that no code change had touched. A baseline that drifts
whenever the toolchain moves cannot be evidence for "Phase 1–7 as built" (Q18's
whole purpose), so the legacy set is committed, restored (`git checkout --
artifacts/reference/`), and re-rendered only when someone asks for it and can say
why. The v1 set, which is the live target, re-renders every run.

### D92 — the compliance timeline's three undrawn states
`HeiTuva.dc.html:334-357` draws the dark "Lovpålagte frister" card from a
hard-coded four-row array (`complianceTimeline`, :4272–4277) and a literal
summary ("2 av 4 plikter krever handling i år", :4278). Every one of those rows
is due in the future, so three states a real organisation reaches are undrawn.
Each is decided here and none invents a treatment:

**Overdue.** `pos` is `months / 12` over an axis labelled «nå» → «12 mnd», so a
duty past its date computes negative and would render off the left end — half
the 16px dot outside the bar, or clipped entirely. It is clamped to the axis
start (3%, the offset that keeps a `margin-left:-8px` marker fully on a 6px
bar), because "at or before now" is where the axis begins. The chip reads «Over
fristen», the wording the screen already used before this card existed.

**Never instantiated.** Duties are rows created on first touch (Phase 5), so a
new organisation has none — and `duty_definitions` is a global table of four, so
the card still lists four rows, each «Ikke startet», each at the axis start. The
four dots then overlap into one, which is accurate rather than unfortunate: they
are at the same point in time. The bundle's own first row is «Ikke startet» at
pos 4, so this is its treatment, applied four times.

**Nothing due this year.** The bundle's summary always names a number, and
"0 av 4 plikter krever handling i år" is true but reads as a warning that is not
one. The zero case gets its own sentence instead — «Ingen plikter krever
handling i år» — which is one invented string and the minimal consistent option;
the alternative was a number that misreads.

Verified by setting duty dates in the local database and screenshotting the card
in each state: four «Ikke startet» stacked at 3%; the clear case spread across
42/50/67/92% with «Ingen plikter …»; the overdue case at 3% reading «2 av 4
plikter krever handling i år», which is the bundle's own summary shape.

### D93 — the compliance card's chip foregrounds are the bundle's literal hexes
The theme has tokens for the three tints (`--ac`, `--ac2`, `--ac3`) but none for
text ON them. The bundle carries three literal foregrounds — `#8A4B22`,
`#2F5D2A`, `#8A6A12` (`HeiTuva.dc.html:4273–4276`) — chosen so the deadline chip
stays legible on each tint. They are carried verbatim into `ComplianceCard.tsx`
rather than substituted for `--ink` or `--mut`, because substituting a control's
colour is restyling and because `--ink` on `--ac3` is the pairing the design
specifically avoided here. If a "text on tint" token is ever added, this is the
first place it belongs.

### D94 — the policy panel's first warning cannot fire in the Builder yet
`polWarnings`' first rule (HeiTuva.dc.html:3528) compares the recipient count
with the threshold: "Gruppen har 4 mottakere. Med terskel 5 vil resultatet aldri
vises." In the bundle that comparison is always available, because its mock
survey carries a `target` at build time.

The app does not. Recipients are chosen on the **Send** screen, and
`surveys.target` — the column that means exactly what the bundle means — has no
writer: it is null on every real survey. So the rule is implemented, tested
(`tests/unit/policy-warnings.test.ts`) and wired, and in practice stays silent
in the Builder because the number it needs does not exist there yet.

The alternative was to invent one — derive a target from the audience string, or
count group members the survey is not yet addressed to — and render a warning
computed from a guess. CLAUDE.md's never-fabricate rule covers exactly that: a
made-up denominator is indistinguishable from a real one in review.

**Status: CLOSED in V1-2** (migration 0039). `surveys.target` now has a writer,
and the writer is a trigger on `survey_invitations` rather than the Send action,
because recipients reach a round by several paths and an action-level writer
covers the one it is written in.

**Which count, decided explicitly:** the LATEST round's recipient count — not
the first, not the largest, not the sum. Tor's case is the reason: threshold 5,
round 1 to 40, round 2 to 4. A survey-level number that stayed at 40 is silent
in exactly the situation the rule exists for, and a sum (44) is a number nobody
will ever compare with a threshold, because the threshold is applied per round
(`aggregate_results(p_survey, p_group, p_round)`). Proven both ways in
`tests/db/policy-panel.test.ts` — "latest" and "largest" agree on every fixture
where rounds grow and disagree only here, so the test asserts that 40 and 44 are
both wrong rather than only that 4 is right. Four of its five assertions were
proven failing with the triggers dropped before the migration was kept.

Two edge cases decided with it: a round with no recipients does not move the
number (so creating round 2 does not blank what round 1 earned), and emptying a
round falls back to the previous round rather than to 0 — 0 means "nobody chosen
yet" to `policyWarnings`, and a survey that has been sent is not in that state.

The rule got its second home at the same time. `SendScreen` computes it from
`reach` — the recipients being chosen right now, before anyone is invited, which
is the last moment where changing the count costs nothing — through the same
`policyWarnings` the Builder's panel and readiness list use, so the three cannot
disagree. Its copy (`send.reachBelowThreshold`) names the two ways out. The card
already had a treatment for "a sentence to read before pressing send", so the
warning reuses it rather than introducing a second one; neither bundle draws a
warning on this screen.

### D95 — «Valgfritt» now carries the threshold, and the banner grew to fit
The respondent banner for `optional` used to be a bare invitation to choose
(«Du velger selv …»), which said nothing about what choosing anonymity would
get. Q17's rule is that the promise is generated from the settings or it lies,
and the v1 bundle's own copy carries the number (`choose:n =>`, :2949), so
`anonymityPromise` now returns `promiseChoose` / `promiseChooseLow` with the
same `kWord` and the same small-group caveat as the anonymous branch.

The banner chrome follows the v1 change with it (NEW:2327-2330): top-aligned
rather than centred, 13px at 1.5 rather than 12.5 at 1.45, and `text-pretty` so
a longer promise does not end on a one-word line. D85 still stands for the
per-choice consequence text under the banner, which remains a design-brief
refinement neither bundle draws.

### D96 — The attributed CSV's format is decided, because the bundle has none
The v1 bundle draws the «Eksporter CSV» button (NEW:2553) but its handler is a
toast: `onAttribExport` sets `attribNote:"CSV lastet ned"` and clears it after
two seconds (:4880). There is no file in the prototype and therefore nothing to
be pixel-perfect to, so the format is a stop-and-choose under CLAUDE.md's
"minimal consistent option" rule. Three choices, all made to agree with code
that already exists rather than with a preference:

- **Semicolon, not comma.** Norwegian Excel's list separator, which is what a
  Norwegian customer opens this in. The app's own importer also detects `,`, `;`
  or tab (`lib/send/import.ts:86`), but **the export is deliberately not an
  import source** — see the address decision below — so that is now a
  coincidence rather than a reason.
- **A UTF-8 BOM.** Without it Excel renders æ, ø and å as mojibake, and the
  importer already strips one on the way in (`import.ts:107`).
- **CRLF.** RFC 4180, and what Excel writes.

**No contact address (Tor, 2026-09-06).** The first version carried an «E-post»
column. It is gone, and this is not a formatting choice: a supplier register
export is a legal artefact, and an address is administrative data that leaves the
organisation the moment the file is forwarded. What an aktsomhetsvurdering — and
the redegjørelse built from it — needs is which supplier answered what, and when.
Chasing a non-responder happens in the app, where access is role-scoped and the
read is auditable; a spreadsheet on someone's desktop is neither.

The one path that can still emit an address is a row with no `name` at all,
where the alternative is an unidentifiable blank first column. Asserted as the
only path over the WHOLE serialised file rather than by naming the columns — a
column list stops covering this the day someone adds a column, and every
address is still on the payload for anyone who reaches for one.

**Consequence, stated rather than discovered later:** the export no longer
round-trips through the import step at all. `parseRecipients` needs an address
or a phone column to recognise a header row, so a re-imported register yields
zero recipients rather than a partial list. That is the decision working as
intended, not a defect, and it retires the V1-6 finding about adding a
«Virksomhet» synonym to `HEADER_NAME` — there is no longer an address column for
such a file to carry.

Two further behaviours are deliberate and are not merely serialisation:

- A field beginning `=`, `+`, `-` or `@` is prefixed with a single quote.
  Spreadsheets evaluate such a cell, and respondent free text is exactly the
  untrusted input a formula-injection needs; the quote is the convention every
  spreadsheet reads as "this is text". Tested in
  `tests/unit/attributed-csv.test.ts`.
- `responded_at` is written as a date, not a timestamp. The hour-truncation
  rule in the anonymity CHECK governs ANONYMOUS responses and does not reach an
  attributed row, so this is editorial rather than structural: a supplier
  register is read by date, and a minute invites someone to reason about who
  answered just after whom.

### D97 — Q43's stated reason for the audit clause is one step off, and the test says so
The decision line reads "an audit row that logged what was exported would put
respondent content into a table `leser` can read". `audit_events` is not
readable by a leser: `audit_sel` (M:0008:190) admits administrators only, which
`scripts/verify/export.ts` now asserts directly — a leser session reads 0 of the
2 rows that exist.

The clause is kept, and the property it asserts is unchanged, because the two
real reasons are at least as strong: CLAUDE.md invariant 7 keeps respondent free
text out of logs and analytics entirely, and `audit_events` is append-only
(M:0007:38) — a row that captured an answer could never be corrected or removed
while the organisation exists. Recorded here rather than silently rewriting the
rationale in DECISIONS, because a decision's stated reason is part of the
decision.

### D98 — A leser opening an organisation survey: a refusal, not four zeros
Neither bundle draws this state, because the prototype has no roles. The app
does: `attributed_results` refuses a leser (`forbidden`, M:0034:180 — attributed
rows are named data and a leser reads aggregates only), and `readAttributed`
flattens the refusal to null like every other reader on the results screen.

The first version then rendered the four organisation stat cards from an empty
array: «0 av 0 virksomheter har svart», «0 avdekket brudd», «0 mangler policy».
Every one of those is a fabricated number, and in a screenshot it is
indistinguishable from a supplier survey nobody answered — the case CLAUDE.md's
never-fabricate rule exists for.

So the cards are not drawn at all and the reason is stated:
«Navngitte svar vises ikke for din rolle», with what the role does see and who
to ask. Minimal consistent option, in the screen's existing card chrome; no new
pattern, no new interaction. The Q43 export control is inside the register and
therefore also absent — the route would refuse it with 403 either way, but a
button that always fails is not an honest affordance.

### D99 — OPEN: the aggregate half is removed for organisation surveys, not settled
The v1 bundle switches the whole lower half of Resultater on respondent kind —
`resAttrib` and `resAggregate` are `pol.kind === "org"` and its negation (:4861)
— so an organisation survey shows the register INSTEAD of the aggregate panels.
V1-2 built it that way, and it is right for the primary case: a per-supplier
register is what the duty is, and a supplier survey has no group breakdown, no
trend of averages and no themes, because each row is the finding.

**Logged as OPEN rather than settled (Tor, 2026-09-06).** «How many of our 200
suppliers have a whistleblowing channel» is a legitimate aggregate over
organisations, and Åpenhetsloven reporting at scale will ask it. The answer, if
a customer does, is **a section — not a restored screen half**: a named panel
over the roles the pack already designates (`brudd`, `policy`, `key`), which is
a different thing from the person-survey aggregate that was removed. Reinstating
`resAggregate` for organisation surveys would bring back the group breakdown,
the trend of averages and the themes, none of which mean anything here.

Nothing to do until a customer asks. Recorded so that the next person to meet
this reads a decision with a stated boundary rather than a screen half that
looks accidentally missing.


### D100 — Two shipped presets lose the panel they were drawn to lead with

`DASH_PRESETS` gives «Kundeopplevelse» `["stream","themes","drivers"]` and
«Intern tjenestekvalitet» `["stream","drivers","themes"]` (NEW:2976–2978). Both
lead with the event-stream panel, which Q26 defers behind
`feature_flags.event_stream_panel`. They are seeded without it.

The descriptions changed too, and that is the part worth stating. The bundle
writes «Løpende tilfredshet etter sak, med volum per dag og temaer i
kommentarene» and «Servicedesk og støttefunksjoner: løpende strøm, høyest og
lavest, frisvar». A description promising «løpende» beside a preset that cannot
show it is the fabricated-data rule one level up: it is copy asserting a
capability the product does not have. So the two read «Tilfredshet over tid, hva
som trekker opp og ned, og temaer i kommentarene» and «Servicedesk og
støttefunksjoner: utvikling, høyest og lavest, frisvar» — the same three panels
they now contain, named.

«Medlem og frivillig» also carried `stream` as its third panel and now carries
`heatmap`; its description never mentioned the stream, so it is unchanged.

**Not remembered, enforced.** A preset naming a panel the dashboard does not
offer is refused by the same trigger that guards a member's own layout
(`app.preset_keys_registered`, M:0047). A shipped default that cannot be applied
is worse than a missing one, so the constraint applies to the seed as well as to
the user.

**Reverting is a seed change, not a code change.** When Q26 lifts, `stream`
gains a `report_section_types` row with `on_dashboard`, and the three presets
get their drawn panels and descriptions back in the same migration.

### D101 — The first-run preset cards carry no illustration

The bundle draws seven inline SVG illustrations for the «Velg et oppsett å
starte fra» cards, selected by index (`p.il0`–`p.il6`, NEW:1047–1053): an
ellipse ground shadow and a scene above it, one per preset.

They are omitted. Recreating a rendering is what CLAUDE.md asks for; copying the
prototype's internal structure is what it forbids, and these are seven distinct
drawings keyed to six presets by position — so the seventh is a fallback for a
preset that does not exist, and a member's OWN saved preset would land on
whichever illustration its index happened to select. An illustration chosen by
array position is decoration that claims to be about the thing it sits on.

The cards keep everything that carries meaning: the tint (which is the bundle's
own per-preset colour), the title, the description, the panel chips and the
button. What is missing is ornament, and it is missing deliberately rather than
forgotten.

If the illustrations matter, the honest form is one per preset KEY rather than
per index — an asset the seed names, like a template pack's icon — which is a
data change and belongs with whoever decides the six presets are final.

### D102 — the register panel's breach count is zero for a pre-M:0040 survey

The dashboard's «Svar per virksomhet» panel counts three things, and the middle one — «har
avdekket brudd eller risiko» — is derived from the pack's `brudd` ROLE (Q35,
`lib/questions/roles.ts`), not from the bundle's `/brudd/i` match against the question
text (NEW:3694).

The role is the right rule and Q35 settled it: a text match calls any question mentioning
«brudd» the breach question, and `tests/unit/question-roles.test.ts` asserts that a
question whose text says «brudd» with no role is NOT it.

**The consequence, stated rather than discovered.** Migration `20260906000040` wrote roles
into `template_packs.questions` and **deliberately did not rewrite existing surveys** —
that was the right call, because rewriting a live survey's questions changes what
respondents were asked. So a supplier survey created before that migration has no `brudd`
role on any question, and the panel counts **0** breaches for it. Not an error, not an
empty state: the number zero, beside two counts that are correct.

Today this affects nothing on the local stack or in the demo seed, both of which are
created from the current pack. It affects any organisation survey on `heituva-prod` that
predates `M:0040`, and there is no code path that repairs one.

**Not fixed here, and the reason is the same one that made the migration right.** The
repair is either a backfill that edits a live survey's questions (which the migration
declined to do for good reason) or a per-survey re-designation in the Builder (which is a
screen nobody has asked for). Both are decisions, not chores.

**What would make it safe to leave:** the panel distinguishing "no breach question was
designated" from "no breaches were found". It draws the same 0 for both today, and that is
the fabricated-data rule in its quietest form — a real zero and an undefined numerator
rendering identically.

---

### D102 — the repair options, for Tor (V1-6). **RESOLVED 2026-09-07: the scope is ZERO. Option D taken.**

**Scope, to be measured rather than estimated.** Every organisation survey on
`heituva-prod` created before migration `20260906000040` — the one that wrote roles into
`template_packs.questions` and deliberately did NOT rewrite existing surveys. Locally and
in the demo seed this is zero surveys, both being built from the current pack. The number
on prod is one query and nobody has run it. **Run it first, because option D may be the
whole answer.**

**Common to all four, and not one of the options:** the panel must stop drawing the same
`0` for two different states. That is the thing that makes any repair safe, and it is one
null instead of a count plus one line of copy. Recommended regardless of which is chosen —
including D.

| | Repair | What it costs | What it risks |
|---|---|---|---|
| **A** | **Backfill the role onto existing surveys' questions**, matching each survey's questions to its pack's by text | One idempotent migration, no UI | **Edits a live survey's `config` after it was sent.** Q35's own reasoning is that the role is COPIED at creation precisely so editing the pack later cannot reclassify a sent survey; a backfill does what that rule forbids, from the other direction. Text-matching is fuzzy too: a question edited in the Builder no longer matches its pack |
| **B** | **A re-designation control in the Builder** — an editor marks the breach question on any survey | A screen nobody has asked for, a write path, RLS, tests | The honest answer if this affects several customers, over-built if it affects one. Also the only option that handles a survey whose questions were edited away from the pack |
| **C** | **Derive at read time** — fall back to the bundle's `/brudd/i` text match when no role is designated | Small, contained in `registerStats` | **Reintroduces exactly what Q35 removed.** A question mentioning «brudd» that is not the breach question would be counted, and the panel would be confidently wrong rather than visibly empty. `tests/unit/question-roles.test.ts` asserts against this by name |
| **D** | **Nothing but the copy fix** — «ingen bruddspørsmål er utpekt», and the count absent rather than zero | One null, one string | Leaves pre-`M:0040` surveys without a breach count. **Correct if the scope query says "one or two, all finished"** — an aktsomhetsvurdering is annual, so the next round creates a new survey from the current pack and the problem ages out |

**Recommendation: run the scope query, then D — and B only if the query says several
customers are affected and their surveys are still live.**

A does what Q35 exists to prevent, and does it fuzzily. C reintroduces the regex Q35
removed and is wrong in the direction that looks right. B is real work for a population
nobody has counted. D plus the copy fix is honest at every size — it never claims a number
it does not have — and if the population turns out to be large, B is still available and D
is not wasted, because the copy fix is B's empty state too.

**THE SCOPE QUERY, RUN 2026-09-07 on `heituva-prod` (`jmhhszsnjfqgclxzhciq`) on Tor's
instruction. Read-only.** The affected population is **zero surveys**:

| | |
|---|---|
| Surveys on prod, all kinds | **4** |
| Of which `respondent_kind = 'organisation'` | **0** |
| Organisation surveys with no `brudd` role | **0** |

All four are `person` / `utkast`. There is no organisation survey on prod, so there is no
survey the defect can reach — the population is not small, it is empty.

**Option D taken, and the copy fix with it** (which was recommended regardless of the
option chosen). `lib/dashboard/panels.ts` — `registerStats` returns `value: null` with the
label «ingen bruddspørsmål er utpekt» when no question carries the role, and
`DashboardScreen.tsx` draws «—» for a null value, the same treatment a gated cell gets.
`tests/unit/register-stats.test.ts` binds it in five tests, two of which were proven
failing against the previous behaviour before the change was kept.

**A, B and C are NOT taken and the reasons stand unchanged.** B remains available if the
population ever becomes non-trivial, and this copy fix is B's empty state, so nothing here
is wasted work.

**WHAT THE QUERY ALSO FOUND, and it is larger than D102.** `M:0040` is not applied on
prod. Prod's newest migration is `20260905220242`; the repository's is
`20260907000053`. **Nineteen migrations are unapplied** — everything from `0035` (Q47)
through `0053`, which is the whole v1 series from V1-1's tail onward. That is why
`packs_with_brudd_role` is also 0 there: the pack edit has not landed either. Applying
them is a production deployment and therefore a decision, not a chore — carried in
`docs/v1/05-status.md` § 3.

---

### D103 — the note under «Runde for runde» no longer promises what the panel does

**Bundle:** `HeiTuva.dc.html:2608` sets the sentence under the rounds panel:
«Hver runde er sitt eget datasett. **Runder under terskelen vises som — uten
antall.**» It was implemented verbatim as `results.roundsNote`.

**Deviation:** the second clause is replaced. `no`: «Runder under terskelen viser
antall svar, men ikke snittet.» `en`: "Rounds below the threshold show the
response count, but not the average."

**Why:** DECISIONS Q49 (V1-6, confirmed by Tor) puts the participation count on a
gated round, so the panel now renders «3 svar · under terskel» where it used to
render «under terskel» alone. The bundle's sentence promises the opposite, on the
same screen, eight pixels below the thing it describes. Leaving it was not an
option: a screen that contradicts itself is a defect whichever half is right.

**Why this is not restyling.** The bundle predates the decision that governs it.
Q28 amended the threshold brief's absolute prohibition — «Ingen visning av
faktisk antall svar under terskelen» became «Ingen visning av et **svarutledet
tall** under terskelen» (`docs/Designbrief_terskel_Q17.md:132`) — because a count
of people is participation and not a number about what anyone said. Q49 extended
that from the survey to the round. The bundle's copy was written against the
un-amended brief; the copy inside `design-reference-v1/` still carries the old
line, and it is a handoff artifact and stays untouched.

**Scope:** two strings, both languages. The panel's structure, the em dash on the
bar, the grey stub and every token are unchanged. The count is appended to the
sub-label the bundle already had, so the ungated and gated sub-labels keep the
same shape — «{count} svar» and «{count} svar · under terskel».

**Guard:** `tests/unit/refusal-copy.test.ts` asserts that `roundsBelow` carries a
`{count}` placeholder (a fixed string cannot render a count in any language) and
that `roundsNote` no longer carries the withdrawn promise. The second is asserted
as the ABSENCE of the old claim rather than as the new wording, so rewording the
sentence later does not have to come back through this file.

---

### D104 — prod carried a hand-applied `overview_activity` that never matched the repository

**Found 2026-09-07**, during the sync of migrations 0035–0053, by a normalised body-level
diff of all 74 functions between `heituva-prod` and a freshly reset local database.

**What was different.** Prod's `public.overview_activity` declared a variable `i int`. The
committed migration `20260904000013_overview_activity.sql` deliberately does not, and
carries a comment saying why: `for i in reverse … loop` declares its own integer loop
variable, so declaring one shadows it, and `supabase db lint` reports both the shadowing
and the now-unused declaration. **Prod would have failed Gate 1's lint**, on a repository
whose CI has been green for six phases.

**Why this is a deviation and not a bug fix.** The behaviour was identical — an unused
declaration changes nothing at runtime — so nothing was broken for any user. What is
recorded here is the PRACTICE, because the practice is still available:

> **A function on prod came from somewhere other than the committed migration.** The file
> has exactly ONE commit in git history (`96983b8`), so it was not edited after being
> applied. Prod's copy was applied by hand — through the MCP or the dashboard — from a
> draft that was later corrected in the repository and never re-applied.

**If it happened once, the thing that allowed it has not gone away.** Nothing in this
project prevents a function being applied to prod directly; the MCP's `apply_migration` and
`execute_sql` both reach it, and both were used legitimately on the same day. The guard is
not a prohibition, it is the fingerprint: **an apply is not evidence, a comparison is** —
now written at the head of the remote-apply procedure in `docs/OPERATIONS.md`.

**Why no gate could see it.** Every gate runs against local. `supabase db lint` in Gate 1
lints the local database; the invariant suite queries the local database; 5a3 enumerates
the local catalogue. **There has never been a check that reads prod at all**, which is why
a divergence introduced by hand survived six phases of green CI. That is the same shape as
this project's other findings — a gate green for something it structurally could not see,
one environment over.

**Detection detail worth keeping.** Raw `md5(prosrc)` reported **29 of 74** function bodies
as differing; after stripping comments and collapsing whitespace, exactly **one** did. The
28 were header comments removed in transit. A raw comparison would have buried this finding
in noise and been abandoned as "expected drift" — which is how a real difference hides
inside a plausible one.

**Repaired** by re-applying the committed definition verbatim, including its `revoke`,
`grant` and `comment`. Every fingerprint category now matches local byte for byte.

### D105 — the Personvern threshold note says three things the system does not do
v2 draws the organisation's default-threshold picker (HeiTuva.dc.html:2737-2747,
values at :5583) and, under it, this note at :5591:

> «Standard for nye undersøkelser er 5 svar. Kartlegging av trakassering,
> varsling og helse settes automatisk til 8. Den som lager en undersøkelse kan
> heve terskelen, men ikke senke den under virksomhetens minimum.»

The picker is built as drawn — its values agree with the schema, 3 being Q17's
floor for natural persons and 10 Q36's ceiling, both CHECKed on the column
(`M:0034:19-20`). **The note is not.** Measured against the code rather than
against the brief, three of its clauses are false:

1. **«settes automatisk til 8» — no such rule exists**, and Q58, which would
   create it, was RETURNED rather than confirmed: only two packs carry a locked
   policy at all, `trakassering-ytringsklima` carries none, and «varsling» and
   «helse» have no pack to attach a number to. Shipping the sentence would
   promise a behaviour nothing implements.
2. **«ikke senke den under virksomhetens minimum» — there is no such floor, and
   this is now ENUMERATED rather than asserted.** `scripts/verify/threshold-readers.ts`
   derives the complete set of readers and writers of both threshold columns
   from `pg_proc`, `pg_constraint` and `pg_trigger`, and classifies each:

   | | |
   |---|---|
   | `app.apply_pack_policy` | **SEEDS** — the only function that reads `organizations.default_k_threshold`, and it writes `new.k_threshold` at insert |
   | `app.guard_survey_policy` | **BOUNDS** — on the LOCK and the ROLE, and it never reads the org default |
   | `app.k_for`, `public.get_survey_for_token` | READ |
   | `organizations_default_k_threshold_range` | `CHECK (default_k_threshold BETWEEN 3 AND 10)` |
   | `surveys_k_threshold_ceiling` | `CHECK (k_threshold <= 10)` |
   | `surveys_k_threshold_floor` | `CHECK (k_threshold >= 3 OR respondent_kind = 'organisation')` |

   **Verdict: 0 surfaces constrain a survey's threshold against the organisation
   default.** No CHECK references it; the one function that reads it seeds and
   returns. A survey's floor is 3, not the organisation's number.

   **And that matches Q17 as committed.** `docs/Q17_terskel_forslag.md:9-14`
   tabulates «Gulv 3 · Standard 5 · Kan endres av Administrator» for both
   natural-person rows, and the design brief §8 says «Enkeltundersøkelser kan
   settes høyere, aldri under **3**». So the implementation is not a gap against
   Q17 — it is Q17. A stricter rule making the organisation's default a FLOOR
   for its own surveys is a **decision nobody has taken in this repository**:
   `git grep` finds no «aldri senke», no «sette gulv», no «25 ansatte». If it
   was decided in conversation it is the third thing in this project to be
   decided and never committed, after Q17 itself and the expansion catalogue,
   and it needs a decision line and a migration rather than a sentence in a note.
3. **«Den som lager en undersøkelse kan heve terskelen» — by default they
   cannot.** `app.guard_survey_policy` (`M:0034`) refuses any threshold change
   by a non-administrator unless `privacy.redaktor_may_lower` is true.

So the note states what is true and is **parameterised on the flag**:
«Nye undersøkelser for personer starter på {k} svar. Terskelen kan aldri settes
under tre.» plus, on `redaktor_may_lower`, either «Bare en administrator kan
endre terskelen på en undersøkelse.» or «Redaktører kan også endre terskelen på
en enkelt undersøkelse, fordi det er slått på for virksomheten.» — and a third
sentence the bundle omits entirely, that organisation surveys have no threshold
at all, which is `app.k_for` returning 0 by design.

**`privacy.redaktor_may_lower` is KEPT and no switch is built for it** (Q57).
v2 draws no control for the flag, and Q29's rule applies verbatim: do not remove
a working consumer to match a bundle that forgot it. The flag is read by the
guard and tested (`tests/invariants/attributed-results.test.ts:267-288`); what
changes is that the copy above it now tells the truth about which state it is in.

### D106 — the help copy says four roles; v2's own Brukere screen says three
`HeiTuva.dc.html:4279` opens the «Roller og tilgang» article with «Fire roller
styrer hva folk ser», and `:4283` gives verneombud its own role, repeated at
`:5100` and `:5131`. **The same bundle contradicts itself at `:2279`**, where the
Brukere screen's own sentence is «Administrator styrer innstillinger og
personvern. Redaktør lager og sender undersøkelser. Leser ser bare summerte
resultater» — three. The v1 bundle says nothing of the kind.

DECISIONS **Q59**: verneombud is a **duty capacity, not a role**. `duty_signers`
(`20260904000004_duty_signing.sql`) already records who signs a statutory duty,
so a verneombud is a `leser` who signs. `app.member_role` stays exactly
`('administrator','redaktor','leser')` (`M:0001:7`).

The deciding reason is duplication rather than cost: a fourth enum value would
express a second time what `duty_signers` already expresses, in the one place in
the schema where a mistake is most expensive — every RLS policy and every
`app.has_role` call reads that enum, and Gate 5a3 re-enumerates all 74 surfaces
against it.

**Consequence for V2-6**, which builds the help centre: the article is
transcribed with **three** roles, matching `:2279` and the schema, and the
verneombud sentence describes signing rather than a role. Recorded here so the
copy is not transcribed verbatim from `:4279` by someone reading only the
article.

### D107 — the `2` chip is in no bundle, and the note it sits under swung back to one
**Two divergences from the same decision (Q91 + Q90), recorded together because
they point in opposite directions and a reader meeting one without the other
will read it as an inconsistency.**

**(a) No bundle draws a `2`.** The v2 Personvern picker is
`orgThresholdChips: [3,5,8,10]` (`HeiTuva.dc.html:5583`) and the v1 builder's is
`polThresholds: [3,4,5,8,10]`
(`design-reference-v1/…/HeiTuva.dc.html:4855`). The app now offers
`[2, 3, 5, 8, 10]` on Personvern (`PrivacyPanel.tsx:22`) and
`[2, 3, 4, 5, 8, 10]` in the builder (`bygg/PolicyPanel.tsx:43`). **The added
chip exists on DECISIONS Q91's authority alone** — the floor moved from 3 to 2 —
and Q52's rule settles the precedence: the bundle governs visuals, the register
governs behaviour, and an option's existence is behaviour. The chip's chrome is
the bundle's verbatim, tokens and all; only the set has one more member.

**Q91 makes it conditional, not merely available.** At 2 the picker renders a
three-paragraph `--ac3` block that no bundle draws either: the arithmetic
property («den som svarer regne seg fram til hva den andre svarte»), «Med navn»
as the honest alternative, and the GDPR consequence. It is not styled as an
error — no red — because choosing 2 is lawful and consequential, not a mistake,
and the design brief forbids an error colour on this control.

**(b) `orgThresholdNote` swung BACK to the bundle's wording, one phase after
diverging from it.** V2:5591 asserts «Den som lager en undersøkelse kan heve
terskelen, men ikke senke den under virksomhetens minimum». V2-1 recorded that
as a divergence and wrote a note stating what was true instead, because the
column only **seeded** a new survey and bounded nothing afterwards — enumerated
rather than read for, by `scripts/verify/threshold-readers.ts`, which returned
`0 surface(s) constrain a survey's threshold against
organizations.default_k_threshold`. **Q90 then made the bundle's sentence true**,
on the evidence of `privacy.redaktor_may_lower` — a flag meaningless without a
floor to lower beneath. So the divergence is withdrawn and the note states the
floor again.

**Worth naming, because it will happen again.** The bundle was not wrong; it was
*ahead*. A prototype describes the product someone intends, and the app describes
the product that exists — so a divergence between them can be closed from either
side, and which side moves is a decision (Q90) rather than a fidelity question.
The V2-1 note was correct when written; recording it as a deviation is what made
it cheap to reverse.

### D108 — «Profil og avsender» ships two of its five cards
The v2 tab draws five cards (`HeiTuva.dc.html:2313-2404`). V2-2 builds **Logo**
(`:2313-2325`) and **Farge og typografi** (`:2327-2347`) exactly as drawn. The
other three are **not** rendered:

| Card | Bundle | Why not |
|---|---|---|
| Avsender — domains + profiles | `:2348-2372`, data `:4912-4922` | Every row carries a DNS verification status («Verifisert», «Mangler DKIM»). There is no provider to ask, so the chip would be decoration |
| Låst per mal | `:2374-2390`, data `:4923-4928` | Each row names a **sender** («Nøytral avsender låst»). The lock is real — `app.guard_survey_policy` — but the thing it locks does not exist yet |
| Standard emnefelt | `:2392-2402`, data `:4929` | Four languages, of which two are active (Q11), and no column holds a default subject |

**The rule that decides this is CLAUDE.md's never-fabricate rule, not scope.**
A status chip is not a label: in a screenshot and in a demo it is
indistinguishable from a verified domain, and it survives into both. The plan's
own mitigation for V2-1 — "manual/DNS-record display only" — does not help,
because what the card displays IS the verification state.

**What is rendered instead**: one sentence (`admin.brandSenderDeferred`) saying
that sender, per-template locking and default subjects belong to this tab and
are built with sending. That is the design's own honesty about an unavailable
feature (the `feature_flags` pattern from Q26), applied to a card the bundle
has no unavailable state for. Sender verification lands in **V2-11**.

**One thing the bundle does not draw at all, and the app must**: a slot that
HAS a logo. The prototype has no storage, so it draws the empty slot only. The
uploaded image renders inside that slot's own frame, above the button, which
becomes «Bytt» — the minimal consistent option, logged here per CLAUDE.md's
"when ambiguous" rule.

### D109 — a promise can be wrong in the CAUTIOUS direction, and it is just as visible
**DECISIONS Q91 was confirmed in V2-2 and not implemented.** `M:0055` moved the
person floor 3 → 2 in `surveys_k_threshold_floor` and left `app.k_for` — the
gate every aggregate path routes through — at `greatest(s.k_threshold, 3)`.
Measured before `M:0057`:

```
select min(app.k_for(s.id)) from surveys where respondent_kind='person'  -> 3
select count(*) from surveys where app.k_for(s.id) = 2                   -> 0
```

**NOBODY WAS EXPOSED, AND THAT IS THE POINT OF THIS ENTRY.** The gate was
STRICTER than the setting: a survey chosen at 2 withheld until three had
answered. No cell was revealed that should have been hidden, no aggregate was
reversible that should not have been. Every other threshold defect this project
has recorded ran the other way.

**It is a defect of the same size anyway, and the reason is that a promise is
read by a person.** The respondent screen told someone «Svarene er anonyme, men
terskelen er satt til to. Da kan den andre som svarer regne seg fram til hva du
svarte» — a warning about a disclosure the database was preventing. A person
deciding whether to answer honestly read a threat that did not exist and
weighed it. **Over-warning is not a safe failure; it is a different wrong
answer, and it costs exactly what under-warning costs — the reader cannot tell
which kind they are holding.** The product also spends its warnings' credibility
this way: a warning that turns out to be false is the reason the next one is
ignored.

The register's own words for the class, from Q17: «en fast tekst som lover mer
enn innstillingen holder, er den eneste virkelige feilen i hele denne
endringen». That sentence names one direction. **This entry widens it: a text
that promises LESS than the setting holds is the same error, because both are
texts that do not describe the system.**

**The visible symptom, recorded second because it is the lesser half.** Two
shipped screens disagreed about the same survey: Bygg rendered «2» from the
chosen column and Send rendered «3» from a TypeScript mirror of the gate's
clamp. That mismatch is what a reviewer would have noticed. The promise to the
respondent is what mattered, and nothing on any screen showed it was wrong.

**The document half is instance 4 in D110**: `CLAUDE.md`'s standing invariant 1
asserted «floor **2** for natural persons since **Q91**» while the function
returned 3. The sentence was written when the CHECK moved and the function did
not, and nothing reads prose.

**Fixed** in `M:0057` by removing the floor from `app.k_for` entirely — not by
moving it to 2, which is the same defect with a fresher number — and by
replacing the four TypeScript mirrors with `effectiveK()`. Guarded by
`scripts/verify/threshold-readers.ts § 2c`, which reads the function's body out
of `pg_proc` rather than grepping for a shape.

### D110 — a count in a plan is not a measurement, and a gate nobody reads is not a gate
**Four instances found in one groundwork pass, and they are one shape.** Recorded
together because each was individually small and dismissable, and the pattern is
neither. Tor named it, 2026-09-08.

| # | The claim | What was true | Where |
|---|---|---|---|
| 1 | «Three v2 surfaces hard-code 5» | **Four** rendered surfaces, six logic lines. The missed one is the Send audience picker — **the only one on a screen a user reaches today** | `00-diff.md § B.27`, `02-conflicts.md § A4`; bundle V2:6543–6544, rendered V2:3072–3074 |
| 2 | «They are flagged off (`entra_sync`, `google_sync`, `hr_sync`)» | The three flags are seeded `false` and **read by nothing**. The actual gate is `IMPLEMENTED_SOURCES`, a hard-coded client constant — not org-scoped, not a row | **D44**; `lib/send/registry.ts:125`, `SendScreen.tsx:364` |
| 3 | «Census target ≥630 / 38» | Already satisfied before the phase opened — the manifest read **636 / 38**. And «5a3 ≥61 of 74» carried a denominator that had moved to **75** | `03-plan.md`, V2-3's definition of done |
| 4 | «`app.k_for` (…floor **2** for natural persons since **Q91**)» | The function returned `greatest(s.k_threshold, 3)`. The sentence was written when the CHECK moved and the function did not | `CLAUDE.md` standing invariant 1; see **D109** |

**THE SHAPE.** Every one of these is a **document asserting a fact about the
system**. None was careless, and none was wrong when written — (1) and (3) were
inherited forward, (2) described an intention nobody built, (4) described a
change that landed in one place of two. **A claim about the system decays
silently while the system moves, and nothing in this project reads prose.**

**WHY THE EXISTING RULE DOES NOT COVER THIS.** `DECISIONS.md`'s header already
requires that *a clause asserting what any artefact does must carry the line it
does it on*. All four of these carried citations. A citation proves somebody
looked once; it does not survive the artefact changing underneath it, and it
does not help at all when the number was copied from another document rather
than counted.

**THE NARROWER RULE, which is what actually separates the survivors from these
four: A NUMBER OR AN ENUMERATION IN A DOCUMENT MUST BE DERIVABLE BY A COMMAND,
AND THE COMMAND GOES BESIDE IT.**

The numbers in this repository that have never gone stale are exactly the ones
produced by a run: the census manifest (`tests/expected-counts.json`, checked by
the suite itself), 5a3's `56 of 75` (`verify:policy` prints it), `verify:copy`'s
allowlist count, `threshold-readers.ts`'s `1 surface(s) constrain…`. The four
above were all **typed**. So when a document must carry a count, it carries the
command that produces it, and a reader who doubts it runs the command instead of
re-reading the sentence.

**AND ITS OTHER HALF — A GATE NOBODY READS IS NOT A GATE.** Instance 2 is the
sharpest because the mechanism *looked* built: rows existed, they were seeded to
the right value, and three separate documents described the gating they perform.
Nothing called them. **A feature flag with no call site is a comment in a table**,
and the way to find it is to enumerate call sites rather than to read the seed —
the same method `threshold-readers.ts § 1` uses for the threshold columns and
`verify:policy` uses for RLS surfaces.

**Consequence for V2-3, and it is not a new gate** (the apparatus stays frozen):
the phase restates its own targets from a measurement rather than inheriting
them, wires `isFlagEnabled` to the three seeded rows or removes them, and fixes
the enumeration in § B.27 and § A4 by grep rather than by re-reading the list.
The corrections themselves are in `docs/v2/03-plan.md`, `docs/v2/02-conflicts.md`
and D44.

**Related:** **D109** (the same failure, in copy rather than in a count: a
warning that did not describe the system), and `DECISIONS.md`'s header rule that
this narrows.
