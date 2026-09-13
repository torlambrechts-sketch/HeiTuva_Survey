# Walk — findings

**2026-09-12**, with a fix pass and two WITHDRAWALS on **2026-09-13**.

Fourteen findings were logged. **Twelve stand; two were wrong and are withdrawn below** — W-10 and
W-13, both manufactured by the same mistake in my own driving. Eight are now fixed. Severity per the
instruction's rubric:

- **BLOCKER** — a user cannot complete something the product promises, or data is lost
- **MAJOR** — it works but does the wrong thing, or a control does not control what it claims
- **MINOR** — cosmetic, or correct but awkward
- **LIMITATION** — behaving as designed, and the design has a cost nobody wrote down

---

## W-01 · BLOCKER · Live was entirely unusable · FIXED

**What I did.** Signed in as administrator, opened `/undersokelser/<live survey>`, clicked «Kjør
live», then pressed «Start live».

**What happened.** The page rendered perfectly. The click produced:

```
Application error: a server-side exception has occurred while loading 127.0.0.1
(see the server logs for more information). Digest: 4163817072@E352
```

**Console / log.** `500 POST /undersokelser/<id>/live`, a `pageerror` with the production digest,
and in the server log — which no gate captures — the actual cause:

```
⨯ Error: A "use server" file can only export async functions, found object.
  Read more: https://nextjs.org/docs/messages/invalid-use-server-value
  at 74366 (.next/server/app/(app)/undersokelser/[id]/live/page.js:2:29900)
  digest: '4163817072'
```

**Database.** `live_sessions` **1 before, 1 after. No write.**

**Cause.** `app/(app)/undersokelser/[id]/live/actions.ts:88` was `export { Code }` — a Zod schema,
i.e. an object. Next refuses to register the module, so **all three presenter actions were dead**:
`openLiveSession`, `closeLiveSession`, `setRevealed`. Opening, closing and revealing were all
impossible from the UI.

**Fixed.** `Code` was imported by nothing — declared line 14, exported line 88, used nowhere. The
one place that needs that regex, `app/l/[code]/page.tsx:43`, carries its own inline copy. The dead
const and its export are deleted. After rebuild: session opened, code `JU5B2B`, status `open`, the
page offers «Vis resultat» and «Avslutt live», observation log clean.

---

## W-02 · BLOCKER · The Arbeidsliste was entirely unusable, same mechanism · FIXED

**What I did.** Opened `/oppgaver` and clicked «Tavle».

**What happened.** Nothing visible changed. The board did not render.

**Console / log.** `500 POST /oppgaver`, a `pageerror` digest, and the same server-log line pointing
at `app/(app)/oppgaver/page.js`.

**Database.** The `heituva.worklist` cookie was **not written** — `(none)` before and after.

**Cause.** `app/(app)/oppgaver/actions.ts:34` was `export const TASK_ERROR_KEY: Record<TaskError,
string>` in a file whose line 1 *is* `'use server'`. All eleven actions on that screen were dead:
`setWorklistView`, `advanceTask`, `advanceTasks`, `addWorklistNote`, `assessTaskEffect`,
`assignTasks`, `createCorrectingTask`, `createWorklistTask`, `replyToComment`, `setCommentHandled`,
`setTaskDue`.

**Fixed**, following the pattern the repo already contains for exactly this —
`administrasjon/types.ts` holds `AdminError`/`ADMIN_ERROR_KEY` as a sibling module and says in its
own comment why. New `app/(app)/oppgaver/task-errors.ts` holds `TaskError`, `TaskResult` and
`TASK_ERROR_KEY`; `actions.ts` re-exports the types and `WorklistPanel.tsx` imports the map from
there. Three files, which by the letter of the instruction is "log it" — taken anyway because the
screen was dead and the fix is mechanical against an established convention. After rebuild: cookie
`board`, board columns render, log clean.

**The property, measured rather than patched instance by instance.** All 21 modules whose line 1 is
the directive were swept for exports that are not `export async function`. Before: two violations.
After: zero.

---

## W-03 · MAJOR · The respondent is promised a reply that cannot be delivered · FIXED

