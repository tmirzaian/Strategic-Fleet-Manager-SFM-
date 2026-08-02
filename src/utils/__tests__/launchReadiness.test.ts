import { describe, it, expect } from 'vitest'
import { evaluateLaunchReadiness, type LaunchReadinessParams } from '../launchReadiness'
import type { Ship, Build, Hardpoint, HangarItem, InstalledLoadoutEntry, MissionReservation } from '../../types'

function ship(overrides: Partial<Ship> = {}): Ship {
  return { id: 's', name: 'Corsair', manufacturer: 'RSI', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active', ...overrides }
}

function build(overrides: Partial<Build> = {}): Build {
  return { id: 'b', shipId: 's', name: 'Stealth Build', role: '', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM', ...overrides }
}

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel' | 'status'>): Hardpoint {
  return {
    shipId: 's',
    buildId: 'b',
    type: 'Shield',
    size: 'S1',
    factoryItem: overrides.targetItem ?? '—',
    installedItem: overrides.installedItem ?? '—',
    targetItem: overrides.targetItem ?? '—',
    ...overrides,
  }
}

function baseParams(overrides: Partial<LaunchReadinessParams> = {}): LaunchReadinessParams {
  return {
    shipId: 's',
    ships: [ship()],
    fleetAssets: [],
    builds: [build()],
    hardpoints: [],
    hangarItems: [],
    installedLoadouts: [],
    reservations: [],
    ...overrides,
  }
}

/**
 * EWO-103 — Launch Readiness Authority. Every fixture below composes only
 * real existing fields (HardpointStatus, AcquisitionHint tones) — this
 * resolver introduces no new readiness formula, so these tests exercise
 * classification/composition, not a parallel calculation.
 */
describe('evaluateLaunchReadiness', () => {
  it('Mission Ready: every required assignment OK, no advisories — zero blockers, zero warnings, HIGH confidence', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints }))
    expect(result.status).toBe('MISSION_READY')
    expect(result.blockers).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.confidence).toBe('HIGH')
    expect(result.readinessPercent).toBe(100)
  })

  it('Advisory only: an Upgrade Available row with no other deficiencies — READY_WITH_ADVISORIES, zero blockers', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Upgrade Available', installedItem: 'OldMirage', targetItem: 'Mirage' })]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints }))
    expect(result.status).toBe('READY_WITH_ADVISORIES')
    expect(result.blockers).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].reason).toBe('UPGRADE_AVAILABLE')
    expect(result.warnings[0].deepLink).toEqual({ path: '/ship-workspace/s', shipId: 's', suggestedCommanderIntent: 'CHANGE_INSTALLED', hardpointId: 'hp-1' })
  })

  it('Blocked: a Missing required component with zero owned stock anywhere and no reservation — LAUNCH_BLOCKED, blocker not immediately resolvable', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' })]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints }))
    expect(result.status).toBe('LAUNCH_BLOCKED')
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].reason).toBe('MISSING_REQUIRED_COMPONENT')
    expect(result.blockers[0].immediatelyResolvable).toBe(false)
    expect(result.blockers[0].acquisitionHint?.label).toBe('Purchase Required')
    expect(result.recommendations[0].message).toContain('require procurement')
  })

  it('Maintenance Required: a Missing required component with genuinely free Hangar stock — resolvable now, not procurement-blocked', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' })]
    const hangarItems: HangarItem[] = [{ id: 'h1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints, hangarItems }))
    expect(result.status).toBe('MAINTENANCE_REQUIRED')
    expect(result.blockers[0].immediatelyResolvable).toBe(true)
    expect(result.blockers[0].acquisitionHint?.label).toBe('Available in Inventory')
  })

  it('Maintenance Required: an Invalid Target is always immediately resolvable (a retarget, never inventory-dependent) — never escalates to Launch Blocked on its own', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Right Shield', status: 'Invalid Target', targetItem: 'BadItem', invalidMessage: 'Incompatible' })]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints }))
    expect(result.status).toBe('MAINTENANCE_REQUIRED')
    expect(result.blockers[0].reason).toBe('INCOMPATIBLE_INSTALLATION')
    expect(result.blockers[0].immediatelyResolvable).toBe(true)
    expect(result.blockers[0].deepLink.suggestedCommanderIntent).toBe('MANAGE_LOADOUT')
  })

  it('Mixed conditions: an unresolvable blocker and an advisory together — blockers win, overall status is Launch Blocked, both lists populated', () => {
    const hardpoints = [
      hp({ id: 'hp-missing', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' }),
      hp({ id: 'hp-upgrade', slotLabel: 'Power Plant', status: 'Upgrade Available', installedItem: 'OldPP', targetItem: 'NewPP' }),
    ]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints }))
    expect(result.status).toBe('LAUNCH_BLOCKED')
    expect(result.blockers).toHaveLength(1)
    expect(result.warnings.some((w) => w.reason === 'UPGRADE_AVAILABLE')).toBe(true)
  })

  it('Mixed conditions: one resolvable blocker and one unresolvable blocker together still escalates to Launch Blocked (worst case wins)', () => {
    const hardpoints = [
      hp({ id: 'hp-available', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' }),
      hp({ id: 'hp-unavailable', slotLabel: 'Right Shield', status: 'Missing', targetItem: 'Impossible' }),
    ]
    const hangarItems: HangarItem[] = [{ id: 'h1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints, hangarItems }))
    expect(result.blockers).toHaveLength(2)
    expect(result.status).toBe('LAUNCH_BLOCKED')
  })

  it('Multiple ships: evaluating two different ships against the same shared context returns independent, correct results', () => {
    const s1 = ship({ id: 'a', name: 'Alpha', activeBuildId: 'ba' })
    const s2 = ship({ id: 'b', name: 'Beta', activeBuildId: 'bb' })
    const b1 = build({ id: 'ba', shipId: 'a' })
    const b2 = build({ id: 'bb', shipId: 'b' })
    const hardpoints = [
      hp({ id: 'hp-a', shipId: 'a', buildId: 'ba', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' }),
      hp({ id: 'hp-b', shipId: 'b', buildId: 'bb', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' }),
    ]
    const params = { shipId: 'a', ships: [s1, s2], fleetAssets: [], builds: [b1, b2], hardpoints, hangarItems: [], installedLoadouts: [], reservations: [] }
    const resultA = evaluateLaunchReadiness(params)
    const resultB = evaluateLaunchReadiness({ ...params, shipId: 'b' })
    expect(resultA.status).toBe('MISSION_READY')
    expect(resultA.shipName).toBe('Alpha')
    expect(resultB.status).toBe('LAUNCH_BLOCKED')
    expect(resultB.shipName).toBe('Beta')
  })

  it('Different active builds: evaluating an explicit non-active buildId reads that build\'s own hardpoints, not the ship\'s stored activeBuildId', () => {
    const s = ship({ id: 's', activeBuildId: 'active-build' })
    const activeBuild = build({ id: 'active-build', shipId: 's', name: 'Active' })
    const altBuild = build({ id: 'alt-build', shipId: 's', name: 'Alternate' })
    const hardpoints = [
      hp({ id: 'hp-active', buildId: 'active-build', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' }),
      hp({ id: 'hp-alt', buildId: 'alt-build', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' }),
    ]
    const params = baseParams({ ships: [s], builds: [activeBuild, altBuild], hardpoints })

    const defaultResult = evaluateLaunchReadiness(params)
    expect(defaultResult.buildId).toBe('active-build')
    expect(defaultResult.status).toBe('MISSION_READY')

    const altResult = evaluateLaunchReadiness({ ...params, buildId: 'alt-build' })
    expect(altResult.buildId).toBe('alt-build')
    expect(altResult.buildName).toBe('Alternate')
    expect(altResult.status).toBe('LAUNCH_BLOCKED')
  })

  it('Confidence is LOW when the build has zero required assignments — a trivially "ready" reading that should not be trusted', () => {
    const result = evaluateLaunchReadiness(baseParams({ hardpoints: [] }))
    expect(result.status).toBe('MISSION_READY')
    expect(result.confidence).toBe('LOW')
    expect(result.recommendations.some((r) => r.message.includes('should not be trusted'))).toBe(true)
  })

  it('Confidence is LOW when no build resolves at all for the given buildId', () => {
    const result = evaluateLaunchReadiness(baseParams({ builds: [], hardpoints: [] }))
    expect(result.confidence).toBe('LOW')
    expect(result.buildId).toBeUndefined()
  })

  it('Confidence is MEDIUM for a Factory-kind build with real requirements — never explicitly reviewed by the Commander', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
    const result = evaluateLaunchReadiness(baseParams({ builds: [build({ kind: 'FACTORY' })], hardpoints }))
    expect(result.confidence).toBe('MEDIUM')
    expect(result.recommendations.some((r) => r.message.includes('Factory Loadout'))).toBe(true)
  })

  it('throws a clear error for an unknown shipId rather than returning a misleading result', () => {
    expect(() => evaluateLaunchReadiness(baseParams({ shipId: 'ghost-ship' }))).toThrow(/no ship found for id "ghost-ship"/)
  })

  it('a Missing component with a matching active reservation for this exact port is a resolvable blocker, and does not also produce a duplicate RESERVATION_PENDING advisory', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' })]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'b', fleetAssetId: 's', targetSlotLabel: 'Left Shield', componentName: 'Mirage', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints, reservations }))
    expect(result.status).toBe('MAINTENANCE_REQUIRED')
    expect(result.blockers[0].acquisitionHint?.label).toBe('Reserved For This Port')
    expect(result.blockers[0].immediatelyResolvable).toBe(true)
    expect(result.warnings.filter((w) => w.reason === 'RESERVATION_PENDING')).toHaveLength(0)
  })

  it('an active reservation not tied to any current blocker on this build surfaces as an optional RESERVATION_PENDING advisory', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'other-build', fleetAssetId: 's', targetSlotLabel: 'Right Shield', componentName: 'SomethingElse', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints, reservations }))
    expect(result.status).toBe('READY_WITH_ADVISORIES')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].reason).toBe('RESERVATION_PENDING')
  })

  it('readinessPercent is BuildProgressResult.percentage verbatim, never a second formula', () => {
    const hardpoints = [
      hp({ id: 'hp-1', slotLabel: 'A', status: 'OK', targetItem: 'X', installedItem: 'X' }),
      hp({ id: 'hp-2', slotLabel: 'B', status: 'Missing', targetItem: 'Y' }),
    ]
    const result = evaluateLaunchReadiness(baseParams({ hardpoints }))
    expect(result.readinessPercent).toBe(50)
  })
})
