'use client'

import { useRouter } from 'next/navigation'

/**
 * Q174 — the categories that did not fit on the rail.
 *
 * **THE OPTION'S VALUE IS THE HREF THE SERVER BUILT.** The page already owns
 * `href()`, which merges the current tab, view and search into every filter
 * link; rebuilding that here from `useSearchParams` would be a second copy of
 * the URL rules, and the first thing to drift would be the parameter this
 * control does not know about. So the client does one thing: navigate to a
 * string it was handed.
 *
 * **`touch-44-field`, NOT `touch-44`.** A `<select>` is a REPLACED element and
 * `::after` renders nothing on it, so the hit-area overlay `touch-44` relies on
 * is simply absent — `globals.css` carries `touch-44-field` for exactly this,
 * with the reason in its own comment. CLAUDE.md records the instance: C4 gave a
 * `<select>` `touch-44` and `verify:responsive` measured it at 189×36. Two
 * utilities, one named for the case, the explanation adjacent, and the wrong
 * one taken. This is a spelling that has to be recalled at the moment of
 * writing, so a test asserts it rather than a comment asking me to remember.
 *
 * It stays uncontrolled at `value=""`: the selection is not state this control
 * holds — picking an option navigates, and the chosen category then appears as
 * a promoted chip ON the rail (see `splitRail`). A control that both navigated
 * and displayed the selection would be saying the same thing twice, in two
 * places that can disagree.
 */
export function CategorySelect({
  options,
  label,
}: {
  options: { key: string; label: string; href: string }[]
  label: string
}) {
  const router = useRouter()
  if (options.length === 0) return null
  return (
    <select
      aria-label={label}
      value=""
      onChange={(e) => {
        if (e.target.value) router.push(e.target.value)
      }}
      /*
        `py-[9px]`, which is `touch-44-field`'s own default `--field-pad-y` —
        so no override is set and the utility's arithmetic is left alone.

        **TWO WRONG ANSWERS PRECEDED IT AND BOTH WERE FOUND BY MEASURING.**
        `py-[7px]`, chosen to match the painted height of the chips beside it,
        rendered 42px: the utility adds two 4px transparent borders and
        `--field-pad-y + 1` of padding, so a 7px field cannot reach 44 however
        honestly the variable is set. Then `py-2` rendered **43.98**, which my
        own driver printed as «44» because it rounded — and `verify:responsive`
        filters on the unrounded hit box while REPORTING the rounded painted
        one, so its finding read «touch area 153x44 (<44)», a sentence that
        looks like a contradiction and is not.

        The lesson is the project's own, one level down: a rounded measurement
        is not the measurement. The driver prints two decimals now.

        It is therefore ~38px painted next to 30px chips, which is the
        Arbeidsliste's own idiom: that header already sets a 30px chip rail
        beside a 40px «Ny oppgave».
      */
      className="touch-44-field box-border max-w-full rounded-lg border border-line bg-sf px-3 py-[9px] text-xs font-semibold text-ink outline-none"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.key} value={o.href}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
