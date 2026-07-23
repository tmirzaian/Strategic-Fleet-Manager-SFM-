import { describe, it, expect } from 'vitest'
import { withMissileRackAggregation, worstStatus, uniformOrFallback, type MissileAggregateMeta } from '../missileRackAggregation'
import { withComponentOwnedChildSlots, type ComponentOwnedSlotHost, type ComponentOwnedSlotSpec } from '../componentOwnedSlots'
import { buildPortTree } from '../portTree'
import { getMissileRackSlotSpec } from '../../generated/missileRackSlots'
import { getMiningModuleSlotCount } from '../../generated/miningModuleSlots'

// EWO-054 (Chief Architect Amendment) — same real, source-derived rack
// entityClasses componentOwnedSlots.test.ts already uses, so this module's
// own tests never invent a slot count/size that couldn't occur in the real
// game data. Skips (never fails) when generated-data isn't present on this
// machine, matching every other generated-data-dependent test in this repo.
const POLARIS_RACK = 'MRCK_S10_RSI_Polaris_Right' // 8 slots @ S3
const TALON_MSD683 = 'MRCK_S04_ESPR_Talon' // 12 slots @ S3 — a real, different rack
const hasRackData = getMissileRackSlotSpec(POLARIS_RACK) !== null
const ARBOR_MH2 = 'Mining_Laser_GRIN_Arbor_S2'
const hasMiningData = getMiningModuleSlotCount(ARBOR_MH2) > 0

interface Row extends ComponentOwnedSlotHost {
  type?: string
  status?: string
  targetItem?: string
}

function row(overrides: Partial<Row> & Pick<Row, 'id' | 'slotLabel'>): Row {
  return { status: 'OK', ...overrides }
}

