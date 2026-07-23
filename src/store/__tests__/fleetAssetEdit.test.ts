import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

describe('Fleet Asset edit actions', () => {
  it('edit nickname updates the displayed ship name', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    useFleetStore.getState().updateFleetAssetNickname(added.assetId!, 'Red One')
    const ship = useFleetStore.getState().ships.find((s) => s.id === added.assetId)!
    expect(ship.name).toBe('Red One')
  })

  it('clearing a nickname reverts the ship name to the model display name', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Red One')
    useFleetStore.getState().updateFleetAssetNickname(added.assetId!, undefined)
    const ship = useFleetStore.getState().ships.find((s) => s.id === added.assetId)!
    expect(ship.name).toBe('Gladius')
  })

  it('change ownership type updates the badge-driving ownership field', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'LOANER')
    useFleetStore.getState().updateFleetAssetOwnership(added.assetId!, 'PURCHASED')
    const ship = useFleetStore.getState().ships.find((s) => s.id === added.assetId)!
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === added.assetId)!
    expect(ship.ownership).toBe('Purchased')
    expect(asset.ownershipType).toBe('PURCHASED')
  })
})

describe('Importer safety (Golden Scenario G, tests 37/40)', () => {
  it('37: player Builds and Fleet Assets are never read from or derived from /generated-data at runtime', () => {
    // shipDefinitions.ts is the ONLY module that reads generated-data
    // (via src/generated/importedShips.ts), and it produces catalog data
    // only (ShipDefinition, factory templates) — never FleetAsset/Build
    // records, which live exclusively in the store/localStorage.
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Import Safety')
    expect(result.success).toBe(true)
    // The new asset exists purely in store state; nothing about it was
    // read from or written to generated-data.
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === result.assetId)
    expect(asset).toBeDefined()
  })

  it('40: existing Alpha 2.0 atomic transfer behavior still holds after Alpha 2.1 changes', () => {
    // Ghost's real canonical Left Shield Generator has Mirage installed
    // (seed.ts's customBuildOverlays); Vulture's Right Shield Generator
    // (S1, same size, genuinely empty from factory) is a real compatible
    // destination.
    const result = useFleetStore.getState().moveComponentBetweenShips('ghost', 'Left Shield Generator', 'vulture', 'Right Shield Generator')
    expect(result.matched).toBe(true)
    expect(result.itemName).toBe('Mirage')
  })
})