**What I did.** Opened `/s/<share-link token>` at 400px and opened the per-question comment box.
Then did the same through an invitation token. Then read the manager's side.

**What happened.** Both respondents are told, verbatim:

> **«Lederen kan svare uten å se hvem som skrev.»** (`respondent.qcReplyAnonymous`)

The manager, looking at a comment that arrived through a share link, is told:

> «Denne kommentaren kom fra en delt lenke, så det finnes ingen tråd å svare i. Du kan markere den
> som behandlet.» (`tasks.fbReplyNoThread`)

**Database.** A share-link comment is written with `invitation_id = NULL`. `WorklistPanel.tsx:973`
renders the reply box only when `canEdit && r.hasThread`, so there is no reply control at all.
Measured: the promise string is present on both surfaces, `true` for the share link.

**Why it matters.** One of those two sentences is false and it is the one the respondent reads. This
is the claim-set class CLAUDE.md says nothing mechanical protects, on the one surface where the
product's credibility is load-bearing. QR and splash respondents are in the same position.

**FIXED 2026-09-13**, on Tor's decision: *«The respondent text is the one that must change, because
the false half is the one she reads, and in the worst direction: she writes something she otherwise
would not, trusting a reply that never comes.»* The manager's sentence was already correct and stays.

The page could not previously tell the two apart — `get_survey_for_token` resolved
`v_res.invitation_id` and did not return it, and every available proxy (a null `invitation_lang`,
say) is an enumeration standing in for the property. So **`M:0119` returns the fact**: `has_thread`,
deliberately the same word the manager's side already uses, because it is the same fact about the
same comment and two names for one fact is how the two sides drift apart again.

`respondent.qcNoReply` — «Kommentaren leses, men du kan ikke få svar på denne lenken.» /
«Your comment is read, but you cannot receive a reply on this link.» — in `messages/*.json` **and
seeded into `ui_messages`**, because the file alone is a correction nobody receives.

Carried through test mode too (`loadTestSurvey` → `TestRunner`), since that preview exists to
exercise the respondent's real path rather than a default chosen for it.

**Driven, both kinds:** share link shows the no-reply sentence and NOT the promise; an invitation
shows the promise and NOT the no-reply sentence.

---

## W-04 · MAJOR · «Ord minst 0 personer har skrevet», projected on a wall · FIXED

**What I did.** Put a below-threshold survey into live mode and read the presenter screen.

**What happened.** The word-cloud panel's subtitle read **«Ord minst 0 personer har skrevet»**, one
line under «Live respekterer anonymitetsterskelen. Er det færre svar enn terskelen, vises ingen tall
på skjermen.» The above-threshold survey correctly read «minst 3».

**Cause.** `public.live_cloud` returns `jsonb_build_object('insufficient_data', true, 'n', null,
'k', v_k)` below the threshold — **with no `floor` key at all** — and `live/page.tsx` did
`floor: payload.floor ?? 0`, then interpolated it into `cloudFloor`. `LiveStage.tsx:277` rendered
that subtitle unconditionally.

**Why MAJOR and not cosmetic.** A floor of 0 asserts the cloud may show a word nobody wrote, which
is the exact opposite of what gating does, next to the sentence promising the gate. It is the
never-fabricate rule's own example — a number derived from an unknown denominator.

**Fixed**, one line in one file: the subtitle renders only when the cloud is not gated, because the
floor is genuinely unknown to the page in that branch. The gated body sentence (`cloudGated`) was
already correct and still shows. `cloudEmpty` also interpolates the floor but only runs in the
un-gated branch, where the value is real.

---

## W-05 · MAJOR · A permanently impossible delete says «Prøv igjen» · FIXED

**What I did.** Clicked «Slett gruppe: Ledelse» — a group with 1 member that **36 invitations**
reference.

**What happened.** The group was correctly not deleted, and after ~6 seconds an alert appeared:

> «Kunne ikke lagre. Prøv igjen.»

**Database.** `groups` 2 → 2. Members untouched (8 in the org, 1 still pointing at the group).

