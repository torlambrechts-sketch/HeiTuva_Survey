# 00 — Method, and what this review could not do

**2026-09-10.** A review, not a phase. It changes no product code except section 4,
which is named in the instruction.

Position: branch `claude/vedlagt-md-instruksjoner-qya32n`, CI run 95 green on
`fbc8815`. Every count below has the command that re-derives it beside it —
D110 governs this document as it governs the others, and D135 adds the reason:
a claim about a system you are not looking at while you read needs the command
that looks.

## What was read first, as instructed

- **The expansion catalogue is NOT in the repository.** Confirmed:
  `ls docs/ | grep -iE "expansion|catalogue"` returns nothing, and
  `06-remainder.md § 4.1` records R2/R3/R4 as Tor's to supply. Nothing in this
  review rests on it.
- `docs/v2/06-remainder.md`, `DECISIONS.md` Q45 and Q63, and the `use_cases`
  registry as seeded on `heituva-prod`.

## THE LIMIT, STATED FIRST BECAUSE IT SHAPES TWO SECTIONS

**No screen was captured. Section 2 and section 4's visual half are UNVERIFIED.**

`supabase start` cannot run here — `Cannot connect to the Docker daemon at
unix:///var/run/docker.sock` — so the app cannot be built against a local stack,
and Playwright cannot reach production either: the agent proxy closes Chromium's
tunnel to `www.heituva.com` (`ws_closed_mid_exchange`, curl works, the browser
does not). That is the same blocker that stopped the Turnstile enforcement proof.

The instruction is explicit that this matters: *«Every capture opened and looked
at, not diffed — this review is entirely about what a screen says to a reader,
which is the class no assertion reaches.»* Reading source and copy is a different
act, and filing it as though it were seeing a screen is exactly the substitution
**D138** is about: when one half of a proof is cheap and the other is blocked,
the cheap half acquires a gravity it has not earned. So section 2 says what it
knows from strings and structure, and says at the top that it is not the review
that was asked for.

## The bundles: what they can and cannot answer

Used for what they can answer — the **drawing's** side of section 1: how much
statutory vocabulary a drawn screen carries, what the wizard is drawn to open
on, how the Bibliotek is drawn sorted. Measured, and compared against the built
product. **Where the two diverge, both halves are a finding.**

They cannot substitute for section 2. A bundle is a mock with demo data someone
chose; the review asks what a buyer meets in the BUILT product, with prod
content, a new organisation's empty states, the wizard's real default and
`ui_messages` overriding the JSON. Three findings in this run came from exactly
that gap — `liveGuard` promising a threshold check with no implementation,
`intConnected` asserting four live connections that did not exist, and
`heituva.no` fourteen times against a product on `.com`.

## One method note that changed a number

The statutory regex matched `surveys.shareSubmit` = «Del og varsle». That is
«share and notify», not varsling. **A count is not a finding until the lines are
read** — the same correction that turned one `close_live_session` dependency
into none, and Q74's two `grep` hits into two comments. The in-app statutory
count is **7**, not the 8 the regex first returned, and the review uses 7.
