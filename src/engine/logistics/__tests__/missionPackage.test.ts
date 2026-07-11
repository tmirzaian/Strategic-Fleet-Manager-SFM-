import { describe, it, expect } from 'vitest'
import { calculateMissionPackage } from '../missionPackage'
import type { Hardpoint, HangarItem } from '../../../types'
import type { MissionReservation } from '../../../types'

function hp(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: `h-${Math.random()}`, shipId: 'ghost', buildId: 'escort', slotLabel: 'Slot', type: 'Shield', size: 'S1',
    factoryItem: 'AllStop', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing', ...overrides,
  }
}
function reservation(overrides: Partial<MissionReservation> = {}): MissionReservation {
  return {
    id: 'r1', missionConfigurationId: 'escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1',
    componentName: 'FR-66', quantity: 1, status: 'ACTIVE', createdAt: 'now', updatedAt: 'now', ...overrides,
  }
}

describe('calculateMissionPackage (Part 6-8)', () => {
  it('14. derives from target assignments, Installed, and reservations — not a disconnected list', () => {
    const rows = [hp({ slotLabel: 'Shield 1', installedItem: 'FR-66', targetItem: 'FR-66', status: 'OK' })]
    const result = calculateMissionPackage('escort', rows, [], [], [])
    expect(result.totalRequiredAssignments).toBe(1)
    expect(result.installedMatches).toBe(1)
  })

  it('15. Installed Match and Package Readiness remain independent numbers', () => {
    const rows = [
      hp({ slotLabel: 'Shield 1', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' }),
      hp({ slotLabel: 'Shield 2', installedItem: 'AllStop', targetItem: 'Mirage', status: 'Missing' }),
    ]
    const reservations = [reservation({ targetSlotLabel: 'Shield 1', componentName: 'FR-66' })]
    const result = calculateMissionPackage('escort', rows, [], reservations, [])
    expect(result.installedPercentage).toBe(0)
    expect(result.packagePercentage).toBe(50)
    expect(result.installedPercentage).not.toBe(result.packagePercentage)
  })

  it('16. Package Staged requires every target installed OR reserved', () => {
    const rows = [
      hp({ slotLabel: 'Shield 1', installedItem: 'FR-66', targetItem: 'FR-66', status: 'OK' }),
      hp({ slotLabel: 'Shield 2', installedItem: 'AllStop', targetItem: 'Mirage', status: 'Missing' }),
    ]
    const reservations = [reservation({ targetSlotLabel: 'Shield 2', componentName: 'Mirage' })]
    const result = calculateMissionPackage('escort', rows, [], reservations, [])
    expect(result.isPackageStaged).toBe(true)
    expect(result.packageState).toBe('PACKAGE_STAGED')
    expect(result.isMissionReady).toBe(false)
  })

  it('17. Mission Ready requires every target physically installed', () => {
    const rows = [
      hp({ slotLabel: 'Shield 1', installedItem: 'FR-66', targetItem: 'FR-66', status: 'OK' }),
      hp({ slotLabel: 'Shield 2', installedItem: 'Mirage', targetItem: 'Mirage', status: 'OK' }),
    ]
    const result = calculateMissionPackage('escort', rows, [], [], [])
    expect(result.isMissionReady).toBe(true)
    expect(result.packageState).toBe('MISSION_READY')
  })

  it('18. an available-but-unreserved item does not count toward Package Staged', () => {
    const rows = [hp({ slotLabel: 'Shield 1', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' })]
    const hangarItems: HangarItem[] = [{ id: 'h1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const result = calculateMissionPackage('escort', rows, [], [], hangarItems)
    expect(result.availableUnreservedMatches).toBe(1)
    expect(result.isPackageStaged).toBe(false)
    expect(result.packagePercentage).toBe(0)
  })

  it('a genuinely missing item (no owned quantity at all) is reported as missing, not available', () => {
    const rows = [hp({ slotLabel: 'Shield 1', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' })]
    const result = calculateMissionPackage('escort', rows, [], [], [])
    expect(result.missingAssignments).toEqual(['FR-66'])
  })

  it('an Invalid Target is excluded from both percentages and flips the state to INVALID', () => {
    const rows = [hp({ slotLabel: 'QD', installedItem: 'Atlas', targetItem: 'Atlas', status: 'Invalid Target' })]
    const result = calculateMissionPackage('escort', rows, [], [], [])
    expect(result.invalidAssignments).toEqual(['Atlas'])
    expect(result.packageState).toBe('INVALID')
    expect(result.isMissionReady).toBe(false)
    expect(result.isPackageStaged).toBe(false)
  })

  it('a Factory-only build short-circuits to FACTORY_LOADOUT and never gets a Mission Package', () => {
    const result = calculateMissionPackage('factory-build', [], [], [], [], true)
    expect(result.packageState).toBe('FACTORY_LOADOUT')
    expect(result.isMissionReady).toBe(false)
    expect(result.isPackageStaged).toBe(false)
  })

  it('zero required assignments is treated as 100%/ready, matching the shared Build Progress convention', () => {
    const rows = [hp({ targetItem: '—', status: 'OK' })]
    const result = calculateMissionPackage('escort', rows, [], [], [])
    expect(result.totalRequiredAssignments).toBe(0)
    expect(result.installedPercentage).toBe(100)
    expect(result.packagePercentage).toBe(100)
  })

  it('PLANNING state when nothing installed or reserved yet', () => {
    const rows = [hp({ slotLabel: 'Shield 1', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' })]
    const result = calculateMissionPackage('escort', rows, [], [], [])
    expect(result.packageState).toBe('PLANNING')
  })

  it('COLLECTING_PARTS when some but not all targets are installed or reserved', () => {
    const rows = [
      hp({ slotLabel: 'Shield 1', installedItem: 'FR-66', targetItem: 'FR-66', status: 'OK' }),
      hp({ slotLabel: 'Shield 2', installedItem: 'AllStop', targetItem: 'Mirage', status: 'Missing' }),
    ]
    const result = calculateMissionPackage('escort', rows, [], [], [])
    expect(result.packageState).toBe('COLLECTING_PARTS')
  })
})
