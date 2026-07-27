import { describe, it, expect } from 'vitest'
import {
  buildQuartermasterDemandSummary,
  buildQuartermasterWorkQueue,
  filterActionableWorkQueue,
  assessCategoryWorkQueue,
  sortWorkQueue,
  type WorkQueueRow,
} from '../quartermasterBriefing'
import type { ProcurementLine, ReservedLine } from '../procurement'

function procurementLine(overrides: Partial<ProcurementLine> = {}): ProcurementLine {
  return { itemName: 'Item', type: 'Weapon', size: 'S1', qtyNeeded: 0, availableToReserve: 0, neededBy: [], ...overrides }
}

function reservedLine(overrides: Partial<ReservedLine> = {}): ReservedLine {
  return { itemName: 'Item', type: 'Weapon', size: 'S1', quantity: 1, neededBy: [], ...overrides }
}

function workQueueRow(overrides: Partial<WorkQueueRow> = {}): WorkQueueRow {
  return { itemName: 'Item', type: 'Weapon', size: 'S1', category: 'Weapons', state: 'PURCHASE_REQUIRED', quantity: 1, neededBy: [], ...overrides }
}

const STABLE_CATEGORIES = ['Coolers', 'Power Plants', 'Quantum Drives', 'Shields', 'Weapons']

describe('buildQuartermasterDemandSummary (UX-001B/UX-001B.1/UX-001B.3 Deliverable 1/2/3/4/7)', () => {
  it('aggregates qtyNeeded across lines sharing the same taxonomy category', () => {
    const lines = [
      procurementLine({ itemName: 'Mirage', type: 'Shield', qtyNeeded: 3 }),
      procurementLine({ itemName: 'Basilisk', type: 'Shield', qtyNeeded: 5 }),
    ]
    const summary = buildQuartermasterDemandSummary(lines)
    expect(summary.find((g) => g.category === 'Shields')).toEqual({ category: 'Shields', needed: 8 })
  })

  it('never counts availableToReserve as demand — only true shortage', () => {
    const lines = [procurementLine({ type: 'Weapon', qtyNeeded: 0, availableToReserve: 4 })]
    expect(buildQuartermasterDemandSummary(lines).find((g) => g.category === 'Weapons')).toEqual({ category: 'Weapons', needed: 0 })
  })

  it('UX-001B.3 Deliverable 3/4: the five stable categories always appear, even at zero demand — the layout never loses a card', () => {
    const summary = buildQuartermasterDemandSummary([])
    expect(summary.map((g) => g.category)).toEqual(STABLE_CATEGORIES)
    expect(summary.every((g) => g.needed === 0)).toBe(true)
  })

  it('a non-stable (additive/future) category still only appears when it has real outstanding demand', () => {
    const lines = [procurementLine({ type: 'Missile Rack', qtyNeeded: 2 })]
    const summary = buildQuartermasterDemandSummary(lines)
    expect(summary.map((g) => g.category)).toEqual([...STABLE_CATEGORIES, 'Missile Racks'])
  })

  it('UX-001B.1: Coolers, Power Plants, Quantum Drives, and Shields are distinct categories, never merged into one aggregate "Core Components" bucket', () => {
    const lines = [
      procurementLine({ itemName: 'a', type: 'Cooler', qtyNeeded: 1 }),
      procurementLine({ itemName: 'b', type: 'Power Plant', qtyNeeded: 1 }),
      procurementLine({ itemName: 'c', type: 'Quantum Drive', qtyNeeded: 1 }),
      procurementLine({ itemName: 'd', type: 'Shield', qtyNeeded: 1 }),
    ]
    const summary = buildQuartermasterDemandSummary(lines)
    const populated = ['Coolers', 'Power Plants', 'Quantum Drives', 'Shields']
    expect(summary.filter((g) => populated.includes(g.category)).every((g) => g.needed === 1)).toBe(true)
  })

  it('orders categories per the canonical component taxonomy order, not by demand size or item order', () => {
    const lines = [
      procurementLine({ itemName: 'a', type: 'Weapon', qtyNeeded: 1 }), // Weapons
      procurementLine({ itemName: 'b', type: 'Missile Rack', qtyNeeded: 99 }), // Missile Racks (ranks after Weapons)
      procurementLine({ itemName: 'c', type: 'Shield', qtyNeeded: 1 }), // Shields (ranks before both)
    ]
    const summary = buildQuartermasterDemandSummary(lines)
    expect(summary.map((g) => g.category)).toEqual(['Coolers', 'Power Plants', 'Quantum Drives', 'Shields', 'Weapons', 'Missile Racks'])
  })

  it('an unrecognized type fails safe into Other Systems rather than being dropped', () => {
    const lines = [procurementLine({ type: 'Some Future Type', qtyNeeded: 2 })]
    expect(buildQuartermasterDemandSummary(lines).find((g) => g.category === 'Other Systems')).toEqual({ category: 'Other Systems', needed: 2 })
  })

  it('with no procurement lines at all, only the five stable categories render (all Complete/zero), no non-stable category appears', () => {
    expect(buildQuartermasterDemandSummary([]).map((g) => g.category)).toEqual(STABLE_CATEGORIES)
  })
})

