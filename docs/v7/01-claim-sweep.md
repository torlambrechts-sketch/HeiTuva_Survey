# V7-0 step 7 — the claim-set sweep over v7's prose

**2026-09-17.** The seventh step of ADDING A BUNDLE, run once for this handoff.
Bundle: `design-reference-v7/…/HeiTuva.dc.html`, md5 `4d8fde3aea0f56e481bfe2416c811f96`,
10558 lines, cited `v7:<n>`. The 406 lines v7 adds over v6 were extracted with

```
diff <(sed 's/[[:space:]]\+/ /g' <v6>) <(sed 's/[[:space:]]\+/ /g' <v7>) | grep '^>'
```

and read; the figure sweep was then widened to the WHOLE file, because step 7 is per bundle
and a figure inherited from v6 is no less shipped for being old.

---

## 0. THE HEADLINE, AND IT CORRECTS THE INSTRUCTION'S FRAMING IN ONE RESPECT

The plan named «snitt 58 % svar», «snitt 41 %», «snitt 33 %», «snitt 71 %» on the Send channel
cards as figures **seen in the new bundle**. Measured, `snitt` occurs **16 times in v6 and 16
times in v7**, and the `channelCards` line is byte-identical between them (`v6:9720` =
`v7:10020`). So it is not a v7 arrival.

**It is worse than a v7 arrival. It is OUR shipped copy, in both languages, in production.**

The sweep's value here was not finding something new in the drawing. It was that re-reading the
drawing's claims made somebody grep our own message files for the same shapes — and seven keys
came back.

---

## 1. SEVEN KEYS, FOURTEEN ROWS: EMPIRICAL FIGURES IN SHIPPED COPY — FIXED IN BOTH PLACES

Each of these is Q181's class: **a claim about the world, shipped as fact in UI copy, carrying a
figure a customer could check, with nothing in this repository sourcing it.** Q181 struck exactly
this shape from `method_rules` («69 % høyere andel ubesvarte», «OR 1,77») — and was scoped to that
table, so the seven below survived it.

| key | namespace | rendered at | was | why it could not stand |
|---|---|---|---|---|
| `chEmailDesc` | send | `SendScreen.tsx:344` | «Rett i innboksen · snitt 58 % svar» | an average response rate per channel; nothing measures one |
| `chLinkDesc` | send | `SendScreen.tsx:344` | «Alle med lenken · snitt 41 %» | same |
| `chQrDesc` | send | `SendScreen.tsx:344` | «Plakat, skjerm, pauserom · snitt 33 %» | same |
| `chSmsDesc` | send | `SendScreen.tsx:344` | «For skift og felt · snitt 71 %» | same — **and SMS is a flagged channel that has never sent anything**, so the figure is an average over zero sends |
| `bestTime` | send | `SendScreen.tsx:860` | «Foreslått: tirsdag 09:15 — 62 % åpner innen en time» | **the sharpest of the seven: it reports an OPEN RATE, and this account has no transactional webhooks at all.** D133 is the same fact — `bounced_at` has no writer — and `subtabs.ts`'s `malgruppe/levering` refusal says it outright: «no open tracking exists at all». A figure from a signal the product structurally cannot observe. |
| `expectedNoteLong` | builder | `EngagementPanel.tsx:298` | «Trukket ned av lengden — over 8 spørsmål koster rundt 12 prosentpoeng» | «12 prosentpoeng» is a claim about respondent behaviour. See § 5 — it is also a literal read off our own invented model. |
| `insightRate` | results | `ResultsScreen.tsx:822` | «Svarprosenten er {value} %. Under 70 % blir gruppetall usikre.» | **the 70 is ours and stays; the consequence clause was wrong.** `aggregate_results` fires `low_response_rate` at `< 0.7` (`supabase/migrations/20260906000041_empty_group_is_not_a_number.sql:182`), so 70 is our own trigger — Q181's stated exception, «Skala 0–10 på én rad names our own control's range and stays». But nothing in the product makes group figures «usikre» at 70 %; what governs group figures is **k** (`app.k_for`), and low participation matters because it pushes cells under that threshold. The sentence attributed the consequence to the wrong mechanism. |

### The rewrites — the rule without the figure, where the rule is true

