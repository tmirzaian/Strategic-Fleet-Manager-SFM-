import { describe, it, expect } from 'vitest'
import { enrichClassification } from '../classificationEnrichment'
import { ComponentMetadataResolver } from '../componentMetadataResolver'
import type { CanonicalLoadoutNode } from '../loadoutNodeAdapter'
import type { NormalizationWarning } from '../../engine/types'

function resolverWith(records: Record<string, unknown>): ComponentMetadataResolver {
  return new ComponentMetadataResolver({ loadCatalog: () => ({ records: records as never }) })
}

function record(category: string | null, subtype: string | null) {
  return {
    entityClass: 'X',
    recordName: 'EntityClassDefinition.X',
    recordId: 'guid',
    category,
    subtype,
    size: null,
    grade: null,
    manufacturerRef: null,
    localizationKey: null,
    displayName: null,
  }
}

function sbNode(itemPortName: string, internalName: string, children: CanonicalLoadoutNode[] = []): CanonicalLoadoutNode {
  return { itemPortName, factoryComponent: { internalName }, children }
}

describe('enrichClassification — legacy portType precedence', () => {
  it('never overwrites an existing legacy portType, even when the catalog disagrees', () => {
    const resolver = resolverWith({ Weird_Entity: record('Shield', 'UNDEFINED') })
    const node: CanonicalLoadoutNode = { itemPortName: 'hardpoint_x', portType: 'WeaponGun', factoryComponent: { internalName: 'Weird_Entity' }, children: [] }
    const [enriched] = enrichClassification([node], resolver, [])
    expect(enriched.portType).toBe('WeaponGun')
  })
})

describe('enrichClassification — translation fills only missing portType', () => {
  it('sets portType from the translator when none exists', () => {
    const resolver = resolverWith({ POWR_X: record('PowerPlant', 'Power') })
    const [enriched] = enrichClassification([sbNode('hardpoint_power_plant', 'POWR_X')], resolver, [])
    expect(enriched.portType).toBe('PowerPlant')
  })

  it('leaves portType unset for an excluded category', () => {
    const resolver = resolverWith({ Barrel_X: record('WeaponAttachment', 'Barrel') })
    const warnings: NormalizationWarning[] = []
    const [enriched] = enrichClassification([sbNode('BAR1', 'Barrel_X')], resolver, warnings)
    expect(enriched.portType).toBeUndefined()
    expect(warnings.some((w) => w.code === 'classification-excluded')).toBe(true)
  })

  it('leaves portType unset and warns distinctly for an unresolved category', () => {
    const resolver = resolverWith({ Mystery_X: record('SomeNewCategory', 'UNDEFINED') })
    const warnings: NormalizationWarning[] = []
    const [enriched] = enrichClassification([sbNode('hardpoint_mystery', 'Mystery_X')], resolver, warnings)
    expect(enriched.portType).toBeUndefined()
    expect(warnings.some((w) => w.code === 'classification-unresolved')).toBe(true)
    expect(warnings.some((w) => w.code === 'classification-excluded')).toBe(false)
  })
})

describe('enrichClassification — Mount_Gimbal_S3 supporting evidence', () => {
  it('classifies a Turret mount with a real WeaponGun child as WeaponTurret, using the resolved tree only', () => {
    const resolver = resolverWith({
      Mount_X: record('Turret', 'GunTurret'),
      Gun_X: record('WeaponGun', 'Gun'),
    })
    const mount = sbNode('hardpoint_gun_nose', 'Mount_X', [sbNode('hardpoint_class_2', 'Gun_X')])
    const [enrichedMount] = enrichClassification([mount], resolver, [])
    expect(enrichedMount.portType).toBe('WeaponTurret')
    expect(enrichedMount.children[0].portType).toBe('WeaponGun')
  })
})

describe('enrichClassification — geometry/internal subassemblies stay unclassified', () => {
  it('a gun with WeaponAttachment children classifies the gun but not its sub-parts', () => {
    const resolver = resolverWith({
      Gun_X: record('WeaponGun', 'Gun'),
      Barrel_X: record('WeaponAttachment', 'Barrel'),
      Firing_X: record('WeaponAttachment', 'FiringMechanism'),
    })
    const gun = sbNode('hardpoint_class_2', 'Gun_X', [sbNode('BAR1', 'Barrel_X'), sbNode('MEC', 'Firing_X')])
    const [enrichedGun] = enrichClassification([gun], resolver, [])
    expect(enrichedGun.portType).toBe('WeaponGun')
    expect(enrichedGun.children.every((c) => c.portType === undefined)).toBe(true)
  })
})

describe('enrichClassification — deterministic behavior', () => {
  it('produces identical output for the same input across repeated runs', () => {
    const resolver = resolverWith({ POWR_X: record('PowerPlant', 'Power') })
    const node = sbNode('hardpoint_power_plant', 'POWR_X')
    const first = enrichClassification([node], resolver, [])
    const second = enrichClassification([node], resolver, [])
    expect(first).toEqual(second)
  })
})
