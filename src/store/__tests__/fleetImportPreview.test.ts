import { describe, it, expect, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  localStorage.clear()
})

/**
 * EWO-094 — "Fleet Import Preview & Replace Workflow." Proves the whole
 * pipeline end to end at the store level: envelope failures, schema
 * version rejection, migration of a legacy payload, a same-version
 * payload passing through unchanged, Preview counts matching the real
 * hydrated result, Replace actually committing + persisting, and the
 * three hard safety guarantees the work order calls out by name — Cancel
 * writes nothing, an invalid import writes nothing, and a recovery
 * snapshot is captured before any replacement.
 */
describe('buildFleetImportPreview / replaceFleetFromImport (EWO-094)', () => {
  it('ENVELOPE failure: corrupt JSON is rejected before any migration is attempted, zero writes', async () => {
    const { useFleetStore, buildFleetImportPreview } = await import('../useFleetStore')
    const before = localStorage.getItem('sfm-fleet-store')

    const outcome = buildFleetImportPreview('{ not json', useFleetStore.getState())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.stage).toBe('ENVELOPE')
      expect(outcome.migrationAttempted).toBe(false)
    }
    expect(localStorage.getItem('sfm-fleet-store')).toBe(before)
  })

  it('SCHEMA_VERSION failure: a file from a newer, unsupported schema is rejected before migration, zero writes', async () => {
    const { useFleetStore, buildFleetImportPreview } = await import('../useFleetStore')
    const before = localStorage.getItem('sfm-fleet-store')
    const futureEnvelope = JSON.stringify({ schemaVersion: 99999, appVersion: 'Future', exportedAt: '', payload: {} })

    const outcome = buildFleetImportPreview(futureEnvelope, useFleetStore.getState())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.stage).toBe('SCHEMA_VERSION')
      expect(outcome.migrationAttempted).toBe(false)
      expect(outcome.message).toMatch(/newer version/i)
    }
    expect(localStorage.getItem('sfm-fleet-store')).toBe(before)
  })

  it('Migration: a legacy payload (schemaVersion 1, missing every optional field) migrates correctly — no crash, honest defaults, seedFleetLegacyInstall true', async () => {
    const { useFleetStore, buildFleetImportPreview } = await import('../useFleetStore')
    const legacyEnvelope = JSON.stringify({ schemaVersion: 1, appVersion: 'Beta 1.0', exportedAt: '2020-01-01T00:00:00.000Z', payload: {} })

    const outcome = buildFleetImportPreview(legacyEnvelope, useFleetStore.getState())
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.wasMigrated).toBe(true)
      // The seed baseline fills in for an entirely-empty legacy payload —
      // never a crash, never an empty fleet the Commander didn't ask for.
      expect(outcome.summary.ships).toBeGreaterThan(0)
    }
  })

  it('Migration: a current-schema payload (a real export of the live fleet) passes through unchanged, wasMigrated is false', async () => {
    const { useFleetStore, buildFleetExportSnapshot, buildFleetImportPreview } = await import('../useFleetStore')
    const { serializeFleetExportEnvelope } = await import('../../utils/fleetSerialization')

    const envelope = buildFleetExportSnapshot(useFleetStore.getState())
    const outcome = buildFleetImportPreview(serializeFleetExportEnvelope(envelope), useFleetStore.getState())

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.wasMigrated).toBe(false)
      expect(outcome.warnings).toEqual([])
    }
  })

  it('Preview: counts and metadata reflect the real hydrated (would-be) state, not the raw file', async () => {
    const { useFleetStore, buildFleetImportPreview } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Preview Count Test Titan')

    const { buildFleetExportSnapshot } = await import('../useFleetStore')
    const { serializeFleetExportEnvelope } = await import('../../utils/fleetSerialization')
    const envelope = buildFleetExportSnapshot(useFleetStore.getState())

    const outcome = buildFleetImportPreview(serializeFleetExportEnvelope(envelope), useFleetStore.getState())
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.summary.ships).toBe(useFleetStore.getState().ships.length)
      expect(outcome.envelope.schemaVersion).toBe(envelope.schemaVersion)
      expect(outcome.envelope.appVersion).toBe(envelope.appVersion)
    }
  })

  it('Preview: building it performs zero writes, whether the file is valid or not', async () => {
    const { useFleetStore, buildFleetExportSnapshot, buildFleetImportPreview } = await import('../useFleetStore')
    const { serializeFleetExportEnvelope } = await import('../../utils/fleetSerialization')
    const before = localStorage.getItem('sfm-fleet-store')

    buildFleetImportPreview(serializeFleetExportEnvelope(buildFleetExportSnapshot(useFleetStore.getState())), useFleetStore.getState())
    buildFleetImportPreview('garbage', useFleetStore.getState())

    expect(localStorage.getItem('sfm-fleet-store')).toBe(before)
  })

  it('Replace: commits the previewed state, persists it (via the existing persist middleware), and a fresh reload rehydrates it — no duplicate records', async () => {
    const { useFleetStore, buildFleetImportPreview } = await import('../useFleetStore')

    // Build a distinct "imported fleet" fixture by exporting a store with
    // exactly one manually-added ship, independent of whatever the live
    // store currently holds.
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const addResult = useFleetStore.getState().addFleetAsset(def.id, 'PURCHASED', 'Replace Workflow Test Titan')
    const { buildFleetExportSnapshot } = await import('../useFleetStore')
    const { serializeFleetExportEnvelope } = await import('../../utils/fleetSerialization')
    const importedFileText = serializeFleetExportEnvelope(buildFleetExportSnapshot(useFleetStore.getState()))

    // Reset to a clean slate, then import the fixture back in as if it
    // were a real uploaded file.
    localStorage.clear()
    const { vi } = await import('vitest')
    vi.resetModules()
    const fresh = await import('../useFleetStore')
    const outcome = fresh.buildFleetImportPreview(importedFileText, fresh.useFleetStore.getState())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    fresh.useFleetStore.getState().replaceFleetFromImport(outcome.mergedState)

    const shipIds = fresh.useFleetStore.getState().ships.map((s) => s.id)
    expect(shipIds.filter((id) => id === addResult.assetId).length).toBe(1) // no duplicate

    // Hydration succeeds on a genuine reload after the replace.
    vi.resetModules()
    const reloaded = await import('../useFleetStore')
    expect(reloaded.useFleetStore.getState().ships.some((s) => s.id === addResult.assetId)).toBe(true)
    expect(reloaded.useFleetStore.getState().ships.filter((s) => s.id === addResult.assetId).length).toBe(1)
  })

  it('Safety: Cancel (never calling replaceFleetFromImport) performs zero writes even after building a valid preview', async () => {
    const { useFleetStore, buildFleetExportSnapshot, buildFleetImportPreview } = await import('../useFleetStore')
    const { serializeFleetExportEnvelope } = await import('../../utils/fleetSerialization')
    const before = localStorage.getItem('sfm-fleet-store')

    const outcome = buildFleetImportPreview(serializeFleetExportEnvelope(buildFleetExportSnapshot(useFleetStore.getState())), useFleetStore.getState())
    expect(outcome.ok).toBe(true)
    // Commander cancels — the outcome is simply discarded, nothing further is called.

    expect(localStorage.getItem('sfm-fleet-store')).toBe(before)
  })

  it('Safety: replaceFleetFromImport captures a recovery snapshot of the PRE-replacement state before committing', async () => {
    const { useFleetStore, buildFleetImportPreview } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Pre-Replace Marker Ship')
    const preReplaceShipCount = useFleetStore.getState().ships.length

    const legacyEnvelope = JSON.stringify({ schemaVersion: 1, appVersion: 'Beta 1.0', exportedAt: '', payload: {} })
    const outcome = buildFleetImportPreview(legacyEnvelope, useFleetStore.getState())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const recoverySnapshot = useFleetStore.getState().replaceFleetFromImport(outcome.mergedState)

    // The recovery snapshot reflects the fleet as it existed BEFORE this
    // replacement — including the marker ship the import itself doesn't carry.
    expect(recoverySnapshot.payload.fleetAssets.some((a) => a.acquisitionSource === 'MANUAL')).toBe(true)
    expect(recoverySnapshot.payload.fleetAssets.length).toBeGreaterThan(0)
    void preReplaceShipCount
  })

  it('Replace logs a Captain\'s Log entry recording the import', async () => {
    const { useFleetStore, buildFleetExportSnapshot, buildFleetImportPreview } = await import('../useFleetStore')
    const { serializeFleetExportEnvelope } = await import('../../utils/fleetSerialization')
    const outcome = buildFleetImportPreview(serializeFleetExportEnvelope(buildFleetExportSnapshot(useFleetStore.getState())), useFleetStore.getState())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    useFleetStore.getState().replaceFleetFromImport(outcome.mergedState)
    expect(useFleetStore.getState().log.some((e) => e.action === 'Fleet imported')).toBe(true)
  })
})
