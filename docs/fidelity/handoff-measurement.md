# HeiTuva — complete measurement of the handoff design

Every number below carries the derivation. Re-run them; do not trust them because they are written down.

```bash
B='heituva-as/project/HeiTuva.dc.html'
md5sum $B                                        # b4e430eccd9cfac0105b8089b6ef206f
wc -l $B                                         # 11050
grep -oE '\bst\.screen *[=!]== *"[A-Za-z0-9_-]+"' $B | grep -oE '"[^"]+"' | sort -u | wc -l   # 16
```

Markup region 26–6181 (md5 `6efa903fcc59904c7e715ef1af04cbf9`); logic region 6182–11050.
**This measures the design only.** The extractor has never seen the repository.

---

## 1. Surface area

| | |
|---|---|
| screens | 16 |
| elements (markup, gate-attributed) | 3423 |
| controls | 570 |
| headings (≥17px or `--fd`) | 137 |
| repeaters (`sc-for`) | 301 |
| literal text nodes | 693 |
| render-prop keys | ~1100 |
| distinct geometry constants | 120 |

### Per screen

| screen | controls | headings | repeaters | text nodes | nested gates |
|---|---|---|---|---|---|
| `dash` | 11 | 11 | 11 | 29 | 12 |
| `dashboard` | 55 | 10 | 30 | 55 | 36 |
| `reports` | 63 | 7 | 25 | 57 | 23 |
| `results` | 11 | 8 | 17 | 25 | 12 |
| `surveys` | 18 | 2 | 3 | 23 | 7 |
| `svdetail` | 21 | 36 | 44 | 121 | 41 |
| `build` | 106 | 7 | 35 | 80 | 54 |
| `send` | 58 | 10 | 12 | 63 | 23 |
| `library` | 24 | 6 | 13 | 24 | 13 |
| `packdetail` | 3 | 2 | 3 | 9 | 3 |
| `tasks` | 33 | 3 | 14 | 25 | 15 |
| `admin` | 48 | 17 | 37 | 89 | 17 |
| `profile` | 6 | 4 | 4 | 9 | 2 |
| `help` | 12 | 4 | 10 | 18 | 8 |
| `respond` | 47 | 3 | 17 | 22 | 47 |
| `livestage` | 2 | 2 | 7 | 9 | 3 |
| `_shell` | 52 | 5 | 19 | 35 | 26 |
| **total** | **570** | **137** | **301** | **693** | |

`_shell` is nav, subnav, wizard and modals — outside every screen gate, rendered on all 16.

---

## 2. Undersøkelser — the navigation tree

`svdetail` is the heaviest screen in the design: 598 elements, 41 nested gates, 44 repeaters.
Seven tabs, each with its own subtab row:

| tab | subtabs | count |
|---|---|---|
| `over` | Sammendrag · Innhold | 2 |
| `sporsmal` | Alle spørsmål · Skala · Fritekst | 3 |
| `resultat` | Matrise · Per spørsmål · Sammenligning · Frisvar | 4 |
| `malgruppe` | Grupper · Segmenter · Levering | 3 |
| `utsending` | Invitasjon · Bølger · Leveranse · Kanaler · Påminnelser · Gjentakelse · Oppsett | 7 |
| `kommentarer` | Alle · Venter svar · Besvart | 3 |
| `tiltak` | Åpne · Alle · Med hjemmel | 3 |
| **total** | | **25** |

**Seven of those 25 subtabs are surfaces § 4 refuses.** They are drawn as tabs; we do not render them
as tabs. This is where the refusals concentrate, and it is the single densest collision in the design:

| subtab | tab | why refused |
|---|---|---|
| Matrise | `resultat` | data does not exist (refuseMatrise) |
| Sammenligning | `resultat` | product decision (deferSammenlign) |
| Frisvar | `resultat` | lives inside the question card (refuseFrisvar) |
| Segmenter | `malgruppe` | invariant — k does not compose |
| Levering | `malgruppe` | data does not exist (refuseLevering) |
| Bølger | `utsending` | product decision (deferBolger) |
| Leveranse | `utsending` | product decision — facts about our sending domain |

### Question types — 13, matching the product claim

| key | label |
|---|---|
| `scale` | Skala |
| `likert` | Enig–uenig |
| `enps` | eNPS 0–10 |
| `matrix` | Matrise |
| `ranking` | Rangering |
| `smiley` | Stemning |
| `choice` | Flervalg |
| `dropdown` | Nedtrekksliste |
| `slider` | Skyvebryter |
| `image` | Bildevalg |
| `field` | Skjemafelt |
| `yesno` | Ja / nei |
| `text` | Fritekst |

Four of these — `matrix`, `ranking`, `slider`, `smiley` — are on `heituva-ui-spec.md` § C3's
refuse-to-build list, and `refuseMatrise` already refuses one of them. `enps` is the type whose
absence grounded the nps refusal (Q126).

### Template packs — 23

| category | count |
|---|---|
| Lovpålagt | 6 |
| Ansatte | 5 |
| Kunder | 4 |
| Intern | 3 |
| Medlem | 2 |
| Offentlig | 2 |
| Annet | 1 |

Legally-grounded packs carry their own locked policy:

| pack | law |
|---|---|
| Arbeidsmiljø | Arbeidsmiljøloven § 4-3 |
| Psykososial kartlegging | Arbeidsmiljøloven § 4-3 (fra 1.1.2026) |
| Trakassering og ytringsklima | Likestillingsloven ARP · aml. kap. 2A |
| Likestilling og ufrivillig deltid | ARP — kartlegges annethvert år |
| Leverandør — åpenhetsloven | Åpenhetsloven §§ 4–5 · frist 30. juni |
| Klima og miljø | Bærekraftsrapportering · ESG |

