import type { ReactNode } from 'react'

export interface CriticalMetricTileProps {
  icon: any
  label: string
  value: string | number
  accent?: string
  children?: ReactNode
}

/**
 * EWO-011 — the one shared visual scale for every critical operational
 * count on Mission Control (Ships Active, Needed Items, Mission Ready,
 * Loadouts In Progress, Factory Loadout, Missing Components, Unreserved
 * Inventory). Number size, icon scale, label scale, and padding are fixed
 * here so no section can drift smaller or larger than another — only the
 * Overall Fleet Readiness percentage is allowed to read larger, as the
 * sole primary instrument.
 */
export default function CriticalMetricTile({ icon: Icon, label, value, accent, children }: CriticalMetricTileProps) {
  return (
    <div className="panel p-4 flex items-start gap-3 min-w-0">
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
