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

**RESOLVED IN V2-3a**, on Q62: the flag gate is now performed rather than
asserted — `send/page.tsx` resolves `entra_sync`, `google_sync` and `hr_sync`
through `isFlagEnabled` per organisation, and `IMPLEMENTED_SOURCES` is gone.
The count is no longer duplicated here; the census manifest holds it (**D110**:
a number in a document must be derivable by a command).

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
neither. Tor named it, 2026-09-08. **Extended the same day with a fifth instance
(a citation that is real, on-topic and the wrong source) and, after V2-3a, with a
FOURTH CASE in the trichotomy at the foot of this entry — evidence that is real,
present and structurally mute on the claim.**

| # | The claim | What was true | Where |
|---|---|---|---|
| 1 | «Three v2 surfaces hard-code 5» | **Four** rendered surfaces, six logic lines. The missed one is the Send audience picker — **the only one on a screen a user reaches today** | `00-diff.md § B.27`, `02-conflicts.md § A4`; bundle V2:6543–6544, rendered V2:3072–3074 |
| 2 | «They are flagged off (`entra_sync`, `google_sync`, `hr_sync`)» | The three flags are seeded `false` and **read by nothing**. The actual gate is `IMPLEMENTED_SOURCES`, a hard-coded client constant — not org-scoped, not a row | **D44**; `lib/send/registry.ts:125`, `SendScreen.tsx:364` |
| 3 | «Census target ≥630 / 38» | Already satisfied before the phase opened — the manifest read **636 / 38**. And «5a3 ≥61 of 74» carried a denominator that had moved to **75** | `03-plan.md`, V2-3's definition of done |
| 4 | «`app.k_for` (…floor **2** for natural persons since **Q91**)» | The function returned `greatest(s.k_threshold, 3)`. The sentence was written when the CHECK moved and the function did not | `CLAUDE.md` standing invariant 1; see **D109** |
| 5 | Q64 «the freeze surface is **V2:5033**» — in three documents | **V2:5033 is real, is about the freeze, and is the wrong source.** It is a string inside `auditRows` — the changelog's *echo*. The card that STATES the rule is `freezeNote` at **V2:5030**: «Medlemskapet fryses når undersøkelsen sendes.» The answer to the open question was sitting in the artefact, in its own words | `03-plan.md`, `01-briefs.md`, `04-decisions.md`; bundle V2:5024–5036 |

**A SIXTH FAILURE MODE WAS ADDED 2026-09-10 AS D135 — documentation that was true when
written, with nothing binding it to reality afterwards.** It belongs to this entry's family
and is written separately because its fix is mechanical rather than editorial: a divergence
note carries the command that re-derives it.

**INSTANCE 5 IS A FOURTH FAILURE MODE, and it is the one a citation rule is worst at
catching** (Tor, 2026-09-08). The first four instances fail because the claim went stale, was
never built, was already satisfied, or moved underneath. This one fails while being **real,
on-topic, and checkable**: someone opened V2:5033, found text about the freeze, and cited it.
Every test a reviewer would apply passes. **A citation can point at a genuine mention of the
right subject and still be the wrong source** — an echo of the rule rather than its statement
— and the cost here was that a question was drafted as OPEN while its answer sat six lines
above the line being cited.

The practical form, recorded in `docs/v2/00-diff.md § 0.3`: when a decision is about behaviour
on a screen the bundle draws, **grep the bundle's COPY for the behaviour**, not only its markup
for the control — and prefer the surface that states a rule over any surface that mentions it.

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

**THIS ENTRY NEARLY CONTAINED ITS OWN FAILURE, AND THAT IS THE CLEAREST
ILLUSTRATION OF WHY THE RULE IS WORTH HAVING.** Applying it to V2-3's restated
targets meant writing two commands beside two numbers. I ran them. The first —
`npm run verify:policy | grep -c '^  ok '` — returned **0**, not 56. The number
was not wrong; **Docker had died in the container restart**, so the gate could
not reach the stack at all. Had I written the numbers and the commands without
running them, the entry demanding measured numbers would itself have shipped
asserted ones, in the same commit that named the rule. The commands now return
**56** and **38 / 636** against a restored stack.

**THE CAVEAT THAT COMES WITH THE RULE, because the rule will spread.** A command
beside a number is evidence **only if someone runs it**, and a command that fails
for environment reasons looks exactly like a number that has changed. Nothing
distinguishes them from the output. The gates have a dependency guard for this
(`verify:visual` names the missing browser rather than emitting lookalike
failures — VERIFY.md Gate 6); **nothing does, or should, guard a command embedded
in a document.**

So when a document and its evidence disagree — or seem to agree — that means ONE
OF FOUR THINGS, and **only one of them is that the document is stale**:

1. **The document is stale** — the number moved. Update the document.
2. **The command cannot run** — dead stack, missing browser, no network. The
   number may still be correct. Fix the environment and re-run before touching
   the document. *This is the case that produced the 0 above.*
3. **The command is wrong** — it never measured what the sentence claims, so
   both have always disagreed and nobody looked. Fix the command first; the
   number is unknown until it runs.
4. **The evidence is MUTE** — real, present, the right artefact, and
   **structurally incapable of expressing the claim at all**. Nothing
   disagrees, because the artefact says nothing on the subject. Added
   2026-09-08 by Tor, from V2-3a.

**CASE 4 IS THE WORST OF THE FOUR AND THE HARDEST TO SEE.** The first three
announce themselves: a mismatch, an error, a zero. Case 4 produces a green
gate, an artefact that opens, and a citation that survives every test a
reviewer would apply — because the artefact *is* the right one, and it is
simply silent.

**The instance.** V2-3a's report cited
`artifacts/phase-1/admin-malgrupper.regel-felt-valgt.desktop.png` for Q65's «the
editor must say so rather than offering fields that can never match». The state
is the rule builder with a field chosen, and the clause is about the
*unavailable* fields being offered and disabled with their reason. **A closed
native `<select>` never draws its options.** The dropdown is rendered by the
operating system, outside the page and outside any screenshot. So the file
exists, opens, shows the right screen, and is mute about exactly the thing it
was cited for. The capture succeeded, the pixel diff passed, the log said `ok`,
and every gate was green over it. It was found by opening the picture and
looking at it — the one thing VERIFY.md Gate 3a asks for and no gate can do.

**AND IT IS WORSE THAN THE OTHER THREE FOR A REASON WORTH NAMING: A PICTURE
LOOKS LIKE EVIDENCE IN A WAY A NUMBER DOES NOT.** A number invites the question
«where does this come from». A screenshot answers it before it is asked — it is
a photograph of the running product, and the reader's instinct is that a
photograph cannot lie. It does not lie here. It is simply not about the claim.

**Case 4 is the neighbour of instance 5 above and they are not the same.**
Instance 5 cited a real mention of the right subject and it was an *echo* rather
than the statement — wrong source, right subject. Case 4 has the right source
and no subject: the artefact carries no version of the claim, true or echoed.
The first is fixed by preferring the surface that states a rule; the second
cannot be fixed by choosing a better line, because there is no line.

**CASE 4 HAS A SECOND INSTANCE, AND IT IS NOT A CITATION — IT IS A CAPTURE.**
Added 2026-09-09 (Tor), from V2-9. The first draft of the Live page built the QR's
join URL as

