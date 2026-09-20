# HeiTuva — design-side inventory, at control grain

Extracted from the markup region (lines 26–6181, md5 `6efa903fcc59904c7e715ef1af04cbf9`) of `HeiTuva.dc.html`. That region is byte-identical in the handoff zip and the loose upload; see the addendum.

**HOW THAT HASH IS SERIALISED, because R0 got it wrong in both directions.** The region is hashed WITHOUT a trailing newline. `sed -n '26,6181p' | md5sum` appends one and yields `aa5557057e7f669554ac2b8819c1d43e`; `sed -n '26,6181p' | head -c -1 | md5sum` yields the `6efa903f…` above. Same bytes, two serialisations. R0 read the mismatch as «this inventory describes a different bundle» and was wrong — the markup region IS v8's.

| | value |
|---|---|
| md5 | `b4e430eccd9cfac0105b8089b6ef206f` (v8) |
| lines | 11050 |
| earlier serialisation | `c0e3fbdc7c7f2d3ff379e93ea3caa2a6`, 11049 lines — the loose upload; differs from v8 in three hunks, all in the LOGIC region (7943, 9399, 10389), so the markup this file describes is unaffected |
| markup region | 26–6181 |
| logic region | 6182–11049 |
| screens | 16 |
| elements attributed | 3423 |
| controls | 570 |
| headings (≥17px or `--fd`) | 137 |
| repeaters (`sc-for`) | 301 |
| distinct px constants | 120 |

**This is the left column of the deviation matrix only.** Nothing here is a statement about the
implementation; the extractor has never seen the repository.

**Scope note carried from ONBOARDING §3.** STATE.md works at the grain of a section heading; this
file works at the grain of a control, which is the layer §9 lists as *not covered*. A chip, a select,
a sort order and a repeater each appear below with their source line.

---

## Dash — insight landing

Gate: `sc-if value="{{ isDash }}"`  ·  11 controls · 11 headings · 11 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 288 | 28px | 500 |
| 323 | 23px | 500 |
| 326 | 56px | 500 |
| 339 | 23px | 500 |
| 360 | 30px | 500 |
| 369 | 23px | 500 |
| 388 | 23px | 500 |
| 406 | 23px | 500 |
| 412 | 34px | 600 |
| 442 | 25px | 500 |
| 491 | 22px | 500 |

### Literal copy in the drawing

- `292` Ny undersøkelse
- `313` Ingen moduler er valgt
- `314` Slå på minst én modul i raden over, eller bytt til en ferdig arbeidsflate i toppmenyen.
- `315` Sett tilbake standard
- `323` NPS i dag
- `339` Kritikere uten svar
- `340` Svar innen 24 timer
- `346` «{{ c.text }}»
- `349` Svar kunden
- `359` Quiz og arrangement
- `360` Start en quiz nå
- `361` Fire alternativer med farge og ikon, nedtelling og resultattavle på storskjerm. Deltakerne bruker mobilen, uten app.
- `363` Ny quiz
- `364` Bruk en mal
- `369` Siste resultattavler
- `388` Sløyfen lukket
- `389` Det folk faktisk merker — den sterkeste grunnen til å svare neste gang.
- `398` Du har lukket sløyfen på {{ managerGrade }} undersøkelser
- `399` Legg til tiltak
- `406` Svaraktivitet
- `411` Svar denne uken
- `415` Svarprosent
- `442` Krever handling
- `443` Oppdatert nå
- `461` Kom i gang
- `488` Lovpålagte frister
- `489` Se alle →
- `497` nå
- `497` 12 mnd

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 304 | `customMods` | `m` | 4 |
| 329 | `npsBars` | `b` | 3 |
| 342 | `critics` | `c` | 3 |
| 370 | `quizRecent` | `q` | 2 |
| 390 | `loopActions` | `l` | 2 |
| 420 | `dayBars` | `b` | 7 |
| 427 | `streakDots` | `d` | 8 |
| 446 | `actionItems` | `a` | 3 |
| 470 | `onboardSteps` | `o` | 4 |
| 493 | `complianceTimeline` | `c` | 4 |
| 499 | `complianceTimeline` | `c` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 292 | button | — | `onOpenWizard` | — |
| 305 | button | — | `m.onClick` | — |
| 315 | button | — | `onWsReset` | — |
| 349 | button | — | `c.onClick` | — |
| 363 | button | — | `onOpenWizard` | — |
| 364 | button | — | `goLibrary` | — |
| 399 | button | — | `onAddLoop` | — |
| 453 | button | — | `a.onClick` | — |
| 466 | button | — | `onDismissOnboard` | Skjul kom i gang |
| 477 | button | — | `o.onClick` | — |
| 486 | button | — | `goCompliance` | — |

### Geometry constants used on this screen

`13px×22`, `18px×21`, `10px×20`, `12px×19`, `1px×18`, `14px×16`, `999px×14`, `16px×12`, `26px×10`, `11px×10`, `12.5px×9`, `9px×9`, `24px×8`, `15px×7`, `2px×7`, `3px×6`, `6px×6`, `8px×6`, `20px×5`, `23px×5`, `28px×4`, `5px×4`, `38px×4`, `22px×4`, `11.5px×3`, `4px×3`

Radii: `999px` ×14, `18px` ×9, `10px` ×6, `12px` ×6, `14px` ×2, `3px` ×1, `6px 6px 0 0` ×1

Literal hex on this screen: `#5F5849`×18, `#E8DFC9`×16, `#191510`×10, `#FFFDF6`×10, `#F5C64A`×6, `#A8D5D2`×4, `#FBD5C4`×1, `#FBEBBE`×1, `#FCF6E9`×1

---

## Dashboard

Gate: `sc-if value="{{ isDashboard }}"`  ·  55 controls · 10 headings · 30 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 2406 | 27px | 500 |
| 2437 | 22px | 600 |
| 2546 | 23px | 500 |
| 2559 | 19px | 500 |
| 2581 | 20px | 500 |
| 2608 | 34px | 600 |
| 2706 | 19px | - |
| 2719 | 21px | 700 |
| 2813 | 26px | 700 |
| 2842 | 26px | 700 |

### Literal copy in the drawing

- `2402` Lagre
- `2413` Gi nytt navn
- `2414` Dupliser
- `2423` Eier
- `2425` TB
- `2428` Utvalg
- `2429` Personvern
- `2429` Gjelder alle paneler
- `2430` Delt med
- `2431` Rapporter
- `2431` frosset herfra
- `2450` Tilpass dashboardet
- `2461` Undersøkelser i utvalget
- `2473` Periode
- `2475` Siste runde
- `2476` Siste to runder
- `2477` Alle runder
- `2481` Gruppe
- `2483` Alle grupper
- `2484` Produktteamet
- `2485` Design
- `2486` Utvikling
- `2487` Ledelse
- `2495` Gruppert etter spørsmålet leseren stiller. Flytt, endre bredde og fjern direkte på kortene.
- `2500` «{{ g.question }}»
- `2523` Lagre dette som eget oppsett
- `2526` Lagre
- `2528` Oppsettet dukker opp blant valgene når dashboardet åpnes neste gang.
- `2531` Bytt oppsett
- `2537` Start på nytt fra oppsettvalget
- `2546` Velg et oppsett å starte fra
- `2547` Et oppsett er et forhåndsvalg av paneler — på samme måte som en mal er et forhåndsvalg av spørsmål. Du kan legge til og fjerne paneler etterpå.
- `2570` Bruk oppsett
- `2581` Del «{{ dashTitle }}»
- `2582` Terskelen følger med · {{ dashThresholdLine }}
- `2598` Kopier lenke
- `2628` Velg nøkkeltall
- `2640` Nøkkeltall
- `2643` Tilpass
- `2652` Paneler
- `2668` Legg til panel
- `2673` Velg panelet som skal inn i den tomme plassen — det settes inn der du klikket.
- `2674` Avbryt
- `2680` Dra panelene for å bytte plass. ⅓ ½ ⅔ 1/1 setter bredden, Lav · Normal · Høy setter høyden, «Ny rad» tvinger panelet først i en rad — og du kan klikke i en tom plass for å sette inn et panel der.
- `2688` Velg panel til denne plassen
- `2689` Avbryt
- `2692` Alle tilgjengelige paneler ligger allerede på flaten.
- `2736` Data
- `2753` Datakilde
- `2759` Periode
- `2765` Gruppe
- `2818` Åpne leverandøroversikten →
- `2850` 5,0
- `2851` 3,0
- `2862` i dag

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 2435 | `insStats` | `cs` | 4 |
| 2452 | `customizeTabs` | `t` | 3 |
| 2463 | `repSurveyChips` | `c` | 3 |
| 2497 | `dashPickerGroups` | `g` | 4 |
| 2502 | `g.items` | `i` | 2 |
| 2533 | `presetChips` | `p` | 6 |
| 2549 | `dashPresets` | `p` | 6 |
| 2566 | `p.panels` | `x` | 3 |
| 2585 | `dashShareRoles` | `r` | 3 |
| 2604 | `dashStats` | `c` | 4 |
| 2630 | `dashKpiChips` | `kp` | 7 |
| 2661 | `dashColChips` | `cc` | 2 |
| 2684 | `dashCells` | `pn` | 4 |
| 2695 | `pn.chooserItems` | `ci` | 3 |
| 2727 | `pn.sizeChips` | `sz` | 4 |
| 2732 | `pn.hChips` | `hc` | 3 |
| 2755 | `pn.srcOptions` | `so` | 3 |
| 2761 | `pn.perOptions` | `po` | 4 |
| 2767 | `pn.grpOptions` | `go` | 3 |
| 2774 | `pn.bars` | `b` | 4 |
| 2786 | `pn.cols` | `c` | 5 |
| 2791 | `pn.rows` | `r` | 4 |
| 2794 | `r.cells` | `c` | 5 |
| 2804 | `pn.lines` | `l` | 3 |
| 2811 | `pn.regStats` | `s` | 3 |
| 2822 | `pn.duties` | `d` | 4 |
| 2837 | `pn.wins` | `w` | 3 |
| 2852 | `pn.volBars` | `v` | 30 |
| 2855 | `pn.segments` | `sg` | 1 |
| 2858 | `pn.gaps` | `g` | 2 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 2401 | input | — | `onDashRenameChange` | Navn på dashbordet |
| 2402 | button | — | `onDashRenameSave` | — |
| 2412 | button | — | `onDashShare` | — |
| 2413 | button | — | `onDashRenameStart` | — |
| 2414 | button | — | `onDashDuplicate` | — |
| 2416 | button | — | `onDashDelete` | Slett dashbordet |
| 2418 | button | — | `onFreeze` | Lager en datert rapport av panelene på skjermen |
| 2453 | button | — | `t.onClick` | — |
| 2464 | button | — | `c.onToggle` | — |
| 2474 | select | — | `onRepPeriod` | — |
| 2475 | option | — | `—` | — |
| 2476 | option | — | `—` | — |
| 2477 | option | — | `—` | — |
| 2482 | select | — | `onRepGroup` | — |
| 2483 | option | — | `—` | — |
| 2484 | option | — | `—` | — |
| 2485 | option | — | `—` | — |
| 2486 | option | — | `—` | — |
| 2487 | option | — | `—` | — |
| 2511 | button | — | `i.onAdd` | — |
| 2525 | input | — | `onPresetDraft` | — |
| 2526 | button | — | `onSavePreset` | — |
| 2534 | button | — | `p.onPick` | — |
| 2537 | button | — | `onResetDash` | — |
| 2561 | button | — | `p.onDelete` | Slett oppsett |
| 2570 | button | — | `p.onPick` | — |
| 2586 | button | — | `r.onPick` | — |
| 2598 | button | — | `onDashShareCopy` | — |
| 2631 | button | — | `kp.onClick` | — |
| 2642 | button | — | `onToggleCustomize` | — |
| 2645 | button | — | `onToggleCustomize` | — |
| 2655 | button | — | `onDashEdit` | — |
| 2662 | button | — | `cc.onClick` | — |
| 2665 | button | — | `onDashReset` | — |
| 2668 | button | — | `onToggleCustomize` | — |
| 2674 | button | — | `onDashAddCancel` | — |
| 2689 | button | — | `pn.onChooserCancel` | — |
| 2696 | button | — | `ci.onAdd` | — |
| 2705 | button | — | `pn.onSlot` | — |
| 2728 | button | — | `sz.onClick` | Bredde {{ sz.label }} |
| 2733 | button | — | `hc.onClick` | — |
| 2736 | button | — | `pn.onScope` | Velg datakilde, periode og gruppe |
| 2737 | button | — | `pn.onBr` | Legg panelet først i en ny rad |
| 2738 | button | — | `pn.onUp` | Flytt opp |
| 2739 | button | — | `pn.onDown` | Flytt ned |
| 2743 | button | — | `pn.onPin` | — |
| 2746 | button | — | `pn.onRemove` | Fjern panel |
| 2754 | select | — | `pn.onSrc` | — |
| 2755 | option | — | `—` | — |
| 2760 | select | — | `pn.onPer` | — |
| 2761 | option | — | `—` | — |
| 2766 | select | — | `pn.onGrp` | — |
| 2767 | option | — | `—` | — |
| 2818 | button | — | `pn.onOpenRegister` | — |
| 2838 | button | — | `w.onClick` | — |

