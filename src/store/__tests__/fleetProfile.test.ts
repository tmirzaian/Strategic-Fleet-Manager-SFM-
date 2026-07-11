import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

describe('updateFleetProfile (Alpha 2.4, Part 7)', () => {
  it('updates Fleet Priority, and the new value is reflected on the Ship record that drives dashboard sorting', () => {
    const result = useFleetStore.getState().updateFleetProfile('ghost', { priority: 1 })
    expect(result.success).toBe(true)
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.priority).toBe(1)
  })

  it("updates the FleetAsset record's priority in lockstep with the Ship record", () => {
    useFleetStore.getState().updateFleetProfile('ghost', { priority: 2 })
    // Ghost is a seed-migrated Fleet Asset — its real FleetAsset id is
    // "ghost-asset-seed", not "ghost" (see resolveFleetAssetId).
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === 'ghost-asset-seed')!
    expect(asset.priority).toBe(2)
  })

  it('sets Primary Role and Secondary Role independently of Ship Classification and existing role text', () => {
    useFleetStore.getState().updateFleetProfile('ghost', { primaryRole: 'Escort', secondaryRole: 'Reconnaissance' })
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.primaryRole).toBe('Escort')
    expect(ship.secondaryRole).toBe('Reconnaissance')
    const definition = useFleetStore.getState().shipDefinitions.find((d) => d.id === 'ghost')!
    expect(definition.classification.rsiRoles).toContain('Combat')
  })

  it('a partial update only changes the fields provided, leaving the rest intact', () => {
    useFleetStore.getState().updateFleetProfile('ghost', { primaryRole: 'Escort' })
    useFleetStore.getState().updateFleetProfile('ghost', { priority: 3 })
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.primaryRole).toBe('Escort')
    expect(ship.priority).toBe(3)
  })

  it('fails cleanly for an unknown Fleet Asset', () => {
    const result = useFleetStore.getState().updateFleetProfile('does-not-exist', { priority: 1 })
    expect(result.success).toBe(false)
  })

  it('Fleet Priority changes affect Fleet Dashboard priority sort order', () => {
    useFleetStore.getState().updateFleetProfile('vulture', { priority: 0 })
    const ships = [...useFleetStore.getState().ships].sort((a, b) => a.priority - b.priority)
    expect(ships[0].id).toBe('vulture')
  })
})

describe('Alpha 2.4 regression: seed-migrated Fleet Assets can be edited and removed', () => {
  it('updateFleetAssetNickname succeeds for a seed ship (ship.id !== asset.id)', () => {
    const result = useFleetStore.getState().updateFleetAssetNickname('ghost', 'Nightwing')
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.name).toBe('Nightwing')
  })

  it('updateFleetAssetOwnership succeeds for a seed ship', () => {
    const result = useFleetStore.getState().updateFleetAssetOwnership('corsair', 'LOANER')
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().ships.find((s) => s.id === 'corsair')?.ownership).toBe('Loaner')
  })

  it('removeFleetAsset succeeds for a seed ship and actually removes it', () => {
    const before = useFleetStore.getState().ships.length
    const result = useFleetStore.getState().removeFleetAsset('mole')
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().ships.length).toBe(before - 1)
    expect(useFleetStore.getState().ships.some((s) => s.id === 'mole')).toBe(false)
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === 'mole-asset-seed')!
    expect(asset.status).toBe('removed')
  })
})
