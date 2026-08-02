import { describe, it, expect, vi } from 'vitest'
import type { Ship, Build, Hardpoint } from '../../types'

/**
 * EWO-104 (corrected), Part K.3 — "Factory data unavailable or incomplete"
 * fails safely. A separate file/mock from `factoryLoadoutTargetIntelligence.test.ts`
 * since this scenario needs every ship definition's factory template to be
 * genuinely empty, unlike that file's populated fixture.
 */
vi.mock('../../data/shipDefinitions', () => ({
  shipDefinitions: [{ id: 'ship-a', displayName: 'Ship Alpha' }],
  shipFactoryTemplates: { 'ship-a': [] },
}))

const { resolveFactoryLoadoutTargetIntelligence } = await import('../factoryLoadoutTargetIntelligence')

function ship(overrides: Partial<Ship> = {}): Ship {
  return { id: 's1', name: 'Corsair', manufacturer: 'RSI', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active', ...overrides }
}

function build(overrides: Partial<Build> = {}): Build {
  return { id: 'b1', shipId: 's1', name: 'Stealth Build', role: '', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM', ...overrides }
}

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel' | 'status'>): Hardpoint {
  return {
    shipId: 's1',
    buildId: 'b1',
    type: 'Shield',
    size: 'S1',
    factoryItem: overrides.targetItem ?? '—',
    installedItem: overrides.installedItem ?? '—',
    targetItem: overrides.targetItem ?? '—',
    ...overrides,
  }
}

describe('resolveFactoryLoadoutTargetIntelligence — unknown/incomplete factory data fails safely', () => {
  it('reports factoryDataAvailable: false and an empty source roster, never throwing, when no ship definition carries real factory data', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    expect(() =>
      resolveFactoryLoadoutTargetIntelligence({ ships: [ship()], builds: [build()], hardpoints, hangarItems: [], installedLoadouts: [], reservations: [] })
    ).not.toThrow()
    const result = resolveFactoryLoadoutTargetIntelligence({ ships: [ship()], builds: [build()], hardpoints, hangarItems: [], installedLoadouts: [], reservations: [] })
    expect(result.factoryDataAvailable).toBe(false)
    expect(result.sourceShips).toEqual([])
    // Demand itself is still computed honestly — the roster is what's empty, not the underlying fleet need.
    expect(result.demandComponents).toHaveLength(1)
  })
})