### Geometry constants used on this screen

`1px×53`, `12px×52`, `10px×45`, `12.5px×39`, `14px×36`, `11px×33`, `8px×31`, `13px×27`, `999px×26`, `16px×21`, `22px×13`, `9px×13`, `2px×12`, `34px×12`, `6px×11`, `26px×10`, `20px×10`, `3px×10`, `4px×9`, `5px×9`, `30px×9`, `18px×8`, `11.5px×8`, `7px×7`, `36px×6`, `15px×6`

Radii: `999px` ×26, `10px` ×21, `9px` ×6, `11px` ×4, `12px` ×4, `18px` ×3, `var(--r,16px)` ×3, `20px` ×2

Literal hex on this screen: `#5F5849`×54, `#E8DFC9`×41, `#191510`×41, `#FFFDF6`×17, `#FCF6E9`×9, `#FBEBBE`×4, `#A8D5D2`×2, `#F5C64A`×2, `#FBD5C4`×1, `#6F6759`×1

---

## Reports

Gate: `sc-if value="{{ isReports }}"`  ·  63 controls · 7 headings · 25 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 2879 | 32px | 600 |
| 2885 | 21px | 500 |
| 2927 | 21px | 500 |
| 3046 | 21px | 500 |
| 3067 | 22px | 500 |
| 3097 | 19px | 500 |
| 3143 | 23px | 500 |

### Literal copy in the drawing

- `2879` Innsikt
- `2885` På tvers
- `2886` ＋ Ny rapport
- `2901` Innsikt
- `2905` ← Tilbake til rapporter
- `2948` Undersøkelser knyttet til plikten
- `2970` Ansvarlig
- `2974` Rytme
- `2976` Hvert halvår
- `2977` Årlig
- `2978` Annethvert år
- `2982` Varsel før
- `2984` 2 uker før frist
- `2985` 4 uker før frist
- `2986` 8 uker før frist
- `2990` Publiser rapporten offentlig
- `2998` Signering
- `3011` Arkiv
- `3054` Bruk mal
- `3055` PDF
- `3067` Rapporter
- `3084` Nullstill
- `3085` Ny rapport
- `3101` Åpne
- `3102` PDF
- `3121` PDF
- `3122` Åpne
- `3147` Utkast
- `3152` Velg minst én seksjon under Innhold for å bygge rapporten.
- `3162` Alle grupper
- `3163` Produktteamet
- `3164` Design
- `3165` Utvikling
- `3166` Ledelse
- `3238` Åpne dashbordet
- `3244` Bygget fra «{{ draftReportBase }}». Slå seksjoner av og på — dokumentet oppdateres med en gang.
- `3258` Velg sitater
- `3275` Periode
- `3277` Siste runde
- `3278` Siste to runder
- `3279` Alle runder
- `3283` Gruppe
- `3285` Alle grupper
- `3286` Produktteamet
- `3287` Design
- `3288` Utvikling
- `3289` Ledelse
- `3293` Undersøkelser
- `3306` Grupper under virksomhetens terskel vises aldri nedbrutt, uavhengig av filter.
- `3312` Hvem skal se den
- `3320` Kopier lenke
- `3322` PDF
- `3323` PowerPoint
- `3325` Ledere som får lenken ser bare sitt eget team. Alle ansatte ser samlet uten nedbryting.
- `3327` Planlagt utsending
- `3334` Planlegg utsending
- `3340` Lagre rapport

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 2889 | `insStats` | `cs` | 4 |
| 2923 | `duties` | `d` | 4 |
| 2939 | `d.checks` | `c` | 4 |
| 2951 | `d.linked` | `l` | 1 |
| 2999 | `d.signers` | `sg` | 2 |
| 3012 | `d.versions` | `v` | 2 |
| 3034 | `standardReports` | `r` | 5 |
| 3038 | `r.thumb` | `th` | 3 |
| 3049 | `r.sections` | `sx` | 3 |
| 3069 | `repKindChips` | `c` | 3 |
| 3076 | `repViewChips` | `v` | 2 |
| 3091 | `reportRows` | `r` | 4 |
| 3111 | `reportRows` | `r` | 4 |
| 3155 | `docSections` | `sx` | 4 |
| 3177 | `sx.lines` | `l` | 2 |
| 3185 | `sx.bars` | `b` | 4 |
| 3198 | `sx.cols` | `c` | 5 |
| 3203 | `sx.rows` | `r` | 4 |
| 3206 | `r.cells` | `c` | 5 |
| 3226 | `sideTabs` | `t` | 3 |
| 3246 | `reportSections` | `sx` | 6 |
| 3260 | `quotePicks` | `q` | 3 |
| 3295 | `repSurveyChips` | `c` | 2 |
| 3313 | `shareRoles` | `r` | 3 |
| 3329 | `scheduleOptions` | `o` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 2886 | button | — | `onNewReport` | — |
| 2905 | button | — | `onCloseEditor` | — |
| 2940 | button | — | `c.onToggle` | — |
| 2958 | button | — | `l.onOpen` | — |
| 2966 | button | — | `d.onToggleSettings` | — |
| 2971 | input | — | `d.onOwner` | — |
| 2975 | select | — | `d.onInterval` | — |
| 2976 | option | — | `—` | — |
| 2977 | option | — | `—` | — |
| 2978 | option | — | `—` | — |
| 2983 | select | — | `d.onReminderWeeks` | — |
| 2984 | option | — | `—` | — |
| 2985 | option | — | `—` | — |
| 2986 | option | — | `—` | — |
| 2991 | button | — | `d.onPublish` | Publiser rapporten offentlig |
| 3000 | button | — | `sg.onToggle` | — |
| 3023 | button | — | `d.onPrimary` | — |
| 3054 | button | — | `r.onUse` | — |
| 3055 | button | — | `r.onExport` | — |
| 3070 | button | — | `c.onClick` | — |
| 3077 | button | — | `v.onClick` | — |
| 3082 | input | — | `onRepQuery` | Søk i rapporter |
| 3084 | button | — | `onRepReset` | — |
| 3085 | button | — | `onNewReport` | — |
| 3101 | button | — | `r.onOpen` | — |
| 3102 | button | — | `r.onExport` | — |
| 3120 | button | — | `r.onShare` | — |
| 3121 | button | — | `r.onExport` | — |
| 3122 | button | — | `r.onOpen` | — |
| 3123 | button | — | `r.onDelete` | Slett rapport |
| 3143 | input | — | `onDraftTitle` | — |
| 3161 | select | — | `sx.onSecGroup` | Gruppe for seksjonen |
| 3162 | option | — | `—` | — |
| 3163 | option | — | `—` | — |
| 3164 | option | — | `—` | — |
| 3165 | option | — | `—` | — |
| 3166 | option | — | `—` | — |
| 3169 | button | — | `sx.onUp` | Flytt opp |
| 3170 | button | — | `sx.onDown` | Flytt ned |
| 3171 | button | — | `sx.onRemove` | Fjern seksjon |
| 3227 | button | — | `t.onClick` | — |
| 3238 | button | — | `onFrozenOpen` | — |
| 3247 | button | — | `sx.onToggle` | — |
| 3261 | button | — | `q.onToggle` | — |
| 3276 | select | — | `onRepPeriod` | — |
| 3277 | option | — | `—` | — |
| 3278 | option | — | `—` | — |
| 3279 | option | — | `—` | — |
| 3284 | select | — | `onRepGroup` | — |
| 3285 | option | — | `—` | — |
| 3286 | option | — | `—` | — |
| 3287 | option | — | `—` | — |
| 3288 | option | — | `—` | — |
| 3289 | option | — | `—` | — |
| 3296 | button | — | `c.onToggle` | — |
| 3314 | button | — | `r.onPick` | — |
| 3320 | button | — | `onShareReport` | — |
| 3322 | button | — | `onExportReport` | — |
| 3323 | button | — | `onExportReport` | — |
| 3328 | select | — | `onSchedule` | — |
| 3330 | option | — | `—` | — |
| 3334 | button | — | `onPlanSchedule` | — |
| 3340 | button | — | `onSaveReport` | — |

### Geometry constants used on this screen

`1px×61`, `12px×50`, `10px×48`, `11px×43`, `12.5px×37`, `14px×29`, `8px×28`, `13px×25`, `9px×25`, `18px×21`, `16px×20`, `999px×16`, `6px×16`, `20px×14`, `7px×14`, `11.5px×13`, `5px×11`, `26px×10`, `22px×9`, `3px×8`, `4px×7`, `2px×6`, `15px×5`, `36px×5`, `38px×5`, `24px×4`

Radii: `10px` ×24, `999px` ×16, `9px` ×10, `7px` ×6, `18px` ×5, `11px` ×5, `16px` ×5, `8px` ×4

Literal hex on this screen: `#5F5849`×54, `#E8DFC9`×51, `#191510`×34, `#FFFDF6`×18, `#FCF6E9`×10, `#F5C64A`×5, `#A8D5D2`×4, `#FFF`×1, `#FBEBBE`×1

---

## Results (no subnav)

Gate: `sc-if value="{{ isResults }}"`  ·  11 controls · 8 headings · 17 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 5812 | 22px | 500 |
| 5831 | 35px | 700 |
| 5840 | 23px | 700 |
| 5918 | 30px | 500 |
| 5946 | 23px | 700 |
| 5977 | 23px | 700 |
| 6009 | 40px | 500 |
| 6013 | 22px | 600 |

### Literal copy in the drawing

- `5812` Resultater
- `5821` Rediger
- `5840` Svar per virksomhet
- `5852` Eksporter CSV
- `5856` Virksomhet
- `5857` Svardato
- `5858` Status
- `5887` Hver virksomhet er ett svar og leses enkeltvis. Ingen terskel — svarene er attribuert etter åpenhetsloven.
- `5894` Runde for runde
- `5907` Hver runde er sitt eget datasett. Runder under terskelen vises som — uten antall.
- `5938` “{{ t.body }}”
- `5938` — {{ t.who }}
- `5946` Hva svarene forteller
- `5951` Last ned rapport
- `5961` Neste steg: {{ i.action }}
- `5977` Mot bransjen
- `5991` bransje {{ r.bench }}
- `6006` Mot forrige runde
- `6010` denne runden
- `6014` forrige runde
- `6028` Temaer i frisvarene
- `6034` Temaene grupperes automatisk fra frisvarene. Klikk et tema for å filtrere sitatene — og del sammendraget med teamet.
- `6035` Del med teamet
- `6039` Legg til et svar
- `6040` Tilbake til oversikten

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 5817 | `surveyPicker` | `s` | 3 |
| 5828 | `resultStats` | `s` | 4 |
| 5845 | `attribFilters` | `f` | 4 |
| 5859 | `attribCols` | `c` | 3 |
| 5864 | `attribRows` | `r` | 6 |
| 5870 | `r.cells` | `c` | 3 |
| 5877 | `r.details` | `d` | 4 |
| 5898 | `roundStats` | `r` | 4 |
| 5910 | `resultBlocks` | `b` | 3 |
| 5924 | `b.bars` | `r` | 5 |
| 5937 | `b.texts` | `t` | 3 |
| 5956 | `insights` | `i` | 3 |
| 5969 | `reportLines` | `r` | 5 |
| 5979 | `benchIndustries` | `b` | 5 |
| 5985 | `benchRows` | `r` | 3 |
| 6019 | `teamScores` | `t` | 4 |
| 6030 | `textThemes` | `t` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 5816 | select | — | `onPickSurvey` | Bytt undersøkelse |
| 5818 | option | — | `—` | — |
| 5821 | button | — | `goBuild` | — |
| 5846 | button | — | `f.onClick` | — |
| 5852 | button | — | `onAttribExport` | — |
| 5866 | button | — | `r.onToggle` | — |
| 5951 | button | — | `onExportReport` | — |
| 5980 | button | — | `b.onClick` | — |
| 6035 | button | — | `onCopy` | — |
| 6039 | button | — | `goRespond` | — |
| 6040 | button | — | `goDash` | — |

