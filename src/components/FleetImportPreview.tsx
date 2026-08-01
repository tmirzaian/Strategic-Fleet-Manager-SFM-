import { CheckCircle2, AlertTriangle, ArrowRightLeft, X } from 'lucide-react'
import type { FleetExportEnvelope } from '../utils/fleetSerialization'
import type { FleetImportSummary } from '../utils/fleetImport'

export interface FleetImportPreviewProps {
  envelope: FleetExportEnvelope
  summary: FleetImportSummary
  warnings: string[]
  wasMigrated: boolean
  onCancel: () => void
  onReplace: () => void
}

/**
 * EWO-094 — the Commander Preview step. Purely presentational: every
 * number here was already computed by `buildFleetImportPreview` from the
 * fully validated, fully migrated, fully merged (would-be) state — this
 * component inspects that result, it never re-derives or re-validates
 * anything itself (the work order's own architectural principle: "The
 * Preview is simply an inspection of the already-validated state").
 */
export default function FleetImportPreview({ envelope, summary, warnings, wasMigrated, onCancel, onReplace }: FleetImportPreviewProps) {
  const exportedAtLabel = envelope.exportedAt ? new Date(envelope.exportedAt).toLocaleString() : 'Unknown'

  return (
    <div className="panel p-4 text-sm space-y-4 border border-cyan/30">
      <div className="flex items-center justify-between gap-3">
        <p className="text-white font-medium">Import Preview</p>
        <button onClick={onCancel} aria-label="Cancel import" className="text-muted hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted/70 mb-2">Fleet Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <p className="text-lg text-white font-display font-bold">{summary.ships}</p>
            <p className="text-[11px] text-muted">Ships</p>
          </div>
          <div>
            <p className="text-lg text-white font-display font-bold">{summary.hangarItems}</p>
            <p className="text-[11px] text-muted">Hangar Items</p>
          </div>
          <div>
            <p className="text-lg text-white font-display font-bold">{summary.installedComponents}</p>
            <p className="text-[11px] text-muted">Installed Components</p>
          </div>
          <div>
            <p className="text-lg text-white font-display font-bold">{summary.customBuilds}</p>
            <p className="text-[11px] text-muted">Custom Builds</p>
          </div>
          <div>
            <p className="text-lg text-white font-display font-bold">{summary.reservations}</p>
            <p className="text-[11px] text-muted">Reservations</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted/70 mb-1">Metadata</p>
        <div className="text-xs text-muted space-y-0.5">
          <p>
            Exported: <span className="text-white">{exportedAtLabel}</span>
          </p>
          <p>
            Exported from: <span className="text-white">{envelope.appVersion}</span>
          </p>
          <p>
            Schema version: <span className="text-white">{envelope.schemaVersion}</span>
          </p>
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted/70 mb-1">Validation</p>
        {warnings.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 size={13} /> Compatible — no records were skipped
          </p>
        ) : (
          <div className="space-y-1">
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
        {wasMigrated && (
          <p className="flex items-center gap-1.5 text-xs text-cyan mt-1">
            <ArrowRightLeft size={13} /> Migrated from an older schema version — every field was upgraded automatically.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 border border-white/15 text-white text-xs font-medium py-2 rounded-lg hover:border-white/35 transition-colors">
          Cancel
        </button>
        <button onClick={onReplace} className="flex-1 bg-danger text-white text-xs font-semibold py-2 rounded-lg hover:bg-danger/90 transition-colors">
          Replace Current Fleet
        </button>
      </div>
    </div>
  )
}
