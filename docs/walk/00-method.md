# Walk — method, and the bounds of it

**2026-09-12.** A walk, not a phase. The product was driven as a user, in a browser, against a
seeded local database. No phase was opened; the only product code changed is the three trivial
fixes named in `01-findings.md`.

## What this measured, and why the fourth column is the point

Every action records four things: what I did, what happened, what appeared in the console or the
server log, and **whether the database actually changed**. The fourth is the one that found things.
Two screens were completely dead while rendering perfectly, and the only signal that distinguished
"it worked" from "it returned cleanly and wrote nothing" was a `select count(*)` either side of the
click.

`scripts/walk/drive.ts` is the driver. It uses `psql` via `execFileSync` rather than the `pg`
package, because that is what `tests/db/*` already does and a walk should not add a dependency. It
hooks `console`, `pageerror`, `requestfailed` and every response ≥ 400 for each step.

### THE SERVER LOG IS DISCARDED BY THE HARNESS, AND THAT IS WHY NO GATE COULD SEE THE FIRST BLOCKER

`scripts/verify/server.ts:202` spawns Next with **`stdio: 'ignore'`**. Every gate therefore runs
against a server whose stdout and stderr go nowhere. The Live blocker's cause was one line in that
log:

```
⨯ Error: A "use server" file can only export async functions, found object.
```

Nothing in the browser said it — the page rendered, and the click returned HTTP 500 with a digest
and no message, which is correct production behaviour. **The third column of this walk's log is
structurally unavailable to the existing apparatus.** For the walk I started the server myself and
captured it. Logged as a finding rather than fixed: the apparatus is frozen.

## The fixture

```
supabase db reset                    # 146 migrations, exit 0
npx tsx scripts/seed-i18n.ts --local # 4892 messages
npx tsx scripts/seed-help.ts --local # 12 + 12 articles, 13 corrections
npm run seed:demo                    # Nordisk Studio + Annen Bedrift AS
```

All three seeds, deliberately: CLAUDE.md records that a bare reset leaves `help_articles` at 0 and
`ui_messages` at 52, and a walk that skipped them would read missing content as a defect.

Docker was reported unavailable by `docker info`. `which dockerd` returned `/usr/bin/dockerd` and
the daemon came up in 3 seconds with eleven Supabase containers still attached — the instance
CLAUDE.md already records as "a fact about a process's run state read as a fact about the
environment". The Supabase MCP was likewise reported as needing authorisation; `list_projects`
returned six projects. **Third time that notice has been wrong.**

## The list, derived rather than remembered

- **42 route entries / 98 states** in `tests/routes.manifest.ts`, enumerated by parsing the file.
- **96 exported server actions** across 24 `'use server'` modules, enumerated by
  `grep -rl "'use server'"` then `^export async function`.

The 96 is the real denominator for "a button that does nothing". The manifest's 42 is the
denominator for "a screen that does not load".

## What was driven

**38 routes loaded** as their manifest persona (administrator, redaktor, leser, anon), plus the
five survey sub-routes. Zero application errors, zero raw message keys, zero 4xx/5xx. The only
flags were `POST … net::ERR_ABORTED`, which is a form POST superseded by navigation, not a failure.

**~25 of the 96 server actions were driven to a measured database or cookie delta:**

| Action | Evidence |
|---|---|
| `openLiveSession` | `live_sessions` 1 → 2, code `JU5B2B`, status `open` |
| `closeLiveSession` | status `closed`, `closed_at` set, `expires_at` in the past |
| `setRevealed` | `revealed` f → t; and **refused** when forced below k |
| `submitResponse` | `responses` +1 on eight separate submissions |
| `commentThread` | reply read back through the same token |
| `setWorklistView` | cookie `heituva.worklist` → `board`, board columns rendered |
| `advanceTask` | `tasks.status` `pagar` → `gjennomfort` |
| `addWorklistNote` | `worklist_notes` 2 → 3 |
| `replyToComment` | `survey_comment_replies` 0 → 1 |
| `saveCompany` | `dpo` written via Enter; `worklist_view` via Tab-out-of-card |
| `setDefaultThreshold` | `default_k_threshold` 5 → 2 |
| `setPrivacy` | `organizations.privacy` jsonb changed |
| `setRetention` | `retention_months` 12 → 6 |
| `setMemberRole` | `org_members.role` leser → redaktor |
| `setMemberGroup` | `group_id` changed |
| `inviteMember` | `org_members` 6 → 7, the address present |
| `setOption` | `options.reminders` false → true |
| `setDefaultLang` | `default_lang` no → en |
| `createGroup` | `groups` 2 → 3, on screen |
| `deleteGroup` | `groups` 3 → 2 on an empty group; **refused** with an alert on a referenced one |
| `createDsr` | `dsr_requests` 2 → 3 |
| `setDsrStatus` | status → `fullfort` |
| `saveMessage` | org `ui_messages` overrides 0 → 1 |
| `signDuty` | `duty_signers` signed 2 → 4 |
| `setWorkspace` | cookie `heituva.workspace` → `quiz`, quiz vocabulary on screen |

**The whole Live session, end to end:** open → code shown → `/l/<code>` mints an invitation
(42 → 43) and redirects into `/s/<token>` → respondent answers at 400px → counter → reveal →
close → **an unspent token from that session is refused afterwards** («Denne undersøkelsen er
lukket», no new response) → Q78's guard refuses `run_mode=live` on a named survey with a hint.

