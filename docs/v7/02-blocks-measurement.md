# V7-3a — the content-block measurement, before anything is designed

**2026-09-17.** The plan's four questions, answered against the running product. No schema change,
no product code. Bundle citations are `v7:<n>` against `4d8fde3aea0f56e481bfe2416c811f96`.

Six types after Sitat is dropped (`v7:6858-6867`): **Seksjon · Tekst · Bilde · Video · Faktaboks ·
Skillelinje.**

---

## 1. WHAT A BLOCK IS IN THE DRAWING

One array, fully interleaved, splice-ordered:

- `insertFlowAt(idx, spec)` (`v7:6808`) does `arr.splice(idx, 0, blockSeed(type))` into
  `sv.questions` — **any index**, so a block can sit anywhere between two questions.
- `moveFlowTo(fromId, toId)` (`v7:6818`) reorders within that same array.
- A block is `{ id, block:true, type }` plus its own fields (`v7:6869-6881`), where `type` comes
  from a **different vocabulary** than a question's: `section · info · img · video · fact · rule`.

**So ordering is STORED, not derived — it is the array's own order — and it is ONE sequence over
two kinds of row.** That is the fact the schema has to reproduce.

Every consumer in the bundle then filters: `filter(q => !q.block)` at `v7:7174` (`sdBuild`),
`9732`/`9735` (the length note and «too long»), `10002` (preview), `10075` (logic rules), and
`7751`/`7822` (the comment box and the choice tiles).

---

## 2. WHAT EVERY EXISTING QUERY THAT COUNTS QUESTIONS WOULD NOW COUNT

The plan's sharpest question, and the answer is better than expected — **because of how the
product reads questions rather than because anyone planned for this.**

`survey_questions` is read by **fifteen** SQL functions
(`pg_get_functiondef … like '%survey_questions%'`). Measured one by one:

### Immune — they arrive through `answers.question_id`, and a block never has an answer (11)

`app.report_quotes` · `public.compose_report` · `public.dashboard_summary` · `public.get_themes` ·
`public.get_trends` · `public.quiz_leaderboard` · `public.quote_candidates` ·
`public.results_summary` · `get_benchmarks`' second half · `app.forbid_translation_edit_after_send`
(by id) · `submit_response`'s answer loop (by id, from `p_answers`).

Every one is `join public.survey_questions q on q.id = a.question_id`. **A row nobody can answer is
a row these never see.** That includes the whole k-anonymity reporting path.

### Immune by predicate (2)

- **`public.get_benchmarks`** — `bool_or(q.type = 'scale' …)` over every row of the survey. A block's
  type is not a scale type, so the flag is unchanged.
- **`app.scale_questions`** — selects `q.type::text` for the caller to filter on scale types.

### NOT immune — three functions change behaviour, and one gains a hole (4)

| function | what it does now | what a block row would do |
|---|---|---|
| **`public.send_round`** | `select … from survey_questions where survey_id = … order by position` into `survey_rounds.question_snapshot`, then **refuses an empty snapshot** (`if jsonb_array_length(v_snapshot) = 0`) | Blocks MUST be in the snapshot — that is how they reach the respondent. But **the empty guard becomes «nothing at all» instead of «no questions»: a survey of six info blocks and zero questions would send.** A new failure mode, introduced by us, in the one function that decides whether a round exists. |
| **`app.run_due_schedules`** | the same query for the recurring send | the same, on a silent pg_cron job |
| **`app.aggregate_rows`** | `select q.id, q.type, q.text, q.config … where survey_id = … order by q.position`, **one result row per question** | **one result row per BLOCK**, with n = 0, which the k gate then reports as `insufficient_data`. A «Skillelinje» would appear on Resultater as a suppressed cell. |
| **`public.submit_response`** | a comment's `question_id` is validated as `q.id = … and q.survey_id = v_survey.id` | **a comment could be attached to a block.** Small, and it is a hole rather than a behaviour change. |

### The TypeScript side (6 call sites, all counts)

