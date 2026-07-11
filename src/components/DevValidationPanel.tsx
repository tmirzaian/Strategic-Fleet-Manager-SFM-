import { useState } from 'react'
import { Bug, ChevronDown, AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import { runFullValidation } from '../engine/validation'
import Badge from './Badge'
import type { ValidationSeverity } from '../types'

function severityBadgeTone(severity: ValidationSeverity) {
  if (severity === 'ERROR') return 'danger' as const
  if (severity === 'WARNING') return 'warning' as const
  return 'muted' as const
}

function severityIcon(severity: ValidationSeverity) {
  if (severity === 'ERROR') return AlertOctagon
  if (severity === 'WARNING') return AlertTriangle
  return Info
}

/**
 * Developer-only diagnostics panel (Alpha 2.1, Part 24) — collapsed and
 * out of the way in normal use. Reads directly from the same
 * runFullValidation() the rest of the app's validation guarantees are
 * built on, so this is never a second, disconnected reporting path.
 * Internal names/ids are only shown once expanded, not surfaced in
 * normal UI copy.
 */
export default function DevValidationPanel() {
  const [open, setOpen] = useState(false)
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const fleetAssets = useFleetStore((s) => s.fleetAssets)
  const shipDefinitions = useFleetStore((s) => s.shipDefinitions)

  const summary = runFullValidation({ ships, builds, hardpoints, fleetAssets, shipDefinitions })

  const counts: Record<string, number> = {}
  for (const issue of summary.issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1

  return (
    <div className="panel overflow-hidden border-white/5">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
        <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
          <Bug size={14} /> Developer Diagnostics
          {summary.errorCount > 0 && <Badge tone="danger">{summary.errorCount} error{summary.errorCount !== 1 ? 's' : ''}</Badge>}
          {summary.warningCount > 0 && <Badge tone="warning">{summary.warningCount} warning{summary.warningCount !== 1 ? 's' : ''}</Badge>}
          {summary.errorCount === 0 && summary.warningCount === 0 && <Badge tone="success">Clean</Badge>}
        </span>
        <ChevronDown size={14} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <div className="text-muted uppercase tracking-widest text-[10px]">Invalid Build Refs</div>
              <div className="font-display font-bold text-white">{(counts['MISSING_ACTIVE_BUILD'] ?? 0) + (counts['ORPHANED_BUILD'] ?? 0)}</div>
            </div>
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <div className="text-muted uppercase tracking-widest text-[10px]">Incompatible Targets</div>
              <div className="font-display font-bold text-white">{counts['INCOMPATIBLE_TARGET'] ?? 0}</div>
            </div>
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <div className="text-muted uppercase tracking-widest text-[10px]">Unresolved Factory Items</div>
              <div className="font-display font-bold text-white">{counts['UNRESOLVED_FACTORY_DATA'] ?? 0}</div>
            </div>
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <div className="text-muted uppercase tracking-widest text-[10px]">Orphaned Loadouts</div>
              <div className="font-display font-bold text-white">{counts['ORPHANED_LOADOUT'] ?? 0}</div>
            </div>
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <div className="text-muted uppercase tracking-widest text-[10px]">Invalid Procurement</div>
              <div className="font-display font-bold text-white">
                {(counts['PROCUREMENT_INVALID_TARGET'] ?? 0) + (counts['PROCUREMENT_MISSING_BUILD'] ?? 0) + (counts['PROCUREMENT_MISSING_FLEET_ASSET'] ?? 0)}
              </div>
            </div>
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <div className="text-muted uppercase tracking-widest text-[10px]">Missing Ship Definitions</div>
              <div className="font-display font-bold text-white">{counts['MISSING_SHIP_DEFINITION'] ?? 0}</div>
            </div>
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <div className="text-muted uppercase tracking-widest text-[10px]">Duplicate IDs</div>
              <div className="font-display font-bold text-white">{counts['DUPLICATE_ID'] ?? 0}</div>
            </div>
          </div>

          {summary.issues.length === 0 ? (
            <p className="text-xs text-success">No validation issues found.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {summary.issues.map((issue, i) => {
                const Icon = severityIcon(issue.severity)
                return (
                  <div key={`${issue.code}-${issue.entityId}-${i}`} className="flex items-start gap-2 text-xs bg-black/20 rounded-lg px-3 py-2">
                    <Icon size={13} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={severityBadgeTone(issue.severity)}>{issue.code}</Badge>
                        <span className="font-mono text-muted/70 text-[10px]">{issue.entityType}:{issue.entityId}</span>
                      </div>
                      <p className="text-white/80 mt-1">{issue.message}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