### Geometry constants used on this screen

`13px×27`, `14px×26`, `10px×25`, `1px×21`, `999px×18`, `12px×17`, `16px×15`, `22px×15`, `8px×14`, `12.5px×13`, `18px×12`, `4px×8`, `3px×7`, `11px×5`, `7px×5`, `15px×4`, `15.5px×4`, `23px×3`, `11.5px×3`, `24px×3`, `5px×3`, `20px×2`, `9px×2`, `36px×2`, `19px×2`, `80px×2`

Radii: `999px` ×18, `10px` ×9, `var(--r,16px)` ×8, `8px` ×2, `20px` ×1, `0 0 19px 19px` ×1, `8px 8px 3px 3px` ×1, `13px` ×1

Literal hex on this screen: `#5F5849`×23, `#E8DFC9`×21, `#FFFDF6`×8, `#191510`×8, `#FCF6E9`×4, `#A8D5D2`×3, `#F5C64A`×3, `#6F6759`×1, `#FBEBBE`×1

---

## Surveys list

Gate: `sc-if value="{{ isSurveys }}"`  ·  18 controls · 2 headings · 3 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 2257 | 32px | 600 |
| 2263 | 21px | 500 |

### Literal copy in the drawing

- `2257` Undersøkelser
- `2259` Alle undersøkelser dere har laget — aktive, utkast og lukkede. Åpne én for å se detaljene, eller bygg en ny.
- `2263` På tvers
- `2293` Nyeste først
- `2294` Lavest svarprosent
- `2295` Tittel
- `2297` Ny undersøkelse
- `2309` Undersøkelse
- `2310` Status
- `2311` Svar
- `2312` Snitt
- `2313` Handling
- `2351` Eier
- `2352` Svar
- `2353` Status
- `2355` Gjentakelse
- `2358` Deling
- `2362` Åpne detaljsiden
- `2363` Del
- `2364` Lag kopi
- `2366` Lukk undersøkelsen
- `2378` Ingen undersøkelser passer filteret
- `2379` Nullstill søket eller velg et annet statusfilter.

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 2266 | `crossStats` | `cs` | 4 |
| 2302 | `svScopes` | `sc` | 5 |
| 2316 | `surveyList` | `r` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 2290 | input | — | `onSvQuery` | Søk i undersøkelser |
| 2292 | select | — | `onSvSort` | Sorter |
| 2293 | option | — | `—` | — |
| 2294 | option | — | `—` | — |
| 2295 | option | — | `—` | — |
| 2297 | button | — | `onNew` | — |
| 2303 | button | — | `sc.onClick` | — |
| 2319 | button | — | `r.onToggle` | — |
| 2333 | button | — | `r.onDetail` | Åpne detaljsiden |
| 2336 | button | — | `r.onBuild` | Bygg |
| 2339 | button | — | `r.onSend` | Send |
| 2342 | button | — | `r.onResults` | Resultater |
| 2345 | button | — | `r.onToggle` | (bound) |
| 2362 | button | — | `r.onDetail` | — |
| 2363 | button | — | `r.onShare` | — |
| 2364 | button | — | `r.onCopy` | — |
| 2366 | button | — | `r.onClose` | — |
| 2369 | button | — | `r.onPause` | — |

### Geometry constants used on this screen

`1px×18`, `11px×14`, `14px×11`, `12px×10`, `12.5px×10`, `30px×10`, `10px×9`, `999px×8`, `4px×8`, `22px×7`, `9px×7`, `13.5px×7`, `13px×6`, `18px×5`, `8px×5`, `7px×5`, `11.5px×5`, `34px×5`, `26px×4`, `16px×4`, `6px×4`, `20px×3`, `36px×3`, `5px×2`, `24px×2`, `220px×2`

Radii: `999px` ×8, `10px` ×8, `9px` ×5, `20px` ×2, `8px` ×1

Literal hex on this screen: `#5F5849`×22, `#E8DFC9`×17, `#191510`×13, `#FCF6E9`×4, `#F5C64A`×3, `#FFFDF6`×2, `#FBEBBE`×2

---

## Survey detail (isSvDetail — the nine-route shell)

Gate: `sc-if value="{{ isSvdetail }}"`  ·  21 controls · 36 headings · 44 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 1300 | 27px | 500 |
| 1332 | 26px | 600 |
| 1338 | 22px | 600 |
| 1348 | 28px | 600 |
| 1392 | 21px | 500 |
| 1453 | 21px | 500 |
| 1475 | 20px | 500 |
| 1506 | 21px | 500 |
| 1550 | 21px | 500 |
| 1561 | 26px | 600 |
| 1568 | 22px | 600 |
| 1608 | 21px | 500 |
| 1631 | 21px | 500 |
| 1654 | 20px | 500 |
| 1668 | 20px | 500 |
| 1690 | 21px | 500 |
| 1727 | 21px | 500 |
| 1788 | 21px | 500 |
| 1813 | 20px | 500 |
| 1830 | 20px | 500 |
| 1848 | 20px | 500 |
| 1870 | 21px | 500 |
| 1877 | 26px | 600 |
| 1887 | 21px | 500 |
| 1931 | 21px | 500 |
| 1987 | 21px | 500 |
| 2009 | 21px | 500 |
| 2028 | 21px | 500 |
| 2066 | 21px | 500 |
| 2085 | 21px | 500 |
| 2110 | 21px | 500 |
| 2136 | 21px | 500 |
| 2161 | 21px | 500 |
| 2192 | 21px | 500 |
| 2214 | 21px | 500 |
| 2230 | 21px | 500 |

### Literal copy in the drawing

- `1288` Undersøkelser
- `1308` Rediger
- `1309` Del
- `1315` Eier
- `1320` Målgruppe
- `1321` Periode
- `1322` Kanal
- `1323` Spørsmål
- `1324` Personvern
- `1324` Vises fra {{ sd.head.threshold }}
- `1325` Oppfølging
- `1327` Runder
- `1332` av {{ sd.head.invited }} har svart
- `1338` Snitt
- `1338` av 5,0
- `1355` Fordeling
- `1392` Innhold
- `1393` Spørsmålsområder med eier og godkjenner
- `1397` Spørsmålsområde
- `1398` Snitt
- `1399` Svarprosent
- `1400` Eier
- `1401` Godkjenner
- `1402` Vis
- `1453` Fremdrift per målgruppe
- `1454` Vises fra {{ sd.head.threshold }}
- `1475` Runder
- `1489` Tuva
- `1489` Om denne undersøkelsen
- `1493` Send påminnelse
- `1494` Lag tiltak av funnene
- `1506` Spørsmål
- `1509` Åpne byggeren
- `1515` Spørsmål
- `1516` Type
- `1517` Krav
- `1518` Tema
- `1519` Besvart
- `1520` Snitt
- `1550` Metodikksjekk
- `1551` Hvert spørsmål får maks tre merknader. Blokkeringer stopper utsending, advarsler kan overstyres med begrunnelse.
- `1567` Anslått lengde
- `1575` Ingen merknader
- `1576` Spørsmålene følger reglene for skalabruk, lengde og rekkefølge.
- `1590` Gjelder: {{ l.qText }}
- `1599` Overstyringer logges og følger med i metodikkrapporten sammen med instrument, spørsmålsliste, frekvens og terskel — det er dokumentasjonen Arbeidstilsynet ber om.
- `1608` Svarkurve mot bølgene
- `1609` Bare de som ikke har svart får påminnelse
- `1616` Kun de som ikke har svart (n={{ w.to }}) · {{ w.got }} svar kom inn
- `1631` Representativitet
- `1646` Avvik mot rammen i prosentpoeng
- `1654` Hvor vi mister folk
- `1655` Frafall per spørsmål, mens undersøkelsen står åpen
- `1668` Hvor lang tid de brukte
- `1690` Resultatmatrise
- `1691` Lag rapport
- `1695` Gruppe
- `1699` Svar
- `1713` Skala
- `1718` Grupper under {{ sd.head.threshold }} vises som punkt
- `1727` Sammenligning med tidligere runder
- `1750` Spørsmålsområde
- `1754` Endring
- `1788` Spørsmål for spørsmål
- `1813` Runde for runde
- `1823` Hver runde er sitt eget datasett. Runder under terskelen vises uten antall.
- `1830` Fordeling
- `1848` Det folk skriver
- `1853` «{{ c.text }}»
- `1870` Levering
- `1871` Fra invitasjon til ferdig svar
- `1887` Målgruppe
- `1892` Gruppe eller segment
- `1893` Type
- `1894` Kilde
- `1895` Inviterte
- `1896` Svar
- `1897` Andel
- `1898` Snitt
- `1931` Invitasjonen
- …and 41 more

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 1344 | `sd.kpis` | `k` | 4 |
| 1357 | `sd.mix` | `m` | 4 |
| 1362 | `sd.mix` | `m` | 4 |
| 1379 | `sd.subTabs` | `s3` | 3 |
| 1404 | `sd.areas` | `g` | 4 |
| 1429 | `g.kids` | `k` | 3 |
| 1456 | `sd.groups` | `g` | 5 |
| 1476 | `sd.rounds` | `r` | 4 |
| 1522 | `sd.qFiltered` | `q` | 6 |
| 1557 | `sd.lint.counts` | `c` | 4 |
| 1580 | `sd.lint.rows` | `l` | 4 |
| 1611 | `sd.field.waves` | `w` | 4 |
| 1635 | `sd.field.rep` | `r` | 5 |
| 1657 | `sd.field.breakoff` | `b` | 6 |
| 1670 | `sd.field.dur` | `d` | 5 |
| 1696 | `sd.themes` | `t` | 6 |
| 1701 | `sd.matrix` | `r` | 5 |
| 1704 | `r.cells` | `c` | 6 |
| 1714 | `sd.legend` | `l` | 4 |
| 1736 | `sd.compare.bars` | `b` | 4 |
| 1751 | `sd.compare.cols` | `c` | 4 |
| 1756 | `sd.compare.rows` | `r` | 4 |
| 1759 | `r.cells` | `c` | 4 |
| 1769 | `sd.compare.total.cells` | `c` | 4 |
| 1791 | `sd.questions` | `q` | 5 |
| 1816 | `sd.rounds` | `r` | 4 |
| 1834 | `sd.dist` | `d` | 5 |
| 1851 | `sd.comments` | `c` | 3 |
| 1874 | `sd.delivery` | `d` | 6 |
| 1900 | `sd.groupsFiltered` | `g` | 5 |
| 1953 | `sd.invitation.q1Options` | `o` | 5 |
| 1991 | `sd.field.waves` | `w` | 4 |
| 2013 | `sd.delivery2` | `d` | 6 |
| 2039 | `sd.recurRows` | `r` | 6 |
| 2050 | `sd.rounds` | `r` | 4 |
| 2070 | `sd.setupRows` | `r` | 6 |
| 2088 | `sd.channelRows` | `c` | 4 |
| 2099 | `sd.senderRows` | `s4` | 4 |
| 2111 | `sd.reminderRows` | `r` | 3 |
| 2139 | `sd.commentsFiltered` | `c` | 4 |
| 2172 | `sd.tasksFiltered` | `t` | 4 |
| 2196 | `sd.anonModes` | `m` | 3 |
| 2217 | `sd.privRows` | `p` | 6 |
| 2232 | `sd.log` | `l` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 1287 | button | — | `sd.onBack` | — |
| 1308 | button | — | `sd.onBuild` | — |
| 1309 | button | — | `sd.onShare` | — |
| 1310 | button | — | `sd.onPrimary` | — |
| 1380 | button | — | `s3.onClick` | — |
| 1493 | button | — | `sd.onSend` | — |
| 1494 | button | — | `sd.onTasks` | — |
| 1509 | button | — | `sd.onBuild` | — |
| 1593 | button | — | `l.onFix` | — |
| 1594 | button | — | `l.onDismiss` | — |
| 1647 | button | — | `sd.field.onUnderCta` | — |
| 1691 | button | — | `sd.onReport` | — |
| 1977 | button | — | `sd.onSend` | — |
| 2033 | button | — | `sd.onPauseRecur` | — |
| 2034 | button | — | `sd.onStopRecur` | — |
| 2067 | button | — | `sd.onBuild` | — |
| 2086 | button | — | `sd.onSend` | — |
| 2150 | button | — | `—` | — |
| 2151 | button | — | `—` | — |
| 2162 | button | — | `sd.onTasks` | — |
| 2197 | button | — | `m.onPick` | — |

