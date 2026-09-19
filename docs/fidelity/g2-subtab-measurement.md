# G2 — the six subtabs, measured before building

**2026-09-19, against `design-reference-v8` (md5 `b4e430eccd9cfac0105b8089b6ef206f`).**
The F5 refusals in `lib/surveys/subtabs.ts` cite **v6**. v8 governs now, so every one was
re-measured against v8 rather than carried.

## First: v8 changed the rail, and it agrees with two of F5's refusals

```
v6  resultat:[matrise, sporsmal, sammenlign, runder, fordeling, frisvar]   6
v8  resultat:[matrise, sporsmal, sammenlign, frisvar]                      4
```

**v8 DROPPED `runder` and `fordeling`.** F5 refused `fordeling` on the reasoning that a
distribution belongs inside its own question's card, not beside it — and the drawing has since
done the same thing. Recorded because a refusal that the next bundle adopts is evidence the
refusal was right, and because `REFUSED` still carries both keys as though v8 drew them.

## The six

| # | subtab | v8 draws | data | verdict |
|---|---|---|---|---|
| G2.1 | `resultat/frisvar` | its own tab (v8:7790 `resFrisvar`) | `get_quotes(survey, round, group, limit, lang)` — k-gated, exists | **partially built** — rendered today INSIDE each question's card (`ResultsScreen.tsx`), not as a tab |
| G2.2 | `resultat/sammenlign` | «Sammenligning med tidligere runder» — bars per round, then round × question-area with an **Endring** column (v8:1723-1760) | `get_trends(survey, group)` exists and is k-gated | **absent** — and it carries a disclosure defect, below |
| G2.3 | `resultat/matrise` | «Resultatmatrise», **Gruppe × `sd.themes`** (v8:1687-1701) | `get_themes(org, surveys[], group, lang)` takes ONE group | **absent** — buildable as N gated calls |
| G2.4 | `utsending/bolger` | four waves, day 0 → +3 → +7 → +12, each to non-responders (v8:1983) | `schedules.reminder_after_days` is a single int; `survey_invitations.reminded_at` a single timestamp | **data absent** — a wave model is a schema change |
| G2.5 | `utsending/leveranse` | `sd.delivery2` — SPF · DKIM · DMARC · Innboksplassering · Avvisninger · Klager | facts about **our sending domain**, not about the survey | **not built, by kind** |
| G2.6 | `malgruppe/levering` | six funnel rows (v8:7855) | three of six exist | **buildable with a correction** |

## G2.2 — THE DISCLOSURE FINDING, which is the point of asking

Tor asked which pairs are reachable and whether any pair discloses by difference. **One does, and
it is the column v8 draws.**

`TrendPoint` carries `n` OUTSIDE the gated union (Q49/V1-6): a round below threshold still reports
how many answered, and only its `avg` is suppressed. v8's comparison table puts an **Endring**
column beside the per-round cells. So:

```
  Runde 1   avg 4.2     (n = 8, above threshold)     shown
  Runde 2   avg —       (n = 3, below threshold)     suppressed
  Endring   +0.3                                     ← discloses runde 2 = 4.5
```

**A change column spanning a suppressed cell reconstructs it by arithmetic.** The suppression is
undone by the column sitting next to it. This is invariant 1 condition 4 in the form the project
has not met before: not «the cell reports its own n», but «a neighbouring derived cell reports the
value». It is the same subtraction argument that refuses Segmenter (Q92), moved from two
overlapping populations to two rounds of one.

**The rule to build:** a change is rendered only when BOTH endpoints it spans are above threshold.
Where either is suppressed the change is suppressed too — and it must be suppressed for the same
reason and with the same treatment, or the empty cell itself becomes the signal.

Every other pair in the table is safe: two shown cells disclose nothing new, and two suppressed
cells yield no arithmetic.

## G2.3 — the tab and the question type are different things, which the brief conflates

The instruction points at `TYPE_LABEL`'s 13 types and notes that `matrix` is one. It is —
`lib/questions/registry.ts:144`, `group: 'utsagn'`, `statements: true`, `numeric: true`. **But
v8's «Matrise» tab is not about that type at all.** Its axes are `Gruppe` × `sd.themes`: a
cross-tabulation of RESULTS, where a `matrix` question is a statements grid a respondent fills in.

Having the question type therefore says nothing about whether the tab's data exists. What the tab
needs is a theme axis crossed with a group axis, and `get_themes` takes a single `p_group` — so the
matrix is N gated calls, one per group, exactly the per-scope union `/dashboard` already uses for
trends and themes. No new RPC, and no new disclosure path: each cell is gated by the same call that
would gate it alone.

## G2.6 — three rows of six exist, and the split is the answer

