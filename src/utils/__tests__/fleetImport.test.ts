import { describe, it, expect } from 'vitest'
import { parseFleetImportFile, buildFleetImportSummary, computeFleetImportWarnings } from '../fleetImport'
import type { Ship, HangarItem, Build, InstalledLoadoutEntry, MissionReservation } from '../../types'

const validEnvelope = {
  schemaVersion: 10,
  appVersion: 'Beta 2.1 Dev',
  exportedAt: '2026-07-31T00:00:00.000Z',
  payload: { fleetAssets: [], hangarItems: [], reservations: [], installedLoadouts: [], seedAssetOverrides: {}, customBuilds: [], customBuildHardpoints: [], activeBuildByShipId: {}, quarantinedAssignments: [], seedFleetLegacyInstall: false },
}

describe('parseFleetImportFile — envelope validation (EWO-094)', () => {
  it('accepts a well-formed envelope', () => {
    const result = parseFleetImportFile(JSON.stringify(validEnvelope))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.envelope.schemaVersion).toBe(10)
      expect(result.envelope.appVersion).toBe('Beta 2.1 Dev')
    }
  })

  it('rejects corrupt JSON', () => {
    const result = parseFleetImportFile('{ this is not valid json')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.code).toBe('INVALID_JSON')
  })

  it('rejects a JSON array (not an envelope object)', () => {
    const result = parseFleetImportFile('[1, 2, 3]')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.code).toBe('NOT_AN_OBJECT')
  })

  it('rejects a JSON primitive (not an envelope object)', () => {
    const result = parseFleetImportFile('"just a string"')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.code).toBe('NOT_AN_OBJECT')
  })

  it('rejects an envelope missing schemaVersion', () => {
    const { schemaVersion: _omit, ...rest } = validEnvelope
    void _omit
    const result = parseFleetImportFile(JSON.stringify(rest))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.code).toBe('MISSING_SCHEMA_VERSION')
  })

  it('rejects an envelope missing payload', () => {
    const { payload: _omit, ...rest } = validEnvelope
    void _omit
    const result = parseFleetImportFile(JSON.stringify(rest))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.code).toBe('MISSING_PAYLOAD')
  })

  it('rejects an envelope whose payload is an array, not an object', () => {
    const result = parseFleetImportFile(JSON.stringify({ ...validEnvelope, payload: [] }))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.code).toBe('MISSING_PAYLOAD')
  })

  it('defaults appVersion/exportedAt rather than rejecting when absent — informational fields only, never a compatibility gate', () => {
    const { appVersion: _a, exportedAt: _e, ...rest } = validEnvelope
    void _a
    void _e
    const result = parseFleetImportFile(JSON.stringify(rest))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.envelope.appVersion).toBe('Unknown')
      expect(result.envelope.exportedAt).toBe('')
    }
  })
})

const ship: Ship = { id: 's1', name: 'Test', manufacturer: 'M', ownership: 'Owned', career: '', role: '', activeBuildId: 'b1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' }
const hangarItem: HangarItem = { id: 'h1', name: 'Item', type: 'Cooler', size: 'S1', qty: 1, neededBy: '', disposition: 'Store' }
const factoryBuild: Build = { id: 'b-fac', shipId: 's1', name: 'Factory', role: '', readiness: 0, isActive: false, missing: [], kind: 'FACTORY' }
const customBuild: Build = { id: 'b1', shipId: 's1', name: 'Custom', role: '', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' }
const installedEntry: InstalledLoadoutEntry = { shipId: 's1', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' }
const emptyEntry: InstalledLoadoutEntry = { shipId: 's1', slotLabel: 'Cooler 2', installedItem: '—' }
const reservation: MissionReservation = { id: 'r1', missionConfigurationId: 'b1', fleetAssetId: 's1', targetSlotLabel: 'Cooler 1', componentName: 'SnowBlind', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' }

describe('buildFleetImportSummary — Preview counts (EWO-094)', () => {
  it('counts ships, hangar items, genuinely-installed components (not empty "—" slots), non-FACTORY builds, and reservations', () => {
    const summary = buildFleetImportSummary({
      ships: [ship],
      hangarItems: [hangarItem, hangarItem],
      installedLoadouts: [installedEntry, emptyEntry],
      builds: [factoryBuild, customBuild],
      reservations: [reservation],
    })
    expect(summary).toEqual({ ships: 1, hangarItems: 2, installedComponents: 1, customBuilds: 1, reservations: 1 })
  })

  it('reports all zeros for a genuinely empty fleet', () => {
    const summary = buildFleetImportSummary({ ships: [], hangarItems: [], installedLoadouts: [], builds: [], reservations: [] })
    expect(summary).toEqual({ ships: 0, hangarItems: 0, installedComponents: 0, customBuilds: 0, reservations: 0 })
  })
})

describe('computeFleetImportWarnings — derived, not re-validated (EWO-094)', () => {
  it('produces no warnings when every raw record was kept', () => {
    const warnings = computeFleetImportWarnings(
      { fleetAssets: [1, 2], reservations: [1], customBuilds: [], customBuildHardpoints: [], quarantinedAssignments: [], seedAssetOverrides: { a: 1 } },
      { fleetAssets: 2, reservations: 1, customBuilds: 0, customBuildHardpoints: 0, quarantinedAssignments: 0, seedAssetOverrideKeys: 1 }
    )
    expect(warnings).toEqual([])
  })

  it('reports a warning per category where fewer records survived validation than were present in the raw file', () => {
    const warnings = computeFleetImportWarnings(
      { fleetAssets: [1, 2, 3], reservations: [], customBuilds: [], customBuildHardpoints: [], quarantinedAssignments: [], seedAssetOverrides: {} },
      { fleetAssets: 1, reservations: 0, customBuilds: 0, customBuildHardpoints: 0, quarantinedAssignments: 0, seedAssetOverrideKeys: 0 }
    )
    expect(warnings).toEqual(['2 Fleet Asset records could not be validated and were skipped.'])
  })

  it('uses singular phrasing for exactly one dropped record', () => {
    const warnings = computeFleetImportWarnings(
      { fleetAssets: [], reservations: [1], customBuilds: [], customBuildHardpoints: [], quarantinedAssignments: [], seedAssetOverrides: {} },
      { fleetAssets: 0, reservations: 0, customBuilds: 0, customBuildHardpoints: 0, quarantinedAssignments: 0, seedAssetOverrideKeys: 0 }
    )
    expect(warnings).toEqual(['1 Reservation record could not be validated and was skipped.'])
  })

  it('tolerates a non-object raw payload without throwing (envelope validation already rejects this before warnings run, but this stays defensive)', () => {
    expect(() =>
      computeFleetImportWarnings(null, { fleetAssets: 0, reservations: 0, customBuilds: 0, customBuildHardpoints: 0, quarantinedAssignments: 0, seedAssetOverrideKeys: 0 })
    ).not.toThrow()
  })
})
