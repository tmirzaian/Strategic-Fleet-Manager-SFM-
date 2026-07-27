import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { comparePriority } from '../../utils/fleetPriority'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

describe('updateFleetProfile (Alpha 2.4, Part 7) — Primary/Secondary Role only (EWO-066 Part E moved Priority to setFleetPriority)', () => {
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
    useFleetStore.getState().updateFleetProfile('ghost', { secondaryRole: 'Reconnaissance' })
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.primaryRole).toBe('Escort')
    expect(ship.secondaryRole).toBe('Reconnaissance')
  })

  it('fails cleanly for an unknown Fleet Asset', () => {
    const result = useFleetStore.getState().updateFleetProfile('does-not-exist', { primaryRole: 'Escort' })
    expect(result.success).toBe(false)
  })
})

describe('setFleetPriority (EWO-066 Part E) — the sole entry point for Fleet Priority', () => {
  it('sets a ship to a specific rank, reflected on both the Ship and FleetAsset records', () => {
    const result = useFleetStore.getState().setFleetPriority('ghost', 1)
    expect(result.success).toBe(true)
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.priority).toBe(1)
    // Ghost is a seed-migrated Fleet Asset — its real FleetAsset id is
    // "ghost-asset-seed", not "ghost" (see resolveFleetAssetId).
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === 'ghost-asset-seed')!
    expect(asset.priority).toBe(1)
  })

  it('setting a ship to Unprioritized (null) closes the gap it leaves in the rest of the ranking', () => {
    const before = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.priority!
    useFleetStore.getState().setFleetPriority('ghost', null)
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.priority).toBeNull()
    // Every ship that was ranked below Ghost's old position shifts up by one.
    const stillRanked = useFleetStore.getState().ships.filter((s) => s.priority !== null)
    const ranks = stillRanked.map((s) => s.priority).sort((a, b) => a! - b!)
    expect(ranks).toEqual(Array.from({ length: stillRanked.length }, (_, i) => i + 1))
    expect(before).toBeGreaterThan(0)
  })

  it('inserting a ship at an existing rank shifts every ship at or after that position down by one — never a duplicate', () => {
    useFleetStore.getState().setFleetPriority('vulture', 1)
    const ships = useFleetStore.getState().ships.filter((s) => s.priority !== null)
    const ranks = ships.map((s) => s.priority)
    expect(new Set(ranks).size).toBe(ranks.length) // no duplicates
    expect(useFleetStore.getState().ships.find((s) => s.id === 'vulture')?.priority).toBe(1)
  })

  it('requesting a rank beyond the current fleet size clamps to the end rather than leaving a gap', () => {
    const fleetSize = useFleetStore.getState().ships.filter((s) => s.priority !== null).length
    useFleetStore.getState().setFleetPriority('ghost', 9999)
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.priority).toBe(fleetSize)
  })

  it('rejects a non-positive or non-integer priority', () => {
    expect(useFleetStore.getState().setFleetPriority('ghost', 0).success).toBe(false)
    expect(useFleetStore.getState().setFleetPriority('ghost', -1).success).toBe(false)
    expect(useFleetStore.getState().setFleetPriority('ghost', 1.5).success).toBe(false)
  })

  it('fails cleanly for an unknown Fleet Asset', () => {
    const result = useFleetStore.getState().setFleetPriority('does-not-exist', 1)
    expect(result.success).toBe(false)
  })

  it('Fleet Priority changes affect Fleet Dashboard priority sort order', () => {
    useFleetStore.getState().setFleetPriority('vulture', 1)
    const ships = [...useFleetStore.getState().ships].sort((a, b) => comparePriority(a.priority, b.priority))
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
