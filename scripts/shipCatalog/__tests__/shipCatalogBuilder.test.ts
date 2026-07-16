import { describe, it, expect } from 'vitest'
import { buildShipCatalog, type ShipCatalogFieldMaps } from '../shipCatalogBuilder'

function fields(overrides: Partial<ShipCatalogFieldMaps> = {}): ShipCatalogFieldMaps {
  return {
    movementClass: new Map(),
    manufacturerCode: new Map(),
    manufacturerLocKey: new Map(),
    vehicleName: new Map(),
    vehicleCareer: new Map(),
    vehicleRole: new Map(),
    crewSize: new Map(),
    maxBoundingBoxSize: new Map(),
    ...overrides,
  }
}

const SOURCE = {
  tool: 'StarBreaker' as const,
  toolVersion: '0.3.2',
  gameBranch: 'sc-alpha-4.8.0',
  gameVersion: '4.8.184.64329',
  p4ChangeNum: '12122953',
  dataP4kPath: 'LIVE/Data.p4k',
  generatedAt: '2026-07-12T00:00:00.000Z',
}

describe('Mission M-012: buildShipCatalog', () => {
  it('1. produces a complete catalog document from bulk field-query maps', () => {
    const catalog = buildShipCatalog(
      fields({
        movementClass: new Map([['AEGS_Gladius', 'Spaceship']]),
        manufacturerCode: new Map([['AEGS_Gladius', 'AEGS']]),
        manufacturerLocKey: new Map([['AEGS_Gladius', '@manufacturer_NameAEGS']]),
        vehicleName: new Map([['AEGS_Gladius', '@vehicle_NameAEGS_Gladius']]),
      }),
      new Map([
        ['manufacturer_NameAEGS', 'Aegis Dynamics'],
        ['vehicle_NameAEGS_Gladius', 'Aegis Gladius'],
      ]),
      SOURCE
    )
    expect(catalog.records.AEGS_Gladius).toBeDefined()
    expect(catalog.records.AEGS_Gladius.displayName).toBe('Aegis Gladius')
    expect(catalog.records.AEGS_Gladius.manufacturer?.name).toBe('Aegis Dynamics')
    expect(catalog.records.AEGS_Gladius.category).toBe('ship')
  })

  it('3. keys every record by the exact stable DataCore entity class', () => {
    const catalog = buildShipCatalog(fields({ movementClass: new Map([['DRAK_Cutlass_Black', 'Spaceship']]) }), new Map(), SOURCE)
    expect(Object.keys(catalog.records)).toEqual(['DRAK_Cutlass_Black'])
    expect(catalog.records.DRAK_Cutlass_Black.entityClass).toBe('DRAK_Cutlass_Black')
    expect(catalog.records.DRAK_Cutlass_Black.recordName).toBe('EntityClassDefinition.DRAK_Cutlass_Black')
  })

  it('4. sorts records deterministically regardless of input map insertion order', () => {
    const unordered = new Map([
      ['ZZZ_Zulu', 'Spaceship'],
      ['AAA_Alpha', 'Spaceship'],
      ['MMM_Mike', 'Spaceship'],
    ])
    const catalog = buildShipCatalog(fields({ movementClass: unordered }), new Map(), SOURCE)
    expect(Object.keys(catalog.records)).toEqual(['AAA_Alpha', 'MMM_Mike', 'ZZZ_Zulu'])
  })

  it('6. excludes non-player-variant names (AI/PU/Unmanned/Template) even though they have a valid movementClass', () => {
    const catalog = buildShipCatalog(
      fields({
        movementClass: new Map([
          ['AEGS_Avenger_Titan', 'Spaceship'],
          ['AEGS_Avenger_Titan_PU_AI_CIV', 'Spaceship'],
          ['AEGS_Avenger_Titan_AI_Template', 'Spaceship'],
          ['RSI_Mantis_Unmanned', 'Spaceship'],
        ]),
      }),
      new Map(),
      SOURCE
    )
    expect(Object.keys(catalog.records)).toEqual(['AEGS_Avenger_Titan'])
    expect(catalog.excludedNonPlayerVariantCount).toBe(3)
  })

  it('7. includes ground vehicles (ArcadeWheeled) under the ground_vehicle category', () => {
    const catalog = buildShipCatalog(fields({ movementClass: new Map([['GRIN_ROC', 'ArcadeWheeled']]) }), new Map(), SOURCE)
    expect(catalog.records.GRIN_ROC.category).toBe('ground_vehicle')
    expect(catalog.records.GRIN_ROC.movementClass).toBe('ArcadeWheeled')
  })

  it('excludes non-vehicle "Dummy" movementClass entities as unresolved, not as included records', () => {
    const catalog = buildShipCatalog(fields({ movementClass: new Map([['SalvageableDebris', 'Dummy']]) }), new Map(), SOURCE)
    expect(Object.keys(catalog.records)).toHaveLength(0)
    expect(catalog.unresolved).toHaveLength(1)
    expect(catalog.unresolved[0].entityClass).toBe('SalvageableDebris')
  })
})
