'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveCompany } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'

export type Company = {
  name: string
  orgnr: string
  address: string
  contact_name: string
  contact_email: string
  dpo: string
  timezone: string
  workspace: string
  worklistView: string
}

const label = 'block text-[11px] uppercase tracking-[.09em] text-mut'
const field =
  'mt-1.5 box-border w-full rounded-[10px] border border-line bg-bg px-[13px] py-[11px] text-[14px] text-ink outline-none'

/*
  Q50 — the zones offered for `organizations.timezone`.

  A SELECT AND NOT A TEXT INPUT, which is a control the bundle does not draw
  (D56's exception): the column is validated against `pg_timezone_names` by a
  trigger, so a free-text field lets a customer type `CET` or `Oslo` and meet a
  raised exception on save. The real constraint gets the real control, styled as
  the other fields in this card are.

  THE LIST ALWAYS CONTAINS THE CURRENT VALUE. That is the point of `zonesFor`
  rather than a bare constant: the database accepts any zone PostgreSQL knows,
  this list is the handful a Nordic customer plausibly wants, and the two are not
  the same set. A row whose timezone was set by any other route must not be
  silently rewritten by opening this form — an enumeration offered as a
  convenience must never narrow what the column already holds.
*/
const COMMON_ZONES = [
  'Europe/Oslo',
  'Europe/Stockholm',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Warsaw',
  'Europe/Vilnius',
  'UTC',
]

function zonesFor(current: string): string[] {
  return COMMON_ZONES.includes(current) ? COMMON_ZONES : [current, ...COMMON_ZONES]
}

/**
 * Firmaopplysninger card — HeiTuva.dc.html:1386-1397. Six fields in a 2-col
 * grid, in the order the design's `companyFields` array defines them.
 *
 * The design has no save button on this card, so there is none here: it saves
 * when a changed field loses focus. The only addition is the "Lagret ✓" chip in
 * the header, which is the same treatment Profil's Om meg card uses — see
 * docs/DEVIATIONS.md D23.
 */
export type WorkspaceOption = { key: string; label: string }

