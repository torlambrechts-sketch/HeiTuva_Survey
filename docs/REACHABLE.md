# verify:reachable — can a person get there by clicking?

**Not one of VERIFY.md's seven gates. Not in `verify:all`.** The apparatus is frozen; this
runs beside it, on demand, like `verify:capability` and `verify:predeploy`. Run it when the
shell's navigation changes — which is exactly when an orphan is created.

```
npm run verify:reachable
npm run verify:reachable -- --depth=6
```

## The question no other gate asks

Every browser gate in this repository begins with `page.goto(route)`:

| gate | first move | what it can see |
|---|---|---|
| `verify:browser` | `goto` | the screen renders |
| `verify:responsive` | `goto` | nothing overflows, nothing overlaps |
| `verify:i18n` | `goto` | no Norwegian on the English page |
| `verify:visual` | `goto` | the pixels match the baseline |

That is the right start for measuring a screen. It is also why **not one of them can see an
orphan**: a route with no link to it anywhere renders perfectly, scores clean on all four,
and cannot be reached by any human who is not typing URLs.

This is the «green for something that structurally could not be seen» family, pointed at
navigation. It is not that the gates look in the wrong place — it is that `goto` *manufactures
the edge the product is missing*. The gate supplies the thing whose absence is the defect.

## Why N1 made it worth building

The nav went from five items to v8's three. Oversikt, Dashboard, Rapporter and Bibliotek
stopped being top-level destinations and now depend entirely on a subnav rail:

```
  /oversikt     Innsikt rail, «I dag»
  /dashboard    Innsikt rail, a board pill
  /rapporter    Innsikt rail, «Arkiv»
  /bibliotek    Surveys rail, three library pills
```

**Four screens whose only way in is one pill each.** Deleting a pill is a one-line edit, and
every existing gate stays green through it — the screen still renders, still fits, still
translates, still matches its baseline. Only this check goes red.

## The population is TWO, and the instruction's was the smaller one

The instruction said «every manifest route». Measured, `tests/routes.manifest.ts` holds **49
specs over 28 unique routes, and not one of them is a survey sub-route**: `/bygg`, `/send`,
`/resultater`, `/live` and the seven sub-tabs are reached there through a STATE that clicks into
them, never as entries of their own — and those are exactly the screens N1 put at risk.

So both are checked:

| population | size | derived from |
|---|---|---|
| the manifest, deduped, signed-out and pending excluded | 19 of 28 | `ROUTES`, and `as: 'anon'` is the exclusion property |
| every `page.tsx` under `app/(app)` | 32 shapes | the filesystem |

The filesystem scope needs no exclusion list: the splash, the login page, the legal pages and the
token surfaces live outside that route group **by construction**. That is a property, not a set
of names somebody remembered.

## What it measures

It builds the app's **link graph** by rendering pages and harvesting the destinations the DOM
actually offers, then asks whether every route in both populations is in the component reachable
from the front page (`/oversikt`).

**An edge exists only when a rendered page OFFERED it.** `page.goto` is the transport to a URL
already proven to be offered — never itself an edge. So the property proven is «a chain of real
controls leads here from the front page», which is the orphan question, and following a proven
edge by URL rather than by a literal click costs nothing but the click's own flakiness.

**Two kinds of control are harvested, because one of them is not an `<a>`.** v8's «Flere
oppsett» is a native `<select>` whose options carry paths and whose handler is `router.push`
(N3, v8:238-241). A crawler looking only at anchors would report every overflow dashboard as an
orphan — the defect would be in the crawler and would read as a finding about the product.

**Administrator, deliberately.** It is the role that can see the most, so a route unreachable
here is unreachable for everybody. A `leser` crawl would report role-gated screens as orphans:
a different question, with a true answer, worth its own run and not worth conflating with this.

**Signed-out routes are excluded by construction and the exclusion is printed.** The splash, the
login page and a respondent's token link are not reached from inside the product and must not be.

**It reads the status code.** A dead page offers no links, so every screen behind a 500 would be
reported as an orphan with the cause invisible. `HTTP 500 /x (offers nothing)` is a different
line from `orphan /x`, and the difference is the whole diagnosis.

## Two things it had to learn about itself, and one it still cannot do

Its second run reported `/undersokelser/[id]/live` and `/undersokelser/[id]/test` as orphans.
**Both are linked; both findings were the crawler's own narrowing** (D254).

- **A link inside a closed menu is not in the DOM.** `RowMenu` renders its items under
  `{open ? … }`. The crawl now clicks every `[aria-expanded="false"]` and every
  `details:not([open]) > summary` before harvesting — found by what a disclosure says about
  itself, not by a list of components that hide links.
- **One instance per route shape is what made it fast and what hid a conditional link.**
  `/live` renders only for a live-mode survey. `--per-shape` defaults to 3.

**AND THREE IS A SAMPLE, STATED AS ONE.** A control that renders for one row in twenty can still
be missed, and this check will call it an orphan when it is not. The limit is written beside the
number in the script. `artifacts/reachable/graph.json`'s `via` map is what tells a reader which
kind of finding they have: it answers *what linked here*, which an orphan list cannot.

## Proving it red

Removing one subnav pill must make it fail, naming the screens that pill was the only way into.
The proof is in the N4 commit message and in `artifacts/reachable/graph.json`, whose `via` map
answers the question an orphan list cannot: *what used to link here*.
