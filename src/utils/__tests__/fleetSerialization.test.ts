import { describe, it, expect } from 'vitest'
import { buildFleetPersistencePayload, buildFleetExportEnvelope, serializeFleetExportEnvelope, suggestFleetExportFilename, type FleetPersistenceSource } from '../fleetSerialization'
import type { FleetAsset, Ship, Build, Hardpoint } from '../../types'

function baseSource(overrides: Partial<FleetPersistenceSource> = {}): FleetPersistenceSource {
  return {
    ships: [],
    builds: [],
    hardpoints: [],
    fleetAssets: [],
    hangarItems: [],
    reservations: [],
    installedLoadouts: [],
    seedAssetOverrides: {},
    quarantinedAssignments: [],
    seedFleetLegacyInstall: false,
    ...overrides,
  }
}

const manualAsset: FleetAsset = {
  id: 'asset-1',
  shipDefinitionId: 'def-1',
  ownershipType: 'OWNED',
  acquisitionSource: 'MANUAL',
  activeBuildId: 'build-1',
  installedLoadoutId: 'asset-1',
  priority: null,
  lifecycleStatus: 'active',
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const seedMigratedAsset: FleetAsset = { ...manualAsset, id: 'asset-2', acquisitionSource: 'SEED_MIGRATION' }

describe('buildFleetPersistencePayload (EWO-093)', () => {
  it('excludes SEED_MIGRATION fleet assets — the same exclusion useFleetStore.ts partialize always applied', () => {
    const payload = buildFleetPersistencePayload(baseSource({ fleetAssets: [manualAsset, seedMigratedAsset] }))
    expect(payload.fleetAssets).toEqual([manualAsset])
  })

  it('splits builds into customBuilds (non-FACTORY) and excludes FACTORY builds entirely', () => {
    const factoryBuild: Build = { id: 'b-factory', shipId: 's1', name: 'Factory', role: '', readiness: 0, isActive: false, missing: [], kind: 'FACTORY' }
    const customBuild: Build = { id: 'b-custom', shipId: 's1', name: 'Custom', role: '', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' }
    const payload = buildFleetPersistencePayload(baseSource({ builds: [factoryBuild, customBuild] }))
    expect(payload.customBuilds).toEqual([customBuild])
  })

  it('keeps only hardpoints belonging to a non-FACTORY build', () => {
    const factoryBuild: Build = { id: 'b-factory', shipId: 's1', name: 'Factory', role: '', readiness: 0, isActive: false, missing: [], kind: 'FACTORY' }
    const customBuild: Build = { id: 'b-custom', shipId: 's1', name: 'Custom', role: '', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' }
    const factoryHp: Hardpoint = { id: 'hp-1', shipId: 's1', buildId: 'b-factory', slotLabel: 'A', type: 'T', size: 'S1', factoryItem: '—', installedItem: '—', targetItem: '—', status: 'OK' }
    const customHp: Hardpoint = { id: 'hp-2', shipId: 's1', buildId: 'b-custom', slotLabel: 'B', type: 'T', size: 'S1', factoryItem: '—', installedItem: '—', targetItem: '—', status: 'OK' }
    const payload = buildFleetPersistencePayload(baseSource({ builds: [factoryBuild, customBuild], hardpoints: [factoryHp, customHp] }))
    expect(payload.customBuildHardpoints).toEqual([customHp])
  })

  it('derives activeBuildByShipId from every ship, seed or manual alike', () => {
    const ship: Ship = { id: 'ghost', name: 'Ghost', manufacturer: 'M', ownership: 'Owned', career: '', role: '', activeBuildId: 'ghost-stealth', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' }
    const payload = buildFleetPersistencePayload(baseSource({ ships: [ship] }))
    expect(payload.activeBuildByShipId).toEqual({ ghost: 'ghost-stealth' })
  })

  it('passes hangarItems/reservations/installedLoadouts/seedAssetOverrides/quarantinedAssignments/seedFleetLegacyInstall through unchanged', () => {
    const source = baseSource({ seedFleetLegacyInstall: true })
    const payload = buildFleetPersistencePayload(source)
    expect(payload.hangarItems).toBe(source.hangarItems)
    expect(payload.reservations).toBe(source.reservations)
    expect(payload.installedLoadouts).toBe(source.installedLoadouts)
    expect(payload.seedAssetOverrides).toBe(source.seedAssetOverrides)
    expect(payload.quarantinedAssignments).toBe(source.quarantinedAssignments)
    expect(payload.seedFleetLegacyInstall).toBe(true)
  })
})

describe('buildFleetExportEnvelope / serializeFleetExportEnvelope / suggestFleetExportFilename (EWO-093)', () => {
  it('wraps the payload with schemaVersion, appVersion, and an ISO exportedAt timestamp', () => {
    const payload = buildFleetPersistencePayload(baseSource())
    const now = new Date('2026-07-31T12:34:56.000Z')
    const envelope = buildFleetExportEnvelope(payload, 10, 'Beta 2.1 Dev', now)
    expect(envelope).toEqual({ schemaVersion: 10, appVersion: 'Beta 2.1 Dev', exportedAt: '2026-07-31T12:34:56.000Z', payload })
  })

  it('serializes to valid, round-trippable, pretty-printed JSON', () => {
    const payload = buildFleetPersistencePayload(baseSource({ fleetAssets: [manualAsset] }))
    const envelope = buildFleetExportEnvelope(payload, 10, 'Beta 2.1 Dev', new Date('2026-07-31T00:00:00.000Z'))
    const json = serializeFleetExportEnvelope(envelope)
    expect(json).toContain('\n')
    expect(JSON.parse(json)).toEqual(envelope)
  })

  it('suggests a filename derived from the envelope\'s own exportedAt date, not the current clock', () => {
    const payload = buildFleetPersistencePayload(baseSource())
    const envelope = buildFleetExportEnvelope(payload, 10, 'Beta 2.1 Dev', new Date('2026-03-05T08:00:00.000Z'))
    expect(suggestFleetExportFilename(envelope)).toBe('sfm-fleet-export-2026-03-05.json')
  })
})
