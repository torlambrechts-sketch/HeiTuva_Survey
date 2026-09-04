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
| D27 | DECISIONS Q14 (administrator TOTP) suspended behind the `admin_mfa` flag | **Suspended** — Tor's call, 2026-09-03; enforcement code intact | DECISIONS Q14 |
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
| `authenticated_security_definer_function_executable` (WARN) | `aggregate_results`, `get_quotes`, `survey_response_counts`, `claim_membership`, `get_survey_for_token`, `submit_response`, `get_peer_results`, `send_round`, `close_round` | SECURITY DEFINER RPCs are the *only* read path to `responses`/`answers`; that is the k-anonymity architecture, not an accident. `send_round` and `close_round` are DEFINER to reach `app.hash_token` and pgmq, and assert `app.can_edit_survey` themselves rather than relying on the definer's rights. |
| `auth_leaked_password_protection` (WARN) | Auth | **Not accepted — genuinely open.** A project-settings toggle (Auth → Passwords → check against HaveIBeenPwned), so it is Tor's to flip, not a code change. |

NOT on this list, and deliberately: `mail_outbox_read`, `mail_outbox_delete` and
`mail_outbox_archive`. They are SECURITY DEFINER too, but granted to
`service_role` only, so no advisor reports them — which is the check that the
grants are right, since the raw invitation tokens live in those messages.

Anything outside this table appearing in a future advisor run is a regression.
Re-read against prod on 2026-09-04 after migrations 0008-0011: 15 findings, all
matching the rows above.

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

### D22 — MFA screen is not in the design bundle
DECISIONS Q14 requires TOTP for role=administrator, and the bundle has no
screen for it. `/sikkerhet` reuses the login card's layout and shows one of two
states: enrol (QR plus the shared secret) when the account has no verified
factor, and challenge (six-digit code) when it has one but the session is still
aal1. Enrolment is behind an explicit button rather than started on page load,
so a GET never mutates the account's factors.

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

### D27 — administrator MFA is a flag, and it is currently off
DECISIONS Q14 makes TOTP mandatory for `administrator`. Tor suspended the
requirement on 2026-09-03: App Authenticator was not enabled in GoTrue on
`heituva-prod`, so the first administrator was held at `/sikkerhet` on a screen
whose enrol call could not succeed — the gate locked out the only person who
could unlock it.

The enforcement was not removed. It moved behind `feature_flags.admin_mfa`
(global row, `enabled = false`), read by `adminMfaRequired()` in
`lib/auth/mfa.ts`. Restoring Q14 is one row:

    update public.feature_flags set enabled = true
    where key = 'admin_mfa' and org_id is null;

Three things were deliberate:

- **One definition.** The flag is checked inside `adminMfaSatisfied()`, not at
  each call site, so the layout redirect and the Administrasjon write gate
  cannot drift apart. Suspending the requirement cannot be half-applied.
- **The read fails ON.** `isFlagEnabled('admin_mfa', orgId, true)` — an
  unreadable or unseeded flag resolves to *required*, so a database hiccup
  cannot silently drop a security gate. Every other flag fails OFF, because for
  those OFF is the safe direction.
- **The gate is still tested.** `tests/visual/screens.spec.ts` turns the flag on
  for its own describe block and back off afterwards. A flagged-off invariant
  that also stops being tested is how a suspension becomes permanent by
  accident.

`feature_flags` rather than an env var because the column shape already carries
what this needs next: `org_id` NULL is the global default and a per-org row
overrides it, and "require MFA for our administrators" is a per-tenant policy.
Both gate call sites already pass `viewer.orgId`, so a per-org override works
the day someone writes the row.

Revisit: as soon as App Authenticator is enabled on `heituva-prod` and Tor has
enrolled, flip the row back to `true`. This is a suspension, not a decision that
Q14 was wrong.

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

Their cards still render, because the design draws six and hiding three would
misrepresent what the product does. Selecting one shows the design's own
explanation of what the sync does plus one line saying it is not available yet —
rather than a button that fails, or a card that silently does nothing.
