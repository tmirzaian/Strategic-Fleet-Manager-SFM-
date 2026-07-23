import { describe, it, expect } from 'vitest'
import { deriveConfigurableSlotsRuntimeCatalog } from '../catalogRuntimeWriter'
import type { FleetSweepResult, FleetSweepShipResult, DiscoveryRow } from '../fleetSweep'
import type { CanonicalConfigurableTopology, ConfigurableSlot } from '../types'

function makeSlot(overrides: Partial<ConfigurableSlot> & { portName: string }): ConfigurableSlot {
  return {
    parentPortName: null,
    localizedSlotName: null,
    defaultComponentEntityClass: 'Some_Default',
    swapGroupId: 'someGroup',
    eligibleComponents: ['Some_Default', 'Some_Alt'],
    currentInstalledEntityClass: null,
    sourceAuthority: 'geometry-and-configuration',
    confidence: 'tag-co-membership',
    diagnostics: [{ code: 'swap-group-resolved', message: 'resolved', severity: 'info' }],
    ...overrides,
  }
}

function makeShipResult(entityClass: string, slots: ConfigurableSlot[], rowOverrides: Partial<DiscoveryRow>[] = []): FleetSweepShipResult {
  const topology: CanonicalConfigurableTopology = { shipEntityClass: entityClass, configurableSlots: slots, diagnostics: [] }
  const rows: DiscoveryRow[] = slots.map((slot, i) => ({
    hull: entityClass,
    manufacturer: null,
    portName: slot.portName,
    swapGroupId: slot.swapGroupId,
    eligibleComponentCount: slot.eligibleComponents.length,
    confidence: slot.confidence,
    sourceAuthority: slot.sourceAuthority,
    category: 'B-newly-discovered',
    rejectionReason: null,
    ...rowOverrides[i],
  }))
  return { entityClass, topology, manufacturer: null, rows }
}

function sweepOf(...ships: FleetSweepShipResult[]): FleetSweepResult {
  return { totalShips: ships.length, shipsWithNoLiveRecord: [], ships }
}

describe('deriveConfigurableSlotsRuntimeCatalog', () => {
  it('includes a Category B slot with the exact display-relevant fields', () => {
    const ship = makeShipResult('TEST_Ship', [makeSlot({ portName: 'hardpoint_x' })])
    const catalog = deriveConfigurableSlotsRuntimeCatalog(sweepOf(ship), '4.9.187.14500', '2026-07-23T00:00:00.000Z')
    expect(catalog.ships.TEST_Ship).toHaveLength(1)
    expect(catalog.ships.TEST_Ship[0]).toEqual({
      portName: 'hardpoint_x',
      parentPortName: null,
      defaultComponentEntityClass: 'Some_Default',
      swapGroupId: 'someGroup',
      eligibleComponentCount: 2,
      confidence: 'tag-co-membership',
      sourceAuthority: 'geometry-and-configuration',
      category: 'B-newly-discovered',
      diagnostics: [{ message: 'resolved', severity: 'info' }],
    })
  })

  it('excludes a Category D (rejected) slot entirely', () => {
    const ship = makeShipResult('TEST_Ship', [makeSlot({ portName: 'hardpoint_x' })], [{ category: 'D-rejected' }])
    const catalog = deriveConfigurableSlotsRuntimeCatalog(sweepOf(ship), 'v', 'now')
    expect(catalog.ships.TEST_Ship).toBeUndefined()
  })

  it('excludes an unresolved (unclassified) slot entirely', () => {
    const ship = makeShipResult('TEST_Ship', [makeSlot({ portName: 'hardpoint_x', confidence: 'unresolved' })], [{ category: null }])
    const catalog = deriveConfigurableSlotsRuntimeCatalog(sweepOf(ship), 'v', 'now')
    expect(catalog.ships.TEST_Ship).toBeUndefined()
  })

  it('includes a Category C (review required) slot — visible, not hidden, per Objective 4', () => {
    const ship = makeShipResult('TEST_Ship', [makeSlot({ portName: 'hardpoint_x' })], [{ category: 'C-review-required' }])
    const catalog = deriveConfigurableSlotsRuntimeCatalog(sweepOf(ship), 'v', 'now')
    expect(catalog.ships.TEST_Ship?.[0]?.category).toBe('C-review-required')
  })

  it('omits a ship entirely from the ships map when it has no Commander-visible slots', () => {
    const ship = makeShipResult('TEST_Ship', [makeSlot({ portName: 'hardpoint_x', confidence: 'unresolved' })], [{ category: null }])
    const catalog = deriveConfigurableSlotsRuntimeCatalog(sweepOf(ship), 'v', 'now')
    expect(Object.keys(catalog.ships)).not.toContain('TEST_Ship')
  })

  it('carries gameVersion and generatedAt verbatim', () => {
    const catalog = deriveConfigurableSlotsRuntimeCatalog(sweepOf(), '4.9.187.14500', '2026-07-23T00:00:00.000Z')
    expect(catalog.source).toEqual({ gameVersion: '4.9.187.14500', generatedAt: '2026-07-23T00:00:00.000Z' })
  })

  it('is a pure function of the sweep result', () => {
    const sweep = sweepOf(makeShipResult('TEST_Ship', [makeSlot({ portName: 'hardpoint_x' })]))
    expect(deriveConfigurableSlotsRuntimeCatalog(sweep, 'v', 'now')).toEqual(deriveConfigurableSlotsRuntimeCatalog(sweep, 'v', 'now'))
  })
})
