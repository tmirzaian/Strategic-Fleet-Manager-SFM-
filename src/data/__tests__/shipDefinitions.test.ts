import { describe, it, expect } from 'vitest'
import { shipDefinitions, selectableShipDefinitions, shipDefinitionById, shipFactoryTemplates } from '../shipDefinitions'
import { importedShipList } from '../../generated/importedShips'
import { shipCatalogRecords } from '../../generated/shipCatalog'
import { materializeFleetAsset } from '../../utils/fleetAssetMaterializer'
import { buildPortTree } from '../../utils/portTree'

const gladiusDefinition = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Gladius')

describe('importedFactoryTemplate — Mission M-011 (full nested port tree, not collapsed equipmentAssignments)', () => {
  it('produces one template row per authoritative Port, not one per collapsed equipment assignment', () => {
    if (!gladiusDefinition) return // real generated-data not present on this machine — nothing to assert
    const view = importedShipList.find((v) => v.ship.id === gladiusDefinition.id)!
    const template = shipFactoryTemplates[gladiusDefinition.id]
    expect(template.length).toBe(view.ports.length)
    expect(template.length).toBeGreaterThan(view.equipmentAssignments.length) // strictly more detail than the collapsed view
  })

  it('every template slotLabel is unique — the disambiguation prevents the "Class 2" / "01 Attach Missile" collision', () => {
    if (!gladiusDefinition) return
    const template = shipFactoryTemplates[gladiusDefinition.id]
    const labels = template.map((t) => t.slotLabel)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('preserves the Quantum Drive -> Jump Drive nesting (independent equipment, not collapsed)', () => {
    if (!gladiusDefinition) return
    const template = shipFactoryTemplates[gladiusDefinition.id]
    const quantumDrive = template.find((t) => t.slotLabel === 'Quantum Drive')
    const jumpDrive = template.find((t) => t.slotLabel.endsWith('— Jump Drive'))
    expect(quantumDrive).toBeDefined()
    expect(jumpDrive).toBeDefined()
    expect(jumpDrive!.parentSlotLabel).toBe('Quantum Drive')
  })

  it('a weapon mount is a top-level row and its child gun is nested beneath it', () => {
    if (!gladiusDefinition) return
    const template = shipFactoryTemplates[gladiusDefinition.id]
    const noseMount = template.find((t) => t.slotLabel === 'Nose Weapon')
    expect(noseMount).toBeDefined()
    expect(noseMount!.parentSlotLabel).toBeUndefined()
    const child = template.find((t) => t.parentSlotLabel === 'Nose Weapon')
    expect(child).toBeDefined()
  })
})

describe('materializeFleetAsset + buildPortTree — end-to-end for an imported ship (Mission M-011)', () => {
  it('a Fleet Asset materialized from an imported ShipDefinition keeps its full nested port tree', () => {
    if (!gladiusDefinition) return
    const definition = shipDefinitionById.get(gladiusDefinition.id)!
    const template = shipFactoryTemplates[gladiusDefinition.id]
    const { hardpoints } = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 })

    const tree = buildPortTree(hardpoints)
    const quantumDrive = tree.find((n) => n.hardpoint.slotLabel === 'Quantum Drive')
    expect(quantumDrive).toBeDefined()
    expect(quantumDrive!.children.some((c) => c.hardpoint.slotLabel.endsWith('— Jump Drive'))).toBe(true)

    // Every hardpoint id remains the row's own unique id (stable, from
    // materializeFleetAsset's own scheme) — no duplicates introduced by
    // the disambiguated labels.
    expect(new Set(hardpoints.map((h) => h.id)).size).toBe(hardpoints.length)
  })
})

describe('Mission M-012: shipDefinitions includes the authoritative ship/vehicle catalog (Add Ship roster breadth)', () => {
  it('12. Add Ship\'s roster includes catalog-derived ships far beyond the 12-ship seed fleet + 2 deep-imported ships', () => {
    if (shipCatalogRecords.length === 0) return // real generated-data/ship-catalog.json not present on this machine
    const catalogSourced = shipDefinitions.filter((d) => d.sourceMetadata.sourceType === 'StarBreaker' && (d as unknown as { sourceMetadata: { sourceFile?: string } }).sourceMetadata.sourceFile === 'ship-catalog')
    expect(catalogSourced.length).toBeGreaterThan(200)
  })

  it('12. a real, well-known catalog ship (Anvil F7A Hornet Mk II) is searchable by displayName and manufacturer, same shape as seed/imported ships', () => {
    if (shipCatalogRecords.length === 0) return
    const hornet = shipDefinitions.find((d) => d.id === 'ANVL_Hornet_F7A_Mk2')
    expect(hornet).toBeDefined()
    expect(hornet!.displayName).toBe('Anvil F7A Hornet Mk II')
    expect(hornet!.manufacturer).toBe('Anvil Aerospace')
  })

  it('does not duplicate the two deep-imported ships (Gladius, Avenger Titan) between the imported and catalog sources', () => {
    if (shipCatalogRecords.length === 0) return
    // Exactly one entry for the base Gladius/Avenger Titan — the
    // deep-imported one — not a second catalog-only duplicate. (Real,
    // distinct variants like "Gladius Valiant" are expected to appear
    // separately and are not a duplicate of the base ship.)
    expect(shipDefinitions.filter((d) => d.displayName === 'Gladius').length).toBe(1)
    expect(shipDefinitions.filter((d) => d.displayName === 'Avenger Titan').length).toBe(1)
    expect(shipDefinitions.some((d) => d.displayName === 'Aegis Gladius')).toBe(false)
    expect(shipDefinitions.some((d) => d.displayName === 'Aegis Avenger Titan')).toBe(false)
  })

  it('a catalog-only ship (no deep import) materializes with an empty, honest factory template rather than crashing or inventing ports', () => {
    if (shipCatalogRecords.length === 0) return
    const hornet = shipDefinitions.find((d) => d.id === 'ANVL_Hornet_F7A_Mk2')
    if (!hornet) return
    expect(shipFactoryTemplates[hornet.id]).toEqual([])
  })
})

