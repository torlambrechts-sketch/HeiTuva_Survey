'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { setNotify } from './actions'
import type { NotifyKey } from './notify-keys'

/** Toggle geometry from the design: 46x26 pill, 20px knob, 3px padding,
 *  --ac when on and --sf2 when off (HeiTuva.dc.html:1330). */
export function NotifyCard({
  heading,
  items,
  initial,
  failedLabel,
}: {
  heading: string
  items: { key: NotifyKey; label: string; desc: string }[]
  initial: Record<NotifyKey, boolean>
  failedLabel: string
}) {
  const [saved, setSaved] = useState(initial)
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const toggle = (key: NotifyKey) => {
    const next = !optimistic[key]
    startTransition(async () => {
      setOptimistic({ ...optimistic, [key]: next })
      const res = await setNotify(key, next)
      if (res.ok) {
        setSaved((s) => ({ ...s, [key]: next }))
        setFailed(false)
      } else {
        // Revert to the last persisted value rather than leaving the UI
        // claiming a preference that was never stored.
        setFailed(true)
      }
    })
  }

  return (
    <section className="rounded-[18px] border border-line bg-sf p-6">
      <h2 className="font-display text-[21px] font-medium">{heading}</h2>
      {failed ? (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-ink">
          {failedLabel}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3.5">
        {items.map((item) => {
          const on = optimistic[item.key]
          return (
            <div key={item.key} className="flex items-center gap-3.5">
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-[12.5px] text-mut">{item.desc}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={item.label}
                onClick={() => toggle(item.key)}
                className="touch-44 flex h-[26px] w-[46px] flex-none cursor-pointer rounded-full border-none p-[3px]"
                style={{
                  background: on ? 'var(--ac)' : 'var(--sf2)',
                  justifyContent: on ? 'flex-end' : 'flex-start',
                }}
              >
                <span className="block h-5 w-5 rounded-full bg-white" />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
