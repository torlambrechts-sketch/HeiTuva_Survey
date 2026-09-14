# V6 — the plan

**Status: PLAN. Nothing here is built.** Measurement is `docs/v2/00-diff.md § 0.3e` (V6-0).
Bundle: `7c25573daee30103642ccf67781b44f4`, 10152 lines, 298 `sc-if` keys, +67/−34 against v5.

---

## 1. Settled by Tor, 2026-09-14 — these are decisions, not options

Staged here as **Q178–Q186**; they belong in `DECISIONS.md` at the start of V6-1, not before.

| Q | Decision |
|---|---|
| **Q178** | **LINT ADVISES, LINT DOES NOT BLOCK.** `goSendBlocked` is NOT built. The severity word «Blokkert» goes; every row is a warning. *«a tool that refuses to send what it just let you build, with no override, turns a methodological opinion into a technical bar.»* |
| **Q179** | **The four types stay first-class.** `matrix`, `slider`, `ranking`, `dropdown` remain shipped, sendable, unmarked in the registry. |
| **Q180** | **«Sensitivt spørsmål for tidlig» must exempt a locked policy, or be dropped.** A lint that warns against a lovpålagt template is a lint that is wrong — the question order in a statutory pack is part of what makes it statutory. |
| **Q181** | **No empirical figure ships.** Every rule states its claim without the number, or cites a source properly. «Matriser gir flere ubesvarte spørsmål på mobil» is defensible; «69 %» is not. |
| **Q182** | **«En påminnelse henter vanligvis inn 10–15 prosentpoeng» — cut the number.** It is a prediction about the customer's own data, which she discovers is wrong by acting on it. |
| **Q183** | **`options.tuva` is the fifth «who writes this column?» instance** and is recorded in CLAUDE.md as such. Any Tuva switch that ships must have a writer named in the phase that adds it. |
| **Q184** | **svTuva's participation numbers are permitted — Q28 already decided this.** The threshold hides svar-derived values, not counts of people. No new gate is required and none is added. |
| **Q185** | **«Jeg kan lage tiltak av funnene» is NOT BUILT as worded.** If Tuva proposes a task it fires on **Q72's trigger** — «this survey has a group that will never receive its own results», a group whose size is below `app.k_for(survey)` — and carries no group name, no question, no score. |
| **Q186** | **RESUME IS NOT PLANNED.** Partial answers persisted against a token is a second write path and a store of un-submitted answers, against invariant 2. `rlSkipShow`, `rlShowBar`, `rlShowTime`, `rlAnonOpen` are presentation over state we already hold and are in scope. |

**And one standing constraint that governs the whole tranche:** *deep links must resolve or not be
drawn.* `sdTab` and `buildTab` have nothing to bind to today, so a Tuva answer navigating there is a
promise the product cannot keep. Either the destination exists first, or that answer points somewhere
that does. This is why the ordering below is what it is.

---

## 2. The shape of the tranche

The eleven tabs are **not one piece of work**. Measured, they are three kinds:

- **Three re-parents** — Spørsmål, Utsending, Resultater already exist as routes.
- **Four narrowings** — Målgruppe, Kommentarer, Tiltak, Personvern exist as ORG-level screens and
  would become per-survey views.
- **Four new** — Oversikt, Metodikk, Feltarbeid, Historikk.

**The re-parenting is the phase. The four new ones are four separate decisions about whether they
should exist at all**, and only one of them (Metodikk) is decided.

### The blast radius, measured — this is why the re-parent is not a refactor

| route | app+lib refs | test refs | manifest entries |
|---|---|---|---|
| `/undersokelser/[id]/bygg` | 15 | 20 | 13 |
| `/undersokelser/[id]/send` | 7 | 2 | 6 |
| `/undersokelser/[id]/resultater` | 10 | 1 | 2 |
| `/undersokelser/[id]/live` | 4 | 3 | 1 |
| `/undersokelser/[id]/test` | 2 | 1 | 3 |

**38 app/lib references, 27 test references, 25 manifest entries.** Every one is a URL that exists
today, that a customer may have bookmarked, and that the visual manifest photographs.

---

## 3. Phases

### V6-1 — install the bundle (no product code)
The seven-step checklist in CLAUDE.md, nothing else. Steps 1–6 mechanical; **step 7 is the
claim-set sweep and it is where Q181 and Q182 are executed** — the empirical figures are a bundle
claim set and the sweep is what catches them. `since: 'v6'` in `BUNDLES`; check whether an `until`
is needed, which for v6 means the two commands the checklist names, because **v6 removes 34 keys**
and 28 of them are states the manifest may set.
Exit: 35+ screens captured, 0 failures, the rendered directory committed and `git status artifacts/`
clean.