describe('EWO-019: deep-imported ships supersede their catalog-only entry with no duplicate Add Ship listing', () => {
  it('every deep-imported ship appears in shipDefinitions exactly once under its generated id, and never a second time under its canonical entity class', () => {
    for (const v of importedShipList) {
      expect(shipDefinitions.filter((d) => d.id === v.ship.id).length).toBe(1)
      const canonicalId = v.ship.sourceEntityClass
      if (canonicalId) {
        expect(shipDefinitions.some((d) => d.id === canonicalId)).toBe(false)
      }
    }
  })

  it('a deep-imported ship materializes with a non-empty factory template (not the catalog-only empty fallback)', () => {
    for (const v of importedShipList) {
      const template = shipFactoryTemplates[v.ship.id]
      expect(template.length).toBeGreaterThan(0)
    }
  })
})

describe('EWO-019: canonical entity class resolves to the same rich definition as the generated import id (Task 7/8 identity alias)', () => {
  it('shipDefinitionById resolves a deep-imported ship both by its generated id and by its canonical entity class, to the identical object', () => {
    for (const v of importedShipList) {
      const canonicalId = v.ship.sourceEntityClass
      if (!canonicalId) continue
      const byGeneratedId = shipDefinitionById.get(v.ship.id)
      const byCanonicalId = shipDefinitionById.get(canonicalId)
      expect(byGeneratedId).toBeDefined()
      expect(byCanonicalId).toBe(byGeneratedId) // same object reference, not just equal shape
    }
  })

  it('shipFactoryTemplates also resolves a deep-imported ship by its canonical entity class, non-empty — this is what lets a FleetAsset persisted before deep-import existed (shipDefinitionId = canonical class) self-heal on next load instead of staying stuck on an empty template', () => {
    for (const v of importedShipList) {
      const canonicalId = v.ship.sourceEntityClass
      if (!canonicalId) continue
      expect(shipFactoryTemplates[canonicalId]).toEqual(shipFactoryTemplates[v.ship.id])
      expect(shipFactoryTemplates[canonicalId].length).toBeGreaterThan(0)
    }
  })

  it('the canonical-class alias is never listed a second time in the Add Ship roster (shipDefinitions stays de-duplicated)', () => {
    for (const v of importedShipList) {
      const canonicalId = v.ship.sourceEntityClass
      if (!canonicalId) continue
      expect(shipDefinitions.some((d) => d.id === canonicalId)).toBe(false)
    }
  })
})

