# 08 — B0 → B3, run end to end

One document for four phases. Each was built, verified and fixed on its own before the next
opened; what changed is that nobody was in the loop between them, not that the passes merged.

**Commits:** `d896e0b` B0 · `2887d68` B1 · `614d80a` B2 · `11ca4ba` B3.

---

## 0. The numbers, measured against what the plan predicted

| | census | plan said | 5a3 |
|---|---|---|---|
| before B0 | 978 / 69 files | — | 65 of 90 *(carried; see below)* |
| B0 | **983 / 70** | 980 / 69 | unchanged |
| B1 | **994 / 71** | 991 / 70 | unchanged |
| B2 | **1003 / 72** | 998 / 70 | unchanged |
| B3 | **1021 / 73** | 1014 / 71 | unchanged |

**CI run 106 measured the census at exactly `1021 passed across 73 files`** — the manifest and the
suite agree, which after four hand-edited entries is worth saying rather than assuming.

Re-derive with
`node -e 'const c=require("./tests/expected-counts.json");console.log(Object.keys(c).length,Object.values(c).reduce((a,b)=>a+b))'`.

**The divergence is +7 tests and +2 files, and it is one decision made four times.** The plan
predicted that B0's and B2's tests would extend existing files. There is no existing unit-test
file about `QuestionCard` or about the Builder's tabs, and appending Builder assertions to, say,
`quiz-reachable.test.ts` would make that file's census entry a lie about what it covers. So each
phase got its own file: `builder-disclosure`, `quiz-preview`, `builder-tabs`, `bank-picker`. The
extra tests are the fix passes' own — B1's placement corrections and B3's state-append pair were
not in the plan because the plan had not yet found the defects they cover.

**5a3 — MEASURED, and the carried number was already stale before B0 opened.** I wrote «65 of 90,
unchanged by construction» in all four commit messages. The structural half is right: no phase
added a migration (`git diff --stat 0273d75..11ca4ba -- supabase/migrations/` is empty), so the
gate's inputs could not move. **The number was wrong.** CI run 106 enumerates
**56 RLS tables + 36 SECURITY DEFINER functions = 92**, of which **67** report `ok` or `NO DATA`:

```
5a3 = 67 of 92          # not 65 of 90
```

Re-derived from the run's own log the way CLAUDE.md says to — `grep -cE '^  (ok|NO DATA)'` over
the policy gate's output, against the two `enumerated` headers. **65 of 90 was last true at V2-10.
The mail tranche and the S-block added `M:0095`–`M:0098` between then and now, and nobody
re-derived it** — so four of my own commit messages carry a number I inherited and did not
measure, which is the third instance of that pattern this project has recorded and the first
where I am the one who carried it. The gate itself reports «every protected surface is both
protected and guarded by a test».

---

## 1. B0 — bundle citations get a coordinate system, and one dead class

**Done.** `QuestionCard`'s advanced panel is state-driven; 28 citations under `bygg/` and
`bibliotek/` carry `L:` / `V1:` / `V2:` prefixes; the convention is written once in
`docs/v2/00-diff.md § 0.3`.

**What failed on the way — and it is the finding of the phase.** The measurement I wrote the day
before said «28 citations … and all are v1's numbers». I had sampled **one**, found it in v1, and
generalised. Resolved properly, by locating a distinctive marker from each cited region in all
three bundles:

```
Videre til utsending   L:486   V1:529   V2:549
{{ builderQs }}        L:340   V1:383   V2:410
Fjern fra banken       L:1674  V1:2007  V2:2977
```

**24 resolve in the LEGACY bundle, 4 in v1, none in v2.** A blanket `V1:` backfill would have
replaced 24 unlabelled citations with 24 **falsely labelled** ones — strictly worse than leaving
them bare, because a wrong coordinate system is trusted and an absent one is questioned. An
enumeration mistaken for a property, inside the method being used to fix an enumeration mistaken
for a property.

