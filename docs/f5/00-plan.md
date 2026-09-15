# F5 — the second navigation level. PLAN ONLY.

Against **v6** (`design-reference-v6/…/HeiTuva.dc.html`). Bundle citations are `v6:<line>`;
app citations are `file:line`. Nothing here is built.

Every number below carries the command that re-derives it, per CLAUDE.md.

---

## 0. The commands

```
# the 27 sub-tabs
sed -n '7139,7145p' design-reference-v6/heituva-survey-app-design/project/HeiTuva.dc.html \
  | grep -o '\["[a-z]*","[^"]*"\]' | wc -l                     # -> 27

# the bundle's own mechanism split: which sub-tabs are a FILTER
grep -n 'Filtered:' design-reference-v6/…/HeiTuva.dc.html        # -> 4 derivations
grep -n 'sdSub' design-reference-v6/…/HeiTuva.dc.html            # -> the panel gates

# what a question actually has
psql "$LOCAL_DB_URL" -Atc "select column_name from information_schema.columns
                           where table_name='survey_questions'"  # -> no theme
```

---

## 1. THE SPLIT IS 12 / 15, AND THE TWELFTH IS THE ONE THAT MUST BE REFUSED

The bundle divides its own 27 by mechanism. Twelve are handled by one of four `*Filtered`
derivations — a filter over a list the tab already renders:

| derivation | tab | sub-tabs |
|---|---|---|
| `qFiltered` (v6:7252) | sporsmal | Alle spørsmål · Skala · Fritekst |
| `groupsFiltered` (v6:7256) | malgruppe | Grupper · Segmenter · **Levering** |
| `commentsFiltered` (v6:7266) | kommentarer | Alle · Venter svar · Besvart |
| `tasksFiltered` (v6:7268) | tiltak | Åpne · Alle · Med hjemmel |

The other fifteen have a gate of their own and draw a distinct panel: `over` 2,
`resultat` 6 (`resMatrise`…`resFrisvar`, v6:7188-7195), `utsending` 7 (`sendInvitasjon`…
`sendOppsett`, v6:7152-7158).

**`malgruppe/Levering` is in BOTH.** `groupsFiltered` returns every group unchanged for it
(`if (s2 === "levering") return groups`) AND `audLevering` (v6:7187) draws a funnel above the
table. So the one row where the two classifications disagree is the row § 3 refuses — the
cheapest-looking sub-tab in the set is the one carrying the invented numbers.

**Two of the 27 are not F5 work at all.** `over`'s Sammendrag and Innhold are sub-tabs of a tab
that is decided-NOT-NOW (`lib/surveys/tabs.ts`: «a tab that gathers figures from three other
tabs is a fourth copy of them, and copies drift»). A sub-tab of a tab that will not exist is
not unbuilt work. **25 live.**

---

## 2. THE URL QUESTION

### 2.1 What V6-2 settled, and what it did not

`lib/surveys/tabs.ts:14-22` carries the ruling verbatim: **keep the paths.** «A survey has
three phases with distinct state, and a URL saying which one you are in is a property, not an
implementation choice. `?fane=` trades a truth for a parameter and turns five routes into one
page with a variable.»

That ruling is about **three phases with distinct state** — Bygg, Send, Resultater are
different activities, over different tables, with different write permissions.

**A sub-tab is not a phase.** `resultat/fordeling` and `resultat/frisvar` are two renderings of
one RPC call. `kommentarer/venter` is `kommentarer/alle` with a predicate. Nothing about the
data, the permissions or the activity changes across a sub-tab; only the presentation does.

### 2.2 The app already has a three-level rule, and F4 just used all three

| level | mechanism | example, shipped |
|---|---|---|
| a different activity | **path segment** | `/bygg`, `/send`, `/resultater` (V6-2) |
| a different view of the same activity | **query parameter** | `?filter=`, `?omfang=`, `?sok=`, `?valgt=` (F4), `?fane=` (Bibliotek, Q172) |
| a per-person preference that must survive a reload | **cookie** | `heituva.svview`, `heituva.svtuva` (F4, Q197/Q198) |

A sub-tab sits squarely in the middle row. Putting it in the top row would say a filtered
question list is a different activity from the unfiltered one, which is not true.

### 2.3 What each of the 25 costs

