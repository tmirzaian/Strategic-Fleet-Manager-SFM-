import { describe, it, expect, vi } from 'vitest'
import { executeInstallation } from '../installationEngine'
import type { InstallationEffects, InstallationStateSnapshot } from '../types'
import type { Hardpoint, Ship } from '../../../types'

/**
 * EWO-STAB-003B — end-to-end tests of the installation engine's public
 * entry point, entirely decoupled from Zustand (EWO-STAB-003A §1's
 * requirement that the engine never depend on the store). `effects` are
 * plain spy functions here — a real future caller (e.g. an RSI sync
 * process) could supply any implementation satisfying the same shape.
 */

function ship(overrides: Partial<Ship> = {}): Ship {
  return { id: 'ghost', name: 'Ghost', manufacturer: 'Anvil', ownership: 'Owned', career: 'Combat', role: 'Stealth Fighter', activeBuildId: 'build-1', readiness: 100, priority: 1, missing: [], ...overrides }
}

function hardpoint(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: 'hp-1',
    shipId: 'ghost',
    buildId: 'build-1',
    slotLabel: 'Power 1',
    type: 'Power Plant',
    size: 'S1',
    factoryItem: 'Some Factory Plant',
    installedItem: '—',
    targetItem: 'Some Factory Plant',
    status: 'Missing',
    ...overrides,
  }
}

function makeEffects(): InstallationEffects & { applyShipMutation: ReturnType<typeof vi.fn>; commitHangarItems: ReturnType<typeof vi.fn>; commitReservations: ReturnType<typeof vi.fn>; returnToInventory: ReturnType<typeof vi.fn> } {
  return {
    applyShipMutation: vi.fn(),
    commitHangarItems: vi.fn(),
    commitReservations: vi.fn(),
    returnToInventory: vi.fn(),
  }
}

function baseState(overrides: Partial<InstallationStateSnapshot> = {}): InstallationStateSnapshot {
  return {
    ships: [ship()],
    builds: [],
    hardpoints: [hardpoint()],
    hangarItems: [],
    reservations: [],
    installedLoadouts: [],
    ...overrides,
  }
}

describe('EWO-STAB-003B: executeInstallation — INSTALL', () => {
  it('1. a compatible component into an explicit, open, valid slot succeeds and applies exactly the expected effects', () => {
    const state = baseState()
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'Slipstream' }, destination: { shipId: 'ghost', slotLabel: 'Power 1' } }, state, effects)
    expect(result.ok).toBe(true)
    expect(effects.applyShipMutation).toHaveBeenCalledWith('ghost', 'Power 1', 'Slipstream', undefined)
    expect(effects.commitHangarItems).toHaveBeenCalledTimes(1)
    expect(effects.commitReservations).toHaveBeenCalledTimes(1)
  })

  it('2. no slotLabel — no mutation at all, matching the EWO-STAB-002 containment invariant', () => {
    const state = baseState()
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'Slipstream' }, destination: { shipId: 'ghost' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(effects.applyShipMutation).not.toHaveBeenCalled()
    expect(effects.commitHangarItems).not.toHaveBeenCalled()
  })

  it('3. the Veil scenario — a Shield into a Power Plant slot is rejected, with no mutation', () => {
    const state = baseState()
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'FR-66' }, destination: { shipId: 'ghost', slotLabel: 'Power 1' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('incompatible')
    expect(effects.applyShipMutation).not.toHaveBeenCalled()
  })

  it('4. a competing reservation with no available stock is blocked before any mutation', () => {
    const state = baseState({
      hangarItems: [{ id: 'a', name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }],
      reservations: [
        {
          id: 'res-1',
          missionConfigurationId: 'some-other-build',
          fleetAssetId: 'ghost',
          targetSlotLabel: 'Shield 1',
          componentName: 'FR-66',
          quantity: 1,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      hardpoints: [hardpoint({ slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: 'FR-66', targetItem: 'FR-66' })],
    })
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'FR-66' }, destination: { shipId: 'ghost', slotLabel: 'Shield 1' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('reserved-elsewhere')
    expect(effects.applyShipMutation).not.toHaveBeenCalled()
  })

  it('5. an already-OK slot (nothing to install into) is rejected, matching the pre-existing "no open slot" behavior', () => {
    const state = baseState({ hardpoints: [hardpoint({ status: 'OK', installedItem: 'Something Already Installed' })] })
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'Slipstream' }, destination: { shipId: 'ghost', slotLabel: 'Power 1' } }, state, effects)
    expect(result.ok).toBe(false)
  })

  it('6. a ship that does not exist fails with ship-not-found', () => {
    const state = baseState()
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'Slipstream' }, destination: { shipId: 'no-such-ship', slotLabel: 'Power 1' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('ship-not-found')
  })

  it('7. resolving identity via a hangarItemId reference reaches the same result as a display name', () => {
    const state = baseState({ hangarItems: [{ id: 'hangar-item-1', name: 'Slipstream', type: 'Power Plant', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }] })
    const effects = makeEffects()
    const result = executeInstallation(
      { operation: 'INSTALL', component: { hangarItemId: 'hangar-item-1' }, destination: { shipId: 'ghost', slotLabel: 'Power 1' }, hangarItemId: 'hangar-item-1' },
      state,
      effects
    )
    expect(result.ok).toBe(true)
    expect(effects.applyShipMutation).toHaveBeenCalledWith('ghost', 'Power 1', 'Slipstream', undefined)
  })
})