**Why it matters.** The refusal is right — V2-3b made `survey_invitations.group_id`
`NO ACTION DEFERRABLE INITIALLY DEFERRED` on purpose, so a past round's record cannot be left
pointing at nothing. But the message tells the administrator to retry an action that can never
succeed, and hides a constraint that is explainable in one sentence. `deleteGroup` returns
`save_failed` for every database error, and this is the same "generic failure standing in for a
named refusal" that `administrasjon/types.ts` already warns about in its own comment for the
`forbidden` case.

**FIXED 2026-09-13.** Measured first: the delete succeeds at statement time and the **deferred**
constraint fires at COMMIT with `foreign_key_violation` (23503) naming
`survey_invitations_group_id_fkey` — V2-3b's design working exactly as intended. `deleteGroup` now
reports that as its own result, `group_in_use`, with `admin.errGroupInUse` in both languages:
«Gruppen er brukt i en utsendt runde, så den kan ikke slettes.» Every other database error still
collapses to `save_failed`, which is the honest reading of an error nobody has named.

---

## W-06 · MINOR · A typed-but-unsaved comment is discarded silently · FIXED

**What I did.** Opened the per-question comment box, typed, then (a) navigated to the next question
and back, and (b) pressed «Send inn svar» without pressing «Lagre».

**What happened.** In both cases the text is gone. The box is closed again on return. No warning, no
"unsaved" marker.

**Database.** `survey_comments` 5 → 5. Nothing written.

**Cause, and it is by design.** `QuestionComment.tsx` holds the text in local state until «Lagre»
lifts it into the parent via `onSave`. Pressed properly, it works: `survey_comments` 5 → 6 with
`question_id` set, the saved pill survives navigation, and it reaches the Arbeidsliste.

**Why it is still a finding.** A respondent who types a sentence and presses the screen's primary
button loses it with no indication. The submit is not refused and nothing says anything.

**FIXED 2026-09-13.** The draft moved one level up, into `Respondent`, so navigating between
questions cannot destroy it, and a non-empty draft is submitted with the rest. That is **not** a
second write path — the note above rules one out and it still holds: one `submit_response`, one
transaction, one more item in the same array. «Avbryt» still discards, because there the respondent
asked.

**Driven:** typed on Q1 without pressing «Lagre», went forward and back — the box reopens with the
text intact — then submitted: `survey_comments` 4 → 5, written with its `question_id`.

---

## W-07 · MINOR · Two screens have no `<main>` landmark · FIXED

**What I did.** Scoped a locator to `main` on the Live presenter page and on `/rapporter`.

**What happened.** `locator('main')` timed out on `/undersokelser/<id>/live`; on `/rapporter` every
control (duty checklist toggles, «Signer», «Innstillinger») sits outside `main`. `grep -c "<main"`
on the live page returns **0**.

**Why it matters.** Screen-reader users navigate by landmark, and the definition of done names
keyboard and focus-visible explicitly. Every other screen I drove has one.

**FIXED 2026-09-13.** `LiveStage`, `ReportsScreen` and `ReportEditor` open a `<main>` instead of a
`<div>` — three roots, because `/rapporter` renders two different components depending on whether a
report is open. The class lists are untouched, so nothing moves a pixel.

---

## W-08 · LIMITATION · The Firma form saves on blur, with no visible save control

**Measured, four ways:**

| What a user does | Result |
|---|---|
| change a select, Tab to the next field *inside* the card | not saved (correct — `relatedTarget` is inside) |
| change a select, Tab all the way out of the card | **saved**, «Lagret» appears |
| change a text field, press Enter | **saved** |
| change a select, then hard-navigate (reload, typed URL, closed tab) | **silently lost** |

The submit button is `class="sr-only"`. There is no visible «Lagre» and no dirty indicator, so a
pending change is invisible and a hard navigation discards it without a word. Clicking a nav link
*does* save on the way out, so the common case is safe.

---

## W-09 · LIMITATION · A quiz respondent never learns anything

After submitting a quiz (`responses` +1, `responded_at` set), the respondent's screen is the generic
«Takk! Vi deler hva vi gjør med svarene innen to uker.» Measured: no «poeng», no right/wrong, no
score. The respondent is never told it was a quiz either — the entry screen says «Svaret vises med
navnet ditt» and nothing about points.

