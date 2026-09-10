# 04 — Quiz: the build half done, the visual half UNVERIFIED

## What the review found before it could seed anything

The instruction said «seed it and photograph it». Seeding was **not possible
honestly**, and the reason turned out to be the most valuable single finding in
this review.

`app/(app)/undersokelser/[id]/bygg/RunModePanel.tsx`, before this commit:

```ts
type Mode = 'standard' | 'live'                                    // :26
{ key: 'quiz', label: s.quiz, desc: s.quizDesc, locked: true },    // :68
{note ?? s.quizNote}                                               // :104
```

with `builder.runModeQuizNote` = **«Quiz er ikke bygget ennå»** / «Quiz is not
built yet», rendered under a card at `opacity .45`, `cursor: not-allowed`.

**Quiz was fully built.** `M:0085`–`M:0088` on prod; `surveys_run_mode_check`
reads `ARRAY['standard','live','quiz']`; `quiz_leaderboard` k-gated by `M:0086`;
`app.guard_quiz_policy` refusing a non-named survey and a statutory pack; quiz
tiles on `/s/[token]`; the Lagtavle on Resultater; `QuizPanel` complete; **26
green tests**.

**So no customer could turn on a feature the product had, and the screen told
them it did not exist.** Both the card's lock and the action's
`z.enum(['standard','live'])` carried comments written *before* V2-10 — «V2-10
builds it and nothing behind it exists yet», «M:0083's CHECK would refuse it
anyway» — and neither was revisited when V2-10 landed. Measured against prod
rather than taken from the comment: the CHECK has allowed quiz all along.

**This is DEVIATIONS D135 in shipped user-facing copy**, and the cost is larger
there than in a README: a customer cannot re-derive it, and a disabled control
carrying a reason is the most convincing thing a screen can say.

Seeding without unlocking would have set `run_mode` in SQL to a state no
customer could reach — **D139, manufactured deliberately.** So the order was:
unlock, then seed.

## Done

- **Card unlocked.** `Mode` is `'standard' | 'live' | 'quiz'`; `locked: false`.
- **The false note deleted** from `messages/{no,en}.json` **and from prod's
  `ui_messages`** — the file is the seed, the table is what the product serves.
- **The note chip renders only a real refusal.** It was `{note ?? s.quizNote}` —
  a chip that always has text is a claim, and this one's claim outlived its truth
  by a phase. Now it appears only after something was refused.
- **`setRunMode` accepts quiz** and names its refusals: both
  `quiz_requires_named` and `quiz_not_on_statutory_pack` surface as one
  `quizGuard`, rendered with `builder.quizGuard` — a string that already shipped
  and states both halves. The card is pickable and the database teaches the rule,
  which is the choice live already made.
- **Quiz seeded** — «Personvern for nyansatte», named, non-statutory, two choice
  questions with `answer_index`, six respondents over k so the Lagtavle returns
  real rows rather than its gated shape.
- **Nine tests**, `tests/unit/quiz-reachable.test.ts`, eight proven failing on
  their assertions first.

## The chips: already correct, and the register line misleads

The instruction asked me to fix `quizPreview`'s chips, «which render a pass mark
and an attempt count Q84 deliberately did not build». **They do not, and did
not.** The bundle's derivation unconditionally pushes them:

```js
const chips = [ (st.quizPass || 70) + " % for å bestå", (st.quizTries || 2) + " forsøk" ]
```

but our `QuizPanel` declines to render either, with a documented reason: they are
not switches over an absent feature but *inputs for a decision that was made not
to exist*, and a greyed-out «70 %» invites «how do I enable this», which has no
answer. `instant` and `certificate` correctly render the absence-visible
treatment. **V2-10 got this right.**

`06-remainder.md § 1.6` reads *«quizPreview's chips render a pass mark and an
attempt count, which Q84 did not build, so they are not rendered at all»* — one
sentence describing the bundle and the build with no boundary between them, and
it reads as an outstanding defect. Corrected there.

## UNVERIFIED — the visual half

**No quiz screen was photographed, so this review cannot say what it looks
like.** `verify:reference` needs a browser and a local stack; neither exists
here. What the seed now guarantees is that the run which *can* be taken will
find a quiz to photograph, and that `quiz_leaderboard` has rows to return —
moving it from CHECKED to PROVEN in 5a3, which an empty table can never be.

**The seed is also unrun here.** Both database guards would refuse a bad fixture
loudly, and CI executes `npm run seed:demo` in two jobs, so the run is the proof.
