import { describe, it, expect } from 'vitest'
import { deriveRuntimeComponentCatalog } from '../catalogRuntimeWriter'
import type { CatalogFile, CatalogRecord } from '../catalogSchema'

const SOURCE = {
  tool: 'StarBreaker' as const,
  toolVersion: '0.3.2',
  gameBranch: 'sc-alpha-4.9.0',
  gameVersion: '4.9.186.42610',
  p4ChangeNum: '12232306',
  dataP4kPath: 'LIVE/Data.p4k',
  generatedAt: '2026-07-17T13:59:34.273Z',
}

function fullRecord(overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    entityClass: 'AEGS_Gladius_GunTurret',
    recordName: 'EntityClassDefinition.AEGS_Gladius_GunTurret',
    recordId: 'da6a9813-56c3-4a82-956e-77fbdd76589f',
    category: 'WeaponGun',
    subtype: 'Gun',
    size: 2,
    grade: 2,
    manufacturerRef: 'AEGS',
    localizationKey: '@item_NameAEGS_Gladius_GunTurret',
    displayName: 'Bulldog Repeater',
    provenance: { source: 'starbreaker-datacore', recordPath: 'SystemsDesign' },
    ...overrides,
  }
}

function fullCatalog(records: Record<string, CatalogRecord>): CatalogFile {
  return {
    schemaVersion: 2,
    generator: { name: 'Strategic Fleet Manager Component Catalog Generator', version: '2.0.0' },
    source: SOURCE,
    records,
    unresolved: [],
  }
}

describe('RC-008: deriveRuntimeComponentCatalog', () => {
  it('1. carries over exactly the fields the browser runtime reads, and nothing else', () => {
    const runtime = deriveRuntimeComponentCatalog(fullCatalog({ AEGS_Gladius_GunTurret: fullRecord() }))
    const record = runtime.records.AEGS_Gladius_GunTurret
    expect(record).toEqual({
      category: 'WeaponGun',
      subtype: 'Gun',
      size: 2,
      grade: 2,
      displayName: 'Bulldog Repeater',
      manufacturerRef: 'AEGS',
    })
    expect(record).not.toHaveProperty('recordId')
    expect(record).not.toHaveProperty('recordName')
    expect(record).not.toHaveProperty('localizationKey')
    expect(record).not.toHaveProperty('provenance')
  })

  it('1b. preserves a null subtype rather than fabricating one', () => {
    const runtime = deriveRuntimeComponentCatalog(fullCatalog({ AEGS_Gladius_GunTurret: fullRecord({ subtype: null }) }))
    expect(runtime.records.AEGS_Gladius_GunTurret.subtype).toBeNull()
  })

  it('2. omits a record missing displayName, category, or size — the exact guard the browser loader already applies before either export map can see it', () => {
    const runtime = deriveRuntimeComponentCatalog(
      fullCatalog({
        NoName: fullRecord({ entityClass: 'NoName', displayName: null }),
        NoCategory: fullRecord({ entityClass: 'NoCategory', category: null }),
        NoSize: fullRecord({ entityClass: 'NoSize', size: null }),
        Usable: fullRecord({ entityClass: 'Usable' }),
      })
    )
    expect(Object.keys(runtime.records)).toEqual(['Usable'])
  })

  it('3. preserves a null manufacturerRef rather than fabricating one', () => {
    const runtime = deriveRuntimeComponentCatalog(fullCatalog({ AEGS_Gladius_GunTurret: fullRecord({ manufacturerRef: null }) }))
    expect(runtime.records.AEGS_Gladius_GunTurret.manufacturerRef).toBeNull()
  })

  it('4. carries only gameVersion and generatedAt from source', () => {
    const runtime = deriveRuntimeComponentCatalog(fullCatalog({ AEGS_Gladius_GunTurret: fullRecord() }))
    expect(runtime.source).toEqual({ gameVersion: '4.9.186.42610', generatedAt: '2026-07-17T13:59:34.273Z' })
  })

  it('5. is a pure function of the full catalog', () => {
    const catalog = fullCatalog({ AEGS_Gladius_GunTurret: fullRecord() })
    expect(deriveRuntimeComponentCatalog(catalog)).toEqual(deriveRuntimeComponentCatalog(catalog))
  })
})
