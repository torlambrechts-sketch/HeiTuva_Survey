# 07 — V2-9 (Live) opening note: what the drawing actually contains

**2026-09-09.** Written before any V2-9 code, because reading the bundle disproved three
things `03-plan.md § V2-9` and `04-decisions.md § Batch J` assert about it. CLAUDE.md's first
rule applied to a phase rather than to a repository: **establish what is there before
concluding what is missing.**

Position checked first: `git merge-base origin/main HEAD` = `3b7cef5` = `origin/main` head,
so this branch is strictly ahead and the tree is the project.

---

## 1. THREE CORRECTIONS, EACH BY MEASUREMENT

### 1.1 «the dark surface with no dark tokens» — FALSE

`03-plan.md § V2-9` lists this among the uncovered patterns. The drawn stage (V2:1841) is:

```
background:var(--ink,#191510); color:var(--sf,#FFFDF6)
```

with its overlays as `rgba(255,253,246,.14)` and its rule as `rgba(255,253,246,.16)`. **It is
built from the existing theme tokens.** There is no new colour to name, no dark palette to
invent, and Q83's shape (new named tokens for the quiz tiles) has no counterpart here.

### 1.2 No projected viewport is drawn — but not for the reason the plan gives

The plan treats the projected viewport as a breakpoint problem: a class
`docs/RESPONSIVE.md` has never covered, which is what makes **Q81** a blocker.

What the bundle actually contains is narrower and more decisive:

| | |
|---|---|
| `isLiveScreen` | 2 occurrences, **v2 only** — 0 in `design-reference/` and `design-reference-v1/` |
| The drawn Live surface | The presenter's screen, **inside the app shell**, V2:1829–1868 |
| Its layout | `flex-wrap:wrap` throughout and `grid-template-columns:repeat(auto-fit,minmax(300px,1fr))` — **it wraps by construction** |
| `fullscreen` | `["fullscreen","Presentasjonsvisning","Fullskjerm med spørsmålet i stor skrift"]` (V2:6134), default **on** (V2:4338) |
| The surface `fullscreen` produces | **Drawn nowhere, in any bundle** |

So the drawn Live screen is an ordinary ≥1280px app screen that already wraps. **The
projector is not an undrawn breakpoint of a drawn screen; it is an undrawn screen**, named
only by a toggle label and a one-line description.

### 1.3 Plan test 7 is already satisfied

The plan asks for a two-sided catalogue assertion — that `live_session_state`, reading the
vault, fails until it calls `app.k_for`. **That assertion already exists** and is closed-list:
`tests/invariants/threshold-policy.test.ts:441-462` enumerates every caller-reachable
SECURITY DEFINER function in `public` that selects from or joins `responses`/`answers`, and
fails any that does not call `app.k_for` unless it is named in `DO_NOT_GATE` with a reason.
A new live RPC fails it **by construction, without being named**. Nothing to build; the item
is a check that the existing gate covers the new case, and it does.

---

## 2. WHAT THIS DOES TO Q81 AND Q82 — they do not arise

Q81 asks how to specify a projector viewport. Q82 asks whether the stage is a separate
chrome-free route. Both exist to answer «how do we render the projected surface».

**If the phase builds only what is drawn, there is no projected surface to render**, and
neither question has a subject. The `fullscreen` toggle then ships the way this codebase
already ships a switch whose feature does not exist — the absence left visible rather than
answered with something else:

- **Q74**, V2-6: `helpForum` renders nothing, and is not drawn as «coming later» either.
- **Q26**: the stream panel, same treatment.
- `admin.mgPopulationsUnavailable` — «Populasjoner … er ikke bygget ennå».
- `help_articles.requires_flag` (V2-6) exists precisely so a reader can tell **undocumented**
  from **unbuilt**.

That is not a workaround for a blocked question. It is the answer CLAUDE.md already gives:
*«If something is genuinely unspecified, choose the minimal consistent option»* — and the
minimal consistent option for a surface nobody drew is not to draw one. **Building it would
be do-not-invent yielding to a toggle label**, which is a weaker warrant than the
Reservasjonsliste had (a statutory duty that exists whether or not anybody drew it).

**Recommendation: Q81 and Q82 are recorded NOT-ARISING rather than answered**, and reopen the
moment a bundle draws a projected surface — at which point Q81 becomes a real question about
`docs/RESPONSIVE.md` and Q82 a real question about routing.

---

## 3. WHAT REMAINS, AND WHY THE PHASE STILL STOPS

Two things need Tor, and both are the same kind of thing: **what read and write paths does
Live create over the response vault?**

### 3.1 Q79 — the word cloud's moderation queue *(open, ● security core)*

The cloud **is** drawn, as an in-shell card (V2:1874), so rendering it invents nothing. The
queue behind it is drawn only as a caption — `cloudModeration`, «N tekster venter» — and the
bundle's own toggle copy promises it: **«Ordsky fra frisvar — Vises først etter moderering»**
(V2:6138).

The fork is sharp, and it is not a UI question:

| | What it builds | What it costs |
|---|---|---|
| **(a) Pure aggregate** | word → count, with a minimum-occurrence floor. Shaped exactly like `aggregate_results`; **no individual free text is read by anyone** | The bundle's «Vises først etter moderering» becomes **false** — a claim-set correction (§ 0.3), on a promise about moderation |
| **(b) With moderation** | A queue a person reads before projection | **A new read path over individual respondent free text**, which is what CLAUDE.md invariant 4 and invariant 7 are about. It would be the first one this product has |

**Taking the default (b) builds something that would have to be unbuilt** if Tor prefers (a)
or no cloud — which is exactly the case his instruction says to bring him, and only this one.

### 3.2 The QR join path — a decision NO question covers

Found while scoping, and not in Q78–Q82 or anywhere in `06-remaining-decisions.md`.

The QR's own copy is **«Deltakerne skanner og svarer uten innlogging»** (V2:6135). A room
scans one code. But CLAUDE.md **invariant 2** says the only write path is
`rpc.submit_response`, *token-validated*, one token per invitation — and V2-7 has just
finished making that path do less rather than adding a second one.

One session code shared by a room is not an invitation. Either it mints a per-device token
(which keeps invariant 2 intact and is probably right), or Live gets a second write path
(which invariant 2 forbids). **That is a decision, not an implementation detail**, and it is
upstream of the schema — `live_sessions` cannot be designed without it.

---

## 4. STATE

- **Q78** — already sent in full and open with Tor (`06 § RESOLVED`). Not re-defaulted here.
- **Q79** — sent with this note. **The one.**
- **Q80** — DEFAULT TAKEN, **defaulted-not-answered**: `audienceQuestions` is not built. It
  defaults off at V2:4338 and stays off; building nothing is reversible by a later decision
  without unbuilding anything.
- **Q81, Q82** — **NOT ARISING** on the measurement in § 1.2 and § 2, pending Tor's agreement
  that the phase builds only what is drawn.
- **The QR join path** — new, § 3.2, needs a decision.

**No V2-9 code, schema or migration has been written.** The phase is opened, measured and
stopped at its first real fork, which is the shape the two-pass rule wants: a phase that
cannot close is said so, not started twice.
