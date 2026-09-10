# 07 — Builder and question bank, measured against the corrected v2

**Measured 2026-09-10, against `design-reference-v2/…/HeiTuva.dc.html` at `md5 3f8de86d…`**
(the corrected bundle installed in this session; see `docs/v2/00-diff.md § 0.3`).

This is the fidelity check §1 asked for, and it is the **first one the Builder has had against
v2**. V2-0 covered the frame, header and nav only. Everything below the frame was last
pixel-checked against **v1**, which is why several citations in the source point at v1 line
numbers — see § 0.

## 0. THE VISUAL HALF IS UNVERIFIED, AND THE REASON IS NOT THE ONE I EXPECTED

Everything in this document is **read from source and from the bundle**. Nothing here is a
screen I looked at. Filed as UNVERIFIED per the standing instruction, with the reason stated
so it is not mistaken for laziness:

| What | State | Measured how |
|---|---|---|
| Local Supabase | **unavailable** — `docker info` fails at the daemon | no local stack, no seed, no e2e, no captures |
| Chromium on **local files** | **works** | `npm run verify:reference` captured 34/34 this session |
| Chromium on **production** | **blocked** | `page.goto('https://www.heituva.com/')` → `net::ERR_CONNECTION_RESET` |
| `curl` on production | **works** | `HTTP 200`; Supabase REST answers `401` (i.e. reachable) |

**The interesting half is the third row against the fourth.** The proxy passes `curl` and
resets Chromium, so this is not "the network is down" — it is one client being refused. And
even if it were not, **an authenticated Builder screen needs a session I do not have**, so
production could not answer a Builder fidelity question anyway. The honest statement of the
limit is: *the bundle can be rendered here, our app cannot be, in either environment, for two
different reasons.*

**A CITATION THAT NAMES A FILE EXISTING THREE TIMES IS NOT A CITATION.** Twenty-eight comments
under `bygg/` and `bibliotek/` cite `HeiTuva.dc.html:NNN` with **no bundle named**. Three
bundles carry that filename with different line numbering, and the numbers in the Builder are
v1's. Worked example, because it is the one §1 asked about:

- `QuestionCard.tsx:106` — «`flex: 1 1 220px`, not `flex-1` (HeiTuva.dc.html:387)»
- **v1:387** *is* that input, and *does* carry `flex:1 1 220px`. The citation is correct.
- **v2:387** is `<div style="display:flex;align-items:center;justify-content:space-between;…">`
  in the meta header. The same control is at **v2:412**, and still says `flex:1 1 220px`.

So the property holds and the code is right; the pointer sends a v2 reader to the wrong line.
V2-10's citations (`QuestionInput.tsx:40`, `V2:3399-3408`) already use the `V2:` prefix and
resolve correctly — the convention exists, it just post-dates the Builder.

---

## 1(a) Question list and cards — bundle **V2:411-547**

**`flex:1 1 220px` — CONFIRMED, still both sides.** `QuestionCard.tsx:113` renders
`flex-[1_1_220px]`; **V2:412** draws `flex:1 1 220px`. The revision did not touch it.

Property-by-property, everything that matches (stated so the diffs below are legible as the
exception, not the rule):

