import type { ReactNode } from 'react'

export interface CriticalMetricTileProps {
  icon: any
  label: string
  value: string | number
  accent?: string
  children?: ReactNode
  /** UX-001A.1 (Deliverable 1) — additive only; every existing caller omits
   * this and renders byte-identical to before. The one current use is
   * Mission Control's own "Ships Active" parent-metric outline (Advisory
   * Gold, `docs/UI_ARCHITECTURE.md` §4 — explicitly authorized for this
   * specific case by this mission's own work order, not a general accent). */
  className?: string
}

/**
 * EWO-011 — the one shared visual scale for every critical operational
 * count on Mission Control (Ships Active, Mission Ready, Loadouts In
 * Progress, Factory Loadout, Missing Components, Unreserved Inventory).
 * Number size, icon scale, label scale, and padding are fixed here so no
 * section can drift smaller or larger than another — only the Overall
 * Fleet Readiness percentage is allowed to read larger, as the sole
 * primary instrument. UX-001A retired the old standalone "Needed Items"
 * count in favor of the Hero's own Priority Actions panel.
 */
export default function CriticalMetricTile({ icon: Icon, label, value, accent, children, className }: CriticalMetricTileProps) {
  return (
    <div className={`panel p-4 flex items-start gap-3 min-w-0${className ? ` ${className}` : ''}`}>
      <div className="hidden sm:flex w-10 h-10 rounded-lg bg-cyan/10 items-center justify-center shrink-0">
        <Icon size={18} className="text-cyan" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-display font-bold leading-none" style={accent ? { color: accent } : undefined}>
          {value}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-muted mt-1 truncate">{label}</div>
        {children}
      </div>
    </div>
  )
}