---

## 3. Dashboard / innsikt / rapporter

### The four archetypes (Q17 Del B, realised)

| key | label | the reader's question |
|---|---|---|
| `agg` | Aggregat over personer | «Hvordan står det til, og hvor er det verst?» |
| `reg` | Register per respondent | «Hvem har svart hva, og hvem mangler?» |
| `duty` | Pliktstatus over tid | «Hva må gjøres, av hvem, innen når?» |
| `stream` | Hendelsesstrøm | «Hvordan utvikler dette seg akkurat nå?» |

### Panel library — 7 panels

| key | archetype |
|---|---|
| `trend` | `agg` |
| `heatmap` | `agg` |
| `drivers` | `agg` |
| `themes` | `agg` |
| `register` | `reg` |
| `duties` | `duty` |
| `stream` | `stream` |

### Dashboard presets — 6

| preset | panels |
|---|---|
| Arbeidsmiljø | trend,heatmap,drivers,themes,duties |
| Kundeopplevelse | stream,themes,drivers |
| Intern tjenestekvalitet | stream,drivers,themes |
| Leverandøroppfølging | register,duties |
| Offentlig sektor | trend,drivers,themes |
| Medlem og frivillig | trend,themes,stream |

### Report sections — 10

| key | label |
|---|---|
| `summary` | Sammendrag |
| `trend` | Utvikling over tid |
| `heatmap` | Heatmap team × spørsmål |
| `drivers` | Høyest og lavest |
| `teams` | Resultat per team |
| `themes` | Temaer i frisvarene |
| `quotes` | Utvalgte sitater |
| `actions` | Tiltak og ansvarlig |
| `participation` | Deltakelse og svarprosent |
| `method` | Metode og spørsmål |

`quotes` («Utvalgte sitater») is an admin-facing report section and is **not** the same surface as
§ 4's refused **Sitat**, which is a respondent's free text rendered back to a respondent. They must
not be conflated in either direction — but which one the implementation built is not measurable here.

### Standard reports — 5

| tag | title |
|---|---|
| Ledelse | Ledergruppe — sammendrag |
| Team | Teamrapport |
| Trend | Utvikling over året |
| Kvalitativ | Frisvar og temaer |
| Styret | Styresak — arbeidsmiljø |

### Duty engine — 4 duties


- Åpenhetsloven §§ 4–5
- Arbeidsmiljøloven § 4-3 · internkontroll
- Likestillings- og diskrimineringsloven § 26
- Aml. kap. 2A · ARP

---

## 4. The policy model — where the threshold lives

```js
const DEFAULT_POLICY = { kind:"person", anon:"anonymous", threshold:5, locked:false, legal:"" };
```

Threshold picker values: **3, 4, 5, 8, 10**, default 5, labelled «Anbefalt: 5».
`NUMWORD` spells 3, 4, 5, 8 and 10 in **two languages**.

### Respondent banner — 5 variants, not 4

Q17 § 4 specifies four. The bundle carries five: `anon(n)`, `low` (appended below standard),
`named`, `org(o)`, and **`choose(n)`** for «Valgfritt», which the brief mentions but does not
tabulate. All five are generated from the threshold, never fixed strings.

### Two languages

`BANNER` carries `no` and **`sv`** (Swedish). `langOptions` and `langCodes` are present.
This is scope no section of ONBOARDING mentions, and `verify:i18n` defines «Norwegian» as the `no`
message set — an enumeration standing in for a language (§ 6). A Swedish respondent banner is
invisible to that gate by construction.

---

## 5. Geometry

120 distinct constants across the markup. Most frequent:

| value | uses |
|---|---|
| `1px` | 738 |
| `12px` | 643 |
| `10px` | 579 |
| `14px` | 522 |
| `11px` | 432 |
| `13px` | 415 |
| `12.5px` | 396 |
| `16px` | 336 |
| `999px` | 322 |
| `18px` | 285 |
| `8px` | 257 |
| `22px` | 256 |
| `9px` | 255 |
| `20px` | 194 |
| `11.5px` | 144 |
| `6px` | 140 |
| `7px` | 131 |
| `4px` | 122 |
| `3px` | 120 |
| `2px` | 108 |
| `15px` | 108 |
| `13.5px` | 108 |
| `5px` | 96 |
| `24px` | 89 |

Per-screen distributions are in `DESIGN-INVENTORY.md`; every element carries its source line in
`elements.json`. This is the layer where § 7.2 lives — a constant that is right on a 40px chip and
wrong on a 30px one — and it is why the geometry diff has to be a join on values, not a picture.

---

## 6. Surface 2 — the Tuva character sheet

527 lines, 0 controls, 2 data gates. Not a screen. 101 avatar parts, 56 line-art faces, 8 ESM
components, 8 expressions, 12 named colleagues, 10 specified placements, 6 declared sizes with a
hard floor at 32px for expressive use. Full table in the addendum.

---

## 7. What this measurement cannot establish

- **Anything about the implementation.** No repository access.
- **What changed against v7.** The v7 bundle is in the repo; the diff is Claude Code's to run.
- **Which of the 16 screens is the addition.** Needs the v7 screen list.
- **Whether the drawn refusals are still refused in the product** — that is `ui_messages`, not here.
- **Controls inside `sc-for` bodies are counted once**, as the design writes them; the rendered count
  is the row count times the body, which is a property of the data, not the drawing.
