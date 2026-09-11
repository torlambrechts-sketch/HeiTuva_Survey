# v3 bundle — measured before trusting it

**Source:** `739f5391-HeiTuva.dc.html`, `md5 c6f635891eb75236b54c555778fd2fd4`.
**Against:** installed v2, `md5 3f8de86dc8ab571165ae119a78f5b394`.
**Not installed yet.** Nothing is built from this until the plan is read.

## 0. The claims, checked

| claim | measured | verdict |
|---|---|---|
| 6981 lines vs v2's 6727 | 6981 / 6727, +254 net | **exact** |
| ten new states | see § 1 | **exact, once scoped** |
| none removed | 12 lines removed, **0 states removed** | **true of states**; the twelve are replacements |
| `feedbackMode` per survey, four values | `off / anonymous / named / optional` | **exact** |
| a comment per question (`qcOpen`/`qcSaved`) | present, keyed by question id | **exact** |
| manager replies | `replies:[{text, who, date}]` | **exact** |
| Oppgaver/Tilbakemeldinger one surface with a filter | `tfTabs`, `showTasks`/`showFeedback` | **exact** |

```
diff v2 new | grep -c '^<'   # 12
diff v2 new | grep -c '^>'   # 266
```

**The twelve removed lines are replacements, not deletions**, and that was checked at the level of
states rather than lines: every `sc-if` key present in v2 is present in the new bundle
(`comm -23` over the sorted key sets returns nothing). The twelve are the Oppgaver header and
filters being rewritten for the combined surface, the `screens` array relabelling `tasks` to
**«Oppgaver og tilbakemeldinger»**, one stat chip, and four respondent state handlers being
extended with comment state.

## 1. The ten new states — and the three that are not states

`sc-if` keys go 205 → 218, so **thirteen** are new. Ten are surface states; three are per-row
predicates inside the `fb` loop, which is why «ten» is right:

| surface state | what it gates |
|---|---|
| `fbEnabled` | `feedbackMode !== 'off'` — the comment field exists at all |
| `fbChoosable` | mode is `optional` — the respondent gets the anonymity toggle |
| `fbFixedNote` | mode is `anonymous` or `named` — a fixed line instead of a toggle |
| `fbNotSent` / `fbSent` | the end-of-survey comment box, before and after |
| `qcClosed` / `qcOpen` / `qcSaved` | the per-question comment: the ＋ affordance, the open editor, the saved chip |
| `showTasks` / `showFeedback` | the combined surface's filter |

| per-row (inside `sc-for … as="fb"`) | |
|---|---|
| `fb.hasQuestion` · `fb.hasReplies` · `fb.replyOpen` | one feedback row's own shape |

## 2. `DEFAULT_FEEDBACK` — the shape, read off the seed

```js
{ text, survey, who, anon, date, tag, handled,
  question?,          // present on 2 of 7 — the comment is attached to a QUESTION
  replies?: [ { text, who, date } ] }
```

`tag` observed: `Spørsmålene`, `Resultater`, `Utsending`, `Ros`, `Ny`, `Samtale`. `handled` is a
boolean the manager sets. `who` is `"Anonym"` or a real name, paired with `anon`.

## 3. The four modes, verbatim

```js
["off",       "Av",                "Ingen kommentarfelt på spørsmålene"],
["anonymous", "Anonym",            "Kommentaren lagres uten navn. Lederen kan svare,
                                    respondenten ser svaret ved neste innlogging"],
["named",     "Med navn",          "Navnet følger kommentaren"],
["optional",  "Respondenten velger","Et valg per kommentar: anonymt eller med navn"]
```

**The default when unset is `"anonymous"`** — `sv.feedbackMode || "anonymous"`, at every one of the
six read sites. Combined with Tor's scope decision (communication on EVERY survey), that means
**every existing survey acquires a comment field unless someone turns it off.** That is a
consequence of the scope decision rather than an argument against it, and it is written here
because it is the kind of thing that is obvious afterwards.

## 4. Three findings that bear directly on the decisions

### 4.1 «neste innlogging» is in the BUILDER-facing copy, not only the respondent's

The `anonymous` mode's description — the sentence a manager reads while *choosing* the mode —
says «respondenten ser svaret ved neste innlogging». A respondent does not log in. So the false
claim is sold to the person configuring it, which is worse than a wrong line on the respondent
screen: it is the basis on which they pick the mode.

### 4.2 `optional` is per-comment in its STORAGE SHAPE and per-submission in its BEHAVIOUR

**CORRECTED IN C0 (2026-09-11). What stood here was wrong, and it was wrong in the direction that
made Q113 sound like a bigger decision than it is.** The original text is kept below the correction
because a number nobody re-derives is how a wrong one survives, and the same goes for a reading.

What I wrote: «`anon` is stored per question id … Tor's decision 3 overrides the bundle's behaviour
**and** its copy.» That reasoned from the storage *shape* — `qcSaved[id].anon` — and stopped there.

**Measured properly, the bundle already behaves the way Q113 decides**, for two independent reasons:

1. **The value has one source.** `V3:5362` (per-question save) and `V3:5378` (end-of-survey send) are
   the same line: `const anon = mode === "anonymous" ? true : mode === "named" ? false :
   (st.fbAnon !== false)`. In `optional` mode both read **`st.fbAnon`, one submission-level toggle.**
   A respondent who flips it on question 3 has flipped it for questions 1 and 2. The chips at
   `V3:5352-5353` write that same toggle.
2. **The key never varies.** `respondList` emits no `id` (D156), so all five reads of
   `(rq[stepIdx]||{}).id` resolve to `undefined` and there is one slot per respondent regardless.

**So Q113 is a copy correction, not a behaviour override.** «Et valg per kommentar» (`V3:5339`) is
false against the bundle's own implementation — and the bundle says so itself elsewhere: the
Oppgaver subtitle reads «Valget anonymt eller med navn styres **per undersøkelse** under Generelt».
Two sentences in one handoff, disagreeing about the feature's central privacy property.

The decision does not change. What changes is the claim made *for* it, and the weaker claim is the
true one.

### 4.3 The comments are created in the same handler that writes the response

`Object.keys(qc).map(...)` runs inside the submit handler, immediately before the response is
appended. In a prototype with no database that is harmless; in ours it is precisely the
association decision 3 is about. There is no point in the flow where a per-question comment exists
independently of the submission it came from — so if they share a key, they share it by
construction, not by accident.

## 5. What this document does not establish

- **Nothing is installed.** No `design-reference-v3/`, no harness entry, no baseline. Installing is
  step 1 of the plan and carries CLAUDE.md's seven-item checklist, including the security-copy
  sweep, which this measurement is not a substitute for.
- **The copy has not been swept.** § 4.1 is one claim found while measuring structure; the sweep
  reads every promise-shaped sentence in the new bundle against the running database, and it has
  not run.
- **No screen was rendered.** Line numbers and data shapes only.
