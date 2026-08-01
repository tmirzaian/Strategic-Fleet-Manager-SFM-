import { useRef, useState } from 'react'
import { ScrollText, TrendingUp, Download, Upload, AlertOctagon, CheckCircle2 } from 'lucide-react'
import { useFleetStore, buildFleetExportSnapshot, buildFleetImportPreview, type FleetImportOutcome } from '../store/useFleetStore'
import { serializeFleetExportEnvelope, suggestFleetExportFilename, type FleetExportEnvelope } from '../utils/fleetSerialization'
import DevValidationPanel from '../components/DevValidationPanel'
import FleetImportPreview from '../components/FleetImportPreview'
import { APP_VERSION_LABEL } from '../config/appVersion'
import { resolveCertifiedGameVersionLabel } from '../utils/scVersion'
import { resolveCaptainsLogAccentSource } from '../config/assets'
import CertificationBadge from '../components/branding/CertificationBadge'

type FleetImportSuccessOutcome = Extract<FleetImportOutcome, { ok: true }>

interface FleetImportCompletion {
  ships: number
  hangarItems: number
  customBuilds: number
  warnings: number
}

export default function CaptainsLog() {
  const log = useFleetStore((s) => s.log)
  const certifiedGameVersion = resolveCertifiedGameVersionLabel()
  const [lastExportFilename, setLastExportFilename] = useState<string | null>(null)
  // Chief Architect Asset Handoff — a plain CSS background layer inside
  // the certification card itself, never EnvironmentBay/PageEnvironment:
  // this card is small and narrow (max-w-2xl), not a bounded department
  // room, so the room/vignette treatment doesn't apply here.
  const certificationAccentSrc = resolveCaptainsLogAccentSource('certification')

  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<FleetImportSuccessOutcome | null>(null)
  const [importCompletion, setImportCompletion] = useState<FleetImportCompletion | null>(null)
  // EWO-094 (Step 6) — an in-memory-only recovery snapshot of the fleet
  // that was just replaced, captured automatically by
  // `replaceFleetFromImport` itself. No file download and no Restore UI
  // are authorized under this EWO — held here only as the safety artifact
  // the work order calls for.
  const [lastRecoverySnapshot, setLastRecoverySnapshot] = useState<FleetExportEnvelope | null>(null)

  // EWO-093 — Fleet Export. Builds the exact same payload
  // `partialize` already persists to localStorage (via the shared
  // `buildFleetExportSnapshot`/`buildFleetPersistencePayload`
  // functions — never a second, parallel serialization), then triggers
  // a standard browser file download.
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

  // EWO-094 — Steps 2-4. Reading the file and building the Preview never
  // writes anything: `buildFleetImportPreview` runs the existing
  // migrate/merge pipeline entirely in memory. Selecting a new file always
  // clears any prior error/preview/completion state first.
  function handleImportFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the exact same file later
    if (!file) return
    setImportError(null)
    setImportPreview(null)
    setImportCompletion(null)
    file
      .text()
      .then((text) => {
        const outcome = buildFleetImportPreview(text, useFleetStore.getState())
        if (!outcome.ok) {
          setImportError(outcome.message)
          return
        }
        setImportPreview(outcome)
      })
      .catch(() => setImportError('This file could not be read.'))
  }

  // EWO-094 — Step 5 (Cancel branch). Zero store interaction of any kind.
  function handleCancelImport() {
    setImportPreview(null)
    setImportError(null)
  }

  // EWO-094 — Steps 6-8. `replaceFleetFromImport` itself captures the
  // recovery snapshot and persists (via the existing persist middleware's
  // own write path, triggered by its internal `set()`) — this handler only
  // reacts to the result.
  function handleReplaceFleet() {
    if (!importPreview) return
    const recoverySnapshot = useFleetStore.getState().replaceFleetFromImport(importPreview.mergedState)
    setLastRecoverySnapshot(recoverySnapshot)
    setImportCompletion({
      ships: importPreview.summary.ships,
      hangarItems: importPreview.summary.hangarItems,
      customBuilds: importPreview.summary.customBuilds,
      warnings: importPreview.warnings.length,
    })
    setImportPreview(null)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Captain's Log</p>
        {/* EWO-100 (Phase 1) — standardized operational status line. */}
        <h1 className="text-2xl font-display font-bold text-white">Recent Fleet Activity</h1>
      </div>

      <div className="panel p-4 text-sm relative overflow-hidden">
        {certificationAccentSrc && (
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${certificationAccentSrc})`,
              backgroundSize: 'cover',
              backgroundPosition: 'left center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.18,
            }}
          />
        )}
        {/* EWO-095B — the seal is a reusable branding overlay, never
            embedded in the illustration itself. Layered above the artwork
            but below the text (z-10 vs. the text wrapper's z-20) so it can
            never obscure the certification copy even if the card's
            content ever grows. */}
        <CertificationBadge variant="community" />
        <div className="relative z-20">
          <p className="text-white font-medium">Strategic Fleet Manager {APP_VERSION_LABEL}</p>
          <p className="text-[11px] uppercase tracking-widest text-muted/70 mt-2">Certified for</p>
          <p className="text-white">{certifiedGameVersion ? `Star Citizen LIVE ${certifiedGameVersion}` : 'Not yet certified — Golden Fleet catalog not generated locally'}</p>
        </div>
      </div>

      <div className="panel p-4 text-sm">
        <p className="text-white font-medium mb-1">Fleet Data</p>
        <p className="text-muted text-xs mb-3">Download a portable snapshot of your fleet, or import one to replace your current fleet.</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportFleet}
            className="inline-flex items-center gap-1.5 border border-cyan/30 text-cyan font-medium text-xs px-3 py-2 rounded-lg hover:bg-cyan/10 hover:border-cyan/50 transition-colors"
          >
            <Download size={13} /> Export Fleet Data
          </button>
          <button
            onClick={() => importFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 border border-white/15 text-white font-medium text-xs px-3 py-2 rounded-lg hover:border-white/35 transition-colors"
          >
            <Upload size={13} /> Import Fleet Data
          </button>
          <input ref={importFileInputRef} type="file" accept="application/json,.json" onChange={handleImportFileSelected} className="hidden" />
        </div>
        {lastExportFilename && <p className="text-[11px] text-success mt-2">Exported as {lastExportFilename}</p>}

        {importError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            <AlertOctagon size={14} className="mt-0.5 shrink-0" />
            <span>
              Import failed: {importError} No migration was attempted and nothing was written.
            </span>
          </div>
        )}

        {importCompletion && (
          <div className="mt-3 flex items-start gap-2 text-xs text-success bg-success/10 border border-success/30 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span>
              Fleet imported successfully. Ships: {importCompletion.ships}. Hangar Items: {importCompletion.hangarItems}. Custom Builds: {importCompletion.customBuilds}. Warnings:{' '}
              {importCompletion.warnings}.
              {lastRecoverySnapshot && ' A recovery snapshot of your previous fleet was captured for this session.'}
            </span>
          </div>
        )}
      </div>

      {importPreview && (
        <FleetImportPreview
          envelope={importPreview.envelope}
          summary={importPreview.summary}
          warnings={importPreview.warnings}
          wasMigrated={importPreview.wasMigrated}
          onCancel={handleCancelImport}
          onReplace={handleReplaceFleet}
        />
      )}

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
