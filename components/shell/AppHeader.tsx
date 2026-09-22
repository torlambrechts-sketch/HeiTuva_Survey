import { getTranslations } from 'next-intl/server'
import { Logo } from './Logo'

/**
 * The application header. Transcribed from Orgpuls_Offline_Source.html lines 49-66.
 *
 * Sticky, z-40, #FFFDF6 on a #E8DFC9 hairline; inner rail capped at 1180px with
 * 11px/28px padding. Five nav items, then the help and basis controls, the assistant,
 * the role selector and the account chip.
 *
 * Two behaviours from the bundle that are easy to miss and are deliberate here:
 *
 * 1. `measure` stays tinted while you are on `result`, `respond`, `plan` or `wheel`,
 *    because those are all reached from Målinger and the design keeps the trail
 *    visible. But the bold weight is applied only on an exact match, so a tinted
 *    Målinger and a current Målinger are distinguishable.
 * 2. Verneombud only appears in the role list when law mode is on (bundle line 4146).
 */
export type Screen =
  | 'home' | 'measure' | 'result' | 'respond' | 'plan' | 'wheel'
  | 'conv' | 'tasks' | 'settings' | 'conn' | 'report' | 'helpsite'

export type Role = 'daglig_leder' | 'avdelingsleder' | 'verneombud'

const NAV: { key: string; screen: Screen; messageKey: string }[] = [
  { key: 'home', screen: 'home', messageKey: 'innsikt' },
  { key: 'measure', screen: 'measure', messageKey: 'malinger' },
  { key: 'conv', screen: 'conv', messageKey: 'samtaler' },
  { key: 'tasks', screen: 'tasks', messageKey: 'tiltak' },
  { key: 'settings', screen: 'settings', messageKey: 'oppsett' },
]

/** Screens that keep Målinger tinted. Bundle line 95. */
const UNDER_MEASURE: Screen[] = ['result', 'respond', 'plan', 'wheel']

export async function AppHeader({
  screen = 'home',
  role = 'daglig_leder',
  lawMode = true,
  initials = 'TB',
  assistantFace = 'av4',
}: {
  screen?: Screen
  role?: Role
  lawMode?: boolean
  initials?: string
  assistantFace?: string
}) {
  const t = await getTranslations()

  const roles: Role[] = lawMode
    ? ['daglig_leder', 'avdelingsleder', 'verneombud']
    : ['daglig_leder', 'avdelingsleder']

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sf">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-[18px] px-[28px] py-[11px]">
        <Logo />

        <nav className="flex min-w-0 flex-1 gap-[2px]">
          {NAV.map((item) => {
            const exact = screen === item.screen
            const tinted =
              exact || (item.screen === 'measure' && UNDER_MEASURE.includes(screen))
            return (
              <button
                key={item.key}
                type="button"
                aria-current={exact ? 'page' : undefined}
                className={`cursor-pointer rounded-ctl border-none px-[13px] py-[8px] text-[14px] text-ink ${
                  tinted ? 'bg-sbg' : 'bg-transparent'
                } ${exact ? 'font-bold' : 'font-medium'}`}
              >
                {t(`nav.${item.messageKey}`)}
              </button>
            )
          })}
        </nav>

        <span className="flex flex-none items-center gap-[8px]">
          <button
            type="button"
            aria-label={t('header.helpAria')}
            className="flex h-[34px] cursor-pointer items-center gap-[7px] rounded-ctl border border-line bg-transparent px-[13px] text-[12.5px] font-semibold text-ink"
          >
            <span
              aria-hidden="true"
              className="flex h-[17px] w-[17px] items-center justify-center rounded-pill border-[1.5px] border-ink text-[11px] font-bold leading-none"
            >
              ?
            </span>
            {t('header.help')}
          </button>

          <button
            type="button"
            className="h-[34px] cursor-pointer rounded-ctl border border-line bg-transparent px-[13px] text-[12.5px] font-semibold text-ink"
          >
            {t('header.grunnlag')}
          </button>

          <button
            type="button"
            aria-label={t('header.assistantAria')}
            className="flex h-[34px] cursor-pointer items-center gap-[7px] rounded-ctl border border-line bg-transparent py-0 pl-[4px] pr-[13px] text-[12.5px] font-semibold text-ink"
          >
            <span
              aria-hidden="true"
              className="block h-[26px] w-[26px] flex-none rounded-btn bg-bg bg-cover bg-center"
              style={{ backgroundImage: `url(/tuva/${assistantFace}.png)` }}
            />
            Tuva
          </button>

          <select
            aria-label={t('header.roleAria')}
            defaultValue={role}
            className="h-[34px] cursor-pointer rounded-ctl border border-line bg-bg px-[11px] text-[12.5px] font-semibold text-ink"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>

          <span className="flex h-[32px] w-[32px] flex-none items-center justify-center rounded-pill bg-sbg text-[12px] font-bold">
            {initials}
          </span>
        </span>
      </div>
    </header>
  )
}
