# 01 — What the product actually offers, measured

## 1.1 The catalogue is NOT the problem

*Command:* `select category, count(*) from template_packs where org_id is null group by category`

| category | packs | share |
|---|---|---|
| Annet | 7 | 32 % |
| **Lovpålagt** | **6** | **27 %** |
| Ansatte | 5 | 23 % |
| Kunder | 4 | 18 % |

**22 shipped packs, 16 of them non-statutory.** A buyer who reached the content
would find «Hvor sannsynlig er det at du anbefaler oss?», «Hvordan var
opplevelsen?», «Medlemsundersøkelse», «Innbyggerundersøkelse», «Brukerundersøkelse
— tjeneste», «Evaluering av kurs». The product can do the job. Q45 did what it
said: five packs under `category = 'Annet'` with `use_case` set, and the CHECK
never widened.

## 1.2 The ORDER and the DEFAULT say something else

*Command:* `select sort_order, key, label, (select count(*) from template_packs p where p.use_case = u.key) from use_cases u order by sort_order`

| sort | use case | packs |
|---|---|---|
| **10** | **HR og arbeidsmiljø** | **10** |
| 20 | Kunder | 4 |
| 30 | Intern tjeneste | 3 |
| 40 | Leverandørkjede | 1 |
| 50 | Offentlig sektor | 2 |
| **60** | **Medlem og frivillig** | **2** |

`hr` sorts first and holds **45 % of every pack in the product**.

**`app/(app)/undersokelser/ny/Wizard.tsx:71` is `useState(useCases[0]?.key ?? '')`.**
Not a chosen default — the first row of a registry, whatever it happens to be.
So **every new survey opens pre-selected to «HR og arbeidsmiljø»**, and the
Bibliotek rail leads with the same chip.

Of the three first-customer profiles: **kunder is second, intern third, medlem is
last of six.**

## 1.3 The question bank has no customer at all

*Command:* `select category, count(*) from question_bank where org_id is null group by category`

Twelve shipped questions in eleven categories: **Arbeidsmiljø, Engasjement,
Goder, Kultur, Ledelse, Oppstart, Turnover, Tydelighet, Verktøy, Arrangement,
Åpne.**

**Not one is customer, member, citizen or service.** A buyer who skips the packs
and builds from the bank — which is what someone with an existing NPS wording
does — finds «Turnover» and «Ledelse».

## 1.4 The language, and the split that matters more than the ratio

*Command:* the namespace sweep in `00-method.md`, over `messages/no.json`.

| surface | statutory | customer |
|---|---|---|
| Oversikt | 3 | 0 |
| Bibliotek | 4 | 0 |
| Veiviser | 0 | 0 |
| Undersøkelser | 0 (1 was a false match) | 0 |
| **in-app subtotal** | **7** | **0** |
| Bruksområder | 26 | 7 |
| Splash | 15 | 7 |
| **total** | **48** | **14** |

The ratio is **3.4 : 1**. But the ratio is the weaker statement.

**Inside the app it is 7 to 0 — an absence, not a ratio.** Customer vocabulary
exists on exactly the two surfaces a buyer reads BEFORE signing up, and on none
of the four they use after. The marketing says «kunder, medlemmer, innbyggere»;
the product says «plikter, frister, arbeidsmiljø».

## 1.5 THE DRAWING SAYS THE OPPOSITE OF THE BUILD

*Command:* the same two regexes over `design-reference-v2/…/HeiTuva.dc.html`.

| | statutory | customer |
|---|---|---|
| **v2 bundle, whole** | 161 | **213** |
| **built product, in-app entry screens** | **7** | **0** |

**The drawing is customer-first — 1.32 customer references for every statutory
one — and the build inverted it on the screens that matter.**

This is the divergence the instruction asked for, and it falls on one side: the
drawing intended a survey product with statutory capability, and nobody
revisited whether the build still read that way. Even the bundle's own `hr`
entry is drawn employee-experience-first, with the law as a trailing clause:

> `{ key:"hr", label:"HR og arbeidsmiljø", desc:"Puls, medarbeiderundersøkelse,
> onboarding, exit — og de lovpålagte kartleggingene." }`

«— og de lovpålagte kartleggingene» is an *and also*. The build kept the order
and dropped the framing.

**One thing the drawing does NOT excuse:** `USE_CASES[0]` is `hr` in the bundle
too, so the leading position is faithful. The wizard's *pre-selection* is not
drawn at all — `useCases[0]` is the build's own choice, made by not making one.