### Geometry constants used on this screen

`1px×128`, `12px×104`, `22px×81`, `11px×81`, `12.5px×64`, `16px×64`, `20px×62`, `14px×57`, `999px×55`, `10px×53`, `18px×43`, `13px×38`, `11.5px×28`, `19px×26`, `9px×25`, `5px×25`, `8px×24`, `21px×23`, `3px×22`, `13.5px×22`, `6px×21`, `15px×17`, `2px×17`, `4px×16`, `26px×13`, `7px×13`

Radii: `999px` ×55, `20px` ×33, `10px` ×16, `0 0 19px 19px` ×13, `9px` ×6, `15px` ×4, `14px` ×4, `6px` ×4

Literal hex on this screen: `#5F5849`×153, `#E8DFC9`×129, `#FFFDF6`×41, `#FCF6E9`×25, `#191510`×23, `#F5C64A`×9, `#FBEBBE`×9, `#A8D5D2`×2, `#FBD5C4`×1

---

## Builder (/bygg)

Gate: `sc-if value="{{ isBuild }}"`  ·  106 controls · 7 headings · 35 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 548 | 22px | 500 |
| 594 | 18px | 700 |
| 761 | 17px | 600 |
| 946 | 22px | 500 |
| 1089 | 21px | 700 |
| 1094 | 24px | 600 |
| 1244 | 19px | 700 |

### Literal copy in the drawing

- `529` Fra banken
- `530` Lagre som mal
- `534` Lagre og lukk
- `541` Se metodikk
- `580` Målgruppe
- `581` Skjul ▴
- `597` Rediger ▾
- `615` Skala · tall
- `616` Skala · ord (enig–uenig)
- `617` Skala · ansikter
- `618` Skala · 0–10 (eNPS)
- `619` Skala · skyvebryter
- `622` Flervalg
- `623` Nedtrekksliste
- `624` Bildevalg
- `625` Ja / nei
- `626` Rangering
- `629` Matrise
- `632` Fritekst
- `633` Skjemafelt
- `646` Trinn
- `648` 1–3
- `648` 1–4
- `648` 1–5
- `648` 1–6
- `648` 1–7
- `648` 1–10
- `671` Skjemafelt samler navn eller e-post — det bryter anonymiteten i denne undersøkelsen. Bytt til «Med navn» under Send, eller fjern feltet.
- `684` Kommentar
- `686` Følger undersøkelsen
- `687` Alltid på
- `688` Av
- `712` + bildealternativ
- `718` Utsagn
- `726` + utsagn
- `738` + svaralternativ
- `817` Legg til innhold
- `833` Ingen innholdsblokker ennå. Blokken legges nederst i flyten, og du flytter den dit du vil med piltastene i listen.
- `840` Kjøremodus
- `841` Bestemmer hvilke spørsmålstyper og innstillinger du får.
- `855` Kommentar og samtale per spørsmål
- `856` Respondenten kan legge en kommentar på hvert spørsmål og starte en samtale. Lederen svarer uten å se hvem som skrev, hvis kommentaren er anonym. Alt samles under Oppgaver og tilbakemeldinger.
- `871` Byggemodus
- `883` Live-innstillinger
- `901` Quiz-innstillinger
- `918` Bestått-grense
- `922` Antall forsøk
- `936` Quizmodus: flervalg med inntil fire alternativer vises som store fargefelt med figurer. Flere enn fire blir en vanlig liste.
- `938` ＋ Fra spørsmålsbanken
- `946` Spørsmålsbanken
- `947` Legges rett inn i {{ draftTitle }} · {{ pickerCount }}
- `969` Legg til
- `977` Åpne biblioteket
- `978` Ferdig
- `1004` Hvem svarer og hva vises
- `1024` Hvem svarer
- `1033` Anonymitet
- `1045` Terskel for visning
- `1051` Anbefalt: 5
- `1061` Klar til utsending?
- `1071` Logikk
- `1075` HVIS
- `1081` Ingen regler ennå. Slå på «Oppfølging ved lav score» på et skalaspørsmål, eller legg til en regel.
- `1083` + Regel: lav score → oppfølging
- `1089` Engasjement og svarprosent
- `1090` Gjelder hele undersøkelsen
- `1095` forventet svar
- `1097` Vis / skjul
- `1104` Hvem svarer?
- `1115` Insentiv
- `1155` Kommentarfelt
- `1169` Takkemelding etter innsending
- `1182` Metodikk
- `1185` Maks tre merknader per spørsmål. Retteknappen endrer spørsmålet med én gang — advarsler kan overstyres, og overstyringen havner i metodikkrapporten.
- `1196` Anslått lengde {{ bLint.duration }}
- `1202` Ingen merknader
- `1203` Spørsmålene følger reglene for skala, lengde og rekkefølge.
- `1212` Spørsmål {{ l.num }}
- `1231` Slik ser {{ wsPersonDef }} det
- `1232` ▷ {{ testCta }}

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 552 | `buildTabs` | `b` | 2 |
| 559 | `bFlowChips` | `c` | 3 |
| 568 | `flowViewChips` | `v` | 2 |
| 605 | `builderQs` | `q` | 3 |
| 658 | `q.scaleLabels` | `l` | 5 |
| 665 | `q.flags` | `f` | 1 |
| 700 | `q.imageOpts` | `o` | 3 |
| 719 | `q.statements` | `stm` | 3 |
| 731 | `q.options` | `o` | 3 |
| 797 | `q.moveOptions` | `mo` | 4 |
| 820 | `contentTypes` | `ct` | 7 |
| 843 | `runModes` | `rm` | 3 |
| 858 | `feedbackModes` | `fm` | 4 |
| 874 | `modeChips` | `m` | 2 |
| 885 | `liveToggles` | `lt` | 10 |
| 906 | `quizToggles` | `qt` | 4 |
| 953 | `pickCats` | `c` | 6 |
| 960 | `pickerRows` | `b` | 6 |
| 984 | `typeGroups` | `g` | 4 |
| 988 | `g.items` | `i` | 4 |
| 1010 | `polWarnings` | `w` | 1 |
| 1026 | `polKinds` | `k` | 2 |
| 1035 | `polAnonChips` | `a` | 3 |
| 1047 | `polThresholds` | `n` | 5 |
| 1063 | `readyChecks` | `c` | 4 |
| 1073 | `logicRules` | `r` | 2 |
| 1106 | `audienceChips` | `a` | 2 |
| 1117 | `incentiveOptions` | `i` | 4 |
| 1140 | `engageToggles` | `t` | 6 |
| 1157 | `commentModes` | `c` | 3 |
| 1188 | `bLint.counts` | `c` | 4 |
| 1208 | `bLint.rows` | `l` | 3 |
| 1248 | `quizPreview.chips` | `qc` | 3 |
| 1253 | `previewQs` | `p` | 3 |
| 1260 | `p.chips` | `c` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 529 | button | — | `goLibrary` | — |
| 530 | button | — | `onSaveTemplate` | — |
| 534 | button | — | `onSaveClose` | — |
| 535 | button | — | `onGoSendGuard` | — |
| 541 | button | — | `onGoSendGuard` | — |
| 548 | input | — | `onTitle` | Navn på undersøkelsen |
| 553 | button | — | `b.onClick` | — |
| 569 | button | — | `v.onClick` | — |
| 581 | button | — | `onToggleMeta` | — |
| 583 | input | — | `onAudience` | — |
| 597 | button | — | `onToggleMeta` | — |
| 612 | input | — | `q.onText` | — |
| 613 | select | — | `q.onType` | — |
| 615 | option | — | `—` | — |
| 616 | option | — | `—` | — |
| 617 | option | — | `—` | — |
| 618 | option | — | `—` | — |
| 619 | option | — | `—` | — |
| 622 | option | — | `—` | — |
| 623 | option | — | `—` | — |
| 624 | option | — | `—` | — |
| 625 | option | — | `—` | — |
| 626 | option | — | `—` | — |
| 629 | option | — | `—` | — |
| 632 | option | — | `—` | — |
| 633 | option | — | `—` | — |
| 637 | button | — | `q.onUp` | Flytt opp |
| 638 | button | — | `q.onDown` | Flytt ned |
| 639 | button | — | `q.onDup` | Dupliser spørsmål |
| 640 | button | — | `q.onToBank` | Lagre til spørsmålsbanken |
| 642 | button | — | `q.onRemove` | Slett spørsmål |
| 647 | select | — | `q.onScalePoints` | — |
| 648 | option | — | `—` | — |
| 648 | option | — | `—` | — |
| 648 | option | — | `—` | — |
| 648 | option | — | `—` | — |
| 648 | option | — | `—` | — |
| 648 | option | — | `—` | — |
| 651 | input | — | `q.onLow` | — |
| 653 | input | — | `q.onHigh` | — |
| 659 | input | — | `l.onChange` | — |
| 675 | input | — | `q.onHelp` | — |
| 678 | button | — | `q.onRequired` | Påkrevd spørsmål |
| 681 | button | — | `q.onFollowUpToggle` | — |
| 685 | select | — | `q.onCommentMode` | — |
| 686 | option | — | `—` | — |
| 687 | option | — | `—` | — |
| 688 | option | — | `—` | — |
| 693 | button | — | `q.onMulti` | — |
| 694 | button | — | `q.onRandomize` | — |
| 706 | input | — | `o.onLabel` | — |
| 707 | button | — | `o.onRemove` | Fjern bilde |
| 712 | button | — | `q.onAddImage` | — |
| 722 | input | — | `stm.onChange` | — |
| 723 | button | — | `stm.onRemove` | Fjern utsagn |
| 726 | button | — | `q.onAddStatement` | — |
| 734 | input | — | `o.onChange` | — |
| 735 | button | — | `o.onRemove` | Fjern svaralternativ |
| 738 | button | — | `q.onAddOption` | — |
| 754 | button | — | `q.onUp` | Flytt opp |
| 755 | button | — | `q.onDown` | Flytt ned |
| 756 | button | — | `q.onDup` | Dupliser blokk |
| 757 | button | — | `q.onRemove` | Slett blokk |
| 761 | input | — | `q.onBlockTitle` | Tittel på blokken |
| 764 | textarea | — | `q.onBlockBody` | Tekst i blokken |
| 772 | input | — | `q.onBlockUrl` | Lenke til video |
| 775 | input | — | `q.onBlockCaption` | Bildetekst eller kilde |
| 796 | select | — | `q.onMoveTo` | Flytt til plass |
| 797 | option | — | `—` | — |
| 800 | button | — | `q.onUp` | Flytt opp |
| 801 | button | — | `q.onDown` | Flytt ned |
| 802 | button | — | `q.onRemove` | Slett |
| 821 | button | — | `ct.onAdd` | Klikk for å legge nederst, eller dra inn i flyten |
| 844 | button | — | `rm.onPick` | — |
| 859 | button | — | `fm.onPick` | — |
| 875 | button | — | `m.onClick` | — |
| 891 | button | — | `lt.onToggle` | — |
| 912 | button | — | `qt.onToggle` | — |
| 919 | input | — | `onQuizPass` | — |
| 923 | input | — | `onQuizTries` | — |
| 938 | button | — | `onOpenPicker` | — |
| 949 | button | — | `onClosePicker` | Lukk |
| 951 | input | — | `onPickQuery` | — |
| 954 | button | — | `c.onClick` | — |
| 969 | button | — | `b.onAdd` | — |
| 977 | button | — | `goLibrary` | — |
| 978 | button | — | `onClosePicker` | — |
| 989 | button | — | `i.onClick` | (bound) |
| 1005 | button | — | `onTogglePol` | — |
| 1027 | button | — | `k.onClick` | — |
| 1036 | button | — | `a.onClick` | — |
| 1048 | button | — | `n.onClick` | — |
| 1077 | button | — | `r.onRemove` | Fjern regel |
| 1083 | button | — | `onAddLogic` | — |
| 1097 | button | — | `onToggleEngage` | — |
| 1107 | button | — | `a.onClick` | — |
| 1118 | button | — | `i.onPick` | — |
| 1128 | input | — | `onPrize` | — |
| 1131 | input | — | `onCharity` | — |
| 1146 | button | — | `t.onToggle` | (bound) |
| 1151 | button | — | `onToggleMore` | — |
| 1158 | button | — | `c.onPick` | — |
| 1170 | input | — | `onThankYou` | — |
| 1218 | button | — | `l.onFix` | — |
| 1219 | button | — | `l.onDismiss` | — |
| 1232 | button | — | `onTestSurvey` | — |

