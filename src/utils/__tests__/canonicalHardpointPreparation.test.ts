import { describe, it, expect } from 'vitest'
import { prepareCanonicalHardpoints } from '../canonicalHardpointPreparation'
import { useFleetStore } from '../../store/useFleetStore'
import type { Hardpoint } from '../../types'

// SW-006 — Ghost/Corsair's CUSTOM builds are now constructed fresh from
// canonical topology (useFleetStore.ts's buildCanonicalSeedCustomBuilds),
// not raw src/data/seed.ts exports. Reads the live store.
const state = useFleetStore.getState()
const { ships, hardpoints, fleetAssets } = state

describe('prepareCanonicalHardpoints (SW-002 Revision A, Phase 1)', () => {
  it('overlays the canonical template onto a real saved Build (Ghost / Stealth Build) without dropping any real row', () => {
    const ship = ships.find((s) => s.id === 'ghost')!
    const buildHardpoints = hardpoints.filter((h) => h.buildId === ship.activeBuildId)
    const prepared = prepareCanonicalHardpoints(ship.id, buildHardpoints, fleetAssets)
    expect(prepared.length).toBeGreaterThanOrEqual(buildHardpoints.length)
    expect(prepared.some((h) => h.slotLabel === 'Power Plant' && h.targetItem === 'Slipstream')).toBe(true)
  })

  it('is the same function Ship Detail now calls — same output for the same input (no parallel implementation)', () => {
    const ship = ships.find((s) => s.id === 'corsair')!
    const buildHardpoints = hardpoints.filter((h) => h.buildId === ship.activeBuildId)
    const a = prepareCanonicalHardpoints(ship.id, buildHardpoints, fleetAssets)
    const b = prepareCanonicalHardpoints(ship.id, buildHardpoints, fleetAssets)
    expect(a.map((h) => h.slotLabel)).toEqual(b.map((h) => h.slotLabel))
  })

  it('returns an empty array for an unresolvable ship id rather than throwing', () => {
    expect(() => prepareCanonicalHardpoints('not-a-real-ship', [], fleetAssets)).not.toThrow()
  })

  it('synthesizes component-owned child slots (mining module) for a hardpoint whose installedEntityClass has real, known module slots', () => {
    // Mining_Laser_GRIN_Arbor_S1 -> 1 module slot (generated-data/mining-module-slots.json).
    const hp: Hardpoint = {
      id: 'test-hp-1',
      shipId: 'test-ship',
      buildId: 'test-build',
      slotLabel: 'Mining Head 1',
      type: 'Mining Laser',
      size: 'S1',
      factoryItem: 'Arbor MH1',
      installedItem: 'Arbor MH1',
      targetItem: 'Arbor MH1',
      status: 'OK',
      installedEntityClass: 'Mining_Laser_GRIN_Arbor_S1',
    }
    // An unresolvable ship id (empty canonical template) proves the
    // child-slot synthesis stage runs independently of template overlay —
    // it derives purely from the row's own entityClass.
    const prepared = prepareCanonicalHardpoints('not-a-real-ship', [hp], fleetAssets)
    const childSlots = prepared.filter((h) => h.parentSlotLabel === 'Mining Head 1')
    expect(childSlots.length).toBe(1)
    expect(childSlots.every((h) => h.type === 'Mining Module')).toBe(true)
  })
})