| | paths kept (a second segment) | query parameter |
|---|---|---|
| new route files | 21 buildable sub-tabs → 21 `page.tsx`, or 6 catch-all segments with their own 404 semantics | **0** |
| existing deep links | unaffected either way — the tab paths do not move | unaffected |
| back button / shareable | yes | yes |
| what the URL asserts | «Skala is a screen» — false | «this is the question list, filtered» — true |
| a refused sub-tab | must still resolve or 404, so a refusal needs a route to say so on | the parameter is simply not offered |
| per-tab memory (`sdSub` is a MAP, v6:7196) | lost on tab change | lost on tab change |
| cost of adding the 26th | a directory | a registry row |

### 2.4 Recommendation

**Query parameter, one per tab, Norwegian, consistent with the four F4 shipped.**
`/undersokelser/[id]/resultater?vis=matrise`.

One registry (`lib/surveys/subtabs.ts`) keyed by `SurveyTab`, read by both the in-page rail and
the page — the shape `lib/library/tabs.ts` and `lib/surveys/tabs.ts` already use, so a sub-tab
that is refused is **absent from the registry** rather than a route that 404s.

The rail goes **in-page**, where v6 draws it (v6:1243-1252, the bottom of the detail head), not
in `AppSubnav`. That keeps the standing rule — «a shell rail may absorb an in-page one only when
its list is COMPLETE» — untouched: the shell carries the tab rail, the page carries the sub-rail,
and neither duplicates the other.

**This extends V6-2 rather than overturning it**: path for the activity, parameter for the view.

---

## 3. WHICH OF THE FIFTEEN SHOULD EXIST AT ALL

### 3.1 Two refusals, and they are the same fabrication twice

**`malgruppe/Levering` — REFUSE.** The funnel is six rows (v6:7260-7265) and **four are
invented**:

| row | the drawing | us |
|---|---|---|
| Sendt | `inv` | real — invitation count |
| **Åpnet** | `Math.round(inv * 0.82)` | **no open tracking exists.** D133: this Brevo account has no Transactional → Webhooks section at all |
| **Startet** | `Math.round(res * 1.15)` | **no partial submissions exist.** `rpc.submit_response` is a single transaction; a response is complete or absent |
| Fullført | `res` | real |
| **Bounce** | the string `"2"` | **`survey_invitations.bounced_at` has no writer** (D133) |
| **Reservert** | the string `"1"` | real — `suppressions` (V2-3b) |

An 82 % open rate is the worked example of CLAUDE.md's never-fabricate rule: indistinguishable
from a real number in review, and it survives into screenshots as though it were true.

**`utsending/Leveranse` — REFUSE, and the audit misread what it is.**
`docs/fidelity/01-per-screen.md § D.6` calls it «leveringsstatistikk». It is not. `sd.delivery2`
(v6:7135-7137) is six hard-coded rows of **domain authentication**: SPF · DKIM · DMARC ·
Innboksplassering · Avvisninger · Klager, plus a paragraph about `p=quarantine`.

The conclusion is unchanged and the reason is different, which matters: three of those rows are
facts about **our sending domain**, not about this survey — they do not vary per survey, per
round or per organisation, so even with the data they would not belong on a survey's send tab.
If domain authentication is ever a product surface it is an Administrasjon or Integrasjoner
surface. **Refused here on the grounds that it is not a property of a survey**, and separately
unbuildable because nothing measures inbox placement or complaints.

Both refusals get written **on the screen**, in the pattern Live and Målgruppe already use — the
sub-tab is absent from the registry and the tab says why in one sentence. A refusal that is
merely omitted reads as a sub-tab somebody did not finish.

### 3.2 One deferral, because it is a feature and not a fidelity gap

**`utsending/Bølger`** draws four waves at day 0 → +3 → +7 → +12, each to those who have not
answered. We have **one** reminder: `schedules.reminder_after_days` is a single integer and
`survey_invitations.reminded_at` is a single timestamp — so a wave model is a schema change plus
a worker change plus a scheduling UI.

That is a product decision about how hard to chase non-responders, which is adjacent to the
reasoning that refused Feltarbeid. **Not F5. Logged as a question, not carried as unbuilt work.**

### 3.3 One partial build, stated as a boundary