describe('EWO-STAB-003B: executeInstallation — REMOVE', () => {
  it('8. removing an installed component succeeds and, with returnToInventory, calls the injected return-to-inventory effect', () => {
    const state = baseState({ hardpoints: [hardpoint({ status: 'OK', installedItem: 'Slipstream' })] })
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'REMOVE', destination: { shipId: 'ghost', slotLabel: 'Power 1' }, returnToInventory: true }, state, effects)
    expect(result.ok).toBe(true)
    expect(effects.applyShipMutation).toHaveBeenCalledWith('ghost', 'Power 1', '—')
    expect(effects.returnToInventory).toHaveBeenCalledWith({ name: 'Slipstream', type: 'Power Plant', size: 'S1' })
  })

  it('9. removing without returnToInventory never calls the return-to-inventory effect', () => {
    const state = baseState({ hardpoints: [hardpoint({ status: 'OK', installedItem: 'Slipstream' })] })
    const effects = makeEffects()
    executeInstallation({ operation: 'REMOVE', destination: { shipId: 'ghost', slotLabel: 'Power 1' } }, state, effects)
    expect(effects.returnToInventory).not.toHaveBeenCalled()
  })

  it('10. removing from an empty slot fails, no mutation', () => {
    const state = baseState()
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'REMOVE', destination: { shipId: 'ghost', slotLabel: 'Power 1' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(effects.applyShipMutation).not.toHaveBeenCalled()
  })
})

