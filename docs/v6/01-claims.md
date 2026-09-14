# V6-1 — the claim-set sweep over v6's prose (checklist step 7)

The rule: *a bundle's copy is a CLAIM SET, and every claim about who can see what, what is kept, what
is merged, or how many roles there are is a promise the running product either honours or does not.*
Nothing mechanical protects prose. Run once per handoff.

## 1. THE ONE THAT MATTERS — a false retention promise on the RESPONDENT surface

`rlAnonRows` (**v6:10070-10075**) is the respondent's anonymity disclosure, opened by `rlAnonOpen`.
Six rows. **Five are true against the product. The sixth is false.**

| row | claim | verdict |
|---|---|---|
| Det som lagres | «Svarene dine, uten navn, e-post eller IP» | **true** — invariant 2 |
| Hvem ser det | «Ingen ser enkeltsvar. HR ser summerte tall.» | **true** |
| Minste gruppe | «Resultater vises først fra {threshold} svar» | **true** — interpolated |
| Påminnelser | «Sendes av systemet, ikke av lederen din» | **true** |
| Frisvar | «Vises anonymisert, og aldri for grupper under terskelen» | **true** |
| **Sletting** | **«Svarene slettes automatisk etter 24 måneder»** | **FALSE** |

**Measured against the schema.** `organizations.retention_months` is
`not null default 12 check (retention_months in (0,6,12,24))`, and `app.apply_retention()` deletes
only when `retention_months > 0` **and** `coalesce((o.privacy->>'auto_delete')::boolean, true)`.

So «24 måneder» is wrong three ways at once:
1. **The default is 12, not 24.**
2. **It is per-organisation and configurable**, so no fixed number can be true for every reader.
3. **`auto_delete` can be off, and `0 = never`** — in which case nothing is deleted at all and the
   sentence is not merely imprecise but the opposite of what happens.

**THE BUNDLE CONTRADICTS ITSELF, WHICH IS THE STRONGEST EVIDENCE IT IS AN ERROR AND NOT A DECISION.**
The same file states the same rule correctly 2075 lines earlier:

```
v6:8000  retentionNote: "Svar slettes automatisk etter " + (st.retention || "12") + " måneder…"
```

Interpolated, defaulting to 12 — exactly right. The hard-coded «24» appears twice
(**v6:7291** in `privRows` on the survey-detail Personvern tab, **v6:10075** in `rlAnonRows` on the
respondent surface) and is new in v6 (v5 = 0 occurrences).

**Row 11 of the enumeration table, on a respondent surface, about deletion:** *a description of a
class may not carry a count of the instance in front of you.* The instance here is one demo org's
setting; the class is every organisation that will ever read this sentence.

**DECISION (Q187): the retention sentence is INTERPOLATED FROM `organizations.retention_months`, in
both places, and it states the «never» case rather than implying a number.** A respondent told
«24 måneder» by a product configured to keep forever has been given a false promise about her own
data by the screen that exists to reassure her. The bundle's own `retentionNote` is the model.

## 2. Hosts, URLs, contact addresses

`heituva.no` appears **3 times** in v6 — all inert bundle occurrences, none reaching shipped copy.
The production origin is `https://www.heituva.com`. The standing split holds: a bundle occurrence is
inert; a `messages/*.json` occurrence is a sentence a customer reads. **No new `heituva.no` reached
`messages/*.json` in this handoff.** Everything else is `@nordiskstudio.no` fixture data.

## 3. The empirical class — measured in V6-0, decided by Tor as Q181/Q182

Seven assertions, all new in v6 (v5 = 0 for each): «69 % høyere andel ubesvarte», «OR 1,77»,
«kvalitetskoeffisient 0,74–0,89 mot 0,18–0,51», «WCAG 2.5.7», «~30 px trykkflater», «omtrent doblet
frafall», «10–15 prosentpoeng». **None ships with its figure** (Q181); the reminder prediction loses
its number entirely (Q182).

## 4. Claims that check out

«Ledere ser aldri under terskelen» — true, and database-enforced. `privRows`' «Hvem kan se
enkeltsvar → Ingen. Svarene er anonyme.», «Terskel for nedbryting → Minst {n} svar per gruppe» and
«Behandlingsgrunnlag» are all either true or interpolated. «Databehandler: HeiTuva AS · servere i
Norge» is a claim about hosting; production is Supabase `eu-central-1` (Frankfurt), and the shipped
`faq2A` already says «Oslo og Frankfurt» — **so the bundle's «servere i Norge» is narrower than the
truth and would be a false claim if built as drawn.** Logged; it is not a respondent surface.
