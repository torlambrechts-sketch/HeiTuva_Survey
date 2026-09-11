# 05 — Decisions the Builder measurement raises

Numbered onward from the current head (`DECISIONS.md` ends at **Q102**). Each is answerable in
one line. Nothing in `docs/review/04-builder-plan.md` is built until the ones it names are
answered; the plan says per phase which those are.

Two are already decided and are recorded here rather than re-asked.

---

### Q103 — Does the claim-set sweep gain `help_article_translations` as a surface? **CONFIRMED (Tor, 2026-09-10): yes — a surface, not a gate.**

`verify:copy` (`scripts/verify/threshold-copy.ts`) reads `messages/no.json` and `messages/en.json`
and nothing else, so **help-article prose is shipped copy that no gate reads.** The instance is
«Fem er standard» in the threshold article's lead: it shipped with V2-6, sat in production from
then until 2026-09-10, states a fixed number for a threshold that is settable 3–10 (`M:0034`),
and tripped nothing — because the string lives in `help_article_translations`, seeded from the
bundle, not in a messages file. The apparatus stays frozen: this is a **limitation** and the
human claim-set sweep gains a surface, checked the same way `messages/*.json` is, every time it
runs. Logged as **D142**.

---

### Q104 — The reference baselines are non-deterministic. Freeze `uid()` at capture, exclude the six screens, or accept the noise?

Measured 2026-09-10, three clean renders of one bundle: `live` 551 px, `live-revealed` 726 px,
`send` 1262 px, `rapport-editor` 27865 px, `rapport-editor-filter` 3801 px, `rapport-editor-del`
71699 px differ **from themselves**; `admin-personvern` and `hjelp` are 0 px. Cause, read off the
cropped rows: **`uid()` at V2:4133** — `"q" + Math.random().toString(36).slice(2,8)` — renders a
different share link (`…/s/q2rrzlu` vs `…/s/qpagbqf`) and join code (`heituva.no/qwala`).
`rapport-editor`'s remaining jitter is in the team bars and its cause is **not established**; the
date line above it is byte-identical between renders, which rules the clock out.

**A visual baseline with non-deterministic content is not a baseline** — it is noise the next
comparer reads as drift, and it hid a real change once already this session (three
`rapport-editor` baselines were dropped as churn when lines 4660/4666 had in fact moved).
Options: (a) seed `Math.random` in the capture harness before load, (b) exclude the six from the
committed set and say so in VERIFY.md, (c) accept and annotate. Editing the bundle is not an
option. **Recommend (a)** — it is one line in `scripts/verify/reference.ts`'s page init, it
leaves every screen in the set, and it makes `rapport-editor` decidable as a side effect.

---

### Q105 — Do bundle citations gain a bundle prefix, and are the twenty-eight backfilled?

`grep -rn "HeiTuva\.dc\.html:[0-9]"` under `bygg/` and `bibliotek/` returns 28 comments citing a
filename that exists in three bundles with different line numbering. All of them are v1's numbers.
Worked case: `QuestionCard.tsx:106` cites `:387` for `flex:1 1 220px` — true in v1, and in v2 that
line is a header `div` while the control is at `:412`. V2-10 already writes `V2:3399-3408` and
resolves correctly. **Recommend: adopt `V1:` / `V2:` / `L:` (legacy), backfill in the phase that
touches each file rather than in one sweep**, so the change rides with work that re-reads the
citation anyway.

---

### Q106 — Is the question-bank picker overlay built, or is the current `<Link>` an accepted deviation?

The overlay (`V2:650-693`) does not exist in the app in any form —
`pickerOpen`/`pickQuery`/`pickerRows`/`pickAddedNote`/«Legges rett inn» return no files.
`Builder.tsx:290` renders the bundle's own label and colour as a `<Link href="/bibliotek?fane=bank">`,
which leaves the Builder; the destination then has to rediscover which draft was meant
(`bibliotek/page.tsx:520`). The overlay's whole claim is that you do not leave.
**Recommend: build it** — it is a drawing that exists, the insert action already exists
(`bibliotek/actions.ts` `addBankQuestion`), and §3's constraint distinguishes exactly this case
from inventing a screen.

---

### Q107 — Does the right pane get the bundle's fourth tab, or is the three-tab merge a deviation?

Bundle `V2:6472`: `[["general","Generelt"],["add","Legg til"],["settings","Innstillinger"],["preview","Vis"]]`.
App `Builder.tsx:36`: `['add','settings','preview']`, with `settings` carrying `RunModePanel`,
`QuizPanel`, `PolicyPanel` and `EngagementPanel` stacked. **Recommend: split** — `Generelt`
holds Kjøremodus, Byggemodus and the mode-gated Live/Quiz blocks exactly as drawn, and it is the
tab §2's «set `run_mode = quiz` through the UI as a user» actually lands on.

---

### Q108 — Bank confirmation: header pill with the draft's name and a 2200 ms clear, or the current permanent in-button state?

Bundle: a separate `--ac2` pill in the header, «Lagt til i {title} ✓», cleared by `setTimeout(…, 2200)`
(`V2:4431-4432`). App: «Lagt til ✓» inside the button (`BankRow.tsx:75-87`), never reset, button
permanently disabled — so a question cannot be added twice and three additions leave three spent
buttons and a silent header. **Recommend the bundle's shape**, which also removes the
add-once-only restriction that nothing in the schema asks for.

---

### Q109 — The preview's correct-answer green is outside the token set. Tokenise it, or use the bundle's literals?

`V2:6511` marks the key with `bg #E4F2E0`, `border #2F5D2A`, `fg #2F5D2A`. None of the three is a
theme token, and CLAUDE.md's token list has no success colour at all. The quiz tiles already
solved an adjacent case with `--qz1…--qz4` plus a second, non-colour channel (a shape), and
`tests/unit/quiz-tiles.test.ts` recomputes every contrast ratio. **Recommend: add `--ok` / `--okbg`
as tokens with the bundle's values, and carry a contrast assertion in the same phase**, so a
correct-answer mark is not colour-only.

---

### Q110 — Where does §2's quiz proof actually run?

Docker is unavailable here (`docker info` fails at the daemon), so there is no local stack, no
seed run and no e2e. Chromium renders local files but production resets its connection
(`net::ERR_CONNECTION_RESET` where `curl` gets 200), and an authenticated Builder screen needs a
session this environment does not have. The remaining routes are: (a) CI, which already produces
`captures.zip` and is the only place a screen has been seen from here; (b) a Supabase branch plus
a Vercel preview, which costs money and needs `confirm_cost`; (c) production, which means real
rows and a real Brevo send. **This is yours to pick — (a) is free and already proven to work, and
is what the plan assumes until told otherwise.**
