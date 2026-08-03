import type { ReactNode } from 'react'

export interface StationBriefingRegionProps {
  children: ReactNode
  /** Tailwind width class at the `lg:` breakpoint, e.g. `'lg:w-[360px]'`. Station-supplied — how wide the dark, low-detail band of a given environment actually is depends on that art's own composition, confirmed by direct visual inspection per Station (EWO-108's own approach). */
  widthClassName?: string
}

/**
 * EWO-109 (Part B/C) — the Mounted Briefing Wall region: where
 * Compartment Identity, Operational Condition, and Command Summary
 * physically sit inside a `StationEnvironmentMount`. Owns only layout
 * (position, width, padding, vertical centering) — every word rendered
 * inside it is Station-owned content (QDS-003), never shell content.
 *
 * QDS-004 Open Question #1 (should identity sit inside or outside the
 * environment?) is not resolved by this component — it simply provides
 * the "inside" placement Flight Commander already uses. A future Station
 * needing the "outside" convention (Mission Control's own, per QDS-004
 * A.1/A.8) is not yet supported by this region — see
 * docs/EWO-109-Quartermaster-Station-Shell-Prototype.md Part I.
 */
export default function StationBriefingRegion({ children, widthClassName = 'lg:w-[360px]' }: StationBriefingRegionProps) {
  return <div className={`relative z-10 w-full ${widthClassName} shrink-0 p-4 lg:p-5 flex flex-col justify-center gap-4`}>{children}</div>
}
