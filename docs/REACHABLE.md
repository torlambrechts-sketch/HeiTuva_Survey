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

## WHAT THIS CHECK DOES NOT COVER

**Read this beside the number, not after a false finding.** A green `ORPHANED 0` means «no route in
either population was missed by a crawl with these limits», and the limits are these:

| limit | consequence | why it is there |
|---|---|---|
| **3 instances per route shape** (`--per-shape`) | a link that renders for one row in twenty can be missed, and the check will call that route an orphan when it is not | expanding every instance is 287 renders for the same 31 answers; three is a sample, and a sample is not a proof |
| **only `[aria-expanded="false"]` and `details:not([open]) > summary` are opened** | a link behind any other kind of hidden control — a hover-only menu, a modal opened by a plain button, a tab panel mounted on click, a control gated on scroll — is invisible | those two are what a disclosure *says about itself*; anything else needs a name, and a list of component names is the enumeration this project keeps being bitten by |
| **a control that navigates from JavaScript state** — `router.push` with a computed path, a redirect after a form post | not in the DOM at all, so not an edge | only `<a href>` and `<option value>` are harvested; an `<option>` was added because N3 introduced one, which is itself the evidence that the next kind will need adding too |
| **depth 5** (`--depth`) | a route six clicks deep from `/oversikt` is unreachable *to the crawl* | the app is shallow; raise it if that stops being true |
| **administrator only** | a route reachable only by some other role is not distinguished from one reachable by nobody | administrator sees the most, so an orphan here is an orphan for everybody — the narrower question deserves its own run, not a conflation with this one |
| **a signed-out route is out of scope by construction** | the splash, login, legal pages and token surfaces are never checked | they are not reached from inside the product and must not be |

**So a green result is evidence, not proof, and an orphan it reports is a claim to verify before
acting on.** `artifacts/reachable/graph.json`'s `via` map is what tells the two apart: it answers
*what linked here*, which an orphan list cannot. Both of this check's first two findings were false
and `via` is how that was established in minutes rather than by rebuilding a screen.

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

## Proving it red — and the correction it forced

**THE PREMISE WAS WRONG AND THE CHECK IS WHAT ESTABLISHED THAT.** N4 was written on my claim that
four screens depend on one subnav pill each, `/dashboard` most of all. Measured, none of the four
does:

| screen | links outside the subnav registry |
|---|---|
| `/rapporter` | `oversikt/ComplianceCard.tsx:42` |
| `/bibliotek` | `oversikt/OverviewScreen.tsx:244`, `rapporter/DutyCard.tsx:176` |
| `/oversikt` | the logo, `Breadcrumb`, `TuvaHelper`, `ResultsScreen` |
| `/dashboard` | **`AppHeader.tsx:57` — the top-level «Innsikt» nav item itself** — and `AppFooter.tsx:44` |

Removing «Arkiv» left `/rapporter` reachable. Removing the board pills left `/dashboard`
reachable. Both runs printed `ORPHANED 0`, **correctly**. The claim was mine and the grep behind it
matched `href="…"` in JSX, which finds neither a `NAV` constant nor a footer link array.

**So the red proof is the whole rail, and it names three screens:**

```
$ NEXT_PUBLIC_NO_SUBNAV=1 npm run verify:reachable
app/(app)        32 route shapes swept off the filesystem
  reachable      29
ORPHANED         3
  orphan  /undersokelser/[id]/historikk    [app/(app)]
  orphan  /undersokelser/[id]/kommentarer  [app/(app)]
  orphan  /undersokelser/[id]/tiltak       [app/(app)]
```

**Those three are the survey sub-tabs, and they are the only screens in the product whose sole way
in is the subnav.** Not the four N1 was expected to put at risk — the four have other doors — but
three that nobody had named. That is the check doing the job it was built for: the answer was not
the one anybody predicted, and it took a measurement to get it.

`artifacts/reachable/graph.json`'s `via` map is what made each of the three false starts cost
minutes instead of a rebuild: it answers *what linked here*, which an orphan list cannot.
