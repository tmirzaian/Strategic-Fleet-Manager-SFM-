import { describe, it, expect } from 'vitest'
import { ShipNormalizer } from '../shipNormalizer'
import { ComponentMetadataResolver } from '../componentMetadataResolver'
import type { RawShipExport } from '../rawTypes'

/**
 * Mission M-008 — end-to-end proof that ComponentMetadataResolver +
 * componentMetadataEnrichment are actually wired into ShipNormalizer's
 * pipeline (Raw Export -> Loadout Adapter -> Canonical Nodes ->
 * ComponentMetadataResolver -> Port Classification -> Normalizer), not
 * just unit-correct in isolation.
 *
 * The fixture below deliberately has a real `portType` (so the port gets
 * classified — the resolver does not, and must not, affect
 * classification) alongside a factoryComponent that only carries
 * `internalName`, the way a StarBreaker-derived component stub does —
 * exercising the exact gap the catalog is meant to fill.
 */
const GATS_RECORD = {
  entityClass: 'GATS_BallisticGatling_S3',
  recordName: 'EntityClassDefinition.GATS_BallisticGatling_S3',
  recordId: 'guid-gats',
  category: 'WeaponGun',
  subtype: 'Gun',
  size: 3,
  grade: 1,
  manufacturerRef: 'file://.../gats.json',
  localizationKey: '@item_NameGATS_BallisticGatling_S3',
  displayName: null,
}

function fixtureDoc(): RawShipExport {
  return {
    entity: { className: 'TEST_Fixture' },
    loadout: [
      {
        itemPortName: 'hardpoint_gun_nose',
        portType: 'WeaponGun',
        factoryComponent: { internalName: 'GATS_BallisticGatling_S3' },
      },
    ],
  }
}

describe('ShipNormalizer + ComponentMetadataResolver integration', () => {
  it('enriches the resulting component with catalog metadata without changing classification', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => ({ records: { GATS_BallisticGatling_S3: GATS_RECORD } }) })
    const normalizer = new ShipNormalizer(undefined, resolver)
    const pkg = normalizer.normalize(fixtureDoc(), 'test.json')

    expect(pkg.ports).toHaveLength(1)
    const component = pkg.components.find((c) => c.internalName === 'GATS_BallisticGatling_S3')
    expect(component).toBeDefined()
    expect(component?.category).toBe('WeaponGun')
    expect(component?.subtype).toBe('Gun')
    expect(component?.size).toBe(3)
    expect(component?.grade).toBe('1')
  })

  it('continues normalizing (no crash, port still created) when the entity is unresolved in the catalog', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => ({ records: {} }) })
    const normalizer = new ShipNormalizer(undefined, resolver)
    const pkg = normalizer.normalize(fixtureDoc(), 'test.json')

    expect(pkg.ports).toHaveLength(1)
    const hasUnresolvedWarning = pkg.normalizationWarnings.some((w) => w.code === 'unresolved-component-metadata')
    expect(hasUnresolvedWarning).toBe(true)
  })

  it('repeated normalization on the same ShipNormalizer instance loads the catalog only once', () => {
    let loadCount = 0
    const resolver = new ComponentMetadataResolver({
      loadCatalog: () => {
        loadCount++
        return { records: { GATS_BallisticGatling_S3: GATS_RECORD } }
      },
    })
    const normalizer = new ShipNormalizer(undefined, resolver)

    normalizer.normalize(fixtureDoc(), 'a.json')
    normalizer.normalize(fixtureDoc(), 'b.json')
    normalizer.normalize(fixtureDoc(), 'c.json')

    expect(loadCount).toBe(1)
  })

  it('produces deterministic, identical output across repeated normalize() calls with the same input', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => ({ records: { GATS_BallisticGatling_S3: GATS_RECORD } }) })
    const normalizer = new ShipNormalizer(undefined, resolver)

    const first = normalizer.normalize(fixtureDoc(), 'test.json')
    const second = normalizer.normalize(fixtureDoc(), 'test.json')

    expect(first.ports.map((p) => ({ ...p }))).toEqual(second.ports.map((p) => ({ ...p })))
    expect(first.components).toEqual(second.components)
  })

  it('defaults to a real ComponentMetadataResolver when none is injected, and never throws regardless of whether a catalog file exists locally', () => {
    // No resolver injected — exercises the production default path
    // (reads generated-data/component-metadata-catalog.json from disk).
    // Whether that file exists on the machine running this test or not,
    // normalization must succeed either way — a missing catalog degrades
    // to "unresolved" for every entity, never a crash.
    const normalizer = new ShipNormalizer()
    expect(() => normalizer.normalize(fixtureDoc(), 'test.json')).not.toThrow()
  })
})
