'use client'

import { useActionState } from 'react'
import { createOrganization, type OnboardingResult } from './actions'

type Labels = {
  company: string; orgnr: string; optional: string; name: string
  create: string; failed: string; already: string; invalid: string
}

const label = 'block text-[11px] uppercase tracking-[.09em] text-mut'
const field =
  'mt-1.5 box-border w-full rounded-[10px] border border-line bg-bg px-[13px] py-[11px] text-[14px] text-ink outline-none'

export function OnboardingForm({ labels, defaultName }: { labels: Labels; defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingResult | null, FormData>(
    createOrganization,
    null,
  )

  const message =
    state?.error === 'already'
      ? labels.already
      : state?.error === 'invalid'
        ? labels.invalid
        : state
          ? labels.failed
          : null

  return (
    <form action={action} className="mt-4">
      <label className="block">
        <span className={label}>{labels.company}</span>
        <input name="company" required maxLength={200} className={field} />
      </label>
      <label className="mt-3.5 block">
        <span className={label}>
          {labels.orgnr} ({labels.optional})
        </span>
        <input name="orgnr" maxLength={20} inputMode="numeric" className={field} />
      </label>
      <label className="mt-3.5 block">
        <span className={label}>{labels.name}</span>
        <input name="name" required maxLength={120} defaultValue={defaultName} className={field} />
      </label>

      {message ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full cursor-pointer rounded-[10px] border-none bg-ac px-[22px] py-3 text-[13.5px] font-bold text-ink disabled:opacity-60"
      >
        {labels.create}
      </button>
    </form>
  )
}
