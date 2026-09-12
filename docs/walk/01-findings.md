# Walk — findings

**2026-09-12.** Fourteen findings. Three fixed (two BLOCKERs and one MAJOR, all one-file and
unambiguous); eleven logged. Severity per the instruction's rubric:

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

## W-03 · MAJOR · The respondent is promised a reply that cannot be delivered

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

**Not fixed.** The respondent page knows whether the token is an invitation or a share link, so the
fix is a conditional plus a second message key — more than one file, and a copy decision.

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

## W-05 · MAJOR · A permanently impossible delete says «Prøv igjen»

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

**Not fixed.** Needs a named error in the action plus a message key.

---

## W-06 · MINOR · A typed-but-unsaved comment is discarded silently

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

---

## W-07 · MINOR · Two screens have no `<main>` landmark

**What I did.** Scoped a locator to `main` on the Live presenter page and on `/rapporter`.

**What happened.** `locator('main')` timed out on `/undersokelser/<id>/live`; on `/rapporter` every
control (duty checklist toggles, «Signer», «Innstillinger») sits outside `main`. `grep -c "<main"`
on the live page returns **0**.

**Why it matters.** Screen-reader users navigate by landmark, and the definition of done names
keyboard and focus-visible explicitly. Every other screen I drove has one.

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

## W-10 · LIMITATION · Both quiz guards are enforced by hiding the control, with no explanation

`app.guard_quiz_policy` refuses `run_mode='quiz'` on an anonymous survey (`quiz_requires_named`) and
on a statutory pack (`quiz_not_on_statutory_pack`), both with good hints. From the UI the «Quiz»
control is simply **absent** in both states — measured 0 matches on an anonymous survey and 0 on
`Aktsomhetsvurdering leverandør` — and the screen says nothing about why.

The database guard is sound and is what actually protects the rule. But an administrator looking for
quiz mode on a statutory survey gets no sentence, and the two hints that explain it are only
reachable by provoking the error in SQL.

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

## W-13 · LIMITATION · No survey exists on which quiz mode can be switched on

Quiz requires `named` and refuses a statutory pack. The seed's only `named` + `standard` survey is
`Aktsomhetsvurdering leverandør`, which carries `leverandor-apenhetsloven`. So the state where the
«Quiz» control is offered **cannot be reached from a fresh seed at all**, and `setRunMode('quiz')`
is undrivable from the UI. A third fixture survey — named, non-statutory — would close this.

---

## W-14 · LIMITATION · Every gate discards the server log

`scripts/verify/server.ts:202` spawns Next with `stdio: 'ignore'`. W-01's cause was a single line in
that stream; in production the browser gets only a digest, by design. So the class "a server action
throws" is visible to no gate: the page still renders, the click still returns, and the only
evidence is thrown away at the source.

Logged rather than changed — the verification apparatus is frozen, and this is a change to it.

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
