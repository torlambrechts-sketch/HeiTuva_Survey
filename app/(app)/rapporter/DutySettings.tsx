'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveDutySettings } from './actions'

type Labels = {
  open: string; close: string; owner: string; nobody: string
  cadence: string; cadence6: string; cadence12: string; cadence24: string
  reminder: string; reminder2: string; reminder4: string; reminder8: string
  publish: string
}

/**
 * The duty settings disclosure — HeiTuva.dc.html:1051-1090.
 *
 * One deviation from the bundle, logged as D56: "Ansvarlig" is a free-text
 * input in the prototype and a member picker here. `duties.owner_member_id` is
 * a reference to a real person, and it has to be: the owner is who the deadline
 * chip chases and who the reminder goes to. A typed name that resolves to
 * nobody would be a label pretending to be an assignment.
 */
export function DutySettings({
  definitionKey,
  members,
  canEdit,
  ownerMemberId,
  intervalMonths,
  reminderWeeks,
  publish,
  labels,
}: {
  definitionKey: string
  members: { id: string; name: string }[]
  canEdit: boolean
  ownerMemberId: string | null
  intervalMonths: number | null
  reminderWeeks: number
  publish: boolean
  labels: Labels
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const [publishOn, setPublishOn] = useState(publish)

  function save(patch: Parameters<typeof saveDutySettings>[0]) {
    startTransition(async () => {
      const result = await saveDutySettings(patch)
      if (result.ok) router.refresh()
    })
  }

  const field =
    'touch-44-field min-w-0 flex-1 rounded-[9px] border border-line bg-sf px-[11px] py-2 text-[12.5px] text-ink outline-none'
  const label = 'w-24 flex-none text-[12.5px] text-mut'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="touch-44 mt-3 cursor-pointer rounded-[9px] border border-line bg-transparent px-[14px] py-2 text-[12.5px] font-semibold text-ink"
      >
        {open ? labels.close : labels.open}
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-[11px]">
          <label className="flex flex-wrap items-center gap-[10px]">
            <span className={label}>{labels.owner}</span>
            <select
              className={field}
              disabled={!canEdit}
              defaultValue={ownerMemberId ?? ''}
              onChange={(e) =>
                save({ definitionKey, ownerMemberId: e.target.value ? e.target.value : null })
              }
            >
              <option value="">{labels.nobody}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-wrap items-center gap-[10px]">
            <span className={label}>{labels.cadence}</span>
            <select
              className={field}
              disabled={!canEdit}
              defaultValue={String(intervalMonths ?? 12)}
              onChange={(e) =>
                save({ definitionKey, intervalMonths: Number(e.target.value) as 6 | 12 | 24 })
              }
            >
              <option value="6">{labels.cadence6}</option>
              <option value="12">{labels.cadence12}</option>
              <option value="24">{labels.cadence24}</option>
            </select>
          </label>

          <label className="flex flex-wrap items-center gap-[10px]">
            <span className={label}>{labels.reminder}</span>
            <select
              className={field}
              disabled={!canEdit}
              defaultValue={String(reminderWeeks)}
              onChange={(e) =>
                save({ definitionKey, reminderWeeks: Number(e.target.value) as 2 | 4 | 8 })
              }
            >
              <option value="2">{labels.reminder2}</option>
              <option value="4">{labels.reminder4}</option>
              <option value="8">{labels.reminder8}</option>
            </select>
          </label>

          <div className="flex items-center gap-[10px]">
            <span className="flex-1 text-[12.5px] text-mut">{labels.publish}</span>
            <button
              type="button"
              role="switch"
              aria-checked={publishOn}
              aria-label={labels.publish}
              disabled={!canEdit}
              onClick={() => {
                const next = !publishOn
                setPublishOn(next)
                save({ definitionKey, publish: next })
              }}
              className="touch-44 flex h-6 w-[42px] flex-none cursor-pointer rounded-full border-none p-[3px]"
              style={{
                background: publishOn ? 'var(--ac)' : 'var(--sf2)',
                justifyContent: publishOn ? 'flex-end' : 'flex-start',
              }}
            >
              <span className="block h-[18px] w-[18px] rounded-full bg-white" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
