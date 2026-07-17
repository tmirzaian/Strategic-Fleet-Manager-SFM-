import { describe, it, expect } from 'vitest'
import { deriveRuntimeShipCatalog } from '../shipCatalogRuntimeWriter'
import type { ShipCatalogFile, ShipCatalogRecord } from '../shipCatalogSchema'

const SOURCE = {
  tool: 'StarBreaker' as const,
  toolVersion: '0.3.2',
  gameBranch: 'sc-alpha-4.9.0',
  gameVersion: '4.9.186.42610',
  p4ChangeNum: '12232306',
  dataP4kPath: 'LIVE/Data.p4k',
  generatedAt: '2026-07-17T05:35:32.590Z',
}

function fullRecord(overrides: Partial<ShipCatalogRecord> = {}): ShipCatalogRecord {
  return {
    entityClass: 'GLSN_Basher',
    recordName: 'EntityClassDefinition.GLSN_Basher',
    category: 'ship',
    movementClass: 'Spaceship',
    manufacturer: { code: 'GLSN', name: "Grey's Market", localizationKey: '@manufacturer_NameGREY' },
    displayName: "Grey's Basher",
    localizationKey: '@vehicle_NameGLSN_Basher',
    careerKey: '@vehicle_focus_combat',
    roleKey: '@vehicle_class_lightfighter',
    careerName: 'Combat',
    roleName: 'Light Fighter',
    crewSize: 1,
    dimensions: { x: 11.3, y: 13.7, z: 4.5 },
    provenance: { source: 'starbreaker-datacore', recordPath: null },
    ...overrides,
  }
}

function fullCatalog(records: Record<string, ShipCatalogRecord>): ShipCatalogFile {
  return {
    schemaVersion: 1,
    generator: { name: 'Strategic Fleet Manager Ship Catalog Generator', version: '1.0.0' },
    source: SOURCE,
    totalCandidates: Object.keys(records).length,
    excludedNonPlayerVariantCount: 0,
    records,
    unresolved: [],
  }
}

describe('RC-008: deriveRuntimeShipCatalog', () => {
  it('1. carries over exactly the fields the browser runtime reads, and nothing else', () => {
    const runtime = deriveRuntimeShipCatalog(fullCatalog({ GLSN_Basher: fullRecord() }))
    const record = runtime.records.GLSN_Basher
    expect(record).toEqual({
      entityClass: 'GLSN_Basher',
      category: 'ship',
      manufacturer: { code: 'GLSN', name: "Grey's Market" },
      displayName: "Grey's Basher",
      careerKey: '@vehicle_focus_combat',
      roleKey: '@vehicle_class_lightfighter',
      careerName: 'Combat',
      roleName: 'Light Fighter',
    })
    // Dev-only fields (recordName, movementClass, crewSize, dimensions,
    // localizationKey, provenance, manufacturer.localizationKey) never appear.
    expect(record).not.toHaveProperty('recordName')
    expect(record).not.toHaveProperty('movementClass')
    expect(record).not.toHaveProperty('crewSize')
    expect(record).not.toHaveProperty('dimensions')
    expect(record).not.toHaveProperty('localizationKey')
    expect(record).not.toHaveProperty('provenance')
  })

  it('2. omits any record with no resolved displayName — a real fresh-clone consumer never sees an unnamed entry', () => {
    const runtime = deriveRuntimeShipCatalog(fullCatalog({ UNRESOLVED_Ship: fullRecord({ entityClass: 'UNRESOLVED_Ship', displayName: null }) }))
    expect(runtime.records.UNRESOLVED_Ship).toBeUndefined()
    expect(Object.keys(runtime.records)).toEqual([])
  })

  it('3. preserves a null manufacturer rather than fabricating one', () => {
    const runtime = deriveRuntimeShipCatalog(fullCatalog({ GLSN_Basher: fullRecord({ manufacturer: null }) }))
    expect(runtime.records.GLSN_Basher.manufacturer).toBeNull()
  })

  it('4. carries only gameVersion and generatedAt from source — never the tool/branch/p4Change/dataP4kPath provenance', () => {
    const runtime = deriveRuntimeShipCatalog(fullCatalog({ GLSN_Basher: fullRecord() }))
    expect(runtime.source).toEqual({ gameVersion: '4.9.186.42610', generatedAt: '2026-07-17T05:35:32.590Z' })
  })

  it('5. is a pure function of the full catalog — the same input always derives the same output', () => {
    const catalog = fullCatalog({ GLSN_Basher: fullRecord(), GLSN_Shiv: fullRecord({ entityClass: 'GLSN_Shiv', displayName: "Grey's Shiv" }) })
    expect(deriveRuntimeShipCatalog(catalog)).toEqual(deriveRuntimeShipCatalog(catalog))
  })
})