v8's `delivery` (v8:7855) is **byte-identical to v6's**. Four of its six values are invented:

| row | v8's value | ours |
|---|---|---|
| Sendt | `String(inv)` | **real** — `survey_invitations.sent_at` |
| Åpnet | `Math.round(inv * 0.82)` | **absent** — no open tracking exists; this account has no transactional webhooks (D133) |
| Startet | `Math.round(res * 1.15)` | **absent BY DESIGN** — `rpc.submit_response` is ONE transaction (invariant 2). There is no partial response to count, and there never will be while that invariant holds |
| Fullført | `String(res)` | **real** — `responded_at` |
| Bounce | the literal `"2"` | **absent** — `bounced_at` exists and has NO WRITER. Re-measured: every reference in `supabase/`, `app/` and `lib/` is a read (`where bounced_at is null`) or a comment |
| Reservert | the literal `"1"` | **real** — `suppressions`, since M:0060 |

F5 wrote «Two real rows do not make a funnel». **Re-measured, three are real** — `Reservert` has had
a table since M:0060 and F5's own note says so in passing without counting it. The correction is
recorded rather than the sentence quietly fixed.

`mail_outbox` does not change this. It is a **pgmq queue** (`select pgmq.create('mail_outbox')`,
M:0008), holding messages waiting to be sent; `mail_outbox_read`/`_delete`/`_archive` are its API.
It records nothing about opens, bounces or partial starts, so the two repair migrations that touched
it moved no figure this tab needs.

## G2.5 — not built, and the reason is KIND rather than absence

`sd.delivery2` is six rows of domain authentication — SPF, DKIM, DMARC, inbox placement, rejections,
complaints — plus a paragraph about `p=quarantine`. Three of those are facts about **our sending
domain**. They do not vary per survey, per round or per organisation, so this does not belong on a
survey's send tab even if every number were measured. If domain authentication becomes a surface it
is an Administrasjon one.

That reasoning is F5's and it survives re-measurement against v8 unchanged: `delivery2` occurs twice
in v6 and twice in v8, and the rows are the same rows.


---

# G2 BUILD — the outcome per subtab

| # | subtab | outcome |
|---|---|---|
| G2.1 | `resultat/frisvar` | **built as drawn**, reusing `QuoteList` — one renderer, not two |
| G2.2 | `resultat/sammenlign` | **built with a correction**: the Endring column renders only when BOTH endpoints clear the threshold |
| G2.3 | `resultat/matrise` | **built as drawn** — Gruppe × tema, N gated `get_themes` calls |
| G2.6 | `malgruppe/levering` | **built with a correction**: three of v8's six rows; the other three named as absent on the screen |
| G2.4 | `utsending/bolger` | not built — data absent, per instruction |
| G2.5 | `utsending/leveranse` | not built — domain facts, not survey facts, per instruction |

## G2.0 — `n` on a gated trend point does NOT contradict T1.4

Read back from `pg_proc`, not from the TypeScript type — which is where my own measurement note had
gone wrong. `get_trends` keeps two different counts:

- **`scale_n`** — the population behind the AVERAGE. This is the gate's subject, and the function's
  own comment says of it: *«it is emitted nowhere, and if it is ever emitted again it must not be
  called `n`».*
- **`took_part`** — how many people responded, with **no join to `answers`**. This is what ships
  as `n`.

So the emitted `n` is participation, which Q28's people-versus-derived line lets through.
**Something did change since T1.4:** Q49 (V1-6) moved `n` from null to the count deliberately, and
`tests/invariants/k-surface.test.ts:362` says so verbatim — *«Was asserted null here»*. The gated
payload is enforced as a CLOSED KEY SET, so nothing derived can join it.

And the trend reader is not a second path: `readTrends` is a one-line `call('get_trends', …)`.

**Conclusion: the source is sound.** The Endring column is its own defect, not a symptom of one,
and what it would reconstruct is the `avg` — never the count.

## The sweep — every derived figure over two possibly-gated cells

| figure | endpoints | verdict |
|---|---|---|
| `results_summary.delta` (round over round) | both gateable | **correct, and structurally so** — `v_prev_avg` is read from the PUBLISHED `v_prev` payload (`v_prev ? 'avg'`), and a gated `PrevRound` has no `avg` key |
| `ResultsScreen` benchmark `diff` | `mine` gateable, `bench` published | **was correct by vigilance** (`mine === null ? null : …`) — now routed through `changeBetween` |
| `RoundsPanel` bar height | single cell | gated (`gated ? 4 : …`) |
| oversikt / duty / live percentages | non-gated denominators (invited, steps, counts) | not the class |

**One pre-existing delta, and it was already right.** v8's Endring column would have been the first
ungated one in the product.