### Geometry constants used on this screen

`1px×103`, `10px×87`, `12px×77`, `13px×65`, `11px×63`, `12.5px×57`, `14px×56`, `9px×53`, `8px×48`, `16px×42`, `999px×42`, `7px×37`, `6px×26`, `11.5px×20`, `18px×19`, `4px×18`, `20px×17`, `3px×15`, `13.5px×15`, `2px×14`, `15px×13`, `32px×11`, `22px×9`, `30px×9`, `24px×8`, `19px×7`

Radii: `999px` ×42, `10px` ×37, `9px` ×17, `8px` ×14, `var(--r,16px)` ×11, `12px` ×10, `11px` ×7, `13px` ×4

Literal hex on this screen: `#E8DFC9`×91, `#5F5849`×65, `#191510`×52, `#FFFDF6`×38, `#6F6759`×27, `#FCF6E9`×20, `#FBD5C4`×9, `#FBEBBE`×6, `#F5C64A`×5, `#FFF`×4, `#A8D5D2`×3

---

## Send / distribution

Gate: `sc-if value="{{ isSend }}"`  ·  58 controls · 10 headings · 12 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 5006 | 22px | 500 |
| 5036 | 23px | 700 |
| 5054 | 23px | 700 |
| 5138 | 23px | 700 |
| 5188 | 23px | 700 |
| 5207 | 23px | 700 |
| 5221 | 23px | 700 |
| 5231 | 23px | 700 |
| 5304 | 23px | 700 |
| 5355 | 33px | 700 |

### Literal copy in the drawing

- `5006` Utsending
- `5017` Tilbake til bygger
- `5028` Velg målgrupper fra én populasjon
- `5036` Slik når den fram
- `5059` Importer mottakere
- `5065` Engangsliste for denne utsendingen
- `5076` Prøv eksempelfil
- `5077` Legg til
- `5081` Skal listen brukes flere ganger? Lagre den som målgruppe med eier og populasjon.
- `5082` Lagre som målgruppe
- `5085` Synk fra Entra ID, Google Workspace, HR-system og distribusjonslister administreres i Målgrupper, der de får eier og synkstatus.
- `5086` Åpne Målgrupper
- `5093` Legg til
- `5104` Velg fra målgruppene
- `5105` Rediger målgrupper
- `5138` Avsender og utseende
- `5142` Nullstill
- `5153` Avsender
- `5161` Aksentfarge
- `5171` Emnefelt
- `5177` Fra: {{ brandPreview.from }}
- `5180` Svar nå
- `5188` Delbar lenke
- `5193` Én lenke per undersøkelse — åpen til du stenger den.
- `5207` QR-kode
- `5208` For plakat i kantina, skjerm på lageret eller en slide på allmøtet. Peker til samme lenke.
- `5210` Last ned PNG
- `5211` Plakat A4
- `5221` SMS
- `5222` Sendes fra HeiTuva med kortlenke. Best for skiftlag uten jobb-innboks.
- `5223` Hei! {{ orgName }} spør: «{{ draftTitle }}» — 2 minutter, {{ anonLabel }}. {{ shareLink }}
- `5231` Hyppighet
- `5253` ↻ {{ recurStatus }}
- `5256` Stopp
- `5262` Hver
- `5265` dag(er)
- `5266` uke(r)
- `5267` måned(er)
- `5270` mandag
- `5270` tirsdag
- `5270` onsdag
- `5270` torsdag
- `5270` fredag
- `5277` Antall runder
- `5279` 4 runder
- `5280` 8 runder
- `5281` 12 runder
- `5282` 26 runder
- `5283` Til jeg stopper den
- `5288` Roter spørsmålene
- `5295` · {{ p.label }}
- `5304` Levering
- `5323` Sendes
- `5325` Med en gang
- `5326` Mandag 09:00
- `5327` Fredag 15:00
- `5331` Påminnelse
- `5333` Etter 2 dager
- `5334` Etter 5 dager
- `5335` Ingen
- `5355` Sendt til {{ sentCount }} personer
- `5359` Svar selv
- `5360` Se svarene live

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 5008 | `sendChips` | `c` | 3 |
| 5038 | `channelCards` | `c` | 4 |
| 5069 | `importRows` | `r` | 0 |
| 5096 | `recipients` | `r` | 3 |
| 5108 | `audPicker` | `g` | 6 |
| 5155 | `senderOptions` | `so` | 4 |
| 5163 | `accentOverrideOptions` | `ao` | 4 |
| 5202 | `qrCells` | `c` | 441 |
| 5233 | `cadenceOptions` | `c` | 5 |
| 5294 | `cadencePlan` | `p` | 4 |
| 5312 | `anonModes` | `a` | 3 |
| 5339 | `reminderChips` | `r` | 2 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 5017 | button | — | `goBuild` | — |
| 5018 | button | — | `onSend` | — |
| 5039 | button | — | `c.onToggle` | — |
| 5059 | button | — | `onToggleImport` | — |
| 5067 | textarea | — | `onImportDraft` | — |
| 5076 | button | — | `onSampleCsv` | — |
| 5077 | button | — | `onRunImport` | — |
| 5082 | button | — | `onSaveAsAudience` | — |
| 5086 | button | — | `goAudiences` | — |
| 5092 | input | — | `onEmailDraft` | — |
| 5093 | button | — | `onAddEmail` | — |
| 5098 | button | — | `r.onRemove` | Fjern mottaker |
| 5105 | button | — | `goAudiences` | — |
| 5109 | button | — | `g.onToggle` | — |
| 5142 | button | — | `onResetBrand` | — |
| 5154 | select | — | `onSenderPick` | — |
| 5156 | option | — | `—` | — |
| 5162 | select | — | `onAccentOverride` | — |
| 5164 | option | — | `—` | — |
| 5172 | input | — | `onSubjectOverride` | — |
| 5191 | button | — | `onCopy` | — |
| 5210 | button | — | `onCopy` | — |
| 5211 | button | — | `onCopy` | — |
| 5234 | button | — | `c.onPick` | — |
| 5255 | button | — | `onPause` | — |
| 5256 | button | — | `onStopRecur` | — |
| 5263 | input | number | `onCustomEvery` | — |
| 5264 | select | — | `onCustomUnit` | — |
| 5265 | option | — | `—` | — |
| 5266 | option | — | `—` | — |
| 5267 | option | — | `—` | — |
| 5269 | select | — | `onCustomWeekday` | — |
| 5270 | option | — | `—` | — |
| 5270 | option | — | `—` | — |
| 5270 | option | — | `—` | — |
| 5270 | option | — | `—` | — |
| 5270 | option | — | `—` | — |
| 5272 | input | time | `onCustomHour` | — |
| 5278 | select | — | `onRuns` | — |
| 5279 | option | — | `—` | — |
| 5280 | option | — | `—` | — |
| 5281 | option | — | `—` | — |
| 5282 | option | — | `—` | — |
| 5283 | option | — | `—` | — |
| 5291 | button | — | `onRotate` | Roter spørsmålene |
| 5313 | button | — | `a.onPick` | — |
| 5324 | select | — | `onSchedule` | — |
| 5325 | option | — | `—` | — |
| 5326 | option | — | `—` | — |
| 5327 | option | — | `—` | — |
| 5332 | select | — | `onReminder` | — |
| 5333 | option | — | `—` | — |
| 5334 | option | — | `—` | — |
| 5335 | option | — | `—` | — |
| 5340 | button | — | `r.onClick` | — |
| 5344 | button | — | `onTest` | — |
| 5359 | button | — | `goRespond` | — |
| 5360 | button | — | `goResults` | — |

### Geometry constants used on this screen

`10px×57`, `12px×53`, `1px×52`, `14px×46`, `13px×34`, `12.5px×31`, `16px×22`, `8px×20`, `11px×20`, `999px×19`, `9px×17`, `22px×16`, `6px×15`, `13.5px×13`, `20px×11`, `2px×10`, `18px×9`, `23px×8`, `7px×5`, `11.5px×5`, `15px×5`, `19px×4`, `1.5px×4`, `220px×3`, `36px×2`, `4px×2`

Radii: `10px` ×31, `999px` ×19, `var(--r,16px)` ×8, `12px` ×5, `14px` ×3, `11px` ×3, `9px` ×3, `20px` ×1

Literal hex on this screen: `#E8DFC9`×47, `#191510`×31, `#5F5849`×27, `#FFFDF6`×15, `#FCF6E9`×11, `#FBEBBE`×5, `#FBD5C4`×4, `#F5C64A`×4, `#6F6759`×4, `#FFF`×2, `#A8D5D2`×1

---

## Library

Gate: `sc-if value="{{ isLibrary }}"`  ·  24 controls · 6 headings · 13 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 4777 | 32px | 600 |
| 4784 | 21px | 500 |
| 4801 | 22px | 500 |
| 4825 | 21px | 500 |
| 4881 | 21px | 500 |
| 4916 | 21px | 500 |

### Literal copy in the drawing

- `4770` Du kom hit fra {{ draftTitle }}. Alt du legger til havner i den undersøkelsen.
- `4771` ← Tilbake til undersøkelsen
- `4779` Maler er ferdige spørsmålssett du kan sende som de er eller endre. Lovpålagte maler kommer med låst anonymitet og terskel.
- `4784` På tvers
- `4785` ＋ Ny
- `4815` Nullstill
- `4821` Seks områder HeiTuva brukes til. Hvert område har egne maler, et dashboard-oppsett og — der loven krever det — låst anonymitet og terskel.
- `4834` Se maler
- `4835` Dashboard
- `4847` Firmaets maler
- `4851` Mal
- `4851` Deling
- `4851` Omfang
- `4862` Se
- `4863` Bruk mal
- `4889` Bruk mal
- `4894` Standardmaler
- `4925` Bruk mal
- `4935` Mal
- `4935` Kategori
- `4935` Omfang
- `4955` Se
- `4956` Bruk mal
- `4990` Legg til

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 4788 | `libStats` | `cs` | 4 |
| 4806 | `viewChips` | `v` | 2 |
| 4823 | `useCaseCards` | `u` | 6 |
| 4828 | `u.examples` | `e` | 3 |
| 4853 | `myTemplateCards` | `t` | 1 |
| 4872 | `myTemplateCards` | `t` | 1 |
| 4884 | `t.types` | `ty` | 4 |
| 4898 | `packCats` | `c` | 5 |
| 4907 | `templateCards` | `t` | 5 |
| 4919 | `t.types` | `ty` | 4 |
| 4937 | `templateCards` | `t` | 6 |
| 4976 | `bankCats` | `c` | 6 |
| 4980 | `bankRows` | `b` | 6 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 4771 | button | — | `backToBuild` | — |
| 4785 | button | — | `onOpenWizard` | — |
| 4807 | button | — | `v.onClick` | — |
| 4813 | input | — | `onLibQuery` | Søk i biblioteket |
| 4815 | button | — | `onLibReset` | — |
| 4834 | button | — | `u.onTemplates` | — |
| 4835 | button | — | `u.onDashboard` | — |
| 4859 | button | — | `t.onPrivate` | — |
| 4862 | button | — | `t.onPeek` | (bound) |
| 4863 | button | — | `t.onUse` | — |
| 4864 | button | — | `t.onDelete` | Slett mal |
| 4877 | button | — | `t.onPrivate` | — |
| 4878 | button | — | `t.onDelete` | Slett mal |
| 4888 | button | — | `t.onPeek` | — |
| 4889 | button | — | `t.onUse` | — |
| 4899 | button | — | `c.onClick` | — |
| 4924 | button | — | `t.onPeek` | — |
| 4925 | button | — | `t.onUse` | — |
| 4955 | button | — | `t.onPeek` | (bound) |
| 4956 | button | — | `t.onUse` | — |
| 4969 | input | — | `onBankQuery` | — |
| 4977 | button | — | `c.onClick` | — |
| 4988 | button | — | `b.onDelete` | Fjern fra banken |
| 4990 | button | — | `b.onAdd` | — |