**`utsending/Invitasjon`.** Half of it is real and the honest half is the useful half.

| field | source |
|---|---|
| Emne + lengde | `invitationMessage()` (`lib/mail/copy.ts:39`) — render the **actual** subject the worker sends, not a stored copy |
| the body | same function — this is the first surface in the product that shows a sender what the recipient receives |
| anonymitetslinjen | real: it is a branch of that same function on `surveys.anonymity` |
| tid | real: the round's send time |
| Avsender | an env-level Brevo sender, not a per-survey value — render it or omit it, but do not imply it is editable here |
| **Formål** | nothing stores it |
| **spørsmål 1 lagt i e-posten** + «Derfor ligger spørsmålet i e-posten» | **our invitation embeds no question.** `lib/mail/copy.ts:44-72` is greeting, one sentence, the URL, the promise, the question route, the do-not-forward line. The card would explain a rule for a feature that does not exist |

So: build the preview, refuse the embedded question and its rule card, and say so on the screen.
**`surveys` has no subject, sender, purpose or body column** — verified against
`information_schema` — and F5 must not add one: the template is code and the preview should
render the code, or the two drift and the preview becomes a lie the moment the template changes.

### 3.4 The six that need NO new data path — which reverses the audit's cost estimate

`docs/fidelity/02-summary.md § 2.5` calls the sub-tabs «den dyreste klassen å rette … fordi hver
underfane er en egen datavei». Measured, **that is wrong for `resultat`, which is the tab it was
most worried about.**

| sub-tab | what it needs | exists? |
|---|---|---|
| **Matrise** | a group × **theme** matrix | **the theme axis does not exist.** `survey_questions` has no theme column; the drawing assigns `THEMES[i % THEMES.length]` (v6:6959) from a six-item array (v6:6917). `theme_rules` is the FREE-TEXT classifier — `(key, lang, label, pattern, ord)` — not a question taxonomy. **But `get_heatmap(p_org, p_surveys[], p_group, p_rounds[])` is group × QUESTION, gated cell by cell**, and takes a survey array. Build it on the axis we have; refuse the theme axis by name |
| Per spørsmål | `aggregate_results` → `questions[]` with `n`, `avg`, `distribution`, `insufficient_data` | **exists**, already rendered by `ResultsScreen` |
| Sammenligning | round vs round with a change column | **`get_trends(p_survey, p_group)` exists** |
| Runder | rounds | exists, in `ResultsScreen` |
| Fordeling | `distribution` | exists, in `ResultsScreen` |
| Frisvar | `get_quotes` | exists |

**Not one of the six needs a new RPC.** Four are a re-cut of an 874-line screen that already
contains them; two run on RPCs that exist and are called elsewhere. The expensive-looking tab is
the cheap one, and the cheap-looking one (`malgruppe`) is where the fabrication is.

The one real cost in `resultat` is **overlap with Dashboard**, which `§ D.4` already flags: a
group × question matrix for one survey and the org-level heatmap are the same picture at two
scopes. That is a product question — *is the survey-scoped matrix worth a second entry point* —
and it should be answered before Matrise is built, not after.

---

## 4. THE READ-VIEW / EDIT-VIEW SPLIT

### 4.1 The bundle proves it twice, not once

`v6:1377` puts **«Åpne byggeren»** beside the question table. `v6:1845` puts **«Åpne utsending»**
beside the invitation, and `v6:1954` puts it a second time on the same tab — `sd.onSend` twice,
which is F3's «two «Ny rapport» buttons» shape and not a defect. Two tabs, two escape hatches, the same shape: a read view of a thing, with
a button to the screen that edits it. A screen does not link to itself.

Today `TAB_SEGMENT.sporsmal = 'bygg'` and `TAB_SEGMENT.utsending = 'send'` — both pills go
straight to the editor.

### 4.2 What dies with the fold — the columns that only make sense in a read view

The question table is seven columns (v6:1382-1388): `#` · Spørsmål · Type · Krav · **Tema** ·
**Besvart** · **Snitt**.

The first four are editor fields; the Builder shows them. The last three are the reason the
split is worth doing, and they are three different verdicts:

- **Tema — MUST NOT BE BUILT.** `THEMES[i % THEMES.length]`. There is no per-question theme in
  the schema and no rule that could derive one. It is a fabricated column, and it is the column
  that would look most like real data.
