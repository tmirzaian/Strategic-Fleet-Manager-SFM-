import type { ReactNode } from 'react'

/**
 * EWO-109 (Part C) — the Supporting Intelligence region, per QDS-001 Part
 * C ("Optional"). Exposed for Part C's own slot-architecture requirement
 * ("expose compositional regions") even though Flight Commander does not
 * currently use it — QDS-003 Part A.4 already found Flight Commander has
 * "no supporting-details region distinct from" its matched-component
 * destinations, so this region is available, tested, and unused by this
 * EWO's one consumer. A future Station with a genuine secondary/
 * contextual section (e.g. Mission Control's own Quartermaster Report)
 * is the intended first real consumer — see
 * docs/EWO-109-Quartermaster-Station-Shell-Prototype.md Part I.
 */
export default function SupportingWorkspace({ children }: { children: ReactNode }) {
  return <div data-testid="supporting-workspace">{children}</div>
}
