# 02 — Conflicts (Round 2)

Two classes: **(A)** the bundle contradicting a committed decision, and **(B)** the security
reviewer and the product reviewer disagreeing about whether a feature can exist in this
product at all. Each is resolved, or marked **TOR'S CALL** with the options stated. Nothing
is split down the middle.

**Note on the decision numbers this round was asked to check.** The instruction names
Q17, Q28, Q31, Q45 and Q49. `DECISIONS.md` in this repository contains **Q1–Q17** only
(00-diff §0.2). I have resolved against the decisions that actually exist, and where the
instruction's intent is obvious from the subject matter I say which real decision it maps
to. Q17 is real and is the biggest collision, exactly as predicted.

---

## A. Bundle versus committed decisions

### A1. The anonymity threshold is drawn as a switch — **Q3**

**Q3 (DEFAULT, applied):** "Hard-on, non-disableable. The Personvern toggle renders as
informational ('Alltid på'). A toggleable anonymity guarantee is not a guarantee."

**The app implements this.** `messages/no.json:700` —
`"pMinResponsesLocked": "Alltid på — håndheves i databasen"`.

**The bundle contradicts it.** `privacyToggles` :5592–5597 lists
`["minResponses","Håndhev minsteterskel","Resultater vises ikke før terskelen er nådd"]`
alongside four ordinary settings, and every row in that list is wired to a live
`onToggle` at :5600 that flips `st.privacy[k]`. As drawn, an administrator can switch the
minimum threshold off.

**RESOLVED — the file wins.** CLAUDE.md: "If the design bundle and this file conflict, this
file wins on security." Q3 is a security decision and the enforcement is in the database,
where no UI toggle reaches it. The Personvern row stays **locked and informational**,
styled exactly as the bundle styles a disabled switch (the same treatment the quiz toggles
get at :6156–6157: `opacity .45`, `cursor:not-allowed`, early return). Log as a deviation.

### A2. The bundle re-asserts a categorical "fem" that Q17 removed — **Q17**

**Q17 (CONFIRMED by Tor):** k is a per-survey policy — default 5, **floor 3** for natural
persons, **none** for organisation respondents, statutory packs locked. `app.k_for`
replaced the constant (`supabase/migrations/20260904000032_threshold_policy.sql:69`).
D87 records that Phase 9 rewrote every string where a k is known so that "no fixed 'fem'
survives", and explicitly flagged the splash and the legal pages to Tor as his call.

**The bundle re-asserts the constant in five places:**

| Line | Text |
|---|---|
| `HeiTuva.dc.html:1711` | "Grupper med færre enn **fem** svar vises aldri nedbrutt, uavhengig av filter." |
| `HeiTuva.dc.html:2790` | "Resultater vises først ved **fem** svar, og frisvar vises aldri sammen med gruppe når gruppen er mindre enn **fem**." |
| `HeiTuva.dc.html:4660` | "Grupper med færre enn fem svar vises som **n<5**." |
| `HeiTuva Splash.dc.html:375` | `stat:"n ≥ 5"` (and the sv/da/de variants at :457, :539) |
| `HeiTuva Splash.dc.html:489`, `:571` | "inga tal under fem svar" / "ingen tal under fem svar" |

**RESOLVED — the file wins, and this is the sharpest case of it.** CLAUDE.md says the
bundle wins on visuals and this file wins on security, and it also says "Norwegian copy
must match the design bundle verbatim". Those two rules collide here and the security rule
takes precedence: a survey with k=3 whose screen says "fem" is a false statement about the
product's central guarantee, and a survey with k=0 (organisation respondents) whose screen
says "fem" is worse. Every one of these strings is parameterised on `app.k_for`, as D87
already did for the app's own copy. The splash and legal texts stay flagged to Tor
(D87 already flagged `splash.*`, `legal.privacy3P`, `legal.dpa4P`) — **marketing copy is
his call, and it is now overdue**, because with a floor of three these sentences are no
longer categorically true.

