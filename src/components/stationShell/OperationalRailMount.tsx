import type { ReactNode } from 'react'

/**
 * EWO-109 (Part B/C) — the Operational Control Rail's mounting mechanism:
 * sticky positioning, stacking order, and a backdrop so it stays legible
 * over scrolled content. Owns only the mount, not the rail's own visual
 * housing — Flight Commander's `IntelligenceControlRail` keeps its own
 * recessed-bar styling and every filter/search behavior unchanged (Part
 * H). Conservative scope, consistent with Part E's narrower "approved"
 * list not naming this region's own inner styling for extraction yet —
 * only the positional mechanism moved.
 */
export default function OperationalRailMount({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 pt-1 pb-1 bg-bg/90 backdrop-blur-sm" data-testid="operational-rail-mount">
      {children}
    </div>
  )
}