### Geometry constants used on this screen

`1px×33`, `10px×30`, `13px×25`, `14px×21`, `12px×20`, `22px×16`, `18px×15`, `11px×15`, `12.5px×13`, `16px×12`, `999px×12`, `8px×10`, `6px×10`, `5px×7`, `15px×7`, `7px×7`, `9px×6`, `4px×6`, `21px×4`, `2px×4`, `70px×4`, `34px×3`, `20px×3`, `280px×3`, `11.5px×3`, `32px×2`

Radii: `10px` ×17, `999px` ×12, `18px` ×5, `20px` ×2, `9px` ×2, `14px` ×1, `8px` ×1, `12px` ×1

Literal hex on this screen: `#E8DFC9`×33, `#5F5849`×28, `#191510`×16, `#FFFDF6`×11, `#F5C64A`×5, `#FBEBBE`×3, `#FCF6E9`×3, `#A8D5D2`×3, `#6F6759`×1

---

## Pack detail

Gate: `sc-if value="{{ isPackdetail }}"`  ·  3 controls · 2 headings · 3 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 4703 | 27px | 500 |
| 4732 | 21px | 500 |

### Literal copy in the drawing

- `4692` Alle maler
- `4694` Bruk malen
- `4732` Spørsmålene i malen
- `4733` Lesevisning · ingenting opprettes før du trykker «Bruk malen»
- `4738` Spørsmål
- `4739` Type
- `4740` Krav
- `4741` Svaralternativer
- `4760` Bruk malen

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 4714 | `pd.types` | `ty` | 4 |
| 4721 | `pd.facts` | `fa` | 6 |
| 4743 | `pd.questions` | `q` | 8 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 4691 | button | — | `pd.onBack` | — |
| 4694 | button | — | `pd.onUse` | — |
| 4760 | button | — | `pd.onUse` | — |

### Geometry constants used on this screen

`1px×9`, `11px×8`, `12px×7`, `22px×7`, `12.5px×6`, `10px×5`, `14px×5`, `11.5px×5`, `13px×4`, `18px×4`, `20px×4`, `999px×4`, `38px×3`, `4px×3`, `26px×2`, `16px×2`, `44px×2`, `6px×2`, `5px×2`, `130px×2`, `100px×2`, `19px×2`, `7px×1`, `34px×1`, `280px×1`, `27px×1`

Radii: `999px` ×4, `10px` ×3, `20px` ×2, `13px` ×1, `0 0 19px 19px` ×1

Literal hex on this screen: `#5F5849`×12, `#E8DFC9`×9, `#FFFDF6`×3, `#191510`×3, `#FCF6E9`×3, `#F5C64A`×2, `#FBEBBE`×1, `#A8D5D2`×1

---

## Tasks (Arbeidsliste)

Gate: `sc-if value="{{ isTasks }}"`  ·  33 controls · 3 headings · 14 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 3767 | 30px | 600 |
| 3778 | 21px | 500 |
| 3799 | 22px | 500 |

### Literal copy in the drawing

- `3767` Oppgaver
- `3772` Hvert funn under terskel blir et tiltak med ansvarlig og frist. Kommentarer fra svarene havner i samme liste, så ingenting blir liggende i et regneark.
- `3781` ＋ Ny oppgave
- `3799` Arbeidsliste
- `3812` Ny oppgave
- `3818` Ny oppgave
- `3833` Avbryt
- `3834` Lagre oppgave
- `3846` Flytt ett steg
- `3847` Lukk valgte
- `3848` Nullstill
- `3853` Oppgave
- `3854` Type
- `3855` Frist
- `3856` Status
- `3857` Eier
- `3863` Ingenting i denne visningen
- `3864` Bytt filter i undermenyen, eller lag en ny oppgave.
- `3907` Tildelt
- `3913` Frist
- `3919` Lukk oppgaven
- `3937` Send svar
- `3939` Lag tiltak
- `3944` Interne notater
- `3957` Legg til notat

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 3784 | `ivOwners` | `mb` | 5 |
| 3801 | `ivScopes` | `f` | 5 |
| 3808 | `ivViewTabs` | `v` | 2 |
| 3822 | `ntOwners` | `o` | 3 |
| 3826 | `ntKinds` | `o` | 3 |
| 3829 | `ntSources` | `o` | 3 |
| 3844 | `ivBulkOwners` | `o` | 8 |
| 3868 | `ivRows` | `r` | 6 |
| 3901 | `r.steps` | `stp` | 6 |
| 3909 | `r.ownerOptions` | `o` | 7 |
| 3927 | `r.replies` | `rp` | 2 |
| 3947 | `r.notes` | `nt` | 2 |
| 3968 | `ivBoard` | `col` | 4 |
| 3975 | `col.cards` | `cd` | 3 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 3781 | button | — | `onNewTaskOpen` | — |
| 3802 | button | — | `f.onClick` | — |
| 3809 | button | — | `v.onClick` | — |
| 3812 | button | — | `onNewTaskOpen` | — |
| 3820 | input | — | `onNtTitle` | — |
| 3821 | select | — | `onNtOwner` | — |
| 3822 | option | — | `—` | — |
| 3824 | input | — | `onNtDue` | — |
| 3825 | select | — | `onNtKind` | — |
| 3826 | option | — | `—` | — |
| 3828 | select | — | `onNtSource` | — |
| 3829 | option | — | `—` | — |
| 3833 | button | — | `onNewTaskOpen` | — |
| 3834 | button | — | `onNtSave` | — |
| 3843 | select | — | `onIvBulkOwner` | Tildel valgte |
| 3844 | option | — | `—` | — |
| 3846 | button | — | `onIvBulkAdvance` | — |
| 3847 | button | — | `onIvBulkClose` | — |
| 3848 | button | — | `onIvClear` | — |
| 3852 | button | — | `onIvAll` | Velg alle |
| 3874 | button | — | `r.onCheck` | Velg raden |
| 3908 | select | — | `r.onAssign` | — |
| 3909 | option | — | `—` | — |
| 3914 | input | — | `r.onDue` | — |
| 3917 | button | — | `r.onAdvance` | — |
| 3919 | button | — | `r.onClose` | — |
| 3935 | textarea | — | `r.onReply` | — |
| 3937 | button | — | `r.onReplySend` | — |
| 3938 | button | — | `r.onHandled` | — |
| 3939 | button | — | `r.onMakeTask` | — |
| 3956 | input | — | `r.onNote` | — |
| 3957 | button | — | `r.onNoteSave` | — |
| 3976 | button | — | `cd.onSelect` | — |

### Geometry constants used on this screen

`10px×40`, `11px×35`, `1px×27`, `12px×22`, `12.5px×22`, `13px×18`, `8px×16`, `14px×14`, `18px×11`, `16px×11`, `22px×11`, `4px×10`, `999px×10`, `9px×10`, `5px×8`, `20px×4`, `6px×4`, `28px×4`, `7px×4`, `15px×3`, `11.5px×3`, `3px×3`, `1.5px×3`, `17px×3`, `62px×2`, `30px×2`

Radii: `10px` ×19, `999px` ×10, `11px` ×4, `9px` ×4, `20px` ×2, `8px` ×2, `5px` ×2, `12px` ×2

Literal hex on this screen: `#E8DFC9`×28, `#191510`×24, `#5F5849`×21, `#FFFDF6`×16, `#F5C64A`×4, `#FCF6E9`×3, `#FBEBBE`×2, `#FBD5C4`×1

---

## Administration

Gate: `sc-if value="{{ isAdmin }}"`  ·  48 controls · 17 headings · 37 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 4000 | 28px | 500 |
| 4010 | 22px | 500 |
| 4034 | 22px | 500 |
| 4066 | 22px | 500 |
| 4093 | 22px | 500 |
| 4106 | 22px | 500 |
| 4128 | 22px | 500 |
| 4188 | 22px | 500 |
| 4195 | 20px | 500 |
| 4207 | 21px | 500 |
| 4229 | 21px | 500 |
| 4278 | 21px | 500 |
| 4352 | 21px | 500 |
| 4446 | 26px | 500 |
| 4528 | 22px | 500 |
| 4586 | 22px | 500 |
| 4663 | 22px | 500 |

### Literal copy in the drawing

- `4000` Administrasjon
- `4004` Inviter bruker
- `4010` Firmaopplysninger
- `4019` Organisasjonsnummer og kontaktperson brukes i databehandleravtalen og i bunnteksten på invitasjonene respondentene mottar.
- `4022` Behandlingsansvarlig
- `4025` Personvernombud
- `4034` Brukere
- `4039` Inviter
- `4051` Administrator
- `4052` Redaktør
- `4053` Leser
- `4058` Administrator styrer innstillinger og personvern. Redaktør lager og sender undersøkelser. Leser ser bare summerte resultater — aldri enkeltsvar.
- `4066` Grupper
- `4067` Grupper under 5 personer får aldri egne resultater
- `4071` Opprett
- `4093` Logo
- `4099` Last opp
- `4106` Farge og typografi
- `4112` Kontrast {{ sw.contrast }}
- `4128` Avsender
- `4154` Låst per mal
- `4169` Standard emnefelt
- `4170` Kan endres per undersøkelse og per språk
- `4188` Populasjoner
- `4198` Kilde: {{ pp.source }} · lagres {{ pp.keep }}
- `4207` Grupper
- `4208` Faste lister. Synkroniserte grupper oppdateres automatisk.
- `4219` Oppdatert {{ g2.updated }}
- `4229` Segmenter
- `4230` Regelbaserte og selvoppdaterende. Endrer du regelen, merkes historikken.
- `4250` Ny målgruppe
- `4251` Legg inn en regel for å lage et segment. Uten regel blir det en fast gruppe.
- `4255` Ansatte
- `4256` Innleide og vikarer
- `4257` Leverandører
- `4258` Kunder
- `4268` Opprett målgruppe
- `4278` Importer til en målgruppe
- `4279` Importen lander i biblioteket, ikke i én utsending.
- `4285` Importer mottakere
- `4292` Importer til
- `4308` Feltmapping
- `4323` Innhold
- `4344` Importer
- `4352` Medlemmer
- `4357` Synkroniser nå
- `4368` Fjern
- `4376` Reservasjonsliste
- `4390` Behandlingsgrunnlag
- `4405` Frosne medlemskap
- `4421` Endringslogg
- `4443` ← Alle integrasjoner
- `4453` Sist synkronisert
- `4454` Neste synk
- `4460` Felter vi henter
- `4461` Ingenting utover dette leses fra katalogen.
- `4475` Tillatelser
- `4482` Kun lesing. HeiTuva skriver aldri tilbake til katalogen.
- `4486` Grupper i synk
- `4499` Slik kobler dere til
- `4512` Synklogg
- `4528` Integrasjoner
- `4545` Henter: {{ r.fields }}
- `4556` API-nøkkel
- `4557` Les undersøkelser, svar på aggregert nivå og oppgaver. Nøkkelen gir aldri tilgang til enkeltsvar.
- `4560` Lag ny nøkkel
- `4562` Sist rotert 12. mars 2026 · logges i personvernsporet
- `4566` Webhooks
- `4567` Send hendelser til deres eget system. Ingen svartekst sendes med.
- `4586` Personvern
- `4599` Anonymitetsterskel
- `4601` Standard undersøkelse
- `4607` Sensitive temaer
- `4615` Oppbevaringstid
- `4617` 6 måneder
- `4618` 12 måneder
- `4619` 24 måneder
- `4620` Ingen automatisk sletting
- `4626` Forespørsler fra registrerte
- `4627` Frist: 30 dager etter mottatt forespørsel
- …and 9 more

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 4012 | `companyFields` | `f` | 6 |
| 4042 | `adminUsers` | `u` | 5 |
| 4075 | `adminGroups` | `g` | 4 |
| 4095 | `logoSlots` | `ls` | 3 |
| 4108 | `accentSwatches` | `sw` | 5 |
| 4118 | `typePairs` | `tp2` | 2 |
| 4132 | `senderDomains` | `sd` | 2 |
| 4142 | `senderProfiles` | `sp2` | 4 |
| 4156 | `lockRows` | `lr` | 4 |
| 4172 | `subjectRows` | `sr` | 4 |
| 4191 | `popRows` | `pp` | 4 |
| 4212 | `mgGroups` | `g2` | 6 |
| 4232 | `mgSegments` | `sg` | 4 |
| 4263 | `ruleExamples` | `re` | 4 |
| 4294 | `mgImportTargets` | `tg` | 6 |
| 4301 | `mgSources` | `src` | 5 |
| 4311 | `mgMapRows` | `mp` | 5 |
| 4326 | `mgImportRows` | `ir` | 0 |
| 4361 | `memberRows` | `mb` | 8 |
| 4379 | `suppressRows` | `sp` | 2 |
| 4392 | `consentRows` | `cs` | 4 |
| 4408 | `freezeRows` | `fr` | 3 |
| 4423 | `auditRows` | `au` | 5 |
| 4462 | `intDetail.fields` | `f` | 8 |
| 4476 | `intDetail.scopes` | `sc` | 3 |
| 4487 | `intDetail.groups` | `g` | 4 |
| 4501 | `intDetail.steps` | `stp` | 4 |
| 4513 | `intDetail.log` | `lg` | 4 |
| 4534 | `intGroups` | `g` | 5 |
| 4537 | `g.rows` | `r` | 3 |
| 4569 | `webhookEvents` | `w` | 6 |
| 4588 | `privacyToggles` | `p` | 5 |
| 4602 | `orgThresholdChips` | `c` | 4 |
| 4608 | `orgSensitiveChips` | `c` | 4 |
| 4628 | `dsrRows` | `d` | 4 |
| 4643 | `legalDocs` | `l` | 4 |
| 4665 | `optionRows` | `o` | 5 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 4004 | button | — | `onAdminUsers` | — |
| 4015 | input | — | `f.onChange` | — |
| 4038 | input | — | `onInviteDraft` | — |
| 4039 | button | — | `onInvite` | — |
| 4050 | select | — | `u.onRole` | — |
| 4051 | option | — | `—` | — |
| 4052 | option | — | `—` | — |
| 4053 | option | — | `—` | — |
| 4055 | button | — | `u.onToggle` | — |
| 4070 | input | — | `onGroupDraft` | — |
| 4071 | button | — | `onAddGroup` | — |
| 4079 | button | — | `g.onRemove` | Slett gruppe |
| 4109 | button | — | `sw.onPick` | — |
| 4119 | button | — | `tp2.onPick` | — |
| 4253 | input | — | `onMgName` | — |
| 4254 | select | — | `onMgPop` | — |
| 4255 | option | — | `—` | — |
| 4256 | option | — | `—` | — |
| 4257 | option | — | `—` | — |
| 4258 | option | — | `—` | — |
| 4261 | input | — | `onMgRule` | — |
| 4264 | button | — | `re.onUse` | — |
| 4268 | button | — | `onMgCreate` | — |
| 4285 | button | — | `onMgImport` | — |
| 4293 | select | — | `onMgImportTarget` | — |
| 4295 | option | — | `—` | — |
| 4302 | button | — | `src.onPick` | — |
| 4324 | textarea | — | `onMgPaste` | — |
| 4344 | button | — | `onMgRunImport` | — |
| 4356 | input | — | `onMemberQuery` | — |
| 4357 | button | — | `onSyncNow` | — |
| 4368 | button | — | `mb.onRemove` | — |
| 4443 | button | — | `onIntBack` | — |
| 4548 | button | — | `r.onClick` | — |
| 4560 | button | — | `onRevealApi` | — |
| 4594 | button | — | `p.onToggle` | (bound) |
| 4603 | button | — | `c.onClick` | — |
| 4609 | button | — | `c.onClick` | — |
| 4616 | select | — | `onRetention` | — |
| 4617 | option | — | `—` | — |
| 4618 | option | — | `—` | — |
| 4619 | option | — | `—` | — |
| 4620 | option | — | `—` | — |
| 4634 | button | — | `d.onClick` | — |
| 4671 | button | — | `o.onToggle` | (bound) |
| 4678 | select | — | `onDefaultLang` | — |
| 4679 | option | — | `—` | — |
| 4680 | option | — | `—` | — |

