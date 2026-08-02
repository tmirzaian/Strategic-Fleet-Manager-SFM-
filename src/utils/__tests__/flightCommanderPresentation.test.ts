import { describe, it, expect } from 'vitest'
import { buildFlightCommanderPresentation, isCanonicalStockShipDisplayName } from '../flightCommanderPresentation'
import type { FactoryLoadoutTargetIntelligenceResult, TargetIntelligenceComponentMatch, TargetIntelligenceSourceShip } from '../factoryLoadoutTargetIntelligence'

function match(overrides: Partial<TargetIntelligenceComponentMatch> = {}): TargetIntelligenceComponentMatch {
  return { componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', category: 'Shield', factoryQuantity: 1, fleetQuantityNeeded: 1, affected: [], ...overrides }
}

function sourceShip(overrides: Partial<TargetIntelligenceSourceShip> = {}): TargetIntelligenceSourceShip {
  return {
    shipDefinitionId: 'ship-a',
    displayName: 'Cutlass Black',
    matches: [match()],
    distinctComponentCount: 1,
    totalUnresolvedUnitsCovered: 1,
    categoriesPresent: ['Shield'],
    ...overrides,
  }
}

function baseResult(overrides: Partial<FactoryLoadoutTargetIntelligenceResult> = {}): FactoryLoadoutTargetIntelligenceResult {
  return {
    sourceShips: [sourceShip()],
    demandComponents: [{ componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', category: 'Shield', fleetQuantityNeeded: 1, affected: [] }],
    matchedDemandComponentCount: 1,
    totalFleetRequirementUnits: 1,
    sourceShipsIdentifiedCount: 1,
    highValueTargetCount: 0,
    factoryDataAvailable: true,
    ...overrides,
  }
}

describe('isCanonicalStockShipDisplayName', () => {
  it.each(['F7 Hornet Mk Wikelo', 'Aegis Hammerhead 2949 Best In Show Edition', 'Some Ship Foundation Festival', 'Some Ship Concierge Edition', 'RSI Ursa Medivac Wikelo Special'])(
    'excludes a known cosmetic/promotional variant: %s',
    (name) => {
      expect(isCanonicalStockShipDisplayName(name)).toBe(false)
    }
  )

  it.each(['Cutlass Black', 'Gladius', 'F7C-S Hornet Ghost Mk II', 'Constellation Andromeda'])('accepts a canonical stock ship name: %s', (name) => {
    expect(isCanonicalStockShipDisplayName(name)).toBe(true)
  })
})

describe('buildFlightCommanderPresentation', () => {
  it('excludes a cosmetic/promotional source ship entirely, even when it has real matches', () => {
    const result = baseResult({ sourceShips: [sourceShip({ displayName: 'F7 Hornet Mk Wikelo' })] })
    const presentation = buildFlightCommanderPresentation(result)
    expect(presentation.sourceShips).toEqual([])
    expect(presentation.sourceShipsIdentifiedCount).toBe(0)
  })

  it('keeps a canonical stock source ship unchanged', () => {
    const result = baseResult()
    const presentation = buildFlightCommanderPresentation(result)
    expect(presentation.sourceShips.map((s) => s.shipDefinitionId)).toEqual(['ship-a'])
  })

  it('filters out a non-actionable-category match (e.g. Missile Rack) while keeping actionable matches on the same ship', () => {
    const result = baseResult({
      sourceShips: [
        sourceShip({
          matches: [match({ category: 'Shield' }), match({ componentName: 'M99', category: 'MissileRack' })],
          categoriesPresent: ['Shield', 'MissileRack'],
          distinctComponentCount: 2,
        }),
      ],
    })
    const presentation = buildFlightCommanderPresentation(result)
    expect(presentation.sourceShips[0].matches.map((m) => m.componentName)).toEqual(['Mirage'])
    expect(presentation.sourceShips[0].categoriesPresent).toEqual(['Shield'])
    expect(presentation.sourceShips[0].distinctComponentCount).toBe(1)
  })

  it('drops a source ship entirely when every one of its matches is a non-actionable category', () => {
    const result = baseResult({
      sourceShips: [sourceShip({ matches: [match({ category: 'MissileRack' })], categoriesPresent: ['MissileRack'] })],
    })
    const presentation = buildFlightCommanderPresentation(result)
    expect(presentation.sourceShips).toEqual([])
  })

  it('totalFleetRequirementUnits only counts actionable-category demand', () => {
    const result = baseResult({
      demandComponents: [
        { componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', category: 'Shield', fleetQuantityNeeded: 2, affected: [] },
        { componentName: 'M99', componentEntityClass: null, category: 'MissileRack', fleetQuantityNeeded: 5, affected: [] },
      ],
    })
    const presentation = buildFlightCommanderPresentation(result)
    expect(presentation.totalFleetRequirementUnits).toBe(2)
  })

  it('hasActionableDemand is false when every demand component is a non-actionable category, even though raw demand exists', () => {
    const result = baseResult({ demandComponents: [{ componentName: 'M99', componentEntityClass: null, category: 'MissileRack', fleetQuantityNeeded: 5, affected: [] }] })
    const presentation = buildFlightCommanderPresentation(result)
    expect(presentation.hasActionableDemand).toBe(false)
  })

  it('re-ranks source ships deterministically after category filtering changes their distinct-match counts', () => {
    const result = baseResult({
      sourceShips: [
        sourceShip({
          shipDefinitionId: 'ship-b',
          displayName: 'Zeta',
          matches: [match({ category: 'Shield' }), match({ componentName: 'M99', category: 'MissileRack' })],
          distinctComponentCount: 2, // pre-filter: 2 distinct (would rank first)
        }),
        sourceShip({
          shipDefinitionId: 'ship-a',
          displayName: 'Alpha',
          matches: [match({ category: 'Shield' }), match({ componentName: 'CoolerX', category: 'Cooler', factoryQuantity: 1, fleetQuantityNeeded: 1 })],
          distinctComponentCount: 2,
        }),
      ],
    })
    const presentation = buildFlightCommanderPresentation(result)
    // After filtering, ship-b (Zeta) drops to 1 actionable match (Shield only,
    // MissileRack removed) while ship-a (Alpha) keeps 2 (Shield + Cooler) —
    // Alpha must now rank first, proving the ranking was reapplied post-filter.
    expect(presentation.sourceShips.map((s) => s.shipDefinitionId)).toEqual(['ship-a', 'ship-b'])
  })

  it('factoryDataAvailable passes through verbatim, independent of filtering', () => {
    const presentation = buildFlightCommanderPresentation(baseResult({ factoryDataAvailable: false, sourceShips: [], demandComponents: [] }))
    expect(presentation.factoryDataAvailable).toBe(false)
  })
})
