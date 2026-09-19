# F6.0 — what an externally shared dashboard would carry

**Report before building.** T5.2 measured that **no dashboard RPC is reachable by
`anon` today**, so this step creates a security surface that does not currently
exist. Every row below is read from the catalogue or from the renderer, not from
memory.

## The six panels the registry puts on a dashboard

`select key, on_dashboard, names_individuals from report_section_types where on_dashboard`

| panel | the figures it carries | served by | routes through `app.k_for` |
|---|---|---|---|
| `trend` | mean per round | `get_trends` | **yes** |
| `heatmap` | team × question means, **with team labels** | `get_heatmap` | **yes** |
| `drivers` | the three highest and three lowest question means | `dashboard_summary.drivers` | **yes** |
| `themes` | algorithmic groupings of free text, with counts | `get_themes` | **yes** |
| `per_virksomhet` | **every supplier organisation's answer, by name** | `attributed_results` | yes — and returns `k = 0` by design: an organisation is not a natural person (Q17/Q47) |
| `duties` | duty title, legal reference, **the responsible employee's name**, due date | `duty_definitions` + `duty_status` | **no — and it does not need to be** |

Two more things are on the screen and are not panels:

| | figures | served by | gated |
|---|---|---|---|
| the KPI row | response count, response rate, survey count | `survey_response_counts` + `dashboard_summary` | **participation is deliberately ungated** (M:0003's own comment: a response total cannot identify a respondent or reveal an answer) |
| the meta bar (F5) | **the owner's name**, share scope, frozen-report count, selection, threshold | `dashboards` + `org_members` + `reports` | n/a — none is a result |

## So four kinds of thing would reach an anonymous reader

1. **Gated aggregates** — trend, heatmap, drivers, themes. Every one already
   routes through `app.k_for`, so the gate itself is not the problem.
2. **Names of employees** — `duties.owner` is `org_members.name`
   (`lib/dashboard/panels.ts:138`, rendered at `DashboardScreen.tsx:380`), and
   the meta bar's «Eier» is another. Neither is a respondent, and neither is
   suppressed by k because k protects answers, not staff directories.
3. **The organisation's structure** — heatmap rows are TEAM LABELS, and a
   reader who cannot see a single suppressed cell still learns which teams
   exist and how many there are.
4. **Named third parties** — `per_virksomhet` publishes suppliers by name. That
   is deliberate under åpenhetsloven for an authorised reader; it is a different
   claim for an anonymous one.

## `names_individuals` IS THE WRONG INSTRUMENT HERE, and that is worth stating

`duties` is flagged `names_individuals = false` while its renderer prints an
employee's name, which looks like a discrepancy and is not. The column's own
comment says what it means:

> True when the section puts a name or a quotable sentence next to an
> **individual** … Read by `app.redact_for_role`, which is how CLAUDE.md
> invariant 4 reaches the report.

It answers *«does this attribute an ANSWER to someone»* — a respondent question,
for role-based redaction **inside** the organisation. The question an external
share asks is *«does this publish anything about identifiable people or about
how this organisation is arranged»*, and those are not the same question. Using
the existing flag as the allowlist would therefore admit `duties` — a panel that
names a member of staff — because the flag was never built to refuse it.

## v8 DRAWS NO ANONYMOUS READER (F6.4)

Measured. The share panel (`v8:2578-2600`) contains, in one panel:

- the dashboard title and `dashThresholdLine` («Terskelen følger med · …»),
- the **three role buttons** `hr` / `leder` / `alle`,
- and a copyable `dashShareLink`.

That link is **`"heituva.no/d/" + slug(dashCur.title)`** (`v8:8988`) — a slug of
the TITLE. It carries no token, it is guessable from the dashboard's name, and
it sits beside a role picker. **It is an internal deep link scoped by the chosen
role, not an anonymous share.** There is no recipient view for an outside reader
anywhere in the bundle, and no fourth role for one.

So the three roles genuinely do not apply, and there is nothing in the drawing
to be faithful to.

### The narrowest option, proposed rather than assumed

An anonymous reader gets **its own view, narrower than every role** — not
`alle`'s, which is the most capable of the three:

- **Only panels that are gated aggregates with no label and no name**: `trend`
  and `drivers`. Both are org-wide question means that already refuse below
  `app.k_for`.
- **Excluded:** `heatmap` (team labels are organisational structure),
  `duties` (names an employee), `per_virksomhet` (names third parties),
  `themes` (respondent free text, even grouped).
- **Excluded:** the KPI row's participation counts — ungated by a decision made
  for members, which is not a decision made for the public — and the meta bar's
  «Eier».
- The allowlist is **stated in the serving RPC**, not derived from
  `names_individuals`, for the reason above.

This is a proposal. It is narrower than any role v8 draws, and widening it is a
decision about what the product publishes rather than a fidelity question.