**The dead class.** `<details className="mt-[11px] md:open" open>`. Three things wrong at once:
`open` is a Tailwind *variant*, never a utility, so `md:open` compiled to nothing; the `open`
attribute was unconditional, so the panel was expanded at every width while the comment above it
said it started closed on mobile; and the `md:hidden` summary was therefore a control that below
`md` did nothing. `<details>` cannot express «closed below md, open above» — `open` is an
attribute and no media query reaches it — so the breakpoint moved to a class.

**Fix pass** found a D141-shaped collision in the control the phase had just introduced: `p-0` at
12.5px paints ~15px, so `touch-44` overflowed ~14px into a panel whose first input overflows ~5px
back, against an 8px gap. Derived, not tuned: `py-[11px]` and `mt-3` give 8.5px of demand against
12px.

**Not in it:** the 113 citations outside `bygg/` and `bibliotek/`
(`grep -rn "HeiTuva\.dc\.html:[0-9]" app/ | wc -l`). Out of scope by construction; prefixed by
whichever phase next reads each file.

---

## 2. B1 — the answer key reaches the preview

**Done.** Three `isQuizMode` regions the app did not have: the `Legg til` note (`V2:646-648`), the
score/timer bar (`V2:900-905`), and the key marked on the chip plus the `quizLine`
(`V2:6506-6516`, `923`, `929-930`).

**Database first, and it is what made the phase.** `answer_index` and `points` both exist on
production with writers (`bygg/actions.ts:162-163`), so no migration. But reading
`answer_index`'s **column comment** before writing the renderer caught the thing source-reading
the bundle would not have:

> The bundle defaults it to 0 for display (V2:6507, «Riktig svar: første alternativ»); the COLUMN
> does not, because a default of 0 would silently mark the first option correct on every question
> ever written — a fabricated answer key, which is worse than an absent one.

Implementing the bundle would have put back into the UI exactly what the migration kept out of
the table, **on the worse surface**: `quiz_leaderboard` scores against `answer_index`, so a NULL
key pays nothing while the preview promised a score. `quizNoKey` — «Ingen fasit valgt» — is
rendered instead. **D144.**

Same shape, second instance: the bundle's timer reads «20 sek · tidsbonus» and there is **no
configured time limit anywhere in the schema** — the bonus scales points by speed, it is not a
deadline. True half ships, invented half does not, and the test asserts the absence from the
migration rather than trusting it. **D145.**

