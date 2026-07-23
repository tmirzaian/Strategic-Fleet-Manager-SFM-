import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { shipFactoryTemplates } from '../../data/shipDefinitions'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

/**
 * SW-005 Phase 1 (Commander Safety) — regression coverage for the exact
 * silent-save-failure SW-004 confirmed: Loadout Manager renders/edits from
 * a ship's canonical Factory template (shipFactoryTemplates), while
 * saveMissionConfiguration previously built its save-time reference
 * structure from the ship's own persisted rows only. On a topology-
 * diverged seed ship (every seed ship, on first load — see SW-004), an
 * override for a canonical-only slotLabel used to vanish silently, with
 * the save reporting success and nothing actually changing.
 */
describe('SW-005 Phase 1: saveMissionConfiguration never silently discards Commander intent', () => {
  it("an override for a real canonical-template slotLabel the ship's own reference rows do not yet have is self-healed, not dropped — M80, first load (the exact SW-004 scenario)", () => {
    const m80Template = shipFactoryTemplates['m80']
    // SW-006 converged every seed ship's CUSTOM build onto canonical
    // topology by construction, EXCEPT M80/Starlite — deliberately kept on
    // their original, pre-SW-006 hand-authored vocabulary ('Power 1',
    // 'Weapon 1', ...) as regression fixtures proving this exact
    // divergence scenario (SW-004) is still reachable. Pick a real
    // canonical-only slot.
    const canonicalOnlySlot = m80Template.find((t) => t.slotLabel === 'Left Power Plant')
    expect(canonicalOnlySlot).toBeDefined()

    const before = useFleetStore.getState().hardpoints.filter((h) => h.buildId === 'm80-speed')
    expect(before.some((h) => h.slotLabel === 'Left Power Plant')).toBe(false) // confirms the divergence exists going in

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'm80',
      name: 'Test Save',
      startingState: 'EXISTING',
      existingBuildId: 'm80-speed',
      targetOverrides: { 'Left Power Plant': 'Slipstream' },
      setActive: false,
      saveAsNew: true,
    })

    expect(result.success).toBe(true)
    const savedRows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const savedRow = savedRows.find((h) => h.slotLabel === 'Left Power Plant')
    expect(savedRow).toBeDefined()
    expect(savedRow!.targetItem).toBe('Slipstream')
  })

  it('an override for a slotLabel that is real nowhere (not on reference rows, not on the canonical template) fails the save explicitly rather than silently succeeding', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Test Save',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { 'Not A Real Port Anywhere': 'Slipstream' },
      setActive: false,
      saveAsNew: true,
    })

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/no longer exists/i)
  })

  it('an ordinary override for a slotLabel the reference rows already have still applies exactly as before (no regression)', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Test Save',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { 'Power Plant': 'Slipstream' },
      setActive: false,
      saveAsNew: true,
    })

    expect(result.success).toBe(true)
    const savedRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === result.buildId && h.slotLabel === 'Power Plant')
    expect(savedRow).toBeDefined()
    expect(savedRow!.targetItem).toBe('Slipstream')
  })
})
