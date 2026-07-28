import { describe, it, expect } from 'vitest'
import { describeAcquisitionHint } from '../componentAcquisitionHint'
import type { HangarItem, InstalledLoadoutEntry, MissionReservation, Ship } from '../../types'

const ships: Ship[] = [
  { id: 'ghost', name: 'Ghost', manufacturer: 'Anvil', ownership: 'Owned', career: '', role: '', activeBuildId: '', readiness: 0, priority: 0, missing: [], lifecycleStatus: 'active' },
  { id: 'corsair', name: 'Corsair', manufacturer: 'Drake', ownership: 'Owned', career: '', role: '', activeBuildId: '', readiness: 0, priority: 0, missing: [], lifecycleStatus: 'active' },
]

function baseParams(overrides: Partial<Parameters<typeof describeAcquisitionHint>[0]> = {}) {
  return {
    componentName: 'SnowBlind',
    currentShipId: 'ghost',
    hangarItems: [] as HangarItem[],
    installedLoadouts: [] as InstalledLoadoutEntry[],
    reservations: [] as MissionReservation[],
    ships,
    ...overrides,
  }
}

describe('describeAcquisitionHint (SW-002 Immediate Decision Intelligence)', () => {
  it('Tier 1 — Available Inventory takes priority when owned and unreserved', () => {
    const hint = describeAcquisitionHint(
      baseParams({ hangarItems: [{ id: '1', name: 'SnowBlind', type: 'Cooler', size: 'S1', qty: 1, neededBy: '', disposition: 'Install' }] })
    )
    expect(hint.label).toBe('Available in Inventory')
    expect(hint.tone).toBe('success')
    expect(hint.detail).toContain('1 in Hangar')
  })

  it('Tier 2 — Available to Reserve when owned but fully committed', () => {
    const hint = describeAcquisitionHint(
      baseParams({
        hangarItems: [{ id: '1', name: 'SnowBlind', type: 'Cooler', size: 'S1', qty: 1, disposition: 'Install', neededBy: '' }],
        reservations: [
          { id: 'r1', missionConfigurationId: 'other-build', fleetAssetId: 'other', targetSlotLabel: 'Cooler 1', componentName: 'SnowBlind', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
        ],
      })
    )
    expect(hint.label).toBe('Available to Reserve')
    expect(hint.tone).toBe('warning')
  })

  it('Phase 6 — reconciles with derivePortLogistics\' own slot-aware reservation authority (findActiveSlotReservation): reserved FOR this exact port reads differently than reserved elsewhere', () => {
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'ghost-stealth', fleetAssetId: 'ghost', targetSlotLabel: 'Cooler 1', componentName: 'SnowBlind', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const hangarItems: HangarItem[] = [{ id: '1', name: 'SnowBlind', type: 'Cooler', size: 'S1', qty: 1, disposition: 'Install', neededBy: '' }]

    const ownPort = describeAcquisitionHint(baseParams({ hangarItems, reservations, currentBuildId: 'ghost-stealth', currentSlotLabel: 'Cooler 1' }))
    expect(ownPort.label).toBe('Reserved For This Port')
    expect(ownPort.tone).toBe('success')

    const differentPort = describeAcquisitionHint(baseParams({ hangarItems, reservations, currentBuildId: 'ghost-stealth', currentSlotLabel: 'Cooler 2' }))
    expect(differentPort.label).toBe('Available to Reserve')

    // Omitting buildId/slotLabel entirely falls back to the aggregate signal (backward compatible).
    const noSlotContext = describeAcquisitionHint(baseParams({ hangarItems, reservations }))
    expect(noSlotContext.label).toBe('Available to Reserve')
  })

  it('Tier 3 — Borrow Available names the real source ship when installed elsewhere and not owned free', () => {
    const hint = describeAcquisitionHint(
      baseParams({
        installedLoadouts: [{ shipId: 'corsair', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' }],
      })
    )
    expect(hint.label).toBe('Borrow Available')
    expect(hint.tone).toBe('cyan')
    expect(hint.detail).toContain('Corsair')
  })

  it('never suggests borrowing from the same ship the Commander is already reviewing', () => {
    const hint = describeAcquisitionHint(
      baseParams({
        currentShipId: 'ghost',
        installedLoadouts: [{ shipId: 'ghost', slotLabel: 'Cooler 2', installedItem: 'SnowBlind' }],
      })
    )
    expect(hint.label).toBe('Purchase Required')
  })

  it('Tier 4 — Purchase Required is the honest fallback when nothing else applies', () => {
    const hint = describeAcquisitionHint(baseParams())
    expect(hint.label).toBe('Purchase Required')
    expect(hint.tone).toBe('muted')
    expect(hint.detail).toMatch(/looted|purchased|crafted/i)
  })

  it('EWO-071B (Part A): Reserved For This Port wins outright over Available in Inventory, even when genuinely free stock ALSO exists for the same component', () => {
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'ghost-stealth', fleetAssetId: 'ghost', targetSlotLabel: 'Cooler 1', componentName: 'SnowBlind', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    // 2 owned, only 1 reserved — 1 unit is genuinely free too. Before
    // EWO-071B this returned 'Available in Inventory' (the old Tier 1
    // check ran before the reservation check), contradicting a RESERVED
    // row the Install/Change disclosure already shows for this exact
    // component (EWO-071A).
    const hangarItems: HangarItem[] = [{ id: '1', name: 'SnowBlind', type: 'Cooler', size: 'S1', qty: 2, disposition: 'Install', neededBy: '' }]
    const hint = describeAcquisitionHint(baseParams({ hangarItems, reservations, currentBuildId: 'ghost-stealth', currentSlotLabel: 'Cooler 1' }))
    expect(hint.label).toBe('Reserved For This Port')
    expect(hint.tone).toBe('success')
  })

  it('never fabricates a projected post-swap readiness number (Scope Protection: no Recommendation engine)', () => {
    const hint = describeAcquisitionHint(baseParams({ installedLoadouts: [{ shipId: 'corsair', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' }] }))
    expect(hint.detail).not.toMatch(/\d+%/)
  })
})