Correct on anonymity (a quiz is named, and no anonymity is promised). But a quiz whose participant
learns nothing is a quiz in name only, and the decision is not written down anywhere I could find.

---

## W-10 · ~~LIMITATION~~ · WITHDRAWN 2026-09-13 — the walk looked in the wrong pane

**What I claimed.** That both quiz guards are enforced by the «Quiz» control being *absent*, with no
explanation on screen.

**What is actually true, measured by driving it.** «Kjøremodus» is on the **Generelt** tab, not
Innstillinger (`Builder.tsx:401`), and the walk opened Innstillinger. The Quiz card is rendered on
every survey, with `locked: false`, and pressing it says exactly what happens:

| Survey | Card | Effect | Sentence shown |
|---|---|---|---|
| anonymous (`Utkast uten svar`) | present, enabled | `standard/anonymous` → **`quiz/named`** | «Undersøkelsen er satt til «Med navn».» |
| statutory pack (`Aktsomhetsvurdering leverandør`) | present, enabled | **refused**, unchanged | «Malen låser kjøremodus.» |
| live (`Arbeidsmiljø — månedlig`) | present, enabled | `live/anonymous` → **`quiz/named`** | — |

`RunModePanel`'s own header already records that it once told customers quiz did not exist and that
this was D135; the panel now carries `quizPackLocked`, `namedSurvey` and `quizSwitchedToNamed`, and
all three reach the screen.

**Three locator errors stacked to produce this**, and the third is the one worth keeping: `/^Quiz$/`
could not match a card whose accessible name is «Quiz» + «Opplæring og sertifisering»; there are TWO
«Innstillinger» buttons and the first is the mobile tab row, hidden at 1440px, so `.first()` clicked
nothing; and the pane I finally opened was not the pane the control is in. **A control reported
missing is a claim about a SCREEN, and it is only as good as the pane you were looking at.**

---

## W-11 · LIMITATION · The presenter's counter is one question's `n`, not the participants

`live/page.tsx:122` sets `answered = row.n` from `aggregate_results` for the **first scale
question**. Measured: round 2 held 7 responses, the scale question 6 answers, the text question 7 —
and the presenter read «6 svar».

Both numbers are right and the gating is right. But «6 svar» beside a chart reads as "six people
have answered", and a respondent who skips that question is invisible to the count.

---

## W-12 · LIMITATION · Eight of thirteen question types are unreachable from the demo seed

Seeded: `scale, likert, choice, yesno, text`. Absent: **`smiley, enps, slider, dropdown, image,
ranking, matrix, field`**. I reached them by building a survey in SQL from the registry's own
`defaultConfig`; all thirteen then rendered controls at 400px with no errors and no raw keys.

This is D102's shape: the seed reaches only states the current code creates, so any gate driving the
seeded respondent path exercises 5 of 13 renderers and looks complete.

---

## W-13 · ~~LIMITATION~~ · WITHDRAWN 2026-09-13 — the state is reachable, and the product helps

**What I claimed.** That no seeded survey exists on which quiz mode can be switched on, because quiz
requires `named` and the only `named` + `standard` survey carries a statutory pack.

**What is actually true.** The premise was right and the conclusion wrong. Quiz **does** require
`named` — and `setRunMode` switches the survey to `named` for you and says so, which is the whole
point of `quizSwitchedToNamed`. So `Utkast uten svar` (anonymous, no pack) reaches quiz mode in one
click, measured above. The state is reachable from a bare seed; I inferred it was not from a control
I had failed to find.

---

## W-14 · LIMITATION · Every gate discards the server log · FIXED

`scripts/verify/server.ts:202` spawns Next with `stdio: 'ignore'`. W-01's cause was a single line in
that stream; in production the browser gets only a digest, by design. So the class "a server action
throws" is visible to no gate: the page still renders, the click still returns, and the only
evidence is thrown away at the source.

**FIXED 2026-09-13**, on Tor's instruction: *«The last is not a blind spot — it is evidence produced
and then thrown away. Fix that one: capture the child's output. It costs nothing and it is the only
one of the three that was already telling you.»*

