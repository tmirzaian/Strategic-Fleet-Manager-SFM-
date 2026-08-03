import PageEnvironment from '../layout/PageEnvironment'
import type { EnvironmentId } from '../../config/assets/types'

export interface FlagshipEnvironmentLayerProps {
  /**
   * The active Station's own environment plate, promoted to full-viewport
   * authority (EWO-115 Part B). Omitted on every route that hasn't been
   * migrated onto the full-viewport model yet — those routes fall back to
   * the ambient gradient alone, exactly as every route did before this
   * EWO (EWO-113). Still just a typed asset identifier, the same
   * no-business-logic contract `StationEnvironmentMount` already
   * established — this component never learns which Station it's
   * dressing, only App.tsx's own route knowledge decides the id.
   */
  environmentId?: EnvironmentId
}

/**
 * EWO-115 (Part B) — the flagship's own persistent backdrop, promoted from
 * a `<main>`-confined background (EWO-113's original `FlagshipFrame`) to a
 * true `position: fixed; inset: 0` layer that renders behind the entire
 * viewport, including underneath the Sidebar's own column — the mechanism
 * Part B's "environment may extend beneath the left structural navigation
 * bulkhead" requires. Rendered once, as the very first element in
 * `App.tsx`, entirely outside the flex row Sidebar/Threshold/`<main>`
 * occupy, so it is never confined to their bounds.
 *
 * Two layers, always in this order: the ambient radial gradient (EWO-113's
 * original treatment, present unconditionally on every route — the
 * flagship's own base lighting) and, only when `environmentId` is
 * supplied, the named Station's own commissioned plate on top of it,
 * full-bleed, with no border or rounding — deliberately not
 * `StationEnvironmentMount` (that component's bordered, rounded hero cell
 * is exactly the "obvious rectangular image card boundary" Part B
 * prohibits for a Station using the full-viewport model).
 *
 * `aria-hidden` and `pointer-events-none` throughout — purely decorative,
 * never intercepts interaction or assistive tech. No business logic: it
 * takes no ship, fleet, or Station-content prop of any kind.
 */
export default function FlagshipEnvironmentLayer({ environmentId }: FlagshipEnvironmentLayerProps) {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true" data-testid="flagship-environment-layer">
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 1400px 700px at 50% -15%, rgba(53,208,255,0.035), transparent 65%), #071016',
        }}
      />
      {environmentId && (
        <div className="absolute inset-0" data-testid="flagship-environment-layer-plate">
          <PageEnvironment id={environmentId} />
        </div>
      )}
    </div>
  )
}
