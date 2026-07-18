import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'

const initialState = useFleetStore.getState()

/**
 * EWO-STAB-002 (containment) — EWO-STAB-001 found that `installComponent`
 * (called by both Quick Update and, until now, Hangar Inventory's Move to
 * Ship) fell back to "the first non-`OK` hardpoint anywhere in the build"
 * whenever no explicit `slotLabel` was supplied, with no type/size/
 * category check at all. This is the regression suite for the fix: no
 * slot, no mutation; an explicit slot still requires a positively
 * compatible component. "Veil" itself has no dedicated fixture anywhere
 * in this codebase (confirmed absent from src/, generated-data/, and
 * raw-data/ during the EWO-STAB-001 audit) — these tests exercise the
 * identical underlying mechanism using real, cataloged seed fixtures
 * (FR-66, a real S1 Shield; Slipstream, a real S1 Power Plant — same
 * size, different category, so a pass here can only be explained by a
 * genuine category check, not a coincidental size mismatch).
 */
describe('EWO-STAB-002: installComponent refuses to guess a destination slot', () => {
  beforeEach(() => {
    localStorage.clear()
    useFleetStore.setState(initialState, true)
  })
  afterEach(() => {
    localStorage.clear()
  })

  function ghostHardpoints() {
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    return useFleetStore.getState().hardpoints.filter((h) => h.buildId === ship.activeBuildId)
  }

  it('1. no slotLabel at all (undefined) — no mutation, matched: false', () => {
    const before = ghostHardpoints().map((h) => ({ slotLabel: h.slotLabel, installedItem: h.installedItem }))
    const result = useFleetStore.getState().installComponent('ghost', 'FR-66')
    expect(result.matched).toBe(false)
    expect(ghostHardpoints().map((h) => ({ slotLabel: h.slotLabel, installedItem: h.installedItem }))).toEqual(before)
  })

  it('2. an empty-string slotLabel — refused exactly like undefined, no mutation', () => {
    const before = ghostHardpoints().map((h) => ({ slotLabel: h.slotLabel, installedItem: h.installedItem }))
    const result = useFleetStore.getState().installComponent('ghost', 'FR-66', '')
    expect(result.matched).toBe(false)
    expect(ghostHardpoints().map((h) => ({ slotLabel: h.slotLabel, installedItem: h.installedItem }))).toEqual(before)
  })

  it("3. the Veil scenario — a real Shield (FR-66) cannot enter a real Power Plant slot ('Power 1'), even with an explicit slotLabel", () => {
    const before = ghostHardpoints().find((h) => h.slotLabel === 'Power 1')!
    const result = useFleetStore.getState().installComponent('ghost', 'FR-66', 'Power 1')
    expect(result.matched).toBe(false)
    expect(result.blocked).toBe('incompatible')
    const after = ghostHardpoints().find((h) => h.slotLabel === 'Power 1')!
    expect(after.installedItem).toBe(before.installedItem)
  })

  it('4. a Shield also cannot enter a Cooler slot — unrelated-category rejection is not Power-Plant-specific', () => {
    expect(ghostHardpoints().some((h) => h.slotLabel === 'Cooler 1')).toBe(true)
    const result = useFleetStore.getState().installComponent('ghost', 'FR-66', 'Cooler 1')
    expect(result.matched).toBe(false)
    expect(result.blocked).toBe('incompatible')
  })

  it('5. a genuinely compatible component (Slipstream, a real Power Plant) still installs into an explicit Power Plant slot', () => {
    const result = useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power 1')
    expect(result.matched).toBe(true)
    expect(result.blocked).toBeUndefined()
    const after = ghostHardpoints().find((h) => h.slotLabel === 'Power 1')!
    expect(after.installedItem).toBe('Slipstream')
  })

  it('6. an unrecognized/uncataloged item name is still permitted (never disprove compatibility we have no data for — EWO-024\'s existing philosophy, unchanged by containment)', () => {
    const result = useFleetStore.getState().installComponent('ghost', 'Some Completely Unknown Component', 'Power 1')
    expect(result.matched).toBe(true)
  })
})

describe('EWO-STAB-002: moveToShip requires a validated slotLabel and performs no unsafe fallback', () => {
  beforeEach(() => {
    localStorage.clear()
    useFleetStore.setState(initialState, true)
  })
  afterEach(() => {
    localStorage.clear()
  })

  function addStock(name: string, type: string, size: string, qty: number) {
    useFleetStore.setState({ hangarItems: useFleetStore.getState().hangarItems.filter((h) => h.name !== name) })
    return useFleetStore.getState().addHangarItem({ name, type, size, qty, neededBy: 'None', disposition: 'Store' })
  }

  it('1. calling moveToShip with an empty-string slotLabel causes no data mutation', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    const hangarBefore = useFleetStore.getState().hangarItems
    const result = useFleetStore.getState().moveToShip(item.id, 'ghost', '')
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().hangarItems).toEqual(hangarBefore)
  })

  it('2. calling moveToShip with a slotLabel that does not exist on the ship causes no data mutation', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    const hangarBefore = useFleetStore.getState().hangarItems
    const result = useFleetStore.getState().moveToShip(item.id, 'ghost', 'Not A Real Slot')
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().hangarItems).toEqual(hangarBefore)
  })

  it('3. the Veil scenario via Move to Ship — a real Shield cannot land in a real Power Plant slot even with an explicit slotLabel, and Hangar quantity is untouched', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    const result = useFleetStore.getState().moveToShip(item.id, 'ghost', 'Power 1')
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')?.qty).toBe(1)
  })

  it('4. a valid slot and a compatible component still succeeds through Move to Ship (the method is contained, not disabled)', () => {
    addStock('Slipstream', 'Power Plant', 'S1', 1)
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Slipstream')!
    const result = useFleetStore.getState().moveToShip(item.id, 'ghost', 'Power 1')
    expect(result.success).toBe(true)
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const installed = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === 'Power 1')!
    expect(installed.installedItem).toBe('Slipstream')
  })
})
