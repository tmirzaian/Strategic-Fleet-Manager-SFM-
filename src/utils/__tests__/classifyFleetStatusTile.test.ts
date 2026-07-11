import { describe, it, expect } from 'vitest'
import { classifyFleetStatusTile } from '../fleetBuildState'
import type { FleetBuildState } from '../../types'

describe('classifyFleetStatusTile (Alpha 2.5A, Part 1)', () => {
  it('5. FACTORY_ONLY classifies as FACTORY_LOADOUT', () => {
    expect(classifyFleetStatusTile('FACTORY_ONLY')).toBe('FACTORY_LOADOUT')
  })

  it('6. MISSION_READY classifies as MISSION_READY', () => {
    expect(classifyFleetStatusTile('MISSION_READY')).toBe('MISSION_READY')
  })

  it('7. BUILD_IN_PROGRESS and BUILD_ASSIGNED both classify as LOADOUTS_IN_PROGRESS', () => {
    expect(classifyFleetStatusTile('BUILD_IN_PROGRESS')).toBe('LOADOUTS_IN_PROGRESS')
    expect(classifyFleetStatusTile('BUILD_ASSIGNED')).toBe('LOADOUTS_IN_PROGRESS')
  })

  it('8. INVALID_BUILD classifies as LOADOUTS_IN_PROGRESS, never as MISSION_READY', () => {
    const result = classifyFleetStatusTile('INVALID_BUILD')
    expect(result).toBe('LOADOUTS_IN_PROGRESS')
    expect(result).not.toBe('MISSION_READY')
  })

  it('every FleetBuildState maps to exactly one of the three tiles (exhaustive partition)', () => {
    const allStates: FleetBuildState[] = ['FACTORY_ONLY', 'MISSION_READY', 'BUILD_ASSIGNED', 'BUILD_IN_PROGRESS', 'INVALID_BUILD']
    for (const state of allStates) {
      const tile = classifyFleetStatusTile(state)
      expect(['MISSION_READY', 'LOADOUTS_IN_PROGRESS', 'FACTORY_LOADOUT']).toContain(tile)
    }
  })
})
