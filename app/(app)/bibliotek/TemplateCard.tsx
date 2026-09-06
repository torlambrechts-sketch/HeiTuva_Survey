import { UsePackButton } from './UsePackButton'
import { TemplateAdminControls } from './TemplateAdminControls'

export type TemplatePack = {
  id: string
  key: string
  category: string
  legalRef: string | null
  /** The statutory policy the pack brings with it (Q17); null for ordinary packs. */
  policy: { anonymity?: string; respondent_kind?: string; k_threshold?: number; locked?: boolean } | null
  title: string
  audience: string | null
  questionTypes: string[]
  isOwn: boolean
  isPrivate: boolean
  ownerName: string | null
}

/**
 * Template card — HeiTuva.dc.html:1610-1626. 22px padding, 18px radius, tinted
 * surface, min-height 290px, and the type chips filling the remaining space so
 * "Bruk mal" sits on the card's floor whatever the question count.
 */
export function TemplateCard({
  pack,
  tint,
  labels,
  policyLine,
  typeLabels,
  canEdit,
  disabledReason,
}: {
  pack: TemplatePack
  /** Undefined past the fifth standard card — the design leaves those untinted. */
  tint: string | undefined
  labels: {
    eyebrow: string
    meta: string
    use: string
    privateLabel: string
    sharedLabel: string
    deleteLabel: string
    failed: string
  }
  /** «Anonym · terskel 5 · låst» — design brief §7; only for packs with a policy. */
  policyLine?: string | null
  typeLabels: string[]
  canEdit: boolean
  disabledReason?: string
}) {
  return (
    <div
      className="flex min-h-[290px] flex-col rounded-[18px] border border-line p-[22px]"
      style={{ background: tint ?? 'transparent' }}
    >
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[11px] uppercase tracking-[.1em] text-mut">{labels.eyebrow}</span>
        {pack.isOwn && canEdit ? (
          <TemplateAdminControls
            packId={pack.id}
            isPrivate={pack.isPrivate}
            labels={{
              privateLabel: labels.privateLabel,
              sharedLabel: labels.sharedLabel,
              deleteLabel: labels.deleteLabel,
              failed: labels.failed,
            }}
          />
        ) : null}
      </div>

      {pack.legalRef ? (
        <span className="mt-2 self-start rounded-full bg-ac2 px-[11px] py-[5px] text-[11px] font-semibold">
          {pack.legalRef}
        </span>
      ) : null}
      {/* 11.5px, 6px above (NEW:1944-1946) — it stepped down from 12px in v1. */}
      {policyLine ? <p className="mt-1.5 text-[11.5px] text-mut">{policyLine}</p> : null}

      <h3 className="mt-2 font-display text-[21px] font-medium leading-[1.25]">{pack.title}</h3>
      <p className="mt-1 text-[13px] text-mut">{labels.meta}</p>

      <div className="mt-3.5 flex flex-1 flex-wrap content-start gap-1.5">
        {typeLabels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="rounded-full border border-line bg-sf px-2.5 py-[5px] text-[13px] text-mut"
          >
            {label}
          </span>
        ))}
      </div>

      <UsePackButton
        packId={pack.id}
        label={labels.use}
        failedLabel={labels.failed}
        disabledReason={disabledReason}
        className="mt-[18px] w-full p-[11px]"
      />
    </div>
  )
}
