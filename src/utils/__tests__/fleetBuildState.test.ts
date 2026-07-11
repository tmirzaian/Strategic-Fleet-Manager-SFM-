import { describe, it, expect } from 'vitest'
import { deriveFleetBuildState } from '../fleetBuildState'
import { calculateBuildProgress } from '../buildProgress'
import type { Build, Hardpoint } from '../../types'

function hp(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: `hp-${Math.random()}`,
    shipId: 'ship',
    buildId: 'build',
    slotLabel: 'Slot',
    type: 'Weapon',
    size: 'S1',
    factoryItem: 'Factory Item',
    installedItem: 'Factory Item',
    targetItem: 'Factory Item',
    status: 'OK',
    ...overrides,
  }
}

function build(overrides: Partial<Build> = {}): Build {
  return { id: 'b', shipId: 's', name: 'Build', role: 'Role', readiness: 100, isActive: true, missing: [], kind: 'CUSTOM', ...overrides }
}

describe('deriveFleetBuildState', () => {
  it('9/Golden C: a Factory-only asset (Factory=Installed=Target, kind FACTORY) derives FACTORY_ONLY, not MISSION_READY', () => {
    const factoryBuild = build({ kind: 'FACTORY' })
    const progress = calculateBuildProgress([hp({ status: 'OK' }), hp({ status: 'OK' })])
    expect(progress.isComplete).toBe(true)
    const state = deriveFleetBuildState(factoryBuild, progress)
    expect(state).toBe('FACTORY_ONLY')
  })

  it('10/11: FACTORY_ONLY is distinguishable at the state level from MISSION_READY, even at identical 100% progress', () => {
    const progress = calculateBuildProgress([hp({ status: 'OK' })])
    const factoryState = deriveFleetBuildState(build({ kind: 'FACTORY' }), progress)
    const customState = deriveFleetBuildState(build({ kind: 'CUSTOM' }), progress)
    expect(factoryState).toBe('FACTORY_ONLY')
    expect(customState).toBe('MISSION_READY')
    expect(factoryState).not.toBe(customState)
  })

  it('13/Golden D: a real custom Build at exactly 100% derives MISSION_READY', () => {
    const customBuild = build({ kind: 'CUSTOM' })
    const progress = calculateBuildProgress([hp({ status: 'OK' }), hp({ status: 'OK' }), hp({ status: 'OK' })])
    expect(deriveFleetBuildState(customBuild, progress)).toBe('MISSION_READY')
  })

  it('14: a custom Build at 99% does not derive MISSION_READY', () => {
    const customBuild = build({ kind: 'CUSTOM' })
    const rows = Array.from({ length: 100 }, (_, i) => hp({ id: `h${i}`, status: i < 99 ? 'OK' : 'Missing' }))
    const progress = calculateBuildProgress(rows)
    expect(progress.percentage).toBe(99)
    expect(deriveFleetBuildState(customBuild, progress)).not.toBe('MISSION_READY')
    expect(deriveFleetBuildState(customBuild, progress)).toBe('BUILD_IN_PROGRESS')
  })

  it('17: an invalid target derives INVALID_BUILD regardless of build kind', () => {
    const progress = calculateBuildProgress([hp({ status: 'Invalid Target' })])
    expect(deriveFleetBuildState(build({ kind: 'CUSTOM' }), progress)).toBe('INVALID_BUILD')
    expect(deriveFleetBuildState(build({ kind: 'FACTORY' }), progress)).toBe('INVALID_BUILD')
  })

  it('a missing Build reference derives INVALID_BUILD rather than crashing', () => {
    const progress = calculateBuildProgress([hp({ status: 'OK' })])
    expect(deriveFleetBuildState(undefined, progress)).toBe('INVALID_BUILD')
  })

  it('a custom Build with zero matched required assignments derives BUILD_ASSIGNED', () => {
    const customBuild = build({ kind: 'CUSTOM' })
    const progress = calculateBuildProgress([hp({ installedItem: '—', targetItem: 'Something', status: 'Missing' })])
    expect(deriveFleetBuildState(customBuild, progress)).toBe('BUILD_ASSIGNED')
  })

  it('a custom Build with partial progress derives BUILD_IN_PROGRESS', () => {
    const customBuild = build({ kind: 'CUSTOM' })
    const progress = calculateBuildProgress([hp({ status: 'OK' }), hp({ installedItem: '—', targetItem: 'X', status: 'Missing' })])
    expect(deriveFleetBuildState(customBuild, progress)).toBe('BUILD_IN_PROGRESS')
  })

  it('a Build with no `kind` set (legacy data) is treated as CUSTOM by default, not silently FACTORY_ONLY', () => {
    const legacyBuild = build({ kind: undefined })
    const progress = calculateBuildProgress([hp({ status: 'OK' })])
    expect(deriveFleetBuildState(legacyBuild, progress)).toBe('MISSION_READY')
  })
})