### A3. Three v2 surfaces hard-code 5 in logic, not just copy — **Q17**

`hasThresholdWarn` :4988 (`g.count > 0 && g.count < 5`), `mgGroups.small` :5048
(`g.count < 5`), `mgSegments.small` :5052 (same); the warning's group list is built on the
same constant at :4986.

**RESOLVED — the file wins.** Any phase touching an aggregate path carries the two-sided
catalogue-derived `k_for` assertion (nothing calls the old constant; everything reading the
vault calls `k_for`), and these three are new callers. They must read
`app.k_for(survey)`, and they must handle the `0` return (organisation respondents,
ungated) explicitly rather than by `count >= k`.

This also answers the question the instruction asked: **yes — `hasThresholdWarn`'s
`audGroups` is the data source D87 §2 has been waiting for.** The builder's breach warning
needs a pre-send audience with counts, which is exactly `DEFAULT_AUD`. That makes the
builder-panel phase depend on the Målgrupper phase, which the plan reflects.

### A4. A per-topic automatic threshold of 8 — **Q17, and it is new**

`orgThresholdChips` :5583 offers **[3, 5, 8, 10]** (3 is Q17's floor — correct).
`orgSensitiveChips` :5587 offers **[5, 8, 10, 12]**, default **8**, and `orgThresholdNote`
:5591 states the rule: "Kartlegging av trakassering, varsling og helse settes **automatisk**
til 8." Repeated in the help centre at :4230 and :5131.

Q17 has no such rule. It defines a default, a floor and a lock; it does not define a
**topic-driven escalation**.

**TOR'S CALL.** This is a new decision, not a contradiction — it strengthens the guarantee
rather than weakening it, so it cannot be resolved by "the file wins". Three readings:

1. **Adopt it as a pack property.** Statutory packs already carry their own locked policy
   (`app.apply_pack_policy`, `…0032`); "sensitive" packs simply carry 8 instead of 5.
   Cheapest, most consistent with data-not-code, and it means the escalation is *seeded*,
   not inferred from a topic string.
2. **Adopt it as an org setting with a pack override**, exactly as drawn — a second org
   default that applies to a named set of packs.
3. **Reject it** and keep one org default.

I recommend (1). It requires no new column beyond a seed change, it cannot be got wrong by
mis-classifying a topic at runtime, and it composes with the existing lock.

Note the same line contains a second rule that *is* consistent with Q17 and should be
confirmed: "Den som lager en undersøkelse kan heve terskelen, men ikke senke den under
virksomhetens minimum" — which is `organizations.default_k_threshold` as a floor plus
`privacy.redaktor_may_lower` (`…0034`), already built.

### A5. The bundle asserts a fourth role — **CLAUDE.md role semantics**

CLAUDE.md §4: "`administrator` (settings/privacy/users), `redaktor` (create/send),
`leser` (aggregates only)". Three. The schema agrees (`app.member_role`).

The bundle says four. `:4279` — "**Fire roller** styrer hva folk ser." `:4283` —
"Leser og verneombud. Leser ser summerte resultater. **Verneombud har egen rolle i
lovpålagte kartlegginger.**" Repeated at `:5100` and `:5131`.

**TOR'S CALL, and it is not cosmetic.** A verneombud (safety representative) genuinely does
have a distinct statutory position — aml. § 6-2, and the medvirkning that the psykososial
report must document (the app already models duty signers, `…0004_duty_signing.sql`). So
the design is not wrong about the world; it is inconsistent with the product's role model.
Three options:

1. **A fourth role.** `verneombud` in `app.member_role`, with `leser`'s read rights plus
   named participation in statutory duties. Touches every RLS policy and every
   `app.has_role` call — a real change to the security kernel, and 5a3 will re-enumerate
   every surface against it.
2. **Not a role but a duty capacity.** Verneombud is already expressible: `duty_signers`
   records who signs, and a member can be a `leser` who is also a signer. The help copy is
   then corrected to "tre roller, og verneombudet signerer".
3. **Copy only** — write "fire roller" and mean three plus a signer. I would not do this;
   it is the class of statement that ends up in a sales deck.

I recommend (2). It costs one copy change, it is already built, and it keeps the role
model — which is a security surface — at three.

### A6. Import: sync sources move out of Send — **Q9**

**Q9 (DEFAULT):** "CSV / Excel / paste real in v1; Entra ID, Google Workspace, HR-systems
as stubs behind the same UI ('kommer'). Same import UI as designed; sync sources gated by
`feature_flags`."

v2 removes `isPasteImport` and `isSyncImport` (old :4019, :4020). The Send screen now has a
one-off list only — "Engangsliste for denne utsendingen" :3020 — with "Lagre som målgruppe"
:3037, and hands sync to Målgrupper at :3040: "Synk fra Entra ID, Google Workspace,
HR-system og distribusjonslister administreres i Målgrupper, der de får eier og synkstatus."

**RESOLVED — the bundle wins; Q9 is amended, not violated.** Q9's substance (CSV/Excel/paste
real, sync stubbed behind flags) is untouched; only the *location* of the stubs changes,
and the new location is better: a synced source with an owner and a sync status is an
organisational object, not a per-send action. Q9 gets an amendment line so the register
does not read as though the build drifted. **Consequence for the plan:** the sync stubs
move to the Målgrupper phase, still flagged, still "kommer", still not depending on the
deferred integrations phase.