| Element | Bundle (v2) | App | |
|---|---|---|---|
| number badge | `26×26`, `radius 8`, `--sf2`, `12px/700` | `QuestionCard.tsx:96` `h-[26px] w-[26px] rounded-lg text-xs font-bold` | ✓ |
| text input | `flex:1 1 220px`, `9px 11px`, `radius 10`, `--bg`, `14px/500` | `:113` `flex-[1_1_220px] px-[11px] py-[9px] rounded-[10px] bg-bg text-sm font-medium` | ✓ |
| type select | `9px 11px`, `radius 10`, `13px` | `:126` `px-[11px] py-[9px] rounded-[10px] text-[13px]` | ✓ |
| ↑ ↓ ⧉ | `30×32`, `radius 9`, `12px` | `:27` `h-8 w-[30px] rounded-[9px] text-xs` | ✓ |
| × delete | `32×32`, `radius 10`, `15px` | `:185` `h-8 w-8 rounded-[10px] text-[15px]` | ✓ |
| quality-flag chip | `5px 10px`, `radius 999`, `--ac3`, `12px` | `:258` `px-[10px] py-[5px] rounded-full bg-ac3 text-xs` | ✓ |
| anonymity-breach warning | `mt 9`, `8px 12px`, `radius 10`, `--ac3`, `12.5px` | `:266` `mt-[9px] px-3 py-2 rounded-[10px] bg-ac3 text-[12.5px]` | ✓ (app adds `role="alert"`, which the bundle has no way to express) |
| advanced panel | `12px 14px`, `radius 12`, `--sf2`, `gap 10` | `:280` `px-[14px] py-3 rounded-xl gap-[10px]` | ✓ |
| 13 types / 4 optgroups | scale·likert·smiley·enps·slider │ choice·dropdown·image·yesno·ranking │ matrix │ text·field | `types.ts` `TYPE_OPTION_KEY` — same 13, same 4 groups | ✓ |

### The two diffs

**D-A · `md:open` is not a class, and the mobile disclosure never closes.**
`QuestionCard.tsx:276`:

```tsx
<details className="mt-[11px] md:open" open>
```

`open` is a Tailwind **variant** (`open:bg-x`), never a utility, so `md:open` matches nothing —
`grep -rn "md:open"` returns this one site and the compiled CSS contains no `.md\:open`. The
`open` attribute beside it is unconditional. The comment three lines above says the disclosure
is «closed by default» below `md`; it is open at every width. The summary is `md:hidden`, so
below `md` the user gets a tappable "Flere valg" summary that does nothing, above an already
expanded panel. **A dead class and a false comment in the same element.**

**D-B · the word-scale grid is two columns below `md`, and that is deliberate.**
Bundle `V2:465` `grid-template-columns:repeat(5,1fr)`; app `:236` `grid-cols-2 … md:grid-cols-5`.
Five 12px inputs do not fit at 390px. This is RESPONSIVE.md § Data tables applied, not drift —
recorded here so a later pass does not "fix" it back.

---

## 1(b) Right pane — bundle **V2:559-…**

**THE BUNDLE HAS FOUR TABS. THE APP HAS THREE.**

```
V2:6472  buildTabs: [["general","Generelt"],["add","Legg til"],
                     ["settings","Innstillinger"],["preview","Vis"]]
Builder.tsx:36  const TABS = ['add', 'settings', 'preview'] as const
```

`Generelt` is the bundle's own tab and holds **Kjøremodus**, **Byggemodus**, and — gated on the
mode — the Live and Quiz settings blocks (`V2:564-645`). The app has no `general` tab; `settings`
carries `RunModePanel` + `QuizPanel` + `PolicyPanel` + `EngagementPanel` stacked
(`Builder.tsx:338, 362, 386, 440`). So the app's «Innstillinger» is four panels where the
bundle's is two, and the bundle's first tab has no counterpart.

`insertNote` matches: `builder.insertNote` = «Settes inn nederst i undersøkelsen», bundle
`{{ insertNote }}` at `V2:648`. `modeNote` matches as a chip; note that this session's quiz
work already changed it from `{note ?? s.quizNote}` to `{note ? … : null}`, which is what the
bundle does (`sc-if value="{{ modeNote }}"`).

**Type groups — one column where the bundle draws two.**

| | Bundle `V2:694-702` | App `Builder.tsx:296-320` |
|---|---|---|
| layout | `display:grid; grid-template-columns:1fr 1fr` | `flex flex-col gap-[7px]` — **single column** |
| tint square | `20×20`, `radius 6` | `h-[26px] w-[26px] rounded-lg` — **26px, radius 8** |
| label | `12.5px/600`, `line-height:1.25` | `text-[13.5px] font-semibold` |
| padding | `10px 11px`, `radius 10` | `px-[13px] py-[11px] rounded-[11px]` |

Every one of those four is a v1 property that v2 moved. The app is faithful to v1 and stale
against v2.

---