### Geometry constants used on this screen

`1px×89`, `14px×73`, `12px×65`, `18px×64`, `10px×53`, `13px×44`, `16px×39`, `12.5px×37`, `11.5px×36`, `11px×35`, `22px×34`, `24px×33`, `9px×28`, `999px×26`, `3px×21`, `20px×19`, `4px×16`, `13.5px×15`, `2px×13`, `8px×10`, `5px×8`, `7px×6`, `10.5px×6`, `26px×6`, `200px×5`, `300px×5`

Radii: `18px` ×32, `999px` ×26, `10px` ×23, `14px` ×8, `9px` ×5, `13px` ×2, `11px` ×2, `20px` ×1

Literal hex on this screen: `#5F5849`×88, `#E8DFC9`×83, `#FFFDF6`×36, `#191510`×24, `#FCF6E9`×14, `#F5C64A`×7, `#FBEBBE`×7, `#FBD5C4`×3, `#A8D5D2`×2, `#FFF`×2

---

## Profile

Gate: `sc-if value="{{ isProfile }}"`  ·  6 controls · 4 headings · 4 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 3352 | 18px | 700 |
| 3354 | 28px | 500 |
| 3369 | 21px | 500 |
| 3383 | 21px | 500 |

### Literal copy in the drawing

- `3362` Lagre endringer
- `3369` Om meg
- `3378` Rollen din settes av en administrator under Administrasjon. Mobilnummeret brukes bare til varsler du selv har slått på.
- `3379` Lagre endringer
- `3383` Varsler
- `3400` Språk
- `3401` Velg språket du vil bruke i HeiTuva. Undersøkelser du sender kan ha sitt eget språk per mottaker.
- `3410` Pålogging og enheter
- `3422` Logg ut overalt

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 3371 | `profileFields` | `f` | 4 |
| 3385 | `profileNotify` | `n` | 4 |
| 3403 | `langChips` | `l` | 4 |
| 3412 | `profileSessions` | `d` | 3 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 3362 | button | — | `onProfileSave` | — |
| 3374 | input | — | `f.onChange` | — |
| 3379 | button | — | `onProfileSave` | — |
| 3391 | button | — | `n.onToggle` | — |
| 3404 | button | — | `l.onClick` | — |
| 3422 | button | — | `onLogout` | — |

### Geometry constants used on this screen

`18px×9`, `14px×8`, `1px×8`, `16px×7`, `12px×7`, `10px×6`, `999px×5`, `13px×5`, `24px×5`, `12.5px×4`, `2px×3`, `52px×2`, `3px×2`, `9px×2`, `15px×2`, `21px×2`, `11px×2`, `13.5px×2`, `20px×2`, `34px×1`, `28px×1`, `6px×1`, `22px×1`, `46px×1`, `26px×1`, `4px×1`

Radii: `999px` ×5, `10px` ×4, `18px` ×4

Literal hex on this screen: `#E8DFC9`×8, `#5F5849`×7, `#191510`×5, `#FFFDF6`×3, `#F5C64A`×2, `#FBD5C4`×1, `#A8D5D2`×1, `#FCF6E9`×1, `#FFF`×1, `#FBEBBE`×1

---

## Help

Gate: `sc-if value="{{ isHelp }}"`  ·  12 controls · 4 headings · 10 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 3550 | 28px | 500 |
| 3569 | 28px | 500 |
| 3682 | 26px | 500 |
| 3714 | 21px | 500 |

### Literal copy in the drawing

- `3550` Hjelp og støtte
- `3551` Artikler, forum og direkte kontakt med oss
- `3564` ← Alle artikler
- `3585` Les videre
- `3608` HeiTuva
- `3623` Fikk du ikke svar? Spør i forumet, eller kontakt oss.
- `3624` Kontakt oss
- `3633` Kategorier
- `3654` Ingen artikler passer søket. Prøv en annen kategori, eller kontakt oss.
- `3655` Nullstill søket
- `3668` Les artikkelen →
- `3690` Spør de andre som holder på med det samme
- `3691` HR-folk, verneombud og innkjøpere deler maler, formuleringer og erfaringer. Skriv med fullt navn eller anonymt.
- `3693` Nytt innlegg
- `3714` Send oss en melding
- `3715` Vi svarer på norsk innen én arbeidsdag. Skriv gjerne hvilken undersøkelse det gjelder.
- `3719` Send melding
- `3738` Driftsstatus

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 3554 | `helpTabs` | `h` | 3 |
| 3573 | `artSteps` | `p2` | 3 |
| 3587 | `artRelated` | `r2` | 2 |
| 3611 | `artMock` | `m2` | 4 |
| 3635 | `helpCats` | `k` | 9 |
| 3660 | `helpTopics` | `a` | 12 |
| 3680 | `forumStats` | `f` | 3 |
| 3697 | `forumThreads` | `t3` | 6 |
| 3727 | `contactRows` | `c2` | 4 |
| 3739 | `statusRows` | `st2` | 3 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 3555 | button | — | `h.onClick` | — |
| 3564 | button | — | `onCloseArticle` | — |
| 3588 | button | — | `r2.onOpen` | — |
| 3624 | button | — | `onGoContact` | — |
| 3636 | button | — | `k.onClick` | — |
| 3645 | input | — | `onHelpQuery` | — |
| 3655 | button | — | `onResetHelp` | — |
| 3661 | button | — | `a.onOpen` | — |
| 3693 | button | — | `—` | — |
| 3716 | input | — | `onContactSubject` | — |
| 3717 | textarea | — | `onContactBody` | — |
| 3719 | button | — | `onContactSend` | — |

### Geometry constants used on this screen

`12px×30`, `1px×24`, `14px×22`, `10px×19`, `16px×16`, `11px×16`, `9px×15`, `18px×14`, `12.5px×12`, `13px×11`, `999px×10`, `3px×9`, `20px×9`, `4px×7`, `26px×4`, `8px×4`, `14.5px×4`, `22px×4`, `13.5px×4`, `280px×3`, `5px×3`, `11.5px×3`, `15px×3`, `28px×2`, `24px×2`, `6px×2`

Radii: `999px` ×10, `16px` ×8, `10px` ×7, `18px` ×3, `11px` ×3, `9px` ×2, `14px` ×2, `12px` ×1

Literal hex on this screen: `#E8DFC9`×24, `#5F5849`×23, `#191510`×12, `#FFFDF6`×11, `#F5C64A`×3, `#FCF6E9`×3, `#FBEBBE`×3, `#FBD5C4`×1, `#CFE7E4`×1, `#A8D5D2`×1

---

## Respondent surface

Gate: `sc-if value="{{ isRespond }}"`  ·  47 controls · 3 headings · 17 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 5413 | 24px | 500 |
| 5480 | 20px | 600 |
| 5715 | 40px | 500 |

### Literal copy in the drawing

