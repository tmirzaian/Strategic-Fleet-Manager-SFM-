import { useState } from 'react'
import { ScrollText, TrendingUp, Download } from 'lucide-react'
import { useFleetStore, buildFleetExportSnapshot } from '../store/useFleetStore'
import { serializeFleetExportEnvelope, suggestFleetExportFilename } from '../utils/fleetSerialization'
import DevValidationPanel from '../components/DevValidationPanel'
import { APP_VERSION_LABEL } from '../config/appVersion'
import { resolveCertifiedGameVersionLabel } from '../utils/scVersion'

export default function CaptainsLog() {
  const log = useFleetStore((s) => s.log)
  const certifiedGameVersion = resolveCertifiedGameVersionLabel()
  const [lastExportFilename, setLastExportFilename] = useState<string | null>(null)

  // EWO-093 — Fleet Export. Builds the exact same payload
  // `partialize` already persists to localStorage (via the shared
  // `buildFleetExportSnapshot`/`buildFleetPersistencePayload`
  // functions — never a second, parallel serialization), then triggers
  // a standard browser file download. No Import/Backup/Restore here —
  // see docs/Beta-2.1-Fleet-Export-Architecture.md for that boundary.
  function handleExportFleet() {
    const envelope = buildFleetExportSnapshot(useFleetStore.getState())
    const json = serializeFleetExportEnvelope(envelope)
    const filename = suggestFleetExportFilename(envelope)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    setLastExportFilename(filename)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Captain's Log</p>
        <h1 className="text-2xl font-display font-bold text-white">What happened?</h1>
      </div>

      <div className="panel p-4 text-sm">
        <p className="text-white font-medium">Strategic Fleet Manager {APP_VERSION_LABEL}</p>
        <p className="text-[11px] uppercase tracking-widest text-muted/70 mt-2">Certified for</p>
        <p className="text-white">{certifiedGameVersion ? `Star Citizen LIVE ${certifiedGameVersion}` : 'Not yet certified — Golden Fleet catalog not generated locally'}</p>
      </div>

      <div className="panel p-4 text-sm">
        <p className="text-white font-medium mb-1">Fleet Data</p>
        <p className="text-muted text-xs mb-3">Download a portable snapshot of your fleet — Fleet Registry, Loadouts, Hangar Inventory, and Reservations.</p>
        <button
          onClick={handleExportFleet}
          className="inline-flex items-center gap-1.5 border border-cyan/30 text-cyan font-medium text-xs px-3 py-2 rounded-lg hover:bg-cyan/10 hover:border-cyan/50 transition-colors"
        >
          <Download size={13} /> Export Fleet Data
        </button>
        {lastExportFilename && <p className="text-[11px] text-success mt-2">Exported as {lastExportFilename}</p>}
      </div>

      <DevValidationPanel />

      <div className="relative pl-6">
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-white/10" />
        <div className="space-y-4">
          {log.map((entry) => (
            <div key={entry.id} className="relative">
              <div className="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full bg-cyan/20 border-2 border-cyan flex items-center justify-center" />
              <div className="panel p-4">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs font-medium text-cyan uppercase tracking-widest">{entry.action}</span>
                  <span className="text-[11px] text-muted font-mono">{entry.timestamp}</span>
                </div>
                <p className="text-sm text-white flex items-start gap-2">
                  <ScrollText size={14} className="text-muted mt-0.5 shrink-0" />
                  {entry.details}
                </p>
                {entry.readinessBefore !== undefined && entry.readinessAfter !== undefined && (
                  <p className="text-xs text-success flex items-center gap-1.5 mt-2">
                    <TrendingUp size={13} /> Readiness {entry.readinessBefore}% → {entry.readinessAfter}%
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
