'use client'

import { useActionState } from 'react'
import { saveProfile } from './actions'
import type { SaveResult } from './notify-keys'

type Labels = {
  heading: string; name: string; email: string; jobTitle: string; phone: string
  roleNote: string; emailReadOnly: string; save: string; saved: string; failed: string
}

const label = 'block text-[11px] uppercase tracking-[.09em] text-mut'
const field =
  'mt-1.5 box-border w-full rounded-[10px] border border-line bg-bg px-[13px] py-[11px] text-[14px] text-ink outline-none'

export function AboutMeCard({
  defaults,
  labels,
}: {
  defaults: { display_name: string; job_title: string; phone: string; email: string }
  labels: Labels
}) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(saveProfile, null)

  return (
    <section className="rounded-[18px] border border-line bg-sf p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[21px] font-medium">{labels.heading}</h2>
        {state?.ok ? (
          <span
            role="status"
            className="rounded-full bg-ac2 px-[15px] py-[9px] text-[12.5px] font-semibold"
          >
            {labels.saved}
          </span>
        ) : null}
      </div>

      <form action={action}>
        <div className="mt-4 grid grid-cols-2 gap-3.5">
          <label className="block">
            <span className={label}>{labels.name}</span>
            <input name="display_name" defaultValue={defaults.display_name} required className={field} />
          </label>
          <label className="block">
            <span className={label}>{labels.email}</span>
            {/* Read-only: the sign-in address changes through an auth flow with
                its own confirmation, not a text field on a profile form. */}
            <input
              value={defaults.email}
              readOnly
              aria-describedby="email-note"
              className={`${field} cursor-not-allowed text-mut`}
            />
          </label>
          <label className="block">
            <span className={label}>{labels.jobTitle}</span>
            <input name="job_title" defaultValue={defaults.job_title} className={field} />
          </label>
          <label className="block">
            <span className={label}>{labels.phone}</span>
            <input name="phone" defaultValue={defaults.phone} inputMode="tel" className={field} />
          </label>
        </div>

        <p id="email-note" className="mt-3.5 text-[12.5px] leading-[1.6] text-mut">
          {labels.roleNote} {labels.emailReadOnly}
        </p>

        {state && !state.ok ? (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
            {labels.failed}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 cursor-pointer rounded-[10px] border-none bg-ac px-[22px] py-3 text-[13.5px] font-bold text-ink disabled:opacity-60"
        >
          {labels.save}
        </button>
      </form>
    </section>
  )
}