### V6-2 — the re-parent, and it is a URL decision before it is a screen
`/undersokelser/[id]` stops redirecting and becomes the detail screen with a tab rail.

**The open question this phase must answer FIRST** (it is not mine to settle): do
`/bygg`, `/send`, `/resultater` **stay as URLs** and the tabs link to them, or do they **become
`?fane=` on the parent** and the old paths redirect? The second is what the bundle draws. The first
keeps 38 references and every bookmark valid.
My recommendation: **keep the paths, make the tab rail navigate between them.** It gets the bundle's
screen without a migration, and `lib/library/tabs.ts` (Q172) is the working precedent for a tab
registry read by both the rail and the page.

Also in this phase: the survey-list row becomes a selector plus the `svDetail.*` side panel, which is
where v5's nine-action row menu went. **Nothing from that menu may be lost** — the measurement showing
it was re-parented rather than deleted is in § 0.3e, and the phase's test asserts every one of the
thirteen actions is still reachable.

### V6-3 — Metodikk, as an advisory panel (Q178–Q182)
The only new tab that is decided. Eleven rules, all warnings, no publish gate.

- Severities become two, not three: a warning and a suggestion. «Blokkert» does not exist.
- `rank` → `ranking`. **And the finding is logged, not just the fix:** the rule as drawn tests a type
  name the product has never used, so it would have fired on nothing. A rule written against an
  unchecked identifier is a rule that silently does nothing — the enumeration shape, in a lint.
- The sensitive-position rule reads `surveys.policy_locked` and exempts a locked pack (Q180).
- Every message states the property without the figure (Q181).
- **Where it lives is a real question:** the bundle draws lint TWICE — `tabLintB`/`bLint.empty` in
  the Builder (v6:1049) and `sd.tabLint` on the detail screen (v6:1413). One implementation, two
  mount points, or one place? I would build the Builder's first: that is where a question is written,
  and advice arrives cheapest next to the thing it is about.
- Rules are **data, not code** (CLAUDE.md data-not-code). `quality_rules` is the wrong table — it is
  keyed on text patterns — so this is a new registry, and the migration that adds it answers
  «who writes this?» in the same breath.

### V6-4 — the four narrowings
Målgruppe, Kommentarer, Tiltak, Personvern as per-survey views of screens that already exist.
Lower risk than V6-2 and independent of it. Each is a filtered read, not a new capability —
**and each must be checked for the opposite error**: an org-level screen narrowed to one survey can
expose a per-survey number that the org-level view aggregated away.

### V6-5 — Tuva, the global helper (tv*)
Blocked on V6-2 and V6-3, by Q-constraint rather than by preference: `tvAnswerHasAction` navigates to
`sdTab:"feltarbeid"`, `sdTab:"metodikk"` and `buildTab:"lint"`, and **none of those destinations
exists today**. Build the helper only when its answers can land.
Q183 applies: if a «turn Tuva off» control ships, the phase that ships it adds the writer and a test
that asserts the writer exists.

### V6-6 — svTuva, the analyst
Participation only (Q184). The third tip is Q72's trigger or it is not built (Q185).
The numbers come from `survey_response_counts` + `target`, which is what the Undersøkelser list
already renders, so this phase adds **no new data path** — and a test should assert exactly that,
because the cheapest way for this feature to go wrong is to reach for a richer aggregate later.

### Not planned
- **Resume** (Q186).
- **`goSendBlocked`** (Q178).
- **Oversikt, Feltarbeid, Historikk** — see below.

---

## 4. What I need from you before V6-2 can start

Three of the four new tabs are undecided, and they are genuinely your call because each is a
question about whether the product should grow a surface, not about how to build one.

1. **Oversikt** — a KPI strip (`sd.kpis`, 4 tiles) and a status mix bar over one survey. Every
   number in it exists today, scattered across three screens. Is this a summary worth a tab, or is
   the tab rail itself already the summary?
2. **Feltarbeid** — «hvem mangler, og når bør du purre». This is the one I would look hardest at:
   it is a screen about **who has not answered**, and while Q28 permits counts of people, a screen
   organised around the non-responders of a small group is the shape that makes a count feel like a
   name. It may be fine. It should be decided deliberately.
3. **Historikk** — `survey_rounds` exist and carry frozen question sets; there is no screen. Cheap
   to build, and the only one of the three with a clear existing data story.

And one ordering question: **V6-2's URL decision** (§ V6-2). I have a recommendation; the 38
references make it yours to confirm.