## 1(c) THE PICKER OVERLAY — **IT DOES NOT EXIST IN THE APP.** Plainly.

§1 asked me to establish this and say so plainly. Established:

```
grep -rl 'pickerOpen|pickQuery|pickerRows|pickAddedNote|Legges rett inn' app/ lib/ components/
  → no files
```

The **control** exists and the **destination** exists; the overlay between them does not.
`Builder.tsx:290-296` renders `＋ Fra spørsmålsbanken` — the bundle's own label, byte for byte
(`builder.fromBank` = «＋ Fra spørsmålsbanken») and its own colour (`bg-ac3`) — as a
**`<Link href="/bibliotek?fane=bank">`**. It navigates away from the Builder.

The bundle draws a modal (`V2:650-693`) that never leaves it:

| Part | Bundle property |
|---|---|
| scrim | `position:fixed; inset:0; z-index:60; rgba(25,21,16,.42)`; `padding:28px` |
| panel | `max-width:660px`, `max-height:82vh`, `radius 20`, `--sf`, `box-shadow 0 30px 70px rgba(25,21,16,.3)` |
| title | Playfair, `500`, `22px`, «Spørsmålsbanken» |
| subtitle | `12.5px --mut` — «Legges rett inn i {{ draftTitle }} · {{ pickerCount }}» |
| close | `34×34`, `radius 10`, `16px` × |
| search | `12px 15px`, `radius 10`, `--bg`, `13.5px`, «Søk i spørsmålsbanken…» |
| category chips | `7px 13px`, `radius 999`, `12px/600` — `["Alle","Egne", …BANK.cat]` (`V2:6204`) |
| row | `padding 13px 0`, `1px --line` bottom; text `14px/500`; badge `3px 9px`, `radius 999`, `10.5px/700`; then `{{ b.cat }} · {{ b.type }}` at `11.5px --mut` |
| row action | «Legg til» — `9px 16px`, `radius 10`, `--sbg`, `12.5px/600` |
| footer | `16px 24px`, `--bg`, top border; `{{ pickAddedNote }}` left; «Åpne biblioteket» (outline) + «Ferdig» (`--ac`, `13px/700`) right |

