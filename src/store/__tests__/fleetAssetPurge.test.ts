import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFleetStore, resolveFleetAssetId } from '../useFleetStore'
import { resolvePurgeConfirmationPhrase } from '../../utils/fleetLifecycle'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => localStorage.clear())

function addGladius(nickname?: string) {
  const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
  const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', nickname)
  return added.assetId!
}

/** EWO-097 Amendment — the exact same helper production code uses, so
 * every test call below exercises real confirmation-phrase validation
 * rather than bypassing it with an arbitrary string. */
function purgePhraseFor(shipId: string): string {
  const state = useFleetStore.getState()
  const resolvedId = resolveFleetAssetId(shipId, state.fleetAssets)
  const asset = resolvedId ? state.fleetAssets.find((a) => a.id === resolvedId) : undefined
  if (!asset) throw new Error(`No fleet asset found for ${shipId}`)
  return resolvePurgeConfirmationPhrase(asset)
}

/**
 * EWO-097 — "Retired Fleet Asset Permanent Purge." `purgeFleetAsset` is
 * the Fleet Registry lifecycle's one destructive transition, gated
 * strictly behind `lifecycleStatus === 'retired'`. See the action's own
 * doc comment (useFleetStore.ts) for the full Required Behavior contract
 * this test file verifies against.
 */
describe('EWO-097: purgeFleetAsset — eligibility', () => {
  it('1. an active vessel cannot be purged', () => {
    const id = addGladius()
    const result = useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === id)).toBe(true)
  })

  it('2. a retired vessel can be purged', () => {
    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    const result = useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))
    expect(result.success).toBe(true)
  })

  it('fails cleanly for an unknown vessel id', () => {
    const result = useFleetStore.getState().purgeFleetAsset('not-a-real-id', 'anything')
    expect(result.success).toBe(false)
  })

  it('18. a repeated purge attempt fails safely and performs zero further writes', () => {
    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    const phrase = purgePhraseFor(id)
    const first = useFleetStore.getState().purgeFleetAsset(id, phrase)
    expect(first.success).toBe(true)
    const snapshotAfterFirst = useFleetStore.getState()

    const second = useFleetStore.getState().purgeFleetAsset(id, phrase)
    expect(second.success).toBe(false)
    expect(useFleetStore.getState().fleetAssets).toEqual(snapshotAfterFirst.fleetAssets)
    expect(useFleetStore.getState().ships).toEqual(snapshotAfterFirst.ships)
  })
})

describe('EWO-097: purgeFleetAsset — hull removal and isolation', () => {
  it('3. the target fleet asset (and its materialized Ship) is removed', () => {
    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === id)).toBe(false)
    expect(useFleetStore.getState().ships.some((s) => s.id === id)).toBe(false)
  })

  it('4. another copy of the same ship model remains fully untouched', () => {
    const idA = addGladius('Keep Me')
    const idB = addGladius('Purge Me')
    useFleetStore.getState().retireFleetAsset(idB)
    useFleetStore.getState().purgeFleetAsset(idB, purgePhraseFor(idB))

    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === idA)).toBe(true)
    expect(useFleetStore.getState().ships.some((s) => s.id === idA)).toBe(true)
    expect(useFleetStore.getState().builds.some((b) => b.shipId === idA)).toBe(true)
  })

  it('5. a future/new fleet asset of the same model is treated as an entirely independent hull, never reviving the purged record', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const idA = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'First Hull').assetId!
    useFleetStore.getState().retireFleetAsset(idA)
    useFleetStore.getState().purgeFleetAsset(idA, purgePhraseFor(idA))

    const idB = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Second Hull').assetId!
    expect(idB).not.toBe(idA)
    const newAsset = useFleetStore.getState().fleetAssets.find((a) => a.id === idB)!
    expect(newAsset.lifecycleStatus).toBe('active')
    expect(newAsset.customImageRef).toBeUndefined()
    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === idA)).toBe(false)
  })

  it('12. unrelated ships and builds remain unchanged (deep equality)', () => {
    const idA = addGladius('Untouched')
    const idB = addGladius('Purged')
    const buildsForABefore = useFleetStore.getState().builds.filter((b) => b.shipId === idA)
    const shipABefore = useFleetStore.getState().ships.find((s) => s.id === idA)

    useFleetStore.getState().retireFleetAsset(idB)
    useFleetStore.getState().purgeFleetAsset(idB, purgePhraseFor(idB))

    expect(useFleetStore.getState().builds.filter((b) => b.shipId === idA)).toEqual(buildsForABefore)
    expect(useFleetStore.getState().ships.find((s) => s.id === idA)).toEqual(shipABefore)
  })
})