**All thirteen question types**, at 400px, in one survey built from the registry's own
`defaultConfig`: `scale, likert, smiley, enps, slider, choice, dropdown, image, yesno, ranking,
matrix, text, field` — every one rendered controls, none produced an application error or a raw
key, the run reached the thank-you after 13 screens and recorded one response.

**The comment round trip**, which had never been driven end to end: comment saved through an
invitation token → `invitation_id` set → manager replies from the Arbeidsliste → respondent reads
the reply back through the same token.

**Q69, Q97, Q158 confirmed from the UI**, not from a test: a `gjennomfort` task with zero effect
assessments offers no step and says «Vurder effekten før du lukker oppgaven»; closing from
`effektvurdert` opens the finality dialog and only then writes `lukket`; the bulk bar offers
«Flytt ett steg» and «Tildel» and **«Lukk valgte» is absent**, as decided.

## What I did NOT reach — named, because an incomplete walk honestly bounded is worth more

**~71 of the 96 server actions were not driven to a measured write.** By area:

- **Reports, nearly all of it:** `createReport`, `saveReport`, `setReportStatus`, `deleteReport`,
  `setReportSchedule`, `createReportShare`, `setShareScope`, `publishDuty`, `saveDutySettings`,
  `toggleDutyCheck`. **Opening a report share link as an outsider was not done at all** — item 7
  of the instruction is the least-covered area of this walk.
- **Dashboard:** `saveLayout`, `savePreset`, `deletePreset`, `resetLayout`, `togglePin`,
  `freezeLayoutReport`, `openPinnedReport`.
- **Bibliotek:** `addBankQuestion`, `createSurveyFromPack`, `deleteBankQuestion`, `deleteTemplate`,
  `setTemplatePrivate`.
- **Builder:** `saveDraft`, `saveQuestionToBank`, `saveSurveyAsTemplate`, `setFeedbackMode`,
  `setQuizSettings`, `setSurveyPolicy`. `setRunMode` was attempted and the control was absent in
  both states I could reach (see below).
- **Send:** `sendSurvey`, `sendTestToSelf`, `setSchedulePaused`, `stopSchedule`. I read which
  channels the picker offers but **sent nothing**.
- **Surveys:** `closeSurvey`, `copyAsNewRound`, `createBlankSurvey`, `createSurveyFromWizard`,
  `deleteSurvey`, `setResultsScope`, `toggleEditor`.
- **Målgrupper:** `createAudience`, `addSuppression`, `liftSuppression`.
- **Profil:** `saveProfile`, `setNotify`, `setProfileLocale`. **The language switch was not driven**
  — there is no `EN` control in the app shell (it is on `/s/[token]` and in Profil), so the
  instruction's shell item was only half measured.
- **Auth and marketing:** `sendMagicLink`, `signInWithPassword`, `signInWithEntra`,
  `createOrganization`, `requestDemo`, `signUpFromSplash`.
- **Branding:** `setBranding`, `uploadLogo`, `setSsoExempt`, `resetMessage`, `setCustomModules`.
- **`assessTaskEffect`** — the Q97 close path was driven on a task whose assessment already
  existed, so the assessment write itself is unproven.
- **PPTX / PDF export**, and the word cloud with words actually above the floor.

### States the seed cannot reach — D102's shape, and there are three

1. **Eight of the thirteen question types are absent from the demo seed**: `smiley, enps, slider,
   dropdown, image, ranking, matrix, field`. I reached them only by building a survey in SQL. A
   walk that answered the seeded ones would have measured five and reported thirteen.
2. **No survey exists on which «Quiz» mode is offerable.** Quiz requires `anonymity='named'` and
   refuses a statutory pack; the only named + standard survey is `Aktsomhetsvurdering leverandør`,
   which carries `leverandor-apenhetsloven`. So `setRunMode('quiz')` cannot be driven from the UI
   at all, and the control's absence is indistinguishable from the control not existing.
3. **No unspent quiz invitation with a knowable plaintext token.** Tokens are stored hashed, so the
   respondent half of a quiz is unreachable from a bare seed. I minted fixture invitations
   (`walk-*` tokens) to drive it, and say so here rather than letting the drive look seed-native.

### Where my own driving was the fault, recorded so the log is not read as a defect list

Five things looked like defects and were my selectors:

- Seven clicks of «Send inn svar» that wrote nothing — my loop re-clicked the selected option each
  pass. Driven once, correctly, it submitted (`responses` 6 → 7, `responded_at` set).
- `createGroup` "not reachable" — the input has no explicit `type` attribute, so
  `input[type=text]` did not match it.
- `deleteGroup` "no control" — the accessible name is «Slett gruppe: X», not «×».
- `deleteGroup` "silent failure" — my wait was 2s; at 6s the alert «Kunne ikke lagre. Prøv igjen.»
  is there.
- The live counter reading 6 while the round held 7 responses — the counter is the first **scale
  question's** `n`, and my respondent answered the text question and skipped the scale one. Both
  numbers were right.

Two more of my own checks were enumerations standing in for properties, which is this file's own
subject: a sweep for non-function exports from `'use server'` files matched `'use server'` **inside
comments** in `administrasjon/types.ts` and `profil/notify-keys.ts` — two files that exist
*because* someone already knew the rule — and a `grep` for writers of `organizations.worklist_view`
required `update` on the same line as the column, missing `saveCompany`'s object literal.

## Reproducing it

`scripts/walk/` holds the drivers (`w1`–`w9`). They need a seeded local stack and a built app; they
are not gates, they exit non-zero only on their own failures, and nothing in CI runs them.
Screenshots are in `docs/walk/shots/`.