**Q109, answered by measurement rather than by preference:** `#2F5D2A` on `#E4F2E0` is
**6.65 : 1**, above AA's 4.5 and within a quarter-point of `--mut` on `--sf` at 6.93 — a contrast
the product already ships everywhere. The pair ships exactly as drawn and is **not** promoted to a
token: that would be four departures to solve a consistency problem the measurement says does not
exist. «✓ riktig» is the second, non-colour channel (D125's shape). The ratio is **recomputed
inside the test** from whatever hexes the file carries, so editing either one fails. **D146.**

**What failed on the way.** One test bug: `toContain('fabricated answer key')` failed because SQL
comments are adjacent string literals and the phrase spanned the join. The test now rejoins them,
so it asserts the sentence the database stores rather than how the migration is wrapped. The code
was correct throughout — a red about the wrong thing, caught before it changed any code.

**Fix pass** found three placement diffs: `quizLine` sits AFTER the scale labels, not before, at
`11px` not `11.5px`, `mt-7` not `mt-6`; and the chip is `inline-flex` with `gap-6` and a
`10.5px/700` mark, per `V2:923`.

**Not in it, and not a defect:** `quizPreview.chips` (`V2:908`). The bundle renders a pass mark and
an attempt count unconditionally; Q84 built neither, and `QuizPanel` says so on the face of the
product. **The bundle draws them; we do not; V2-10 decided that.**

---

## 3. B2 — the right pane's fourth tab, and a panel the third handoff redrew

**Done.** `TABS` is `['general','add','settings','preview']` (`V2:6472`). Mode and quiz settings
moved to `general`; policy and engagement stayed in `settings`. «Byggemodus» moved inside the
RunModePanel card below the rule `V2:580` draws, with a description that swaps with the setting
(`V2:6111-6113`) so a reader is never told what the *other* mode would give them. Entry tab stays
`add`, which is what `V2:6193` sets.

**The add panel is the half worth reading.** Before B2 it was `flex-col`, a 26px radius-8 tint, a
13.5px/600 label and a **visible** 11.5px description. That is not drift — **it is `L:513-525`
property for property.** The app was faithful to the bundle it was built against. v2 redrew the
panel: two columns, a 20px radius-6 tint, a 12.5px/600 label at line-height 1.25, `10px 11px`
padding, radius 10, and the description moved from a visible line to `title`.

**I had to establish that before touching it**, because unbuilding a visible affordance and
closing a fidelity diff look identical from the diff alone. Having established it, Q52 hands a v2
phase the whole redraw rather than the parts of it that are convenient. The string is still
shipped and still translated in both languages; it is an accessible description now instead of a
line. **If you want the line back, this is the one to reverse** — it is the only change in the run
that removes something a sighted user could previously read without hovering.

**Fix pass:** the comment above the RunModePanel mount still said «Innstillinger» after the panel
moved, and `builder.mode` lost its only caller — a key with no reader is a dead allowlist entry
one layer over, so it is gone from both languages. Production's `ui_messages` keeps an inert
orphan row until the next reseed; the overlay makes that harmless.

---

## 4. B3 — the picker overlay, which did not exist, and the bank's confirmation

**Done.** `BankPicker.tsx`, built to `V2:650-693`: scrim, 660px panel, search, category chips
derived from the rows present, badge/cat/type rows, «Legg til», the cumulative footer note, «Åpne
biblioteket» and «Ferdig». Escape and the scrim close it; focus lands on the close button.

**Database first, proven rather than assumed.** `sq_cud_ins`'s WITH CHECK is
`app.can_edit_survey(survey_id)`, read off the production catalogue — so a `leser` and a
cross-org survey are refused **by the database**, not only by `requireEditor()`. No migration.

**Seed, in the same phase, because the constraint says so.** The demo seed carried **no**
`question_bank` rows, so the overlay would have opened empty on a bare reset — a screen that
renders, reports built, and shows nothing. Five rows now, both kinds (`org_id is null` is the
shared bank, `org_id` is this org's own) across three categories, because the chips are derived
from the categories present and one category proves nothing about filtering.

**The fix pass found the defect that mattered, and it was mine.** `revalidatePath` on the Builder
route is necessary and **not sufficient**: `Builder` holds `useState<BuilderDraft>(initial)`, and
`useState` **ignores a new initial value**. The server would re-render, hand down a fresh
`initial`, and the list on screen would not move — **an insert that succeeds and shows nothing**,
which is precisely the failure this overlay exists to stop happening on the Library route.
`addBankQuestion` now returns the inserted row and the Builder appends it.

**Q108, the confirmation:** a shared `--ac2` pill in the bank header naming the draft and clearing
at the bundle's own 2200ms, replacing a permanent in-button state that never said *where*, went
silent after three additions, and **made a question addable exactly once** — which nothing in the
schema asks for.

**D147, found in the database step and deliberately NOT fixed.** `addBankQuestion` bumps
`question_bank.used_count`; `bank_cud_upd`'s USING clause is
`org_id IS NOT NULL AND app.has_role(org_id, …)`. A standard bank question has `org_id NULL`, so
the update matches zero rows and returns no error, and nothing checks one. **«brukt i {count}» on
every validated row is not a count of anything.** Every honest fix is a migration, and a migration
reaches production — a stop condition. This is «who writes this column» one step on: there IS a
writer, in the obvious place, doing the obvious thing, and the database declines it in silence.

---

## 5. Decisions I defaulted — the list, so you can find them

Reverse any of these and nothing else in the run depends on it.

| # | Default taken | Where |
|---|---|---|
| **Q105** | Adopt `L:` / `V1:` / `V2:` prefixes; backfill only `bygg/` + `bibliotek/`, and prefix the other 113 in whichever phase next reads each file | B0 |
| **Q108** | The confirmation becomes a header pill naming the draft, clearing at 2200ms — and the add-once restriction goes | B3 |
| **D144** | The preview renders «Ingen fasit valgt» where the bundle renders «Riktig svar: første alternativ» | B1 |
| **D145** | The timer drops the bundle's «20 sek» and keeps «Tidsbonus» / «Ingen tidsgrense» | B1 |
| **D146** | `#E4F2E0` / `#2F5D2A` ship as drawn, un-tokenised — measured at 6.65:1 | B1 |
| — | The add panel's per-type description moves from a visible line to `title`, because v2 redrew the panel | **B2 — the one worth a second look** |
| — | `builder.mode` deleted from both languages, having lost its only caller | B2 |
| — | `addBankQuestion` returns the inserted row (an additive change to a shared action) | B3 |

**Q106 and Q107 are not on this list**: building the overlay and splitting the tabs *are* B3 and
B2, and ordering the run ordered them. **Q104 was not taken and is still open** — the reference
baselines are still non-deterministic (D143).

---

## 6. What is now visible in the product that was not

On the Builder (`/undersokelser/<id>/bygg`):

- a **«Generelt»** tab, first in the rail;
- **«Byggemodus»** inside the Kjøremodus card, with a description that changes with the setting;
- a **two-column type palette** in «Legg til», 20px tints, no description line;
- **«＋ Fra spørsmålsbanken» opens a modal** instead of navigating away, and adds into *this*
  survey;
- in quiz mode: a note in «Legg til», a **score/timer bar** at the top of the phone preview, the
  correct option **outlined green with «✓ riktig»**, and one of
  «Riktig svar: alternativ N · P poeng» / «Ingen fasit valgt» / «Ikke poenggivende i quiz» under
  each question;
- the advanced panel's mobile disclosure **actually closes**.

On the Library's bank tab: the confirmation is a pill in the header naming the draft, it clears
itself, and a question can be added more than once.

**Nothing reached production.** No migration, no `ui_messages` write, no seed run against the
remote project. The only production reads this run made were catalogue queries.

---

## 7. The walkthrough — what to click, and what each screen should show

**Where.** Not `www.heituva.com`. That serves `main`, and none of B0–B3 is merged. Vercel has a
**preview deployment of this branch, Ready at `11ca4ba`**:

```
https://hei-tuva-survey-git-claude-ved-c8059e-tor-lambrechts-s-projects.vercel.app
```

**One thing to check before you start, because I could not.** I do not know which Supabase project
that preview's env vars point at. If Preview inherits Production's — which is the default unless a
Supabase branch integration is configured — **everything you do below writes real rows to the live
database**, including a real invitation through Brevo at step 4. Check it in Vercel → the project →
Settings → Environment Variables → Preview before step 4, or accept that the rows are real.

**What production already contains**, measured just now, so you know what you will find:

| | |
|---|---|
| bank questions | **12**, all standard (`org_id null`), across 11 categories — 2 `choice`, 2 `yesno`, 7 `scale`, 2 `text` |
| drafts | 5 — four blank «Ny undersøkelse», one «Psykososial kartlegging» on the statutory pack |
| anonymity | **every draft is anonymous.** The only `named` survey is `aktiv`, so its Builder is locked |
| quiz surveys | **0** |
| keyed questions | **0** |

That shape is convenient: **both quiz guards are reachable from real data**, and nothing is
pre-arranged.

### A · The two guards refuse (§2's last item, done first because the data suits it)

1. Open any blank draft → **Bygg**. The right pane's rail should now read
   **Generelt · Legg til · Innstillinger · Vis** — four tabs. *(B2)*
2. **Generelt** → the Kjøremodus card, three cards: Standard, Live, **Quiz** — quiz **not** greyed,
   with no «ikke bygget» note under it.
3. Click **Quiz**. It should **refuse**, and a peach chip should appear under the cards reading:
   «Quiz krever navngitte svar for å kunne gi poeng, og kan ikke brukes på lovpålagte maler. Begge
   deler avvises av databasen, ikke bare av skjermen.»
   *That is `app.guard_quiz_policy` refusing an anonymous survey — the guard, not the screen.*
4. Open **«Psykososial kartlegging»** → Bygg → Generelt → Quiz. **Same refusal, different reason** —
   this one is the statutory-pack half. (It is also anonymous, so both halves apply at once; the
   copy names both.)

### B · Turn quiz on properly

5. Back on a blank draft: **Innstillinger** → «Hvem svarer og hva vises» → **Rediger** → set
   anonymity to **«Med navn»** → save.
6. **Generelt** → **Quiz**. It should now take, and a **«Quiz-innstillinger»** card should appear
   below with two working toggles (Tidsbonus, Lagtavle) and two marked «Ikke bygget».
7. Also on **Generelt**, below a hairline rule: **«Byggemodus»** with Enkel / Avansert, and a
   description under it that **changes when you switch** — «Enkel: bare spørsmålstekst og type…»
   versus «Avansert: hjelpetekst, påkrevd, flervalg…». *(B2. It used to sit above the tab rail.)*

### C · The picker overlay *(B3)*

8. **Legg til**. First: a peach note should now be there in quiz mode — «Quizmodus: flervalg med
   inntil fire alternativer vises som store fargefelt med figurer. Flere enn fire blir en vanlig
   liste.» *(B1)*
9. Below it, the type palette should be **two columns** with small 20px colour squares and no
   description line under each label. Hover one — the description is the tooltip now. *(B2)*
10. Click **«＋ Fra spørsmålsbanken»**. **It must not navigate.** A modal should open over the
    Builder, titled **«Spørsmålsbanken»**, subtitled **«Legges rett inn i Ny undersøkelse ·
    12 spørsmål»**.
11. The chip row should show **Alle · Egne · and eleven category chips** built from what is actually
    in the bank — Arbeidsmiljø, Kultur, Ledelse, Oppstart, Turnover, Tydelighet, Verktøy, Åpne,
    Arrangement, Engasjement, Goder. **This is the row I most want your eyes on: thirteen chips is
    a lot, and I have never seen it at any width.**
12. Type `trygg` in the search. One row should remain — «Føler du deg trygg på å si fra?», badge
    **Validert**, meta «Kultur · Ja / nei». The subtitle count should follow the filter.
13. Click **«Legg til»**. The footer note should change from «Ingen lagt til ennå» to «1 spørsmål
    lagt til». **Click it again** — «2 spørsmål lagt til». *(It was addable once before B3.)*
14. **«Ferdig»**. The question list behind should now contain the added question(s) **without a
    reload.** *That is the fix pass's defect: `revalidatePath` alone left them invisible.*
15. Press **Escape** with the overlay open, and click the dark scrim — both should close it.

### D · The key, marked *(B1 — the thing §2 could not photograph before)*

16. On the yes/no question you just added, in **Avansert** mode, a **«Riktig svar»** select and a
    **«Poeng»** field should be present. Leave the key unset for a moment.
17. **Vis**. In the phone preview:
    - a **yellow bar** at the top: «0 poeng · spørsmål 1 av N» on the left, «Tidsbonus» or «Ingen
      tidsgrense» on the right;
    - under the unkeyed question: **«Ingen fasit valgt»**. **Not** «Riktig svar: første
      alternativ» — that is D144, and it is the single most important thing to confirm;
    - under a scale question: **«Ikke poenggivende i quiz»**.
18. Go back, set **Riktig svar = Ja**, return to **Vis**. The «Ja» chip should now be **outlined and
    filled green with «✓ riktig» beside it**, and the line under should read
    **«Riktig svar: alternativ 1 · 100 poeng»**.

### E · Send and answer *(§2's middle — the step that writes)*

19. **Send** → pick a channel → send to yourself. *(Real invitation if the preview points at
    production.)*
20. Open the link. The choice question should render as **large two-column tiles with icons**, not a
    plain list. *(This was already built in V2-10; it is here so the chain is unbroken.)*
21. **The leaderboard I cannot promise you.** «Lagtavle» is k-gated: a team below the threshold is
    **absent**, not zeroed and not ranked. Proving that needs ≥ k real respondents on one team and
    a second team under it. On the demo seed it is provable; on production with one respondent you
    will see nothing, and **nothing is the correct output** — but it is indistinguishable from a
    broken screen. **Do not read step 21 as a pass or a fail.**

### F · Two small things elsewhere

22. **Narrow the window to phone width** on the Builder. In Avansert mode a **«Flere valg»** button
    should appear above the advanced panel, and tapping it should **actually collapse and expand
    it**. Before B0 it was permanently open and the button did nothing.
23. **Bibliotek → Spørsmålsbank**, with a draft in the org: click **«Legg til»** on a row. A
    **turquoise pill** should appear in the header reading **«Lagt til i <draft> ✓»** and
    **disappear after about two seconds**. The button should stay usable. *(B3 / Q108.)*

---

## 8. What I would not conclude

**That any of this looks right.** Every visual half of all four phases is **UNVERIFIED**, and the
reason has two independent halves: Docker is unavailable here, so there is no local stack and no
capture; and Chromium reaches local files but production resets its connection
(`net::ERR_CONNECTION_RESET` where `curl` gets 200) — and an authenticated Builder screen would
need a session this environment does not have anyway. **Everything above is source against bundle.
A property that matches in a class list can still render wrong**, and three of the four phases
moved geometry.

**The two-column type palette and the overlay's thirteen-chip row at 390px are the specific
worries.** The palette halves the available width for a 12.5px label; the chip row is now built
from eleven real categories rather than the seed's three. Both were reasoned against RESPONSIVE.md
and neither was seen. CI's `verify:responsive` is the gate that would catch them, and if it is
green that is real evidence — but a green responsive gate is not the same as the layout being
*good*, only that it does not overflow or lose a hit area.

**That the census numbers mean the suite is stronger by 43 tests.** They mean 43 assertions exist
and pass. Most of them read source rather than behaviour, which is the house style here and is the
right style for fidelity — but a source-reading test cannot tell you the modal opens.

**That 5a3 is 65 of 90.** I did not measure it. The claim is structural — no migration was added,
so the gate's inputs cannot have changed — and CI's `verify:policy` is what turns that into a
measurement.

**That D147 is the only thing of its kind.** It was found because B3's database step happened to
read `bank_cud_upd` beside the code that writes through it. The generalisation — *a writer that
RLS silently declines is invisible to the grep that looks for writers* — is exactly the shape that
does not stay a single instance, and nothing in the apparatus looks for it.

**That production is unaffected because I made no writes.** True of this run's four phases, and
not true of the session they sit in: the corrected help article was written to
`help_article_translations` on production earlier today. B0–B3 themselves touched nothing remote.

**That «Ingen fasit valgt» is the right words.** It is the right *behaviour* — D144 is about not
fabricating a key — but the phrase is `quizNoKey`, which V2-10 wrote for a different position on
the screen. Whether it reads correctly under a preview question rather than beside an editor
control is a judgement I cannot make from the source.
