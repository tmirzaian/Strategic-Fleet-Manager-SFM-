import { describe, it, expect } from 'vitest'
import { reconcileBuildHardpoints } from '../fleetAssetReconciliation'
import type { Hardpoint } from '../../types'
import type { FactoryHardpointTemplate } from '../../data/shipDefinitions'

function baseHardpoint(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel' | 'type' | 'size'>): Hardpoint {
  return {
    shipId: 'ship-1',
    buildId: 'build-1',
    factoryItem: 'Factory Item',
    installedItem: 'Factory Item',
    targetItem: 'Factory Item',
    status: 'OK',
    ...overrides,
  }
}

describe('EWO-043 reconcileBuildHardpoints', () => {
  it('Task 2 — Factory reconciliation: a matched row always reflects the NEW factory item, never the stale old one', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', installedItem: 'Deadbolt III', targetItem: 'Deadbolt III', targetMode: 'FOLLOW_FACTORY' })]
    const newTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Lightstrike III' }]
    const { hardpoints, quarantined } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(quarantined).toHaveLength(0)
    expect(hardpoints).toHaveLength(1)
    expect(hardpoints[0].factoryItem).toBe('Lightstrike III')
  })

  it('Task 4/8 — an EXPLICIT_TARGET row is preserved exactly across a Factory change', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', installedItem: 'Deadbolt III', targetItem: 'Omnisky IX', status: 'Missing', targetMode: 'EXPLICIT_TARGET' })]
    const newTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Lightstrike III' }]
    const { hardpoints } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(hardpoints[0].targetItem).toBe('Omnisky IX')
    expect(hardpoints[0].factoryItem).toBe('Lightstrike III')
  })

  it('Task 8 — a FOLLOW_FACTORY row auto-updates its target to the new factory item instead of preserving the old literal value', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', installedItem: 'Deadbolt III', targetItem: 'Deadbolt III', targetMode: 'FOLLOW_FACTORY' })]
    const newTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Lightstrike III' }]
    const { hardpoints } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(hardpoints[0].targetItem).toBe('Lightstrike III')
  })

  it('Task 3 — installedItem is carried over from the old row for a matched port', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', installedItem: 'Commander Installed Thing', targetItem: 'Commander Installed Thing', targetMode: 'EXPLICIT_TARGET' })]
    const newTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Lightstrike III' }]
    const { hardpoints } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(hardpoints[0].installedItem).toBe('Commander Installed Thing')
  })

  it('Task 4 — an explicit target that becomes incompatible with a shrunk port is preserved AND flagged, never silently dropped or replaced', () => {
    // "Mass Driver" is a real catalog entry (S4 Weapon, src/data/componentCatalog.ts)
    // — a genuinely-known-incompatible target is required to exercise
    // Invalid Target at all; an uncataloged name is always treated as valid.
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Gun Bay', type: 'Weapon', size: 'S4', factoryItem: 'Ravager', installedItem: 'Ravager', targetItem: 'Mass Driver', status: 'Upgrade Available', targetMode: 'EXPLICIT_TARGET' })]
    const newTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Gun Bay', type: 'Weapon', size: 'S3', factoryItem: 'Ravager' }]
    const { hardpoints, quarantined } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(quarantined).toHaveLength(0)
    expect(hardpoints[0].targetItem).toBe('Mass Driver')
    expect(hardpoints[0].size).toBe('S3')
    expect(hardpoints[0].status).toBe('Invalid Target')
  })

  it('Task 7 — a port removed upstream is quarantined, not deleted, and no longer appears in the active row set', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Old Utility Slot', type: 'Utility', size: 'S1', factoryItem: 'Widget I', installedItem: 'Widget I', targetItem: 'Widget II', status: 'Upgrade Available' })]
    const newTemplate: FactoryHardpointTemplate[] = []
    const { hardpoints, quarantined } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(hardpoints).toHaveLength(0)
    expect(quarantined).toHaveLength(1)
    expect(quarantined[0].reason).toBe('PORT_REMOVED')
    expect(quarantined[0].hardpoint.targetItem).toBe('Widget II')
  })

  it('Task 6 — a genuinely new port materializes fresh: factory-current, Installed/Target empty', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', installedItem: 'Deadbolt III', targetItem: 'Deadbolt III', targetMode: 'FOLLOW_FACTORY' })]
    const newTemplate: FactoryHardpointTemplate[] = [
      { slotLabel: 'Weapon 1', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III' },
      { slotLabel: 'Countermeasures', type: 'Utility', size: 'S1', factoryItem: 'Decoy I' },
    ]
    const { hardpoints } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    const fresh = hardpoints.find((h) => h.slotLabel === 'Countermeasures')!
    expect(fresh).toBeDefined()
    expect(fresh.factoryItem).toBe('Decoy I')
    expect(fresh.installedItem).toBe('—')
    expect(fresh.targetItem).toBe('—')
  })

  it('Task 5 tier 1 — sourcePortId is the strongest signal and matches even when the label changed completely', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Totally Old Name', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', sourcePortId: 'port-abc-123' })]
    const newTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Totally Different New Name', type: 'Weapon', size: 'S3', factoryItem: 'Lightstrike III', sourcePortId: 'port-abc-123' }]
    const { hardpoints, quarantined, slotLabelMigrations } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(quarantined).toHaveLength(0)
    expect(hardpoints[0].slotLabel).toBe('Totally Different New Name')
    expect(slotLabelMigrations).toEqual([{ oldSlotLabel: 'Totally Old Name', newSlotLabel: 'Totally Different New Name' }])
  })

  it('Task 5 tier 2 — a renamed parent still lets its child resolve via parent-hierarchy + local label + type (Scenario D/G)', () => {
    const old: Hardpoint[] = [
      baseHardpoint({ id: 'hp-parent', slotLabel: 'Turret A', type: 'Gimbal Mount', size: 'S3', factoryItem: '—', installedItem: '—', targetItem: '—', isStructural: true }),
      baseHardpoint({ id: 'hp-child', slotLabel: 'Turret A — Gun Bay', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', installedItem: 'Deadbolt III', targetItem: 'Omnisky IX', status: 'Missing', parentSlotLabel: 'Turret A', targetMode: 'EXPLICIT_TARGET' }),
    ]
    const newTemplate: FactoryHardpointTemplate[] = [
      { slotLabel: 'Turret Alpha', type: 'Gimbal Mount', size: 'S3', factoryItem: '—', isStructural: true },
      { slotLabel: 'Turret Alpha — Gun Bay', type: 'Weapon', size: 'S3', factoryItem: 'Deadbolt III', parentSlotLabel: 'Turret Alpha' },
    ]
    const { hardpoints, quarantined, slotLabelMigrations } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(quarantined).toHaveLength(0)
    const child = hardpoints.find((h) => h.id === 'hp-child')!
    expect(child.slotLabel).toBe('Turret Alpha — Gun Bay')
    expect(child.targetItem).toBe('Omnisky IX') // Commander intent survives the rename
    expect(slotLabelMigrations).toEqual(
      expect.arrayContaining([
        { oldSlotLabel: 'Turret A', newSlotLabel: 'Turret Alpha' },
        { oldSlotLabel: 'Turret A — Gun Bay', newSlotLabel: 'Turret Alpha — Gun Bay' },
      ])
    )
  })

  it('Task 5 tier 4 / "never guess" — two equally-plausible same-type-size siblings are never auto-matched; the old row is quarantined instead', () => {
    const old: Hardpoint[] = [baseHardpoint({ id: 'hp-1', slotLabel: 'Missile Rack — 01 Attach', type: 'Missile', size: 'S1', factoryItem: 'Marksman', parentSlotLabel: 'Missile Rack' })]
    const newTemplate: FactoryHardpointTemplate[] = [
      { slotLabel: 'Missile Rack', type: 'Missile Rack', size: 'S3', factoryItem: '—', isStructural: true },
      { slotLabel: 'Missile Rack — 01 Attach New', type: 'Missile', size: 'S1', factoryItem: 'Marksman', parentSlotLabel: 'Missile Rack' },
      { slotLabel: 'Missile Rack — 02 Attach New', type: 'Missile', size: 'S1', factoryItem: 'Marksman', parentSlotLabel: 'Missile Rack' },
    ]
    const { hardpoints, quarantined } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    // The parent itself resolves via tier 3 (exact label, unchanged), but the
    // child's own local label changed on BOTH new candidates identically and
    // there are two of them — never a safe single guess.
    expect(quarantined).toHaveLength(1)
    expect(quarantined[0].hardpoint.id).toBe('hp-1')
    expect(hardpoints.some((h) => h.id === 'hp-1')).toBe(false)
  })

  it('recursive hierarchy — a 2-level rack->missile tree with a genuinely added missile reconciles every level correctly', () => {
    const old: Hardpoint[] = [
      baseHardpoint({ id: 'hp-rack', slotLabel: 'Left Missile Rack', type: 'Missile Rack', size: 'S3', factoryItem: '—', installedItem: '—', targetItem: '—', isStructural: true, sourcePortId: 'rack-left' }),
      baseHardpoint({ id: 'hp-m1', slotLabel: 'Left Missile Rack — 01 Attach Missile', type: 'Missile', size: 'S1', factoryItem: 'Marksman', installedItem: 'Marksman', targetItem: 'Marksman', parentSlotLabel: 'Left Missile Rack', sourcePortId: 'missile-01', targetMode: 'FOLLOW_FACTORY' }),
    ]
    const newTemplate: FactoryHardpointTemplate[] = [
      { slotLabel: 'Left Missile Rack', type: 'Missile Rack', size: 'S3', factoryItem: '—', isStructural: true, sourcePortId: 'rack-left' },
      { slotLabel: 'Left Missile Rack — 01 Attach Missile', type: 'Missile', size: 'S1', factoryItem: 'Marksman', parentSlotLabel: 'Left Missile Rack', sourcePortId: 'missile-01' },
      { slotLabel: 'Left Missile Rack — 02 Attach Missile', type: 'Missile', size: 'S1', factoryItem: 'Marksman', parentSlotLabel: 'Left Missile Rack', sourcePortId: 'missile-02' },
    ]
    const { hardpoints, quarantined } = reconcileBuildHardpoints('ship-1', 'build-1', old, newTemplate)
    expect(quarantined).toHaveLength(0)
    expect(hardpoints).toHaveLength(3)
    const newMissile = hardpoints.find((h) => h.sourcePortId === 'missile-02')!
    expect(newMissile.installedItem).toBe('—')
    expect(newMissile.targetItem).toBe('—')
  })
})