### A7. `QUIZ_TILES` introduces four non-token colours — **CLAUDE.md tokens**

`:4084–4089` — `#F26B21`, `#2F6FB0`, `#2F7D4F`, `#B0343C`, each with `fg:"#FFFDF6"`, used
at :4768 and reaching the **respondent** surface through `respondOne.quizTiles`.
CLAUDE.md lists the theme tokens and says tokens never change across breakpoints; the
spirit is that they do not change across surfaces either.

**TOR'S CALL** (Brief 3 argues it, Brief 7 would rather the whole feature waited). Three
readings, restated compactly:

1. **New tokens** — a named quiz-tile role in the theme and `tailwind.config.ts`
   (`--qz1…--qz4`). They are functional, not decorative.
2. **A logged deviation** — used only inside quiz, hard-coded, never in the theme.
3. **Reuse `--ac/--ac2/--ac3/--sbg`** — one token set, at the cost of four near-identical
   luminances that will not read from the back of a room.

Recommend (1). Whichever is chosen, the contrast pairing must be **measured**, not
assumed — `#FFFDF6` on `#F26B21` is around 3:1, which is large-text-only under WCAG AA,
and these tiles carry answer text on a respondent surface that is pixel-perfect and
mobile-first.

### A8. BankID revisits a deferred identity decision — **Q4**

`intGroups` :5215 — `["bankid","BankID / ID-porten","Signering av rapporter og
tiltaksplaner","Trenger oppsett","navn, signaturtidspunkt","Lovpålagt"]`.

**Q4 (DEFAULT):** "Tokenized email links only in v1. `survey_invitations.identity_provider`
(nullable) reserved for BankID/ID-porten later; duty **signing** records member + timestamp
+ content hash (audit-grade, not qualified signature) in v1."

**RESOLVED — no conflict now; it is the deferred phase's decision.** Q4 anticipated this
exactly and reserved the column. What Q4 did *not* decide is whether a BankID signature
changes what the product claims a signed duty report legally *is*. That question belongs to
the final phase's decision batch, and the plan says so.

### A9. The public page markets what does not exist — **Q11's precedent (D73)**

`HeiTuva Bruksomrader.dc.html:51` — "**Ni** undersøkelser norske virksomheter kjører
oftest", with `ORDER` :290 naming nine survey types. The app bundle's `USE_CASES` :4034 has
six *categories*; `PACKS` has 23. As 00-diff §A.12 shows, these are different axes and
there is no arithmetic contradiction — but there is a marketing claim.