describe('EWO-097: purgeFleetAsset — ship-owned planning data', () => {
  it('6/7. ship-owned custom builds are removed, and the active-build mapping is removed along with the hull', () => {
    const id = addGladius()
    useFleetStore.getState().addBuild(id)
    const buildsBefore = useFleetStore.getState().builds.filter((b) => b.shipId === id)
    expect(buildsBefore.length).toBeGreaterThan(1) // Factory + the new custom build

    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    expect(useFleetStore.getState().builds.some((b) => b.shipId === id)).toBe(false)
    // The ship row itself (which carried activeBuildId) is gone too.
    expect(useFleetStore.getState().ships.some((s) => s.id === id)).toBe(false)
  })

  it('13. custom image reference and Fleet Profile metadata for the purged hull are removed', () => {
    const id = addGladius()
    useFleetStore.getState().updateFleetAssetCustomImage(id, `ships/${id}.png`)
    useFleetStore.getState().updateFleetProfile(id, { primaryRole: 'Escort', secondaryRole: 'Interdiction' })
    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === id)).toBe(false)
    expect(useFleetStore.getState().ships.some((s) => s.id === id)).toBe(false)
  })

  it('14. no orphaned fleetAssetId/shipId/buildId references remain anywhere in live operational state', () => {
    const id = addGladius()
    const build = useFleetStore.getState().builds.find((b) => b.shipId === id)!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === build.id)!
    useFleetStore.getState().addHangarItem({ name: hp.targetItem, type: hp.type, size: hp.size, qty: 2, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: build.id, fleetAssetId: id, targetSlotLabel: hp.slotLabel, componentName: hp.targetItem })
    expect(reserve.success).toBe(true)

    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    const s = useFleetStore.getState()
    expect(s.reservations.some((r) => r.fleetAssetId === id)).toBe(false)
    expect(s.reservations.some((r) => r.missionConfigurationId === build.id)).toBe(false)
    expect(s.quarantinedAssignments.some((q) => q.shipId === id)).toBe(false)
    expect(s.installedLoadouts.some((e) => e.shipId === id)).toBe(false)
    expect(s.hardpoints.some((h) => h.shipId === id)).toBe(false)
    expect(s.builds.some((b) => b.shipId === id)).toBe(false)
  })
})

describe('EWO-097: purgeFleetAsset — reservations', () => {
  it('8. ship-specific reservations (direct or via a purged build) are removed', () => {
    const id = addGladius()
    const build = useFleetStore.getState().builds.find((b) => b.shipId === id)!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === build.id)!
    useFleetStore.getState().addHangarItem({ name: hp.targetItem, type: hp.type, size: hp.size, qty: 2, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: build.id, fleetAssetId: id, targetSlotLabel: hp.slotLabel, componentName: hp.targetItem })
    expect(reserve.success).toBe(true)

    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    expect(useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)).toBeUndefined()
  })
})