export function CompanyForm({
  company,
  workspaces,
}: {
  company: Company
  /* Read from `public.workspaces` by the page, not listed here. A component
     holding the four keys would be the enumeration this project has written
     down eleven times; the registry is the authority and adding a workspace
     must stay a row. */
  workspaces: WorkspaceOption[]
}) {
  const t = useTranslations('admin')
  const form = useRef<HTMLFormElement>(null)
  const dirty = useRef(false)
  const [state, setState] = useState<AdminResult | null>(null)
  const [pending, startTransition] = useTransition()

  // The action is called directly rather than through a form submission.
  // requestSubmit() from inside a focusout handler did not reach the action —
  // the capture harness caught it: the field saved nothing and no chip
  // appeared. Calling it with the form's own FormData has no such dependency.
  const save = () => {
    if (!form.current) return
    const data = new FormData(form.current)
    startTransition(async () => setState(await saveCompany(null, data)))
  }

  const fields: { name: keyof Company; label: string; type?: string }[] = [
    { name: 'name', label: t('fName') },
    { name: 'orgnr', label: t('fOrgnr') },
    { name: 'address', label: t('fAddress') },
    { name: 'contact_name', label: t('fContact') },
    { name: 'contact_email', label: t('fEmail'), type: 'email' },
    { name: 'dpo', label: t('fDpo') },
  ]

  return (
    <section className="rounded-[18px] border border-line bg-sf p-6">
      {/* The saved chip is 100px wide beside a 22px display heading; at 320px
          the pair is 323px. Wrapping keeps both at their design size. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[22px] font-medium">{t('companyHeading')}</h2>
        {state?.ok ? (
          <span
            role="status"
            className="rounded-full bg-ac2 px-[15px] py-[9px] text-[12.5px] font-semibold"
          >
            {t('saved')}
          </span>
        ) : null}
      </div>

      <form
        ref={form}
        onSubmit={(e) => {
          // Enter in a field, and the visually hidden submit below.
          e.preventDefault()
          dirty.current = false
          save()
        }}
        onChange={() => {
          dirty.current = true
        }}
        onBlur={(e) => {
          // Only when focus actually leaves the card — moving between two of
          // its own fields is not a moment to save.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          if (!dirty.current) return
          dirty.current = false
          save()
        }}
      >
        <div className="mt-[18px] grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className={label}>{f.label}</span>
              <input
                name={f.name}
                type={f.type ?? 'text'}
                defaultValue={company[f.name]}
                required={f.name === 'name'}
                className={field}
              />
            </label>
          ))}

          {/* V5-2 — the organisation's default Arbeidsliste view. The column
              half of Tor's «cookie plus column, as Q122»: this is what a person
              sees before they choose, and their own choice is the cookie
              `heituva.worklist`, which is per-device and says so.

              TWO OPTIONS AND NO COLUMN SET, because measured there are no
              column toggles on that screen at all — `colOwner`..`colScore`
              render inside `isUitest` (v5:2959-2971) and `isTasks` contains
              none of them. A house default for «list or board» is a real
              choice; one for «show the score column» would have been a setting
              nobody asked for. */}
          <label className="block">
            <span className={label}>{t('fWorklistView')}</span>
            <select
              name="worklist_view"
              defaultValue={company.worklistView}
              className={`${field} touch-44-field`}
            >
              <option value="list">{t('fWorklistList')}</option>
              <option value="board">{t('fWorklistBoard')}</option>
            </select>
          </label>

          {/* Q50 — the clock every scheduled send runs on. Read by all three
              schedule sites since M:0051 and, until now, written by nothing:
              a customer outside Oslo time could not say so, and their «09:00»
              pulse went out at 09:00 Oslo. */}
          <label className="block">
            <span className={label}>{t('fTimezone')}</span>
            {/* `touch-44-field` as well as the shared `field` class: a <select>
                renders a little shorter than an <input> at the same padding, so
                the inputs above clear 44px and this did not — CI measured 300x44
                at 390px. The helper only applies below md, so the desktop
                control is untouched. */}
            <select
              name="timezone"
              defaultValue={company.timezone}
              className={`${field} touch-44-field`}
            >
              {zonesFor(company.timezone).map((z) => (
                <option key={z} value={z}>
                  {z.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>

          {/* W0 · Q122 — the organisation's DEFAULT arbeidsflate: what a person
              sees before they have chosen one on this device.

              NOT DRAWN IN ANY BUNDLE, and logged as such (D159). v4 draws the
              header chip, which is the per-person choice; `ORG_WORKSPACE` is a
              hard-coded constant in the prototype with no control behind it at
              all. So the org default is genuinely unspecified, and CLAUDE.md's
              rule for that is the minimal consistent option, logged — not an
              invention and not a guess at a screen.

              Minimal and consistent means THIS form and THIS control: Q50's
              timezone is the exact precedent one label above — an org-level
              default, a select, in the Firma tab — so the styling is taken from
              it rather than chosen, `touch-44-field` included and for the same
              measured reason. */}
          <label className="block">
            <span className={label}>{t('fWorkspace')}</span>
            <select
              name="workspace"
              defaultValue={company.workspace}
              className={`${field} touch-44-field`}
            >
              {workspaces.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 text-[13px] leading-[1.6] text-mut">{t('companyNote')}</p>

        {state && !state.ok ? (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
            {t(ADMIN_ERROR_KEY[state.error])}
          </p>
        ) : null}

        {/* Submit exists for keyboard users who press Enter in a field, and as
            the non-JS fallback; it is not part of the design's layout. */}
        <button type="submit" disabled={pending} className="sr-only">
          {t('saveChanges')}
        </button>
      </form>
    </section>
  )
}