**The difference is not decoration.** The overlay's whole claim is «Legges rett inn i
{draftTitle}» — you add several questions and stay where you are. The link discards the
Builder's context and hands you a page whose own add button then needs to *rediscover* which
draft you meant (`bibliotek/page.tsx:520`: «The design adds bank questions "rett inn i
{draftTitle}" against one…»). So the app already implements the overlay's **semantics**, on a
different screen, having thrown away the state that made it cheap.

Per §3's constraint this is **a phase built to a drawing that exists** — not an invention.

---

## 1(d) Library bank tab — bundle **V2:2955-2980**

Built, and close. `bibliotek/page.tsx:561-592`, `BankRow.tsx`, `BankSearch.tsx`.

| | Bundle | App |
|---|---|---|
| search | `12px 15px`, «Søk i spørsmålsbanken…» | `library.bankSearch`, same string | ✓ |
| counts | `{{ bankCounts }} · legges rett inn i {{ draftTitle }}` | `bankCounts` «{own} egne · {validated} validerte» + `bankTarget` «legges rett inn i {draft}» | ✓ split into two keys |
| category chips | `["Alle","Egne", …cats]` (`V2:6343`) | `page.tsx:580` — same construction | ✓ |
| row badge | **left**, `flex:none`, `5px 10px`, `radius 999`, `11px/700` | `BankRow.tsx:40` — left, `px-2.5 py-[5px] rounded-full text-[11px] font-bold` | ✓ |
| row meta | `{{ b.cat }} · {{ b.type }} · {{ b.meta }}` at `13px` | `:48` `text-[13px] text-mut` | ✓ |
| delete | `34×36`, `radius 9`, only when `canDelete` | present, gated on `isOwn` | ✓ |

**The one diff, and it is behavioural.** The bundle's confirmation is a **separate `--ac2` pill
in the header** reading «Lagt til i {title} ✓», cleared by
`setTimeout(… , 2200)` (`V2:4431-4432`). The app puts «Lagt til ✓» **inside the button**
(`BankRow.tsx:75-87`), which then stays disabled — `state === 'added'` is never reset, and the
copy does not name the draft. Consequences: you cannot add the same question twice, and after
adding three questions the header says nothing while three buttons are permanently spent.

---

## 1(e) QUIZ IN THE BUILDER — three of five regions built, and the gap is the one §2 needs

`isQuizMode` gates four Builder regions plus two elsewhere. Measured one at a time:

| # | Bundle | What it draws | App | State |
|---|---|---|---|---|
| 1 | `V2:609` | Quiz-innstillinger block: `quizGuard` banner, 4 toggles (`44×25` switches), «Bestått-grense» + «Antall forsøk» inputs (`width:110px`, `radius 10`) | `QuizPanel.tsx`, mounted `Builder.tsx:362` | **built** |
| 2 | `V2:645` | tabAdd note: «Quizmodus: flervalg med inntil fire alternativer vises som store fargefelt med figurer…» on `--sbg`, `12.5px` | — | **NOT built** |
| 3 | `V2:900` | preview score/timer bar: `--ac`, `9px 12px`, `radius 11`, `11.5px/700`, two spans | — | **NOT built** |
| 4 | `V2:908` | preview chips row (pass mark, attempts) | — | **deliberately not built — V2-10, and it is correct.** See below |
| 5 | `V2:3398` | respondent quiz tiles: `grid 1fr 1fr`, `min-height:84px`, `border:3px`, `radius 14`, 26px icon | `QuestionInput.tsx:209-214`, `QUIZ_TILES` | **built**, and cited as `V2:3399-3408` — correct |
| 6 | `V2:6507-6516` | correct-answer marking in the preview | — | **NOT built** |

**Region 4 is not a defect and must not be entered as one.** `quizPreview.chips` renders
`(st.quizPass || 70) + " % for å bestå"` unconditionally; Q84 did not build a pass mark, so
`QuizPanel` renders neither chip, deliberately, with its reasoning beside it. CLAUDE.md already
records this as the manufactured-defect case. **The bundle draws them; we do not; that is the
decision, not the bug.**

**Region 6 is the one that blocks §2.** The bundle marks the key in the preview:

```
V2:6506  quizLine: "Riktig svar: alternativ " + (q.answerIndex + 1) + " · " + (q.pointsAward || 100) + " poeng"
         (or "Riktig svar: første alternativ" when answerIndex is undefined,
          or "Ikke poenggivende i quiz" for a type that cannot carry a key)
V2:6511  correct chip → bg #E4F2E0 · border #2F5D2A · fg #2F5D2A · mark "✓ riktig"
```

`PreviewPane.tsx` contains **no occurrence of `quiz`, `riktig`, `correct`, `#E4F2E0` or
`#2F5D2A`.** The *data* is there — `QuestionCard.tsx:467-501` builds the answer-key editor
(`quizAnswerKey` «Riktig svar», `quizPoints` «Poeng», `quizNoKey`, `quizNotKeyable`) and writes
`answer_index` — so this is a renderer gap, not a schema gap. **§2's "designate a correct answer
and see the preview mark ✓ riktig" cannot be photographed today because the preview does not
mark it.**

Two toggles in `QuizPanel` are honestly labelled unbuilt — `quizInstantUnavailable` «Ikke bygget.
Alle svar vises til slutt.» and `quizCertificateUnavailable` «Ikke bygget. Quiz har ingen
beståttgrense.» That is the right treatment and needs no change.

---

## 2. What this document does not establish

- **No screen was seen.** Every row above is source against source. A property that matches in
  the class list can still render wrong.
- **5a3 was not re-run** — it needs a database. The last measured value stands at **65 of 90**.
- The census is **978 tests across 69 files**, measured from `tests/expected-counts.json` in this
  tree; CLAUDE.md's carried «942 across 64» pre-dates this session's five test files.
- **`bibliotek/`'s bank tab was checked; the rest of Bibliotek was not.** §1 scoped it to the
  bank tab and this document keeps that scope.