- `app/(app)/undersokelser/page.tsx:257` — `survey_questions(count)`, the list's «N spørsmål».
- `app/(app)/undersokelser/[id]/send/page.tsx` — `count: 'exact', head: true`, the send screen's gate.
- `bygg/page.tsx`, `sporsmal/page.tsx`, `live/page.tsx`, `resultater/page.tsx` — the selects.
- `lib/questions/method.ts` — the Metodikk rules would run over blocks.

**Note the shape:** the SQL side is immune where it goes through `answers` and exposed where it
reads by `survey_id`; the TypeScript side reads by `survey_id` everywhere, so **every TS count
would change.**

### And one that is already gone

`EngagementPanel`'s `questionCount` was removed hours ago with D232's model. Had it survived, it
would have been a seventh site.

---

## 3. THE RESPONDENT SIDE

**The respondent never reads `survey_questions`.** `get_survey_for_token` returns
`v_round.question_snapshot` — the round's frozen copy. So a block reaches a respondent only if
`send_round` puts it in the snapshot, and the snapshot's columns are
`id, type, text, help, required, comment_mode, follow_up_on_low, config, position`. **A block's
title, body, caption and url would have to live in `config`, or the snapshot's column list grows.**

What v7 renders, and where:

| key | line | behaviour |
|---|---|---|
| `respondOne.rIsBlock` | `v7:7794`, markup `5399` | a block is a STEP in the flow |
| `rBlockIsImg` / `rBlockIsVideo` / `rBlockIsRule` | `7801`, `7802`, `7806`; markup `5401`, `5406`, `5420` | three of the six get their own markup; `section`, `info` and `fact` share the text shape |
| `rBlockHasBody` / `rBlockHasCaption` | markup `5399-5430` | optional parts |
| `fbEnabled` | `v7:8102` | **the per-question comment box is suppressed on a block step** |
| `stepLabel` | `v7:10442` | **«Les · steg N av M»** — a block is counted in both N and M |
| `respondList` | `v7:7762-7766` | maps over `sv.questions` INCLUDING blocks; `req` is forced empty (`q.required && !q.block`) and `text` becomes `q.title` |

**The consequence worth naming: v7 counts blocks in the respondent's progress.** A survey with an
intro block and five questions reads «steg 1 av 6». The bundle is careful about this in the BUILDER
— `lengthNote` and `tooLong` filter blocks out (`v7:9732`, `9735`) and `bMinutes` weights them
separately, `qn*0.4 + bn*0.25` (`v7:10208`) — and counts them in the respondent flow. That is
self-consistent, because the word is «steg» and not «spørsmål».

---

## 4. BILDE AND VIDEO — one mechanism or two

**Two mechanisms, and the first is cheaper than the plan assumed but has a security condition the
plan is right to ask about.**

**Video is a URL field.** `v7:6874` seeds `{ title, url:"https://", caption }`. Nothing to build but
a text input — and one open question: an `<iframe>`/`<video>` on `/s/[token]` pointed at a URL an
editor typed is **a third-party request made from the respondent's browser**, on a surface that has
been kept free of anything that could observe the respondent. That is a stop-and-ask, not a detail.

**Bilde is an upload, and the pattern exists.** Measured:

```
storage.buckets     org-logos       public = FALSE   2 MiB   {svg+xml, png, jpeg, webp}
                    report-exports  public = FALSE  20 MiB   {pdf, pptx}
storage.objects     4 policies for org-logos, 3 for report-exports
upload              administrasjon/actions.ts:834   .upload(path, file, { upsert, contentType })
read                administrasjon/actions.ts:857   .createSignedUrl(path, 3600)
                    administrasjon/profil/page.tsx:39  same
```

**THE PATH IS `${orgId}/logo_${slot}.${ext}` — IT ENCODES THE ORGANISATION'S UUID.** A signed URL
contains its object path, so anyone holding the URL sees the org's primary key.