- **Besvart — exists and is gated.** `aggregate_results(...).questions[].n`, with
  `insufficient_data` below k, plus the bar and percentage.
- **Snitt — exists and is gated.** `.avg`, computed only for `scale`/`enps`/`slider`; everything
  else is the em dash, which the drawing also renders.

**So the split's justification is precise: two response-derived columns per question that the
Builder structurally cannot show.** The Builder is an editor over `survey_questions`; giving it
`n` and `avg` would mean the edit screen calls the gated results path. Keeping them on a read
view is the same discipline as `PageHeader` having no `pct` prop — the wrong thing is not
expressible rather than merely not done.

### 4.3 And one measured argument nobody has made yet

`app/(app)/undersokelser/[id]/bygg/page.tsx:208` renders the Builder with
`canEdit={viewer.role !== 'leser'}`. So a **leser** clicking «Spørsmål» today lands in the
question EDITOR with its controls disabled — an edit screen with everything greyed out, when what
that role wants is exactly the read view. The split is not only fidelity; it is the right screen
for a role that currently gets the wrong one.

### 4.4 Recommendation

Build the read view at the tab's own path — `/undersokelser/[id]/sporsmal` — and leave `/bygg`
untouched as the editor, with «Åpne byggeren» between them. That is V6-2's rule applied correctly:
reading a question list and editing it **are** two activities, so they get two paths; filtering
that list is one activity, so it gets a parameter.

`utsending` is the same shape but is NOT recommended for F5: with Leveranse refused, Bølger
deferred and Invitasjon half-buildable, four of its seven sub-tabs are already on `/send`. A read
view there would be a new screen wrapping four panels that already exist plus one new preview.
**Build the invitation preview into `/send` instead**, and revisit the read view if `utsending`
ever earns a second buildable sub-tab.

---

## 5. SEQUENCE

Each step is a phase with one verification pass and one fix pass.

**F5-0 — the registry and the rail.** `lib/surveys/subtabs.ts`, the in-page rail, the parameter,
and the refusal sentences. No sub-tab content. Exit: the rail renders on the tabs that have one,
a refused sub-tab is absent rather than empty, and a test asserts the registry and the rail agree
in both directions (the F3 lesson: state it as «these have a rail and those must not»).

**F5-1 — the twelve filters, minus Levering.** `kommentarer` 3, `tiltak` 3, `malgruppe` 2. Nine
sub-tabs, all predicates over lists three screens already read. Cheapest, lowest risk, and it
proves the mechanism before anything expensive uses it.

**F5-2 — the question read view.** `/undersokelser/[id]/sporsmal` with `#`/Spørsmål/Type/Krav +
`n` and `avg` from `aggregate_results`, «Åpne byggeren», and the three `qFiltered` sub-tabs. Tema
refused on the screen. Re-point `TAB_SEGMENT.sporsmal`. Includes the leser case as a test.

**F5-3 — `resultat`'s six.** Four re-cuts of `ResultsScreen` behind the parameter, plus
Sammenligning on `get_trends`. **Matrise is the open question of § 3.4 and is held out** until the
Dashboard-overlap question is answered.

**F5-4 — the invitation preview**, built into `/send`, rendering `invitationMessage()`'s real
output, with the embedded-question card refused in writing.

**Not in F5, each with its reason on the screen or in DECISIONS:** `over`'s two (tab is NOT NOW),
`malgruppe/Levering` (four invented rows), `utsending/Leveranse` (not a survey property, and
unmeasured), `utsending/Bølger` (a feature), `sporsmal`'s Tema column (no data), the `utsending`
read view (four of seven already on `/send`).

---

## 6. WHAT I NEED SETTLED BEFORE F5-0

1. **The parameter, § 2.4** — confirm or overrule. Everything else is downstream of it.
2. **Matrise, § 3.4** — a survey-scoped group × question matrix beside the org-level heatmap:
   second entry point or duplicate? If duplicate, `resultat` is five sub-tabs and F5-3 shrinks.
3. **Bølger, § 3.2** — refuse permanently, or log as a product question for a later phase? It is
   the only one of the fifteen whose refusal is about scope rather than about truth.