Separately, the splash links twice to `HeiTuva Lovpalagt.dc.html`
(`HeiTuva Splash.dc.html:1027`, `:1029`), **a fourth page the bundle does not contain**.

**RESOLVED, with a blocker.** The precedent is D73: the splash claimed four languages, the
product had two, and the public page was corrected because "a public page must not claim a
capability the product does not have". Same rule here — Bruksområder ships only when the
nine named types exist as template packs (five of the twenty-three are new, and the nine
map onto them), and it ships without the two dead links. **The missing page is Tor's to
supply or to strike** (00-diff §0.3.2).

### A10. Fifteen integrations are drawn as a settings tab — **Q9, Q6, Q7**

Not a contradiction of any single decision, but the tab presents as nearly-done a surface
that is deferred in full. **RESOLVED:** Integrasjoner is inventoried and analysed and
placed in the single final phase. No earlier phase may assume any of it. Where a surface
needs data an integration would supply — Målgrupper's Entra/CSV source field, sender
domain verification, supplier org-number lookup — it is planned against **manual or CSV
input**, with the integration named as a later enhancement.

---

## B. Where the security reviewer and the product reviewer disagree

### B1. Tasks from below-threshold findings

**Product (Brief 6):** the statutory task register with hjemmel is the most valuable thing
in the bundle — it is what makes this a compliance product. Its most-drawn source is a
below-threshold finding (:4239, :4270, :4168).

**Security (Brief 2 i):** a task naming a source, a group and a legal basis discloses that a
specific sub-threshold group scored badly, which is precisely what k=5 exists to prevent;
`threshold.breached` (:5248) then exports it past every control. "It cannot ship as drawn."

**They do not actually disagree about the feature — they disagree about the payload, and
that is resolvable.** aml. § 4-3 (3) does not pause below five answers, so the duty is
real; nothing in the security position argues otherwise. What is unresolved is what the
task may contain.

**TOR'S CALL, and it is the first decision of the whole plan**, because three phases hang
off it (Oppgaver's source, the builder's breach warning, and the webhook). The options,
from Brief 2:

1. **The duty, not the finding.** The task says an undersøkelsesplikt is triggered for the
   survey — no group, no question, no score. Recommended by the security reviewer.
2. **The finding, administrator-only, never exported.** Defensible; splits the task list by
   role, which the design does not draw.
3. **As drawn.** The security reviewer says no.

Whatever is chosen: `threshold.breached` is a separate question (B2), and the Oppgaver
phase can be built *without* the from-findings source and gain it later — which is how the
plan sequences it, so that this decision does not block the valuable part.

### B2. `threshold.breached` as a webhook

**Product:** it is one of six events on a public API surface a customer will expect.

**Security + scope-split (Brief 7):** whatever shape the task takes, an outbound event
firing on a sub-threshold finding carries the disclosure past every control by
construction; if the task itself is safe, `task.created` already exports it, and the
threshold event adds only the leak.

**RESOLVED — do not build it.** The recommendation stands on both briefs agreeing, and it
costs nothing the product needs. Recorded as a decision line so it is a choice rather than
an omission.

### B3. `helpForum`

**Product (Brief 6):** it is one tab (`helpForum` :5086) beside articles and contact, and
the bundle even writes its promise: "HR-folk, verneombud og innkjøpere deler maler,
formuleringer og erfaringer. **Skriv med fullt navn eller anonymt.**" (:2091).

**Security (Brief 2 v) + scope-split (Brief 7):** it is UGC — moderation, storage,
harassment, takedown, retention — and the "anonymt" option puts an unmoderated anonymous
posting surface inside a product whose entire selling point is a controlled anonymity
guarantee.

