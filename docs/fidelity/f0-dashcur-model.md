# F0 — v8's dashboard entity, read before building

**Measurement only. Nothing built from this yet.** Every claim carries its line.

---

## 1. `dashCur` — the full shape

The entity is seeded at **`v8:7086`**, inside `dashboardsOf(st)`:

```js
return [{ key:"d0", title:p.title, panels:p.panels.slice(), wide:{}, pin:{},
          source:p.title, owner:"Tuva Berg" }];
```

**Seven seeded fields.** The drawing then reads and writes six more that the seed
never creates, so the fixture cannot tell you they exist — this is the
`options.tuva` shape, and it is why the list below is derived from every read
and every write rather than from the seed.

| field | reads | writes | what it is |
|---|---|---|---|
| `key` | — | — | identity |
| `title` | 4 | 1 | the dashboard's name |
| `panels` | 3 | 8 | the panel keys on the flate |
| `cols` | 6 | 1 (`v8:8954`) | grid column count, 4 or 6 |
| `size` | via `cur.size` | 3 | **map** `{panelKey: span}` |
| `h` | 1 | 2 | **map** `{panelKey: 'lav'\|'normal'\|'hoy'}` |
| `br` | 1 | 2 | **map** `{panelKey: bool}` — force a new row |
| `shared` | 8 | 1 | share scope, one of three roles |
| `src` | 2 | 1 | **map** `{panelKey: surveyFilter}` |
| `per` | 2 | 1 | **map** `{panelKey: period}` |
| `grp` | 2 | 1 | **map** `{panelKey: group}` |
| `wide` | 1 | 1 | legacy width flag, superseded by `size` |
| `pin` | 3 | 1 | pinned panels |
| `source` | 4 | **0** | the preset it was created from; seed only |
| `owner` | 2 | **0** | seed only — always «Tuva Berg» |
| `kpis` | **0** | 1 (`v8:7220`) | written and never read back |

**THE FILTERS ARE PER PANEL, NOT PER DASHBOARD.** `src`, `per` and `grp` are
maps keyed by panel (`v8:7122-7133`), so one panel can show the last round for
Ledelse while its neighbour shows all rounds for everyone. **Ours is one
`filters` object per layout** (`period`, `group_id`, `survey_ids`, enforced by
`dashboard_layouts_filters_shape`). That is a real modelling difference and it
is not what F1 asks for — raised here rather than silently widened.

**`owner` has no writer**, so v8 cannot actually transfer or even set one; and
**`kpis` has no reader**, which is D208's second face. Neither is a reason to
copy the gap.

---

## 2. The three share roles — verbatim, `v8:8980-8982`

```js
dashShareRoles: [["hr","HR og admin","Ser alt, også grupper over terskelen"],
  ["leder","Ledere","Ser bare egen gruppe, aldri under terskelen"],
  ["alle","Alle ansatte","Ser samlet resultat, ingen nedbryting"]]
```

Default when unset: `(dashCur && dashCur.shared) || "hr"` (`v8:8983`).

| key | label | what the copy GRANTS |
|---|---|---|
| `hr` | «HR og admin» | «Ser alt, også grupper over terskelen» |
| `leder` | «Ledere» | «Ser bare egen gruppe, aldri under terskelen» |
| `alle` | «Alle ansatte» | «Ser samlet resultat, ingen nedbryting» |

**All three are CLAIMS about what a reader may see, so all three are promises
the running product must honour.** Read against invariant 1 they are
consistent with the gate rather than exceptions to it — «også grupper over
terskelen» grants groups ABOVE the threshold, not below; «aldri under
terskelen» restates the gate; «ingen nedbryting» is strictly narrower. **None
of the three widens k**, which is what F3 must prove rather than assume.

---

## 3. Version history — **v8 DRAWS NONE**

There is no dashboard version entity in the bundle. Every `versions:` in the
file (`v8:6337, 6345, 6353, 8812, 8818, 8824, 8879`) belongs to a **statutory
duty document**, not to a dashboard.

The closest thing is `freezeToReport()` (`v8:7049-7068`), which turns the
dashboard into a **report**:

```js
frozen: { from: d.title || "Dashbord", date: stamp, threshold: strict,
          panels: panels.slice() }
```

- **What it holds:** the source title, a date, the threshold in force, and the
  **panel keys**. `panels` is `d.panels` — keys, never rendered values. **No
  figure is stored**, which is exactly what F1 requires of `dashboard_versions`.
- **How many are kept:** unbounded; each freeze appends a report.
- **How one is restored:** it is not. `onOpen` (`v8:8734`) loads `r.frozen` into
  the **report editor**; nothing writes a dashboard's layout back from it.
- **`strict`** is `Math.max(...person surveys' thresholds, 3)` — org-wide and
  **floored at 3**, which T7 measured as wrong for us twice over.

So `dashboard_versions` and F4's restore are **Tor's design, not the bundle's**.
There is no drawing to be faithful to, and the freeze is the only precedent for
what a snapshot may contain: panels and a threshold, no numbers.

---

## 4. The cols / span model

```js
grid-template-columns: repeat(dashCur.cols || 6, minmax(0,1fr))   v8:8946
```

- `cols` is **4 or 6**, default 6, set by a density control at `v8:8954`.
- Changing it **rescales every panel proportionally** rather than resetting:
  `sz[k] = Math.max(1, Math.min(n, Math.round((cur.size[k] * n) / old)))`.
- `size[panelKey]` is the span. The chips offered depend on `cols`
  (`v8:7112`): at 4 → `[1 ¼, 2 ½, 3 ¾, 4 1/1]`, at 6 → `[2 ⅓, 3 ½, 4 ⅔, 6 1/1]`.
- The rendered value is `span: brK ? "1 / span " + sizeN : "span " + sizeN`
  (`v8:7110`) — `br[panelKey]` forces the panel to start at column 1, i.e. a new
  row.
- `h[panelKey]` maps to `minH` `{lav:150px, normal:230px, hoy:340px}`.

**So a panel carries three layout values, not one: `span`, `height` and
`break`.** F1 asks the `panels` CHECK to gain `span`; the other two are the same
kind of value and are raised here rather than added unasked.

---

## 5. The five meta-bar cells against this entity

T5 built two and reported three as describing a model we did not have. With the
entity, each resolves:

| cell | source in v8 | what it needs from F1 |
|---|---|---|
| Eier | `dashCur.owner` (`v8:8969`) | `dashboards.owner_id` — v8's own has no writer |
| Utvalg | `docFilterLine` (`v8:9019`) | **already built** (T5) |
| Personvern | `dashThresholdLine` (`v8:9018`) | **already built** (T5), and must keep OUR derivation — v8's floors at 3 org-wide |
| Delt med | `dashCur.shared` (`v8:8975`) | `dashboard_shares.role` |
| Rapporter | `dashRepCount` (`v8:8970`) | a REAL relation. v8 matches on a title string (`r.frozen.from === t`), which is not one. `reports` records none today. |