```ts
`${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/l/${session.code}`
```

and **that variable does not exist in this project** — measured, `.env.local` defines
only the two Supabase ones. The QR would have encoded `/l/ABC123` with an empty
origin: a real, valid, correctly-rendered QR code that scans to nothing.

Tor's reading, which is why it belongs here rather than as its own entry: *«the QR that
photographs correctly and scans to nothing is the same class as the `<select>` I cited
as evidence for a clause it cannot show. The picture is real and mute about the claim.
`NEXT_PUBLIC_SITE_URL` not existing would never have appeared in a capture.»*

**The two instances sit on opposite sides of the same artefact, which is what makes the
class general rather than a screenshot problem.**

| | Instance 1 (V2-3a) | Instance 2 (V2-9) |
|---|---|---|
| The artefact | a **citation** — a screenshot offered as evidence | a **capture** — a screenshot taken as verification |
| What is real | the screen, correctly rendered | the QR, correctly rendered |
| What is mute | the closed `<select>`'s options | whether the encoded URL resolves |
| What no gate could see | a control the OS draws outside the page | a string that is syntactically fine and semantically empty |

So the rule is not «be careful which screenshot you cite». It is: **an artefact that looks
like evidence can be silent about the claim, whether you are offering it or collecting
it** — and the question to ask of either is the same one, *what would this look like if
the claim were false?* A QR encoding a broken URL photographs identically to one encoding
a working one. A pixel diff over it passes. **The only check that distinguishes them is
scanning it, which is the capture's equivalent of opening the picture and looking.**

**THE FIX IS NEVER A BETTER SCREENSHOT.** Q65's clause is now asserted where it
can be expressed — `verify:interaction` reads the options off
`select[aria-label="Velg felt"]`: offered rather than omitted, each carrying
«ikke tilgjengelig», at least one other selectable. The screenshot keeps the job
it can do, which is the rule builder's active layout, and V2-3a's report **says
in words why the picture is not the evidence**, because a reader who finds a
capture beside that clause will otherwise assume it was checked.

**DO NOT BUILD ANYTHING FOR THIS.** A checker for embedded commands would be a
new gate over prose, and nothing could check case 4 at all — the question «can
this artefact express this claim» is not mechanical. Read the four cases, run
the command, open the picture, and decide which one you are in.

**AN ADDITION TO CASE 4, NOT AN INSTANCE OF IT (Tor, 2026-09-09, from V2-4).**
The V2-3a instance is an artefact that is mute. V2-4 found the same silence
produced by something that is not silent at all: **a reason that is TRUE and
INSUFFICIENT.**

`scripts/verify/threshold-copy.ts` allowlisted `admin.pMinResponsesDesc` with the
reason `'interpolates {k}'`. The string is *«Standard {k} svar for nye
undersøkelser · **aldri under 3** · lovpålagte maler har egen terskel»*. It does
interpolate `{k}` — the reason is accurate — and it also carries a fixed **3**
against a floor of **2**. The gate reasoned about the STRING; the claim lives in
a CLAUSE.

> **State the SCOPE of an allowlist reason, not only its content.**
> «interpolates {k} in clause 1, asserts nothing in clause 2» would have failed
> review on sight.

**And that is what made it lethal rather than merely wrong: a partial reason
survives review because a reviewer checks whether the reason is TRUE, not
whether it is SUFFICIENT.** A false reason is caught by the first person who
reads it. An accurate one that covers half its subject is *confirmed* by that
same reading, and the confirmation is what the finding then hides behind. It is
case 4's silence arriving through a sentence that speaks.

The scope rule applies to every allowlist in this repository — 5a3's, the
census's, this one's — because all three are «a name, and a reason for excusing
it», and none of them records what the reason does *not* cover.

**WHAT A RULE LIKE THIS CAN ACTUALLY ACHIEVE, which is less than it sounds and
still worth having** (Tor, 2026-09-08, on V2-3b's third Docker death).

The near-miss recorded above — `verify:policy | grep -c '^  ok '` returning **0**
from a dead stack, inside the entry demanding measured numbers — happened
**again**, in V2-3b, from the same command, for the same reason, while restating
that phase's targets by measurement. The entry existed. It had been read. It was
written by the person it happened to.

> **Knowing the shape did not stop it happening again — it stopped it being
> believed.**

That is the honest account of what this entry buys, and it is a more precise one
than «write the rule down». A documented failure mode does not stop the failure;
environments still die mid-command and zeros still arrive looking like
measurements. What it changes is the reading: the second time, the 0 was
recognised as case 2 within one command rather than written into a document as
case 1. **The rule's value is in the interval between seeing a number and
believing it**, not in preventing the number.

Recorded here because the same is true of most of this project's rules, and a
reader who expects prevention will conclude they do not work.

**INSTANCE 6, 2026-09-08 — in the batch document itself, and the cleanest example
of the shape so far.** Assembling `docs/v2/06-remaining-decisions.md`, Q77's draft
in `04-decisions.md` read «All nine exist as seeded packs today (CI asserts
`packs = 22`)». **There is no such assertion anywhere in the suite**, and the
measured count is **29** (`select count(*) from public.template_packs`).

**THE CLAIM SURVIVED; ITS EVIDENCE NEVER EXISTED.** The nine survey types *are*
seeded, so the sentence Q77 rests on is true and always was — which is precisely
why nobody looked. **A citation supporting a true claim is the hardest kind to
audit, because the only thing wrong with it is that it is not a citation.** This
is neither instance 5's echo (a real line, wrong source) nor case 4's mute
artefact (a real artefact, silent on the claim): the referenced artefact **does
not exist**, and a reader checking the conclusion rather than the citation would
confirm the entry and move on.

Three line citations in Q78's own draft were wrong by two in the same pass —
`counter` is V2:6136 not 6138, `manualReveal` V2:6137 not 6139, and V2:6177 is
the bar mapping rather than the counter. All three were found by opening the
bundle at those lines while preparing the question, which is the only method that
finds them. And opening them found something larger, which is in
`06-remaining-decisions.md` as Q78's first paragraph: **`liveGuard` (V2:6147)
promises the threshold is respected on the projected screen, and nothing in the
prototype's live block implements it** — `liveStage.counter` is
`String(sv.responses.length) + " svar"` (V2:6169) and `liveRevealed` is a free
client toggle (V2:6175). The only occurrence of any threshold concept in
V2:6130–6190 is `liveGuard`'s own copy string. **The bundle asserts a security
property it does not have**, which is this entry's shape with the highest stakes
it has yet had.

**Related:** **D109** (the same failure, in copy rather than in a count: a
warning that did not describe the system), and `DECISIONS.md`'s header rule that
this narrows.

### D111 — Målgrupper: three controls the bundle draws that this schema cannot fill
V2-3a builds `adminMalgrupper` (V2:2405–2658). Three of its controls diverge,
and all three divergences are the **same rule applied three times**: CLAUDE.md's
never-fabricate rule, which says render the real state, render nothing, or
render the design's empty treatment.

**(a) The population pill is not rendered** — drawn at V2:2437 (group cards) and
V2:2458 (segment rows), tinted from `g.pop` (V2:5047, :5051). Neither `groups`
nor `segments` has a population column, because populations are
catalogue-blocked (**Q63**). A coloured chip reading «Ansatte» over a column that
does not exist is indistinguishable in review from a real one, and it survives
into screenshots. **The Populasjoner card states it once in words** instead of
every card restating it in a chip — and that card is drawn by the bundle
unconditionally, so the sentence lands where a reader is already looking.
«Behandlingsgrunnlag» (V2:2610–2621) is the same case and gets the same
treatment.

**(b) The rule input is a structured builder, not the bundle's free-text box**
(V2:2482, with prose example chips at :2484–2486). **Q65** decided the predicate
is `{field, op, value}` over an allowlisted set, never free text evaluated in
SQL. **This is the sanctioned exception in CLAUDE.md's control-substitution
rule**, quoted: *where the prototype's control cannot express a real schema
constraint — a free-text field standing in for a foreign key, because the mock
had no database behind it*. The constraint named: `app.validate_segment_predicate`
refuses any clause whose field is not in `segment_fields`, so a free-text box
would collect input the database will reject and could not say why.

**The rendered rule stays the bundle's control** — monospace, on its own line
under the name (V2:2460) — and is **generated from the predicate** rather than
stored beside it, so `en` works and the sentence cannot drift from what the
database holds.

**(c) Unavailable fields are offered and DISABLED, with the reason on them.**
The bundle's own examples name `stillingsprosent`, `startdato` and `land`
(V2:4319–4322) — fields this product has no column for. Q65: *«the rule editor
must say so rather than offering fields that can never match»*. Omitting them
leaves the editor silently shorter than the design with nothing to explain the
gap; enabling them lets a person build a rule that can never match. Seeding them
`available = false` is what makes the third option — say so — possible at all.

**Two refusals to guess, recorded because they are the ones a later change is
most likely to undo:**
- A segment whose rule cannot be evaluated renders «kan ikke beregnes», **never
  0**. Zero is a real answer — a segment nobody matches — and the two must not
  look alike.
- An audience of unknown size gets **no threshold badge at all**. A warning
  derived from a number that could not be computed is a guess wearing a
  warning's clothes, and D109 is the entry about warnings that do not describe
  the system.

**And one thing the bundle draws that IS kept exactly:** `kind` is derived from
whether a rule was given (V2:5065, `kind: rule ? "segment" : "gruppe"`). It is
the one place the design's model and this schema agree without adjustment, so it
is transcribed rather than reinterpreted.

### D112 — Medlemmer and Reservasjonsliste: two controls removed, one added
V2-3b builds the two cards V2-3a left (V2:2570–2608). Three divergences, and the
first two are the same rule as D111's three — CLAUDE.md's never-fabricate rule —
while the third is its mirror image, which is the interesting one.

**(a) The sync line and «Synkroniser nå» are not drawn** (V2:2574, :2578; the
values at V2:5011–5012). The bundle's subtitle reads «Sist synkronisert i dag
07:10 fra Entra ID» and the button calls `onSyncNow`. No directory sync exists:
`entra_sync`, `google_sync` and `hr_sync` are seeded `false`, and **Q62(c) made
that gate real rather than asserted**, so the flags now genuinely say no. A sync
timestamp is a number this product does not hold, and a «synchronise now» button
is an action it cannot perform. The card states that once, in words
(`mgSyncUnavailable`), rather than showing a plausible time nobody can check.

**(b) «Fjern» per row is not drawn** (V2:2589). This one is NOT a missing column
— the action exists. `onRemove` in the bundle hides the row locally; the real
action it maps to is deactivating a member, and **Brukere already performs it**,
with the role rules, the confirmation and the audit trail that belong to it. A
second, differently-labelled path to the same destructive action is worse than
one path: the two will drift, and the one on the audience screen is the one
nobody will remember to keep in step. The card says where removal lives
(`mgMembersRemoveNote`). *This is a judgement, not a rule, and it is the entry to
argue with.*

**(c) The Reservasjonsliste GAINS an add row and a per-row «Opphev», which the
bundle draws nowhere.** V2:2595–2608 is a read-only list; objections are supposed
to arrive through `unsubNote`'s «avmeldingslenke» (V2:5022), which is not built
and is not in this phase.

**A suppression list nobody can write to is worse than no list at all**, and it
is D110's instance 2 in a user interface: the mechanism *looks* built — a table,
a policy, a guard on three insertion points — and nothing can put a row in it.
The screen would state a legal promise the product cannot keep. CLAUDE.md's rule
for a state the design genuinely lacks is to choose the minimal consistent option
and log it, so: an email field, an optional reason, and a button, styled exactly
as «Ny målgruppe» two cards above, plus a per-row lift. Administrator-only —
**this is the one place Q94's widening deliberately does not apply**, because
recording or lifting a person's objection to being processed is a privacy action
and not audience composition.

The copy for `unsubNote` is replaced rather than kept (`mgSuppressHow`): the
bundle's sentence describes the unsubscribe link as working today. Ours says
where objections come from now, and that the link comes later.

**AWAITING A DRAWING, AND LOGGED AS PROVISIONAL RATHER THAN AS SETTLED**
(2026-09-08, Tor). This is the only surface in the v2 run where CLAUDE.md's
do-not-invent rule had to yield, and the reason is the one worth carrying:
**the absence of a drawing does not remove the duty.** Everywhere else an absent
drawing means «render the design's empty treatment»; here it would mean «offer no
way to comply with article 21». Claude Design is being asked for this control
explicitly rather than left to produce it, so the eventual drawing is compared
against **a shape that was always provisional** — not treated as arriving late to
correct something that had settled. The governance row is in
`docs/v2/00-diff.md § 0.3`, «AWAITING A DRAWING».

The BEHAVIOUR does not move with the drawing: administrator-only, org-wide
(Q60), a delete rather than an edit (there is no update policy), audited on lift.

**THE SCOPE SENTENCES ARE A REQUIREMENT OF THE CONTROL, NOT DECORATION**
(2026-09-08, Tor: «a control discharging a duty should not require the operator
to infer its scope»). Three lines sit ABOVE the field, not below the button:

1. it applies to every future send from the organisation, including addresses
   that arrive in a synchronised group later;
2. it does not delete answers already given — deletion is Personvern og GDPR;
3. only an administrator can lift it, and lifting is logged.

**The third line is NOT the sentence Tor asked for, and that is deliberate.** The
instruction was that «one entered on someone's behalf cannot be undone by the
person who entered it». **That is not true of what is built**: `suppressions_del`
admits any administrator of the organisation, including the one who recorded the
objection, so the operator can undo their own entry. Writing Tor's sentence would
have put a false statement on the surface where a legal obligation is
discharged — the never-fabricate rule at its sharpest — **and it would have
looked correct, because it had been asked for**. So the line says what the
control actually does, and the gap was raised rather than papered over.

**CLOSED, 2026-09-08, as DECISIONS Q96 — decided rather than carried.** Tor: «Do
NOT build four-eyes… That is a trap, not a safeguard.» `created_by is distinct
from auth.uid()` on the delete policy is one line and uses a column that already
exists, and in a **single-administrator organisation nobody could ever lift
anything**; `heituva-prod` has one member, so a mistyped address would be
permanent with no support path.

**The mechanism is AUDIT, not separation, which is the right shape at this
product's size.** The same person may do both and the product does not refuse
it — but the lift audit row now carries **who ENTERED the objection beside who
lifted it** (`entered_by`, `entered_at`, `M:0061`), so a reviewer sees one person
on both sides at a glance. `tests/db/suppressions.test.ts` asserts the equality
rather than describing it.

**And implementing it found that `created_by` had no writer at all** — `M:0060`
added the column and nothing set it, which is D110's instance 2 inside the phase
that named it. It is now a column DEFAULT rather than a line in the server
action, for this phase's own reason one surface over: a predicate in the caller
is a predicate the next caller forgets.

The card's third line is unchanged and is now exactly right: **only an
administrator can lift it, and lifting is logged.** That is the whole of the
safeguard, stated.

**Behandlingsgrunnlag moved cards, not screens.** D111(c) put it at the bottom of
`AudiencePanel`; the bundle draws it in a two-column grid BESIDE the
Reservasjonsliste (V2:2595–2621), which could not be built until that card
existed. It now is, and the pair is the grid the bundle draws — with
`minmax(min(300px,100%),1fr)` per RESPONSIVE.md global rule 7 rather than a bare
300px floor.

### D113 — the security-copy sweep: three promises, and the gate that could not see one of them

**Not a phase.** Tor: *«enumerate it as a list inside whichever phase you are already
in. Do not open a phase for it, and do not send me the list for a decision — if most
promises hold it is a defect list you handle, and if most do not, tell me then.»*
**Most hold.** So this is the defect list, and it stays here.

**What was swept.** `messages/no.json` carries 1728 strings. 235 use
security-or-capability vocabulary; narrowing to *promise-shaped sentences* — a
declarative claim of at least 25 characters, not a button label — leaves **105
shipped strings**, which is the load-bearing set. They collapse to about forty
distinct propositions, because the anonymity promise alone is said eleven ways.
Every one was checked against the running database or the shipped call site, not
against the plan.

    python3 - <<'PY'   # the enumeration, kept so the number is re-derivable
    import json, re
    m = json.load(open('messages/no.json')); flat = {}
    def walk(o, p=''):
        for k, v in o.items():
            n = f"{p}.{k}" if p else k
            walk(v, n) if isinstance(v, dict) else flat.setdefault(n, v)
    walk(m)
    core = re.compile(r'anonym|ikke kobl|kan ikke se|ingen kan|aldri|slettes automatisk|'
                      r'slettes etter|krypter|terskel|minst \d| \d+ svar|slås sammen|logges|'
                      r'uigjenkall|permanent|endelig|kan ikke endre|oppbevar|personopplysning|'
                      r'GDPR|tilgang til|har ikke tilgang|sikker', re.I)
    print(len([1 for v in flat.values() if isinstance(v, str) and core.search(v) and len(v) >= 25]))
    PY

**102 of 105 hold, and they hold in the database rather than in the UI.** Spot
checks, each with the command that produced it: the anonymity CHECK is
`responses_anonymous_unlinked`, and `responses` has no IP or user-agent column to
strip (`information_schema.columns` lists eight, none of them either);
`submitted_hour` is truncated in `public.submit_response`, the sole write path;
`answers` and `responses` carry **zero** RLS policies, so «aldri enkeltsvar» is
structural rather than enforced; `audit_no_update` is `BEFORE DELETE OR UPDATE`,
so «revisjonslogg som ikke kan endres» is exact; `get_themes` gates on
`count(distinct response_id) >= v_k`, which is precisely what
`reports.noteThemes` claims — *«terskelen gjelder antall personer, ikke antall
treff»*; `get_heatmap` takes `max(app.k_for(...))` over the selection, which is
the «strengeste terskel» the dashboard promises; `suppressions` allows INSERT and
DELETE to `administrator` only, so «bare en administrator kan oppheve den» holds.

**And one of them was nearly reported as broken.** `builder.lockedNotice` —
*«Spørsmålene kan ikke endres nå»* — appeared unenforced: no trigger on
`questions`, no status test in `app.can_edit_survey`. Both true and both
irrelevant. **There is no `questions` table**; it is `survey_questions`, and
`sq_freeze_after_send` covers `INSERT OR DELETE OR UPDATE` on it. Impersonating a
real administrator through the RLS path PostgREST uses, the update raised
`survey … has an open or closed round; its questions are frozen`. **Absence in a
query I wrote is not absence in the database** — CLAUDE.md's orientation rule, in
miniature, caught by probing rather than by concluding.

---

#### 1 · «aldri under 3» — false, on the panel where the number is set

`admin.pMinResponsesDesc` shipped as *«Standard {k} svar for nye undersøkelser ·
**aldri under 3** · lovpålagte maler har egen terskel»*. The floor is **2**:

    CHECK ((k_threshold >= 2) OR (respondent_kind = 'organisation'))   -- surveys_k_threshold_floor
    CHECK ((default_k_threshold >= 2) AND (default_k_threshold <= 10)) -- organizations_…_range

An over-promise, which is the dangerous direction — and it sat one divider above
`admin.orgThresholdNote`, which says «aldri settes under to» **on the same
panel**. `PrivacyPanel.tsx:78` and `:212`. Fixed in both languages.

The number is nobody's invention from a bundle: no handoff contains it. It is
residue of Q55, which set the floor at three, and Q91, which moved it to two —
the same clause family `docs/LEGAL_DRAFTS.md` already records as having carried
two false numbers. **This is its third.**

#### 2 · why `verify:copy` did not catch it — a mute of a new kind

`scripts/verify/threshold-copy.ts` exists for exactly this string, and passed
CLEAN over it for two phases. Two things hid it, and they are different failures:

**(a) The check reasoned about the STRING; the claim lives in a CLAUSE.** Its
premise, in its own words, was *«a string that INTERPOLATES cannot assert a fixed
number: the value comes from the data, so it is true by construction»*, and on
that basis `if (interpolates) continue` skipped the whole string. But
`admin.pMinResponsesDesc` interpolates in one clause and asserts a fixed number
in the next. The interpolation makes the *first* clause true by construction and
says nothing whatever about the second. **This is the file's own opening lesson
turned back on itself** — *THE DERIVATION MUST DESCRIBE THE PROPERTY, NOT A
SYMPTOM OF IT*. «The string interpolates» is a symptom; the property is
per-clause. It now strips ICU placeholders and tests what is left.

**(b) The allowlist entry read `'admin.pMinResponsesDesc': 'interpolates {k}'`**
— a reason **true about one clause and read as true about the string**. **This is
an ADDITION to D110's fourth case rather than an instance of it**, and it is
recorded there in Tor's words: *state the SCOPE of an allowlist reason, not only
its content — «interpolates {k} in clause 1, asserts nothing in clause 2» would
have failed review on sight.* The file already warns that «an entry without a
reason is a place a finding goes to be forgotten»; a **partial** reason does the
same job more convincingly, because a reviewer checks whether a reason is TRUE,
not whether it is SUFFICIENT — so an accurate half-reason is *confirmed* by the
reading that should have caught it.

The stale-entry check is restated as the property rather than the symptom: an
entry whose reason claims interpolation is honest only if, *with the placeholders
removed, nothing is left asserting*. One rule now covers both ways such an entry
rots — the placeholder removed entirely, and a fixed number added beside one that
stayed.

**The repaired check earned itself on its first run, which is the argument for
repairing it rather than deleting the string.** It immediately surfaced two more
entries with the same defect. `admin.anonExplainer`'s reason mentioned only the
interpolation, not its fixed «to». And `admin.orgThresholdNote` was allowed
because *«the «tre» in it is the CHECK floor, which is fixed»* — **the floor has
been 2 since Q91, and the string itself was corrected then.** Only the reason
stayed at three, for two phases, saying the wrong thing about a string that was
right. Both reasons now name `surveys_k_threshold_floor`, in the form the
`legal.*` entries were already written in.

`results.insightSplit` also became visible and is a true negative — its «1–2» are
scale values, the same reason `builder.cLavDesc` already carries. Allowlisted
with it. 17 entries, gate CLEAN.

**One honest cost, stated rather than discovered later.** The rule fires on any
reason that *claims interpolation as its justification* while a fixed number
survives stripping. It cannot read prose, so the pressure it applies is to stop
leading with «interpolates» and name the constraint instead. Three reasons were
rewritten that way. A reason that never mentions interpolation is not checked by
this rule at all — that is a limit of the check, not a gap it closed.

#### 3 · «Summerte tall beholdes» — true only by luck, and the bundle wrote it

`admin.retentionNoteMonths` shipped as *«Rådata slettes etter {months} måneder.
**Summerte tall beholdes.**»*, directly under the retention selector. It is the
bundle's own sentence, identically in all three handoffs
(`HeiTuva.dc.html:5602`, v1 `:3951`, legacy `:3271`) — so this is a
bundle-versus-reality conflict, and CLAUDE.md settles it: *this file wins on
security, the bundle wins on visuals*. Q55 is the standing precedent for exactly
this move.

`app.apply_retention` deletes `answers` then `responses` for any org with
`retention_months > 0`. Nothing snapshots first. Aggregates survive **only** where
a `result_snapshots` row already exists. Measured on the seeded database:

    surveys_with_responses_and_no_snapshot | surveys_with_responses
    -------------------------------------- + ----------------------
                                        34 |                     36

Confirmed end to end rather than reasoned: ageing one seeded survey's responses
past its 12-month retention and running `app.apply_retention()` left **0
responses and 0 answers** and 5 surviving snapshots — the mechanism works, and it
only works where somebody already fired it.

**And the reachable paths do not fire it.** Three live functions close a round:

    app.close_rounds_with_survey | NO SNAPSHOT   (trigger, survey status change)
    app.run_due_schedules        | NO SNAPSHOT   (cron, hourly)
    public.close_round           | SNAPSHOTS

`M:0023` added the snapshot to `close_round`, and its header names this exact
failure — *«the retention job deletes answers on schedule, and a trend line loses
its earlier points because nothing ever wrote them down»*. **Two of the three
closers bypass the fix, and one of them is the cron path that creates the
multi-round case in the first place.** `close_round` itself has no UI caller
(`grep -rn "close_round" app lib` → nothing), so the only snapshot a user can
reach today is `publish_duty → snapshot_report`, from
`app/(app)/rapporter/actions.ts:209`.

The copy now says what is true: *«Tall som allerede er frosset i en publisert
rapport, beholdes.»* **The behaviour gap is logged for V2-5, not patched here**,
and the reason is a trap worth writing down: `snapshot_results` checks
`app.can_edit_survey`, which is false for the cron role, so calling it from
`run_due_schedules` returns `forbidden` and writes nothing — **a fix that looks
applied and is a no-op**, which is the same mute this deviation is otherwise
about. The trigger path carries V2-3b's hazard instead: writing a snapshot during
an organisation cascade recreates data under a row being erased. Both need
negative tests, and V2-4 has had its build.

#### 4 · this phase's third instance of one class

`weekly_digest` — a flag with no call site, written into a user-facing promise —
was found while fixing that exact class of defect. The sweep found two more of
the same shape: `close_round`, which snapshots and which nothing calls; and
`snapshot_results`, reachable only through it and through a scheduler that lacks
the rights to use it. **A mechanism that exists in the schema, is correct, is
tested, and has no live caller reads in review exactly like a working feature** —
and the user-facing sentence above it is what makes the absence load-bearing.
Three instances in one phase is what makes it a class rather than an incident.

#### 5 · two claims that are false and not yet shipped — carried forward, not fixed

Neither surface is built, so neither is a defect today; both would become one the
moment its phase renders the bundle's copy as drawn.

- **`liveGuard` (V2:6147, V2-9's live view).** The block V2:6130–6190 contains
  exactly one occurrence of any threshold concept — `liveGuard`'s own promise.
  `liveStage.counter` is `String(sv.responses.length) + " svar"` at V2:6169,
  unconditional, and `liveRevealed` at V2:6175 is a free client-side toggle. The
  prototype's live screen promises a gate it does not have.
- **«Grupper under terskelen slås sammen i rapporten» (V2:4227, V2-6 help).**
  `app.suppress_partition` **suppresses**; it does not merge. Sub-threshold rows
  become `{n: null, avg: null, suppressed: true}`, and a second pass hides the
  smallest visible row when exactly one is hidden — which
  `reports.suppressedNote` already describes correctly. The help text describes a
  different algorithm. **Wrong in the cautious direction, which is D109's class:
  merging would disclose less than suppressing does, so the copy under-sells the
  protection.** Just as visible in review, and just as wrong.

- **`legal.dpa9P`** says a signed DPA *«finnes under Administrasjon → Personvern
  og GDPR → Dokumentasjon»*. The surface renders four rows with a
  not-yet-uploaded meta line and `docsComing` — *«Dokumentopplasting kommer i en
  senere fase»*. The text is held behind `legal.draftNotice` (*«UTKAST — denne
  teksten er ikke gjennomgått av jurist ennå»*), so this is a **draft
  inaccuracy**, not a shipped false promise, and it goes to
  `docs/LEGAL_DRAFTS.md` by the route V2-2 established rather than into a code
  fix. Recorded there.

### D114 — Q72 makes two drawn sentences false, and they change on the decision's authority

**Accepted.** DECISIONS **Q72 CONFIRMED**; **D103 is the precedent** — the first time a
phase changed bundle copy because a decision made the drawn sentence untrue on its own
screen. The mechanism has now been used twice.

The v2 bundle draws the task generator as fired by findings:

    V2:4239  ["Vurder risiko og sett tiltak",
              "Funn under terskel blir oppgaver med ansvarlig og frist, med hjemmel synlig."]
    V2:4270  ["Oppgaven opprettes",
              "Funn under terskel blir oppgave automatisk, med kilde og hjemmel."]

**Both are false as of V2-5, and they were false in the useful direction — they describe a
product that would leak.** Q72's finding is that «a finding below threshold» as a trigger
still discloses by elimination: groups A(12), B(9), C(4), with A and B visible and healthy,
tells the reader C scored badly. Wrapping the wording does not help, because the PREDICATE
is over a gated value. The trigger is now

> **this survey has an audience group whose SIZE is below `app.k_for(survey)`**

— a count of people, which Q28 permits, and a property of the audience rather than of the
responses.

**Neither string is shipped.** Both are help-article content, which is **V2-6's** scope, so
this entry is the instruction for the phase that writes them rather than a correction to
something live. The corrected sense: a task is created when a survey has groups that will
never get their own results, and the duty applies regardless of what those groups answered.
`tests/db/blind-spots.test.ts` test 2 is what holds it — a task IS produced when every group
scores 5 of 5, and 2b requires none when every group reaches k however badly they score.

**And the cost is recorded rather than left to be rediscovered as a defect:** the task
appears more often than a findings-triggered one would, including when nothing is wrong.
That is tolerable noise — it points at a real blind spot every time, and an employer cannot
know a sub-threshold group is fine either.

### D115 — `tasks.law_ref` is a key, and the schema is what enforced it

**Not a deviation from the bundle — a note about which control did the work**, logged
because the next author will otherwise assume it was review.

`M:0070`'s generator wrote `duty_definitions.law` — «Arbeidsmiljøloven § 4-3 ·
internkontroll» — into `tasks.law_ref`, and the insert failed on `tasks_law_ref_fkey`.
The column is a **foreign key to `duty_definitions(key)`**; the display text is resolved from
the registry at render time, which V2-4's Oppgaver page already does
(`app/(app)/oppgaver/page.tsx:61,68,78`).

**Q70's data-not-code rule was enforced by a constraint rather than by a reviewer**, and
that is the good direction: writing Norwegian into that column is exactly what it refuses,
so a fifth statutory duty stays a row rather than becoming a translation task. Recorded
because the mistake was mine and the catch was structural — the opposite of the shape
D110 keeps finding, where a green gate hides a real gap.

### D116 — the help centre's contact tab: four channels and a status panel that do not exist

**Accepted.** DECISIONS **Q74 DEFAULTED** (no forum); the rest is CLAUDE.md's «never
fabricate data in the UI» applied to a screen rather than to a value.

The bundle's contact tab draws three things beside the message form:

    V2:5147  contactRows: Chat («Svarer innen noen minutter i arbeidstiden», Man–fre 08–16),
             E-post (hjelp@heituva.no, «svar innen én arbeidsdag»), Telefon (+47 21 00 40 60,
             Man–fre 09–15), Rådgiver («Egen kontaktperson på Bedrift-planen»)
    V2:5161  statusRows: «Undersøkelser og svar · Normal drift», «E-post og SMS · Normal drift»,
             «Integrasjoner · Planlagt vedlikehold 12. sep»
    V2:5158  onContactSend: setState({ contactSent: "Sendt. Vi svarer på tuva@…" }), 2.6s timer

**None of the four channels exists**, and there is no status source of any kind, so
«Planlagt vedlikehold 12. sep» is an invented date **on the panel a user checks when they
think something is broken**. That is the worst place in the product for a fake value: it is
consulted precisely when trust is already in question, and it is indistinguishable from a
real one.

**And `onContactSend` is a confirmation for something that never happened.** Shipping it
would be worse than shipping no form at all — a user who believes they have reported a
problem stops reporting it.

**What ships.** The form writes a real row (`support_messages`, `M:0074`), and the two
right-hand cards keep their drawing and say what is true: «Chat, telefon og fast rådgiver
er ikke satt opp ennå. Meldingen over er kanalen som finnes» and «Vi publiserer ikke
driftsstatus ennå». Q26's stream panel is the precedent — the absence is left visible
rather than answered with something else, and `admin.mgPopulationsUnavailable` is the same
move inside this codebase.

**Reversal condition, named so this row cannot silently settle it:** when a support channel
or a status page actually exists, these cards render it. The deviation is about the absence,
not about the design.

### D117 — ten sentences in the twelve help articles were false, and this is where they shipped

**Accepted, and the list is the point.** V2-4's security-copy sweep checked the 105
promise-shaped strings that were **already shipped**; these twelve articles were not, and
they carried two of that sweep's forward notes. `scripts/seed-help.ts` reads the articles out
of the bundle and rewrites ten sentences on the way through, **failing if any of them stops
matching** — a correction that silently matches nothing would leave the bundle's copy in the
one surface a confused user reads to learn how the product works.

| Sentence | Measured against | Why it is false |
|---|---|---|
| «Funn under terskel blir oppgaver med ansvarlig og frist» (V2:4239) | `app.generate_blind_spot_tasks` | Q72: the trigger is audience size. **D114** |
| «Funn under terskel blir oppgave automatisk» (V2:4270) | same | Q72. **D114** |
| mock row «Under terskel · krever tiltak» | same | Q72, in four words |
| «Grupper under terskelen **slås sammen** i rapporten» (V2:4227) | `app.suppress_partition` | It **suppresses** — `{n: null, avg: null, suppressed: true}` plus the second-smallest when exactly one is hidden. **D109's class: wrong in the cautious direction**, and it contradicted `reports.suppressedNote`, which describes the real behaviour |
| «**Fire** roller styrer hva folk ser» | `app.member_role` | Three values. **D106** |
| «Verneombud har egen rolle» + its mock row | `duty_signers` | A signature, not an access level. A reader given a role that does not exist looks for it under Brukere and does not find it |
| «Over frist varsles eieren i **Teams**» | the mail worker and `cron.job` | **Q71: Teams is not built — the THIRD appearance of this claim**, after V2:5198 and V2:2206, which V2-4 corrected. `weekly_digest` was the same shape one field over |
| «Ved synk holdes gruppene oppdatert automatisk» | `feature_flags` | `entra_sync` and `google_sync` are both OFF |
| «**CSV og Excel** forventer kolonnene…» | the importer | **Q62: `.xlsx` is refused**, so the sentence named a format the product declines |

`tests/db/help.test.ts` asserts none of these phrases is in any article in either language,
so a re-seed from a newer bundle that reinstates one fails rather than ships.

**One article's SUBJECT does not exist either.** «Koble til HR- og lønnssystem» describes
`hr_sync`, which is a disabled flag. Deleting it would leave a reader unable to tell «not
documented» from «not built», so the article ships with `requires_flag` set and renders an
explicit line saying the feature is not switched on yet.

### D118 — «Svar selv (test)» has pointed at a route that did not exist since Phase 2

**Closed by V2-7, and recorded because of how long it stood.** `SurveyRow.tsx:287` links every
survey's row menu to `/undersokelser/<id>/test`, and that route **was not built** until this
phase. It was not silently broken — `tests/routes.manifest.ts` carried it in `PENDING_ROUTES`
with the note *«Svar selv» — the respondent flow*, so the 404 check knew about it and the
prefetch guard did not count it. **Known, tracked, and shipped as a menu item a user could
click for four phases.**

That is the honest shape of it: the apparatus did its job and the gap still reached the
product, because a pending route is a decision to ship a dead link rather than a defect the
gate can catch. Worth naming so the next `PENDING_ROUTES` entry is read as a debt with an
owner rather than as coverage.

### D119 — test mode ships two entry points and the CTA is hidden on a draft

**Accepted.** The bundle has two: the Builder's preview pane (V2:894, «▷ Test undersøkelsen»)
and the surveys row menu (V2:1049, «Svar selv (test)»). Both ship, and both reach the same
route.

**The Builder's CTA is hidden on an unsent survey**, because `mint_test_token` needs an open
round and a draft has none. This is V2-4's rule — *a UI must not offer an action it knows the
database will refuse* — and it is the reason the capture reaches the screen through the row
menu instead: the seeded draft the Builder harness opens is exactly the case where the CTA is
correctly absent.

**The row menu's entry is NOT hidden**, and that is deliberate rather than an oversight: a
menu is a list of what exists, and the destination explains itself — «Undersøkelsen er ikke
sendt ennå, så det finnes ingen runde å teste mot». Hiding it there would leave a reader
unable to tell «cannot test this» from «cannot test at all», which is the distinction D116
and `admin.mgPopulationsUnavailable` both preserve. **The difference from V2-4's hidden
advance button is that the refusal here has a sentence and a way back; there it had a
database error code.**

### D120 — Bruksområder: every question count the bundle states is wrong

**Accepted, and the correction is a derivation rather than nine new numbers.**
`HeiTuva Bruksomrader.dc.html` hard-codes a question count and a reading time per use case.
Measured against the seeded packs, **all nine are false**:

| use case | page claims | pack has |
|---|---|---|
| `puls` | 5 | 4 (`ukentlig-puls`) |
| `medarbeider` | 38 | **no pack at all** |
| `psykososial` | 38 | 7 (`psykososial-kartlegging`) |
| `trakassering` | 16 | 5 (`trakassering-ytringsklima`) |
| `likestilling` | 21 | 6 (`likestilling-deltid`) |
| `aktsomhet` | 27 | 6 (`leverandor-apenhetsloven`) |
| `onboarding` | 8 | 4 (`oppstartssjekk`) |
| `kunde` | 6 | 5 (`csat`) |
| `exit` | 7 | 5 (`sluttsamtale`) |

This is a **public** page, so it is D73 — *no public page claims a capability the product
does not have* — and it is CLAUDE.md's *never fabricate data in the UI* nine times over, in
the exact form the rule warns about: **a number indistinguishable in review from a real
one.** Replacing them with nine corrected numbers would only move the staleness, so the page
**derives the count from `template_packs.questions`**. A pack that gains a question updates
the page with nobody editing it, and `tests/db/use-cases-page.test.ts` fails if a count is
ever written back into the copy.

**The plan's «all nine already seeded as packs» was one short.** `medarbeider` has no pack.
It renders with no count and an explicit line saying the template is not finished, rather
than inheriting the bundle's 38 — «render the real state, render nothing, or render the
design's empty/unknown treatment».

### D121 — Q56's struck links were never built, and the Bruksområder link now exists

**Accepted.** Q56 CONFIRMED: strike the «Se detaljer» links on the splash's ranked list,
which point at `HeiTuva Lovpalagt.dc.html#<page>` — a prototype file with no product behind
it. **The ranked list was never built at all**, so `r.hasPage` is not merely never true; the
whole block is absent, and the deviation is satisfied by an absence rather than by a
condition. Recorded so a later phase building that block knows the links are struck by
decision rather than forgotten.

Going the other way: the splash's use-case section now carries **«Se alle ni bruksområder
→»**, and it was added **with** the page it points at. D118 is the reason that sentence is
worth writing down — a menu item pointed at `/undersokelser/<id>/test` for four phases
before the route existed.

### D122 — six more false sentences in the Bruksområder copy

**Accepted.** The same sweep V2-6 ran over the help articles, applied to this copy before it
shipped. Each was measured against the running database.

| Sentence | Why it is false |
|---|---|
| «Anonymt, terskel 5» ×3 | **Q55's class, and this phase's DoD names it.** The threshold is the organisation's; a public page stating 5 is the categorical five V2-0 corrected |
| «Vises fra 5 svar» | Same, a fourth time |
| «Enheter under terskelen **slås sammen** i rapporten» | `app.suppress_partition` suppresses. D109's cautious direction, and V2-6 corrected the same sentence in a help article |
| «Funn under terskel, med hjemmel» | Q72: the trigger is audience size. Third place this sentence has been found |
| «Anonymt, **kjønnsdelt** rapport» | **There is no gender field anywhere in the schema** — `segment_fields` carries group, land, member_since, role, startdato, status, stillingsprosent. The product cannot split a report by gender |
| «frisvar **gjennomgås manuelt**» | No manual free-text review exists. `quote_candidates` is an editor choosing quotes for a report, which is what the replacement says |

**One fixed number stays and is checked rather than allowed:** «Forsterket, terskel 8» for
harassment. `template_packs.policy` for `trakassering-ytringsklima` carries
`{"k_threshold": 8, "locked": true}`, so the 8 is a fact about the template rather than a
promise about the gate — and the test asserts it against that row rather than exempting the
string by name.

### D123 — `verify:copy` could not see «åtte», and 8 is the sensitive-topic threshold

**Found by hand in V2-8, and it is D110's fourth case arriving as a regex flag.**

The gate looks for a numeral near a threshold word, with the Norwegian numerals written as
`\b(?:\d{1,2}|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti)\b`. **JavaScript's `\b` is defined on
the ASCII word class**, so `å` is a NON-word character. In «terskelen til åtte» the character
before `å` is a space — also non-word — so there is no boundary there and `\båtte\b` never
matches.

    node -e 'console.log(/\båtte\b/iu.test("terskelen til åtte"))'   // false
    node -e 'console.log(/\bfem\b/iu.test("terskel fem svar"))'      // true

**The gate has been blind to one of the ten numerals it lists since it was written**, and it
is not a harmless one: **8 is the threshold the statutory harassment pack locks**, which
makes it the numeral most likely to appear beside a threshold word in copy where it matters.
Every other numeral in both lists is ASCII, so the gate was right nine times out of ten and
silent on the tenth — which is exactly why it survived four phases of green.

Fixed with a boundary that knows about letters rather than about ASCII —
`(?<![\p{L}\d])` … `(?![\p{L}\d])` under the `u` flag — and `terskel\w*` becomes
`terskel\p{L}*` for the same reason. **The repaired gate immediately surfaced the string it
had been blind to**, which is the second time in this run that repairing a check earned
itself on its first run (V2-4's placeholder premise was the first).

**What it did NOT find:** nothing else. The sweep over both message files after the fix
returned four hits, all four the same harassment threshold in two languages, and all four are
the locked pack value. So the blindness cost nothing in the end — but it cost nothing by
luck, and the entry records that distinction rather than the outcome.

### D124 — five more capability claims in the Bruksområder copy, found in the FIX PASS

**Accepted, and how they were found is the point.** D122's six came out of a regex sweep over
the copy before it shipped. These five came out of **opening the capture and reading the tip
box** — the sweep's pattern did not contain «egen rolle» or «HR-systemet», so it could not
have found them.

| Sentence | Why it is false |
|---|---|
| «Verneombudet har **egen rolle i HeiTuva** og **godkjenner spørsmålene** før utsending» | Two claims in one line: `app.member_role` has three values (D106, third appearance), and **there is no approval step before a send** |
| «Hent tallene aggregert per stillingsgruppe **under Integrasjoner**» | There is no Integrasjoner screen, and `hr_sync` is a `feature_flags` row that is OFF |
| «Slå på automatisk oppfølging med **eskalering til innkjøpsansvarlig**» | Reminders exist (`app.enqueue_reminders`); escalation to a named person does not |
| «**Sendes automatisk etter startdatoen**» / «**Koble til HR-systemet**, så sendes sjekken automatisk» / «Startdato i HR-systemet» | Nothing is triggered by a start date. The recurrence machinery (Q20/Q22) is what exists, and the copy now says that |
| «**Sluttdato i HR-systemet**» | Same flag, same absence |

`tests/db/use-cases-page.test.ts` now bans all eleven phrases, in one list with a reason each.

**One thing the fix taught the test.** My first replacement read «Verneombudet er **ikke** en
egen rolle i HeiTuva», and the check failed on it — correctly by its own rule and wrongly
about the sentence, because **a substring check cannot read negation**. The sentence was
reworded rather than the check exempted: a check taught to ignore «ikke» is one a future
false claim could hide behind by adding a word.

**And the count is the finding under the findings.** Across V2-6 and V2-8, **twenty-one
sentences in bundle copy were false against the running product** — ten in the help articles,
eleven here. None was caught by a gate; all were caught by measuring a claim against the
database, one at a time. The gates protect the schema and the data. **Nothing mechanical
protects prose, and prose is what a user reads to decide whether to trust the numbers.**

---

### D115 — a catch-all is a decision to make one class of failure invisible, and it is only sound if you know which class

**2026-09-09, carried from Tor after the V2-5..V2-8 block. This is ONE finding, not two.**

I had logged the five-fold `send_round` patch and the handler that hid it as separate items.
They are the same item, and the general form is now in `CLAUDE.md` beside the
referential-maintenance rule:

> **A catch-all is not a safety measure, it is a decision to make one class of failure
> invisible, and it is only sound if you know which class.**

**What actually happened, stated in the form that generalises.** I wrote

```sql
exception when others then null;
```

around `app.generate_blind_spot_tasks(p_survey)` in `M:0070`, and I knew exactly what it was
for — the comment beside it said so: *the AI prompt row may not be seeded*. What landed
inside it was a different class entirely: **the call site was wrong.** `M:0070` had patched
`send_round` with `replace(src, '  return jsonb_build_object(', …)`, and `replace()` replaces
every occurrence — there are five, four of them error paths where `v_round` is not yet
selected. The handler swallowed all five failures exactly as designed.

**The defence did not fail. It worked, on the wrong thing.** That is the whole finding, and
it is why «add a catch-all to be safe» is not a safety argument: safety would require knowing
that the class you named is the only class that can arrive there, and you almost never do.

**The fix, in two halves, of which only the second is durable.**

1. `M:0072` strips the four wrong insertions, asserts the success return is unique before
   replacing (so a future edit that adds a second one fails the migration rather than
   silently patching twice), and narrows the handler to the class it was actually for:
   `when unique_violation or foreign_key_violation`. That is a decision about a class,
   written down.
2. **`tests/db/catalogue-invariants.test.ts` asserts there is no `when others` anywhere in
   `app` or `public`.** This is the half that matters — half 1 fixes one function, half 2
   stops the next one.

**And the test is CATALOGUE-DERIVED, not a list — which is the point, not a detail.** The
assertion I first wrote was scoped to `send_round`, i.e. to the one function I already knew
about. **That is the same shape as the defence it was written about**: a rule aimed at the
case you have in mind, blind to the case that arrives. It now sweeps `pg_proc` across both
schemas. The current answer is **zero**, so there is no allowlist at all, which is the
strongest form this assertion can take, and a second test asserts the sweep enumerates >80
functions — because an empty-set claim is also what a broken query returns.

**The recorded LIMIT.** The check reads `when others`, which is how PL/pgSQL spells a
catch-all. A handler listing thirty conditions would be one in spirit and would pass. That is
a bound on the test, written down, not a gap it hides.

### THE SECOND MECHANISM — the same failure through PRIVILEGES, not a handler

**Added 2026-09-09 (Tor), during V2-9, so this entry is not read as being about
exception handlers.** It is not. It is about a defence aimed at a class you named, when
what arrives belongs to a different one — and an `exception when others` is only the
first mechanism that shape has used here.

`M:0079` and `M:0080` each ended with what every migration in this repository ends with:

```sql
revoke all on function public.close_live_session(uuid) from public;
grant  execute on function public.close_live_session(uuid) to authenticated;
```

Gate 5a3 then reported `close_live_session` and `live_cloud` as **anon
execute=GRANTED**. The revoke was not wrong, was not misspelt, and did not fail — it
revoked the **PUBLIC pseudo-role**, while Supabase carries `ALTER DEFAULT PRIVILEGES`
granting EXECUTE on new functions in `public` to the `anon` role **in its own name**. A
grant held by `anon` directly is untouched by a revoke aimed at PUBLIC.

**A defence working exactly as designed, on the wrong holder** — which is the same
sentence as «on the wrong thing», one mechanism over. Fixed in `M:0082` by naming the
role.

**And it is the third time the ask-the-catalogue distinction has saved something.**
The rule those three share: *a migration says what you intended; the catalogue says
what is true.*

| | What was read | What it missed |
|---|---|---|
| `M:0070`, D115 above | the migration's `replace()` anchor | five patched call sites, hidden by my own handler |
| `verify:copy`, D113 | the string as written | a claim living in a second clause |
| `M:0079`/`M:0080`, here | the revoke as written | a grant held by a different role |

So the generalisation is not «avoid `when others`». It is: **a defence is only as good as
the enumeration it was aimed at, and the only trustworthy enumeration is the catalogue's.**

---

**The same reasoning applies outside SQL,** and the worked example is in this codebase:
`lib/questions/quality.ts`'s `toJsRegex` returns `null` on a pattern it cannot compile, which
would silently disable a quality rule for ever. It must not throw — it runs on every keystroke
in the Builder — so the swallow stays, and it is acceptable **only** because the same test
file compiles every seeded pattern from the catalogue and asserts none of them lands there.

---

### D116 — `\b` is ASCII-only, and the direction of the error depends on which side the Norwegian letter is on

**2026-09-09, carried from Tor: «check whether `\b` appears against Norwegian anywhere else
in the harness. The flag is wrong everywhere it appears.»**

D113 found `verify:copy` blind to «åtte» because JavaScript's `\b` is an ASCII word boundary:
`å` is a non-word character to it, so `\båtte\b` never matches after a space. Tor's reading
of that — that «åtte» being the blind one is the kind of coincidence that is not one, because
**the rare numeral is the one a threshold uses** — came with an instruction to audit the rest
of the harness.

**The audit.** `grep -rn '\\b' scripts/verify/*.ts tests/**/*.ts lib/**/*.ts` returns exactly
two more sites, and both are the same construction:

| Site | Code |
|---|---|
| `lib/questions/quality.ts:40` | `pattern.replace(/\\m/g, '\\b').replace(/\\M/g, '\\b')` |
| `lib/questions/policy-warnings.ts:38` | identical, a verbatim copy |

Both translate Postgres's `\m`/`\M` word boundaries into JavaScript's `\b`, and both run
against **Norwegian a customer types** — the three seeded `quality_rules` patterns:
`\m(og|eller)\M`, `\m(ikke|aldri)\M` and the policy panel's pronoun rule. Tor's prediction
holds: the flag is wrong at every site it appears.

**What measurement added that the prediction did not: the two sites fail in OPPOSITE
DIRECTIONS, and which one you get is decided by where the non-ASCII letter sits.**

- **Non-ASCII in the PATTERN** (`\båtte\b`) — the boundary can never hold, so the rule
  matches **nothing**. Silent. That was D113, and it is the dangerous direction.
- **Non-ASCII in the DATA**, which is these two sites — every alternative here is ASCII
  (`du`, `og`, `ikke`), so ASCII-`\b` is *strictly more permissive* than the correct boundary
  and the rule can only ever **over-match**: a pronoun warning on a word that merely contains
  `du` beside an `å`. Loud.

That is a proof, not an observation: since every alternative begins and ends with an ASCII
word character, `{c : c ∉ ASCII-word} ⊇ {c : c ∉ Unicode-word}`, so the ASCII match set
contains the correct one. A miss is impossible at these two sites; a false positive is the
only available failure.

**Measured before fixing, over every Norwegian string this repo holds** — the question bank
and its translations, `ui_messages`, the help articles, all of `messages/no.json`, and the
prose of all three design bundles:

```
corpus: 2227 strings, 96634 chars of Norwegian
double_barreled  blind 0   false-positive 0
negation         blind 0   false-positive 0
policy_pronoun   blind 0   false-positive 0
```

**Zero divergence.** So this repairs a defect that had not yet fired on any shipped copy —
said plainly rather than dressed up as a near miss. It is fixed anyway, because the corpus
these rules actually run against is a question a customer has not written yet.

**The fix, and the deduplication that is part of it.** The boundary becomes
`(?<![\p{L}\p{N}_])` … `(?![\p{L}\p{N}_])` with the `u` flag, and **`toJsRegex` now exists
once**: exported from `quality.ts`, imported by `policy-warnings.ts`, which had carried a
verbatim copy. Two copies of one rule is how one of them gets repaired and the other is left
behind — and that, not the boundary, is what would have produced the next instance of this.

`tests/db/catalogue-invariants.test.ts` asserts the repaired boundary against a rule read
from the catalogue (so a re-seed is checked too): `du` in «trives du i jobben» still matches,
`du` inside `pådu` no longer does.

---

### D125 — the quiz tiles' contrast, measured: one of the four does not pass, and it is the label that sits on it

**V2-10, Q83 (DEFAULT TAKEN: new named tokens with a stated role).** The default is taken as
classified and the tokens are in — `--qz1…--qz4`, `app/globals.css` and `tailwind.config.ts`.
**What the default also required was that the contrast be MEASURED and recorded, and the
measurement is the finding.**

`--sf` (`#FFFDF6`) on each tile, WCAG 2.1 relative luminance:

| Token | Hex | Ratio | Verdict |
|---|---|---|---|
| `--qz1` | `#F26B21` | **2.99 : 1** | **fails AA at every size** — below even the 3:1 large-text floor |
| `--qz2` | `#2F6FB0` | 5.13 : 1 | passes AA for normal text |
| `--qz3` | `#2F7D4F` | 4.95 : 1 | passes AA for normal text |
| `--qz4` | `#B0343C` | 6.06 : 1 | passes AA for normal text |

**Q83's own draft said `#F26B21` is «~3:1, large text only».** Measured, it is **2.99**, which
is on the other side of that line — and the line does not apply anyway, which is the second
half of the finding.

**IT IS NOT AN ICON. IT IS THE ANSWER.** I first read the tile as a coloured square with a
decorative glyph, which would put it under WCAG 1.4.11 (non-text contrast, 3:1) and make 2.99
a rounding argument. Reading the markup rather than the colour list says otherwise —
**V2:3401-3405**: the `<button>` has `background: {{ c.tileBd }}`… `color: {{ c.tileFg }}` and
carries **two** children, an `aria-hidden` icon **and**

```html
<span style="flex:1;min-width:0;line-height:1.3">{{ c.label }}</span>
```

at `font-size:15px; font-weight:700`. So `#FFFDF6` on `#F26B21` is the **option label** — the
text a respondent has to read in order to answer. 15px bold is 11.25pt, which is *normal* text
under WCAG (large starts at 14pt bold / 18.66px), so the requirement is **4.5:1** and not 3:1.
**2.99 against 4.5.**

**And this is a respondent surface**, which CLAUDE.md marks pixel-perfect mobile-first at
380–420px — the one class of screen where the person reading it did not choose to be there and
cannot zoom out of the problem.

**THE COLOUR WAS NOT MINE TO CHANGE, SO IT WENT TO TOR — and he changed it.**

> **DECIDED (Tor, 2026-09-09): darken `--qz1` to clear 4.5:1.**

`--qz1` is therefore **NOT the drawn hex**, and it is the only token in this project that is
not. The change is the smallest one that answers the measurement: **hue and saturation are
untouched** — `hsl(21.2, 88.9%)`, the drawn colour's own — and only lightness moves,
**53.9 % → 40.0 %**:

| | Hex | `--sf` on it |
|---|---|---|
| Drawn | `#F26B21` | 2.99 : 1 — fails |
| Shipped | **`#C14B0B`** | **4.82 : 1 — passes AA** |

**40.0 % rather than the 41.4 % that first clears the line.** The minimum passing lightness
gives 4.53:1, three hundredths above the requirement — a number that survives this calculation
and might not survive a different renderer's rounding, and which would leave `--qz1` the
outlier again in a new way. 4.82 sits with the other three (4.95, 5.13, 6.06) instead of just
under them. The other three are the drawn hexes, unchanged.

`tests/unit/quiz-tiles.test.ts` recomputes all four ratios from the CSS rather than from a
list, so a future edit to `globals.css` fails here rather than shipping. **The check is the
property — «every quiz tile carries readable text» — not the four hexes**, which is the
distinction CLAUDE.md's «an enumeration mistaken for a property» section is about: a test
pinning the hexes would pass a fifth tile that fails.

Recorded with the numbers throughout, so the decision was made against a measurement rather
than against «looks fine» — which is the reason Q83 asked for the measurement in the first
place, and the reason the measurement was worth doing after the default had already been
taken.

---

### D129 — a control no bundle draws, for the column that made every group empty

> **Numbered D125 when it was written, and renumbered here.** V2-10 had already taken
> D125 for the quiz tiles' contrast, and I collided with it. `M:0090` and `M:0091` say
> «D125» and «D126» in their comments and are NOT edited: they are applied — to prod as
> well as locally — and CLAUDE.md's rule is that an applied migration is never edited,
> only superseded. So the two column-comment strings on the running database refer to
> the old numbers, and this note is the mapping: **D125 → D129, D126 → D130.** Rewriting
> a comment to tidy a cross-reference would mean a migration whose only purpose is to
> make prose agree, applied to production, for a documentation defect. That is not a
> trade worth making, and an undocumented divergence would have been worse than either.

**S3, 2026-09-09.** `org_members.group_id` had no writer. The audit made it the lead finding
(`A7a-1` / `A7b-1`, found independently by two probes on deliberately different methods), and
the consequence was not subtle: a group could be created and **nobody could ever be put in one**
— every group count 0, the Send screen's group picker targeting an empty set, every per-group
result permanently `insufficient_data`, the blind-spot generator seeing only empty groups. With
every gate green, because `scripts/seed-demo.ts` filled the column and the demo therefore worked.

**The deviation is that no bundle draws the control.** Measured across all three handoffs rather
than assumed:

| Where one would be | What is actually drawn |
|---|---|
| Brukere row | `{{ u.email }} · {{ u.group }}` — text |
| Grupper card | name, count, `ansvarlig {{ g.lead }}`, a progress bar, a × — no member list |
| The two «Gruppe» selects | report and dashboard **filters**, not assignment |
| The prototype's invite handler | assigns the literal string «Uten gruppe» from mock state |

So this is not a control that was missed in implementation; it is one the design never had. CLAUDE.md's
rule for that is the minimal consistent option, logged — not an invented feature.

**Minimal, here, means:** one `select` on the Brukere row, in the same control class as the role
select one line below it, in the row that already displays the group, with an empty option
(«Uten gruppe») so a member can be taken out as well as put in. No membership screen, no bulk
assignment, no second group per person — `org_members.group_id` is scalar and **Q92 turns on its
being so** (k does not compose), which is also why it is a select and not a multi-select.

`setMemberGroup` audits the change as `member.group`, exactly as a role change is audited, because
which group a person is in decides which aggregate they land in.

**And the constraint moved with the writer.** The audit had filed this column's tenancy as a
LIMITATION (`A7a-10`): `tests/db/fk-tenancy.test.ts` «reasons about the tenancy risk of six columns
no code ever writes; every one of its reasons is correct about a case that cannot arise». Adding the
writer makes the case arise. `M:0090` therefore replaces the plain
`(group_id) references groups(id)` with the composite `(group_id, org_id) references
groups(id, org_id) on delete set null (group_id)` — M:0065's shape, for M:0065's reason: null the
reference, keep the tenant. The application check in `setMemberGroup` is not the rule; it is a rule
about one code path, and this project has been bitten three times by reasoning about the path
instead of the state.

**Reversible, and worth naming as such:** if the next handoff draws membership somewhere else, this
select is one component and one action to move.

---

### D130 — «who writes this column?», answered for all ten

**S3, 2026-09-09.** CLAUDE.md's standing question has two answers, and the audit found that neither
had been written down. `A7a-11`: **fifteen of the sixteen no-writer columns carried no column
comment at all** — the specific thing the standing question asks for.

Ten columns now answer it, in the words `WHO WRITES IT`, and `tests/db/no-writer-columns.test.ts`
asserts they keep doing so. **The answer turned out to have three values, not two**, which the first
version of that test got wrong by treating «written only by the demo seed» as «has a writer» — the
exact confusion the standing question exists to remove:

| Answer | Columns |
|---|---|
| a server action | `org_members.group_id` (D129) |
| only `scripts/seed-demo.ts` | `live_sessions.step`, `tasks.due_at` |
| nothing at all | `duties.next_due_at`, `surveys.run_mode`, `survey_invitations.bounced_at`, `groups.lead_member_id`, `report_shares.expires_at`, `live_sessions.created_by`, `organizations.timezone` |

**Only one got a writer, and the reason is a rule rather than a budget.** For the other nine the
control does not exist in any bundle, and a writer for a control nobody drew is an invented feature.
`group_id` is the exception because its absence made a **shipped** feature permanently empty rather
than merely unreachable.

Three of the seven are worth stating plainly, because their consequence is larger than «a column is
NULL»:

- **`report_shares.expires_at`** — every report share link is **permanent**, and there is no
  revocation anywhere in the product. `report_for_share_token` and `compose_report` both read the
  column and both treat NULL as «never expires». Deleting the row is the only revocation that
  exists and no screen reaches it.
- **`surveys.run_mode`** — a real editor cannot move a survey off `standard`, so Live and the whole
  of V2-10's quiz are reachable only from psql.
- **`duties.next_due_at`** — Oversikt's «Krever handling» is permanently empty on a real
  organisation.

**What this does NOT give you.** The test is an enumeration, and it says so: it is the set of ten
the 2026-09-09 audit found, not the set of all columns without writers. «Has a writer» is a fact
about application code and is not derivable from the catalogue — deriving it is what the audit spent
two independent probes on. The eleventh instance will be found by a person, not by this test, and it
is added here by the phase that finds it. Recorded rather than papered over, because a test that
looked total while being partial is worse than one that states its scope.

---

### D131 — the gates that cannot see what they are trusted for

> **THE PAIR, ADDED 2026-09-10 (Tor).** S2 found **thirteen gates that never ran because
> nobody had scheduled them.** On 2026-09-10 runs 87, 88 and 89 each reached the browser job
> and were killed mid-flight by my own next push — **three runs that never finished because
> there was always one more commit.** Same outcome, opposite cause: in both cases a gate's
> verdict did not exist while the work it covered was treated as verified.
>
> **S2's lesson arriving from the other side.** Scheduling a gate makes it *able* to run;
> nothing makes it *finish*. Run 90 was the first since 86 to reach the end, and by then I had
> been three pushes away from reporting green on `verify:responsive` — the gate that found four
> blockers within one run of first being scheduled, and therefore the last one anyone should
> assume about. It ran `12:47:31 → 12:50:52`, and `verify:visual` after it.
>
> The operational form: **a gate that is always about to run is not a gate that ran.** When a
> run is being waited on, hold the commits; a push is a cancellation. And read the run, not the
> workflow file — «I pushed and CI is green» is two claims, and the second one needs the job's
> conclusion.

**S4, 2026-09-09.** The audit's § 4.5, written down here because a limitation nobody records is
indistinguishable from a limitation nobody has. These are not defects: every one is a gate that
works, is green, and is green about something narrower than its name suggests. **Two of the seven
were closed in this session; five stand.**

### Closed

- **`C3-2` — the hooks gate could not fail.** `react-hooks/exhaustive-deps` is a WARNING and
  `eslint .` carried no `--max-warnings`, so a warning could accumulate for ever. CI now runs
  `eslint . --max-warnings 0`, and it passes today; the point is that it keeps passing.
- **CI ran 289 of 824 tests — 35.1%.** Four of seventeen gates. All seventeen now run on every
  push (S2), across three parallel jobs.

### Standing, with what each one's green actually means

**`B7b-02` — `verify:copy` reads the file, not the table the product serves.** `lib/i18n/messages.ts`
layers seeded `ui_messages` OVER `messages/*.json`, so the table wins at render time. The gate
reads the JSON. Its green means «the repository's copy is clean», not «the product says this».
That is D110's case 4 with a gate in place of a screenshot: real, on-topic, and structurally mute
on the claim. **The consequence was live on prod for weeks and was fixed by hand in S1**, not by
any gate. Not widened here — the apparatus is frozen — but it is the one of the five most worth
widening next, because it is the only one whose blind spot has already produced a false claim to
a user.

**`A8-8` — Gate 5a3 hard-codes `nspname = 'public'`.** The 38 SECURITY DEFINER functions in the
`app` schema are outside every automated check. Its «65 of 90» means «65 of the 90 catalogue
surfaces IN `public`». This is why the number did not move for any of S3's six migrations: an
`app`-schema function is not a surface it enumerates, and neither is a CHECK constraint or a
column.

**`A5-2` — `fk-tenancy.test.ts` requires BOTH tables to carry a literal `org_id`.** Eleven
single-column keys sit outside that enumeration, and one of them was the BLOCKER. **Partly
addressed in S3:** the test's header now states the blind spot in its own words, and
`tests/db/live-round-tenancy.test.ts` covers the round-shaped cases as a catalogue-derived
property. The query itself is unchanged, so the other nine keys remain unexamined by it.

**`C4-7` — nothing measures bundle size or page weight.** Twenty-two verification scripts, none
of them about what the browser downloads. A regression here is invisible to every gate and
visible to every user on a slow connection.

**`A2-8` / `A3-11` — nothing forces RLS, and nothing asserts «RLS on every table».** All
SECURITY DEFINER functions bypass every policy by design, which is the architecture; the
limitation is that `grep -rn relrowsecurity tests/` is empty, so **disabling RLS on a table would
remove it from 5a3's enumeration rather than fail anything.** The denominator would shrink and
the ratio might even improve. That is the sharpest of the five, and it is the one whose fix is
least obvious: the assertion has to be about a set that is itself derived from the thing being
asserted.

### Why none of these was fixed here

CLAUDE.md freezes the verification apparatus: *«Do not add gates, meta-checks, manifests or rules
mid-phase.»* S3 was a fix pass over defects, and every one of these is apparatus. What S3 did do
is REPAIR two existing checks where its own changes had made them imprecise — `audience-freeze`'s
FK map and `live.test` 16b — which is the permitted kind of change and the kind that pays for
itself immediately.

**The reason to write them down rather than carry them:** each of these gates will be cited, by
someone, as evidence that a thing is safe. The sentence that matters is not «this gate is
limited» but **what its green means**, which is what each entry above states.

---

### D132 — `get_peer_results` names the question when it refuses the number

**S4, 2026-09-09. Decided by Tor: acceptable. The reasoning, written down, because «acceptable»
without it is indistinguishable from «not looked at».**

`get_peer_results` is the respondent-facing peer comparison: a person who has answered a shared
survey can see how the group answered. Below the threshold it returns `insufficient_data` — and
it returns **the question text alongside the refusal** (audit `B2-10`).

**What is actually disclosed, stated exactly.** The caller already holds a valid token for this
round, so they have already been shown the survey and every question in it by
`get_survey_for_token`. The question text is therefore **not new information to this caller**: the
refusal names something they were handed a moment earlier. What the branch withholds is what it
is supposed to withhold — n, the distribution and the average.

**Why the shape of the refusal still matters, and why it is the right one here.** The alternative
is a refusal that names nothing, which is the rule `redeem_live_voucher` follows for a different
reason: *«A code that is wrong, closed, expired or never existed must be indistinguishable, or the
refusal itself enumerates live sessions to an unauthenticated caller.»* That reasoning does not
transfer. There the caller is **unauthenticated and guessing**; here they hold a token that
already entitles them to the question. A silent refusal would cost a respondent the one thing the
screen is for — knowing WHICH question has too few answers to show — and buy nothing, because
nothing is concealed from them.

**The half that is a real limitation, and it is about k rather than about text.** `B2-10` also
records that the k this branch gates on **can be 2**. At k=2 a peer comparison is CLAUDE.md's own
«disclosure by arithmetic»: the reader knows their own answer, sees the pair's result, subtracts.
That is not a defect in `get_peer_results` — it is Q91's tier, already carried by
`thresholdTier`, the respondent promise copy and the policy panel's warning, all of which say so
in the respondent's own language before they answer. The function is consistent with the promise
the product makes; the promise at 2 is the thing a customer is warned about.

**What would change this decision:** a peer comparison that ran on a survey whose respondents had
NOT been shown the questions — a digest, a notification, a link into results rather than into the
survey. There is no such surface today. If one is built, this entry is the thing to re-read.

**Not written into the function's own comment**, deliberately: that would be a migration, and a
migration to production for a paragraph of reasoning is a schema change to say something a
document says better. `B2-03`'s separate finding — that `submit_response` has no replay bar on a
share-link token, so the caller who READS this is the caller who SETS its k — remains open and is
listed as such in the S1–S4 report.

### D133 — the bounce path is blocked on the provider, not on us

**2026-09-10, with the Brevo sending path.** `survey_invitations.bounced_at` still has no
writer, and this entry is the reason it is shipping that way rather than the reason it was
forgotten.

**What is missing is a webhook that this account does not offer.** The Brevo account has no
Transactional → Webhooks section available, so there is no delivered event and no bounce
event to subscribe to. Nothing can be built against it: this is not a screen that is missing,
and it is not work anyone here can do. D130 recorded the column as having no writer and named
the missing piece as «the provider callback»; that diagnosis was right and the callback is now
known to be unavailable rather than merely unbuilt.

**What `sent_at` therefore means, which is weaker than its name.** The worker writes it from
its own successful API call, so it records that **Brevo accepted the message** — the request
was well-formed and queued at the provider. It does **not** record that the recipient's server
took it. A message can be accepted and bounce afterwards, and nothing in this system will hear
about it. The column's own comment says this in the database (`M:0095`), because that is where
the next reader of the column will be, and the gap between «accepted» and «delivered» is
exactly the kind a later reader closes by guessing the stronger reading.

**THE COST, STATED PLAINLY, BECAUSE IT IS NOT ZERO.**

- `bounced_at` stays unwritable.
- An invalid address keeps counting toward `surveys.target` and toward Resultater's
  «av {invited} inviterte». The denominator silently includes people who were never reached.
- Q61's «Adressen svarer ikke» can never fire on a real organisation. The status exists, is
  derived, is rendered — and is unreachable outside the demo seed.

**WHERE THAT IS ACCEPTABLE AND WHERE IT STOPS BEING ACCEPTABLE.** It is acceptable for a demo
and for a pilot with known addresses, where the sender knows every recipient and a silent
failure is recoverable by asking them. **It is not acceptable for a customer uploading 200
recipients from an HR system, where a handful are always wrong** — there, a response rate is
quietly computed against a denominator nobody can audit, and the one status that would have
explained it never appears.

**That sentence is the trigger.** The first customer import of an address list nobody has
checked by hand is the event that makes this a defect rather than a limitation. Revisiting it
then means either a provider whose account exposes transactional webhooks, or an inbound route
of our own — not a change to this schema, which is already correct and merely unwritten.

### D134 — the provider's `messageId` is discarded, so nothing joins a row to Brevo's log

**Found 2026-09-10, in the first proven production send.** `lib/mail/brevo.ts`
reads Brevo's response and returns `{ ok: true, id: json.messageId ?? … }`. The
worker's success path uses `result.ok` and nothing else: it writes `sent_at`,
deletes the queue message and logs `sent ${job.kind} -> ${job.email}`. **`result.id`
is not stored and not logged.** It exists for the width of one `if`.

**Why this is more than tidiness.** D133 records that this Brevo account has no
Transactional → Webhooks section, so `bounced_at` has no writer and there is no
delivered event. The compensating control that made D133 acceptable for a pilot
was implicit and is worth stating: *when a participant says they got nothing, go
look the message up in Brevo's own delivery view.* That control needs a join key,
and the join key is exactly what is being thrown away. What is left is matching on
recipient address plus a timestamp — which is workable for two invitations to one
address, and stops being workable at the 200-recipient upload D133 already names as
its trigger, where several people share a send-second and one address may appear
twice across rounds.

So the two limitations compound rather than sit side by side: **no bounce event, and
no handle with which to go and ask.**

**Measured, not inferred.** Both invitations
(`15c1b8a2…`, `bf43e859…`) have `sent_at` written from the cron run at
11:29:01Z; the worker returned `{"ok":true,"sent":2,"left":0,"archived":0}`; and
there is no column anywhere in `survey_invitations` holding a provider id —
`sent_at` is the whole of the record. Asked the question CLAUDE.md requires of a
column, in reverse: nothing writes a provider id because no such column exists,
and the value that would fill it is produced and dropped on every send.

**The fix, and its two halves.** The cheap half is one line — log `result.id`
beside the address, so the Edge Function log carries the handle even before any
schema does. The real half is a column (`survey_invitations.provider_message_id`,
nullable, written by the worker in the same migration that adds it, per the
standing «who writes this column?» rule) so the handle survives log retention.
Neither is built here: the verification apparatus and the phase are closed, and
this is logged for the next phase rather than added mid-flight.

**Not a blocker for the demo or a known-address pilot** — the same boundary D133
draws, for the same reason, which is why they should be revisited together and not
separately.

### D135 — a recorded divergence nobody re-checks is the same failure as an unrecorded one

**Found 2026-09-10, in the file whose only job is to describe production.** Tor
named the rule. This is a sixth failure mode in **D110**'s family: not a count
that went stale, not a claim never built, not a citation that is real and wrong —
**documentation that was TRUE WHEN WRITTEN, with nothing binding it to reality
afterwards.**

`supabase/functions/README.md` carried a section headed **KNOWN DIVERGENCE,
recorded rather than deployed over**, saying the deployed `mail-worker` had

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drain(
  svc: any,
```

while the repository had `type ServiceClient = any`. It was accurate the day it
was written and it justified NOT taking a third production deploy for a lint
pragma, which was the right call. Then some deploy between v2 and v11 carried the
repository's form, and the paragraph went on asserting the old one. Measured
against `get_edge_function` on 2026-09-10: **the running function has the
repository's `ServiceClient`, and has had it for some number of versions nobody
can now name.** The note stood wrong for four recorded versions.

**Why this is worse than an ordinary stale sentence.** The paragraph existed
*because* the project had twice been hurt by an unrecorded difference between a
repository and a running system — `overview_activity` hand-applied, and two
functions whose comment blocks were abridged in transit. It was the remedy. And a
remedy that describes production wrongly is more expensive than no remedy at all,
because the next reader consults it INSTEAD of looking: it is a gate nobody
reads (D110's own second half) wearing the costume of diligence. **A divergence
note is a claim about two systems at once, so it decays twice as fast as prose
about either.**

**The fix is not more documentation.** More prose has the same half-life. It is
D110's own rule applied to divergence notes specifically: **a divergence note
carries the command that re-derives it**, beside the claim, so checking costs one
paste. `supabase/functions/README.md` now says what is divergent AND how the
comparison was taken (`get_edge_function` against the repository, the ninth check
aimed at a function instead of a migration), and the same discipline produced
`npm run edge:bundle`'s per-file md5 manifest — which exists so that «did what I
sent match what I generated» is a question with an answer rather than a memory.

Applied in the same sitting to two other carried numbers, which is the test of
whether a rule is real:
- **CLAUDE.md's enumeration table** now states `awk '/^\| Where \| The
  enumeration/,/^$/' CLAUDE.md | grep -c '^| [^-]'` minus the header, because a
  correction arrived calling the new instance the tenth when the table held seven.
  The number is written as what re-derives it, and the disagreement is recorded
  rather than matched.
- **The `heituva.no` sweep** states
  `grep -ro 'heituva\.no' . | grep -v node_modules | grep -v '^./artifacts/' | wc -l`
  beside its 28, because the first count was fourteen and wrong on both the
  number and the place.

**The general form, and it is short:** if a sentence asserts something about a
system you are not looking at while you read it, it needs the command that looks.

### D136 — `live_sessions.step` names a position the product cannot be in

**2026-09-10.** Asked to build the missing writer for `live_sessions.step`
(the sixth «who writes this column» instance), writer-only, no new screen beyond
what the bundle draws. **The writer was not built, and the reason is the
finding.**

`step` renders as the small uppercase label above the live stage's question —
`LiveStage.tsx:209`, bundle V2:1841 `{{ liveStage.step }}`. The demo seed sets
it to **«Spørsmål 2 av 2»**.

**No live session can be on question 2 of 2.** The stage renders `barsQuestion`,
and `page.tsx:175` computes it as `firstScale?.text ?? null` — the first scale
question, chosen on the server. There is no presenter control that moves between
questions: the bundle's stage carries exactly two buttons, `onLiveReveal` and
`goBuild`, and the code has no advance either.

So the instruction and the bundle are in conflict, and the conflict is real
rather than a gap in either: **the writer cannot exist until the navigation it
would record exists.** Building that navigation is a feature — it changes what
the live stage shows, needs its own copy, and nobody has drawn or decided it.
The two ways to write `step` without it are both forbidden here:

- inventing an advance control is the restyling CLAUDE.md's control-substitution
  rule exists to refuse;
- writing a plausible label server-side on every render is fabricating data in
  the UI, and would also make a GET mutate.

**The seed is the sharper half.** D102's standing limitation is that the demo
seed reaches only states the current code creates. This is that sentence
inverted: the seed reaches a state the code **cannot** create, and the result is
a demo that shows a reviewer a navigation feature the product does not have. A
seeded value is indistinguishable from a working one on screen — which is the
whole reason «a column whose only writer is the seed is exactly the finding» is
a rule.

**RESOLVED 2026-09-10 — Tor's decision: DROP THE COLUMN** (`M:0098`). Option 2
below, with the reasoning sharpened: Q61 says do not store what can be derived,
and *this is worse than the case Q61 refuses — it stored something that does not
exist.* A derived value kept in two places can at least disagree about something
real. Presenter navigation is a feature to be decided on its own terms, not a
thing a waiting column argues for; **if it is ever built, `step` returns WITH its
writer in the same migration**, which is what the standing question asks and what
this column never had. The instruction that produced this entry — «build the
writer, no new screen beyond what the bundle draws» — was self-contradictory, and
Tor named it so: handing back the conflict was the answer to a question posed
wrongly.

The drop was verified against the catalogue before it ran, not asserted: 0
policies, 0 constraints, 0 views, 0 rows with a value. The function sweep
returned ONE match, `public.close_live_session`, and reading it showed the phrase
«one step down» in a comment. **The count said one dependency and the line said
none** — a match is not a finding until it is read.

**The two ways out as they stood, kept for the record:**
1. **Build presenter navigation** as its own scoped piece, and `step` becomes
   its record — the writer follows for free.
2. **Derive and drop.** `step` is a pure function of (question shown, question
   count), both of which the page already holds. Q61's «derive, do not
   duplicate», and V2-10's precedent of removing `quiz_attempts` outright.
   Dropping a column on the remote project is destructive, so it is asked for
   rather than taken.

Pinned by `tests/unit/live-step.test.ts` (5). The second assertion fails the day
presenter navigation arrives — which is the moment this entry stops being true
and the writer becomes buildable.

### D137 — Turnstile was configured in the dashboard and absent from the deployment

**2026-09-10.** The keys were set, and `request_demo` was still unprotected.
Measured on the live origin: `https://www.heituva.com/` returns **zero**
Turnstile markup — no `cf-turnstile` div, no Cloudflare script — with
`x-vercel-cache: MISS`, `age: 0` and `no-store`, so the page was rendered fresh
by the running function rather than served from an edge cache.

`Turnstile({ siteKey })` is `if (!siteKey) return null`, and `page.tsx` reads
`process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` in a **server** component. Null
markup therefore means that variable is undefined **inside the running
deployment** — which is one operand of `turnstileConfigured()`'s AND, so the
verifier's early `return true` was live.

**Why the variable was set and absent at the same time: Vercel snapshots
environment variables into a deployment.** Editing them in the dashboard does
not reach deployments that already exist; a redeploy does. `export const dynamic
= 'force-dynamic'` removes the *other* staleness — build-time inlining of a
`NEXT_PUBLIC_` value into the client bundle — and says nothing about the
function's environment. **I asserted earlier in the same session that no
redeploy would be needed, and that was wrong**; recorded rather than quietly
corrected, because it is the kind of half-true mechanism that reads as settled.

**The general form, which is why this is an entry and not a note:** a control
has TWO configurations — the one an operator edits and the one the running
system holds — and «I set it» is a claim about the first. `env | grep` on a
laptop, a dashboard screenshot and a Vercel settings page all confirm the first
and none confirms the second. The observable is the running system's BEHAVIOUR:
here, whether the widget the server renders exists at all.

Fixed on the operator's side by a redeploy. Fixed on ours by D138.

### D138 — a half-configured Turnstile passed everything through

**2026-09-10, found while proving D137 rather than by any gate.**
`turnstileConfigured()` was `Boolean(TURNSTILE_SECRET_KEY && NEXT_PUBLIC_TURNSTILE_SITE_KEY)`
and `verifyTurnstile` opened with `if (!turnstileConfigured()) return true`.

Two variables, three states — and the third had no handling:

| | old behaviour | now |
|---|---|---|
| neither set | pass (local, CI — nothing to solve) | unchanged |
| both set | enforce | unchanged |
| **exactly one set** | **pass** | **refuse** |

**The site-key-only case is the dangerous one and it is not exotic**: it is what
a half-finished configuration looks like, and it *renders Cloudflare's widget on
the splash* while verifying nothing. A visible control that enforces nothing —
the reviewer's eye confirms exactly the thing the code is not doing. D115's
shape (a revoke that grants nothing; an allowlist reason true of one clause),
arriving on the only unauthenticated write surface in the product.

`Boolean(A && B)` is a correct sentence about A and B and silent about
A-without-B — the enumeration shape, in two variables. Replaced by
`turnstileState(): 'absent' | 'partial' | 'configured'`, with **partial
refusing** and naming which half is missing in the log (never the values). Both
partial directions are loud: secret-only means no widget and no token,
site-key-only means a solved widget rejected. Loud is the point — the failure
mode it replaces was silent on a live origin.

**AND THE TEMPTATION IS THE HALF WORTH WRITING DOWN, because the defect alone
does not warn anyone.** Once the fix was in, the obvious next sentence was
«Turnstile is enforcing now» — supported by the only evidence obtainable from
this environment: `data-sitekey` present in the served HTML, proving
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` reached the running function.

**That is this exact finding, committed a second time.** «The key reached the
function» and «the control enforces» are different claims, and the first is
one operand of the AND that the second needs. Presence is *precisely* what a
half-configuration also satisfies — a site key alone renders the widget and
proves nothing about the secret — so accepting it as proof would confirm the
state the entry exists to catch.

What makes it dangerous rather than merely wrong: **presence was the only half
measurable from here.** The proxy closes the browser's tunnel to the origin, so
the behavioural half — submit without a token, watch it refused, watch
`demo_requests` not grow — needed a human. When one half of a proof is cheap and
the other is blocked, the cheap half acquires a gravity it has not earned, and
the report writes itself. The rule that survives: **when you cannot measure the
thing, say which half you measured and which you did not — never promote the
half you have.**

Pinned by `tests/unit/turnstile-state.test.ts` (11), which failed on its
assertions before the fix — `expected true to be false` on both partial cases.

**Their FIRST run failed on something else, and that mattered.** All eleven went
red on `import 'server-only'`, which throws outside a Server Component — a suite
red for a reason that has nothing to do with the behaviour it claims to pin, and
one that reads identically in CI to a suite that is doing its job. The harness
was fixed (`vi.mock('server-only')`) and the tests re-run to red **before the
implementation was touched**, so that «proven failing first» meant proven on the
assertion. Nobody invoked the rule; it is the same rule as *a negative from a
probe written from memory is not evidence of absence* — a red that does not come
from the claim is not a proven negative, in either direction. Written down
because the tempting move at that moment is to fix the code and watch the suite
go green, which would have proved the import was fixed and nothing else.

Also pinned by `tests/unit/marketing-guard.test.ts` (5), which asserts the property over
the file rather than over today's two actions: **every exported server action in
`app/(marketing)/actions.ts` calls `guard()` before it parses or touches an
RPC**, with the action list derived from the source.

### D139 — a seed that reaches a state the CODE CANNOT CREATE

**A new shape, 2026-09-10 (Tor), not an instance of D102.** Named while dropping
`live_sessions.step` (D136), and worth separating because the two point in
opposite directions and only one of them lies.

**D102's standing limitation:** *the demo seed reaches only states the current
code creates.* Its cost is coverage — a screen whose empty state, warning state
or multi-round trend nobody can photograph, because the seed cannot get there.
The symptom is a **gap**, and a gap looks like a gap.

**This is that sentence inverted:** the seed reaching a state the code CANNOT
create. `scripts/seed-demo.ts` set `live_sessions.step` to «Spørsmål 2 av 2»
while the live stage renders `firstScale?.text` — the first scale question,
chosen on the server — with no control anywhere that moves between questions. No
session could ever hold that value.

**The inverted case is worse, and the reason is what makes it its own entry.** A
seeded value is indistinguishable from a written one on screen. A missing state
shows a reviewer a gap and invites the question «why is this empty?»; a
fabricated one shows them a **working feature** and invites no question at all.
So:

- **D102 costs coverage. D139 costs truth.** One hides something real, the other
  displays something false.
- **D102 is discovered by trying to demonstrate a state. D139 survives every
  demonstration**, because demonstrating it is exactly what it is good at. It
  fails only against the schema and the code, never against the screen.
- It is the «never fabricate data in the UI» rule arriving through the seed
  rather than through a component. The rule says a fake value is worse than a
  gap *because it is indistinguishable from a real one in review, and survives
  into screenshots and demos as though it were true* — which is a description of
  this, written before anyone had found it here.

**The check that catches it is not a gate.** No gate can: the row is valid, the
column is real, RLS is satisfied, the render is correct. It is caught by asking
of a seeded value the same question the standing rule asks of a column — **can
the product actually produce this?** — and the answer is a code path, not a
constraint.

Fixed by dropping the column and the seed line together (`M:0098`), and pinned
by `tests/unit/live-step.test.ts`, whose fourth assertion is that the seed no
longer carries it and whose last is the trigger for bringing `step` back with a
writer if presenter navigation is ever built.

**A note from the CI run that landed this, worth keeping for the gate rather
than for the shape.** Dropping the column removed one test from
`tests/db/no-writer-columns.test.ts`, which loops the set into one `it` per
entry — 13 became 12 — and the census caught it and failed the run, saying in
its own words: *a file that collects fewer tests than committed has stopped
checking something; if the drop is intended, lower the number in the same
commit.* The drop WAS intended and I had not lowered it. **The census was
right, and it is the only gate that could have been**: every one of the 969
tests passed.

Two things follow. First, the census signal is **not available locally in this
environment** — Docker is unavailable, so `vitest run tests/unit` is the most
that runs here and the census then reports every db file as «did not run at
all», which is noise rather than a check. The number can only be verified in
CI, so lowering a floor is a change whose correctness is not observable at the
moment it is written.

Second, and this belongs beside **D131** as its most dangerous member:
`verify:hermetic` runs the suite twice, before and after deliberate pollution,
and inherits its exit code. A census failure therefore surfaced as **«NOT
HERMETIC»** — a verdict about something that run never tested, on a run where
the suite was green both times.

**D131's family is gates that are GREEN about something narrower than their
name. This one was RED about the wrong thing, and that is worse.** A gate green
about the wrong thing costs you a finding you never learn about — bad, but
passive, and it waits patiently to be discovered. A gate red about the wrong
thing **spends** your attention and aims it: «NOT HERMETIC» names a specific,
plausible, expensive failure — test pollution, ordering, shared state — and
sends the diagnosis in that direction from the first second. The cost is not a
missed finding but time spent looking where nothing is wrong, and the wrongness
is invisible precisely because the verdict is confident and the failure is real.
It was cheap here only because the census printed its own cause two lines above,
and reading the whole log rather than the verdict is what caught it.

The gate works; its VERDICT is narrower than the word it prints. Confirmed by
the fix: `verify:hermetic` passed on the next run with no change to anything
hermeticity-related, which is what settles that it was never a hermeticity
problem — the suite's exit code wearing that name. Logged, not fixed: the
apparatus is frozen.

**Where to look for more of it:** any column whose only writer is the seed. That
set is enumerated and asserted in `tests/db/no-writer-columns.test.ts`, and it
now holds exactly one — `tasks.due_at`, which should be checked against this
question rather than assumed to be the harmless kind.

### D140 — a test that pins the current state turns finishing the work into breaking the suite

**2026-09-10, found by CI run 97 when the quiz card was unlocked.** 977 of 978
tests passed. The one failure was `tests/db/live.test.ts:18`, V2-9's «THE COLUMN
HAS A WRITER — asserted, because it nearly did not»:

```ts
expect(src, 'behind a Zod enum that excludes quiz')
  .toMatch(/z\.enum\(\['standard', 'live'\]\)/)
```

**The test was right about its rule and wrong about how it wrote it.** The rule
is «`run_mode` has a writer and the writer validates» — that is what V2-9 was
protecting, and it is a good test. «Excludes quiz» is not that rule. It is a
fact about an unfinished feature, frozen into an assertion.

**So finishing quiz broke the suite.** Not because anything regressed — the
database CHECK had allowed `'quiz'` since `M:0085`, the guards were in place, 26
quiz tests were green — but because a test had recorded the temporary state as
though it were the invariant.

**This is the enumeration-mistaken-for-a-property shape wearing a test's
clothes, and it is the nastiest member of that family so far.** The others cost
a missed case. This one costs something worse: **it makes completing the work
look like a defect**, and the cheap way out is to edit the expectation until the
suite is green again — which is exactly the move that would have taught nobody
anything, and which a phase under time pressure will take.

The shape has a tell: **an assertion that names a thing it expects to be
ABSENT.** «Excludes quiz», «has no X yet», «is not built» — every one of those is
a sentence about today rather than about the rule, and every one has to be
revisited by whoever adds the thing.

**Restated as the property, derived at run time:** the server boundary's Zod
enum is exactly the set `surveys_run_mode_check` allows, read from
`pg_constraint`. A fourth mode needs no edit here, and drift fails in BOTH
directions — too permissive lets a value reach a raised exception surfaced as
«failed», too narrow makes a legal state unreachable, which is precisely what
happened to quiz for a whole phase (`docs/review/05-quiz.md`).

Verified against the real inputs before trusting it, since no database runs in
the environment that wrote it: the CHECK text from prod and the actual source
both extract to `["live","quiz","standard"]`.

### D141 — a spacing constant derived from one pair, applied to a different pair

**2026-09-10, from CI run 98's `verify:responsive`.** Two findings at 390px, both
mine, and the second is the one worth keeping:

```
[defect]  admin-firma — touch area 300x44 (<44) on <select>: Europe/Oslo…
[blocker] dashboard/tilpass-oppsett — hit areas overlap by 169px²:
          "Ledergruppa" / "Start på nytt"
```

**The defect** is a `<select>` that inherited the shared `field` class. The
`<input>`s above it clear 44px at the same padding; a `<select>` renders a little
shorter and did not. Fixed with `touch-44-field`, which is the helper written for
exactly this and applies only below `md`.

**The blocker is the interesting one, and it is a THIRD kind of
enumeration-mistaken-for-a-property — in a NUMBER.**

`docs/RESPONSIVE.md` says «with 44px hit areas need 14px between painted edges
(7px overflow each side)». That is arithmetic, and it is correct **for the pair
it was measured on**: two chips of about 30px, each overflowing ~7px. The
`CustomizeCard` reset control already carried a comment recording that exact
derivation — «the chip row above ends 7px into this control's hit area at 12px»
— and the fix had been to raise 12px to 14px.

But the pair here is not chip-to-chip. The chip above is ~33px and overflows
~5px; **this control is a bare text link with `p-0` at 12.5px — about 15px
painted, so its 44px area overflows ~14px.** Five plus fourteen is nineteen.
Fourteen was never going to be enough, and the only reason it held until now is
that the chip rail happened to wrap so «Ledergruppa» did not sit directly above
it.

**«14px between painted edges» reads like a property and is an instance.** The
property is *the gap must exceed the sum of the two controls' overflows*, and
those overflows depend on how tall each painted control is — which the sentence
does not say. It is the RESPONSIVE.md worked-example failure (D129) a second
time, in the same document, in a number rather than in a clause.

Raised to 24px — the design's step above 19 — and derived in the comment rather
than tuned, so the next reader can check the arithmetic instead of trusting a
constant.

**And a note on how it was found.** No capture can be taken in this environment,
so this was diagnosed by downloading CI's `captures.zip` artifact and opening
`dashboard.tilpass-oppsett.mobile.png`. The chip rail is visibly seven chips
wrapping to four lines with «Ledergruppa» alone on the last, directly above the
link. **Reasoning from the source would not have found it** — the wrap is a
function of six shipped preset names, one seeded layout title and a 390px
viewport. Worth recording as a route: when the gate cannot run here, its
artifact can still be read here.

---

## D142 — Help-article prose is shipped copy that no gate reads (a LIMITATION)

**Measured 2026-09-10. Decided as Q103.**

`verify:copy` (`scripts/verify/threshold-copy.ts`) reads `messages/no.json` and `messages/en.json`
and nothing else. The twelve help articles are seeded from the design bundle into
`help_article_translations` (`scripts/seed-help.ts`), so **every sentence in them is shipped copy
that is structurally invisible to the one gate written to catch a fixed number near a threshold
word.**

**The instance, and it is not hypothetical.** «Fem er standard. For sensitive temaer bør dere bruke
åtte.» has been the lead of *Sett terskelen for virksomheten* since V2-6. It asserts a fixed number
for a threshold that `organizations.default_k_threshold` makes settable 3–10 (`M:0034`) — exactly
the class Q55 forbids and exactly the shape `verify:copy` was written to find. It sat in production
until 2026-09-10 and tripped nothing, because it was never in a file the gate opens. It was found by
reading the corrected bundle's diff, not by any check.

**The apparatus stays frozen, so this is a limit and not a new gate.** The protection is the
human claim-set sweep in CLAUDE.md's ADDING A BUNDLE checklist, step 7, which now covers
`help_article_translations` as a surface alongside `messages/*.json` — same treatment, same
question of every sentence: is this true of the running database? Whether `verify:copy`'s *inputs*
should grow to include the table is a separate decision and is not taken here.

**What makes it worth a numbered entry rather than a line in a phase report.** The gate is not
wrong and its allowlist is not stale — it is looking in the right way at the wrong set. That is a
different failure from a rule with a hole in it, and it is the second time this project has hit it:
`verify:i18n` was missing `survey_questions.text` and `duty_definitions.basis` for the same reason.
**A sweep's SCOPE ages exactly like an allowlist's contents**, and nothing re-derives it.

---

## D143 — The rendered reference baselines are non-deterministic, and it hid a real change

**Measured 2026-09-10. Open as Q104.**

Three clean renders of one unchanged bundle, compared byte-for-byte:

| Screen | differs from itself |
|---|---|
| `live` | 551 px (0.011%) |
| `live-revealed` | 726 px (0.011%) |
| `send` | 1262 px (0.010%) |
| `rapport-editor` | 27865 px (0.398%), rows 1538-1669 |
| `rapport-editor-filter` | 3801 px (0.054%) |
| `rapport-editor-del` | 71699 px (1.025%), rows 1045-1669 |
| `admin-personvern`, `hjelp` | **0 px** |

**The cause is `Math.random()`, and the first answer I gave was wrong.** Cropping the differing rows
and reading them: `send` renders `…/s/q2rrzlu` in one pass and `…/s/qpagbqf` in the next; `live`
renders `heituva.no/qwala`. Both are `uid()` — **V2:4133**, `"q" + Math.random().toString(36).slice(2,8)`.
**One call site.** The first pass of this attributed it to the clock and named eleven `new Date` sites
(V2:4533, 5289, 5376, 5395, 5527, 5531, 5541, 5542, 5547, 5550, 6014); those are mostly seeded
constants (`new Date(2026, 8, 7 + …)`) or `getFullYear()`, and `rapport-editor`'s render-to-render
diff **starts at row 1538, below its «generert …» date line at row ~600, which is byte-identical
between renders.** The date was ruled out by the measurement that was supposed to support it.
`rapport-editor`'s residual jitter is in the team bars; it is downstream of `uid()` on the available
evidence and that link is **not established**.

**The cost, which is the reason this is an entry and not a footnote.** A baseline that differs from
itself is read as drift by whoever compares next — and it already caused the opposite error here.
Three `rapport-editor` baselines were dropped as churn in the same session, when lines 4660 and 4666
had genuinely moved in them; **five screens changed for the bundle revision, not two.** The
comparison that produced the wrong count was itself wrong: a `git restore` ran between the two
renders, so the second side of the diff was git HEAD rather than a second render. **An apply is not
evidence, a comparison is — and a comparison is only evidence if both sides are what you think they
are.**

Nothing automated consumes these images (VERIFY.md § Gate 3a has a human open them), so this is not
a broken gate. Whether to seed `Math.random` in the capture harness, exclude the six screens, or
accept and annotate is Q104; editing a bundle is not among the options.

---

## D144 — The preview does not default a missing answer key to option one

**B1, 2026-09-10.** `V2:6507` renders «Riktig svar: første alternativ» when a question's
`answerIndex` is undefined. We render `quizNoKey` — «Ingen fasit valgt» — instead.

**The reason is already written in the schema, by the migration that added the column.**
`survey_questions.answer_index` has no default, and `M:0085:55-61` says why in its column
comment: «The bundle defaults it to 0 for display (V2:6507, «Riktig svar: første alternativ»);
the COLUMN does not, because a default of 0 would silently mark the first option correct on
every question ever written — a fabricated answer key, which is worse than an absent one.»

Implementing the bundle's display default would have put back into the UI exactly what the
migration kept out of the table — and on the worse surface. The table is read by RPCs; **the
preview is read by the editor deciding whether they have set a key.** Telling them option one
is correct when they have set nothing is the fabricated-data rule with a scoring consequence:
`quiz_leaderboard` awards points against `answer_index`, and a `NULL` key awards none, so the
preview would have promised a score the leaderboard would never pay.

`tests/unit/quiz-preview.test.ts` asserts the property (nothing marks a chip correct when
`answerIndex` is null) **and** reads the reason back out of the migration, so the two cannot
drift apart.

---

## D145 — The quiz preview's timer line drops the bundle's «20 sek»

**B1, 2026-09-10.** `V2:6524` renders `timer: on.timeBonus ? "20 sek · tidsbonus" : "Ingen
tidsgrense"`. We render «Tidsbonus» / «Ingen tidsgrense».

**No column configures a time limit and nothing enforces one** (scope corrected in D151: `M:0086`'s scoring function decays a bonus to zero at 20 000 ms, which is a curve, not a deadline). `M:0085` adds none;
`grep -n "time_limit\|seconds" ` over it returns nothing, and the test asserts that rather than
trusting it. What `timeBonus` actually does is scale points by how fast a correct answer
arrives (`quizTimeBonusDesc`: «Raskere riktig svar gir flere poeng») — a multiplier, not a
deadline. Twenty seconds is the mock's illustration of a feature it had no database behind.

The true half of the sentence ships and the invented half does not. Rendering «20 sek» would
have told an editor their respondents get twenty seconds per question, which is a promise
nothing in the product keeps and which they would then have repeated to their own people.

---

## D146 — Q109 measured: the bundle's correct-answer green ships unchanged, and is not tokenised

**B1, 2026-09-10.** `V2:6511-6516` marks the correct chip `#E4F2E0` / border and text
`#2F5D2A`. Neither is a theme token and CLAUDE.md's token list carries no success colour.

**Measured rather than assumed**, which is what decided it:

| pair | ratio |
|---|---|
| `#2F5D2A` on `#E4F2E0` — as drawn | **6.65 : 1** |
| `#2F5D2A` on `--bg #FCF6E9` | 7.17 : 1 |
| `#2F5D2A` on `--sf #FFFDF6` | 7.59 : 1 |
| `--mut #5F5849` on `--sf` — the app's own existing baseline | 6.93 : 1 |

6.65 clears WCAG AA (4.5) with room, and sits within a quarter-point of a contrast the product
already ships everywhere. **So nothing changes**: the pair is used exactly as drawn, and it is
NOT promoted to a `--ok` / `--okbg` token pair. Promoting it would be four departures from the
bundle (two token definitions, two usages, plus a permanent addition to a token list the design
does not have) to solve a consistency problem that the measurement says does not exist.

The colour is not the only channel: «✓ riktig» is rendered beside it, which is D125's shape —
the quiz tiles carry a shape as a second channel for the same reason. The contrast ratio is
**recomputed inside the test** from whatever hexes the file carries, so editing either one
fails rather than silently dropping below AA.

---

## D147 — `question_bank.used_count` has a writer that RLS silently refuses on standard questions

**Found in B3's database step, 2026-09-10. Not fixed here: the fix is a migration, and a
migration reaches production.**

`addBankQuestion` bumps the counter after inserting:

```ts
await supabase.from('question_bank').update({ used_count: (q.used_count ?? 0) + 1 }).eq('id', questionId)
```

`bank_cud_upd`'s USING clause, read off the production catalogue, is
`(org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator','redaktor'])`. **A standard
bank question has `org_id IS NULL`**, so the predicate is false, the UPDATE matches zero rows,
and PostgREST returns no error. The call site does not check one either. So the bump is a
**silent no-op for every standard question**, and `used_count` on the shared bank is permanently
whatever the seed set.

The Library renders it: `bankUsed` — «brukt i {count}» — on every row. So the number an
organisation reads next to a validated question is not a count of anything.

**This is the «who writes this column?» question one step further on, and the step is the
interesting part.** The three instances CLAUDE.md records are columns with no writer. This one
HAS a writer, in the obvious place, doing the obvious thing — and a policy silently declines it.
A grep for the column name finds the writer and stops; only reading the policy beside it shows
that the writer never lands. **«Who writes this column» is not answered by finding a writer; it
is answered by finding a writer the database lets through.**

Not fixed in B3 because every honest fix crosses the line this run was told to stop at: a
`security definer` bump, or a policy change, is a migration. Options for whoever takes it —
(a) a `security definer` function that increments and is granted narrowly, (b) widen
`bank_cud_upd` to allow `used_count` alone on `org_id is null` rows, (c) derive the count from
`survey_questions` instead of storing it, which removes the column and the question with it.
(c) is the one that matches «derive, do not duplicate» (Q61).

Adjacent and unmeasured: nothing checks the error on that update, so if it ever starts failing
loudly, nothing will say so.

---

## D148 — 5a3's carried number was stale before this run, and I carried it four more times

**Measured from CI run 106, 2026-09-10.**

CLAUDE.md and `docs/review/04-builder-plan.md` carry **65 of 90**, last true at V2-10. Run 106's
`verify:policy` enumerates **56 RLS tables + 36 SECURITY DEFINER functions = 92**, of which **67**
report `ok` or `NO DATA`:

```
npm run verify:policy 2>&1 | grep -cE '^  (ok|NO DATA)'      # 67
npm run verify:policy 2>&1 | grep -E 'enumerated'            # 56 + 36 = 92
```

**5a3 is 67 of 92.** `M:0095`–`M:0098` landed between V2-10 and B0 and nobody re-derived it.

**The part worth recording is not the drift; it is that I repeated it four times in one sitting.**
Each of B0–B3's commit messages says «5a3 unchanged by construction: no RLS table, no SECURITY
DEFINER function». *That claim is true* — no phase added a migration, so the gate's inputs could
not move — and it was attached to a number I had not measured. **A structural claim about a
DELTA does not license the BASE it is added to.** «Unchanged from X» is two assertions, and I
verified one of them four times while the other quietly stayed wrong.

This is the third time this project has recorded a carried number surviving unmeasured — «61 of
83» ran for four phases, «14 heituva.no occurrences» was wrong on the number and the place — and
the first where the carrier is the same session that wrote the rule about it. The command is
above, beside the number, which is the only thing that has ever fixed this.

---

## D149 — A PLAUSIBLE FINDING STOPS THE SEARCH

**Named 2026-09-11 (Tor), from CI runs 110 and 112. A new shape, not an instance of an existing
one — the catalogue's other entries are about enumerations mistaken for properties, and this is
about when you stop looking.**

Run 110: every `bygg` state at `scrollWidth 329` against a 320px viewport. I read the Builder,
found `rightPane`'s `role="tablist"`, saw that B2 had made it four `flex-1` tabs, knew that
`flex-1` leaves `min-width: auto` so each tab's floor is its label plus 24px of padding, applied
RESPONSIVE.md § Tab rails, and pushed.

**Run 112 came back byte-identical.** Six states, 329 each, unchanged.

That is not a flake and it is not a partial fix. **A byte-identical result after a change is the
system saying the DIAGNOSIS was wrong, not the fix** — the element I edited was not on screen. The
Builder has **two** rails: `rightPane`'s, which renders inside the sheet and so is visible only
when the sheet is open, and the `xl:hidden` row pinned under the header, which renders on every
`bygg` state at 320px.

### The tell was in run 110's own output, and it was legible

```
  OVERFLOW bygg                  320px  scrollWidth=329  controls=25  small=0  overlaps=0
  OVERFLOW bygg/avansert         320px  scrollWidth=329  controls=10  small=0  overlaps=0
  OVERFLOW bygg/vis              320px  scrollWidth=329  controls=0   small=0  overlaps=0
```

Two facts in those three lines rule out the rail I fixed:

- **`bygg` is the default state with no sheet open**, and it overflows. A rail inside a closed
  sheet cannot widen a page.
- **`bygg/vis` reports `controls=0`** — in the failing run and in the passing one before it. The
  probe counts no interactive controls there at all, which is not what a page showing a four-button
  rail looks like.

I had both numbers in front of me when I wrote the first fix. I did not read them, **because I had
already found something that looked like the answer.** The explanation was correct in every
particular — `flex-1`, `min-width: auto`, four labels, the arithmetic — and correct about an
element that was not there.

### Why this deserves its own entry

The other entries in this file are about a rule that is too narrow: an enumeration written where a
property was meant. This is different and it has no gate. **A plausible finding terminates the
search that would have found the real one.** The more coherent the explanation, the more completely
it stops the looking — and a *wrong* explanation that happens to be internally sound is the most
expensive kind, because nothing about it feels like a guess.

Two consequences, and the second is the one that generalises:

- **A byte-identical measurement after a fix is evidence about the DIAGNOSIS.** Re-read the
  original output before re-fixing; do not re-run and do not adjust the fix.
- **When you find a cause, keep reading until the evidence is EXHAUSTED, not until it is
  EXPLAINED.** The question is not «does this account for the failure» but «does this account for
  every number in front of me». `controls=0` was unexplained by my answer and I never asked it to
  be.

`tests/unit/builder-tabs.test.ts` now asserts the property rather than the two sites: it **counts**
the elements that map `TABS` and requires `flex-wrap` on each, so a third rail fails a unit test
instead of a CI round.

---

## D150 — «Unchanged from X» is two assertions, and I verified the half that did not matter

**Named 2026-09-11 (Tor). D110's family; the sibling of D148, which records the instance.**

All four of B0–B3's commit messages say «5a3 unchanged by construction». That claim is **true**: no
phase added a migration, so the gate's inputs — RLS tables and SECURITY DEFINER functions in
`public` — could not move. I checked it four times and it was right four times.

The number it was attached to, 65 of 90, was stale before B0 opened. Measured: **67 of 92**.

**A relative claim does not license the base it is added to.** «Unchanged from X» asserts a delta
AND an X, and the verification effort went entirely into the delta — the half that was cheap to
check, already believed, and of no consequence if wrong. The absolute number is the one a reader
uses, and it is the one nobody re-derived.

**The same shape produced B0's citation finding**, one class over: «all 28 citations are v1's
numbers», generalised from a sample of one. That sample was correct — `QuestionCard.tsx`'s `:387`
really is v1's line — and the conclusion was wrong about 24 of 28. **A blanket `V1:` backfill would
have replaced 24 unlabelled citations with 24 falsely labelled ones, which is worse than the
starting state**, because a wrong coordinate system is trusted and an absent one is questioned.

The rule is the one already in this project, applied one level up: a carried number needs the
command that re-derives it **beside it**, and a claim of the form «unchanged from X» needs that
command for X, not for the change.

---

## D151 — D145 overstated its own measurement

**Corrected 2026-09-11, on reading `quiz_leaderboard`'s body.**

D145 says the quiz preview drops the bundle's «20 sek» because «there is no configured time limit
anywhere in the schema». **«Anywhere in the schema» is wrong.** The test behind it asserts
`not.toMatch(/time_limit|seconds/)` over `M:0085` — the migration that adds `answer_index` and
`points` — and that is true and is the right scope. The prose generalised from it.

`M:0086`'s `quiz_leaderboard` hard-codes **20000 ms**:

```sql
(q.points / 2) * greatest(0, 20000 - a.elapsed_ms) / 20000
```

**The decision stands and the reason is unchanged**: that constant is the decay curve of a points
bonus, not a deadline. Nothing stops a respondent answering after twenty seconds; they earn the
base points and no bonus. Telling an editor «20 sek» in a preview would still promise their
respondents a time limit the product does not impose.

What changes is the claim's scope. D145 should read: **no column configures a time limit, and
nothing enforces one; a scoring function decays a bonus to zero at twenty seconds.** The
measurement was sound; the sentence written from it reached further than the measurement did —
which is the same error as D150 one level down, in the same run.

---

## D152 — The browser icon: no bundle draws one, so the framing is a decision

**2026-09-11.** The product had **no favicon at all** — no `app/icon.*`, no `public/`, no
`metadata.icons`, so every tab showed the browser's default placeholder.

**No bundle draws a favicon.** `grep -c favicon` returns 0 in all three, and there is no
`rel="icon"` anywhere. So this is CLAUDE.md's genuinely-unspecified case: choose the minimal
consistent option and log it.

**What is NOT a decision, and was checked rather than assumed:** the mark itself. The logo path
and its three bars are **byte-identical in all three bundles** (one occurrence each), so there is
no Q52 governance question — every handoff draws the same mark. `app/icon.svg` carries that
geometry character for character, and `tests/unit/icon-is-the-logo.test.ts` asserts it against
`components/Logo.tsx`, whose own comment says «Do not redraw it». A favicon is looked at by users
constantly and by developers almost never, which is exactly the arrangement where two copies drift
unnoticed.

### The three decisions

**1. The favicon re-frames; it does not redraw.** Measured by rendering the path at 640px and
trimming, rather than by reading the arc commands: the mark occupies **x 3→29, y 3→28.35** of the
32-unit box — **81% of the tile**. At the 16px a tab actually paints, that wastes a fifth of an
already tiny mark. `icon.svg` uses `viewBox="2 1.68 28 28"`: the same mark, centred, one unit of
margin. Every coordinate is untouched; only the window onto them moves.

**2. The Apple icon keeps the bundle's own `0 0 32 32`, and that was decided by looking.** Both
framings were rendered at 180px on `--bg` and composited under a simulated corner mask. The
re-framed one puts the bubble's rounded corners hard against the mask; the bundle's own padding is
**exactly the safe area Apple's mask needs**, and it reads as a mark on the app's canvas rather
than as a coloured tile. So the two files are framed differently **on purpose**: one fills a 16px
strip, the other survives a 22% corner radius.

**3. The hexes are the bundle's, not the token list's.** A standalone SVG has no CSS custom
properties — `fill="var(--ac)"` renders as nothing. The literals come from the drawing itself,
which writes `fill="var(--ac,#F5C64A)"` and `fill="var(--ink,#191510)"` (**L:142-145**). The
Apple icon is flattened on `--bg #FCF6E9` because Apple composites touch icons on an unknown
ground and asks for opaque; that is the app's own canvas colour, not a new one.

### What this does not do

No `metadata.icons` entry. `app/icon.svg` and `app/apple-icon.png` are Next's file conventions and
the framework writes the `<head>` links itself; a metadata entry would be a second place to be
wrong, and the test asserts it is absent.

**No `favicon.ico`.** Nothing in the toolchain writes ICO, and the format matters only to browsers
this product does not target. Stated as a choice rather than left as a gap: if a legacy target
appears, the ICO is generated from the same `icon.svg` and the drift test extends to it.

**Neither file is in the visual gates.** `verify:browser` photographs pages, not `<head>`, so the
icon is checked by the geometry test and by having been rendered and looked at at 16, 32, 64 and
180px — not by any gate. A limit, recorded rather than papered over.

---

## D153 — The screen reported an obstacle where it could carry out the consequence

**2026-09-11 (Tor). The defect was the presentation of the rules, not the rules.**

`builder.quizGuard` read: «Quiz krever navngitte svar for å kunne gi poeng, og kan ikke brukes på
lovpålagte maler. **Begge deler avvises av databasen, ikke bare av skjermen.**» Two restrictions in
one sentence, handed to an editor who had asked for neither, plus a third clause written for the
people who built it.

**Three renders, and the third is the sharpest.** It arrived as a sticky chip after one click on
Quiz; it was the standing text under the cards in an earlier form; and `QuizPanel` rendered it
**unconditionally** — which means it was permanently on screen in the one state where *both
conditions provably hold*. A survey in quiz mode is necessarily named and necessarily not on a
statutory pack. The sentence described two things that could not fail.

### What changed

**The database rule is untouched.** `app.guard_quiz_policy` still refuses both clauses, and both
reasons are right: a score is a fact about a person, and aml. § 4-3 does not have correct answers.

**The UI stops reporting the first clause and carries it out.** Picking Quiz now sets
`anonymity = 'named'` **in the same UPDATE** as `run_mode = 'quiz'`, so the trigger sees one
finished row, passes its first clause, and still evaluates its second. *A guard that no longer
fires because the screen does its job is what a guard should look like* — the rule did not weaken,
the path to it stopped being a dead end.

**The switch is reported, not silent.** `setRunMode` reads the row first and returns
`switchedToNamed`, so the sentence afterwards is about what *happened*, not what the client
predicted. Changing how a survey collects answers behind someone's back would be a worse defect
than the one being fixed.

**The pack lock stays a refusal**, with its own error member. It is the one with no next step but
«use a different survey», and softening it would be a category error about what a statutory
kartlegging is.

**One sentence at most, and only where it bears**: a locked pack says the pack locks the mode; an
anonymous survey says what Quiz *will do*; a named non-pack survey says nothing; a quiz says
nothing. The standing sentence is muted body text, not the `--ac3` chip — a refusal and a note
about a mode you are considering must not look the same.

**Found while fixing it, same class, same panel:** `runModeNamedSurvey` («Live krever anonyme
svar…») rendered on `anonymity !== 'anonymous' && mode !== 'live'` — permanently, on any named
survey, about a mode the editor had not gone near. It is a refusal message now and only that.

---

## D154 — The Builder's voice, counted

**Measured 2026-09-11, `npx tsx scripts/verify/builder-voice.ts`.** Asked for after D153: the
fidelity review counted statutory-vs-customer vocabulary and found 7 to 0; this is the same
measurement on a different axis.

| | |
|---|---|
| builder keys rendered by the Builder | 186 of 252 |
| of those, **sentences** (≥28 chars, not labels) | **66** |
| restrictive | **10 (15%)** |
| **restrictive AND pre-emptive** | **0** |

**The second number is the one that matters and the first is nearly meaningless without it.** Ten
restrictions is not a fault: `policyTwoText` is the product arguing with a threshold of 2,
`policyWarnTargetBelow` says a result will never appear, `lockedNotice` explains a frozen survey
*and names the next step*. Each is gated on the state it describes. **None greets a person who has
asked for nothing** — which is what was wrong before, and is what was fixed.

The two `«Ikke bygget»` sentences in `QuizPanel` are the only unconditional ones left, and they are
Q84's deliberate absence-visible treatment: a reader must be able to tell «not built» from «not
there».

**THE CLASSIFICATION IS A HAND-WRITTEN LIST, AND THE FIRST ATTEMPT IS WHY.** A marker regex
over-collected badly — «Ingen spørsmål ennå. Legg til ett fra panelet til høyre» is an empty state
offering a next step; «Ingen skjemafelt bryter anonymiteten» is a checklist **pass**, good news
counted as a prohibition. And one hit was this catalogue biting the measurement: `ready_policy`
(«Terskel og målgruppe stemmer») matched `/må\b/` — **JavaScript's `\b` is ASCII, so «å» is a
non-word character and there is a boundary inside «målgruppe».** That is D113/D116 exactly, in a
script written to count something else, by the session that had just re-read them. The script now
fails if a classified key stops being rendered, so the list cannot quietly suppress nothing.

---

## D155 — D140's shape, second time, in the same test — and three more armed beside it

**CI run 121 on `main`, red. 2026-09-11.**

The Kjøremodus fix (D153) destructured `parsed.data` inside `setRunMode`. That changed no
behaviour whatsoever, and it turned `main` red:

```
tests/db/live.test.ts:475
  expect(src, 'a server action writes run_mode').toMatch(/run_mode:\s*parsed\.data\.runMode/)
```

**D140 rewrote a different assertion in that same test, for exactly this reason** — it had pinned
the Zod enum's membership, so finishing quiz meant breaking the suite. The rewrite carried a long
comment about enumerations wearing a test's clothes. **This line sits one screen below it and was
doing the same thing.** The fix landed beside the defect and did not look sideways.

**Both CI failures were this one test.** `verify:hermetic` runs the suite twice, so it reported the
same failure again — and the log's first alarming line, `ERROR: live_requires_anonymous`, was a
negative test's expected output. Reading down to the assertion rather than stopping at the first
plausible line is D149, applied on its first outing.

### The class, not the instance

`grep` for assertions matching a `parsed.data.*` spelling found **four, in three files**:

| | |
|---|---|
| `live.test.ts:475` | `/run_mode:\s*parsed\.data\.runMode/` |
| `quiz.test.ts:358-359` | `quiz_time_bonus`, `quiz_team_board` |
| `member-group.test.ts:57` | `/update\(\{ group_id\|group_id: parsed\.data/` — **already hedged with an alternation**, which is the enumeration-of-spellings workaround rather than the rule |

All four now call `writesValidatedColumn(src, fn, column)` in `tests/db/factories.ts`, which states
the property once: **the column is named in a write inside THAT action's body, and the value came
through the Zod boundary rather than being a literal.** How it is spelled on the way is the
action's business.

The helper is proven to discriminate rather than to pass — five synthetic sources: a good one, a
hard-coded value, an unvalidated write, **a column written by a different action** (the one that
matters, and it reports `writes: false`), and an absent action.

**What this costs if it is got wrong is the reason it is worth a numbered entry.** A test that pins
a mechanism does not fail when the rule is broken; it fails when the code is *tidied*. The signal
it sends is «you changed something» — and the cheap response, every time, is to edit the regex to
match the new spelling, which preserves a test that was never checking the rule.

---

## D156 — The bundle's per-question comment has one slot, and the key is the string `"undefined"`

**Found in C0, by a baseline capture that would not render.** Recorded because it is a fact about
the BUNDLE, not about the running product — the distinction CLAUDE.md's «name the system in the
sentence» rule exists to protect, and this entry is written to that rule throughout.

### What the bundle does

`design-reference-v3/…/HeiTuva.dc.html` stores a respondent's per-question comment as
`qcSaved[q.id]`, and reads it back at five sites — `V3:5346`, `5347`, `5356`, `5358`, `5363` — all
keyed `(rq[stepIdx] || {}).id`, where `rq = this.respondList(st, sv)`.

**`respondList` emits no `id`.** Measured over the whole function, not sampled:

```
awk 'NR>=4851 && NR<=4962' HeiTuva.dc.html | grep -o '[a-zA-Z]*[iI]d:' | sort | uniq -c
      1 slotId:
```

So every read resolves to `undefined`, every write lands under the string `"undefined"`, and the
prototype has exactly **one comment slot per respondent**, shown on whichever question is on screen.

### Why it is worth an entry rather than a shrug

**It makes a copy claim provably false rather than arguably so.** The `optional` mode advertises
«Et valg per kommentar: anonymt eller med navn» (`V3:5339`). Two independent measurements say it is
not: this one, and the fact that `V3:5362` and `V3:5378` both source the flag from `st.fbAnon`, a
single submission-level toggle. **The bundle already behaves the way Q113 decides**, and only its
prose disagrees — which downgrades Q113 from «we override the bundle's behaviour» to «we correct the
bundle's copy». The weaker claim is the true one and it is the one now written in `01-decisions.md`.

**It corrects something I wrote.** `docs/v3/00-diff.md § 4.2` recorded `qcSaved[id].anon` as
«genuinely per question», reasoning from the storage *shape*. The shape is per-id. The behaviour is
one choice, one slot. A shape is not a behaviour, and I filed the first as the second.

### How it was found, which is the transferable part

Not by reading — by a capture that came back byte-identical to its neighbour and tripped the
harness's duplicate-hash check. The first `stateFrom` body **reimplemented** the prototype's key
derivation (`sv.questions[step].id`) and produced a plausible key and a silently wrong screen. The
second **called the prototype's own `respondList`** and got the key the prototype actually uses.

**Deriving a value the way the system derives it is a different act from deriving it the way you
believe the system derives it**, and only the first can surface a defect in the belief. The harness
now hands `stateFrom` the logic instance for exactly this reason.

### Ours

Nothing is wrong in the running product, because C0 built nothing. C3 builds this surface, and it
builds one comment per question with a real key — the database half in C1 gives
`survey_comments.question_id` its own column and its own uniqueness, so the bundle's defect is not
inheritable even by accident.

---

## D157 — Three fields in the reference harness were enumerations of the bundles that existed

**Found in C0, all three in one sitting, none of them a v3 feature.** The same shape CLAUDE.md's
table already carries eight instances of. They are logged here rather than promoted into that
table because they are one phase's discovery in one file — and because the third is a weaker
member than the other two: a literal-only patch field is a missing capability as much as it is a
mistaken enumeration.

| Field | The enumeration | The property it should have been |
|---|---|---|
| `Bundle.splash: string` | the three bundles that had a splash | «the files THIS bundle handed over» |
| `Screen.only: string[]` | the bundles a screen existed in **when the line was written** | «the bundle it first appeared in, and every later one» |
| `Screen.state` as a literal only | the states reachable without knowing a runtime value | «a patch may depend on what the prototype computes» (`stateFrom`) |

**`only` is the one that would have cost something.** Eight v2 surfaces carried `only: ['v2']`,
which was true when written and false the moment a fourth bundle arrived: v3 contains all eight, and
the filter would have withheld every one from the set they are the target for. Not a crash — eight
missing PNGs in the target baseline, which is «green for something that structurally could not be
seen», the shape this project has hit six times. It is now `since`, and a fifth bundle needs no edit
to any screen line.

**`splash` is the one that would have been *satisfied wrongly*.** A required field invites the
obvious fix — point v3's splash at v2's file — and that is the precise failure the per-screen
declarations exist to prevent: a screen captured from a page its own bundle never drew and then
compared against as though it had. Made optional; a screen whose file its bundle lacks is skipped,
and the run prints that it skipped it.

**The stated limit, because `since` is itself a property with an assumption inside it.** It assumes
screens are added and not removed. That held v2 → v3 and was verified rather than assumed — the
sorted `sc-if` key-set comparison in `docs/v3/00-diff.md`, `comm -23` empty. A handoff that drops a
screen needs an `until`, and the check that would catch it is that same comparison.

---

## D158 — Four negative tests passed against a database with none of the feature

**Found in C1, by the step that exists to find it, on the first occasion in this project where
that step caught something instead of confirming something.**

### What happened

C1's plan says *«negative tests first, proven failing»*. Docker is unavailable in this session, so
the proof is a CI run carrying the tests and no migration: **run 124 — 21 failed, 1046 passed.**

Twenty-seven tests were in the file. **Six passed.** Two of them legitimately: tests 3 and 4 sweep
the catalogue for a reader that must never appear, so «nothing reads a table that does not exist» is
the correct answer and they are forward guards by design — they will start doing work the day a
later phase writes an aggregate over `survey_comments`, which is the whole mechanism (D115).

**The other four were claims wearing a check's clothes**, and every one of them would have kept
passing if the feature had shipped and then been deleted:

| | how it passed on nothing |
|---|---|
| 10 — «the thread payload carries no answer, score or aggregate» | `read.data` was `null`; `JSON.stringify(null)` is `"null"`, which contains none of the forbidden keys. The `pg_proc` lookup that followed then asserted `not.toMatch` **over an empty string**. |
| 13 — «no column merely NAMED like a link to the vault» | looped over `information_schema.columns` for a table that did not exist. **The body ran zero times.** |
| 18 — «an outsider reads nothing at all» | PostgREST errored, `data` was `null`, and `expect([]).toEqual([])` was satisfied by the absence of everything. |
| 26 — «a comment is never a precondition of submitting, at any mode» | set `feedback_mode` on a table with no such column, never checked the update succeeded, and read `.error` off a `null` payload. |

### Why this is worth an entry rather than a fix in silence

**Number 18 is the sharpest, because the project already owns the distinction it failed to make.**
Gate 5a3 separates PROTECTED from PROVEN precisely so that «an empty table passes a cross-org read
check trivially» is reported rather than counted as protection — *«the fixture, not the policy,
would be doing the work»*. I wrote a test that did exactly what 5a3 refuses to do, in the phase
whose subject is the policy.

And it is the same family as **«green for something that structurally could not be seen»**, one
level down. The six instances CLAUDE.md lists are all about a CHECK that could not observe the
thing. These four are about an ASSERTION that could not fail. A gate that cannot see and a test
that cannot fail produce the identical artefact — a green line — and neither is distinguishable
from the real thing by reading it.

### The transferable part

**A negative test is not proven by being written; it is proven by being run before the thing it
guards exists.** That is one CI run per database phase and it is cheap. What it buys is the
difference between twenty-seven checks and twenty-three.

**The mechanical form of the defect is always the same: an assertion over an EMPTY result.** Zero
rows, a null payload, an empty string, a loop with no iterations. So the fix is also uniform —
assert non-vacuity FIRST, in the same test, and say what the count must exceed. All four now do.

**What this does NOT establish.** The remaining twenty-three failed for the right reasons on run
124, which proves they can fail — not that they fail for the RIGHT reason in every future state.
A test that fails because the table is absent could still be vacuous against a table that is
present and empty. Tests 18 and 10 now guard that second case explicitly; the others were not
audited for it, and that is a limit rather than a claim.

---

## D159 — The end-of-survey comment box moves from the thank-you screen to the last question

**C3. A placement deviation forced by CLAUDE.md invariant 2, not chosen for taste.**

### What the bundle draws

`V3:3670-3700` puts «Hva synes du om undersøkelsen?» **inside the `thanked` state** — the
thank-you screen, after the submission. `onFbSend` appends to a local array, which in a prototype
with no database behind it is free.

### Why we cannot

By the time that screen renders, `submit_response` has run: `responded_at` is set and a second call
comes back `already_responded`. **That refusal is Q111 property 2 and it stays exactly as it is** —
it is the property a regression would silently undo, and the whole token capability was scoped so
as not to touch it.

So sending a comment from the thank-you screen needs a SECOND write path, and invariant 2 says
there is one: *«The only write path is `rpc.submit_response` (token-validated, single
transaction)»*. A new RPC that writes comments after `responded_at` is a decision about the
respondent's post-submission write surface, which is larger than a placement question and is not
C3's to take.

### What we do instead

The box sits at the end of the LAST STEP, above the submit button, and its text rides along in
`p_comments` with `question_id = null`. The thank-you screen then renders the bundle's `fbSent`
confirmation — **only when a survey-level comment actually went with the submission**, because a
confirmation of something that did not happen is a fabricated value and survives into screenshots
as though it were true.

### The part that is not a loss

A respondent who closes the tab on the thank-you page now loses nothing. Under the bundle's
placement, a comment typed there and abandoned is a message the respondent believes she sent. The
deviation is a fidelity cost and a correctness gain, and it is worth stating which is which rather
than only the first.

### If this should be reversed

It needs a decision, not a patch: a post-submission comment-write capability on the invitation
token, scoped the way Q111 scoped the read. `get_comment_thread` is the shape it would follow.
Nothing in C1–C5 depends on the answer.

---

## D160 — Two of the feedback row's six tags are rendered, and «Lag oppgave» is drawn disabled

**C4. Both are things the bundle draws that the product does not do, and both are logged rather
than quietly dropped — a reviewer comparing the screen to the drawing will count fewer chips and
find a dead button, and should find the reason here instead of asking.**

### The tags — four of six not built (Q116)

The bundle tags a feedback row with one of six values: `Ny`, `Samtale`, `Resultater`, `Ros`,
`Spørsmålene`, `Utsending`. In the bundle itself **only `Ny` has a writer** (`onFbSend` sets it);
the other five are strings in `DEFAULT_FEEDBACK`.

Two of the six are FACTS about the row and are derived:

| bundle tag | ours | derived from |
|---|---|---|
| `Ny` | «Ubehandlet» | `handled_at is null` |
| `Samtale` | the reply thread's presence | `survey_comment_replies` |

The other four are TOPICAL, and nothing in this product classifies a comment by topic. Building
them means either a `tag` column with no writer — the standing question's fifth instance, in the
tranche that closed the previous four — or inventing a classifier this plan does not have.

**«Derive, do not duplicate» (Q61) and «never fabricate data in the UI», applied at the schema
rather than at the screen.** There is no `tag` column.

### «Lag oppgave» — drawn, rendered, and deliberately disabled

The bundle's row offers a button that turns a comment into a task. It is rendered in its design
treatment, at 45% opacity, with a `title` saying why — **not hidden**, because a control that
vanishes teaches nothing and this one has a real reason.

The reason is Q72. `tasks.source_kind` admits `manuell` and `survey`; `source_ref` is a foreign key
to `public.surveys` and to nothing else, *deliberately* — «an untyped uuid is how a task ends up
referencing another organisation's row». Widening it to reach a comment is a migration, and behind
the migration is a **disclosure question**: the task register is readable in full by a `leser`
(`tasks_sel` is `is_org_member`), and a task created from a comment would carry a respondent's own
words into it.

That is the same shape as the V2-4 finding this screen already guards against — the bundle's own
fixture ships a task whose source reads «Psykososial kartlegging · under terskel», which discloses
that a specific small group scored badly. **A decision about what a task may CONTAIN is not a
wiring job and is not taken in a UI phase.**

**What it would take:** a decision on Q72 for comment-sourced tasks, then a migration widening
`source_kind` and adding a second typed FK. The disabled button and its sentence are the honest
interim, and they are cheaper to remove than a feature is to unbuild.

---

## D161 — The workspace's per-person choice is a COOKIE, and the org default gets a control the bundle never drew

**W0 · DECISIONS Q122.** Two departures from v4, both forced, both logged here because the
mechanism is not in the bundle and that has to be visible.

### The cookie

**The bundle** holds the choice in `localStorage` (`V4:6059`,
`localStorage.setItem("heituva.workspace", v)`) and says so in the Tilpasset hint: «Valget huskes
på denne enheten.»

**We store it in a cookie.** Not a preference between mechanisms — **one of them does not work
here**. `wsShow.*` decides which modules Oversikt renders, Oversikt is a server component, and a
`localStorage` value is not readable at server render. Keeping the bundle's mechanism would mean
painting the organisation's default and swapping on hydration — a visible flash of the wrong
modules on every load — or making Oversikt a client component, which is a bigger change than the
feature.

**A cookie is the smallest thing that is readable where the decision is made AND still per-device**,
which is the half that matters for the copy: «huskes på denne enheten» stays TRUE of a cookie and
would become false of a column. Of the three options this was the only one that did not also
require changing a sentence the bundle wrote.

**What is NOT stored anywhere**: a per-person workspace column. `tests/db/workspaces.test.ts`
asserts `org_members` has no column matching `workspace`, so the absence is checked rather than
remembered.

### The Firma control

**No bundle draws a control for the organisation's default.** v4 draws the header chip, which is
the per-person choice; `ORG_WORKSPACE = "hr"` (`V4:4441`) is a hard-coded constant in the prototype
with nothing behind it. So the org default is **genuinely unspecified**, and CLAUDE.md's rule for
that is the minimal consistent option, logged — not an invention, and not a guess at a screen.

Minimal and consistent means **this form and this control**: Q50's `timezone` is the exact
precedent one label above it — an organisation-level default, a `<select>`, in Administrasjon →
Firma — so the styling is taken from it rather than chosen, `touch-44-field` included and for the
same measured reason (a `<select>` renders shorter than an `<input>` at the same padding, and CI
measured 300×44 at 390px).

**Why a control had to exist at all in this phase:** CLAUDE.md's standing question. A column whose
writer is «a later phase» is the shape this project has hit four times — fully built, fully read,
green on every gate, reachable only from psql. `saveCompany` writes it, and
`tests/db/workspaces.test.ts` asserts that the action exists, writes the column, and writes the
*validated* value rather than a literal.


## D162 — No gate makes an HTTP request to an API route, so reachability is guarded by a proxy

**I1-2, 2026-09-12.**

`tests/db/scim-endpoint.test.ts` calls the SCIM route handlers directly as functions. That is
deliberate and good: the handlers are plain functions over `Request`, so the bearer check, the Zod
boundary, the tenancy scope and the SCIM envelope are all in the normal suite on every run, with no
gate added and no server to go stale — the failure that produced a 6464-finding scare on 2026-09-12.

**It is also why all twenty-two of those tests passed while the endpoint was unreachable in
production.** Next's middleware matcher catches `/api/scim/*`; the public-path list in
`lib/supabase/middleware.ts` did not name it; so an unauthenticated SCIM request was answered with a
**307 to `/logg-inn`** — an HTML login page, sent to a machine that speaks JSON. Entra would have
reported it as an unintelligible failure and quarantined the connector.

**Found by reading the middleware, not by any gate.** Fixed there, then measured against a real
server built from this commit:

```
--- no auth ---              401 application/scim+json
{"schemas":["urn:ietf:params:scim:api:messages:2.0:Error"],"status":"401",...}
--- bad secret ---           401
--- ServiceProviderConfig -- 200, bulk.supported=false, filter.maxResults=200
--- Users?count=2 ---        total 6  page 2  first admin@nordiskstudio.test
```

**THE LIMIT.** Test 23 asserts the LINE exists, so deleting it fails. It does not prove the route is
served: only an HTTP request to a running server is that, and **no gate in this repository makes one
for an API route.** `verify:browser` drives a browser through the routes manifest, which is a
manifest of SCREENS — a JSON endpoint has no screenshot and forcing one in would be the wrong shape.

Recorded rather than closed because the apparatus is frozen: a check the gates cannot make is logged
as a limit, not built mid-phase. The honest next step, when the freeze lifts, is one HTTP assertion
inside a gate that already runs a server.

**And the meta-finding, which is the useful half.** The measurement that caught the stale server was
`curl` returning a 307 *with* a valid token — and the reason the first attempt measured nothing at
all is that I started the server BY HAND with `next start` instead of through
`scripts/verify/server.ts`, whose `servesOurBuild()` guard exists for exactly this and which I wrote
two commits earlier. `EADDRINUSE` in a backgrounded log, two stale `next-server` processes (v16.2.11
and v15.5.25) still holding port 3100, and a measurement of the OLD build reported as a measurement
of the new one. **A guard you route around is not a guard**, and the thing that saved it was checking
`_buildManifest.js` for our own BUILD_ID before believing the result.


## D163 — Integrasjoner is built to the bundle's layout and to the product's real capabilities

**I1-3, 2026-09-12.** `HeiTuva.dc.html:2869-2926`.

The instruction named the finding and the sweep confirmed it is larger than one line. The bundle's
`intConnected` computes **«4 aktive tilkoblinger»** from a literal in its own fixture —
`{ entra:1, hr:1, teams:1, brreg:1 }` — and **none of the four exists**. Every status chip on that
screen is a mock's guess. A count is the easiest false claim to ship because it looks like
arithmetic.

**Four deviations, each with what it would otherwise have promised.**

1. **The count and the Entra row are READ FROM THE CONNECTION** (`scim_connection_status`, which
   reads the credential). If nothing is connected, the screen says so.

2. **The other thirteen rows say «Ikke tilgjengelig» with the control disabled**, where the bundle
   says «Ikke tilkoblet» with a live «Koble til». The rows stay because the screen's whole purpose
   is the customer's question «what can this thing talk to», and the honest answer includes «not
   yet» — but *«Ikke tilkoblet» beside a working button is a promise that you could connect this
   today*. Same treatment as V2-3a's unavailable Målgrupper cards and D160's disabled «Lag oppgave».

3. **A FOURTH STATE, «Feiler», which the bundle does not have.** Its three — Tilkoblet, Trenger
   oppsett, Ikke tilkoblet — cannot say «this connector has been erroring since Tuesday», and that
   is the exact failure I1-2 exists to make loud: a connector that silently stops looks identical to
   a customer with no staff changes, and the first sign would be a survey that reaches nobody.
   A token nobody has used yet is «Trenger oppsett» rather than «Tilkoblet», for the same reason:
   «Tilkoblet» would be a claim about the other end of a connection this product has never heard
   from.

4. **The API-nøkkel and Webhooks cards are NOT BUILT AT ALL.** Q89 decided the public API and
   webhooks are not built, and the bundle renders a fabricated key
   (`ht_live_9f2c··············a41`) and a fabricated rotation date («Sist rotert 12. mars 2026»)
   for a capability that does not exist. Rendering them disabled would still advertise them.

**THE CLAIM-SET SWEEP OVER THIS SCREEN'S PROSE FOUND THREE MORE, INSIDE THE ROWS.** Copy is where
nothing mechanical protects you, and a «Henter: …» line is a promise about what leaves the
customer's systems:

- Entra's row said **«Ansatte, grupper, ledernivå og sluttdato via SCIM»**. Three of those four are
  false against what I1-1 built: `scim_upsert_member` deliberately writes neither `role` nor
  `group_id` (Q139), and **there is no end-date column anywhere** — SCIM carries `active`, a
  boolean, not a date. Rewritten to what the connector actually does.
- The HR row promised **«kjønn»**. There is no gender column anywhere in this schema — the identical
  false promise CLAUDE.md records «Kjønnsdelt rapport» making on a public page. Dropped.
- `dataFlowNote` said **«Lønn hentes aggregert per stillingsgruppe, aldri per person»**, a promise
  about handling salary data this product does not touch at all. A promise about data you never
  receive is not a reassurance, it is a claim that you receive it. Dropped; the anonymity sentence,
  which IS true, stays.

**A fifth, small and worth naming: the connected row's CTA reads «Trekk tilbake», not the bundle's
«Innstillinger».** «Innstillinger» promises a settings panel, and there is none — the only thing an
administrator can do to a live connector is revoke its key. The control says what it does.

**And a sixth: the card below the list is «Tilgangsnøkkel», not the bundle's «API-nøkkel».** It is a
SCIM bearer credential, not an API key, and Q89 means there is no API for a key to open. Naming it
«API-nøkkel» would advertise the thing Q151 declined to build, in one word.

`tests/unit/integrations.test.ts` asserts all of it over the SHIPPED STRINGS in both languages —
including that no line contains `kjønn`, `sluttdato`, `ledernivå` or `stillingsprosent`, and that
every key the panel builds by concatenation actually resolves, since a missing one renders as a raw
key on a customer's screen.

**And Q142's debt, discharged on the Brukere row.** No bundle draws a directory marker there, so it
is an unspecified STATE of an existing screen rather than an invented feature, and it takes the
minimal consistent treatment: one 11px muted line under the status. Two facts, and only the second
is a warning — «Styres av Entra ID» when `source = 'scim'`, and **«Endret her — Entra ID overskriver
ved neste synkronisering»** when the status showing is a hand override the next sync will undo.
Without the second, an administrator watches their own change disappear with no explanation.

## D164 — the v5 shell: four footer claims removed, one rail moved, one invented target found live

**V5-1, 2026-09-12.** `v5:5145-5179` (footer), `v5:160-161` and `v5:227-234` (shell card and subnav).

### The footer ships on every page, so four of its five assertions do not ship at all

| Drawn | Shipped | Because |
|---|---|---|
| «Data lagres i **Norge** og EØS» | «Data lagres i EØS» | Supabase is eu-central-1 (Frankfurt), Vercel answers from fra1, Brevo is French. **Nothing is in Norway.** Hard-coded in the MARKUP at `v5:5154`, not in a `foot*` data key — so the fix is a literal in a component, which is also why a grep of the data block missed it first time. |
| «DPIA gjennomført» badge | *removed* | The DPIA has not been started. On a compliance product this is the most load-bearing false claim available. |
| «Alle tjenester kjører normalt» | *removed* | A string literal at `v5:7674` with no health source. **A status indicator that cannot report trouble is worse than none, because it is believed.** |
| «Versjon 2.4 · september 2026» | *removed* | Zero version columns in the schema, `package.json` says `0.1.0`, zero «Versjon» in shipped copy. It is the example the never-fabricate rule actually gives — «a hard-coded `v1`» — in the footer, on every page. |
| «{company} er behandlingsansvarlig» | «HeiTuva er databehandler» | **The subject changed, not the sentence.** `organizations` holds `name, orgnr, address, contact_name, contact_email, dpo, …` and **no legal-role column**. Tor's rule was «either the column exists or the sentence does not» — and a column would be wrong too: its value is identical for every customer, so it is a constant wearing a column's clothes. So the footer asserts what we DO hold, which is our own role. The full statement lives in the databehandleravtale, where a legal statement belongs, and the badge links to it. |

The badge «Databehandleravtale» **stays, and what it claims is stated**: that the document exists and
is reachable, which it is (`/databehandleravtale` is a real public route). It does **not** claim the
text is reviewed — it is not, and that page carries its own draft banner.

**The bottom row therefore has one child where the drawing has three**, so it reads left-aligned
instead of `space-between`. That is the honest consequence of removing a fake status and a fake
version, not a layout preference.

**`hjelp@heituva.no` is not shipped either.** The bundle's help channel carries it with «svar innen
én arbeidsdag» — a service-level promise on a domain this project has recorded twice as never having
been HeiTuva's. A third invented address is not introduced; the two that exist are held in
`docs/LEGAL_DRAFTS.md` until a mailbox is confirmed to RECEIVE.

### The shell is now a card containing the header, not a header that IS the card

`v5:160` moves the frame width, the border, the 16px radius and the shadow onto a WRAPPER and leaves
the header element with a background and `border-radius:{{ headRadius }}` — 15px, or `15px 15px 0 0`
where the subnav attaches. **The 15px is not a drift from the theme's 16px**: an inner fill inside a
16px border needs one pixel less, or the border shows through at the corner. v4 had no `headRadius`
key at all, because its header *was* the outer card.

The radius is decided in CSS by `.shell-card:has(> nav)`, not in the component. `AppHeader` is a
server component and cannot read the pathname, and `overflow:hidden` — the other way to get these
corners — would clip the user menu and the mobile nav, which are absolutely positioned precisely to
escape this box. **`:has()` keys the radius on whether the subnav ACTUALLY rendered** rather than on
a second copy of the which-screens rule; two copies disagree the first time one moves.

### The subnav ships on two screens, not five — and it ABSORBS the rail it duplicates

The bundle puts it on `uitest`, `admin`, `tasks`, `dashboard`, `reports`. **On every screen where it
appears, v5 also keeps the in-page rail carrying the same items** — `insightTabs` at `v5:1321`,
`adminTabs` at `v5:5195`, the `tfView` rail on tasks. A mock accumulates; a product should not carry
two controls doing one job.

**The test for whether the shell rail may absorb the in-page one is whether its item list is
COMPLETE**, and it is measurable rather than a preference:

- **`dashboard` / `rapporter` — yes.** The subnav lists Dashboard and Rapporter, which is exactly
  the two screens that exist. `components/InsightTabs.tsx` is **deleted** and the subnav is its home.
- **`admin` — no.** The subnav lists **six** tabs where nine exist, missing Profil og avsender,
  Målgrupper and Språk; the bundle's own in-page `adminTabs` has eight. The six-item list is an
  enumeration of the tabs that existed when it was drawn — row 5 of CLAUDE.md's table, one screen
  over. `AdminTabs` stays and admin gets no subnav. **If a later phase wants it there, what it
  replaces is `AdminTabs` — it does not supplement it.**
- **`tasks` — V5-2's**, because that rail is the screen's own filter state.
- **`uitest` — refused** (§ 0.3d).

**`subnavLabel` has four branches for five screens** — `dashboard` and `reports` share «Innsikt».
Built as drawn, noted because «a label per screen» is true of three of the five.

**I introduced the duplication I had just argued against, and only the screenshot showed it.** The
first build rendered the subnav on dashboard with `InsightTabs` still in the page body — two
Dashboard/Rapporter rails, one above the other, all gates green. No assertion reaches «these two
controls do the same thing»; opening the capture does.

### AND THE ONE THAT WAS ALREADY LIVE: «over målet på 70 %»

Chasing the bundle's `c.hasGoal` — a goal marker drawn at `left:70%` titled «Mål: 70 %», with the 70
a literal — turned up **the same invented target already shipped**:

```
dashboard.statRateAbove: "over målet på 70 %"
dashboard.statRateBelow: "under målet på 70 %"
DashboardScreen.tsx:127   pct >= 70 ? statRateAbove : statRateBelow
```

**There is no goal column anywhere in the schema**, so every organisation was being told it was above
or below a response-rate target nobody had set — with the 70 written twice, once in code and once
inside the sentence. It is worse than the bundle's marker, because a marker is a tick on a bar and a
sentence is read as *your* target.

Both keys are gone and the note now says what the number IS — `{n} av {invited} inviterte har
svart`, the same treatment the card beside it already gives. **Setting response-rate targets is a
feature, and it is one nobody has asked for.** The bundle's marker is not built either.

One slip worth recording because it is the defect class this project has been bitten by: the first
edit put the new key under `dash` where the screen reads `dashboard`, which `tsc` cannot see and
which renders **a raw key**. Caught by grepping for the old string and finding it still present —
not by a type check.


## D165 — the Arbeidsliste: five buckets, five board columns, one date control and no bar on a comment

**V5-2.** v5:3128-3374 replaces C4's screen. Four things are drawn one way and built another, and the
first two are the same mistake twice — **four names used for five states, with the surplus state
pushed into whichever name was nearest**. That is CLAUDE.md's own shape arriving in a layout instead
of in a guard.

**1. A FIFTH BUCKET, «Uten frist».** `bucketOf` (v5:6982) is
`/om 7|i dag|sep/.test(it.due)` — a regex over a FORMATTED STRING, which is what a prototype with no
dates does — and it files an unhandled comment under «Denne uken». A comment has no deadline: aml.
§ 4-3 puts no clock on one, and `survey_comments` has no column that could hold one. «Denne uken»
over such a row is a claim about when it is due, which is the never-fabricate rule with a date in
place of a number. The bundle files a DATELESS TASK under «Senere», which is the same claim about the
same absence, so both go to the one new bucket rather than one each.

`tests/unit/worklist-rows.test.ts` asserts it as a property over the whole status enum rather than
over the two cases I thought of: *no row without a deadline lands in a temporal bucket.*

**2. A FIFTH BOARD COLUMN, «Effektvurdert».** `inboxColumn` (v5:6199) collapses six lifecycle states
into four with `i === 3 ? 2 : 3`, which puts `effektvurdert` under «Lukket». **That is the one
distinction Q69 exists to protect** — aml. § 3-1 and ldl. § 26 fjerde ledd are about the gap between
«the effect is assessed» and «we are done» — and a board that closes it visually is a compliance
record that misdescribes itself. No invented copy: `taskStepEffektvurdert` is already a message. The
grid is `repeat(auto-fit,minmax(210px,1fr))`, so five columns need no layout change at all.

`columnOf` THROWS on a status it has not been taught, rather than filing it under «Nytt» — the same
shape as `app.member_blocks_invitation`'s else branch, so a seventh lifecycle step fails a test in
the commit that adds it.

**3. NO PROGRESS BAR ON A COMMENT ROW.** v5:3256 renders `handled ? 100 : 20`. **20 is an invented
denominator over an unknown numerator**, which is the never-fabricate rule's own worked example. A
comment has no progress, so it gets no bar; a task's bar is the step reached over the six the
register defines, which is real.

**4. THE DEADLINE IS `<input type="date">`, NOT FREE TEXT** — CLAUDE.md's control substitution, and
the single allowed exception used as written. v5:3202 and v5:3292 take «om 14 dager» and «f.eks. 1.
okt» as strings because the prototype has no database; `tasks.due_at` is a `date`. The same
substitution applies to the bulk bar's deadline field. Styled as every other field on the screen is,
and carrying `touch-44-field` rather than `touch-44` — a date input is a REPLACED element, on which
`::after` renders nothing at all, which is the utility C4 got wrong on a `<select>` one phase ago.

**AND ONE THING THE SCREEN KEEPS THAT THE BUNDLE DOES NOT DRAW.** Q97's close confirmation. `lukket`
is terminal and the drawing has no such step; it stays, because closing is the only irreversible
action on the register and the remedy for a mistake is a new task referencing the closed one
(`corrects_task_id`, a real column).

**WHAT IS NOT BUILT, AND WHY THE SENTENCE STAYS WHERE THE CONTROL WOULD BE.** «Lag tiltak»
(v5:3316), unchanged from C4: what a task may CONTAIN when its source is a respondent's own words is
Q72's question, on a register a `leser` reads in full — a decision about disclosure, not a wiring
job. And «Lukk valgte» (v5:3232), on Tor's decision, for which see Q158; the measurement is that it
could never have worked anyway — `guard_task_close` refuses `foreslatt -> lukket` as a skipped step
and `gjennomfort -> effektvurdert` without an assessment row, so a bulk close would have failed on
every selection that was not already at `effektvurdert`.

**THE SUBNAV RAIL MOVED BACK INTO THE SHELL, WHICH CORRECTS D164.** V5-1 rendered «Alt · Oppgaver ·
Tilbakemeldinger» nowhere and said V5-2 would put it in the screen, because the filter was client
state and the shell is a server component. V5-2 put the filter in the URL instead — `?type=` — which
both halves can read, so the rail is where v5:6331 draws it and the screen holds no second copy. The
`aria-current` comparison had to change with it: all three pills share a path, so `pathname === href`
would have marked all three as current; it compares the parameter the screen actually filters on, and
resolves an absent value to «alle» exactly as the page does.

## D166 — the Entra detail page: a pull drawing over a push integration

**V5-3.** v5:3819-3902 is the first of the two states `__3_` adds over `__2_`, and it is built as the
drawing with every value read from a connection that exists. Six sections; **four of them change,
and all four change for one reason.**

**THE MEASUREMENT FIRST, because the reason is a fact and not a reading of the drawing.**

```
grep -rln 'graph.microsoft.com\|User.Read.All\|client_credentials' app lib supabase scripts
→ (nothing)
```

No Microsoft Graph client, no client id, no consent flow, no scheduler. What exists is SCIM 2.0:
**Entra POSTs to `/api/scim/v2/Users`** with a bearer token the customer pastes into Entra. The
bundle's page describes HeiTuva reaching into Graph on a schedule. Every difference below follows
from that.

| Section | v5 draws | What is built |
|---|---|---|
| Header | tenant `nordiskstudio.onmicrosoft.com` · protocol · status | **The protocol alone.** SCIM hands us a bearer token, not a directory identity; there is no tenant id in the schema. Status is `scim_connection_status`. |
| Header | «Sist synkronisert — I dag kl. 06:00» | `last_used_at` — the last time Entra actually called us, which is the one sync fact this side knows. |
| Header | «Neste synk — I morgen kl. 06:00» | **«Bestemmes i Entra».** Push: the provisioning cycle is configured in Entra and we are never told it. A test asserts the string contains no time pattern. |
| «Felter vi henter» (8) | eight attributes, all as though read | **«Felter vi mottar»** — we receive, we fetch nothing. Three land in a column (`displayName`, `userName`, `active`) plus `externalId`; five render their refusal. Q159–Q161. |
| «Tillatelser» (3 Graph scopes) | `User.Read.All`, `Group.Read.All`, `Directory.Read.All` | **What the token can do, in the direction it runs**: `GET /Users`, `POST · PUT · PATCH /Users`, and «Ingen tilgang til katalogen» — the strongest form of the bundle's own «HeiTuva skriver aldri tilbake». |
| «Grupper i synk» (4 rows) | Produktteamet 34, Design 11, … | **None, and why.** `ResourceTypes` declares one resource, `User`; every other path 404s. `groups.source` and `groups.synced_at` exist (V2-3a) and are null on every row. |
| «Slik kobler dere til» | 4 steps, incl. «Gi samtykke» and «Kjør første synk» | 4 steps for the push flow. No consent screen and no run button exist. **The one section that is content rather than state**, so it renders before a connection does — the bundle's own observation, and it holds. |
| «Synklogg» (4 rows) | «4 nye, 1 deaktivert» etc. | **The latest outcome, one row, saying so.** Q162: a log table is not built, and the reason is in the copy — a per-sync record of who arrived and who was deactivated is personal data about staff and needs a purpose and a retention period before it needs a schema. |

**THE FIELD LIST RENDERS ITS REFUSALS RATHER THAN DROPPING ROWS, and that is the point of the
section.** «Ingenting utover dette leses fra katalogen» is only checkable if the list says what it
does NOT read. Five rows carry a reason:

* `manager`, `employeeHireDate`, `employeeLeaveDateTime` — **one reason, shared**, on Tor's
  decision: *a directory field describes a person; it does not decide what the product does to her.*
  The test asserts they share a single refusal KEY, so three near-identical sentences cannot drift.
* `department` — the columns exist and nothing writes them; no `/Groups` resource.
* `jobTitle` — `profiles.job_title` exists and is **what the person wrote about her own job**.
  Having the column is exactly what makes writing it from a directory wrong.

**ONE TEST WAS RESTATED RATHER THAN WIDENED, and the restatement is worth recording.**
`tests/unit/integrations.test.ts` test 8 forbade five words across every `integrations.*` value. This
page names «Sluttdato» **on purpose, in order to refuse it**, so the test went red on correct code.
The property is not «the word never appears» but «the word appears only where the page also says it
is not read» — and the exemption is DERIVED from `DIRECTORY_FIELDS`, not from a list of keys: a field
moved from refused to built loses its exemption automatically and would then have to be true of the
schema. `kjønn`/`gender` remain absolutely forbidden and are not exemptible, because they belong to
`lonn`.

**`lonn` IS A ROUTE THAT DOES NOT EXIST**, and the test asserts the absence of the file rather than
the presence of a notice. A page that exists is a feature whatever its content.

**ONE LINK, ON ONE ROW.** The list screen's Entra row gets «Åpne detaljer»; the other thirteen do
not, because a link from a row whose status is «Ikke tilgjengelig» would open a page describing a
connection that cannot exist.

## D167 — five 320px blockers on the report sheet: a real focus escape, made visible by V5-1's footer

**V5-2/V5-3's verification pass. THE FIRST VERSION OF THIS ENTRY WAS WRONG AND IS REPLACED RATHER
THAN AMENDED**, because the wrong version is the more instructive half.

**What I first concluded.** `verify:responsive` reported **eight blockers on
`rapport-editor/filter` @320px**, each pairing a survey-filter row against a FOOTER link:

```
[blocker] rapport-editor/filter @320px — hit areas overlap by 9768px²:
          "Send-biennial-1789233008141-40mqfaktiv · 0" / "Brukere og grupper"
```

`select count(*) from public.surveys` returned **465** against a demo seed that makes eight — the
rest timestamped rows left by repeated runs of `verify:send`, `verify:roundtrip` and
`verify:interaction`. A reset to eight surveys produced **zero findings**. So I wrote this up as
fixture pollution.

**WHY THAT WAS WRONG.** Re-measured in `verify:all`'s own order — reset, demo seed, full test suite,
then the gate — the database holds **103** surveys and the gate reports **five of the eight
blockers, same route, same pairing.** One db-suite run is enough. The count of 465 was true and it
was not the cause; **the thing measured was not the thing claimed**, for the fourth time in one day
after the Docker daemon, the stale `next-server` and the production catch-all.

**THE ACTUAL CAUSE, AND IT IS A REAL DEFECT.** `ReportSidePanel.tsx:146` renders the mobile sheet as
`fixed inset-0 z-[70] … bg-bg` — an opaque full-screen overlay **inside the page subtree**. A tap at
320px reaches the sheet, so the overlap is not a tap conflict. **Focus is a separate axis:** with the
layer beneath not inerted, Tab from inside the open sheet walks into the app header and — since
V5-1 — into the footer's twelve links behind it.

Three things make this worth the entry rather than a line in a list:

* **The gate had written the answer down.** `scripts/verify/responsive.ts:87-96`: *«Focus is a
  separate axis and is not fixed by this: a control that cannot be tapped can still be reached with
  Tab, which is why the dialogs mark the layer beneath them `inert` rather than relying on paint
  order.»* And its element filter skips `el.closest('[inert]')` for exactly that reason.
* **The remedy already exists and this one panel does not use it.** `components/ModalLayer.tsx`
  portals an overlay to `document.body` and inerts every other body child; its own header says *«An
  `aria-modal` dialog whose background is still reachable with Tab is not modal»*. The wizard
  (`Wizard.tsx`) and the Builder's sheet (`Builder.tsx`) both use it. `ReportSidePanel` does not.
* **It needed the footer to become visible.** Before V5-1 there was nothing below the page for the
  sheet to overlap, and the survey list had to be long enough for its rows to reach that far down —
  which is why 8 surveys hides it and 103 shows it. A defect that needs two unrelated changes to
  surface is the kind that sits for phases.

**NOT FIXED IN THIS TRANCHE, AND THAT IS THE ONE-PASS RULE APPLIED RATHER THAN AVOIDED.** The panel
is 528 lines of V1-era code neither V5-2 nor V5-3 touched, and the fix is not a class change: at `xl`
the same node is the in-layout panel (`xl:static xl:bg-transparent`), so portalling it
unconditionally would lift the desktop panel out of its grid cell. It needs the portal to be
conditional on width as well as on `sheetOpen`, which is a restructure of the component's render.

**The half-fixes were considered and refused**, because CLAUDE.md already records what they cost:
`inert` on just the header and footer would silence the gate and leave the editor's own content
behind the sheet focusable — *«a fix that relocates a leak instead of closing it is not a fix»*, and
this is the third time that paragraph has applied to a focus escape. Logged for the next phase with
the diagnosis and the mechanism named, so it starts from here rather than from a gate line.

**The two findings in the same run that WERE this tranche's are fixed** (D165, D166) and reproduce on
neither fixture afterwards: the five touch defects on the Arbeidsliste's row button — a comment row
paints 38px tall because it has no progress bar — and the 320px horizontal overflow on the Entra
page, caused by a `whitespace-nowrap` monospace key beside a `flex-1` label with no `min-w-0`.

**AND THE MIRROR IMAGE, ON THE SAME GATE, WHICH IS A FIXTURE FACT AND NOT A DEFECT.** On a bare reset
`resultater/bransje-valgt` reports **HARNESS FAILURE: 2 combination(s) were never measured** — the
state clicks a benchmark link named «Teknologi og IT», and `supabase/seed.sql:164-166` says in as
many words that benchmarks are **deliberately not seeded** («real benchmarks arrive the day there is
a source»). The only writer of that row is `tests/invariants/k-surface.test.ts`, so the state is
reachable only after the db suite — which is `verify:all`'s order, and why it is green there and only
there. Same shape as the six-tables-unproven note CLAUDE.md carries for Gate 5a3: **run order
changes what a gate can prove, not the number.**

## D168 — SCIM push removed, Entra pull built, and the four columns that did not know the difference

**I2.** The direction changed and the schema mostly did not have to. Recorded because the *shape* of
that is the useful part: what survived a transport swap is exactly what described the PERSON rather
than the wire.

**REMOVED (M:0114).** The route `app/api/scim/v2/[...path]/route.ts`, `lib/scim/{auth,resource}.ts`,
`public.scim_credentials`, eleven `scim_*` functions, the middleware's public-path line, the seed
block, three message keys, and two test files (37 tests). **2 329 lines.**

**KEPT, AND THIS IS WHY IT IS NOT A ROLLBACK.** `org_members.{external_id, synced_at, source,
status_source}` — added by `M:0109` for SCIM — all four stay, because they describe a member
*sourced from a directory* and that is direction-agnostic. Pull writes every one. Q142's «Endret her
— Entra ID overskriver ved neste synkronisering» stays true in the same words.

**AND ONE OF THEM STILL BROKE, WHICH IS THE INSTRUCTIVE HALF (M:0117).**
`org_members_status_source_check` was `('local','scim')` — an enumeration of the transports that
existed — and the column means *which SIDE last wrote `status`*. Removing the transport turned a
value into a constraint violation, found by `app.entra_apply_page`'s very first run. Restated
`('local','directory')`: there are two sides and there have only ever been two. **Fix the column,
not the predicate** — a third disjunct would have left the next directory to break it again. The
Q142 reader on Brukere compared against `'scim'` on both columns and would have silently stopped
firing; it now compares `source !== 'local'` against `status_source === 'local'`, which is the
question it was always asking.

**THE SCREEN REVERSES FOUR OF D166's SIX REFUSALS**, and each reversal has its own reason rather
than «pull, so now we can»:

| Section | D166 (push) | I2 (pull) |
|---|---|---|
| Tenant | not rendered — SCIM hands a token, not an identity | **rendered.** Consent hands us the tenant, and confirming the right directory is what that field is FOR |
| «Neste synk» | «Bestemmes i Entra» | **a cadence** — «hver natt kl. 03», true of `M:0118`'s cron line. Still not a timestamp: a cadence describes the job, «I morgen kl. 06:00» would describe nothing |
| «Sist synkronisert» | when Entra last called | **when a sync last COMPLETED** — `entra_record_sync` advances it only on success, so a run that died on page 4 leaves yesterday standing |
| «Tillatelser» | the bearer token's capabilities | **real Graph scopes, read back from what was consented** — and ONE of them (Q167) |
| «Grupper i synk» | none — no `/Groups` resource | **departments**, with the distinction said out loud (Q166) |
| «Synklogg» | latest outcome, no table | **unchanged.** Q170 stands |

**A GATE'S ASSUMPTION SHOWED UP AS A CRASH, AND THE TABLE CONFORMED RATHER THAN THE GATE.** Gate 5a3
probes every RLS table with `select id from <table> where org_id = …`; `entra_connections` was keyed
on `org_id` alone and the sweep failed to parse. The apparatus is frozen, so the table gained a
surrogate `id` and kept its claim in `unique (org_id)`. **«Every org-scoped RLS table has an `id`» is
itself an enumeration** — true of the forty that existed — and it is logged here rather than fixed,
because fixing a gate mid-phase is the thing the freeze exists to prevent.

**AND THE CENSUS GUARD COULD NOT TELL A DELETION FROM A SKIPPED RUN**, correctly: it refuses to write
from a partial run, and two files being absent looks identical whether they were deleted or never
collected. The two entries were removed by hand and the census then written from a full run. That is
the deliberate-decrease case Q163's rule rewrite is about, arriving in the mechanism rather than in
the number.

## D169 — D167 closed: the report sheet is a portal below `xl`

**I2-4.** V5-2 logged this rather than half-fixing it, and the reason it needed a phase of its own
holds up: at `xl` the same node is the in-layout panel (`xl:static`, its own grid cell), so
portalling it unconditionally would lift the desktop panel out of the page. A class change could not
express that.

The fix is a render restructure. `isWide` comes from `matchMedia('(min-width: 1280px)')`, starts
`false` so SSR and first paint agree, and the only path to the portal is a CLICK — by which time the
effect has long run, so there is no flash. Below `xl` with the sheet open, the children render inside
`ModalLayer`, which portals to `document.body` and marks every other body child `inert`.

**The defect was never a tap conflict.** `fixed inset-0 z-[70]` means a tap reaches the sheet.
**Focus is a separate axis**, and with the layer beneath not inerted, Tab from inside the open sheet
walked into the app header and — since V5-1 put one there — into the footer's twelve links. The
gate's own comment says it: *«the dialogs mark the layer beneath them `inert` rather than relying on
paint order»*. `ModalLayer` existed, the wizard and the Builder's sheet used it, and this panel did
not.

The children are the same subtree in both branches, and every piece of state they read lives in
`ReportSidePanel` — so moving them between parents cannot lose the half-typed value in the Del panel,
which is what the old `hidden`-rather-than-unmounted comment was protecting.

## D170 — the library's tab rail moved to the shell, and the hero icon is ours

**Q172, Tor, 2026-09-13.** «Implement the same sub menu style as handlinger to library
(bibliotek) making Maler and Spørsmålsbank sub menu items. Also wrap maler and spørsmålsbank
into the same layout as handlinger with the box, heading and filter.»

**THE BUNDLE DRAWS THIS RAIL IN-PAGE, AND THAT IS MEASURED RATHER THAN ASSUMED.** v5's
`libTabs` (v5:8324) renders at v5:4082 — a pill rail beside the 28px «Bibliotek» heading,
inside the page — and `subnavLabel` (v5:6320) has four branches, none of them the library.
So the subnav is a DEPARTURE from the handoff on this screen, decided by Tor, not a reading
of it. `AppSubnav`'s header records the same fact in the place a future phase will look.

**The condition the move rests on is met and is asserted, not asserted-to-be-met.**
`AppSubnav` refuses the subnav on `admin` precisely because that screen would then carry two
controls doing one job, one of them three tabs out of date. The library only gets to have it
because the in-page rail is GONE — so `tests/unit/library-tabs.test.ts` asserts the page
builds no tab set of its own and links to a strict subset of the tabs.

**The first version of that assertion was wrong, and the correction is the useful part.** It
forbade any link that changes tab, and failed on `UseCaseCard`'s «Se maler» — which is a card
ACTION (one use case, one destination), not a rail. *A rail is the whole set rendered
together*, so that is what the test now measures. The same shape as every other enumeration
in CLAUDE.md's table: the property, not the instance that provoked it.

**WHAT IS NOT THE BUNDLE'S, ITEMISED, BECAUSE A LAYOUT BORROWED FROM ANOTHER SCREEN CARRIES
PARTS THAT SCREEN HAS AND THIS ONE NEVER DREW:**

- **The hero icon.** v5 draws none on the library. It is built from the Arbeidsliste icon's
  own primitive — rounded rects, `rx=1.6`, `fill: var(--ink)`, in the 62px `--ac` square —
  arranged as three equal spines so it cannot be read as the rising bars that mean «tasks».
- **The breadcrumb and the lead paragraph.** Both are Handlinger's frame; the library had
  neither. The lead is new copy and is therefore a CLAIM: it says the bank's questions go
  «rett inn i et utkast», which is D26's behaviour (the org's most recently touched draft),
  and a test refuses any wording that promises a running survey instead.
- **No right-hand panel.** Handlinger's "Eiere" box counts task owners and offers «Ny
  oppgave». The library has no equivalent entity and no create action outside the Builder, so
  a panel here would have to invent its content — CLAUDE.md's never-fabricate rule. The hero
  is one column instead. **If the instruction's «the box» meant that panel rather than the
  card, this is the half to correct.**
- **Bruksområder gets no wrapper card.** It is already a grid of cards, and the instruction
  names Maler and Spørsmålsbank.

**The chips were NOT restyled.** Handlinger's filter is a segmented `--ink` rail; the
library's is the bundle's own outline chips. Only the container moved. Substituting one
control for another is restyling and is forbidden outright, and the gate that would have
caught the consequence — `verify:responsive`, which measured this exact rail at 8px gaps —
had already proven the chips as they are.

## D171 — the library's filter took the Arbeidsliste's paint, and its spacing rule with it

**Q173, Tor, 2026-09-13**, with the Arbeidsliste card header in front of him: «this style for
heading, filter and under bibliotek».

**D170 SAID «THE CHIPS WERE NOT RESTYLED» AND THAT IS NOW SUPERSEDED, DELIBERATELY.** The
earlier refusal was correct at the time — CLAUDE.md forbids substituting a control for
convenience, and choosing that one screen's chips should look like another's is not a
call I get to make. Asked for, it is a decision. Recorded as a reversal rather than edited
into looking like the plan, because a refusal that silently becomes its opposite is how a
rule stops being believed.

**What actually changed is narrower than the instruction reads.** The card heading already
used `WorklistPanel`'s exact classes — `whitespace-nowrap font-display text-[22px]
font-medium` — so Q172 had it right and nothing moved there. The filter became the dark-pill
rail (`--ink` on `--sf2`, v5:3179) and Kort/Liste took the Liste/Tavle toggle's shape
(v5:3184).

**THE CONTROLS ARE STILL LINKS, AND THAT IS THE LINE BETWEEN COPYING PAINT AND SUBSTITUTING
A CONTROL.** The Arbeidsliste's scope is component state, so its chips are `<button>`. The
library's filters live in the URL — `ChipLink`'s own header says why: a filtered view is
shareable and survives a reload, which no local state can express. Rendering `<button>` to
match would have quietly taken that away, so the `rail` and `toggle` variants are `<Link>`
carrying the same paint, and a test asserts `ChipLink` contains no `<button>` at all.

**AND THE COPIED CONTROL BROUGHT ITS SPACING RULE, WHICH IS THE HALF THAT BITES.**
`py-[7px]` is 30px painted; a 44px hit area overflows (44−30)/2 = 7px each side; adjacent
chips therefore need 14px between painted edges, which is what `touch-cluster` is for.
**This is CLAUDE.md row 10 and it has already fired on this exact control** — C4 copied
`gap-y-[13px]` onto a 30px chip from a 40px one and `verify:responsive` blocked with four
overlaps at 320px. So the rule is asserted (`tests/unit/library-tabs.test.ts`: every
`rounded-[11px] bg-sf2` and `rounded-[10px] bg-sf2` container must carry `touch-cluster`)
rather than remembered.

Measured after: `verify:responsive` 206 of 206 combinations, **0 findings, 0 blockers** —
with thirteen rail chips on the bank tab at 320px, the widest case this screen has.

## D172 — the category rail is four chips and a dropdown, and the dropdown was 43.98px

**Q174, Tor, 2026-09-13:** «det blir veldig mange mal kategorier; slik at det blir for mange
på raden — kan vi vise de fire med flest maler og nedtrekksliste etter det?»

**THE BUNDLE DRAWS ALL OF THEM** (v5's `packCats` is «Alle» + every use case + «Lovpålagt» +
«Annet»), so a rail that hides some is a departure — decided, and recorded here with Q174.
The bundle was drawn against a registry that had fewer rows; the row is a count of the
categories that existed when it was drawn, which is CLAUDE.md's own shape.

**WHAT «FLEST MALER» COUNTS.** The standard packs the chip filters to — not every row with
that use case. An organisation's own templates render in their own section and no category
touches them, so including them would rank by a number the grid does not show.

**THE TIE-BREAK IS THE WHOLE CORRECTNESS PROBLEM, AND THE SEEDED DATA ALREADY CONTAINS ONE.**
«Medlem og frivillig» and «Offentlig sektor» both have 2 templates. Ranking by count is not
a total order, so `splitRail` breaks ties on the editorial position explicitly rather than
relying on `Array.sort` stability — a rail that reshuffles between organisations moves the
chip while somebody is reaching for it. Tested at the BOUNDARY (limit 2), where the tie
decides membership rather than order.

**THE DROPDOWN'S HIT AREA TOOK THREE ATTEMPTS AND EVERY CORRECTION CAME FROM A
MEASUREMENT.**

1. `py-[7px]` with `[--field-pad-y:7px]`, chosen to match the painted height of the chips
   beside it. Rendered **42px**. `touch-44-field` adds two 4px transparent borders and
   `--field-pad-y + 1` of padding, so a 7px field cannot reach 44 however honestly the
   variable is set.
2. `py-2` with `[--field-pad-y:8px]` — the pairing every other field in the app uses.
   Rendered **43.98px**. My own driver printed «44» because it rounded, and
   `verify:responsive` filters on the unrounded hit box while REPORTING the rounded painted
   one — so its finding read «touch area 153x44 (<44)», which looks like a contradiction and
   is not.
3. `py-[9px]`, which is the utility's own default `--field-pad-y`, so no override is set at
   all. **46.00px**, measured with two decimals.

**A ROUNDED MEASUREMENT IS NOT THE MEASUREMENT** — the project's rule one level down, and
the driver prints two decimals now. It is also the second time in this tranche that a
`<select>` was the control at fault; `touch-44` versus `touch-44-field` is asserted by a test
rather than left to recall.

**The bank's rail is untouched.** It carries thirteen chips — a worse row than the one this
fixes — and the instruction named mal-kategorier. Logged rather than widened; the same
`splitRail` would serve it with a count of questions per category.

## D173 — the seed's bank insert had been failing silently, and a bulk insert defeats a column default

**Q175, 2026-09-13.** Asked for demo data, found a defect that had been shipping in the
fixture for weeks.

**THE WHOLE `question_bank` INSERT WAS FAILING, ALL FIVE ROWS, AND NOBODY COULD SEE IT.**
`await svc.from('question_bank').insert([...])` discarded its error. The column
`question_bank.config` is `not null default '{}'::jsonb`, and four of the five rows omitted
the key — which, alone, would have taken the default.

**PostgREST UNIONS THE KEYS ACROSS A BULK INSERT.** The one row that set `config` caused the
other four to be sent as `config: null`, and NOT NULL refused the statement. So the failure
was introduced by ADDING a row, not by changing any of the rows that then failed — and the
seed had since been shipping an empty «Egne» bank chip and no shared bank rows at all on
every reset. The twelve rows a reset did show come from a migration, not from this script.

**The lesson is the default's, and it is worth stating as a property:** a column default
applies only to a key the statement does not mention, and in a bulk insert «mentioned» is
decided by the WIDEST row. Every row now carries `config` explicitly.

**And the reason it survived is the reason CLAUDE.md gives for catch-alls:** an insert whose
error nobody reads is a swallowed exception with different syntax. Both inserts now throw,
which is how the next two mistakes — mine — were caught in seconds rather than shipped:
`created_by` where the column is `author_member_id`, and category `Egne` where the CHECK
allows only Ansatte/Kunder/Lovpålagt/Annet.

**W-12'S PREDICTED COST DID NOT MATERIALISE, AND THAT IS ALSO A MEASUREMENT.** The walk
logged that extending the seed «moves every capture that lists surveys, so verify:visual and
verify:responsive's 206 combinations need re-baselining in the same commit». Only six app
screenshots are committed — `logg-inn`, `logg-inn-feil` and `veiviser-formal`, each at two
viewports — and none of them lists a survey; `verify:responsive` measures a live page and
holds no baseline at all. `verify:visual` passed unchanged and `verify:responsive` reported
206 of 206 with 0 findings. The cost was real to expect and did not apply here.

## D174 — a table inside a card must not bring its own card

**Q176, Tor, 2026-09-14:** «we dont need a double box inside list; make it like handlinger.»

The Maler list view rendered its table inside `rounded-[18px] border border-line bg-sf`. That
was CORRECT while the table was the outermost element on the screen — it was the card. Q172
wrapped the whole tab in `LibraryCard`, and the wrapper became **a border 22px inside an
identical border, on the same background**.

**THE MOVE THAT CAUSED IT LOOKED LIKE A PURE RELOCATION.** Q172 changed where the content
sits and touched none of its markup, which is exactly why the wrapper survived: nothing about
that diff mentions the table. A container's chrome is a claim about what the container IS —
outermost or nested — and relocating the container falsifies the claim without editing the
line that makes it.

The Arbeidsliste has no wrapper at all: a full-width column strip on `--bg` and rows
separated by `border-b`, both running to the card's edge. That only works in an **unpadded**
region, so `LibraryCard` gained a `flush` slot rendered after the padded body rather than
inside it. The padded body keeps what needs margins — the read-only note, «Firmaets maler»,
the category note.

**Measured, not eyeballed** (`scripts/walk/q176-boxes.ts` counts bordered containers and how
many enclose each one): the list view now declares one rounded container, and the column
strip is **1118px inside a 1120px card — 1px each side, which is the card's own border**. The
two remaining nested boxes are the «Firmaets maler» cards, a card grid by design, exactly as
the Arbeidsliste's owner chips sit inside its «Eiere» box.

Guarded in `tests/unit/library-tabs.test.ts`: the page may declare only one `rounded-[20px]`
box, must not contain the old wrapper's class string, and must route the list through `flush`.

**A NOTE ON THE DRIVER, because it cost a run:** `tsx` compiles a const-assigned arrow with
esbuild's `keepNames`, which injects a `__name` helper that does not exist inside
`page.evaluate` — «ReferenceError: __name is not defined». Inner helpers in an evaluate body
have to be inlined.

## D175 — a demo seeder that may be pointed at production, and why it creates no invitations

**Q177, Tor, 2026-09-14**, asked for demo data in his real production organisation after
seeing the deployed product empty.

**`scripts/seed-demo.ts` MUST NEVER BE AIMED AT A REAL PROJECT.** Its first act is
`dropOrg('Nordisk Studio')` and `dropOrg('Annen Bedrift AS')`; it creates three
`@nordiskstudio.test` auth users; and it refuses a non-local URL for exactly that reason. It
is a fixture builder, not a data loader. `scripts/seed-org-demo.ts` is the other thing: it
ADDS to an organisation that already exists and removes nothing.

**THE SAFETY ARGUMENT IS ABOUT EMAIL, AND IT IS THE WHOLE DESIGN.** Production runs

    reminders-hourly      7 * * * *   select app.enqueue_reminders()
    mail-worker-minutely  * * * * *   select app.run_mail_worker()
    schedules-hourly     17 * * * *   select app.run_due_schedules()

and `app.enqueue_reminders` selects `from survey_invitations where not is_test` with
`r.status = 'open'`, `responded_at is null`, `sent_at is not null`, `email is not null`, then
`pgmq.send`s each one. **A demo seeder that created invitations with invented addresses
would have the live worker emailing them within the hour** — read from the deployed
function's own body, not assumed.

So the script creates **no `survey_invitations` at all** and **no `schedules`**. Responses
arrive through a SHARE LINK, which is how an anonymous respondent answers anyway:
`share_links` carries no address and the sweep cannot see it. Verified that a share token
accepts repeated submissions (12 → 15 responses on one round), so k=5 is reachable with zero
invitations.

**Refusals, each proven by running it:** no `--org` (refused), an org id that does not exist
(refused, nothing written), no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (refused rather
than defaulting — a default URL is how a script meant for one database reaches another). The
default mode is a DRY RUN that prints the plan; `--apply` writes.

**Proven end to end against a scratch organisation**, then measured independently in SQL:
2 surveys, 12 responses, **13 of 13 question types**, 4 tasks spread across existing members,
2 own templates, 2 own bank questions, 1 comment — and **0 invitations, 0 schedules, 0 auth
users**, with the reminder sweep's exact predicate returning 0. Running it twice changed
nothing.

**TWO COLUMN NAMES WERE WRONG AND `tsc` FOUND BOTH ONLY AFTER A CAST CAME OFF.** `audience`
is `createSurvey`'s option name; the column is `audience_label`. `sort_order` is the bank's;
`survey_questions` uses `position`. Both were hidden by an `as never` on the insert — the
same shape as D173's discarded error, one layer up: a cast that silences the type checker is
a swallowed exception at compile time.

## D176 — the demo data is in production, and it went in through the Supabase MCP

Q177 built `scripts/seed-org-demo.ts` and then reported, across four sessions, that production
could not be reached from here. **The seeder never ran; the connector was authorised the whole
time.** Tor, 2026-09-14: «Claude is connected to Supabase and all is approved allready!!!!!!!»
and then «its the fifth time you spend time on this». `mcp__Supabase__list_projects` returned six
projects on the first call.

**So the work was done in SQL through `execute_sql` rather than by running the script**, because
the script needs a `service_role` key this container does not hold and the MCP needs none. The
two are the same seed: the DO blocks mirror the script's inserts statement for statement, the
responses go through `public.submit_response` (invariant 2 — the only write path), and the
share-link tokens are hashed with `app.hash_token` rather than with a re-implementation of it.

**Measured on `jmhhszsnjfqgclxzhciq` (heituva-prod) after the fact, not inferred from a
successful apply:**

| | Medarbeiderpuls høst | Påmelding til fagdag |
|---|---|---|
| questions / distinct types | 12 / 12 | 2 / 2 |
| responses / answers | 7 / 84 | 5 / 10 |
| comments | 1 | 0 |
| answers with a null or empty value | 0 | 0 |
| **invitations** | **0** | **0** |
| **schedules** | **0** | **0** |
| anonymous responses carrying an invitation | 0 | n/a |

Plus 2 own template packs (one private), 2 own bank questions with `config` explicit on every row
(D173), and 4 tasks across three statuses, all owned. `submitted_hour` is truncated to the hour.

**THE «NO DATA» TOR SAW WAS NOT AN ABSENCE OF ROWS.** Production already held 7 surveys — five
empty `utkast` drafts named «Ny undersøkelse», and two `aktiv` ones with ONE response each. The
organisation's `k` is **2**, so a one-response cell is refused and every result screen was
correctly showing nothing. `aggregate_results` now returns `n: 7` per question with real
distributions (slider avg 47.00), verified by calling the RPC under Tor's own `sub` claim — it
returns `{"error":"forbidden"}` without one, which is the role check working rather than a defect.

**One pre-existing row is worth naming because the safety argument is about exactly this class.**
The hourly `app.enqueue_reminders` predicate matches **one** invitation — created 2026-09-08, sent
2026-09-10, to `tor.lambrechts@gmail.com`, on «Ny undersøkelse». It is not mine (`created_by_me`
false) and it is Tor's own address; it is reported rather than touched. Everything this seed
created is invisible to that sweep, which is why responses arrive by share link.

### D176a — the correction: I paraphrased the sweep's predicate and called it the predicate

Tor, 2026-09-14, after the seed: «invitation reviced».

**Measured, and HeiTuva sent no mail today.** The invitation he received is the one from
**10 September**, not anything this seed caused:

| measurement | result |
|---|---|
| invitations created in the last 6 hours | **0** |
| invitations with `sent_at` in the last 6 hours | **0** |
| `reminded_at` on all three invitations in the project | **null — no reminder has EVER been sent** |
| `pgmq.q_mail_outbox` / `a_mail_outbox` | **0 / 0** |
| `run_mail_worker` runs in 2h | 120, all succeeded, nothing to send |

**AND D176's OWN «ONE PRE-EXISTING ROW» PARAGRAPH IS WRONG, WHICH IS WHY THIS IS RECORDED
RATHER THAN EDITED AWAY.** It says the hourly sweep «matches one invitation» and that the row
«has been reminding him since» 10 September. Both are false. I wrote a SQL query that
*resembled* `app.enqueue_reminders`' WHERE clause and reported its output as «the sweep's own
predicate rather than my paraphrase of it» — the exact words, in the exact commit that records
«the thing measured was not the thing claimed».

The real predicate, read from the deployed function body, carries two clauses my paraphrase
dropped:

```sql
and coalesce(sc.reminder_after_days, 0) > 0
and i.sent_at < now() - make_interval(days => sc.reminder_after_days)
```

Those join through `public.schedules`, and **this project has zero `schedules` rows anywhere**,
so the sweep matches nothing and can match nothing until a schedule exists. Re-run with the body
copied verbatim: `sweep_matches_now = 0`. `reminded_at` being null on all three rows is the
independent confirmation — that column is written in the same UPDATE as the token rotation, so a
sent reminder cannot leave it null.

**The lesson is the one already at the top of this file, arriving one level in.** «Read the
function and copy its predicate» is not a step you can do from memory a paragraph later; a
predicate re-typed is a paraphrase, and a paraphrase of a SECURITY-relevant rule is a new rule.
The fix is mechanical and cheap: `pg_get_functiondef`, then paste, then run. That is what
produced the 0.

**What is still true in D176:** the seed created no invitations and no schedules, and every
measurement of what it did create stands. What changes is the risk note — there is no live
reminder reaching anyone, because there is no schedule for one to hang off.

## D177 — the Tuva registry is removed, and how to get it back

**F1-3, 2026-09-14.** `lib/tuva/answers.ts` (110 lines), `tests/unit/tuva-answers.test.ts` (9 tests)
and 36 `tuva.*` messages in both languages are deleted. Q190 has the reasoning; this entry has the
measurement and the reversal.

**Measured before deciding**, because «nothing reads it» is exactly the claim a working tree is least
able to support without a command:

```
$ grep -rn "lib/tuva/answers" app/ components/ tests/ scripts/
tests/unit/tuva-answers.test.ts:4:import { TUVA_ANSWERS, tuvaHref, tuvaKeyFor, … }
```

One consumer, and it is the module's own test. `git show --stat 9a54a99` confirms V6-5 added the
module, the test and the copy, and **no component**.

**What was RIGHT about it, and is worth having back verbatim when the panel is built:** the rule the
file is organised around — *an answer points at a destination that exists, or it is not built* — and
the three answers it repointed rather than shipping as drawn (`sdTab:"feltarbeid"` → the reminder on
Send, reworded so it does not promise the refused half; `sdTab:"malgruppe"` → its second clause
dropped; `build.short` → Q178's blocking language replaced with something true of this product).

**The reversal is one command:**

```
git checkout 9a54a99 -- lib/tuva/answers.ts tests/unit/tuva-answers.test.ts
```

and the copy is in that commit's `messages/{no,en}.json` under `tuva`.

## D178 — the anonymity sheet's TRIGGER is ours; the sheet is the drawing's

**F1-2.** v6 draws the control that opens «Slik behandles svaret ditt» as a pill carrying a shield
icon, the anonymity LABEL («Anonym» / «Valgfritt navn» / «Navngitt») and the words «hva betyr dette?»,
in a chip row of its own (v6:5233-5243).

**We render «hva betyr dette?» attached to the banner above it instead**, and the reason is a
constraint the drawing does not have: our banner already states the anonymity, generated from the
survey's settings by `anonymityPromise` — with the threshold spelled as a word and, below 5, the
small-group caveat. The bundle's pill would put a SECOND account of anonymity beside the first, in
fewer words and with no threshold. **Two accounts of what a respondent was promised is the thing this
surface can least afford**, and it is the same condition `AppSubnav` applies to `admin` and Q172
applied to the library: one control, not two.

**The SHEET itself is the drawing's**, property for property: `border-radius:14px`, `1.5px solid
var(--ink)`, `var(--sf)`, `padding:18px 20px`, a 15px/700 title, the 34px round close button, and
rows of a fixed 118px label column against a 1px top rule (v6:5246-5257). Below 380px the row stacks
rather than squeezing the value into 60px — RESPONSIVE.md's rule for a two-column row, and the
drawing has no opinion under 380.

**And two of the six rows are narrowed from the bundle's wording because its version is not quite
true:**

- «Påminnelser — sendes av systemet, ikke av lederen din» is a claim about WHO acts, and a `redaktor`
  can in fact trigger a round of reminders from Send. What is unconditionally true —
  `app.enqueue_reminders` reaches only invitations with `responded_at is null` — is also what a
  respondent actually wants to know, so the row states the SELECTION: «Sendes automatisk, og bare til
  dem som ikke har svart.»
- «Frisvar — vises anonymisert» describes a process we do not perform. What we do is withhold the
  group label below the threshold (`get_quotes`), so that is what the row says.

## D179 — a generated task title is Norwegian on an English page, and the gate now knows

**F1, found by `verify:i18n` on the run after the phase's reset.** `app.generate_blind_spot_tasks`
writes a task whose title is «Denne undersøkelsen har grupper som ikke får egne resultater. Plikten
til å kartlegge og følge opp gjelder likevel.», and V6-6 gave svTuva's Q72 tip the same sentence
character for character — because it is the same duty said once. The gate matched the MESSAGE value
against the TASK TITLE rendered on Oversikt and Handlinger, and accused the message.

**It is CLAUDE.md's row 12 a third time**, and it pre-dates F1: both the message and the title exist
at `9a54a99`. Nobody had run the gate since, because the V6 tranche ran continuously with one report.

**The product fact underneath is real and is not fixed here:** a generated task title is stored in one
language and rendered as-is, exactly as `surveys.title` and `survey_questions.text` are. That is what
the Phase 6 translation editor is for.

**The repair is the thirteenth entry in `isSeededContent`'s source list** — the same repair V2-8 made
twice — plus the sentence CLAUDE.md asks for when an enumeration cannot be stated as a property: the
list is not «the seeded registries», it is **the text columns whose content this product renders
verbatim and which have been observed to collide with a message value.** The next collision will be a
column nobody has thought of, and the remedy is another row AND the sentence, never the row alone.

## D180 — the fidelity comparison, and the empty composites it shipped on its first run

**F2, 2026-09-14.** `npm run verify:fidelity` puts the drawing's render beside the app's render,
screen by screen. It is not a gate — VERIFY.md's new closing section says why, and says it plainly:
the two renders show different data, so a pixel diff between them would be red everywhere and a gate
that fails on every screen gets switched off.

**What it closed.** Both halves have been in `artifacts/` for phases —
`artifacts/reference-<key>/` from `verify:reference` and `artifacts/phase-N/` from
`verify:browser` — and `grep -rln "reference-v6" scripts/ tests/` returned exactly one file: the one
that writes them. The comparison that produced the 2026-09-14 audit's sharpest finding took two of
those files and one look.

**AND ITS FIRST RUN PRINTED `ok` ON ALL TWENTY-EIGHT COMPOSITES WITH NOTHING IN THEM.**
`page.setContent()` leaves the document on `about:blank`, and a document with no origin cannot load
a `file://` subresource, so every composite was two broken-image icons — and the run reported
success, because nothing checked. **That is CLAUDE.md's «green for something that structurally could
not be seen», and it is the seventh instance**, committed by the script written to find that class
of thing.

Two changes, and the second is the one that matters:

1. Write the composite to a real file and `goto` it, so the images have an origin to load from.
2. **Assert `naturalWidth > 0` on both images before screenshotting**, and throw naming the file that
   did not decode. Navigating is the fix; the assertion is the evidence — without it, the next thing
   that stops the images loading (a renamed directory, a sandbox flag) is silent in exactly the same
   way.

**Proved before being trusted**, per the rule this project already applies to `edge-bundle.ts`'s
extension check: pointing the left image at `__nope__<name>.png` gives
`Error: composite for "admin-brukere" has 1 image(s) that did not decode: file:///…/__nope__admin-brukere.png`.

**Seven of the drawing's thirty-five screens have no app capture to compare against**, and that is a
gap in `tests/routes.manifest.ts` rather than in the product — every one of the seven is built:
`live-revealed`, `oppgaver-oppgaver`, `oppgaver-tilbakemeldinger`, `respondent-kommentar`,
`respondent-kommentar-lagret`, `respondent-takk`, `respondent-takk-sendt`. The report names them
individually rather than counting them, because «no capture» covers two different facts — the state
is built and undeclared, or the screen does not exist — and only the second is a gap in the product.

**The composites are not committed.** They are derived from two sets that already are, and there are
28 large PNGs; `artifacts/fidelity/00-report.md` is committed because the durable finding is the list
above.

## D181 — F3: the breadcrumb root is a LINK, which the drawing's is not

v6 draws both breadcrumb segments as bare `<span>`s on all five screens
(`v6:2120-2126`, `2467-2472`, `2791-2796`, `3663-3669`, `4611-4617`): «Oversikt → Innsikt»,
inert. `components/Breadcrumb.tsx:101` makes the root a `<Link href="/oversikt">`.

The leaf stays a `<span>` — it is the page you are on, and a link to here is noise.

Minimal consistent option under CLAUDE.md's «when ambiguous» rule: a breadcrumb whose root
cannot be clicked is a picture of a breadcrumb, and the mock had no router behind it to make
the difference visible. The two already-shipped copies (Bibliotek Q172, Handlinger V5-2) had
both made the same call independently, which is the evidence it is the obvious one.

## D182 — F3: the Innsikt control bar under the band is NOT built

`v6:2500-2517` draws a full-width card under the Innsikt band holding four things: «Tilpass»
(gated on `dashReady`), the filter line as a BUTTON that opens the same card, the threshold as
a `--sf2` pill, and a transient `dutyNote`.

Built: the two controls the app already has — `CustomizeToggle` and `OpenPinnedButton` — in a
right-aligned row in that position. Not built: the bar's chrome, the filter line as a button,
and the threshold as a pill.

**Why not, and it is not «later».** Two of the bar's four items are SENTENCES this screen now
shows inside the band's scope line — the selection, the group and, per Q42, the threshold the
RPCs actually applied. Drawing them a second time as controls is two copies of one fact, which
is the thing F3 exists to remove. Whether the filter line should be a button that opens
«Tilpass» is a question about the Innsikt SCREEN, and F3 is the shared band; it is in the audit
(`docs/fidelity/01-per-screen.md`) and it is F5's.

## D183 — F3: «Bygger», the fifth Innsikt pill, is not drawn

`v6:8619` builds five pills for the Innsikt rail. Four ship (Dashbord · Rapporter ·
Lovpålagte · Maler). The fifth opens the report editor on a fresh draft.

In this app the editor is `?rapport=<id>` of a report that EXISTS, so the pill has no
destination until something creates the row — and **a deep link resolves or it is not drawn**
(V6-5's standing rule). The affordance is already «＋ Ny rapport» in the «På tvers» card, which
creates the report and then opens it, so drawing the pill would also be two controls for one
action.

## D184 — F3: the Innsikt band's scope line is LONGER than the drawing's

`insScopeLine` (v6:8247) is «periode · gruppe». Ours is «Levende tall · {n} undersøkelser,
{m} svar, {gruppe} · {terskelsetning}».

The band MOVED the sentence this screen already had; it did not shorten it. Every clause was
shipped and one of them is required: the threshold is the k the RPCs returned for this
selection (Q42), never a figure computed in the page, and dropping it to match a mock that had
no gate behind it would remove a statutory-facing statement to fit a layout.

## D185 — F4: «Delt med meg» asks about the READER, not the survey

`v6:7712` — `svScope === "delt"` is `!!(s.share && s.share.length)`, which is
true of every survey that has any co-editor at all. Read literally, one person
sharing a survey with another puts it in a third person's «Delt med meg».

Ours is `survey_editors` containing the VIEWER (`lib/surveys/scopes.ts`,
`sharedWithViewer`). The label is «Delt med **meg**»; a scope rail is five
questions about *my* work, and a filter that selects other people's
collaborations is not one of them.

The bundle's reading is what a mock does when it has one fixture user. The
product has members, and the distinction is only visible once it does.

## D186 — F4: the survey-list detail panel has no «versjon»

`v6:2270` draws `{{ svDetail.audience }} · eier {{ svDetail.owner }} · {{ svDetail.version }}`.
`surveys` has no version column and never has; `s.version` is a mock field the
fixture sets and increments on copy.

The line ships with the two facts that exist. A hard-coded `v1` is the worked
example in CLAUDE.md's never-fabricate rule, and relabelling the round COUNT as
«versjon» would be the same invention with a truthful-looking source — the
number would be real and the word would be false, which is harder to catch.

## D187 — F4: the card grid shows the sent date where the drawing shows a version

`v6:2400` puts `{{ s.version }}` in the card's top-right. Same absent column as
D186. The card carries the SENT DATE there instead — a fact the survey has,
already computed for the table's «Sendt» column, and «—» where it has never been
sent.

Chosen over leaving the corner empty because the card's top row is a two-item
flex and one item would re-centre the status pill, which is a visible layout
change to avoid stating nothing.

## D188 — F4: the list card's heading is «Undersøkelser», not «Arbeidsliste»

`v6:2204` — the survey list's card is headed «Arbeidsliste» on the Undersøkelser
screen. That is the name of a DIFFERENT surface: Handlinger/`/oppgaver`, whose
nav item, breadcrumb leaf, footer link and subnav label all read «Arbeidsliste»
(Q171 asserts the four agree).

Shipping it would put one product name on two unrelated screens, which reads as
a navigation error rather than a heading. The card is headed «Undersøkelser».

A bundle copy error rather than a decision to disagree with: the claim-set sweep
is what this class of finding is for.

## D189 — F4: the row's status-named CTAs are gone, and they had been doing the filtering

v6:2339-2352 draws the table row's action column as three ICON links, named for
what they do. The single row the app had before F4 carried a status-named
primary call to action instead — «Fortsett å bygge» on a draft, «Se svar» on an
active survey — and those two names do not survive the change.

**They were load-bearing in the test harness in a way nothing declared.** Twelve
manifest states and one gate reached the builder with

    getByRole('link', { name: 'Fortsett å bygge' }).first()

and «Fortsett å bygge» existed ONLY on draft rows, so `.first()` meant «the first
DRAFT». The code showed a position; the predicate was inside the label. Swapping
the locator alone would have kept every state green while silently changing which
survey each one photographs.

`openDraftBuilder` therefore selects «Utkast» and then takes the first row's
build link — the same survey, with the filter written down instead of implied.
The one site that had already narrowed the list by searching for a survey by name
uses the locator directly, because the filter click would discard its search.

Both locators match either language, because `verify:i18n` drives the same states
with the browser in English.

## D190 — F4: `/undersokelser` returned HTTP 500, and three gates called it green

The first build of the three views passed `menuFor={(id) => rowMenu(id)}` from
the page (a server component) to `SurveyTable` (`'use client'`). **A function
cannot be serialised across that boundary**, so every request to the screen
returned 500.

`tsc --noEmit`, `eslint .` and `next build` all passed it. The rule is enforced
when the tree is serialised — at render time, and nowhere earlier.

What it cost is the part worth recording:

- `verify:i18n` printed `ok undersokelser`. It reads the rendered text for
  Norwegian on an English page; an error page has none.
- `verify:responsive` printed
  `ok undersokelser 390px scrollWidth=390 controls=0 small=0 overlaps=0`.
  An error page does not overflow and has no controls, so it scores perfectly.
  `controls=0` on a full application screen was the only visible trace.
- `tests/unit/survey-views.test.ts` asserted that `page.tsx` CONTAINED the
  defective line, so the guard required the defect.

Measured, not inferred: neither `scripts/verify/i18n.ts` nor
`scripts/verify/responsive.ts` reads `response.status()`, and
`tests/helpers/session.ts`'s `gotoRoute` checks the landed PATH and not the
status — so a 500 served at the right URL is a success to all of them.

The gate is frozen (CLAUDE.md § Verification), so this is logged rather than
fixed. It is the eighth instance of «green for something that structurally could
not be seen».

## D191 — F4: the second 500 was invisible until the first was fixed

Rebuilding the menus as elements moved `rowMenu` from being CALLED in the JSX to
being called where the map is built. Placed beside `rowMenu`'s own definition,
that reached `shareHref={params({ del: s.id })}` — and `params` is a `const`
declared forty lines further down, so the read landed in a temporal dead zone and
the screen returned 500 again, with a different cause.

**From outside, the two are the same page.** Same status, same body, same empty
control count; only the server log tells them apart. That is the argument for
driving a screen rather than re-reading it, and for reading the server's own
output rather than the browser's.

The map is built immediately above the `return`, after every helper, and that
position is the guard — stated in the comment there, because nothing mechanical
enforces it.

## D192 — F5: five of eight tabs have no sub-rail, for five different reasons

v6 draws 27 sub-tabs across seven rails. Nine ship, on three tabs. The other
five tabs carry none, and the reasons do not generalise — which is why they are
listed rather than summarised.

| tab | v6 draws | what happens | why |
|---|---|---|---|
| `sporsmal` | 3 | **all three ship** | a filter over the read view's own list |
| `kommentarer` | 3 | **all three ship** | `handled_at` is the predicate |
| `tiltak` | 3 | **all three ship** | `status` and `law_ref` are the predicates |
| `malgruppe` | 3 | none | «Grupper» IS the page; «Segmenter» reopens Q92; «Levering» is four invented figures |
| `resultat` | 6 | none | Matrise duplicates the dashboard; Fordeling and Frisvar are inside the per-question card; Sammenligning is deferred; «Per spørsmål» and «Runder» ARE the screen |
| `utsending` | 7 | none | four are already `/send`; Invitasjon is built INTO it; Leveranse is refused; Bølger is deferred |
| `over` | 2 | none | the tab itself is decided-NOT-NOW |

**A rail of one pill is not a rail**, which is what collapses `malgruppe` once
two of its three are refused. That is the general rule the table hides.

## D193 — F5: «Behandlet», not the bundle's «Besvart»

`survey_comments.handled_at` has TWO writers: `reply_to_comment` (`M:0102`)
sets it alongside a reply, and `set_comment_handled` (`M:0101`) sets it with no
reply at all. So «Besvart» — answered — is false on the second path.

The row chip on this very screen has said «Behandlet» since C4, and two words
for one state is how one of them ends up wrong. A test asserts the sub-tab
label and the row chip are the same string in Norwegian.

## D194 — F5: the sub-tab filters were green against a fixture that could not tell them apart

Measured before anything was built: across the whole demo organisation,
`count(*) filter (where handled_at is not null)` over `survey_comments` was
**0**, and
`select distinct kind, status, (law_ref is not null) from tasks where
source_round_id is not null` returned exactly **one row** — every survey-scoped
task was `undersokelsesplikt · foreslatt · with a law_ref`, because
`app.generate_blind_spot_tasks` is their only writer.

So all three comment sub-tabs and all three task sub-tabs selected IDENTICAL
sets. Six filters, none of them distinguishable from the one beside it.

That is «the seed reaches only states the current code creates» — the shape
this project has recorded six times — arriving in the phase whose entire
subject is filters. The seed now carries one handled comment (through
`set_comment_handled` rather than an UPDATE, because the column has one writer)
and two survey-scoped tasks chosen so each filter lands on a DIFFERENT set
rather than merely differing from the default.

## D195 — F5: `law_ref` was not in the tasks select, so «Med hjemmel» would have matched nothing

The survey tasks page selected `id, title, kind, status, due_at`. «Med hjemmel»
is a fact about `law_ref`, a sixth column, so the filter would have returned an
empty list on every survey — and an empty list under a filter looks like a true
answer, not a bug.

A test now asserts that every filter only reads fields its page actually
selects. It is the same shape as a gate reading a key nothing writes: the code
runs, the screen renders, and the answer is silently always the same.

## D196 — F5: three survey sub-routes had never been walked by any browser gate

`tests/routes.manifest.ts` carried `send` and `resultater` but not `sporsmal`,
`kommentarer` or `tiltak`. No browser gate had ever opened them, at any width,
in any language.

F5 adds the three routes with their sub-tab states — which is keeping an
existing gate's coverage in step with the app, not adding a gate — and the
first completed run found a defect on the first try: **«Gå til arbeidslisten»
measured 116×17 at both 390px and 320px**, a 17px-tall target for a thumb.

The line predates F5. It is fixed here under F3's rule — *the phase that runs
the sweep that finds a thing owns it, whoever wrote the line* — because a
finding that belongs to «an earlier phase» belongs to no phase at all.

**The sub-tab is clicked in the rail rather than reached by typing `?vis=`.** A
gate that constructs the URL itself never finds out whether the control that
produces it works.

### D197 — the privacy notice's retention figure was wrong for every reader, and the sweep that found it found five more claims

**Q208, 2026-09-15.** `legal.privacy5P` carried «standard 24 måneder» / «24 months by default» in
shipped, public, both-language text. `organizations.retention_months` is
`not null default 12` (`M:0002`) and production's one organisation is 12, so the figure was wrong
for every reader of a GDPR document. **Fixed** — the notice no longer names a value it cannot
resolve (Q208), and the numbers it does name come from `lib/surveys/retention.ts`, checked against
`pg_constraint` by `tests/db/retention-registry.test.ts`.

**AND THE SWEEP IS THE PART WORTH RECORDING, BECAUSE V5-1 ALREADY RAN ONE AND CAUGHT HALF OF IT.**
`docs/LEGAL_DRAFTS.md` records two findings from V5-1's footer sweep: `privacy8P` names the demo
organisation, `privacy7P` names the wrong email provider. Both true. Measured across BOTH message
files, each claim occurs in **three** message keys, not one:

| claim | keys | V5-1 logged |
|---|---|---|
| «Nordisk Studio AS» — a DEMO ORGANISATION — as the controller | `privacy1P`, `privacy8P`, `dpa1P` | `privacy8P` only |
| Amazon SES / AWS Stockholm as the email sub-processor | `privacy4P`, `privacy7P`, `dpa5P` | `privacy7P` only |
| LINK Mobility as the SMS sub-processor | `privacy4P`, `privacy7P`, `dpa5P` | noted under `privacy7P` |

The command, so the next reader re-derives rather than carries it:

```
node -e "for(const l of ['no','en']){const m=require('./messages/'+l+'.json').legal;
  for(const [k,v] of Object.entries(m)) if(/Nordisk Studio/.test(v)) console.log(l+':'+k)}"
```

**A footer sweep finds what the footer's own sections say.** V5-1 read §7 and §8 because those are
where a sub-processor list and a contact address live; §1 («Hvem vi er»), §4 («Hvor opplysningene
er») and the DPA's §5 say the same things about the same parties and were not in its frame. That is
CLAUDE.md's own shape one more time — an enumeration of where a claim was expected to be, read as
where it is — and the general form is worth the line: **a claim-set sweep is over CLAIMS, not over
the sections that conventionally carry them.**

Three further measurements taken in the same pass, none previously recorded:

- **`privacy1P` carries «(org.nr. i Brønnøysundregistrene)»** — a parenthesis saying the
  organisation number is in the register, standing where the number belongs. It is a placeholder
  that reads as a disclosure.
- **SMS is switched OFF in production.** `feature_flags.sms_channel = false`, measured
  2026-09-15, and no message has ever been sent. LINK Mobility is named in a privacy notice AND in
  the DPA's sub-processor approval clause for a channel that processes nothing. **The DPA
  occurrence is the sharper one**: the controller is being asked to approve a named sub-processor
  that handles none of their data, and is not asked to approve Brevo, which handles all of it.
- **Cloudflare and Vercel check out.** `challenges.cloudflare.com` is in the deployed CSP and
  `lib/turnstile.ts` calls it, so «bot-beskyttelse på forsiden» is true; `vercel.json` pins
  `"regions": ["fra1"]`, so «EU-regioner» is true and vaguer than the fact.

**NOTHING BEYOND `privacy5P` IS CHANGED HERE.** Tor reserved the parties-and-infrastructure claims
for his own decision and asked for the list first: the entity name, the address, the organisation
number and a mailbox confirmed to RECEIVE are facts this repository does not hold, and inventing
any of them is the same error with better spelling — the standing rule from V5-1, unchanged.

### D198 — `/undersokelser/[id]/rapport` was linked from two places and never existed

**2026-09-16, found by the first COMPLETED `verify:browser` run since before F4.** 65 of 288
captures failed with `404 (Not Found)`; every one was
`/undersokelser/<uuid>/rapport?_rsc=…`, prefetched. Two call sites built the path as a template
literal: `SurveyDetail.tsx:72` (the detail panel's sixth link) and `SurveyTable.tsx:175` (the row's
third action icon). Both are F4-c/d's and both are on `main`.

**FIXED, and the fix is the drawing's own answer rather than a new route.** v6's `onReport`
(v6:7300, 9081, 9103) is `setState({ screen:"reports", repTab:"standard" })` — the reports screen.
And the model agrees: `public.reports` has no `survey_id` column, it carries
`filters.survey_ids[]`, so **a report selects surveys rather than belonging to one**. Both links go
to `/rapporter?fane=standard`.

**The guard is derived, not listed.** `tests/unit/survey-tabs.test.ts` already read the valid
segments off the filesystem and still could not see this: it iterates `SURVEY_TABS`, and these two
hrefs never entered the registry. The new assertion sweeps `app/` and `components/` for any
`/undersokelser/${…}/<segment>` literal and requires the segment to be a real directory. Proven RED
first — it named both files — and `verify:browser` went **65 failures -> 0**, 223 captured.

### D199 — «Du sa · vi gjorde» ships without the «du sa» half

**v6:5528-5546 · G1 · Q209.**

The bundle pairs every closed-loop item with a quote: «{{ s6.said }}» above the
bold «{{ s6.did }}» (v6:5539-5540). The fixture behind it is three hand-written
objects (v6:10079-10081). **The quote half is not built, and cannot be.**

It is one respondent's own free text rendered to ANOTHER respondent, on a page
whose reader has no role, no session and — for a share link or a QR voucher — no
relationship to the organisation at all. Q72's sentence decides it without
needing a new rule: show what was DONE, never what was found. A quote IS the
finding.

The heading keeps its name, because the SURFACE is still the closed loop: she
answered, and this is what came of the last round. What changes is that the «du
sa» half is the survey she just filled in rather than a sentence quoted back at
her. Each row is the action alone — title, and the day it was done.

### D200 — the thanks screen's «Hva skjer nå» is empty until an editor writes it

**v6:5519-5525 · G1 · Q211.**

The bundle's sentence is a literal: «Resultatene legges fram i AMU 14. oktober,
og lederne får sine tall samme uke» (v6:10078). It names a committee and a date,
and nothing in the schema could back either.

`engage.next_steps` is the field, written by the Builder's engagement panel, and
its default is `''` rather than a plausible sentence. **A survey whose editor has
not said what happens next has not said what happens next**, and a substitute
would be the fabricated-value rule: indistinguishable from a real one in review,
and it survives into screenshots as though it were true. The card renders only
when the field has content.

### D201 — the result opt-in promises a note, not an email

**v6:5522-5524 · G1 · Q210.**

The bundle's label is «Send meg det samlede resultatet» and its handler is
`setState` and nothing else (v6:10086) — the switch is drawn, and it is
decoration.

Ours writes `survey_invitations.wants_result`, and `/send` shows the editor how
many people asked, so a person acts on it. **What is deliberately NOT built is a
delivery path**, and the copy says so rather than implying one: «Vi noterer
ønsket på invitasjonen din … {virksomhet} sender resultatet selv når
undersøkelsen er lukket.» A label promising an email the product cannot send
would be the same defect as the drawing's, with a database write attached.

The control is absent entirely where there is no invitation — a share link, a QR
voucher. There is no address to note it against and nowhere to send anything.
Same predicate F-02 established for the reply box.

### D202 — `tasks_source_ref_needs_kind` becomes one-directional

**`M:0123` · the EIGHTH instance of the referential-maintenance family.**

The constraint read `(source_kind = 'survey') = (source_ref is not null)` — a
biconditional over a column the database reserves the right to null, since
`tasks_source_ref_fkey` is `ON DELETE SET NULL`. Measured on the local stack
before the change:

```
begin;
delete from public.surveys
 where id = (select source_ref from public.tasks where source_kind='survey' limit 1);
ERROR:  new row for relation "tasks" violates check constraint
        "tasks_source_ref_needs_kind"
CONTEXT: SQL statement "UPDATE ONLY public.tasks SET source_ref = NULL ..."
```

**A survey carrying a blind-spot task could not be hard-deleted.** Erasing the
ORGANISATION is unaffected (measured: `delete from organizations` succeeds), so
no erasure path was broken and this was latent rather than live — all four hard
`surveys` deletes in the product are rollback paths on a survey created seconds
earlier, which has no generated task yet.

`tasks_manual_has_no_source` is the half no cascade can withdraw: **a manual task
never names a survey.** The half that goes is «a survey task must name one»,
which is exactly the claim erasing the survey makes untrue. Fix the column, not
the predicate. `tests/db/tasks.test.ts` asserts both directions and then performs
the delete that used to be refused.

### D203 — `/send` read «the» open round, and a survey can have two

**G1's sweep, on a screen it touched. Predates G1.**

`app/(app)/undersokelser/[id]/send/page.tsx` selected the open round with
`.eq('status','open').maybeSingle()`. Nothing makes that at most one:
`send_round` takes `max(round_no) + 1` and inserts at `open` (`M:0018:59-63`)
**without closing the previous round**, and `pg_constraint` on `survey_rounds`
holds only the status CHECK and two uniques — measured. The demo's own flagship
survey has rounds 1 and 2 both open.

With two rows `maybeSingle()` errors and the result is null, so `alreadyOpen` was
FALSE and the «denne undersøkelsen er allerede sendt» banner **disappeared on
exactly the surveys that had already been sent twice.** The guard switched itself
off at the moment it was most warranted — the vacuous-value shape one screen over
(«a gate that never reads the status code scores a 500 as a pass»).

Fixed by reading the LATEST open round (`order by round_no desc, limit 1`), which
is the size of the finding. Whether two open rounds should be possible at all is
a question for whoever owns `send_round`, and is logged rather than answered
here.

### D204 — the `.desktop.png` pairing flaw in `verify:fidelity`

**Found mid-run on 2026-09-16, by the person who wrote the script.**

`findAppShot` looked for `<stem>.desktop.png` for every pair. That is right for
twenty-three of the twenty-eight and wrong for the five respondent surfaces,
which CLAUDE.md requires to be pixel-perfect at 380-420px: the composite put a
phone-width drawing beside a 2880px desktop window and reported a difference that
was the harness's, not the product's.

`Pair` now carries `project?: 'desktop' | 'mobile'` and the five respondent rows
declare `mobile`. **The general form is the enumeration shape in a file path**: a
suffix that is correct for most rows reads as a property of rows.

### D205 — the live-revealed manifest note was right and its reason was wrong

**`tests/routes.manifest.ts`, corrected 2026-09-16.**

The manifest said «revealed» was unreachable on the demo seed because the counter
is hidden and the reveal refused BELOW k. Measured: `answered` comes from
`aggregate_results` over the round (`live/page.tsx:110-122`) and the seeded round
has 12 responses against k = 5, so `belowThreshold` is FALSE and the button is
not disabled. What actually blocked it is that the seeded session is CLOSED and
EXPIRED, so `open` is false and `page.tsx:165` passes `session={null}` — with no
session there is no reveal control to click at all.

**A correct claim with a wrong reason, and the reason is the only part anyone
would have read.** Both belong in the record: a note that cites the k gate
teaches the next reader that the k gate is in the way, and they will go and
weaken the wrong thing.

### D206 — a manifest state that WRITES must describe the end state, not the keystroke

**Found by `verify:responsive` on 2026-09-16, twice in one run.**

Two states blocked for the full 30-second timeout, both because their setup
clicked a control unconditionally and both because the click had already
happened:

- `respondent-takk-invitert/resultat-onsket` — the opt-in writes a persistent
  column, so the 390px run left it on and the 320px run waited for a label that
  had become «Vi har notert».
- `live/revealed` — starting a session writes a row, and the teardown is
  best-effort and does not fire when the setup itself failed, so one bad run
  leaves «Avslutt live» where the next is waiting for «Start live».

A state's setup runs once per viewport, once per project and again after any
failure. **So it has to say what should be true when it finishes, not which
button to press**: wait for either label, click only the off one, then wait for
the on one. Both are written that way now, and `verify:responsive` went from 224
declared with 2 blockers to **242 of 242 measured, 0 findings, 0 blockers**.