describe('EWO-021: Canonical Ship Definition Consolidation', () => {
  it('Task 1/7 — no two selectable definitions describe the same real hull (no duplicate names in the Add Ship picker)', () => {
    // Manufacturer-prefix-aware: a Mission M-012 catalog entry's own
    // displayName bakes the manufacturer in ("Drake Cutlass Red"); a
    // seed/deep-imported definition's name never does. Comparing bare
    // (post-strip) names is what actually reflects what a Commander sees
    // as "the same ship", exactly like the picker's own de-duplication.
    function bare(d: (typeof selectableShipDefinitions)[number]): string {
      if (d.sourceMetadata.sourceType === 'StarBreaker' && (d.sourceMetadata as { sourceFile?: string }).sourceFile === 'ship-catalog') {
        const firstWord = d.displayName.split(' ')[0]
        if (firstWord && d.manufacturer.toLowerCase().startsWith(firstWord.toLowerCase())) {
          return d.displayName.slice(firstWord.length).trim().toLowerCase()
        }
      }
      return d.displayName.toLowerCase()
    }
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const d of selectableShipDefinitions) {
      const key = bare(d)
      if (seen.has(key)) duplicates.push(`"${key}": ${seen.get(key)} vs ${d.id}`)
      else seen.set(key, d.id)
    }
    expect(duplicates).toEqual([])
  })

  it('Task 2 — Cutlass Black resolves to the deep-imported (richest) definition in the picker, not the seed demo entry', () => {
    if (shipCatalogRecords.length === 0) return // real generated-data not present on this machine
    const cutlassBlackEntries = selectableShipDefinitions.filter((d) => d.displayName === 'Cutlass Black')
    expect(cutlassBlackEntries).toHaveLength(1)
    expect(cutlassBlackEntries[0].sourceMetadata.sourceType).toBe('StarBreaker')
    expect(cutlassBlackEntries[0].id).toBe('cutlass-black-imported')
  })

  it('Task 2 — Corsair resolves to the deep-imported definition in the picker, not the seed demo entry', () => {
    if (shipCatalogRecords.length === 0) return
    const corsairEntries = selectableShipDefinitions.filter((d) => d.displayName === 'Corsair')
    expect(corsairEntries).toHaveLength(1)
    expect(corsairEntries[0].id).toBe('corsair-imported')
  })

  it('Task 2 — Cutlass Red resolves to the seed definition (real hardpoints) over the empty Mission M-012 catalog placeholder', () => {
    if (shipCatalogRecords.length === 0) return
    const cutlassRedEntries = selectableShipDefinitions.filter((d) => d.displayName === 'Cutlass Red')
    expect(cutlassRedEntries).toHaveLength(1)
    expect(cutlassRedEntries[0].sourceMetadata.sourceType).toBe('seed')
    expect(cutlassRedEntries[0].id).toBe('cutlass-red')
    // The catalog placeholder must not also appear under its own entityClass id.
    expect(selectableShipDefinitions.some((d) => d.id === 'DRAK_Cutlass_Red')).toBe(false)
  })

  it('Task 1 — the same pattern holds for every other seed ship with a catalog-only placeholder counterpart (Ghost, MOLE, Railen, 135c, M80, Starlite, UTV, Vulture, Prospector)', () => {
    if (shipCatalogRecords.length === 0) return
    const seedNamesWithKnownCatalogCollision = ['F7C-S Hornet Ghost Mk II', 'MOLE', 'Railen', '135c', 'M80', 'Starlite', 'UTV', 'Vulture', 'Prospector']
    for (const name of seedNamesWithKnownCatalogCollision) {
      const matches = selectableShipDefinitions.filter((d) => d.displayName === name)
      expect(matches, `expected exactly one selectable "${name}"`).toHaveLength(1)
      expect(matches[0].sourceMetadata.sourceType).toBe('seed')
    }
  })

  it('Task 5 — a FleetAsset referencing a delisted catalog-only placeholder id self-heals to the canonical (seed) definition\'s real data', () => {
    if (shipCatalogRecords.length === 0) return
    const canonical = shipDefinitionById.get('cutlass-red')
    const superseded = shipDefinitionById.get('DRAK_Cutlass_Red')
    expect(canonical).toBeDefined()
    expect(superseded).toBe(canonical) // same object reference — real self-healing, not a coincidental equal shape
    expect(shipFactoryTemplates['DRAK_Cutlass_Red']).toEqual(shipFactoryTemplates['cutlass-red'])
    expect(shipFactoryTemplates['DRAK_Cutlass_Red'].length).toBeGreaterThan(0)
  })

  it('Task 5 (safety) — a seed definition superseded by a deep-import is NOT aliased away (no risk of orphaning a hand-authored custom Loadout)', () => {
    if (shipCatalogRecords.length === 0) return
    const seedCutlassBlack = shipDefinitionById.get('cutlass-black')
    const seedCorsair = shipDefinitionById.get('corsair')
    // Both ids still resolve to their OWN original seed definition, not
    // silently redirected to the deep-imported one — an existing
    // FleetAsset on either id keeps materializing exactly as it always
    // has, no remapping risk to a differently-shaped real port tree.
    expect(seedCutlassBlack?.sourceMetadata.sourceType).toBe('seed')
    expect(seedCorsair?.sourceMetadata.sourceType).toBe('seed')
  })

  it('Task 6 — searching "Cutlass Black" or "Cutlass Red" against the selectable roster returns exactly one match each (a bare "Red" substring also matching an unrelated ship, e.g. "Aegis Redeemer", is correct and expected — this checks the reported duplicate specifically, not global substring uniqueness)', () => {
    if (shipCatalogRecords.length === 0) return
    const search = (q: string) => selectableShipDefinitions.filter((d) => d.displayName.toLowerCase().includes(q.toLowerCase()))
    expect(search('Cutlass Black')).toHaveLength(1)
    expect(search('Cutlass Red')).toHaveLength(1)
  })

  it('every definition in the full registry (canonical or superseded) remains resolvable by id — no FleetAsset can be orphaned', () => {
    for (const d of shipDefinitions) {
      expect(shipDefinitionById.get(d.id)).toBeDefined()
    }
  })
})
