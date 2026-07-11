import { describe, it, expect } from 'vitest'
import { computeHardpointStatus, UNKNOWN_FACTORY_PLACEHOLDER } from '../hardpointStatus'
import { calculateBuildProgress } from '../buildProgress'
import { hardpoints } from '../../data/seed'
import type { Hardpoint } from '../../types'

describe('Unresolved factory data (Golden Scenario H)', () => {
  it('18. Unknown Factory Item cannot produce OK via placeholder equality, even when installed/target match it too', () => {
    const status = computeHardpointStatus(UNKNOWN_FACTORY_PLACEHOLDER, UNKNOWN_FACTORY_PLACEHOLDER, UNKNOWN_FACTORY_PLACEHOLDER)
    expect(status).not.toBe('OK')
    expect(status).toBe('Unresolved')
  })

  it('19. Unresolved hardpoints are excluded from the exact progress match (never required, never matched)', () => {
    const rows: Hardpoint[] = [
      { id: 'a', shipId: 's', buildId: 'b', slotLabel: 'Real Slot', type: 'Weapon', size: 'S1', factoryItem: 'Mass Driver', installedItem: 'Mass Driver', targetItem: 'Mass Driver', status: 'OK' },
      { id: 'b', shipId: 's', buildId: 'b', slotLabel: 'Unresolved Slot', type: 'Weapon', size: 'S1', factoryItem: UNKNOWN_FACTORY_PLACEHOLDER, installedItem: UNKNOWN_FACTORY_PLACEHOLDER, targetItem: UNKNOWN_FACTORY_PLACEHOLDER, status: 'Unresolved' },
    ]
    const result = calculateBuildProgress(rows)
    expect(result.requiredAssignments).toBe(1) // only the real slot counts
    expect(result.matchedAssignments).toBe(1)
    expect(result.isComplete).toBe(true) // the unresolved slot never blocks completion...
    expect(result.unresolvedAssignments).toEqual(['Unresolved Slot']) // ...but it is not silently dropped either
  })

  it('M80 has at least one real Unresolved hardpoint in the actual seed data (not hand-patched away)', () => {
    const m80Rows = hardpoints.filter((h) => h.shipId === 'm80')
    expect(m80Rows.some((h) => h.status === 'Unresolved')).toBe(true)
  })

  it('the fix is generalized — any ship with an Unknown Factory Item placeholder gets the same Unresolved treatment', () => {
    const anyUnresolvedAcrossFleet = hardpoints.filter((h) => h.factoryItem === UNKNOWN_FACTORY_PLACEHOLDER)
    expect(anyUnresolvedAcrossFleet.length).toBeGreaterThan(0)
    expect(anyUnresolvedAcrossFleet.every((h) => h.status === 'Unresolved')).toBe(true)
  })
})
