import { describe, it, expect } from 'vitest'
import { calculateBuildProgress } from '../buildProgress'
import type { Hardpoint } from '../../types'

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

function rowsWithRatio(okCount: number, totalCount: number): Hardpoint[] {
  return Array.from({ length: totalCount }, (_, i) => hp({ id: `h${i}`, status: i < okCount ? 'OK' : 'Missing' }))
}

describe('calculateBuildProgress', () => {
  it('15. percentage uses all required target assignments (targets with no target excluded)', () => {
    const rows = [
      hp({ status: 'OK' }),
      hp({ status: 'OK' }),
      hp({ status: 'Missing' }),
      hp({ targetItem: '—', status: 'OK' }), // not required — must not count toward the denominator
    ]
    const result = calculateBuildProgress(rows)
    expect(result.requiredAssignments).toBe(3)
    expect(result.matchedAssignments).toBe(2)
    expect(result.percentage).toBe(67)
  })

  it('16. Build Complete only occurs at exact 100%', () => {
    expect(calculateBuildProgress(rowsWithRatio(5, 5)).isComplete).toBe(true)
    expect(calculateBuildProgress(rowsWithRatio(4, 5)).isComplete).toBe(false)
  })

  it('17. 85%, 88%, 96%, and 99% are all NOT complete', () => {
    expect(calculateBuildProgress(rowsWithRatio(17, 20)).percentage).toBe(85)
    expect(calculateBuildProgress(rowsWithRatio(17, 20)).isComplete).toBe(false)

    expect(calculateBuildProgress(rowsWithRatio(22, 25)).percentage).toBe(88)
    expect(calculateBuildProgress(rowsWithRatio(22, 25)).isComplete).toBe(false)

    expect(calculateBuildProgress(rowsWithRatio(24, 25)).percentage).toBe(96)
    expect(calculateBuildProgress(rowsWithRatio(24, 25)).isComplete).toBe(false)

    expect(calculateBuildProgress(rowsWithRatio(99, 100)).percentage).toBe(99)
    expect(calculateBuildProgress(rowsWithRatio(99, 100)).isComplete).toBe(false)
  })

  it('a target that is empty/null is not required and does not reduce percentage', () => {
    const rows = [hp({ status: 'OK' }), hp({ targetItem: '', status: 'OK' }), hp({ targetItem: '—', status: 'OK' })]
    const result = calculateBuildProgress(rows)
    expect(result.requiredAssignments).toBe(1)
    expect(result.percentage).toBe(100)
    expect(result.isComplete).toBe(true)
  })

  it('installed equals target counts as matched', () => {
    const result = calculateBuildProgress([hp({ installedItem: 'Mirage', targetItem: 'Mirage', status: 'OK' })])
    expect(result.matchedAssignments).toBe(1)
  })

  it('installed empty with a target present counts as missing, not matched', () => {
    const result = calculateBuildProgress([hp({ installedItem: '—', targetItem: 'Mirage', status: 'Missing' })])
    expect(result.missingAssignments).toEqual(['Mirage'])
    expect(result.matchedAssignments).toBe(0)
  })

  it('installed equals factory but target differs counts as missing (nothing done yet)', () => {
    const result = calculateBuildProgress([hp({ installedItem: 'Stock', factoryItem: 'Stock', targetItem: 'Upgrade', status: 'Missing' })])
    expect(result.missingAssignments).toEqual(['Upgrade'])
  })

  it('installed differs from both factory and target counts as an upgrade opportunity, not matched', () => {
    const result = calculateBuildProgress([hp({ installedItem: 'Civilian A', factoryItem: 'Stock C', targetItem: 'Stealth A', status: 'Upgrade Available' })])
    expect(result.upgradeOpportunities).toEqual(['Stealth A'])
    expect(result.mismatchedAssignments).toEqual(['Stealth A'])
    expect(result.matchedAssignments).toBe(0)
  })

  it('an incompatible target is reported separately as invalid, never folded into missing', () => {
    const result = calculateBuildProgress([hp({ status: 'Invalid Target' })])
    expect(result.invalidTargets.length).toBe(1)
    expect(result.missingAssignments).toEqual([])
    expect(result.status).toBe('INVALID')
  })

  it('zero required assignments (Factory = Installed = Target everywhere) is treated as 100%', () => {
    const result = calculateBuildProgress([hp({ targetItem: '—' }), hp({ targetItem: '' })])
    expect(result.requiredAssignments).toBe(0)
    expect(result.percentage).toBe(100)
    expect(result.isComplete).toBe(true)
    expect(result.status).toBe('COMPLETE')
  })

  it('18/19 (engine-level): a complete result carries isComplete/status a UI can use to hide the bar and show BUILD COMPLETE', () => {
    const result = calculateBuildProgress(rowsWithRatio(3, 3))
    expect(result.isComplete).toBe(true)
    expect(result.status).toBe('COMPLETE')
  })

  it('20/21/22 (engine-level): removing a matched required component flips isComplete off and adds a missing entry', () => {
    const complete = [hp({ id: 'a', installedItem: 'Mirage', targetItem: 'Mirage', status: 'OK' }), hp({ id: 'b', installedItem: 'Beacon', targetItem: 'Beacon', status: 'OK' })]
    expect(calculateBuildProgress(complete).isComplete).toBe(true)

    const afterRemoval = [hp({ id: 'a', installedItem: '—', targetItem: 'Mirage', status: 'Missing' }), hp({ id: 'b', installedItem: 'Beacon', targetItem: 'Beacon', status: 'OK' })]
    const result = calculateBuildProgress(afterRemoval)
    expect(result.isComplete).toBe(false)
    expect(result.percentage).toBeLessThan(100)
    expect(result.missingAssignments).toContain('Mirage')
  })
})