describe('EWO-052 (Inventory Transaction Integrity Initiative): INSTALL never silently destroys a real displaced occupant', () => {
  // Root cause: a hardpoint whose status is 'Missing' or 'Upgrade
  // Available' (NOT 'OK') can still have a real, different component
  // physically installed (e.g. a factory-original part the Commander
  // never explicitly removed before choosing a new Target). Before this
  // fix, installing over such a slot silently overwrote `installedItem`
  // with no accounting for the displaced component anywhere — not
  // returned to Hangar Inventory, not logged, gone from every tracked
  // ownership state at once (reproduced directly during this mission's
  // investigation). This is the swap-without-a-first-class-swap-operation
  // gap: "one component, one owner, one location, always."
  it("15. installing over a hardpoint with a real, different installed item returns the displaced item to Hangar Inventory as part of the SAME commit", () => {
    const state = baseState({
      hardpoints: [hardpoint({ slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: 'AllStop', installedItem: 'AllStop', installedEntityClass: 'SHLD_GODI_S01_AllStop_SCItem', targetItem: 'FR-66', status: 'Missing' })],
    })
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'FR-66' }, destination: { shipId: 'ghost', slotLabel: 'Shield 1' } }, state, effects)
    expect(result.ok).toBe(true)
    // One commit, not a separate live returnToInventory call — see
    // installationEngine.ts's own doc comment for why a live call here
    // would be silently erased by the later commitHangarItems overwrite.
    expect(effects.returnToInventory).not.toHaveBeenCalled()
    expect(effects.commitHangarItems).toHaveBeenCalledTimes(1)
    const committed = effects.commitHangarItems.mock.calls[0][0] as { name: string; entityClass?: string; qty: number }[]
    const displaced = committed.find((h) => h.entityClass === 'SHLD_GODI_S01_AllStop_SCItem')
    expect(displaced).toBeDefined()
    expect(displaced?.name).toBe('AllStop')
    expect(displaced?.qty).toBe(1)
  })

  it('16. the displaced item merges into an existing matching Hangar Inventory record (qty increments) rather than creating a duplicate row', () => {
    const state = baseState({
      hardpoints: [hardpoint({ slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: 'AllStop', installedItem: 'AllStop', installedEntityClass: 'SHLD_GODI_S01_AllStop_SCItem', targetItem: 'FR-66', status: 'Missing' })],
      hangarItems: [{ id: 'existing-1', name: 'AllStop', type: 'Shield', size: 'S1', entityClass: 'SHLD_GODI_S01_AllStop_SCItem', qty: 2, neededBy: 'None', disposition: 'Store' }],
    })
    const effects = makeEffects()
    executeInstallation({ operation: 'INSTALL', component: { displayName: 'FR-66' }, destination: { shipId: 'ghost', slotLabel: 'Shield 1' } }, state, effects)
    const committed = effects.commitHangarItems.mock.calls[0][0] as { id: string; qty: number }[]
    expect(committed.filter((h) => h.id === 'existing-1')).toHaveLength(1)
    expect(committed.find((h) => h.id === 'existing-1')?.qty).toBe(3)
  })

  it('17. installing the SAME component already occupying the slot never returns-then-reconsumes it (no phantom round-trip)', () => {
    const state = baseState({
      hardpoints: [hardpoint({ slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: 'FR-66', installedItem: 'FR-66', targetItem: 'FR-66', status: 'Missing' })],
    })
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'FR-66' }, destination: { shipId: 'ghost', slotLabel: 'Shield 1' } }, state, effects)
    expect(result.ok).toBe(true)
    const committed = effects.commitHangarItems.mock.calls[0][0] as unknown[]
    expect(committed).toHaveLength(0)
  })

  it('18. a failed install (incompatible destination) leaves the destination slot\'s existing occupant completely untouched — no partial transaction', () => {
    const state = baseState({
      hardpoints: [hardpoint({ slotLabel: 'Power 1', type: 'Power Plant', installedItem: 'Some Other Plant', status: 'Missing' })],
    })
    const effects = makeEffects()
    // FR-66 is a Shield — incompatible with a Power Plant slot.
    const result = executeInstallation({ operation: 'INSTALL', component: { displayName: 'FR-66' }, destination: { shipId: 'ghost', slotLabel: 'Power 1' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(effects.applyShipMutation).not.toHaveBeenCalled()
    expect(effects.commitHangarItems).not.toHaveBeenCalled()
    expect(effects.returnToInventory).not.toHaveBeenCalled()
  })
})

describe('EWO-052: TRANSFER never silently destroys a real occupant already on the recipient hardpoint', () => {
  it('19. transferring into a recipient slot with a real, different installed item returns that item to Hangar Inventory', () => {
    const state = baseState({
      ships: [ship({ id: 'ghost' }), ship({ id: 'corsair', activeBuildId: 'build-2' })],
      hardpoints: [
        hardpoint({ slotLabel: 'Power 1', status: 'OK', installedItem: 'Slipstream' }),
        hardpoint({
          id: 'hp-2',
          shipId: 'corsair',
          buildId: 'build-2',
          slotLabel: 'Power A',
          status: 'Missing',
          installedItem: 'Some Old Plant',
          installedEntityClass: 'OLD_PLANT_ENTITY_CLASS',
        }),
      ],
    })
    const effects = makeEffects()
    const result = executeInstallation(
      { operation: 'TRANSFER', source: { shipId: 'ghost', slotLabel: 'Power 1' }, destination: { shipId: 'corsair', slotLabel: 'Power A' }, compatibilityMode: 'exact-slot-match' },
      state,
      effects
    )
    expect(result.ok).toBe(true)
    expect(effects.returnToInventory).toHaveBeenCalledWith({ name: 'Some Old Plant', type: 'Power Plant', size: 'S1', entityClass: 'OLD_PLANT_ENTITY_CLASS' })
    expect(effects.applyShipMutation).toHaveBeenCalledWith('corsair', 'Power A', 'Slipstream', undefined)
  })

  it("20. transferring into an empty recipient slot ('—') never calls returnToInventory — nothing to displace", () => {
    const state = baseState({
      ships: [ship({ id: 'ghost' }), ship({ id: 'corsair', activeBuildId: 'build-2' })],
      hardpoints: [
        hardpoint({ slotLabel: 'Power 1', status: 'OK', installedItem: 'Slipstream' }),
        hardpoint({ id: 'hp-2', shipId: 'corsair', buildId: 'build-2', slotLabel: 'Power A', status: 'Missing', installedItem: '—' }),
      ],
    })
    const effects = makeEffects()
    executeInstallation(
      { operation: 'TRANSFER', source: { shipId: 'ghost', slotLabel: 'Power 1' }, destination: { shipId: 'corsair', slotLabel: 'Power A' }, compatibilityMode: 'exact-slot-match' },
      state,
      effects
    )
    expect(effects.returnToInventory).not.toHaveBeenCalled()
  })
})

describe('EWO-STAB-003B: executeInstallation — TRANSFER (moveComponentBetweenShips parity)', () => {
  it('11. a compatible transfer between two ships succeeds and mutates both sides', () => {
    const state = baseState({
      ships: [ship({ id: 'ghost' }), ship({ id: 'corsair', activeBuildId: 'build-2' })],
      hardpoints: [
        hardpoint({ slotLabel: 'Power 1', status: 'OK', installedItem: 'Slipstream' }),
        hardpoint({ id: 'hp-2', shipId: 'corsair', buildId: 'build-2', slotLabel: 'Power A', status: 'Missing', installedItem: '—' }),
      ],
    })
    const effects = makeEffects()
    const result = executeInstallation(
      { operation: 'TRANSFER', source: { shipId: 'ghost', slotLabel: 'Power 1' }, destination: { shipId: 'corsair', slotLabel: 'Power A' }, compatibilityMode: 'exact-slot-match' },
      state,
      effects
    )
    expect(result.ok).toBe(true)
    expect(effects.applyShipMutation).toHaveBeenCalledWith('ghost', 'Power 1', '—')
    expect(effects.applyShipMutation).toHaveBeenCalledWith('corsair', 'Power A', 'Slipstream', undefined)
  })

  it("12. a recipient slot of a different type/size is rejected — exact-slot-match never falls back to the catalog rule", () => {
    const state = baseState({
      ships: [ship({ id: 'ghost' }), ship({ id: 'corsair', activeBuildId: 'build-2' })],
      hardpoints: [
        hardpoint({ slotLabel: 'Power 1', status: 'OK', installedItem: 'Slipstream' }),
        hardpoint({ id: 'hp-2', shipId: 'corsair', buildId: 'build-2', slotLabel: 'Shield A', type: 'Shield', size: 'S1', status: 'Missing', installedItem: '—' }),
      ],
    })
    const effects = makeEffects()
    const result = executeInstallation(
      { operation: 'TRANSFER', source: { shipId: 'ghost', slotLabel: 'Power 1' }, destination: { shipId: 'corsair', slotLabel: 'Shield A' }, compatibilityMode: 'exact-slot-match' },
      state,
      effects
    )
    expect(result.ok).toBe(false)
    expect(effects.applyShipMutation).not.toHaveBeenCalled()
  })

  it('13. no source slotLabel fails cleanly with source-invalid, never throws', () => {
    const state = baseState()
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'TRANSFER', source: { shipId: 'ghost' }, destination: { shipId: 'ghost', slotLabel: 'Power 1' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('source-invalid')
  })

  it('14. an empty donor slot fails with source-invalid', () => {
    const state = baseState({ hardpoints: [hardpoint({ slotLabel: 'Power 1', installedItem: '—' })] })
    const effects = makeEffects()
    const result = executeInstallation({ operation: 'TRANSFER', source: { shipId: 'ghost', slotLabel: 'Power 1' }, destination: { shipId: 'ghost', slotLabel: 'Power 2' } }, state, effects)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('source-invalid')
  })
})
