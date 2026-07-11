import { describe, it, expect } from 'vitest'
import { materializeFleetAsset } from '../fleetAssetMaterializer'
import type { ShipDefinition } from '../../types'
import type { FactoryHardpointTemplate } from '../../data/shipDefinitions'

const definition: ShipDefinition = {
  id: 'test-ship',
  internalName: 'test-ship',
  displayName: 'Test Ship',
  manufacturer: 'Test Co',
  classification: { rsiRoles: ['Combat'], focusTags: [], source: 'MANUAL_SEED' },
  career: 'Combat',
  role: 'Fighter',
  imageUrl: undefined,
  equipmentGroups: [],
  portIds: [],
  factoryLoadoutId: 'test-ship-factory-loadout',
  sourceMetadata: { sourceType: 'seed' },
}

const template: FactoryHardpointTemplate[] = [
  { slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' },
  { slotLabel: 'Power 1', type: 'Power Plant', size: 'S1', factoryItem: 'Stock Power Plant' },
  { slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: '—' },
]

describe('materializeFleetAsset', () => {
  it('a fresh asset starts with Installed = Factory = Target for every hardpoint', () => {
    const { hardpoints } = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 })
    for (const hp of hardpoints) {
      expect(hp.installedItem).toBe(hp.factoryItem)
      expect(hp.targetItem).toBe(hp.factoryItem)
    }
  })

  it('readiness is 100% when Installed = Factory = Target (genuinely empty ports do not reduce it)', () => {
    const { build } = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 })
    expect(build.readiness).toBe(100)
    expect(build.missing).toEqual([])
  })

  it('the Factory Build becomes the active build', () => {
    const { asset, build, ship } = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 })
    expect(build.name).toBe('Factory Loadout')
    expect(build.kind).toBe('FACTORY')
    expect(build.isActive).toBe(true)
    expect(asset.activeBuildId).toBe(build.id)
    expect(ship.activeBuildId).toBe(build.id)
  })

  it('two materializations of the same definition produce unique asset/ship/build ids', () => {
    const first = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 })
    const second = materializeFleetAsset({ definition, template, ownershipType: 'LOANER', priority: 2 })
    expect(first.asset.id).not.toBe(second.asset.id)
    expect(first.build.id).not.toBe(second.build.id)
    expect(first.ship.id).not.toBe(second.ship.id)
  })

  it('maps OWNED/PURCHASED/LOANER to the legacy Owned/Purchased/Loaner ship.ownership values', () => {
    expect(materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 }).ship.ownership).toBe('Owned')
    expect(materializeFleetAsset({ definition, template, ownershipType: 'PURCHASED', priority: 1 }).ship.ownership).toBe('Purchased')
    expect(materializeFleetAsset({ definition, template, ownershipType: 'LOANER', priority: 1 }).ship.ownership).toBe('Loaner')
  })

  it('with no nickname, the ship displays the model name', () => {
    const { ship } = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 })
    expect(ship.name).toBe('Test Ship')
  })

  it('with a nickname, the ship displays the nickname and folds the model name into the subtitle', () => {
    const { ship } = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', nickname: 'Daily Driver', priority: 1 })
    expect(ship.name).toBe('Daily Driver')
    expect(ship.role).toContain('Test Ship')
  })

  it('replaying with an existingAsset reuses its id verbatim instead of minting a new one', () => {
    const original = materializeFleetAsset({ definition, template, ownershipType: 'PURCHASED', nickname: 'Titan Hauler', priority: 5 })
    const replayed = materializeFleetAsset({ definition, template, existingAsset: original.asset })
    expect(replayed.asset.id).toBe(original.asset.id)
    expect(replayed.ship.id).toBe(original.ship.id)
    expect(replayed.ship.name).toBe('Titan Hauler')
    expect(replayed.ship.ownership).toBe('Purchased')
  })
})