- `5373` Testmodus
- `5374` Svarene lagres ikke. All logikk kjører som for en ekte respondent.
- `5378` Start på nytt
- `5379` Avslutt test
- `5392` Svarer på
- `5426` hva betyr dette?
- `5437` Slik behandles svaret ditt
- `5474` Svar likevel
- `5475` Gå videre
- `5500` Spill av videoen
- `5512` Da går vi videre til neste del.
- `5518` Neste del
- `5557` Hopp over
- `5611` + bildealternativ
- `5746` Hva skjer nå
- `5755` Du sa · vi gjorde
- `5756` Fra forrige runde. Dette er grunnen til at det er verdt å svare igjen.
- `5762` «{{ s6.said }}»
- `5763` · {{ s6.when }}
- `5787` Dette var en test. Ingenting ble lagret, og resultatene er urørt.
- `5789` Tilbake til byggeren
- `5790` Test på nytt

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 5383 | `testJump` | `j` | 8 |
| 5394 | `surveyPicker` | `s` | 3 |
| 5416 | `langCodes` | `l` | 4 |
| 5441 | `rlAnonRows` | `a` | 6 |
| 5457 | `rlSections.dots` | `d` | 3 |
| 5527 | `respondOne.choices` | `c` | 4 |
| 5539 | `respondOne.choices` | `c` | 5 |
| 5565 | `respondOne.matrixRows` | `m` | 3 |
| 5569 | `m.cells` | `c` | 5 |
| 5579 | `respondOne.rankRows` | `r` | 4 |
| 5599 | `q.imageOpts` | `o` | 3 |
| 5617 | `respondOne.dropdownOptions` | `o` | 5 |
| 5624 | `respondOne.imageCards` | `c` | 3 |
| 5637 | `respondOne.fieldRows` | `f` | 3 |
| 5675 | `qcAnonChips` | `ch` | 2 |
| 5758 | `rlSaidDid` | `s6` | 3 |
| 5775 | `peerBars` | `b` | 5 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 5377 | button | — | `onToggleTestView` | — |
| 5378 | button | — | `onRestartTest` | — |
| 5379 | button | — | `onExitTest` | — |
| 5384 | button | — | `j.onClick` | Gå til spørsmål {{ j.label }} |
| 5393 | select | — | `onPickSurvey` | — |
| 5395 | option | — | `—` | — |
| 5399 | button | — | `onTogglePhone` | — |
| 5417 | button | — | `l.onClick` | (bound) |
| 5423 | button | — | `onRlAnon` | — |
| 5438 | button | — | `onRlAnon` | Lukk |
| 5474 | button | — | `onRlSkipStay` | — |
| 5475 | button | — | `onRlSkipGo` | — |
| 5528 | button | — | `c.onPick` | — |
| 5540 | button | — | `c.onPick` | — |
| 5548 | textarea | — | `respondOne.onText` | — |
| 5556 | textarea | — | `respondOne.onProbe` | — |
| 5557 | button | — | `respondOne.onProbeSkip` | — |
| 5570 | button | — | `c.onPick` | (bound) |
| 5583 | button | — | `r.onUp` | Flytt opp |
| 5584 | button | — | `r.onDown` | Flytt ned |
| 5591 | input | range | `respondOne.onSlider` | — |
| 5605 | input | — | `o.onLabel` | — |
| 5606 | button | — | `o.onRemove` | Fjern bilde |
| 5611 | button | — | `q.onAddImage` | — |
| 5616 | select | — | `respondOne.onDropdown` | — |
| 5618 | option | — | `—` | — |
| 5625 | button | — | `c.onPick` | — |
| 5640 | input | {{ f.type }} | `f.onChange` | — |
| 5648 | textarea | — | `respondOne.onFollowUp` | — |
| 5654 | textarea | — | `respondOne.onComment` | — |
| 5664 | button | — | `onQcOpen` | — |
| 5671 | textarea | — | `onQcText` | — |
| 5676 | button | — | `ch.onClick` | — |
| 5684 | button | — | `onQcCancel` | — |
| 5685 | button | — | `onQcSave` | — |
| 5693 | button | — | `onQcOpen` | — |
| 5702 | button | — | `onBack` | — |
| 5705 | button | — | `onSubmit` | — |
| 5708 | button | — | `onNext` | — |
| 5723 | textarea | — | `onFbText` | — |
| 5726 | button | — | `onFbToggleAnon` | — |
| 5733 | button | — | `onFbSend` | — |
| 5748 | button | — | `onRlOptIn` | — |
| 5789 | button | — | `onExitTest` | — |
| 5790 | button | — | `onRestartTest` | — |
| 5795 | button | — | `goResults` | — |
| 5796 | button | — | `onAnswerAgain` | — |

### Geometry constants used on this screen

`14px×62`, `12px×60`, `1px×39`, `10px×33`, `13px×31`, `16px×28`, `12.5px×23`, `999px×23`, `11px×21`, `15px×19`, `9px×18`, `20px×16`, `8px×15`, `22px×11`, `44px×9`, `40px×9`, `18px×8`, `24px×8`, `3px×8`, `7px×8`, `28px×7`, `13.5px×7`, `6px×7`, `1.5px×6`, `2px×5`, `5px×5`

Radii: `999px` ×23, `12px` ×18, `14px` ×11, `10px` ×10, `11px` ×8, `9px` ×5, `8px` ×2, `var(--r,16px)` ×2

Literal hex on this screen: `#191510`×44, `#E8DFC9`×35, `#5F5849`×30, `#FFFDF6`×22, `#F5C64A`×11, `#FCF6E9`×11, `#A8D5D2`×6, `#FBEBBE`×5, `#FBD5C4`×2, `#FFF`×1

---

## Live stage

Gate: `sc-if value="{{ isLivestage }}"`  ·  2 controls · 2 headings · 7 repeaters

### Headings / display type

| line | size | weight |
|---|---|---|
| 3433 | 28px | 500 |
| 3446 | 38px | 500 |

### Literal copy in the drawing

- `3433` Live
- `3438` Innstillinger
- `3477` Ordsky
- `3488` Prioriteringsøvelse
- `3489` Deltakerne fordelte 100 poeng
- `3502` Deltakerspørsmål
- `3516` Kunngjøringsskjerm
- `3517` Vises til slutt — dette lukker sløyfa i sanntid
- `3530` Lagtavle

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 3454 | `liveQr` | `q3` | 121 |
| 3464 | `liveBars` | `lb` | 5 |
| 3481 | `cloudWords` | `cw` | 7 |
| 3491 | `priorityRows` | `pr` | 4 |
| 3506 | `audienceQuestions` | `aq` | 3 |
| 3519 | `closingLines` | `cl` | 3 |
| 3532 | `quizBoard` | `qb` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 3437 | button | — | `onLiveReveal` | — |
| 3438 | button | — | `goBuild` | — |

### Geometry constants used on this screen

`18px×11`, `13px×10`, `11px×9`, `22px×8`, `14px×8`, `16px×7`, `1px×7`, `24px×7`, `999px×7`, `12px×7`, `10px×6`, `9px×5`, `11.5px×4`, `3px×3`, `34px×2`, `20px×2`, `132px×2`, `6px×2`, `12.5px×2`, `7px×2`, `28px×1`, `260px×1`, `38px×1`, `2px×1`, `26px×1`, `300px×1`

Radii: `999px` ×7, `18px` ×6, `10px` ×2, `11px` ×2, `22px` ×1

Literal hex on this screen: `#FFFDF6`×7, `#5F5849`×6, `#E8DFC9`×6, `#191510`×4, `#F5C64A`×1, `#FBEBBE`×1

---

## Shell / chrome (nav, subnav, wizard, modals — outside every screen gate)

### Headings / display type

| line | size | weight |
|---|---|---|
| 36 | 25px | 500 |
| 38 | 18px | - |
| 169 | 20px | 700 |
| 260 | 20px | 500 |
| 6057 | 17px | 600 |

### Literal copy in the drawing

- `35` Veiviser
- `36` Sett opp undersøkelsen
- `55` Vet du allerede hva du vil spørre om?
- `56` Hopp over veiviseren og skriv spørsmålene selv.
- `58` Start fra blankt
- `60` Hvem skal svare?
- `66` Hva vil dere finne ut?
- `83` Hvor mange spørsmål?
- `97` Du kan endre hvert spørsmål etterpå i byggeren.
- `103` Hvem skal svare?
- `115` Hvor ofte?
- `123` Hver
- `126` dag(er)
- `127` uke(r)
- `128` måned(er)
- `131` mandag
- `131` tirsdag
- `131` onsdag
- `131` torsdag
- `131` fredag
- `138` Oppsummering
- `146` Tilbake
- `149` Neste
- `152` Opprett undersøkelsen
- `169` HeiTuva
- `178` Logg inn
- `190` Arbeidsflate
- `227` Logg ut
- `265` ↻ {{ ctxRecur }}
- `270` Kjør live
- `6057` HeiTuva
- `6059` Spør folkene dine. Få ærlige svar. Data lagres i Norge og EØS, og anonymiteten styres av terskelen dere setter.
- `6093` Tuva
- `6123` Traff dette?
- `6168` Lag undersøkelse med veiviser

### Repeaters (`sc-for`) — each is a list whose row count the implementation must match

| line | list | as | placeholder count |
|---|---|---|---|
| 42 | `wizSteps` | `w` | 4 |
| 62 | `wizUses` | `u` | 6 |
| 68 | `wizPurposes` | `p` | 6 |
| 89 | `wizQs` | `q` | 4 |
| 105 | `wizGroups` | `g` | 4 |
| 117 | `wizCadences` | `c` | 6 |
| 172 | `navItems` | `n` | 6 |
| 197 | `wsOptions` | `w` | 4 |
| 213 | `langOptions` | `l` | 4 |
| 223 | `userMenu` | `m` | 3 |
| 237 | `subnavItems` | `s2` | 5 |
| 240 | `subnavMore` | `m2` | 4 |
| 273 | `ctxSteps` | `c` | 3 |
| 6061 | `footBadges` | `b` | 3 |
| 6066 | `footCols` | `c` | 3 |
| 6070 | `c.links` | `l` | 4 |
| 6105 | `tvAskChips` | `c9` | 3 |
| 6138 | `tvTips` | `t` | 3 |
| 6156 | `tvTrack` | `s7` | 4 |

### Controls

| line | tag | type | handler | aria-label / title |
|---|---|---|---|---|
| 38 | button | — | `onCloseWizard` | Lukk veiviser |
| 58 | button | — | `onBlankSurvey` | — |
| 63 | button | — | `u.onClick` | — |
| 69 | button | — | `p.onPick` | — |
| 85 | input | range | `onWizCount` | Antall spørsmål |
| 106 | button | — | `g.onToggle` | — |
| 118 | button | — | `c.onPick` | — |
| 124 | input | number | `onWizEvery` | — |
| 125 | select | — | `onWizUnit` | — |
| 126 | option | — | `—` | — |
| 127 | option | — | `—` | — |
| 128 | option | — | `—` | — |
| 130 | select | — | `onWizWeekday` | — |
| 131 | option | — | `—` | — |
| 131 | option | — | `—` | — |
| 131 | option | — | `—` | — |
| 131 | option | — | `—` | — |
| 131 | option | — | `—` | — |
| 133 | input | time | `onWizHour` | — |
| 146 | button | — | `wizBack` | — |
| 149 | button | — | `wizNext` | — |
| 152 | button | — | `onWizFinish` | — |
| 173 | button | — | `n.onClick` | — |
| 178 | button | — | `onLogin` | — |
| 181 | button | — | `onOpenHelp` | Hjelp og støtte |
| 182 | button | — | `onToggleUser` | Brukermeny for {{ userName }} |
| 196 | select | — | `onWsSelect` | Arbeidsflate |
| 198 | option | — | `—` | — |
| 212 | select | — | `onLangSelect` | Språk |
| 214 | option | — | `—` | — |
| 218 | button | — | `onToggleWide` | (bound) |
| 224 | button | — | `m.onClick` | — |
| 227 | button | — | `onLogout` | — |
| 239 | select | — | `onSubnavMore` | Flere oppsett |
| 240 | option | — | `—` | — |
| 244 | button | — | `s2.onClick` | — |
| 258 | button | — | `goSurveys` | Tilbake til undersøkelser |
| 270 | button | — | `goLiveStage` | — |
| 274 | button | — | `c.onClick` | — |
| 6071 | button | — | `l.onClick` | — |
| 6094 | button | — | `onTvBubble` | Lukk |
| 6099 | input | — | `onTvAsk` | Spør Tuva |
| 6100 | button | — | `onTvAskSend` | Send spørsmål |
| 6106 | button | — | `c9.onClick` | — |
| 6115 | button | — | `onTvAnswerAction` | — |
| 6124 | button | — | `onTvRateUp` | Nyttig svar |
| 6127 | button | — | `onTvRateDown` | Bommet |
| 6139 | button | — | `t.onClick` | — |
| 6147 | button | — | `onTvTrack` | — |
| 6157 | button | — | `s7.onClick` | — |
| 6168 | button | — | `onTvWizard` | — |
| 6171 | button | — | `onTvBubble` | Vis eller skjul Tuva |

### Geometry constants used on this screen

`1px×48`, `12px×43`, `10px×43`, `14px×32`, `999px×27`, `8px×25`, `13px×23`, `11px×22`, `9px×20`, `12.5px×17`, `16px×14`, `7px×13`, `2px×12`, `15px×12`, `18px×11`, `20px×11`, `22px×10`, `34px×9`, `26px×8`, `6px×8`, `13.5px×8`, `4px×6`, `24px×5`, `17px×5`, `32px×5`, `72px×4`

Radii: `999px` ×27, `10px` ×12, `12px` ×7, `9px` ×5, `8px` ×4, `11px` ×4, `16px` ×3, `22px` ×1

Literal hex on this screen: `#E8DFC9`×40, `#191510`×38, `#5F5849`×28, `#FFFDF6`×19, `#FBEBBE`×8, `#FCF6E9`×7, `#F5C64A`×4, `#FBD5C4`×1

---
