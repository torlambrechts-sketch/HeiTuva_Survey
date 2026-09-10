# 02 — The first hour, walked — **UNVERIFIED**

## This section did not do what it was asked to do

The instruction asks for every screen on the path captured, opened and looked
at, and says why: *«this review is entirely about what a screen says to a
reader, which is the class no assertion reaches.»*

**No capture was taken.** Docker is unavailable (`supabase start` fails at the
daemon) so the app cannot be built against a local stack, and the agent proxy
closes Chromium's tunnel to production. The reason is recorded in
`00-method.md`.

What follows is **strings and structure**, which is a different act. It is filed
here so the work is not lost, and marked so it is not mistaken for the review
that was asked for. **Nothing in this file should be quoted as «what a buyer
sees».** The one honest sentence available is: the entry screens contain seven
statutory strings and zero customer strings, and what that *looks like* is
unmeasured.

## What can be said from strings, and no more

**Oversikt, first login, nothing sent.** The compliance panel renders regardless
of whether an organisation has duties. With none instantiated a new
organisation meets `dash.complianceNoneUrgent` — «Ingen plikter krever handling
i år» — or the `{urgent} av {total}` summary at zero, beneath a panel headed
`dash.statutoryDeadlines` = «Lovpålagte frister». **UNVERIFIED whether the panel
renders at all when the duty set is empty**; that is a layout question and only
a capture answers it.

**The onboarding card** is `dash.onboardTitle` = «Sett opp en undersøkelse med
veiviseren» / «Formål, spørsmål, mottakere og hyppighet på fire steg». Neutral —
it assumes the customer wants to run a survey, which is right.

**The wizard's first step** opens pre-selected to «HR og arbeidsmiljø»
(§ 1.2). A buyer who wanted an NPS begins by changing the answer to a question
they were not asked.

**Bibliotek** leads with the HR chip and carries the two statutory notes, both
of which are well-written and conditional (§ 03).

**The four duty cards on Rapporter** — not examined here. Their content is
correct by construction (`duty_definitions`, 4 rows) and what a membership
organisation makes of them is precisely a looking-at-a-screen question.
**UNVERIFIED.**

## What would close this section

A machine with Docker: `supabase start && npm run seed:demo && npm run
verify:reference`, then open the captures. The seed now contains a quiz
(§ 04), so that run also photographs a surface no run has ever photographed.