describe('buildQuartermasterWorkQueue (UX-001B Deliverable 3/4/6/8)', () => {
  it('a Reserved line becomes exactly one RESERVED row', () => {
    const rows = buildQuartermasterWorkQueue([], [reservedLine({ itemName: 'Mirage', quantity: 2 })])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ itemName: 'Mirage', state: 'RESERVED', quantity: 2 })
  })

  it('a procurement line with only availableToReserve becomes exactly one AVAILABLE row', () => {
    const rows = buildQuartermasterWorkQueue([procurementLine({ itemName: 'Basilisk', qtyNeeded: 0, availableToReserve: 3 })], [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ itemName: 'Basilisk', state: 'AVAILABLE', quantity: 3 })
  })

  it('a procurement line with only qtyNeeded becomes exactly one PURCHASE_REQUIRED row', () => {
    const rows = buildQuartermasterWorkQueue([procurementLine({ itemName: 'Scorpion', qtyNeeded: 4, availableToReserve: 0 })], [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ itemName: 'Scorpion', state: 'PURCHASE_REQUIRED', quantity: 4 })
  })

  it('a partially-available line produces TWO distinct rows — Available and Purchase Required are different Commander actions, never merged into one', () => {
    const rows = buildQuartermasterWorkQueue([procurementLine({ itemName: 'Mirage', qtyNeeded: 4, availableToReserve: 2 })], [])
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.state === 'AVAILABLE')).toMatchObject({ quantity: 2 })
    expect(rows.find((r) => r.state === 'PURCHASE_REQUIRED')).toMatchObject({ quantity: 4 })
  })

  it('a fully-satisfied line (zero needed, zero available) produces no rows at all — nothing with no action renders', () => {
    const rows = buildQuartermasterWorkQueue([procurementLine({ qtyNeeded: 0, availableToReserve: 0 })], [])
    expect(rows).toEqual([])
  })

  it('rows are ordered Reserved, then Available, then Purchase Required — Commander value, not alphabetical', () => {
    const rows = buildQuartermasterWorkQueue(
      [
        procurementLine({ itemName: 'Zulu', qtyNeeded: 1 }),
        procurementLine({ itemName: 'Alpha', availableToReserve: 1 }),
      ],
      [reservedLine({ itemName: 'Mid' })]
    )
    expect(rows.map((r) => r.state)).toEqual(['RESERVED', 'AVAILABLE', 'PURCHASE_REQUIRED'])
  })

  it('every row carries the taxonomy category resolved from its own component type', () => {
    const rows = buildQuartermasterWorkQueue([procurementLine({ type: 'Shield', qtyNeeded: 1 })], [])
    expect(rows[0].category).toBe('Shields')
  })

  it('an empty input on both sides produces an empty queue', () => {
    expect(buildQuartermasterWorkQueue([], [])).toEqual([])
  })
})

