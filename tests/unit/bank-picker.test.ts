import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  B3 — THE PICKER OVERLAY, WHICH DID NOT EXIST, AND THE BANK'S CONFIRMATION.

  Before this phase, `grep -rl 'pickerOpen|pickQuery|pickerRows|pickAddedNote'`
  over `app/` returned no files. The CONTROL existed — `Builder.tsx` rendered
  the bundle's own label «＋ Fra spørsmålsbanken» in the bundle's own colour —
  as a `<Link href="/bibliotek?fane=bank">` that LEFT the Builder. The
  destination then had to rediscover which draft was meant, and did it by
  guessing: «the org's most recently touched draft» (D26). The app had the
  overlay's semantics on another screen, having discarded the state that made
  them exact.

  The confirmation was the second half. `BankRow` set `state = 'added'`, the
  button read «Lagt til ✓» and stayed disabled — so the note never named the
  draft, three additions left three spent buttons and a silent header, and **a
  question could be added exactly once**, which nothing in the schema asks for.
*/
const PICKER = 'app/(app)/undersokelser/[id]/bygg/BankPicker.tsx'
const BUILDER = 'app/(app)/undersokelser/[id]/bygg/Builder.tsx'
const PAGE = 'app/(app)/undersokelser/[id]/bygg/page.tsx'
const ROW = 'app/(app)/bibliotek/BankRow.tsx'
const NOTE = 'app/(app)/bibliotek/BankNote.tsx'
const ACTIONS = 'app/(app)/bibliotek/actions.ts'
const SEED = 'scripts/seed-demo.ts'

const decomment = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const picker = decomment(readFileSync(PICKER, 'utf8'))
const builder = decomment(readFileSync(BUILDER, 'utf8'))
const page = decomment(readFileSync(PAGE, 'utf8'))
const row = decomment(readFileSync(ROW, 'utf8'))
const note = decomment(readFileSync(NOTE, 'utf8'))
const actions = decomment(readFileSync(ACTIONS, 'utf8'))
const seed = readFileSync(SEED, 'utf8')
const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as Record<string, Record<string, string>>

describe('the picker overlay exists and keeps the Builder', () => {
  it('is a dialog, not a link away', () => {
    expect(builder).toContain('<BankPicker')
    expect(builder).not.toContain('href="/bibliotek?fane=bank"\n            className="touch-44 mt-3')
    expect(picker).toContain('role="dialog"')
    expect(picker).toContain('aria-modal="true"')
  })

  it('adds into the survey it was opened from, with no guess', () => {
    // D26's «most recently touched draft» heuristic cannot apply here: the id
    // is a prop of the route the overlay is mounted on.
    expect(picker).toContain('addBankQuestion(r.id, surveyId)')
    expect(builder).toContain('surveyId={surveyId}')
    expect(builder).toContain('surveyTitle={draft.title}')
  })

  it('names the draft in the header, as the bundle does', () => {
    expect(picker).toContain("t('pickerInto'")
    expect(no.builder!.pickerInto).toContain('{title}')
    expect(en.builder!.pickerInto).toContain('{title}')
  })

  it('closes on Escape and on the scrim', () => {
    expect(picker).toContain("e.key === 'Escape'")
    expect(picker).toContain('e.target === e.currentTarget')
  })

  it('derives the category chips from the rows present rather than listing them', () => {
    // V2:6204. A fixed list ships a chip that filters to nothing the day a
    // category is renamed in the seed.
    expect(picker).toContain('[...new Set(rows.map((r) => r.category))]')
    // And the two that are not categories are sentinels, so translating the
    // label cannot break the filter.
    expect(picker).toContain("'__all'")
    expect(picker).toContain("'__own'")
  })

  it('reads the bank on the server, where RLS already scopes it', () => {
    expect(page).toContain("from('question_bank')")
    expect(picker).not.toContain('createClient')
    expect(picker).not.toContain('from(')
  })

  it('counts what is shown rather than printing a number', () => {
    expect(picker).toContain("t('pickerCount', { count: shown.length })")
  })

  it('ships every picker string in both languages', () => {
    for (const k of Object.keys(no.builder!).filter((k) => k.startsWith('picker'))) {
      expect(en.builder![k], `en.builder.${k}`).toBeTruthy()
    }
    expect(Object.keys(no.builder!).filter((k) => k.startsWith('picker')).length).toBeGreaterThan(10)
  })
})

describe('an insert made from the overlay is visible behind it', () => {
  it('revalidates the Builder route, not only the Library', () => {
    // Without this the row lands and the page behind the overlay does not show
    // it until a manual reload — which reads exactly like a failure.
    expect(actions).toContain('revalidatePath(`/undersokelser/${surveyId}/bygg`)')
  })

  it('ALSO appends to the Builder’s own state, because a revalidate is not enough', () => {
    /* The fix pass found this and it is the sharper half. `Builder` holds
       `useState<BuilderDraft>(initial)`, and useState IGNORES a new initial
       value — so the server re-rendered, handed down a fresh `initial`, and the
       list did not move. `revalidatePath` alone would have shipped an overlay
       that inserts rows nobody can see: the exact failure it was built to stop
       happening on the Library route. */
    expect(builder).toContain('useState<BuilderDraft>(initial)')
    expect(actions).toContain('.select(\'id, type, text, config\')')
    expect(actions).toContain('ok: true,\n    question:')
    expect(builder).toContain('onAdded={(q) =>')
    expect(builder).toContain('questions: [\n                  ...d.questions,')
  })

  it('gives a bank question no answer key, rather than a placeholder one', () => {
    expect(builder).toContain('answerIndex: null,')
  })
})

describe('the bank confirmation', () => {
  it('is a shared pill that clears at the bundle’s 2200ms', () => {
    expect(note).toContain('AUTO_CLEAR_MS = 2200')
    expect(note).toContain('setNote(null)')
    expect(note).toContain('role="status"')
  })

  it('names the draft', () => {
    expect(no.library!.bankAddedInto).toContain('{title}')
    expect(en.library!.bankAddedInto).toContain('{title}')
    expect(row).toContain('announce(labels.addedInto(')
  })

  it('no longer makes a question addable exactly once', () => {
    expect(row).not.toContain("state === 'added'")
    expect(row).toContain("useState<'idle' | 'failed'>('idle')")
  })

  it('clears its timer, so it cannot set state after unmount', () => {
    expect(note).toContain('clearTimeout(timer.current)')
  })
})

describe('the seed gives the overlay something to show', () => {
  it('seeds the question bank at all, which it did not before', () => {
    expect(seed).toContain("from('question_bank').insert")
  })

  it('seeds both kinds, because the row renders differently for each', () => {
    // `bank_sel` is `org_id is null or app.is_org_member(org_id)`: a NULL org_id
    // is the shared standard bank, an org_id is this organisation's own.
    expect(seed).toMatch(/org_id: null, text:/)
    expect(seed).toMatch(/org_id: org\.id, text:/)
  })

  it('spreads the categories, or the chip row proves nothing', () => {
    const block = seed.slice(seed.indexOf("from('question_bank').insert"))
    const cats = new Set([...block.slice(0, 2000).matchAll(/category: '([^']+)'/g)].map((m) => m[1]))
    expect(cats.size).toBeGreaterThanOrEqual(3)
  })
})
