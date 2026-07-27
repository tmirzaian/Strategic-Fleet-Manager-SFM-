import { describe, it, expect } from 'vitest'
import { buildShipManagementSummary, criticalHardpointsInPriorityOrder, type ShipManagementSummaryContext } from '../shipManagementSummary'
import type { Hardpoint, HangarItem, InstalledLoadoutEntry, MissionReservation, Ship, Build } from '../../types'

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel' | 'status'>): Hardpoint {
  return {
    shipId: 'ship-1',
    buildId: 'build-1',
    type: 'Shield',
    size: 'S1',
    factoryItem: overrides.targetItem ?? '—',
    installedItem: overrides.installedItem ?? '—',
    targetItem: overrides.targetItem ?? '—',
    ...overrides,
  }
}

const baseContext: ShipManagementSummaryContext = {
  shipId: 'ship-1',
  build: { id: 'build-1', shipId: 'ship-1', name: 'Test Build', role: '', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' } as Build,
  hangarItems: [] as HangarItem[],
  installedLoadouts: [] as InstalledLoadoutEntry[],
  reservations: [] as MissionReservation[],
  ships: [] as Ship[],
}

describe('buildShipManagementSummary — EWO-063/EWO-064: the one authoritative Ship Management calculation', () => {
  it('an all-OK hardpoint set reports 100% readiness, no missing components, and no decisions', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
    const summary = buildShipManagementSummary(hardpoints, baseContext)
    expect(summary.progress.percentage).toBe(100)
    expect(summary.missingSummary).toEqual([])
    expect(summary.decisionCount).toBe(0)
    expect(summary.prioritizedDecisions).toEqual([])
  })

  it('a Missing hardpoint with real Hangar stock is readiness-incomplete and tagged Available in Inventory', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' })]
    const context: ShipManagementSummaryContext = { ...baseContext, hangarItems: [{ id: 'hangar-1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Install' }] }
    const summary = buildShipManagementSummary(hardpoints, context)
    expect(summary.progress.percentage).toBeLessThan(100)
    expect(summary.missingSummary).toEqual(['Mirage'])
    expect(summary.decisionCount).toBe(1)
    expect(summary.hintByHardpointId.get('hp-1')?.tone).toBe('success')
    expect(summary.hintByHardpointId.get('hp-1')?.label).toBe('Available in Inventory')
    expect(summary.availabilityByHardpointId.get('hp-1')?.availableQuantity).toBe(1)
  })

  it('EWO-064 (Part C): a Missing hardpoint with zero Hangar stock (Purchase Required) still counts as a real decision — no longer excluded', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' })]
    const summary = buildShipManagementSummary(hardpoints, baseContext)
    expect(summary.missingSummary).toEqual(['Mirage'])
    expect(summary.decisionCount).toBe(1)
    expect(summary.prioritizedDecisions.map((h) => h.id)).toEqual(['hp-1'])
    expect(summary.hintByHardpointId.get('hp-1')?.label).toBe('Purchase Required')
  })

  it('EWO-064 (Part C): an Upgrade Available hardpoint is now included as a real decision — previously silently excluded', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Upgrade Available', installedItem: 'OldMirage', targetItem: 'Mirage' })]
    const summary = buildShipManagementSummary(hardpoints, baseContext)
    expect(summary.decisionCount).toBe(1)
    expect(summary.prioritizedDecisions.map((h) => h.id)).toEqual(['hp-1'])
  })

  it('an Invalid Target hardpoint always sorts ahead of every Missing/Upgrade row and never needs an acquisition hint', () => {
    const hardpoints = [
      hp({ id: 'hp-missing', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage' }),
      hp({ id: 'hp-invalid', slotLabel: 'Right Shield', status: 'Invalid Target', targetItem: 'BadItem', invalidMessage: 'Incompatible' }),
    ]
    const summary = buildShipManagementSummary(hardpoints, baseContext)
    expect(summary.prioritizedDecisions.map((h) => h.id)).toEqual(['hp-invalid', 'hp-missing'])
  })

  it('EWO-064 (Part C/G): acquisition priority order is Reserved-elsewhere > Available > Borrow > Purchase Required', () => {
    const hardpoints = [
      hp({ id: 'hp-purchase', slotLabel: 'A', status: 'Missing', targetItem: 'NeedsPurchase' }),
      hp({ id: 'hp-borrow', slotLabel: 'B', status: 'Missing', targetItem: 'BorrowMe' }),
      hp({ id: 'hp-available', slotLabel: 'C', status: 'Missing', targetItem: 'FreeStock' }),
      hp({ id: 'hp-reserved', slotLabel: 'D', status: 'Missing', targetItem: 'ReservedElsewhere' }),
    ]
    const context: ShipManagementSummaryContext = {
      ...baseContext,
      hangarItems: [
        { id: 'h1', name: 'FreeStock', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Install' },
        { id: 'h2', name: 'ReservedElsewhere', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Install' },
      ],
      reservations: [
        { id: 'r1', componentName: 'ReservedElsewhere', missionConfigurationId: 'some-other-build', targetSlotLabel: 'Other Slot', status: 'ACTIVE', quantity: 1 } as MissionReservation,
      ],
      installedLoadouts: [{ shipId: 'ship-2', buildId: 'build-2', slotLabel: 'Some Slot', installedItem: 'BorrowMe' } as InstalledLoadoutEntry],
      ships: [{ id: 'ship-2', name: 'Donor Ship' } as Ship],
    }
    const summary = buildShipManagementSummary(hardpoints, context)
    expect(summary.prioritizedDecisions.map((h) => h.id)).toEqual(['hp-reserved', 'hp-available', 'hp-borrow', 'hp-purchase'])
  })

  it('structural hardpoints never appear in the availability map', () => {
    const hardpoints = [hp({ id: 'hp-structural', slotLabel: 'Turret Mount', status: 'OK', isStructural: true })]
    const summary = buildShipManagementSummary(hardpoints, baseContext)
    expect(summary.availabilityByHardpointId.has('hp-structural')).toBe(false)
  })

  it('criticalHardpointsInPriorityOrder is re-exported from ShipWorkspacePrototype unchanged (existing test imports still resolve)', () => {
    const hardpoints = [
      hp({ id: 'hp-ok', slotLabel: 'A', status: 'OK' }),
      hp({ id: 'hp-missing', slotLabel: 'B', status: 'Missing' }),
      hp({ id: 'hp-upgrade', slotLabel: 'C', status: 'Upgrade Available' }),
      hp({ id: 'hp-invalid', slotLabel: 'D', status: 'Invalid Target' }),
    ]
    expect(criticalHardpointsInPriorityOrder(hardpoints).map((h) => h.id)).toEqual(['hp-invalid', 'hp-missing', 'hp-upgrade'])
  })
})