describe('sortWorkQueue', () => {
  const rows: WorkQueueRow[] = [
    { itemName: 'Zebra Cooler', type: 'Cooler', size: 'S2', category: 'Coolers', state: 'PURCHASE_REQUIRED', quantity: 3, neededBy: [] },
    { itemName: 'Alpha Shield', type: 'Shield', size: 'S10', category: 'Shields', state: 'AVAILABLE', quantity: 1, neededBy: [] },
    { itemName: 'Mid Weapon', type: 'Weapon', size: 'S2', category: 'Weapons', state: 'RESERVED', quantity: 5, neededBy: [] },
  ]

  it('sorts by Component Name ascending and descending', () => {
    expect(sortWorkQueue(rows, 'name', 'asc').map((r) => r.itemName)).toEqual(['Alpha Shield', 'Mid Weapon', 'Zebra Cooler'])
    expect(sortWorkQueue(rows, 'name', 'desc').map((r) => r.itemName)).toEqual(['Zebra Cooler', 'Mid Weapon', 'Alpha Shield'])
  })

  it('sorts by Size/Type numerically, not lexically (S2 before S10)', () => {
    const asc = sortWorkQueue(rows, 'sizeType', 'asc')
    expect(asc[asc.length - 1].itemName).toBe('Alpha Shield')
  })

  it('sorts by quantity numerically ascending and descending', () => {
    expect(sortWorkQueue(rows, 'quantity', 'asc').map((r) => r.quantity)).toEqual([1, 3, 5])
    expect(sortWorkQueue(rows, 'quantity', 'desc').map((r) => r.quantity)).toEqual([5, 3, 1])
  })

  it('sorts by state in Commander-value order (Reserved, Available, Purchase Required)', () => {
    const asc = sortWorkQueue(rows, 'state', 'asc')
    expect(asc.map((r) => r.state)).toEqual(['RESERVED', 'AVAILABLE', 'PURCHASE_REQUIRED'])
  })
})

describe('filterActionableWorkQueue (UX-001B.5 Deliverable 3 — unconditional, supersedes UX-001B.4\'s per-category exception)', () => {
  it('always removes Purchase Required rows, even for a category with no actionable rows at all', () => {
    const rows = [workQueueRow({ itemName: 'Mirage', category: 'Shields', state: 'PURCHASE_REQUIRED' })]
    expect(filterActionableWorkQueue(rows)).toEqual([])
  })

  it('removes Purchase Required rows for a category that also has a Reserved row', () => {
    const rows = [
      workQueueRow({ itemName: 'Scorpion', category: 'Weapons', state: 'PURCHASE_REQUIRED' }),
      workQueueRow({ itemName: 'Bulldog', category: 'Weapons', state: 'RESERVED' }),
    ]
    const filtered = filterActionableWorkQueue(rows)
    expect(filtered.map((r) => r.itemName)).toEqual(['Bulldog'])
  })

  it('removes Purchase Required rows for a category that also has an Available row', () => {
    const rows = [
      workQueueRow({ itemName: 'Scorpion', category: 'Weapons', state: 'PURCHASE_REQUIRED' }),
      workQueueRow({ itemName: 'Bulldog', category: 'Weapons', state: 'AVAILABLE' }),
    ]
    const filtered = filterActionableWorkQueue(rows)
    expect(filtered.map((r) => r.itemName)).toEqual(['Bulldog'])
  })

  it('removes Purchase Required rows across every category uniformly, never just some', () => {
    const rows = [
      workQueueRow({ itemName: 'Scorpion', category: 'Weapons', state: 'PURCHASE_REQUIRED' }),
      workQueueRow({ itemName: 'Bulldog', category: 'Weapons', state: 'RESERVED' }),
      workQueueRow({ itemName: 'Mirage', category: 'Shields', state: 'PURCHASE_REQUIRED' }),
    ]
    const filtered = filterActionableWorkQueue(rows)
    expect(filtered.map((r) => r.itemName)).toEqual(['Bulldog'])
  })

  it('never removes Reserved or Available rows', () => {
    const rows = [
      workQueueRow({ itemName: 'Bulldog', category: 'Weapons', state: 'RESERVED' }),
      workQueueRow({ itemName: 'Basilisk', category: 'Shields', state: 'AVAILABLE' }),
    ]
    expect(filterActionableWorkQueue(rows)).toEqual(rows)
  })

  it('returns an empty array for an empty input', () => {
    expect(filterActionableWorkQueue([])).toEqual([])
  })
})

describe('assessCategoryWorkQueue (UX-001B.4 Deliverable 3)', () => {
  it('ACTIONABLE when Reserved or Available rows are present', () => {
    expect(assessCategoryWorkQueue([workQueueRow({ state: 'RESERVED' })])).toBe('ACTIONABLE')
    expect(assessCategoryWorkQueue([workQueueRow({ state: 'AVAILABLE' })])).toBe('ACTIONABLE')
  })

  it('PROCUREMENT_ONLY when every row is Purchase Required — Case A, "No Inventory Available"', () => {
    expect(assessCategoryWorkQueue([workQueueRow({ state: 'PURCHASE_REQUIRED' })])).toBe('PROCUREMENT_ONLY')
  })

  it('COMPLETE when there are no rows at all — Case B, "Fleet Demand Complete"', () => {
    expect(assessCategoryWorkQueue([])).toBe('COMPLETE')
  })
})