function makeSlotRow(host: Row, n: number, spec: ComponentOwnedSlotSpec): Row {
  return row({ id: `${host.id}-${n}`, slotLabel: `${host.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: host.slotLabel, type: spec.label === 'Missile' ? 'Missile' : 'Mining Module' })
}

function makeAggregateRow(parent: Row, children: Row[], spec: ComponentOwnedSlotSpec, meta: MissileAggregateMeta): Row & { missileAggregate: MissileAggregateMeta } {
  return {
    ...parent,
    id: `${parent.id}-missile-aggregate`,
    slotLabel: `${parent.slotLabel} — Missile`,
    parentSlotLabel: parent.slotLabel,
    type: 'Missile',
    targetItem: meta.inconsistent ? '—' : uniformOrFallback(children.map((c) => c.targetItem), 'Mixed'),
    missileAggregate: meta,
  }
}

const identityByTargetItem = (r: Row) => r.targetItem

describe('withMissileRackAggregation — EWO-054', () => {
  it('collapses a rack\'s real per-slot missile children into one aggregate node with the canonical quantity — the per-slot rows are removed from the tree, not merely hidden', () => {
    if (!hasRackData) return
    const rows = [
      row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      ...Array.from({ length: 8 }, (_, i) => row({ id: `slot-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: 'TaskForce I' })),
    ]
    const tree = buildPortTree(rows)
    const result = withMissileRackAggregation(tree, identityByTargetItem, makeAggregateRow)

    const rackNode = result.find((n) => n.hardpoint.id === 'rack')!
    expect(rackNode.children).toHaveLength(1)
    const aggregate = rackNode.children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }
    expect(aggregate.missileAggregate.quantity).toBe(8)
    expect(aggregate.missileAggregate.childSlotLabels).toHaveLength(8)
    expect(aggregate.missileAggregate.countMismatch).toBe(false)
    expect(aggregate.missileAggregate.inconsistent).toBe(false)
    expect(aggregate.targetItem).toBe('TaskForce I')
    // No individual "Missile Slot N" node survives in the tree.
    expect(rackNode.children.some((n) => n.hardpoint.slotLabel.includes('Slot'))).toBe(false)
  })

  it('quantity always comes from the canonical spec, never counted off however many rows happen to exist — a materialized count that disagrees is reported via countMismatch, never silently substituted', () => {
    if (!hasRackData) return
    const rows = [
      row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      // Only 3 of the real 8 slots are actually materialized (e.g. a partial import).
      ...Array.from({ length: 3 }, (_, i) => row({ id: `slot-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: 'TaskForce I' })),
    ]
    const tree = buildPortTree(rows)
    const result = withMissileRackAggregation(tree, identityByTargetItem, makeAggregateRow)
    const aggregate = result[0].children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }
    expect(aggregate.missileAggregate.quantity).toBe(8) // canonical spec, not 3
    expect(aggregate.missileAggregate.countMismatch).toBe(true)
  })

  it('children uniformly sharing one missile identity (including all genuinely empty) are NOT flagged inconsistent', () => {
    if (!hasRackData) return
    const uniformlyAssigned = buildPortTree([
      row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      ...Array.from({ length: 8 }, (_, i) => row({ id: `slot-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: 'TaskForce I' })),
    ])
    const assignedResult = withMissileRackAggregation(uniformlyAssigned, identityByTargetItem, makeAggregateRow)
    expect((assignedResult[0].children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }).missileAggregate.inconsistent).toBe(false)

    const uniformlyEmpty = buildPortTree([
      row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      ...Array.from({ length: 8 }, (_, i) => row({ id: `slot-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: '—' })),
    ])
    const emptyResult = withMissileRackAggregation(uniformlyEmpty, identityByTargetItem, makeAggregateRow)
    expect((emptyResult[0].children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }).missileAggregate.inconsistent).toBe(false)
  })

  it('mixed or partially-assigned children (legacy/imported data — never a supported target configuration) are detected as inconsistent, and the aggregate never silently picks one of the disagreeing values', () => {
    if (!hasRackData) return
    const mixedTypes = buildPortTree([
      row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      row({ id: 'slot-1', slotLabel: 'Right Missile Rack — Missile Slot 1', parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: 'TaskForce I' }),
      row({ id: 'slot-2', slotLabel: 'Right Missile Rack — Missile Slot 2', parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: 'Rattler II' }),
    ])
    const mixedResult = withMissileRackAggregation(mixedTypes, identityByTargetItem, makeAggregateRow)
    const mixedAggregate = mixedResult[0].children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }
    expect(mixedAggregate.missileAggregate.inconsistent).toBe(true)
    expect(mixedAggregate.targetItem).toBe('—') // never one of 'TaskForce I'/'Rattler II' shown as though authoritative

    const partiallyAssigned = buildPortTree([
      row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      row({ id: 'slot-1', slotLabel: 'Right Missile Rack — Missile Slot 1', parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: 'TaskForce I' }),
      row({ id: 'slot-2', slotLabel: 'Right Missile Rack — Missile Slot 2', parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: '—' }),
    ])
    const partialResult = withMissileRackAggregation(partiallyAssigned, identityByTargetItem, makeAggregateRow)
    expect((partialResult[0].children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }).missileAggregate.inconsistent).toBe(true)
  })

  it('mining module children and ordinary (non-component-owned) ports are left completely untouched — this mission only concerns missile racks', () => {
    if (!hasMiningData) return
    const rows = [
      row({ id: 'head', slotLabel: 'Mining Head', factoryEntityClass: ARBOR_MH2, installedEntityClass: ARBOR_MH2, targetEntityClass: ARBOR_MH2 }),
      row({ id: 'module-1', slotLabel: 'Mining Head — Module Slot 1', parentSlotLabel: 'Mining Head', type: 'Mining Module' }),
      row({ id: 'module-2', slotLabel: 'Mining Head — Module Slot 2', parentSlotLabel: 'Mining Head', type: 'Mining Module' }),
      row({ id: 'ordinary', slotLabel: 'Power Plant' }),
    ]
    const tree = buildPortTree(rows)
    const result = withMissileRackAggregation(tree, identityByTargetItem, makeAggregateRow)
    const headNode = result.find((n) => n.hardpoint.id === 'head')!
    expect(headNode.children).toHaveLength(2) // both Module Slot children survive individually, never collapsed
    expect(headNode.children.every((n) => n.hardpoint.slotLabel.includes('Module Slot'))).toBe(true)
    expect(result.find((n) => n.hardpoint.id === 'ordinary')).toBeDefined()
  })

  it('a rack swap changes the aggregate\'s quantity/size immediately on the very next computation — no separate regeneration step is needed, since aggregation always re-derives from withComponentOwnedChildSlots\' own already-correct swap output', () => {
    if (!hasRackData) return
    const makeChildRow = (host: Row, n: number, spec: ComponentOwnedSlotSpec) => makeSlotRow(host, n, spec)

    const beforeSwap = withComponentOwnedChildSlots(
      [row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK })],
      makeChildRow
    )
    const beforeAggregate = withMissileRackAggregation(buildPortTree(beforeSwap), identityByTargetItem, makeAggregateRow)
    const beforeMeta = (beforeAggregate[0].children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }).missileAggregate
    expect(beforeMeta.quantity).toBe(8)

    // Swap Target to Talon (12 slots @ S3) — nothing installed yet, matching
    // a live Loadout Manager preview before the Commander saves.
    const afterSwap = withComponentOwnedChildSlots(
      [row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, targetEntityClass: TALON_MSD683 })],
      makeChildRow
    )
    const afterAggregate = withMissileRackAggregation(buildPortTree(afterSwap), identityByTargetItem, makeAggregateRow)
    const afterMeta = (afterAggregate[0].children[0].hardpoint as Row & { missileAggregate: MissileAggregateMeta }).missileAggregate
    expect(afterMeta.quantity).toBe(12)
    expect(afterMeta.childSlotLabels).toHaveLength(12)
  })

  it('is purely a display-tree fold — never mutates the input rows, so validation/Fleet Dashboard (which read the flat Hardpoint collection directly, never this function\'s output) are unaffected by presentation changes', () => {
    if (!hasRackData) return
    const rows = [
      row({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      ...Array.from({ length: 8 }, (_, i) => row({ id: `slot-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack', type: 'Missile', targetItem: 'TaskForce I' })),
    ]
    const snapshot = JSON.parse(JSON.stringify(rows))
    const tree = buildPortTree(rows)
    withMissileRackAggregation(tree, identityByTargetItem, makeAggregateRow)
    expect(rows).toEqual(snapshot) // the flat array itself is byte-for-byte unchanged
  })
})

describe('worstStatus — EWO-054', () => {
  it('picks the single worst status among several children, by fixed priority, regardless of input order', () => {
    expect(worstStatus(['OK', 'Missing', 'OK'])).toBe('Missing')
    expect(worstStatus(['Upgrade Available', 'Invalid Target', 'OK'])).toBe('Invalid Target')
    expect(worstStatus(['OK', 'OK', 'OK'])).toBe('OK')
    expect(worstStatus(['Unresolved', 'Missing'])).toBe('Unresolved')
  })
})

describe('uniformOrFallback — EWO-054', () => {
  it('returns the shared value when every child agrees, and the fallback the moment any one disagrees', () => {
    expect(uniformOrFallback(['A', 'A', 'A'], 'Mixed')).toBe('A')
    expect(uniformOrFallback(['A', 'B', 'A'], 'Mixed')).toBe('Mixed')
    expect(uniformOrFallback(['A'], 'Mixed')).toBe('A')
  })
})
