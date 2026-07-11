import { describe, it, expect } from 'vitest'
import { addRecordOrThrow, buildCatalogDocument } from '../buildCatalog'
import { CATALOG_SCHEMA_VERSION, GENERATOR_NAME, GENERATOR_VERSION } from '../catalogSchema'
import type { CatalogRecord, CatalogSource } from '../catalogSchema'

function record(entityClass: string): CatalogRecord {
  return {
    entityClass,
    recordName: `EntityClassDefinition.${entityClass}`,
    recordId: `guid-${entityClass}`,
    category: null,
    subtype: null,
    size: null,
    grade: null,
    manufacturerRef: null,
    localizationKey: null,
    displayName: null,
    provenance: { source: 'starbreaker-datacore', recordPath: null },
  }
}

const SOURCE: CatalogSource = {
  tool: 'StarBreaker',
  toolVersion: '0.3.2',
  gameBranch: 'sc-alpha-4.8.0',
  gameVersion: '4.8.184.64329',
  p4ChangeNum: '12122953',
  dataP4kPath: 'LIVE/Data.p4k',
  generatedAt: '2026-07-11T00:00:00.000Z',
}

describe('addRecordOrThrow — duplicate entity deduplication', () => {
  it('adds a record when the key is new', () => {
    const records = new Map<string, CatalogRecord>()
    addRecordOrThrow(records, 'A', record('A'))
    expect(records.size).toBe(1)
  })

  it('throws when the same exact entity key is added twice', () => {
    const records = new Map<string, CatalogRecord>()
    addRecordOrThrow(records, 'A', record('A'))
    expect(() => addRecordOrThrow(records, 'A', record('A'))).toThrow(/Duplicate exact entity key "A"/)
  })
})

describe('buildCatalogDocument — deterministic sorting', () => {
  it('sorts record keys alphabetically regardless of insertion order', () => {
    const records = new Map<string, CatalogRecord>()
    addRecordOrThrow(records, 'QDRV_WETK_S01_Beacon_SCItem', record('QDRV_WETK_S01_Beacon_SCItem'))
    addRecordOrThrow(records, 'COOL_AEGS_S01_Bracer_SCItem', record('COOL_AEGS_S01_Bracer_SCItem'))
    addRecordOrThrow(records, 'GATS_BallisticGatling_S3', record('GATS_BallisticGatling_S3'))

    const catalog = buildCatalogDocument({ source: SOURCE, records, unresolved: [] })
    expect(Object.keys(catalog.records)).toEqual(['COOL_AEGS_S01_Bracer_SCItem', 'GATS_BallisticGatling_S3', 'QDRV_WETK_S01_Beacon_SCItem'])
  })

  it('sorts unresolved entries alphabetically by entityClass regardless of input order', () => {
    const catalog = buildCatalogDocument({
      source: SOURCE,
      records: new Map(),
      unresolved: [
        { entityClass: 'Zeta_Item', reason: 'not found' },
        { entityClass: 'Alpha_Item', reason: 'not found' },
      ],
    })
    expect(catalog.unresolved.map((u) => u.entityClass)).toEqual(['Alpha_Item', 'Zeta_Item'])
  })

  it('accepts a plain Record object as well as a Map', () => {
    const catalog = buildCatalogDocument({ source: SOURCE, records: { B: record('B'), A: record('A') }, unresolved: [] })
    expect(Object.keys(catalog.records)).toEqual(['A', 'B'])
  })

  it('stamps schemaVersion and generator metadata', () => {
    const catalog = buildCatalogDocument({ source: SOURCE, records: new Map(), unresolved: [] })
    expect(catalog.schemaVersion).toBe(CATALOG_SCHEMA_VERSION)
    expect(catalog.generator).toEqual({ name: GENERATOR_NAME, version: GENERATOR_VERSION })
    expect(catalog.source).toEqual(SOURCE)
  })
})