```
chEmailDesc      no  Rett i innboksen · én invitasjon per mottaker
                 en  Straight to the inbox · one invitation per recipient
chLinkDesc       no  Alle med lenken kan svare · ingen mottakerliste
                 en  Anyone with the link can answer · no recipient list
chQrDesc         no  Plakat, skjerm, pauserom · samme lenke for alle
                 en  Poster, screen, break room · the same link for everyone
chSmsDesc        no  For skift og felt uten fast e-postadresse
                 en  For shifts and field work without a fixed email address
bestTime         no  Foreslått: midt i uken, tidlig på dagen. Vi måler ikke åpninger, så dette
                     er et råd og ikke et tall fra dine egne utsendinger.
                 en  Suggested: midweek, early in the day. We do not track opens, so this is
                     advice rather than a figure from your own sends.
expectedNoteLong no  Trukket ned av lengden — estimatet faller når undersøkelsen har over 8 spørsmål
                 en  Pulled down by the length — the estimate drops once the survey has more than 8 questions
insightRate      no  Svarprosenten er {value} %. Under 70 % faller flere grupper under
                     anonymitetsterskelen og vises ikke.
                 en  The response rate is {value} %. Below 70 % more groups fall below the
                     anonymity threshold and are hidden.
```

Three of the four channel lines now carry something a customer can act on that the earlier
figure crowded out — **who the link reaches**, which is the anonymity-relevant fact about a
channel and the one the product can actually answer for.

`bestTime` keeps the suggestion and says in the sentence that it is advice rather than a
measurement. That is the same habit as `SubTabRefusals` and the Live page's four named
unavailable panels: **a number that is absent reads as one somebody forgot; a number that is
refused, in words, reads as a decision.**

### IT WAS TWO EDITS, NOT ONE — and the second is the one that reaches a user

CLAUDE.md states this and this sweep is its fourth instance: **`messages/*.json` is the SEED and
`ui_messages` is what the product SERVES.** All fourteen rows existed in production's table,
carrying the old values, as GLOBAL rows (`org_id is null`, `org_key` the zero sentinel) with **no
org-scoped override on any of them** — checked before writing, because an organisation's own
override is their edit and not mine to overwrite.

The update matched on the OLD value as well as the key, so it is idempotent and cannot touch a
row edited since. 14 of 14 returned.

**And the evidence is the comparison, not the apply.** The same fingerprint computed over the
repo's two JSON files and over production's fourteen rows:

```
file fingerprint:  c1694771f5310c0e1edef81821373e28
prod fingerprint:  c1694771f5310c0e1edef81821373e28   (14 rows)
```

`count(*) filter (where value ~ '[0-9]+ ?%')` is **2** on both sides, and both are
`insightRate`'s «Under 70 %» — the one figure that is ours.

---

## 2. THE FIGURES THE BUNDLE CARRIES THAT DO NOT SHIP

Swept and confirmed absent from `messages/*.json`, so inert. Listed because step 7 is about the
bundle's claim set, and because a later phase building one of these screens would inherit them:

| `v7` string | where it would land | status |
|---|---|---|
| «Rutenett gir 69 % høyere andel ubesvarte spørsmål …» | Metodikk | **Q181 struck it**; `method_rules` states the property without the figure |
| «Verste enkeltwidget for ubesvarte spørsmål (OR 1,77).» | Metodikk | Q181 |
| «Ankringseffekt, høyere målefeil og omtrent doblet frafall på mobil.» | Metodikk | Q181 |
| «En påminnelse henter vanligvis inn 10–15 prosentpoeng» | svTuva | **Q182 CUT the number** — and v7 deletes svTuva's markup entirely, so the sentence has no surface left |
| «82 % åpnet e-posten» | `malgruppe/levering` | **refused** (`subtabs.ts`, `'malgruppe/levering'`): four of that funnel's six rows are invented, and «Åpnet» is `inv * 0.82` |
| «Første spørsmål i e-postkroppen gir målt 29,1 % fullføring mot 24,4 % …» | Metodikk / send | not built; **would be Q181's class if it were** |
| «96 % siste bølge» | `utsending/bolger` | **deferred** (`subtabs.ts`, `'utsending/bolger'`): a wave model is a schema change |
| «9 % svarte raskere enn ett sekund per spørsmål» | quality flags | not built |
| «Mål: 70 %» / «Under 70 % blir gruppetall usikre» | results | the 70 is ours (see § 1) |

**Nine bundle figures, one of them shipped and now corrected, seven decided against, one
unbuilt.** That split is the useful statement, not the count.

---

## 3. TWO NEW CLAIM-BEARING SENTENCES, AND BOTH BELONG TO V7-3

Beyond the figures, exactly two sentences in v7's 406 new lines assert something about the
system rather than describing a control. Both arrive with the content blocks:

**(a) `v7` — «Innholdsblokker teller ikke som spørsmål og gir ingen data. De vises i flyten der
de står, og kan brukes til opplæring, begrunnelse eller lovpålagt informasjon.»**

Not false — **undecided**, and it is a promise V7-3 has to make true rather than reproduce. The
bundle honours it at fifteen-odd call sites, all of the form `filter(q => !q.block)`
(`v7:7174`, `9732`, `9735`, `10002`, `10075`, `7751`, `7822`). Ours would have to honour it in
three more places the drawing has no equivalent of: the aggregation RPCs, the CSV/PDF exports,
and `survey_questions`' own `position` uniqueness. **«Gir ingen data» is a claim about
`aggregate_results`, not about a renderer.** Logged for V7-3's measurement step.

