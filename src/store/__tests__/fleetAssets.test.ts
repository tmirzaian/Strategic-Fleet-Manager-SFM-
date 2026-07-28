import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { ownershipTone } from '../../components/Badge'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

function findDefinitionByName(name: string) {
  const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === name)
  if (!def) throw new Error(`No ShipDefinition named "${name}" — check src/data/shipDefinitions.ts`)
  return def
}

describe('Fleet Asset lifecycle (useFleetStore)', () => {
  it('1. a Ship Definition without a Fleet Asset is absent from Fleet Dashboard (the ships list)', () => {
    // Gladius/Avenger Titan definitions exist but have no seed-migrated asset.
    const gladiusDefinition = findDefinitionByName('Gladius')
    const ships = useFleetStore.getState().ships
    expect(ships.some((s) => s.id === gladiusDefinition.id)).toBe(false)
  })

  it('2. Add Ship creates a Fleet Asset', () => {
    const def = findDefinitionByName('Gladius')
    const before = useFleetStore.getState().fleetAssets.length
    const result = useFleetStore.getState().addFleetAsset(def.id, 'PURCHASED')
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().fleetAssets.length).toBe(before + 1)
  })

  it('3. the new Fleet Asset appears immediately on Fleet Dashboard (ships array) with no extra step', () => {
    const def = findDefinitionByName('Gladius')
    const result = useFleetStore.getState().addFleetAsset(def.id, 'PURCHASED', 'Titan Hauler')
    const ship = useFleetStore.getState().ships.find((s) => s.id === result.assetId)
    expect(ship).toBeDefined()
  })

  it('4. Installed Loadout initializes from Factory for the new asset', () => {
    const def = findDefinitionByName('Gladius')
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const hardpoints = useFleetStore.getState().hardpoints.filter((h) => h.shipId === result.assetId)
    expect(hardpoints.length).toBeGreaterThan(0)
    for (const hp of hardpoints) {
      expect(hp.installedItem).toBe(hp.factoryItem)
    }
  })

  it('5. the Factory Build becomes the active build for the new asset', () => {
    const def = findDefinitionByName('Gladius')
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === result.assetId)!
    const build = useFleetStore.getState().builds.find((b) => b.id === asset.activeBuildId)!
    expect(build.name).toBe('Factory Loadout')
    expect(build.isActive).toBe(true)
  })

  it('6. Purchased ownership receives the blue badge tone', () => {
    expect(ownershipTone('Purchased')).toBe('cyan')
  })

  it('7. Owned ownership receives the green badge tone', () => {
    expect(ownershipTone('Owned')).toBe('success')
  })

  it('8. Loaner ownership receives the yellow/warning badge tone', () => {
    expect(ownershipTone('Loaner')).toBe('warning')
  })

  it('9. Mission Control-style counts derive from ships (Fleet Assets only) — adding a Purchased Titan increases Purchased, not Owned', () => {
    const def = findDefinitionByName('Avenger Titan')
    const before = useFleetStore.getState().ships
    const ownedBefore = before.filter((s) => s.ownership === 'Owned').length
    const purchasedBefore = before.filter((s) => s.ownership === 'Purchased').length
    const totalBefore = before.length

    useFleetStore.getState().addFleetAsset(def.id, 'PURCHASED', 'Titan Hauler')

    const after = useFleetStore.getState().ships
    expect(after.length).toBe(totalBefore + 1)
    expect(after.filter((s) => s.ownership === 'Purchased').length).toBe(purchasedBefore + 1)
    expect(after.filter((s) => s.ownership === 'Owned').length).toBe(ownedBefore)
  })

  it('10. multiple copies of the same Ship Definition are allowed', () => {
    const def = findDefinitionByName('Gladius')
    const first = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Daily Driver')
    const second = useFleetStore.getState().addFleetAsset(def.id, 'LOANER', 'Org Loaner')
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    const gladiusAssets = useFleetStore.getState().fleetAssets.filter((a) => a.shipDefinitionId === def.id)
    expect(gladiusAssets.length).toBe(2)
  })

  it('11. each copy receives a unique Fleet Asset ID', () => {
    const def = findDefinitionByName('Gladius')
    const first = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const second = useFleetStore.getState().addFleetAsset(def.id, 'LOANER')
    expect(first.assetId).not.toBe(second.assetId)
  })

  it('12. each copy has an independent Installed Loadout (hardpoints scoped to its own asset id)', () => {
    const def = findDefinitionByName('Gladius')
    const first = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const second = useFleetStore.getState().addFleetAsset(def.id, 'LOANER')
    const firstHardpoints = useFleetStore.getState().hardpoints.filter((h) => h.shipId === first.assetId)
    const secondHardpoints = useFleetStore.getState().hardpoints.filter((h) => h.shipId === second.assetId)
    expect(firstHardpoints.length).toBeGreaterThan(0)
    expect(secondHardpoints.length).toBe(firstHardpoints.length)
    expect(firstHardpoints.map((h) => h.id)).not.toEqual(secondHardpoints.map((h) => h.id))
  })

  it('13. retiring a Fleet Asset does not delete the Ship Definition', () => {
    const def = findDefinitionByName('Gladius')
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    useFleetStore.getState().retireFleetAsset(result.assetId!)
    const stillExists = useFleetStore.getState().shipDefinitions.some((d) => d.id === def.id)
    expect(stillExists).toBe(true)
  })

  it('14. SW-015C (Deliverable 5): retiring one duplicate does not retire — or otherwise affect — another instance of the same model', () => {
    const def = findDefinitionByName('Gladius')
    const first = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Keep Me')
    const second = useFleetStore.getState().addFleetAsset(def.id, 'LOANER', 'Retire Me')

    useFleetStore.getState().retireFleetAsset(second.assetId!)

    const ships = useFleetStore.getState().ships
    // Retirement never deletes the vessel record — both remain present,
    // only the retired one's lifecycleStatus changes.
    expect(ships.find((s) => s.id === first.assetId)?.lifecycleStatus).toBe('active')
    expect(ships.find((s) => s.id === second.assetId)?.lifecycleStatus).toBe('retired')
  })

  it('18. the correct Fleet Asset instance is identifiable by id for Ship Detail navigation, even with duplicates', () => {
    const def = findDefinitionByName('Gladius')
    const first = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Card A')
    const second = useFleetStore.getState().addFleetAsset(def.id, 'LOANER', 'Card B')

    const shipA = useFleetStore.getState().ships.find((s) => s.id === first.assetId)!
    const shipB = useFleetStore.getState().ships.find((s) => s.id === second.assetId)!
    expect(shipA.name).toBe('Card A')
    expect(shipB.name).toBe('Card B')
    expect(shipA.id).not.toBe(shipB.id)
  })

  it('17. the existing seed fleet migrates without card loss — 12 seed ships remain visible', () => {
    const ships = useFleetStore.getState().ships
    const seedAssets = useFleetStore.getState().fleetAssets.filter((a) => a.acquisitionSource === 'SEED_MIGRATION')
    expect(seedAssets.length).toBe(12)
    expect(ships.length).toBe(12)
  })
})
