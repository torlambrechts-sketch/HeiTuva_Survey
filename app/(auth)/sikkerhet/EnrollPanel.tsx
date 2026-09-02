'use client'

import Image from 'next/image'
import { useActionState } from 'react'
import { beginEnrollment, type EnrollState } from './actions'
import { MfaForm } from './MfaForm'

type Labels = {
  start: string; secret: string; code: string; verify: string
  invalid: string; failed: string; unavailable: string
}

export function EnrollPanel({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<EnrollState | null, FormData>(
    async () => beginEnrollment(),
    null,
  )

  if (state?.ok) {
    return (
      <div className="mt-4">
        {/* Supabase returns the QR as an SVG data URI. */}
        <Image
          src={state.qr}
          alt=""
          width={220}
          height={220}
          unoptimized
          className="mx-auto rounded-[10px] border border-line bg-white p-2"
        />
        <p className="mt-3 text-[11px] uppercase tracking-[.09em] text-mut">{labels.secret}</p>
        <code className="mt-1 block break-all rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[13px]">
          {state.secret}
        </code>
        <MfaForm
          factorId={state.factorId}
          labels={{
            code: labels.code,
            verify: labels.verify,
            invalid: labels.invalid,
            failed: labels.failed,
          }}
        />
      </div>
    )
  }

  return (
    <form action={action} className="mt-4">
      {state && !state.ok ? (
        <p role="alert" className="mb-3 text-[12.5px] font-semibold text-ink">
          {state.error === 'unavailable' ? labels.unavailable : labels.failed}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full cursor-pointer rounded-[10px] border-none bg-ac px-[22px] py-3 text-[13.5px] font-bold text-ink disabled:opacity-60"
      >
        {labels.start}
      </button>
    </form>
  )
}
