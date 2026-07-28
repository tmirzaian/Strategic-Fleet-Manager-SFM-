import { describe, it, expect } from 'vitest'
import {
  buildShipManagementSummary,
  criticalHardpointsInPriorityOrder,
  resolveOperationalReviewStatus,
  fulfillmentStatusFromHint,
  STATUS_PILL,
  type ShipManagementSummaryContext,
} from '../shipManagementSummary'
import type { AcquisitionHint } from '../componentAcquisitionHint'
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

  it('a Missing hardpoint with zero Hangar stock (Purchase Required) still counts toward decisionCount/missingSummary (real demand) — see actionableCount below for the Immediate Decisions distinction (EWO-065B)', () => {
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

  describe('EWO-065B: actionableDecisions/actionableCount — Immediate Decision qualification', () => {
    it('a Purchase Required Missing hardpoint counts toward decisionCount (real demand) but NOT actionableCount (nothing to do right now)', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'Mirage' })]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      expect(summary.hintByHardpointId.get('hp-1')?.tone).toBe('muted')
      expect(summary.decisionCount).toBe(1)
      expect(summary.actionableCount).toBe(0)
      expect(summary.actionableDecisions).toEqual([])
    })

    it('a Missing hardpoint with real Hangar stock (Available in Inventory) qualifies as actionable', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'Mirage' })]
      const context: ShipManagementSummaryContext = { ...baseContext, hangarItems: [{ id: 'h1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Install' }] }
      const summary = buildShipManagementSummary(hardpoints, context)
      expect(summary.actionableCount).toBe(1)
      expect(summary.actionableDecisions.map((h) => h.id)).toEqual(['hp-1'])
    })

    it('an Invalid Target row is always actionable regardless of any acquisition hint — resolving it never depends on inventory', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'Invalid Target', targetItem: 'BadItem', invalidMessage: 'Incompatible' })]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      expect(summary.actionableCount).toBe(1)
      expect(summary.actionableDecisions.map((h) => h.id)).toEqual(['hp-1'])
    })

    it('a Reserved-elsewhere target (warning tone) qualifies as actionable — reassigning it is an immediate action', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'ReservedElsewhere' })]
      const context: ShipManagementSummaryContext = {
        ...baseContext,
        hangarItems: [{ id: 'h1', name: 'ReservedElsewhere', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Install' }],
        reservations: [{ id: 'r1', componentName: 'ReservedElsewhere', missionConfigurationId: 'some-other-build', targetSlotLabel: 'Other Slot', status: 'ACTIVE', quantity: 1 } as MissionReservation],
      }
      const summary = buildShipManagementSummary(hardpoints, context)
      expect(summary.hintByHardpointId.get('hp-1')?.tone).toBe('warning')
      expect(summary.actionableCount).toBe(1)
    })

    it('a borrowable target (cyan tone) qualifies as actionable', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'BorrowMe' })]
      const context: ShipManagementSummaryContext = {
        ...baseContext,
        installedLoadouts: [{ shipId: 'ship-2', buildId: 'build-2', slotLabel: 'Some Slot', installedItem: 'BorrowMe' } as InstalledLoadoutEntry],
        ships: [{ id: 'ship-2', name: 'Donor Ship' } as Ship],
      }
      const summary = buildShipManagementSummary(hardpoints, context)
      expect(summary.hintByHardpointId.get('hp-1')?.tone).toBe('cyan')
      expect(summary.actionableCount).toBe(1)
    })

    it('a mixed set counts only the genuinely actionable subset, in the same acquisition-priority order as prioritizedDecisions', () => {
      const hardpoints = [
        hp({ id: 'hp-purchase', slotLabel: 'A', status: 'Missing', targetItem: 'NeedsPurchase' }),
        hp({ id: 'hp-available', slotLabel: 'B', status: 'Missing', targetItem: 'FreeStock' }),
        hp({ id: 'hp-invalid', slotLabel: 'C', status: 'Invalid Target', targetItem: 'BadItem' }),
      ]
      const context: ShipManagementSummaryContext = {
        ...baseContext,
        hangarItems: [{ id: 'h1', name: 'FreeStock', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Install' }],
      }
      const summary = buildShipManagementSummary(hardpoints, context)
      expect(summary.decisionCount).toBe(3)
      expect(summary.actionableCount).toBe(2)
      expect(summary.actionableDecisions.map((h) => h.id)).toEqual(['hp-invalid', 'hp-available'])
    })
  })

  describe('EWO-065 (Part B/D): categoryDemand — category-level demand cards for the Hero', () => {
    it('aggregates multiple gaps in the same category into one count, ordered by the canonical taxonomy', () => {
      const hardpoints = [
        hp({ id: 'hp-w1', slotLabel: 'A', status: 'Missing', type: 'Weapon', targetItem: 'GunA' }),
        hp({ id: 'hp-w2', slotLabel: 'B', status: 'Missing', type: 'Weapon', targetItem: 'GunB' }),
        hp({ id: 'hp-cooler', slotLabel: 'C', status: 'Missing', type: 'Cooler', targetItem: 'CoolerA' }),
      ]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      // Cooler sorts ahead of Weapon in CANONICAL_COMPONENT_CATEGORY_ORDER.
      expect(summary.categoryDemand).toEqual([
        { key: 'Cooler', label: 'Coolers', icon: expect.anything(), count: 1 },
        { key: 'Weapon', label: 'Weapons', icon: expect.anything(), count: 2 },
      ])
    })

    it('omits a category entirely once it has zero outstanding targets — no stable-at-zero card, unlike the fleet-wide Quartermaster Report', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'OK', type: 'Shield', targetItem: 'Mirage', installedItem: 'Mirage' })]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      expect(summary.categoryDemand).toEqual([])
    })

    it('Invalid Target and Upgrade Available rows both contribute to their own category count, matching decisionHardpoints exactly', () => {
      const hardpoints = [
        hp({ id: 'hp-invalid', slotLabel: 'A', status: 'Invalid Target', type: 'Quantum Drive', targetItem: 'BadDrive' }),
        hp({ id: 'hp-upgrade', slotLabel: 'B', status: 'Upgrade Available', type: 'Shield', installedItem: 'OldShield', targetItem: 'NewShield' }),
      ]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      const totalCards = summary.categoryDemand.reduce((sum, c) => sum + c.count, 0)
      expect(totalCards).toBe(summary.decisionCount)
    })
  })

  describe('EWO-065 (Part E): isFullyCompletedCustomLoadout — the Quartermaster Completion Seal eligibility', () => {
    it('true for a genuinely completed custom Loadout: kind CUSTOM, real targets defined, everything matched, 100%', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      expect(summary.isFullyCompletedCustomLoadout).toBe(true)
    })

    it('false for a Factory Loadout at 100% — a stock ship must never earn the seal (Part E Factory exclusion)', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
      const factoryContext: ShipManagementSummaryContext = { ...baseContext, build: { ...baseContext.build!, kind: 'FACTORY' } }
      const summary = buildShipManagementSummary(hardpoints, factoryContext)
      expect(summary.progress.percentage).toBe(100)
      expect(summary.isFullyCompletedCustomLoadout).toBe(false)
    })

    it('false for an entirely empty/undefined custom Build — zero real targets must not trivially read as "complete" (the exact false-positive Part E names)', () => {
      // No targetItem override -> hp() defaults factory/installed/target all to '—' -> zero required assignments.
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'OK' })]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      expect(summary.progress.requiredAssignments).toBe(0)
      expect(summary.progress.percentage).toBe(100)
      expect(summary.isFullyCompletedCustomLoadout).toBe(false)
    })

    it('false while any real gap remains (Missing, Upgrade Available, or Invalid Target)', () => {
      const hardpoints = [
        hp({ id: 'hp-1', slotLabel: 'A', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' }),
        hp({ id: 'hp-2', slotLabel: 'B', status: 'Missing', targetItem: 'Glacier' }),
      ]
      const summary = buildShipManagementSummary(hardpoints, baseContext)
      expect(summary.isFullyCompletedCustomLoadout).toBe(false)
    })

    it('false when no Build is known at all (undefined context.build)', () => {
      const hardpoints = [hp({ id: 'hp-1', slotLabel: 'A', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
      const noBuildContext: ShipManagementSummaryContext = { ...baseContext, build: undefined }
      const summary = buildShipManagementSummary(hardpoints, noBuildContext)
      expect(summary.isFullyCompletedCustomLoadout).toBe(false)
    })
  })
})

/**
 * EWO-068A — the canonical fulfillment-state precedence used by
 * Operational Review's Status column. `hp.status` (installed/target/
 * factory identity comparison, computed by `computeHardpointStatus`) is
 * never sufficient on its own — this resolver combines it with the same
 * `AcquisitionHint` every other surface (`hintByHardpointId`) already
 * reads, so a genuinely reserved/available exact target is never
 * demoted to a lesser label just because the raw grade/match comparison
 * also disagrees (Part E's own worked examples).
 *
 * EWO-068B — `STATUS_PILL[status]` is now the one canonical
 * compactLabel/tone source (Part D); Reserved gets its OWN `cyan` tone
 * (Mission Control's own canonical reserved-state color), deliberately
 * split from Available's `success` green even though both used to read
 * identically via the old `operationalReviewStatusTone` (retired this
 * mission).
 */
describe('resolveOperationalReviewStatus / STATUS_PILL — EWO-068A/EWO-068B: canonical fulfillment-state precedence and compact pill mapping', () => {
  const hint = (overrides: Partial<AcquisitionHint>): AcquisitionHint => ({ tone: 'success', label: 'Available in Inventory', detail: '', ...overrides })

  it('Installed equals Target (OK) passes through unchanged, regardless of any hint — a satisfied target is never re-litigated', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'OK', installedItem: 'Mirage', targetItem: 'Mirage' })
    expect(resolveOperationalReviewStatus(target, hint({ label: 'Purchase Required', tone: 'muted' }))).toBe('OK')
    expect(STATUS_PILL.OK.tone).toBe('success')
    expect(STATUS_PILL.OK.compactLabel).toBe('OK')
  })

  it('an exact target reserved for this port reads Reserved For This Port, compact RESERVED in cyan — and outranks the old grade-only Upgrade Available status', () => {
    // installed !== factory and installed !== target — the exact shape that
    // used to unconditionally read 'Upgrade Available' from grade math alone.
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Upgrade Available', installedItem: 'Bracer', targetItem: 'SnowBlind' })
    const result = resolveOperationalReviewStatus(target, hint({ label: 'Reserved For This Port', tone: 'success' }))
    expect(result).toBe('Reserved For This Port')
    expect(STATUS_PILL[result].tone).toBe('cyan')
    expect(STATUS_PILL[result].compactLabel).toBe('RESERVED')
    // Deliberately distinct from Available — the two must never share a tone.
    expect(STATUS_PILL[result].tone).not.toBe(STATUS_PILL['Available in Inventory'].tone)
  })

  it('an exact target available in unreserved inventory reads Available in Inventory, compact AVAILABLE in green — and outranks the old grade-only Upgrade Available status', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Upgrade Available', installedItem: 'SonicLite', targetItem: 'Slipstream' })
    const result = resolveOperationalReviewStatus(target, hint({ label: 'Available in Inventory', tone: 'success' }))
    expect(result).toBe('Available in Inventory')
    expect(STATUS_PILL[result].tone).toBe('success')
    expect(STATUS_PILL[result].compactLabel).toBe('AVAILABLE')
  })

  it('a never-touched Missing target that is genuinely reserved for this port also reads Reserved For This Port, not Missing', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'SnowBlind' })
    expect(resolveOperationalReviewStatus(target, hint({ label: 'Reserved For This Port', tone: 'success' }))).toBe('Reserved For This Port')
  })

  it('the hint\'s "Available to Reserve" tier (owned, but committed to a different port) becomes the narrower Upgrade Available, compact UPGRADE in Quartermaster Gold — never fabricated from grade math alone', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'FR-66' })
    const result = resolveOperationalReviewStatus(target, hint({ label: 'Available to Reserve', tone: 'warning' }))
    expect(result).toBe('Upgrade Available')
    expect(STATUS_PILL[result].tone).toBe('gold')
    expect(STATUS_PILL[result].compactLabel).toBe('UPGRADE')
  })

  it('Upgrade Available only appears when the exact target is not reserved or available — the same underlying hardpoint, only the hint changes', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Upgrade Available', installedItem: 'Old', targetItem: 'FR-66' })
    expect(resolveOperationalReviewStatus(target, hint({ label: 'Available in Inventory', tone: 'success' }))).toBe('Available in Inventory')
    expect(resolveOperationalReviewStatus(target, hint({ label: 'Reserved For This Port', tone: 'success' }))).toBe('Reserved For This Port')
    expect(resolveOperationalReviewStatus(target, hint({ label: 'Available to Reserve', tone: 'warning' }))).toBe('Upgrade Available')
  })

  it('a borrow-only target reads Borrow Available, compact BORROW? in a neutral muted tone — never competing visually with Reserved/Available/Upgrade', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'RareThing' })
    const result = resolveOperationalReviewStatus(target, hint({ label: 'Borrow Available', tone: 'cyan' }))
    expect(result).toBe('Borrow Available')
    expect(STATUS_PILL[result].tone).toBe('muted')
    expect(STATUS_PILL[result].compactLabel).toBe('BORROW?')
    expect(STATUS_PILL[result].tone).not.toBe(STATUS_PILL['Reserved For This Port'].tone)
    expect(STATUS_PILL[result].tone).not.toBe(STATUS_PILL['Available in Inventory'].tone)
    expect(STATUS_PILL[result].tone).not.toBe(STATUS_PILL['Upgrade Available'].tone)
  })

  it('a procurement-only unresolved target (Purchase Required) reads Missing, compact MISSING in red — a real gap, but never fabricated as an upgrade/borrow state', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'Slipstream' })
    const result = resolveOperationalReviewStatus(target, hint({ label: 'Purchase Required', tone: 'muted' }))
    expect(result).toBe('Missing')
    expect(STATUS_PILL[result].tone).toBe('danger')
    expect(STATUS_PILL[result].compactLabel).toBe('MISSING')
  })

  it('an Invalid Target retains its invalid/error status regardless of any hint, compact INVALID — always actionable, never treated as an inventory question, and visually distinct from a routine Missing gap', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Invalid Target', targetItem: 'Bad Fit' })
    const result = resolveOperationalReviewStatus(target, hint({ label: 'Available in Inventory', tone: 'success' }))
    expect(result).toBe('Invalid Target')
    expect(STATUS_PILL[result].tone).toBe('invalid')
    expect(STATUS_PILL[result].compactLabel).toBe('INVALID')
    // Both read red, but Invalid keeps its own more intense Badge tone —
    // the established procurement-gap vs. data-problem distinction.
    expect(STATUS_PILL[result].tone).not.toBe(STATUS_PILL.Missing.tone)
  })

  it('Unresolved (factory-data placeholder) passes through unchanged', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Unresolved', targetItem: '—' })
    expect(resolveOperationalReviewStatus(target, undefined)).toBe('Unresolved')
    expect(STATUS_PILL.Unresolved.tone).toBe('muted')
  })

  it('fulfillmentStatusFromHint resolves a raw AcquisitionHint to the same canonical status the Hardpoint-aware resolver produces — the exact shared function Change Installed Components\' own inline badge calls', () => {
    expect(fulfillmentStatusFromHint(hint({ label: 'Reserved For This Port' }))).toBe('Reserved For This Port')
    expect(fulfillmentStatusFromHint(hint({ label: 'Available in Inventory' }))).toBe('Available in Inventory')
    expect(fulfillmentStatusFromHint(hint({ label: 'Available to Reserve' }))).toBe('Upgrade Available')
    expect(fulfillmentStatusFromHint(hint({ label: 'Borrow Available' }))).toBe('Borrow Available')
    expect(fulfillmentStatusFromHint(hint({ label: 'Purchase Required' }))).toBe('Missing')
  })

  it('every compact label is short enough to read as a single word, never a miniature sentence', () => {
    for (const status of Object.keys(STATUS_PILL) as (keyof typeof STATUS_PILL)[]) {
      expect(STATUS_PILL[status].compactLabel.length).toBeLessThanOrEqual(10)
      expect(STATUS_PILL[status].compactLabel).not.toContain(' ')
    }
  })

  it('a missing hint (defensive fallback) never throws — falls back to the raw status', () => {
    const target = hp({ id: 'hp-1', slotLabel: 'A', status: 'Missing', targetItem: 'Something' })
    expect(resolveOperationalReviewStatus(target, undefined)).toBe('Missing')
  })
})
