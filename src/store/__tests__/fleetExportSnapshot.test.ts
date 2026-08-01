import { describe, it, expect, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  localStorage.clear()
})

/**
 * EWO-093 — "Fleet Export Architecture." The central architectural claim
 * (docs/Beta-2.1-Fleet-Export-Architecture.md §1/§2) is that
 * `buildFleetExportSnapshot`'s payload is not a second, independently
 * derived serialization — it is produced by the EXACT SAME
 * `buildFleetPersistencePayload` function `useFleetStore.ts`'s own
 * `partialize` now calls. This suite proves that claim directly by
 * comparing the live-computed export snapshot against what actually
 * landed in localStorage via the real persist middleware, not by
 * re-reading the source and asserting it "looks shared."
 */
describe('buildFleetExportSnapshot (EWO-093) — proves Export and local persistence share one implementation', () => {
  it("the export snapshot's payload is deep-equal to what partialize actually wrote to localStorage", async () => {
    const { useFleetStore, buildFleetExportSnapshot } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const result = useFleetStore.getState().addFleetAsset(def.id, 'PURCHASED', 'Export Snapshot Test Titan')
    expect(result.success).toBe(true)

    const raw = localStorage.getItem('sfm-fleet-store')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)

    const snapshot = buildFleetExportSnapshot(useFleetStore.getState())

    expect(snapshot.payload).toEqual(persisted.state)
    expect(snapshot.schemaVersion).toBe(persisted.version)
  })

  it('the exported fleetAssets never include a SEED_MIGRATION row, matching the persisted-state guarantee', async () => {
    const { useFleetStore, buildFleetExportSnapshot } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    useFleetStore.getState().addFleetAsset(def.id, 'OWNED')

    const snapshot = buildFleetExportSnapshot(useFleetStore.getState())
    expect(snapshot.payload.fleetAssets.some((a) => a.acquisitionSource === 'SEED_MIGRATION')).toBe(false)
  })

  it('appVersion reflects the live APP_VERSION, and exportedAt is a real, current-ish ISO timestamp', async () => {
    const { useFleetStore, buildFleetExportSnapshot } = await import('../useFleetStore')
    const { APP_VERSION } = await import('../../config/appVersion')

    const before = Date.now()
    const snapshot = buildFleetExportSnapshot(useFleetStore.getState())
    const after = Date.now()

    expect(snapshot.appVersion).toBe(APP_VERSION.productVersion)
    const exportedAtMs = new Date(snapshot.exportedAt).getTime()
    expect(exportedAtMs).toBeGreaterThanOrEqual(before)
    expect(exportedAtMs).toBeLessThanOrEqual(after)
  })
})