**RESOLVED — ship articles and contact; do not ship the forum.** Twelve articles (:4177+)
and `helpContact`/`contactSent` (:5159) are the useful part and are ordinary content work.
The forum is a community product with a permanent operational obligation, and its anonymous
mode is an unmoderated-defamation surface. If Tor wants a community, buy one; do not build
one behind a tab.

### B4. `audienceQuestions` on the projected screen

**Product:** it is the interactive part of live mode; a town hall without questions is a
slideshow.

**Security (Brief 2 v):** it is public UGC displayed to colleagues in a room, in a product
that promises anonymity elsewhere, and a question can be harassment or — worse — an
aml. kap. 2A disclosure read aloud to the department, which is the opposite of what
kap. 2A requires.

**RESOLVED for the v2 build, reopenable later.** It defaults **off** (`DEFAULT_LIVE`
:4338, `questions:false`). Ship live — if live is built at all (B5) — with it off and
unbuilt. It is a separate decision with its own moderation design, not a toggle.

### B5. Whether Live and Quiz belong in this product at all

**Product:** they are drawn, they are demoed, and Mentimeter-style live sessions are how a
psykososial kartlegging gets discussed in the room rather than filed.

**Scope-split (Brief 7):** a live presentation engine is a program — real-time state, a
projector surface with no theme precedent, a viewport class RESPONSIVE.md does not cover, a
moderation queue, UGC, and a timing leak no gate can see. Quiz on top adds assessment
semantics with their own retention and visibility questions.

**RESOLVED — they are each their own phase, and they do not start until their decisions are
taken.** The instruction is explicit that tasks-from-findings, live and quiz each get their
own phase with negative tests first and the Q17 treatment, and that none may be folded into
a larger phase. The plan honours that. What Round 2 adds is that **live cannot start at all
until RESPONSIVE.md's uncovered cases are answered** (Brief 4, items 1–3), because
CLAUDE.md relaxes "do not invent" only to the patterns that file contains, and a projector
is not one of them.

### B6. Quiz results in the response tables

**Database architect (Brief 1) and security reviewer (Brief 2 iii) agree**, from different
directions: a quiz result is attributable by design (person, score, pass/fail,
certificate), and putting it beside `responses` either relaxes the anonymity CHECK or turns
the invariant from "no anonymous row can reference a person" into "no anonymous row *of
this kind* can". The DSR flow's answer for surveys — structurally nothing attributable —
stops being true.

**No product counter-argument was offered.** **RESOLVED:** quiz lives in its own tables with
its own RLS and its own retention. Recorded as an invariant consequence, not a preference.

### B7. Målgrupper: send guard versus retention

**Security (Brief 2)** treats population separation as a rule for `send_round`.
**Product (Brief 6)** points out `popRows` :5037–5042 carries a retention period per
population ("24 mnd", "5 år", "12 mnd") and `app.apply_retention` has no population input.

**RESOLVED — both, or neither, in the same phase.** Enforcing the send guard while
retention stays global gives the screen a promise the data lifecycle does not keep. Since
populations are catalogue-blocked (00-diff §0.1), this whole cluster waits, and the
Målgrupper phase ships **groups and segments only** — which is the split Brief 7
recommends and the plan adopts.

---

## C. Conflicts that resolve themselves

Recorded so nobody re-derives them:

- **Oppgaver vs `loop_actions`.** Supersedes. Migrate `text → title`, `done → Lukket`,
  retire the Oversikt surface. No disagreement between briefs.
- **Innsikt vs the five-item nav.** Supersedes. Routes survive; the shell changes.
- **Admin → Profil og avsender vs profile settings.** It is a Q17 policy surface
  (`brandLocked` :4830 derives from `policy.locked || policy.legal`), and it reuses the
  existing lock rather than deriving a second one.
- **The D87 nine.** Not a conflict at all — the stop-and-ask logged at
  `docs/DEVIATIONS.md:1622` is answered by this bundle. Kind 1 work, first in the plan.
