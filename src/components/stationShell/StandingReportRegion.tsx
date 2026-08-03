import type { ReactNode } from 'react'

export interface StandingReportRegionProps {
  children: ReactNode
  testId?: string
  /** Renders the generic radar-sweep "active monitoring" visual behind the
   * report body (reused, not new artwork — respects `prefers-reduced-motion`,
   * src/index.css). Defaults on; a Station may opt out if its own domain
   * has no natural "sweep" metaphor. */
  monitoringVisual?: boolean
}

/**
 * EWO-109 (Part B/E) — the Standing Report region, one of the three
 * primitives QDS-004 Part G approved for extraction: the panel framing
 * and monitoring-indicator treatment are shared architecture; the exact
 * copy (title, body, status list) is always Station-owned content
 * (QDS-003 Part H) passed as children. This component holds no domain
 * vocabulary — it does not know what "Standing Watch," "Fleet
 * Intelligence," or any other Station-specific term means.
 *
 * Deliberately does not mount its own `PageEnvironment` — a Station using
 * this region beneath its own `StationEnvironmentMount` already has the
 * compartment's atmosphere established; a second copy here would be
 * exactly the "obvious repeated tile" QDS-004 Part C.7 warns against
 * (EWO-108's own finding, carried forward unchanged).
 */
export default function StandingReportRegion({ children, testId = 'standing-report-region', monitoringVisual = true }: StandingReportRegionProps) {
  return (
    <div className="relative overflow-hidden rounded-md border border-white/10 bg-black/20 backdrop-blur-sm p-8 text-center" data-testid={testId}>
      {monitoringVisual && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-64 h-64 rounded-full border border-gold/15 overflow-hidden relative">
            <div className="absolute inset-0 animate-radar-sweep" style={{ background: 'conic-gradient(from 0deg, rgba(201,162,39,0.18), transparent 70deg)' }} />
          </div>
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
