import { describe, it, expect } from 'vitest'
import { enrichCanonicalLoadout } from '../componentMetadataEnrichment'
import { ComponentMetadataResolver } from '../componentMetadataResolver'
import type { CanonicalLoadoutNode } from '../loadoutNodeAdapter'
import type { NormalizationWarning } from '../../engine/types'

function resolverWith(records: Record<string, unknown>): ComponentMetadataResolver {
  return new ComponentMetadataResolver({ loadCatalog: () => ({ records: records as never }) })
}

const REGULUS_RECORD = {
  entityClass: 'POWR_AEGS_S01_Regulus_SCItem',
  recordName: 'EntityClassDefinition.POWR_AEGS_S01_Regulus_SCItem',
  recordId: 'guid-regulus',
  category: 'PowerPlant',
  subtype: 'Power',
  size: 1,
  grade: 3,
  manufacturerRef: 'file://.../aegs.json',
  localizationKey: '@item_NamePOWR_AEGS_S01_Regulus',
  displayName: null,
}

function starBreakerNode(itemPortName: string, internalName: string): CanonicalLoadoutNode {
  return { itemPortName, factoryComponent: { internalName }, children: [] }
}

describe('enrichCanonicalLoadout — catalog enrichment', () => {
  it('fills in category/subtype/size/grade/manufacturer from the catalog for a StarBreaker-origin node', () => {
    const resolver = resolverWith({ POWR_AEGS_S01_Regulus_SCItem: REGULUS_RECORD })
    const warnings: NormalizationWarning[] = []
    const [enriched] = enrichCanonicalLoadout([starBreakerNode('hardpoint_power_plant', 'POWR_AEGS_S01_Regulus_SCItem')], resolver, warnings)

    expect(enriched.factoryComponent).toEqual({
      internalName: 'POWR_AEGS_S01_Regulus_SCItem',
      category: 'PowerPlant',
      subtype: 'Power',
      size: 1,
      grade: '3',
      manufacturer: 'file://.../aegs.json',
    })
    expect(enriched.size).toBe(1)
    expect(warnings).toEqual([])
  })

  it('does not set node.portType from catalog category (no taxonomy translation)', () => {
    const resolver = resolverWith({ POWR_AEGS_S01_Regulus_SCItem: REGULUS_RECORD })
    const [enriched] = enrichCanonicalLoadout([starBreakerNode('hardpoint_power_plant', 'POWR_AEGS_S01_Regulus_SCItem')], resolver, [])
    expect(enriched.portType).toBeUndefined()
  })

  it('leaves a node with no factoryComponent at all untouched', () => {
    const node: CanonicalLoadoutNode = { itemPortName: 'door_pilot', factoryComponent: null, children: [] }
    const resolver = resolverWith({})
    const [enriched] = enrichCanonicalLoadout([node], resolver, [])
    expect(enriched.factoryComponent).toBeNull()
  })
})

describe('enrichCanonicalLoadout — legacy precedence', () => {
  it('never overwrites an already-verified legacy factoryComponent field', () => {
    const resolver = resolverWith({
      POWR_AEGS_S01_Regulus_SCItem: { ...REGULUS_RECORD, category: 'CatalogCategory', subtype: 'CatalogSubtype', size: 99, grade: 99, manufacturerRef: 'catalog-manufacturer' },
    })
    const legacyNode: CanonicalLoadoutNode = {
      itemPortName: 'hardpoint_power_plant',
      portType: 'PowerPlant',
      size: 1,
      factoryComponent: {
        internalName: 'POWR_AEGS_S01_Regulus_SCItem',
        category: 'VerifiedLegacyCategory',
        subtype: 'VerifiedLegacySubtype',
        size: 1,
        grade: 'A',
        manufacturer: 'Verified Legacy Manufacturer',
      },
      children: [],
    }

    const [enriched] = enrichCanonicalLoadout([legacyNode], resolver, [])

    expect(enriched.factoryComponent).toEqual({
      internalName: 'POWR_AEGS_S01_Regulus_SCItem',
      category: 'VerifiedLegacyCategory',
      subtype: 'VerifiedLegacySubtype',
      size: 1,
      grade: 'A',
      manufacturer: 'Verified Legacy Manufacturer',
    })
    // node.size was already explicit (legacy) — never overwritten either.
    expect(enriched.size).toBe(1)
  })

  it('fills in only the missing fields when legacy data is partial', () => {
    const resolver = resolverWith({ POWR_AEGS_S01_Regulus_SCItem: REGULUS_RECORD })
    const partialLegacyNode: CanonicalLoadoutNode = {
      itemPortName: 'hardpoint_power_plant',
      factoryComponent: { internalName: 'POWR_AEGS_S01_Regulus_SCItem', category: 'VerifiedLegacyCategory' },
      children: [],
    }
    const [enriched] = enrichCanonicalLoadout([partialLegacyNode], resolver, [])
    expect(enriched.factoryComponent?.category).toBe('VerifiedLegacyCategory') // preserved
    expect(enriched.factoryComponent?.subtype).toBe('Power') // filled from catalog
    expect(enriched.factoryComponent?.size).toBe(1) // filled from catalog
  })
})

describe('enrichCanonicalLoadout — unresolved entity handling', () => {
  it('leaves the node as-adapted and records a warning when the catalog has no entry, without throwing', () => {
    const resolver = resolverWith({})
    const warnings: NormalizationWarning[] = []
    const [enriched] = enrichCanonicalLoadout([starBreakerNode('hardpoint_x', 'Unknown_Entity')], resolver, warnings)

    expect(enriched.factoryComponent).toEqual({ internalName: 'Unknown_Entity' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('unresolved-component-metadata')
    expect(warnings[0].path).toBe('hardpoint_x')
  })
})

describe('enrichCanonicalLoadout — nested children', () => {
  it('enriches recursively through children', () => {
    const resolver = resolverWith({ POWR_AEGS_S01_Regulus_SCItem: REGULUS_RECORD })
    const parent: CanonicalLoadoutNode = {
      itemPortName: 'mount',
      factoryComponent: null,
      children: [starBreakerNode('hardpoint_power_plant', 'POWR_AEGS_S01_Regulus_SCItem')],
    }
    const [enrichedParent] = enrichCanonicalLoadout([parent], resolver, [])
    expect(enrichedParent.children[0].factoryComponent?.category).toBe('PowerPlant')
  })
})

describe('enrichCanonicalLoadout — deterministic behavior', () => {
  it('produces identical output across repeated runs with the same input and resolver', () => {
    const resolver = resolverWith({ POWR_AEGS_S01_Regulus_SCItem: REGULUS_RECORD })
    const node = starBreakerNode('hardpoint_power_plant', 'POWR_AEGS_S01_Regulus_SCItem')
    const first = enrichCanonicalLoadout([node], resolver, [])
    const second = enrichCanonicalLoadout([node], resolver, [])
    expect(first).toEqual(second)
  })
})
