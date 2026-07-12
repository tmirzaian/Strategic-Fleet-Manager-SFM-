import { describe, it, expect } from 'vitest'
import { shipDefinitions, shipDefinitionById, shipFactoryTemplates } from '../shipDefinitions'
import { importedShipList } from '../../generated/importedShips'
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