**(b) `v7:6871` — the `info` block's seed text: «Svarene brukes til å forbedre arbeidsmiljøet.
Ingen ser hva du har svart alene — resultatene vises bare samlet.»**

**This is the one to be careful with, and it is respondent-facing.** As drawn it is a default the
editor may overwrite — but a seeded default is shipped text, and this one is an **anonymity
promise**. Measured against the product it is true for an anonymous survey under k, and **not
true in three reachable cases**:

- a **named** survey (`surveys.anonymity`), where the response is linked by construction;
- a **comment**, which carries `invitation_id` (QR-2) and is the reason the closed loop can reply
  at all;
- **quiz mode**, whose leaderboard is a per-person surface by design.

So a block seeded with that sentence would put a false anonymity promise on `/s/[token]` for any
survey that is not anonymous — the invariant-3 corollary V4-0 made standing, arriving through a
FIXTURE rather than through a feature. **Recorded, not decided: V7-3 chooses the seed, and the
safe options are an empty body or a sentence that says nothing about who sees what.**

---

## 4. HOSTS, URLS AND CONTACT ADDRESSES

Swept per the standing rule. v7's added lines contain **no host, no URL and no email address**:
the only matches are `q.com` (three occurrences of the JS expression `q.comment…`) and `st.org`.
Across the whole file every address is `@nordiskstudio.no` or `navn@bedrift.no` — the fixture
organisation and a placeholder, both inert — and `url:"https://"` in the `video` block seed is an
empty placeholder rather than a destination.

**`heituva.no` does not occur in this bundle at all.** The four `personvern@heituva.no`
occurrences CLAUDE.md records are in `messages/*.json` and remain untouched, for the reason it
gives: they stay until the replacement mailbox is confirmed to RECEIVE.

---

## 5. THE ONE THING FOR TOR — and it is not copy, it is a fabricated value

Following `expectedNoteLong` to its source turned a copy finding into a bigger one, and this is
the item the standing rule says to bring rather than decide: **it would un-build something that
ships.**

`lib/engagement.ts:128-140` is the whole of «forventet svar», the number the Builder's engagement
panel shows:

```ts
export function expectedResponseRate(e: Engagement, questionCount: number): number {
  let r = 42
  if (e.personal)                 r += 7
  if (e.deadline)                 r += 5
  if (e.show_progress)            r += 3
  if (e.one_question)             r += 4
  if (e.reveal_results)           r += 9
  if (e.incentive === 'lotteri')  r += 8
  if (e.incentive === 'alle')     r += 11
  if (e.incentive === 'veldedig') r += 4
  if (questionCount > 8)          r -= 12
  return Math.max(10, Math.min(92, r))
}
```

**Every one of those eleven constants is a claim about respondent behaviour, and nothing in this
product measures any of them.** It is rendered as a percentage under the label «forventet svar»
(`EngagementPanel.tsx:75, 87`) with the note «Estimat basert på valgene over og lengden på
undersøkelsen» — which is true of the arithmetic and says nothing about where the arithmetic came
from. The file's own header calls it «the design's own arithmetic», which is the honest
description and also the problem: it is the drawing's guess, implemented.

It is CLAUDE.md's never-fabricate rule almost word for word — *«a 0 % derived from an unknown
denominator … A fake value is worse than a gap: it is indistinguishable from a real one in
review»* — and it is the same class Q181 struck, one level up: Q181 removed the figures from the
sentences and left the calculator that generates them.

`expectedNoteLong`'s «rundt 12 prosentpoeng» was literally `r -= 12` read out loud. **The copy was
not the defect; the copy was the model speaking.** § 1's rewrite now describes the estimate
rather than the world, which is true under either outcome below — but it is a smaller repair than
the thing deserves.

**No decision covers this.** `grep -n "expectedResponseRate\|forventet svar" DECISIONS.md
docs/DEVIATIONS.md` returns nothing.

**Three options, and it is a scope call rather than a refusal, so it is Tor's:**

1. **Remove the number, keep the panel.** The six toggles and the incentive choice are real
   settings that change what `/s/[token]` does; only the percentage is invented. The panel keeps
   its controls and loses its headline figure.
2. **Keep it and label it as the drawing's rule of thumb**, in words, on the screen — the habit
   this project uses everywhere else for things it cannot source.
3. **Source it.** We have `survey_rounds`, `survey_invitations` and `responses`: a per-organisation
   historical rate is computable. That is a feature, not a repair, and it would be the only
   version of this panel whose number means anything.

**Assumption I am building under until told otherwise, per the ask-rule's counterpart:** the panel
stays exactly as it is, untouched, and only the copy in § 1 changed. Nothing in V7-1 to V7-3
depends on the answer.
