import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { shipDefinitions } from '../../data/shipDefinitions'

const initialState = useFleetStore.getState()

/**
 * EWO-052 (Inventory Transaction Integrity Initiative) — end-to-end,
 * real-store regression coverage for "One Component -> One Owner -> One
 * Location -> Always." These exercise the full real stack
 * (useFleetStore -> executeInstallation -> the injected store effects),
 * not just the isolated engine unit tests in
 * src/engine/installation/__tests__/, proving the invariant holds
 * through the actual Commander-facing actions (installComponent,
 * removeComponent, moveComponentBetweenShips), not merely the engine's
 * own internal contract.
 *
 * Root cause: a hardpoint whose status is 'Missing' or 'Upgrade
 * Available' can still have a real, different component physically
 * installed (e.g. the ship's own factory part, never explicitly removed
 * before the Commander picked a new Target). Before this mission,
 * installing over such a slot silently overwrote it — the displaced
 * component vanished from every tracked ownership state at once (not on
 * a ship, not in Hangar Inventory) — confirmed by direct reproduction
 * during investigation.
 */
beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

function addGladiusWithRetargetedShield(): { shipId: string; buildId: string; slotLabel: string; factoryItem: string; factoryEntityClass?: string } | null {
  const gladius = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Gladius')
  if (!gladius) return null
  const added = useFleetStore.getState().addFleetAsset(gladius.id, 'OWNED')
  if (!added.success || !added.assetId) return null
  const ship = useFleetStore.getState().ships.find((s) => s.id === added.assetId)!
  const factoryHardpoints = useFleetStore.getState().hardpoints.filter((h) => h.buildId === ship.activeBuildId)
  const shieldRow = factoryHardpoints.find((h) => h.type === 'Shield' && !h.isStructural)
  if (!shieldRow) return null

  // A CUSTOM build starting from FACTORY with a re-targeted Shield slot:
  // installedItem is still the real factory part (never removed), while
  // targetItem points at something else — the exact real-world "Commander
  // picked a new Target, hasn't installed it yet" state (status Missing).
  const saveResult = useFleetStore.getState().saveMissionConfiguration({
    shipId: ship.id,
    name: 'EWO-052 Retargeted Shield Build',
    startingState: 'FACTORY',
    targetOverrides: { [shieldRow.slotLabel]: { targetItem: 'FR-66', targetEntityClass: undefined } },
    setActive: false,
  })
  if (!saveResult.success || !saveResult.buildId) return null
  return { shipId: ship.id, buildId: saveResult.buildId, slotLabel: shieldRow.slotLabel, factoryItem: shieldRow.factoryItem, factoryEntityClass: shieldRow.factoryEntityClass }
}

describe('EWO-052: installComponent never destroys a real, still-installed occupant (the swap gap)', () => {
  it('installing a new Target into a slot whose real factory item is still installed returns that item to Hangar Inventory, not into the void', () => {
    const probe = addGladiusWithRetargetedShield()
    if (!probe) return
    const beforeCount = useFleetStore.getState().hangarItems.length

    const result = useFleetStore.getState().installComponent(probe.shipId, 'FR-66', probe.slotLabel, probe.buildId)
    expect(result.matched).toBe(true)

    const afterCount = useFleetStore.getState().hangarItems.length
    expect(afterCount).toBe(beforeCount + 1)

    const displaced = useFleetStore.getState().hangarItems.find((h) => h.entityClass === probe.factoryEntityClass || h.name === probe.factoryItem)
    expect(displaced).toBeDefined()
    expect(displaced?.qty).toBeGreaterThan(0)

    const row = useFleetStore.getState().hardpoints.find((h) => h.buildId === probe.buildId && h.slotLabel === probe.slotLabel)!
    expect(row.installedItem).toBe('FR-66')
    expect(row.status).toBe('OK')
  })

  it('removeComponent still works exactly as before on a slot that was just swap-installed — the two operations remain independently correct', () => {
    const probe = addGladiusWithRetargetedShield()
    if (!probe) return
    useFleetStore.getState().installComponent(probe.shipId, 'FR-66', probe.slotLabel, probe.buildId)
    const afterInstall = useFleetStore.getState().hangarItems.length

    const removeResult = useFleetStore.getState().removeComponent(probe.shipId, probe.slotLabel, true, probe.buildId)
    expect(removeResult.matched).toBe(true)
    expect(removeResult.itemName).toBe('FR-66')

    // Both the factory item (returned by the earlier swap) and FR-66
    // (returned by this remove) are now tracked — nothing lost, nothing
    // duplicated across the two independent operations.
    const afterRemove = useFleetStore.getState().hangarItems.length
    expect(afterRemove).toBe(afterInstall + 1)
    const fr66 = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')
    expect(fr66?.qty).toBeGreaterThan(0)
    const row = useFleetStore.getState().hardpoints.find((h) => h.buildId === probe.buildId && h.slotLabel === probe.slotLabel)!
    expect(row.installedItem).toBe('—')
  })
})