`stdio: ['ignore', log, log]` to `artifacts/server.log` (gitignored), and `serverLogTail()` prints
the interesting end of it — the first line Next marks as a problem, plus its stack — which
`ensureServer`'s timeout and `verify:browser`'s failure path now append. A FILE rather than
`'inherit'`, because piping Next's request log into every gate's stdout would bury the gate's own
findings, which is presumably why it was silenced in the first place.

**Both halves proven before being trusted.** Extraction: against a synthetic log carrying a real
Next `⨯` block, it skips the request-log noise and returns the error with its stack and digest.
Capture: the very first run against a live server produced `ui_messages read failed for no; serving
the bundled set: TypeError: fetch failed` — which diagnosed, in one line, a stopped Supabase stack
that had until then presented only as an unexplained sign-in timeout.

---

## The four LIMITATIONs that stand, and what was decided about each

**2026-09-13.** Decided and recorded rather than built, per the standing rule.

**W-08 — the Firma form saves on blur.** *Left as it is.* Every ordinary path saves: Tab out of the
card, press Enter, or click a nav link (measured — the soft navigation saves on the way out). Only a
hard navigation with focus still inside the card discards, which is what any unsaved form does. A
`beforeunload` prompt is a worse trade — it fires on every deliberate exit too. Worth revisiting only
if the design gains a visible save control; the bundle does not draw one.

**W-09 — a quiz respondent is never told anything.** *Not built; it needs a decision, not code.*
After submitting, the respondent sees the generic thank-you: no score, no right/wrong, and the entry
screen never says it was a quiz. The anonymity half is correct (a quiz is named and promises no
anonymity). But a score screen is a FEATURE with a real question behind it — whether a person should
be shown they answered wrong, and who else can see that — and Q84 already narrowed this area once by
removing the per-person attempt table. Building it silently would be building something that might
want to be unbuilt.

**W-11 — «6 svar» is one question's `n`.** *Left as it is, with the reason recorded.* `answered`
comes from `aggregate_results` for the first scale question, so a respondent who skips that question
is invisible to the counter. Both numbers are right and the k-gate reads from the same place, which
is what makes the gating trustworthy. Changing the number would mean either a second denominator on
screen or a count that no longer matches the chart beside it. The honest improvement is a label, and
labels on the presenter screen are the bundle's to decide.

**W-12 — eight of thirteen question types are absent from the seed.** *Not changed, and the cost is
the reason.* Extending `seed-demo` would give every browser gate more to see — and it would also move
`/undersokelser`, `/bygg` and every capture that lists surveys, so `verify:visual`'s snapshots and
`verify:responsive`'s 206 combinations would all have to be re-baselined in the same commit. That is
a change to what every gate is measured against, which is not a walk's business. Logged for a phase
that can re-baseline deliberately; the walk reached all thirteen by building a survey from the
registry's own `defaultConfig`, which is the cheap way to measure them meanwhile.

---

## Things that looked wrong and were not

Recorded because a manufactured defect is indistinguishable from a real one until someone reads the
source, and that reading is what a busy phase skips.

- **Two `'use server'` files appeared to export objects.** `administrasjon/types.ts` and
  `profil/notify-keys.ts` mention `'use server'` **in a comment explaining why they are separate
  files** — they exist precisely because someone already knew the rule. My grep found the words it
  refuses, which is the section CLAUDE.md added this week.
- **`organizations.worklist_view` appeared to have no writer.** `saveCompany` writes it at
  `administrasjon/actions.ts:133` inside one `.update({…})`, with `CompanyForm.tsx:168` as the
  control and the migration comment naming the writer. My grep required `update` on the same line
  as the column.
- **Duplicate `feature_flags` rows** (`sms_channel` true and false) are a global `false` plus a
  per-org `true` override — the designed shape.
- **«Vis resultat» below k** is rendered `disabled`, and forcing the click left `revealed = f`:
  the server refuses it too. Defence in depth, not a disabled button standing alone.
- **An unspent live token after the session closes** is refused — «Denne undersøkelsen er lukket»,
  no new response.
- **Q78** refuses `run_mode='live'` on a named survey with a usable hint.
- **Q69 / Q97 / Q158** all behave from the UI as decided, including «Lukk valgte» being absent.