For the logo that is contained, because **measured, the org logo reaches exactly two screens and
both are manager-facing**: the upload's return value and the Profil preview.
`grep -rn "org-logos" app/ lib/ components/` returns three hits, all in `administrasjon/`. **No
signed URL reaches `/s/[token]` today, so no organisation identifier does either.** (Q58's branding
on the respondent surface is drawn and not built; `components/Logo.tsx` is the HeiTuva wordmark.)

**So an image block would be the FIRST signed URL on a respondent surface, and copying the logo's
path shape would put an organisation's UUID in front of someone who was promised anonymity** —
invariant 3's corollary, arriving through a file path. Two ways to avoid it:

1. **An opaque object key** — `survey-media/<random-uuid>.<ext>`, the mapping held in the block's
   `config`, bucket private, short TTL, signed at render time by the already-token-validated server
   component. The URL then carries nothing but a random id.
2. **Serve through our own route** — `/s/[token]/media/<blockId>`, validating the token and
   streaming. No storage URL reaches the client at all. Strongest, and more to build.

Either way the MIME allowlist needs its own decision: `org-logos` permits `image/svg+xml`, and an
SVG is a document that can carry script. For a respondent-facing image that is a deliberate choice,
not an inherited one.

---

## 5. THE HINGE — ONE TABLE OR TWO

Everything above reduces to this, and it decides the migration.

**One table** (`survey_questions` + a `block boolean` + six enum values, the bundle's own model):

- Ordering is free — one `position` space, and `unique (survey_id, position) DEFERRABLE` already
  holds it.
- `send_round`'s snapshot is unchanged in shape.
- **But an answer against a block is EXPRESSIBLE**: `answers.question_id` FKs to this table, so only
  a trigger stands between a block and an answer row. Same for `question_translations` and
  `survey_comments.question_id`.
- Four SQL sites and six TS sites need a `not block` filter, and the next one written needs it too.
- `survey_questions_answer_index_typed` and `points` are question-only columns that every block row
  would carry as dead weight.

**Two tables** (`survey_blocks`, its own vocabulary):

- **An answer against a block is UNREPRESENTABLE** — there is no FK target. That is the project's
  own stated preference: *prefer the shape where the wrong thing cannot be expressed over the shape
  where it is merely not done.*
- The four SQL sites and six TS counts keep counting questions, correctly, with **no edit at all**.
  `aggregate_rows` cannot emit a block row; `submit_response` cannot accept a comment on one.
- **But the order is one sequence across two tables**, and no single `unique` constraint spans them.
  The flow becomes `union all … order by position`, and a tie between a question and a block at the
  same position is a real possibility that needs its own guard.
- `send_round`'s snapshot becomes a union, and its empty guard has to be re-stated as «no
  QUESTIONS» rather than «nothing».

**Both need `send_round`'s guard restated**, because a blocks-only survey must not send either way.

**My recommendation is TWO TABLES**, on the strength of one measurement: eleven of the fifteen SQL
functions are immune *because they reach questions through `answers`*, and two tables extend that
immunity to the remaining four for free, while one table converts it into eleven filters somebody
has to remember. The ordering tie is one deferred constraint or one trigger; the alternative is a
class of defect that stays open forever.

**This is the one thing I am not deciding alone** — it is the migration, and it is expensive to
reverse once rows exist.

---

## 6. WHAT I WILL DECIDE AND RECORD, whichever way the hinge goes

- **`send_round` and `run_due_schedules` refuse a survey with no QUESTIONS**, not merely one with
  no rows. Negative test proven failing first.
- **A block can never be answered and never be commented on**, enforced in the database rather than
  by the renderer.
- **The image path is opaque** — no organisation identifier in any URL a respondent can see.
- **The respondent's step label follows v7** («Les · steg N av M», blocks counted), because the word
  is «steg» and the drawing is self-consistent about it — while the BUILDER keeps counting questions
  only, also as v7 does.
- **The `info` block's seed is not the drawing's** (D233): its «Ingen ser hva du har svart alene»
  is false for a named survey, for a comment and in quiz mode. Empty body, or a sentence that says
  nothing about who sees what.