describe('EWO-097: purgeFleetAsset — Installed Component Policy', () => {
  it("9. every genuinely installed owned component returns to Hangar Inventory exactly once, via the canonical installation engine's merge rules", () => {
    const id = addGladius()
    // A freshly-added ship's Factory Loadout is already physically
    // installed (installedItem === factoryItem on every slot) — exactly
    // the real "components physically installed on the purged hull"
    // Required Behavior 6 describes, not a special fixture.
    const installedSlots = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === id && e.installedItem && e.installedItem !== '—')
    expect(installedSlots.length).toBeGreaterThan(0)
    const hangarCountBefore = useFleetStore.getState().hangarItems.reduce((sum, h) => sum + h.qty, 0)

    useFleetStore.getState().retireFleetAsset(id)
    const result = useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    expect(result.returnedComponentCount).toBe(installedSlots.length)
    const hangarCountAfter = useFleetStore.getState().hangarItems.reduce((sum, h) => sum + h.qty, 0)
    expect(hangarCountAfter).toBe(hangarCountBefore + installedSlots.length)

    // Exactly once: no duplicate hangar record was minted per returned
    // unit when two slots shared the same component (addHangarItem's own
    // merge-by-identity rule, exercised here rather than reimplemented).
    for (const slot of installedSlots) {
      const matchingRecords = useFleetStore.getState().hangarItems.filter((h) => h.name === slot.installedItem)
      expect(matchingRecords.length).toBeLessThanOrEqual(1)
    }
  })

  it('10. a slot with nothing physically installed (Missing) is never fabricated into inventory', () => {
    const id = addGladius()
    const ship = useFleetStore.getState().ships.find((s) => s.id === id)!
    const clearedSlot = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId)!.slotLabel
    // Clears installedItem without returning to Hangar — a genuine
    // "Missing" slot, target/factory data untouched.
    useFleetStore.getState().removeComponent(id, clearedSlot, false)
    const clearedItemName = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === clearedSlot)!.targetItem

    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    // The component that was cleared (never returned) must not appear as
    // a freshly-fabricated Hangar record from the purge itself.
    const fabricated = useFleetStore.getState().hangarItems.find((h) => h.name === clearedItemName)
    expect(fabricated).toBeUndefined()
  })

  it('11. unrelated pre-existing inventory remains exactly unchanged', () => {
    useFleetStore.getState().addHangarItem({ name: 'Untouched Cooler', type: 'Cooler', size: 'S2', qty: 3, neededBy: 'None', disposition: 'Store' })
    const before = useFleetStore.getState().hangarItems.find((h) => h.name === 'Untouched Cooler')

    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    expect(useFleetStore.getState().hangarItems.find((h) => h.name === 'Untouched Cooler')).toEqual(before)
  })
})

describe('EWO-097: purgeFleetAsset — recovery snapshot', () => {
  it('15. a pre-purge recovery snapshot is captured before any mutation, via the canonical EWO-093 export mechanism', () => {
    const id = addGladius('Snapshot Target')
    useFleetStore.getState().retireFleetAsset(id)
    const result = useFleetStore.getState().purgeFleetAsset(id, purgePhraseFor(id))

    expect(result.recoverySnapshot).toBeDefined()
    expect(result.recoverySnapshot!.payload.fleetAssets.some((a) => a.id === id)).toBe(true)
    // Confirms it reflects the PRE-purge state, not the post-purge one.
    expect(useFleetStore.getState().fleetAssets.some((a) => a.id === id)).toBe(false)
  })
})

describe('EWO-097: purgeFleetAsset — seed-migrated assets survive a genuine reload', () => {
  it('20 (persistence): a purged seed-migrated vessel does not return after a genuine store reload', async () => {
    useFleetStore.getState().retireFleetAsset('ghost')
    const result = useFleetStore.getState().purgeFleetAsset('ghost', purgePhraseFor('ghost'))
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().ships.some((s) => s.id === 'ghost')).toBe(false)

    vi.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')

    expect(reloadedStore.getState().ships.some((s) => s.id === 'ghost')).toBe(false)
    expect(reloadedStore.getState().fleetAssets.some((a) => a.id === 'ghost-asset-seed')).toBe(false)
    expect(reloadedStore.getState().builds.some((b) => b.shipId === 'ghost')).toBe(false)
    expect(reloadedStore.getState().hardpoints.some((h) => h.shipId === 'ghost')).toBe(false)
    // A sibling seed ship is completely unaffected by ghost's purge.
    expect(reloadedStore.getState().ships.some((s) => s.id === 'corsair')).toBe(true)
  })
})
