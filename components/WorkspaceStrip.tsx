'use client'

import { useTransition } from 'react'
import { setCustomModules } from '@/lib/workspace/actions'

export type ModuleOption = { key: string; label: string }

/**
 * V4:272-286 — the workspace strip under the greeting: a dot in the
 * workspace's colour, its label, its hint, and a chip saying what the dashboard
 * does. When the workspace is Tilpasset, a second row of toggles for the six
 * modules.
 *
 * A CLIENT COMPONENT ONLY BECAUSE OF THE TOGGLES. The strip itself is static;
 * the chips write a cookie through a server action and the page re-renders
 * server-side, which is what makes the modules appear and disappear at all —
 * Q122's whole point is that this decision has to be readable at server render.
 */
export function WorkspaceStrip({
  dot,
  tint,
  label,
  hint,
  layoutNote,
  isCustom,
  modules,
  active,
}: {
  dot: string
  tint: string
  label: string
  hint: string
  layoutNote: string
  isCustom: boolean
  modules: ModuleOption[]
  active: string[]
}) {
  const [pending, startTransition] = useTransition()

  function toggle(key: string) {
    const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key]
    startTransition(async () => {
      await setCustomModules(next)
    })
  }

  return (
    <div
      className="mt-[26px] flex flex-wrap items-center justify-between gap-[14px] rounded-[14px] border border-line px-4 py-3"
      style={{ background: tint, opacity: pending ? 0.7 : 1 }}
    >
      <span className="flex min-w-[260px] flex-1 basis-[320px] items-center gap-2.5">
        <span
          aria-hidden
          className="block h-[10px] w-[10px] flex-none rounded-[3px]"
          style={{ background: dot }}
        />
        <span className="whitespace-nowrap text-[13px] font-bold">{label}</span>
        <span className="text-[12.5px] leading-[1.45] text-mut">{hint}</span>
      </span>

      {/* V4:278 — what the dashboard does under this workspace. The TITLE comes
          from the joined `dashboard_presets` row, never copied into a string
          here: Q124 binds by key so a renamed preset stays correct.

          `flex-none` AND `whitespace-nowrap` ARE xl RULES, NOT UNCONDITIONAL
          ONES, and the reason is measured rather than argued.

          The bundle writes both (V4:278) and both are right at ≥1280px, which
          is the only width v4 governs. At 320px they make this chip unable to
          shrink OR wrap, so its width is set entirely by how long the preset's
          title happens to be — and the title is a registry value that differs
          per workspace. `verify:responsive` measured the consequence:

            arbeidsflate-kunder @320px — scrollWidth 338 > clientWidth 320

          «Dashboard følger oppsettet «Kundeopplevelse»» is three characters
          longer than «…«Arbeidsmiljø»», and three characters at 11.5px
          semibold is ~18px, which is the overflow exactly. The hr default and
          both Tilpasset states pass; ONLY cx fails.

          That is the defect a single-workspace capture cannot see, and it is
          the same shape as enumeration row 10 one level out: a constant that is
          correct in the context it was measured in, carried into a context
          where the thing it constrains has a different size. Here the varying
          thing is a WORD rather than a chip. */}
      <span className="min-w-0 rounded-full border border-line bg-sf px-2.5 py-1 text-[11.5px] font-semibold xl:flex-none xl:whitespace-nowrap">
        {layoutNote}
      </span>

      {isCustom ? (
        /* V4:280-284. `gap-y` is ours: these are 27px painted chips, so a 44px
           hit area overflows (44 − 27) / 2 = 8.5px each side and two stacked
           rows need ≥17px between painted edges. Derived for THIS chip — the
           number belongs to the control, not to the pattern (enumeration
           row 10), and 13px from another rail would be six short. */
        <span className="flex flex-wrap gap-x-1.5 gap-y-[17px] basis-full xl:gap-y-1.5">
          {modules.map((m) => {
            const on = active.includes(m.key)
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggle(m.key)}
                disabled={pending}
                aria-pressed={on}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-full border border-line px-[11px] py-1.5 text-[11.5px] font-semibold text-ink"
                style={{ background: on ? 'var(--ac)' : 'transparent' }}
              >
                {m.label}
              </button>
            )
          })}
        </span>
      ) : null}
    </div>
  )
}

/**
 * V4:288-294 — Tilpasset with every module switched off.
 *
 * NOT AN ERROR STATE AND NOT AN EMPTY DATABASE. It is a choice the person made,
 * so the copy says what to do about it and the button undoes it. `null` clears
 * the cookie, which is «follow the workspace's own set» — deliberately not `[]`,
 * which is the state being escaped.
 */
export function WorkspaceEmpty({
  title,
  body,
  reset,
}: {
  title: string
  body: string
  reset: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="mt-[18px] rounded-[18px] border border-dashed border-line bg-sf px-7 py-[26px] text-center">
      <div className="text-[15.5px] font-semibold">{title}</div>
      <div className="mt-[5px] text-[13px] leading-[1.55] text-mut">{body}</div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => void (await setCustomModules(null)))}
        className="touch-44 mt-[14px] cursor-pointer rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-semibold text-ink"
      >
        {reset}
      </button>
    </div>
  )
}
