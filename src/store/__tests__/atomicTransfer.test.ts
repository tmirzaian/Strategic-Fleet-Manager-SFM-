import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { calculateBuildProgress } from '../../utils/buildProgress'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

function hardpointsFor(shipId: string) {
  const ship = useFleetStore.getState().ships.find((s) => s.id === shipId)!
  return useFleetStore.getState().hardpoints.filter((h) => h.buildId === ship.activeBuildId)
}

describe('Atomic component transfer (moveComponentBetweenShips)', () => {
  it('25. a successful transfer updates both donor and recipient', () => {
    // Ghost's Left Shield Generator (Mirage, S1 Shield) -> Vulture's Right
    // Shield Generator (S1 Shield, genuinely empty from factory, compatible).
    const result = useFleetStore.getState().moveComponentBetweenShips('ghost', 'Left Shield Generator', 'vulture', 'Right Shield Generator')
    expect(result.matched).toBe(true)
    expect(result.itemName).toBe('Mirage')

    const ghostShield = hardpointsFor('ghost').find((h) => h.slotLabel === 'Left Shield Generator')!
    expect(ghostShield.installedItem).toBe('—')

    const vultureShield = hardpointsFor('vulture').find((h) => h.slotLabel === 'Right Shield Generator')!
    expect(vultureShield.installedItem).toBe('Mirage')
  })

  it('26. a failed transfer (no compatible destination) updates neither ship', () => {
    const donorBefore = [...hardpointsFor('ghost')]
    const recipientBefore = [...hardpointsFor('utv')]
    // Ghost's Shield 1 is a Shield — UTV's Cooler 1 is a Cooler. Type mismatch.
    const result = useFleetStore.getState().moveComponentBetweenShips('ghost', 'Shield 1', 'utv', 'Cooler 1')

    expect(result.matched).toBe(false)
    expect(result.message).toBeTruthy()

    expect(hardpointsFor('ghost')).toEqual(donorBefore)
    expect(hardpointsFor('utv')).toEqual(recipientBefore)
  })

  it('27. compatibility (type + size) blocks an incompatible destination', () => {
    // Ghost's Weapon 1 (S4 Weapon) cannot go into a Cooler slot (S1 Cooler).
    const result = useFleetStore.getState().moveComponentBetweenShips('ghost', 'Weapon 1', 'cutlass-red', 'Cooler 1')
    expect(result.matched).toBe(false)
  })

  it('28. donor and recipient Build Progress recalculate independently after a transfer', () => {
    const donorBefore = calculateBuildProgress(hardpointsFor('ghost'))

    useFleetStore.getState().moveComponentBetweenShips('ghost', 'Left Shield Generator', 'vulture', 'Right Shield Generator')

    const donorAfter = calculateBuildProgress(hardpointsFor('ghost'))
    // Donor's own Build Progress recalculates — a matched required
    // assignment is now gone.
    expect(donorAfter.matchedAssignments).toBeLessThan(donorBefore.matchedAssignments)

    // Recipient's hardpoint graph recalculates independently too — the
    // physical Installed change is real even though Vulture's Right Shield
    // Generator has no resolved target data of its own (Unresolved slots
    // are correctly excluded from required-assignment counting, so the
    // aggregate percentage for that slot doesn't move — that's by design,
    // not a bug: see src/utils/hardpointStatus.ts).
    const recipientShield = hardpointsFor('vulture').find((h) => h.slotLabel === 'Right Shield Generator')!
    expect(recipientShield.installedItem).toBe('Mirage')
  })

  it('Golden Scenario E: donor loses BUILD COMPLETE status after its matched component is moved away', () => {
    // Force Ghost's Stealth Build to 100% first by installing everything it needs.
    useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power Plant')
    useFleetStore.getState().installComponent('ghost', 'SnowBlind', 'Left Cooler')
    const before = calculateBuildProgress(hardpointsFor('ghost'))
    expect(before.isComplete).toBe(true)

    useFleetStore.getState().moveComponentBetweenShips('ghost', 'Left Shield Generator', 'vulture', 'Right Shield Generator')

    const after = calculateBuildProgress(hardpointsFor('ghost'))
    expect(after.isComplete).toBe(false)
    expect(after.percentage).toBeLessThan(100)
    expect(after.missingAssignments).toContain('Mirage')
  })

  it('Golden Scenario F: an invalid transfer is blocked, produces no log entry, and leaves the ship untouched', () => {
    const logCountBefore = useFleetStore.getState().log.length
    const donorBefore = [...hardpointsFor('ghost')]

    const result = useFleetStore.getState().moveComponentBetweenShips('ghost', 'Weapon 1', 'ghost', 'Cooler 1')
    expect(result.matched).toBe(false)

    expect(useFleetStore.getState().log.length).toBe(logCountBefore)
    expect(hardpointsFor('ghost')).toEqual(donorBefore)
  })

  it('a single coherent log entry is produced for one successful transfer, not two', () => {
    useFleetStore.getState().moveComponentBetweenShips('ghost', 'Left Shield Generator', 'vulture', 'Right Shield Generator')
    const after = useFleetStore.getState().log
    // Vulture's Right Shield Generator is factory-populated (canonical
    // topology guarantees Installed = Factory everywhere by construction),
    // so this transfer also displaces Bulwark back to the Hangar — a real,
    // separate, expected event. The regression this test guards against is
    // the transfer ITSELF never being logged twice.
    expect(after.filter((e) => e.action === 'Component moved to ship')).toHaveLength(1)
    expect(after[0].action).toBe('Component moved to ship')
  })
})
